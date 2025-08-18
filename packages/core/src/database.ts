import { Level } from 'level';
import { encode, decode } from '@msgpack/msgpack';
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
  // Genesis configuration prefixes
  GENESIS_CONFIG: 'genesis:', // Genesis configuration by chain ID
  GENESIS_METADATA: 'gen_meta:', // Genesis block metadata
  GENESIS_UTXO: 'gen_utxo:', // Genesis UTXO allocations
} as const;

export class LevelDatabase implements IDatabase {
  private db: Level<string, Buffer>;
  private sublevels: Map<string, any> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private config: UTXOPersistenceConfig;
  private logger = new SimpleLogger('LevelDatabase');
  private isOpen = false;
  private initPromise?: Promise<void>;

  constructor(config: UTXOPersistenceConfig) {
    this.config = config;
    this.db = new Level(config.dbPath, {
      valueEncoding: 'buffer',
      keyEncoding: 'utf8',
    });

    // Initialize sublevels and open database lazily
    this.initPromise = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await this.db.open();
      this.isOpen = true;
      this.initializeSublevels();
    } catch (error) {
      this.logger.error(`Failed to open database: ${error}`);
      throw error;
    }
  }

  private async ensureOpen(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
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

  private getSublevel(sublevelName?: string): any {
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
      const packed = encode(value);

      if (this.config.compressionType === 'gzip') {
        return await gzip(Buffer.from(packed));
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

      return decode(data) as T;
    } catch (error) {
      this.logger.error(`Deserialization error: ${error}`);
      throw new Error(`Failed to deserialize value: ${error}`);
    }
  }

  async get<T>(key: string, sublevel?: string): Promise<T | null> {
    try {
      await this.ensureOpen();
      const db = this.getSublevel(sublevel);
      const buffer = await db.get(key);
      return await this.deserialize<T>(buffer);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      // Handle deserialization errors by treating them as null (data not found/corrupted)
      if (
        error.message &&
        error.message.includes('Failed to deserialize value')
      ) {
        this.logger.warn(
          `Deserialization failed for key ${key}, treating as null: ${error.message}`
        );
        return null;
      }
      this.logger.error(`Get operation failed for key ${key}: ${error}`);
      throw error;
    }
  }

  async put<T>(key: string, value: T, sublevel?: string): Promise<void> {
    try {
      await this.ensureOpen();
      const db = this.getSublevel(sublevel);
      const serialized = await this.serialize(value);
      await db.put(key, serialized);
      this.logger.debug(
        `Stored key: ${key} in sublevel: ${sublevel || 'default'}`
      );
    } catch (error) {
      this.logger.error(`Put operation failed for key ${key}: ${error}`);
      throw error;
    }
  }

  async del(key: string, sublevel?: string): Promise<void> {
    try {
      await this.ensureOpen();
      const db = this.getSublevel(sublevel);
      await db.del(key);
      this.logger.debug(
        `Deleted key: ${key} from sublevel: ${sublevel || 'default'}`
      );
    } catch (error: any) {
      if (error.code !== 'LEVEL_NOT_FOUND') {
        this.logger.error(`Delete operation failed for key ${key}: ${error}`);
        throw error;
      }
    }
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    try {
      await this.ensureOpen();

      // Group operations by sublevel
      const sublevelOps = new Map<string, BatchOperation[]>();

      for (const op of operations) {
        const sublevelName = op.sublevel || 'default';
        if (!sublevelOps.has(sublevelName)) {
          sublevelOps.set(sublevelName, []);
        }
        sublevelOps.get(sublevelName)!.push(op);
      }

      // Execute batch operations for each sublevel
      for (const [sublevelName, ops] of sublevelOps) {
        const db = this.getSublevel(
          sublevelName === 'default' ? undefined : sublevelName
        );
        const batch = db.batch();

        for (const op of ops) {
          if (op.type === 'put' && op.value !== undefined) {
            const serialized = await this.serialize(op.value);
            batch.put(op.key, serialized);
          } else if (op.type === 'del') {
            batch.del(op.key);
          }
        }

        await batch.write();
      }

      this.logger.debug(
        `Executed batch operation with ${operations.length} operations`
      );
    } catch (error) {
      this.logger.error(`Batch operation failed: ${error}`);
      throw error;
    }
  }

  async *iterator(options: IteratorOptions): AsyncIterable<KeyValue> {
    try {
      await this.ensureOpen();
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

  async multiGet(
    keys: Array<{ key: string; sublevel?: string }>
  ): Promise<Array<unknown | null>> {
    const results: Array<unknown | null> = [];

    try {
      for (const { key, sublevel } of keys) {
        const result = await this.get(key, sublevel);
        results.push(result);
      }

      this.logger.debug(
        `Multi-get operation completed for ${keys.length} keys`
      );
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
      this.logger.debug(
        `Compaction requested for sublevel: ${sublevel || 'all'}`
      );
    } catch (error) {
      this.logger.error(`Compaction failed: ${error}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.ensureOpen();

      // Close all sublevels
      for (const [name, sublevel] of this.sublevels) {
        await sublevel.close();
        this.logger.debug(`Closed sublevel: ${name}`);
      }

      // Close main database
      await this.db.close();
      this.isOpen = false;
      this.initPromise = undefined;
      this.logger.debug('Database closed successfully');
    } catch (error) {
      this.logger.error(`Database close failed: ${error}`);
      throw error;
    }
  }

  // Utility methods for database management
  async clear(sublevel?: string): Promise<void> {
    try {
      await this.ensureOpen();
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
      let isEmpty = true;
      for await (const [,] of iterator) {
        isEmpty = false;
        break;
      }
      await iterator.close();
      return isEmpty;
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

      for await (const [,] of iterator) {
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
  private isOpen = false;
  private initPromise?: Promise<void>;

  constructor() {
    // Initialize sublevels
    for (const sublevelName of Object.values(SubLevels)) {
      this.storage.set(sublevelName, new Map());
    }
    // Auto-open like LevelDatabase
    this.initPromise = this.open();
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.logger.debug('Memory database opened');
  }

  private async ensureOpen(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private checkOpen(): void {
    if (!this.isOpen) {
      throw new Error('Database not open');
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
    await this.ensureOpen();
    const storage = this.getSublevelStorage(sublevel);
    const value = storage.get(key);
    return value !== undefined ? (value as T) : null;
  }

  async put<T>(key: string, value: T, sublevel?: string): Promise<void> {
    await this.ensureOpen();
    const storage = this.getSublevelStorage(sublevel);
    storage.set(key, value);
    this.logger.debug(
      `Stored key: ${key} in memory sublevel: ${sublevel || 'default'}`
    );
  }

  async del(key: string, sublevel?: string): Promise<void> {
    await this.ensureOpen();
    const storage = this.getSublevelStorage(sublevel);
    storage.delete(key);
    this.logger.debug(
      `Deleted key: ${key} from memory sublevel: ${sublevel || 'default'}`
    );
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    await this.ensureOpen();
    for (const op of operations) {
      if (op.type === 'put' && op.value !== undefined) {
        await this.put(op.key, op.value, op.sublevel);
      } else if (op.type === 'del') {
        await this.del(op.key, op.sublevel);
      }
    }
    this.logger.debug(
      `Executed memory batch operation with ${operations.length} operations`
    );
  }

  async *iterator(options: IteratorOptions): AsyncIterable<KeyValue> {
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

  async multiGet(
    keys: Array<{ key: string; sublevel?: string }>
  ): Promise<Array<unknown | null>> {
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
    this.logger.debug(
      `Memory compaction (no-op) for sublevel: ${sublevel || 'all'}`
    );
  }

  async close(): Promise<void> {
    this.isOpen = false;
    this.storage.clear();
    this.snapshots.clear();
    this.logger.debug('Memory database closed');
  }

  // Sublevel support for compatibility
  sublevel(name: string): IDatabase {
    // Return a wrapper that prefixes keys with the sublevel name
    return {
      open: async (): Promise<void> => {
        // Sublevel uses parent's open state
      },
      get: async <T>(key: string): Promise<T | null> => {
        return this.get<T>(key, name);
      },
      put: async <T>(key: string, value: T): Promise<void> => {
        return this.put(key, value, name);
      },
      del: async (key: string): Promise<void> => {
        return this.del(key, name);
      },
      batch: async (operations: BatchOperation[]): Promise<void> => {
        const prefixedOps = operations.map(op => ({
          ...op,
          sublevel: name,
        }));
        return this.batch(prefixedOps);
      },
      iterator: (options: IteratorOptions): AsyncIterable<KeyValue> => {
        return this.iterator({ ...options, sublevel: name });
      },
      multiGet: async (
        keys: Array<{ key: string; sublevel?: string }>
      ): Promise<Array<unknown | null>> => {
        return this.multiGet(keys.map(k => ({ ...k, sublevel: name })));
      },
      createSnapshot: async (): Promise<Snapshot> => {
        return this.createSnapshot();
      },
      releaseSnapshot: async (snapshot: Snapshot): Promise<void> => {
        return this.releaseSnapshot(snapshot);
      },
      compact: async (): Promise<void> => {
        return this.compact(name);
      },
      close: async (): Promise<void> => {
        // Sublevel doesn't close parent
      },
      sublevel: (subName: string): IDatabase => {
        return this.sublevel(`${name}!${subName}`);
      },
    } as IDatabase;
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
