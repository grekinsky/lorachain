import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DatabaseFactory,
  LevelDatabase,
  MemoryDatabase,
  SubLevels,
  KeyPrefixes,
} from './database.js';
import type {
  IDatabase,
  UTXOPersistenceConfig,
  BatchOperation,
} from './types.js';
import { promises as fs } from 'fs';
import { join } from 'path';

// Test configuration
const testConfig: UTXOPersistenceConfig = {
  enabled: true,
  dbPath: './test-blockchain-data',
  dbType: 'memory',
  autoSave: true,
  batchSize: 100,
  compressionType: 'none',
  maxDatabaseSize: 1024 * 1024 * 100, // 100MB
  pruningEnabled: false,
  backupEnabled: false,
  utxoSetCacheSize: 1024 * 1024, // 1MB
  cryptographicAlgorithm: 'secp256k1',
  compactionStyle: 'size',
};

describe('DatabaseFactory', () => {
  it('should create memory database', () => {
    const db = DatabaseFactory.create({ ...testConfig, dbType: 'memory' });
    expect(db).toBeInstanceOf(MemoryDatabase);
  });

  it('should create level database', () => {
    const db = DatabaseFactory.create({ ...testConfig, dbType: 'leveldb' });
    expect(db).toBeInstanceOf(LevelDatabase);
  });

  it('should throw error for unsupported database type', () => {
    expect(() => {
      DatabaseFactory.create({
        ...testConfig,
        dbType: 'unsupported' as any,
      });
    }).toThrow('Unsupported database type: unsupported');
  });
});

