import { Level } from 'level';
import * as msgpack from 'msgpack';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type {
  IDatabase,
  BatchOperation,
  KeyValue,
  Snapshot,
  IteratorOptions,
  UTXOPersistenceConfig,
} from './types.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  debug(message: string): void {
    console.log(`[DEBUG] ${this.context}: ${message}`);
  }
  warn(message: string): void {
    console.warn(`[WARN] ${this.context}: ${message}`);
  }
  error(message: string): void {
    console.error(`[ERROR] ${this.context}: ${message}`);
  }
}

// Sublevel prefixes for different data types
export const SubLevels = {
  BLOCKS: 'blocks',
  UTXO_TRANSACTIONS: 'utxo_transactions',
  UTXO_SET: 'utxo_set',
  PENDING_UTXO_TX: 'pending_utxo_tx',
  METADATA: 'metadata',
  CONFIG: 'config',
  NODES: 'nodes',
  CRYPTOGRAPHIC_KEYS: 'crypto_keys',
} as const;

// Key prefixes within sublevels
export const KeyPrefixes = {
  BLOCK: 'block:',
  UTXO_TX: 'utxo_tx:',
  UTXO: 'utxo:',
  PENDING_TX: 'pending:',
  METADATA: 'meta:',
  CONFIG: 'config:',
  NODE: 'node:',
  KEYPAIR: 'keypair:',
} as const;

export class LevelDatabase implements IDatabase {
  private db: Level<string, Buffer>;
  private sublevels: Map<string, Level<string, Buffer>> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private config: UTXOPersistenceConfig;
  private logger = new SimpleLogger('LevelDatabase');

  constructor(config: UTXOPersistenceConfig) {
    this.config = config;
    this.db = new Level(config.dbPath, {
      valueEncoding: 'buffer',
      keyEncoding: 'utf8',
    });

    // Initialize sublevels
    this.initializeSublevels();
  }

  private initializeSublevels(): void {
    for (const sublevelName of Object.values(SubLevels)) {
      const sublevel = this.db.sublevel<string, Buffer>(sublevelName, {
        valueEncoding: 'buffer',
        keyEncoding: 'utf8',
      });
      this.sublevels.set(sublevelName, sublevel);
    }
    this.logger.debug('Initialized sublevels for different data types');
  }

  private getSublevel(sublevelName?: string): Level<string, Buffer> {
    if (!sublevelName) {
      return this.db;
    }
    
    const sublevel = this.sublevels.get(sublevelName);
    if (!sublevel) {
      throw new Error(`Sublevel ${sublevelName} not found`);
    }
    return sublevel;
  }

  private async serialize<T>(value: T): Promise<Buffer> {
    try {
      const packed = msgpack.pack(value);
      
      if (this.config.compressionType === 'gzip') {
        return await gzip(packed);
      }
      
      return Buffer.from(packed);
    } catch (error) {
      this.logger.error(`Serialization error: ${error}`);
      throw new Error(`Failed to serialize value: ${error}`);
    }
  }

  private async deserialize<T>(buffer: Buffer): Promise<T> {
    try {
      let data = buffer;
      
      if (this.config.compressionType === 'gzip') {
        data = await gunzip(buffer);
      }
      
      return msgpack.unpack(data) as T;
    } catch (error) {
      this.logger.error(`Deserialization error: ${error}`);
      throw new Error(`Failed to deserialize value: ${error}`);
    }
  }

  async get<T>(key: string, sublevel?: string): Promise<T | null> {
    try {
      const db = this.getSublevel(sublevel);
      const buffer = await db.get(key);
      return await this.deserialize<T>(buffer);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      this.logger.error(`Get operation failed for key ${key}: ${error}`);
      throw error;
    }
  }

  async put<T>(key: string, value: T, sublevel?: string): Promise<void> {
    try {
      const db = this.getSublevel(sublevel);
      const serialized = await this.serialize(value);
      await db.put(key, serialized);
      this.logger.debug(`Stored key: ${key} in sublevel: ${sublevel || 'default'}`);
    } catch (error) {
      this.logger.error(`Put operation failed for key ${key}: ${error}`);
      throw error;
    }
  }

  async del(key: string, sublevel?: string): Promise<void> {
    try {
      const db = this.getSublevel(sublevel);
      await db.del(key);
      this.logger.debug(`Deleted key: ${key} from sublevel: ${sublevel || 'default'}`);
    } catch (error: any) {
      if (error.code !== 'LEVEL_NOT_FOUND') {
        this.logger.error(`Delete operation failed for key ${key}: ${error}`);
        throw error;
      }
    }
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    try {
      const batch = this.db.batch();
      
      for (const op of operations) {
        const db = this.getSublevel(op.sublevel);
        
        if (op.type === 'put' && op.value !== undefined) {
          const serialized = await this.serialize(op.value);
          batch.put(op.key, serialized);
        } else if (op.type === 'del') {
          batch.del(op.key);
        }
      }
      
      await batch.write();
      this.logger.debug(`Executed batch operation with ${operations.length} operations`);
    } catch (error) {
      this.logger.error(`Batch operation failed: ${error}`);
      throw error;
    }
  }

  async *iterator(options: IteratorOptions): AsyncIterator<KeyValue> {
    try {
      const db = this.getSublevel(options.sublevel);
      const iterator = db.iterator({
        gte: options.start,
        lte: options.end,
        limit: options.limit,
        reverse: options.reverse,
      });

      for await (const [key, value] of iterator) {
        const deserializedValue = await this.deserialize(value);
        yield { key, value: deserializedValue };
      }
    } catch (error) {
      this.logger.error(`Iterator failed: ${error}`);
      throw error;
    }
  }

  async multiGet(keys: Array<{key: string, sublevel?: string}>): Promise<Array<unknown | null>> {
    const results: Array<unknown | null> = [];
    
    try {
      for (const { key, sublevel } of keys) {
        const result = await this.get(key, sublevel);
        results.push(result);
      }
      
      this.logger.debug(`Multi-get operation completed for ${keys.length} keys`);
      return results;
    } catch (error) {
      this.logger.error(`Multi-get operation failed: ${error}`);
      throw error;
    }
  }