describe('MemoryDatabase', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = new MemoryDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Basic CRUD Operations', () => {
    it('should store and retrieve values', async () => {
      const testData = { id: 'test1', value: 42, name: 'Test Object' };
      await db.put('test-key', testData);

      const retrieved = await db.get('test-key');
      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent keys', async () => {
      const result = await db.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete stored values', async () => {
      await db.put('delete-test', { data: 'to be deleted' });
      await db.del('delete-test');

      const result = await db.get('delete-test');
      expect(result).toBeNull();
    });

    it('should handle deletion of non-existent keys gracefully', async () => {
      await expect(db.del('non-existent')).resolves.not.toThrow();
    });
  });

  describe('Sublevel Operations', () => {
    it('should store and retrieve values in different sublevels', async () => {
      const blockData = { index: 1, hash: 'block-hash' };
      const utxoData = { txId: 'tx1', value: 100 };

      await db.put('item1', blockData, SubLevels.BLOCKS);
      await db.put('item1', utxoData, SubLevels.UTXO_SET);

      const retrievedBlock = await db.get('item1', SubLevels.BLOCKS);
      const retrievedUtxo = await db.get('item1', SubLevels.UTXO_SET);

      expect(retrievedBlock).toEqual(blockData);
      expect(retrievedUtxo).toEqual(utxoData);
    });

    it('should isolate sublevels properly', async () => {
      await db.put('same-key', 'blocks-data', SubLevels.BLOCKS);
      await db.put('same-key', 'utxo-data', SubLevels.UTXO_SET);

      const blockValue = await db.get('same-key', SubLevels.BLOCKS);
      const utxoValue = await db.get('same-key', SubLevels.UTXO_SET);

      expect(blockValue).toBe('blocks-data');
      expect(utxoValue).toBe('utxo-data');
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch operations correctly', async () => {
      const operations: BatchOperation[] = [
        { type: 'put', key: 'batch1', value: 'value1' },
        { type: 'put', key: 'batch2', value: 'value2' },
        { type: 'put', key: 'batch3', value: 'value3' },
      ];

      await db.batch(operations);

      const value1 = await db.get('batch1');
      const value2 = await db.get('batch2');
      const value3 = await db.get('batch3');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
      expect(value3).toBe('value3');
    });

    it('should handle mixed batch operations with sublevels', async () => {
      const operations: BatchOperation[] = [
        {
          type: 'put',
          key: 'block1',
          value: { index: 1 },
          sublevel: SubLevels.BLOCKS,
        },
        {
          type: 'put',
          key: 'utxo1',
          value: { value: 100 },
          sublevel: SubLevels.UTXO_SET,
        },
        { type: 'del', key: 'old-key' },
      ];

      await db.batch(operations);

      const block = await db.get('block1', SubLevels.BLOCKS);
      const utxo = await db.get('utxo1', SubLevels.UTXO_SET);

      expect(block).toEqual({ index: 1 });
      expect(utxo).toEqual({ value: 100 });
    });
  });

  describe('Iterator Operations', () => {
    beforeEach(async () => {
      // Set up test data
      await db.put('key001', 'value1', SubLevels.BLOCKS);
      await db.put('key002', 'value2', SubLevels.BLOCKS);
      await db.put('key003', 'value3', SubLevels.BLOCKS);
      await db.put('other', 'other-value', SubLevels.BLOCKS);
    });

    it('should iterate through all items in sublevel', async () => {
      const items: Array<{ key: string; value: unknown }> = [];

      for await (const item of db.iterator({
        sublevel: SubLevels.BLOCKS,
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
      expect(items.map((item) => item.key)).toContain('key001');
      expect(items.map((item) => item.key)).toContain('other');
    });

    it('should respect start and end range', async () => {
      const items: Array<{ key: string; value: unknown }> = [];

      for await (const item of db.iterator({
        sublevel: SubLevels.BLOCKS,
        start: 'key001',
        end: 'key003',
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items.map((item) => item.key)).toEqual(['key001', 'key002', 'key003']);
    });

    it('should respect limit option', async () => {
      const items: Array<{ key: string; value: unknown }> = [];

      for await (const item of db.iterator({
        sublevel: SubLevels.BLOCKS,
        limit: 2,
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
    });

    it('should support reverse iteration', async () => {
      const items: Array<{ key: string; value: unknown }> = [];

      for await (const item of db.iterator({
        sublevel: SubLevels.BLOCKS,
        reverse: true,
        limit: 2,
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      // Since it's reversed, we should get the last items first
    });
  });

  describe('Multi-get Operations', () => {
    beforeEach(async () => {
      await db.put('key1', 'value1');
      await db.put('key2', 'value2', SubLevels.BLOCKS);
      await db.put('key3', 'value3', SubLevels.UTXO_SET);
    });

    it('should retrieve multiple values at once', async () => {
      const keys = [
        { key: 'key1' },
        { key: 'key2', sublevel: SubLevels.BLOCKS },
        { key: 'key3', sublevel: SubLevels.UTXO_SET },
        { key: 'non-existent' },
      ];

      const results = await db.multiGet(keys);

      expect(results).toHaveLength(4);
      expect(results[0]).toBe('value1');
      expect(results[1]).toBe('value2');
      expect(results[2]).toBe('value3');
      expect(results[3]).toBeNull();
    });
  });

  describe('Snapshot Operations', () => {
    it('should create and release snapshots', async () => {
      const snapshot1 = await db.createSnapshot();
      const snapshot2 = await db.createSnapshot();

      expect(snapshot1.id).toBeDefined();
      expect(snapshot2.id).toBeDefined();
      expect(snapshot1.id).not.toBe(snapshot2.id);
      expect(snapshot1.timestamp).toBeLessThanOrEqual(snapshot2.timestamp);

      await db.releaseSnapshot(snapshot1);
      await db.releaseSnapshot(snapshot2);
    });
  });

  describe('Maintenance Operations', () => {
    it('should handle compaction requests', async () => {
      await expect(db.compact()).resolves.not.toThrow();
      await expect(db.compact(SubLevels.BLOCKS)).resolves.not.toThrow();
    });

    it('should handle close operations', async () => {
      await expect(db.close()).resolves.not.toThrow();
    });
  });
});

describe('LevelDatabase', () => {
  let db: LevelDatabase;
  const testDbPath = join(__dirname, '../test-leveldb-data');

  beforeEach(() => {
    const config: UTXOPersistenceConfig = {
      ...testConfig,
      dbType: 'leveldb',
      dbPath: testDbPath,
      compressionType: 'gzip',
    };
    db = new LevelDatabase(config);
  });

  afterEach(async () => {
    try {
      await db.close();
      // Clean up test database files
      await fs.rm(testDbPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Serialization and Compression', () => {
    it('should serialize and deserialize complex objects', async () => {
      const complexObject = {
        id: 'complex-1',
        nested: {
          array: [1, 2, 3],
          boolean: true,
          null_value: null,
        },
        timestamp: Date.now(),
      };

      await db.put('complex', complexObject);
      const retrieved = await db.get('complex');

      expect(retrieved).toEqual(complexObject);
    });

    it('should handle gzip compression when enabled', async () => {
      const largeObject = {
        data: 'x'.repeat(1000), // Large string to benefit from compression
        array: new Array(100).fill({ key: 'value', number: 42 }),
      };

      await db.put('compressed', largeObject);
      const retrieved = await db.get('compressed');

      expect(retrieved).toEqual(largeObject);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Create a separate database instance for error testing
      const errorDb = new LevelDatabase({
        ...testConfig,
        dbType: 'leveldb',
        dbPath: join(__dirname, '../test-error-db'),
      });

      // Close the database to simulate error conditions
      await errorDb.close();

      // Operations on closed database should throw
      await expect(errorDb.get('test')).rejects.toThrow();
      await expect(errorDb.put('test', 'value')).rejects.toThrow();

      // Clean up
      await fs.rm(join(__dirname, '../test-error-db'), {
        recursive: true,
        force: true,
      });
    });

    it('should handle invalid sublevel names', async () => {
      await expect(db.get('key', 'invalid-sublevel')).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large batch operations efficiently', async () => {
      // Create a fresh database instance for performance testing
      const perfDb = new LevelDatabase({
        ...testConfig,
        dbType: 'leveldb',
        dbPath: join(__dirname, '../test-perf-db'),
      });

      try {
        const batchSize = 1000;
        const operations: BatchOperation[] = [];

        for (let i = 0; i < batchSize; i++) {
          operations.push({
            type: 'put',
            key: `batch-key-${i.toString().padStart(6, '0')}`,
            value: { index: i, data: `test-data-${i}` },
            sublevel: SubLevels.UTXO_SET,
          });
        }

        const startTime = Date.now();
        await perfDb.batch(operations);
        const endTime = Date.now();

        // Should complete within reasonable time
        expect(endTime - startTime).toBeLessThan(5000); // 5 seconds

        // Verify some of the data was stored correctly
        const firstItem = await perfDb.get('batch-key-000000', SubLevels.UTXO_SET);
        const lastItem = await perfDb.get('batch-key-000999', SubLevels.UTXO_SET);

        expect(firstItem).toEqual({ index: 0, data: 'test-data-0' });
        expect(lastItem).toEqual({ index: 999, data: 'test-data-999' });
      } finally {
        await perfDb.close();
        await fs.rm(join(__dirname, '../test-perf-db'), {
          recursive: true,
          force: true,
        });
      }
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      // Add some test data
      await db.put('item1', { value: 1 });
      await db.put('item2', { value: 2 });
      await db.put('item3', { value: 3 }, SubLevels.BLOCKS);
    });

    it('should check if database is empty', async () => {
      const newDb = new LevelDatabase({
        ...testConfig,
        dbType: 'leveldb',
        dbPath: join(__dirname, '../test-empty-db'),
      });

      try {
        const isEmpty = await newDb.isEmpty();
        expect(isEmpty).toBe(true);

        await newDb.put('test', 'value');
        const isEmptyAfter = await newDb.isEmpty();
        expect(isEmptyAfter).toBe(false);
      } finally {
        await newDb.close();
        await fs.rm(join(__dirname, '../test-empty-db'), {
          recursive: true,
          force: true,
        });
      }
    });

    it('should calculate approximate size', async () => {
      const size = await db.getApproximateSize();
      expect(size).toBeGreaterThan(0);

      const blocksSize = await db.getApproximateSize(SubLevels.BLOCKS);
      expect(blocksSize).toBeGreaterThanOrEqual(1); // We added one item to blocks
    });

    it('should clear sublevel data', async () => {
      await db.clear(SubLevels.BLOCKS);

      const item = await db.get('item3', SubLevels.BLOCKS);
      expect(item).toBeNull();

      // Other sublevels should remain intact
      const defaultItem = await db.get('item1');
      expect(defaultItem).toEqual({ value: 1 });
    });
  });
});

describe('Database Integration with UTXO Types', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = new MemoryDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should store and retrieve UTXO-specific data structures', async () => {
    // Mock UTXO data structure
    const utxo = {
      txId: 'tx-12345',
      outputIndex: 0,
      value: 1000000, // 1 LRC in satoshis
      lockingScript: 'address-abc123',
      blockHeight: 100,
      isSpent: false,
    };

    const utxoTransaction = {
      id: 'utxo-tx-67890',
      inputs: [
        {
          previousTxId: 'prev-tx-111',
          outputIndex: 1,
          unlockingScript: 'signature:publickey',
          sequence: 0xffffffff,
        },
      ],
      outputs: [
        {
          value: 500000,
          lockingScript: 'address-def456',
          outputIndex: 0,
        },
        {
          value: 499000, // Change output
          lockingScript: 'address-abc123',
          outputIndex: 1,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1000,
    };

    const block = {
      index: 100,
      timestamp: Date.now(),
      transactions: [
        {
          id: 'legacy-tx-123',
          from: 'address-abc123',
          to: 'address-def456',
          amount: 500000,
          fee: 1000,
          timestamp: Date.now(),
          signature: 'mock-signature',
          nonce: 0,
        },
      ],
      previousHash: 'prev-block-hash',
      hash: 'current-block-hash',
      nonce: 12345,
      merkleRoot: 'merkle-root-hash',
      validator: 'validator-address',
    };

    // Store UTXO-specific data
    await db.put(
      `${KeyPrefixes.UTXO}${utxo.txId}:${utxo.outputIndex}`,
      utxo,
      SubLevels.UTXO_SET
    );

    await db.put(
      `${KeyPrefixes.UTXO_TX}${utxoTransaction.id}`,
      utxoTransaction,
      SubLevels.UTXO_TRANSACTIONS
    );

    await db.put(
      `${KeyPrefixes.BLOCK}${block.index.toString().padStart(10, '0')}`,
      block,
      SubLevels.BLOCKS
    );

    // Retrieve and verify data
    const retrievedUtxo = await db.get(
      `${KeyPrefixes.UTXO}${utxo.txId}:${utxo.outputIndex}`,
      SubLevels.UTXO_SET
    );
    const retrievedTx = await db.get(
      `${KeyPrefixes.UTXO_TX}${utxoTransaction.id}`,
      SubLevels.UTXO_TRANSACTIONS
    );
    const retrievedBlock = await db.get(
      `${KeyPrefixes.BLOCK}${block.index.toString().padStart(10, '0')}`,
      SubLevels.BLOCKS
    );

    expect(retrievedUtxo).toEqual(utxo);
    expect(retrievedTx).toEqual(utxoTransaction);
    expect(retrievedBlock).toEqual(block);
  });

  it('should support UTXO address-based queries via iteration', async () => {
    const address = 'address-test123';

    // Create multiple UTXOs for the same address
    const utxos = [
      {
        txId: 'tx-1',
        outputIndex: 0,
        value: 100000,
        lockingScript: address,
        blockHeight: 1,
        isSpent: false,
      },
      {
        txId: 'tx-2',
        outputIndex: 1,
        value: 200000,
        lockingScript: address,
        blockHeight: 2,
        isSpent: false,
      },
      {
        txId: 'tx-3',
        outputIndex: 0,
        value: 50000,
        lockingScript: 'different-address',
        blockHeight: 3,
        isSpent: false,
      },
    ];

    // Store UTXOs
    for (const utxo of utxos) {
      await db.put(
        `${KeyPrefixes.UTXO}${utxo.txId}:${utxo.outputIndex}`,
        utxo,
        SubLevels.UTXO_SET
      );
    }

    // Query UTXOs for specific address
    const addressUtxos: any[] = [];
    for await (const { key, value } of db.iterator({
      sublevel: SubLevels.UTXO_SET,
      start: KeyPrefixes.UTXO,
      end: KeyPrefixes.UTXO + '\xff',
    })) {
      const utxo = value as any;
      if (utxo.lockingScript === address && !utxo.isSpent) {
        addressUtxos.push(utxo);
      }
    }

    expect(addressUtxos).toHaveLength(2);
    expect(addressUtxos.map((u) => u.txId)).toContain('tx-1');
    expect(addressUtxos.map((u) => u.txId)).toContain('tx-2');
    expect(addressUtxos.map((u) => u.txId)).not.toContain('tx-3');
  });
});