  async createSnapshot(): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    this.snapshots.set(snapshot.id, snapshot);
    this.logger.debug(`Created snapshot: ${snapshot.id}`);
    return snapshot;
  }

  async releaseSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshots.delete(snapshot.id);
    this.logger.debug(`Released snapshot: ${snapshot.id}`);
  }

  async compact(sublevel?: string): Promise<void> {
    try {
      // LevelDB doesn't have explicit compact method in newer versions
      // This is a placeholder for potential future implementation
      this.logger.debug(`Compaction requested for sublevel: ${sublevel || 'all'}`);
    } catch (error) {
      this.logger.error(`Compaction failed: ${error}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      // Close all sublevels
      for (const [name, sublevel] of this.sublevels) {
        await sublevel.close();
        this.logger.debug(`Closed sublevel: ${name}`);
      }
      
      // Close main database
      await this.db.close();
      this.logger.debug('Database closed successfully');
    } catch (error) {
      this.logger.error(`Database close failed: ${error}`);
      throw error;
    }
  }

  // Utility methods for database management
  async clear(sublevel?: string): Promise<void> {
    try {
      const db = this.getSublevel(sublevel);
      await db.clear();
      this.logger.debug(`Cleared sublevel: ${sublevel || 'default'}`);
    } catch (error) {
      this.logger.error(`Clear operation failed: ${error}`);
      throw error;
    }
  }

  async isEmpty(sublevel?: string): Promise<boolean> {
    try {
      const db = this.getSublevel(sublevel);
      const iterator = db.iterator({ limit: 1 });
      const result = await iterator.next();
      await iterator.close();
      return result.done === true;
    } catch (error) {
      this.logger.error(`isEmpty check failed: ${error}`);
      throw error;
    }
  }

  async getApproximateSize(sublevel?: string): Promise<number> {
    try {
      // This is an approximation as LevelDB doesn't provide exact size
      let count = 0;
      const db = this.getSublevel(sublevel);
      const iterator = db.iterator();
      
      for await (const [, ] of iterator) {
        count++;
      }
      
      return count;
    } catch (error) {
      this.logger.error(`Size calculation failed: ${error}`);
      throw error;
    }
  }
}

// Memory-based database for testing
export class MemoryDatabase implements IDatabase {
  private storage: Map<string, Map<string, unknown>> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private logger = new SimpleLogger('MemoryDatabase');

  constructor() {
    // Initialize sublevels
    for (const sublevelName of Object.values(SubLevels)) {
      this.storage.set(sublevelName, new Map());
    }
  }

  private getSublevelStorage(sublevel?: string): Map<string, unknown> {
    const sublevelName = sublevel || 'default';
    if (!this.storage.has(sublevelName)) {
      this.storage.set(sublevelName, new Map());
    }
    return this.storage.get(sublevelName)!;
  }

  async get<T>(key: string, sublevel?: string): Promise<T | null> {
    const storage = this.getSublevelStorage(sublevel);
    const value = storage.get(key);
    return value ? (value as T) : null;
  }

  async put<T>(key: string, value: T, sublevel?: string): Promise<void> {
    const storage = this.getSublevelStorage(sublevel);
    storage.set(key, value);
    this.logger.debug(`Stored key: ${key} in memory sublevel: ${sublevel || 'default'}`);
  }

  async del(key: string, sublevel?: string): Promise<void> {
    const storage = this.getSublevelStorage(sublevel);
    storage.delete(key);
    this.logger.debug(`Deleted key: ${key} from memory sublevel: ${sublevel || 'default'}`);
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === 'put' && op.value !== undefined) {
        await this.put(op.key, op.value, op.sublevel);
      } else if (op.type === 'del') {
        await this.del(op.key, op.sublevel);
      }
    }
    this.logger.debug(`Executed memory batch operation with ${operations.length} operations`);
  }

  async *iterator(options: IteratorOptions): AsyncIterator<KeyValue> {
    const storage = this.getSublevelStorage(options.sublevel);
    const entries = Array.from(storage.entries());
    
    // Apply filtering and sorting
    let filtered = entries;
    
    if (options.start || options.end) {
      filtered = entries.filter(([key]) => {
        if (options.start && key < options.start) return false;
        if (options.end && key > options.end) return false;
        return true;
      });
    }
    
    if (options.reverse) {
      filtered.reverse();
    }
    
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    for (const [key, value] of filtered) {
      yield { key, value };
    }
  }

  async multiGet(keys: Array<{key: string, sublevel?: string}>): Promise<Array<unknown | null>> {
    const results: Array<unknown | null> = [];
    for (const { key, sublevel } of keys) {
      results.push(await this.get(key, sublevel));
    }
    return results;
  }

  async createSnapshot(): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: `memory_snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    this.snapshots.set(snapshot.id, snapshot);
    this.logger.debug(`Created memory snapshot: ${snapshot.id}`);
    return snapshot;
  }

  async releaseSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshots.delete(snapshot.id);
    this.logger.debug(`Released memory snapshot: ${snapshot.id}`);
  }

  async compact(sublevel?: string): Promise<void> {
    // No-op for memory database
    this.logger.debug(`Memory compaction (no-op) for sublevel: ${sublevel || 'all'}`);
  }

  async close(): Promise<void> {
    this.storage.clear();
    this.snapshots.clear();
    this.logger.debug('Memory database closed');
  }

  // Memory-specific utility methods
  clear(sublevel?: string): void {
    if (sublevel) {
      const storage = this.getSublevelStorage(sublevel);
      storage.clear();
    } else {
      this.storage.clear();
    }
  }

  size(sublevel?: string): number {
    const storage = this.getSublevelStorage(sublevel);
    return storage.size;
  }
}

// Database factory
export class DatabaseFactory {
  static create(config: UTXOPersistenceConfig): IDatabase {
    switch (config.dbType) {
      case 'leveldb':
        return new LevelDatabase(config);
      case 'memory':
        return new MemoryDatabase();
      default:
        throw new Error(`Unsupported database type: ${config.dbType}`);
    }
  }
}