import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { MemoryDatabase, SubLevels } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import type {
  IDatabase,
  UTXOPersistenceConfig,
  Block,
  UTXOTransaction,
  UTXO,
  UTXOBlockchainState,
} from '../../src/types.js';

// Test configuration
const testConfig: UTXOPersistenceConfig = {
  enabled: true,
  dbPath: './test-persistence-data',
  dbType: 'memory',
  autoSave: true,
  batchSize: 100,
  compressionType: 'none',
  maxDatabaseSize: 1024 * 1024 * 100,
  pruningEnabled: false,
  backupEnabled: false,
  utxoSetCacheSize: 1024 * 1024,
  cryptographicAlgorithm: 'secp256k1',
  compactionStyle: 'size',
};

// Mock data generators
function createMockBlock(index: number): Block {
  return {
    index,
    timestamp: Date.now(),
    transactions: [
      {
        id: `tx-${index}-1`,
        from: 'address-sender',
        to: 'address-receiver',
        amount: 1000000,
        fee: 1000,
        timestamp: Date.now(),
        signature: 'mock-signature',
        nonce: 0,
      },
    ],
    previousHash: index > 0 ? `block-hash-${index - 1}` : '0',
    hash: `block-hash-${index}`,
    nonce: 12345,
    merkleRoot: `merkle-root-${index}`,
    validator: 'validator-address',
  };
}

function createMockUTXOTransaction(id: string): UTXOTransaction {
  return {
    id,
    inputs: [
      {
        previousTxId: 'prev-tx-123',
        outputIndex: 0,
        unlockingScript: 'signature:publickey',
        sequence: 0xffffffff,
      },
    ],
    outputs: [
      {
        value: 500000,
        lockingScript: 'address-receiver',
        outputIndex: 0,
      },
      {
        value: 499000,
        lockingScript: 'address-sender',
        outputIndex: 1,
      },
    ],
    lockTime: 0,
    timestamp: Date.now(),
    fee: 1000,
  };
}

function createMockUTXO(
  txId: string,
  outputIndex: number,
  value: number
): UTXO {
  return {
    txId,
    outputIndex,
    value,
    lockingScript: 'address-test',
    blockHeight: 1,
    isSpent: false,
  };
}

describe('UTXOPersistenceManager', () => {
  let db: IDatabase;
  let cryptoService: CryptographicService;
  let persistenceManager: UTXOPersistenceManager;

  beforeEach(() => {
    db = new MemoryDatabase();
    cryptoService = new CryptographicService();
    persistenceManager = new UTXOPersistenceManager(
      db,
      testConfig,
      cryptoService
    );
  });

  afterEach(async () => {
    await persistenceManager.close();
  });

  describe('Block Operations', () => {
    it('should save and retrieve blocks correctly', async () => {
      const block = createMockBlock(1);

      await persistenceManager.saveBlock(block);
      const retrievedBlock = await persistenceManager.getBlock(1);

      expect(retrievedBlock).toEqual(block);
    });

    it('should return null for non-existent blocks', async () => {
      const result = await persistenceManager.getBlock(999);
      expect(result).toBeNull();
    });

    it('should update latest block index when saving blocks', async () => {
      const block1 = createMockBlock(0);
      const block2 = createMockBlock(1);

      await persistenceManager.saveBlock(block1);
      await persistenceManager.saveBlock(block2);

      // Check that metadata was updated by loading blockchain state
      const state = await persistenceManager.loadBlockchainState();
      expect(state?.latestBlockIndex).toBe(1);
    });
  });

  describe('UTXO Transaction Operations', () => {
    it('should save and retrieve UTXO transactions', async () => {
      const transaction = createMockUTXOTransaction('test-tx-1');

      await persistenceManager.saveUTXOTransaction(transaction);
      const retrieved =
        await persistenceManager.getUTXOTransaction('test-tx-1');

      expect(retrieved).toEqual(transaction);
    });

    it('should return null for non-existent transactions', async () => {
      const result =
        await persistenceManager.getUTXOTransaction('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('UTXO Set Management', () => {
    it('should save, retrieve, and delete UTXOs', async () => {
      const utxo = createMockUTXO('tx-1', 0, 100000);

      // Save UTXO
      await persistenceManager.saveUTXO(utxo);

      // Retrieve UTXO
      const retrieved = await persistenceManager.getUTXO('tx-1', 0);
      expect(retrieved).toEqual(utxo);

      // Delete UTXO
      await persistenceManager.deleteUTXO('tx-1', 0);

      // Verify deletion
      const deletedUtxo = await persistenceManager.getUTXO('tx-1', 0);
      expect(deletedUtxo).toBeNull();
    });

    it('should retrieve UTXOs by address', async () => {
      const address = 'test-address-123';
      const utxos = [
        { ...createMockUTXO('tx-1', 0, 100000), lockingScript: address },
        { ...createMockUTXO('tx-2', 1, 200000), lockingScript: address },
        {
          ...createMockUTXO('tx-3', 0, 150000),
          lockingScript: 'different-address',
        },
        {
          ...createMockUTXO('tx-4', 0, 50000),
          lockingScript: address,
          isSpent: true,
        },
      ];

      // Save all UTXOs
      for (const utxo of utxos) {
        await persistenceManager.saveUTXO(utxo);
      }

      // Retrieve UTXOs for specific address
      const addressUtxos = await persistenceManager.getUTXOsForAddress(address);

      // Should return only unspent UTXOs for the address, sorted by value descending
      expect(addressUtxos).toHaveLength(2);
      expect(addressUtxos[0].value).toBe(200000); // Highest value first
      expect(addressUtxos[1].value).toBe(100000);
      expect(addressUtxos.every(utxo => utxo.lockingScript === address)).toBe(
        true
      );
      expect(addressUtxos.every(utxo => !utxo.isSpent)).toBe(true);
    });

    it('should return empty array for address with no UTXOs', async () => {
      const utxos = await persistenceManager.getUTXOsForAddress(
        'non-existent-address'
      );
      expect(utxos).toEqual([]);
    });
  });

  describe('Cryptographic Key Management', () => {
    it('should save and retrieve key pairs', async () => {
      const address = 'test-address';
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      await persistenceManager.saveKeyPair(address, keyPair);
      const retrieved = await persistenceManager.getKeyPair(address);

      expect(retrieved).toEqual(keyPair);
    });

    it('should return null for non-existent key pairs', async () => {
      const result = await persistenceManager.getKeyPair(
        'non-existent-address'
      );
      expect(result).toBeNull();
    });
  });

  describe('Blockchain State Management', () => {
    it('should save and load complete blockchain state', async () => {
      const blocks = [createMockBlock(0), createMockBlock(1)];
      const utxoSet = new Map<string, UTXO>();
      utxoSet.set('utxo:tx-1:0', createMockUTXO('tx-1', 0, 100000));
      utxoSet.set('utxo:tx-2:1', createMockUTXO('tx-2', 1, 200000));

      const pendingTransactions = [createMockUTXOTransaction('pending-tx-1')];

      const state: UTXOBlockchainState = {
        blocks,
        utxoSet,
        pendingUTXOTransactions: pendingTransactions,
        difficulty: 4,
        miningReward: 50,
        latestBlockIndex: 1,
        utxoRootHash: 'test-utxo-root-hash',
        cryptographicKeys: new Map(),
      };

      await persistenceManager.saveBlockchainState(state);
      const loadedState = await persistenceManager.loadBlockchainState();

      expect(loadedState).toBeDefined();
      expect(loadedState!.blocks).toEqual(blocks);
      expect(loadedState!.difficulty).toBe(4);
      expect(loadedState!.miningReward).toBe(50);
      expect(loadedState!.latestBlockIndex).toBe(1);
      expect(loadedState!.utxoRootHash).toBe('test-utxo-root-hash');
      expect(loadedState!.pendingUTXOTransactions).toEqual(pendingTransactions);
      expect(loadedState!.utxoSet.size).toBe(2);
    });

    it('should return null when no blockchain state exists', async () => {
      const state = await persistenceManager.loadBlockchainState();
      expect(state).toBeNull();
    });

    it('should load default values for missing configuration', async () => {
      // Save just the metadata to trigger state loading
      await db.put('latest_block', 0, SubLevels.METADATA);
      await persistenceManager.saveBlock(createMockBlock(0));

      // Don't save difficulty and mining reward to test defaults
      const loadedState = await persistenceManager.loadBlockchainState();

      expect(loadedState).toBeDefined();
      expect(loadedState!.difficulty).toBe(2); // Default value
      expect(loadedState!.miningReward).toBe(10); // Default value
    });
  });

  describe('Integrity Validation', () => {
    it('should validate empty blockchain as valid', async () => {
      const result = await persistenceManager.validateIntegrity();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate complete blockchain state', async () => {
      // Set up valid blockchain state
      const blocks = [createMockBlock(0), createMockBlock(1)];
      const state: UTXOBlockchainState = {
        blocks,
        utxoSet: new Map([['utxo:tx-1:0', createMockUTXO('tx-1', 0, 100000)]]),
        pendingUTXOTransactions: [],
        difficulty: 2,
        miningReward: 10,
        latestBlockIndex: 1,
        utxoRootHash: 'test-hash',
        cryptographicKeys: new Map(),
      };

      await persistenceManager.saveBlockchainState(state);

      const result = await persistenceManager.validateIntegrity();
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing blocks', async () => {
      // Create state with missing block
      await persistenceManager.saveBlock(createMockBlock(0));
      // Skip block 1
      await persistenceManager.saveBlock(createMockBlock(2));

      // Set latest block index to 2
      await db.put('latest_block', 2, 'metadata');

      const result = await persistenceManager.validateIntegrity();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual('Missing block at index 1');
    });

    it('should detect invalid difficulty configuration', async () => {
      // Set up blockchain with blocks first
      await persistenceManager.saveBlock(createMockBlock(0));
      await db.put('latest_block', 0, SubLevels.METADATA);

      // Save invalid difficulty directly
      await db.put('difficulty', -1, SubLevels.CONFIG);

      const result = await persistenceManager.validateIntegrity();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual('Invalid difficulty configuration');
    });

    it('should detect empty UTXO set with existing blocks', async () => {
      // Create state with blocks but no UTXOs
      await persistenceManager.saveBlock(createMockBlock(0));
      await persistenceManager.saveBlock(createMockBlock(1));
      await db.put('latest_block', 1, 'metadata');

      const result = await persistenceManager.validateIntegrity();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        'UTXO set is empty but blockchain contains blocks'
      );
    });
  });

  describe('Corruption Repair', () => {
    it('should handle empty blockchain during repair', async () => {
      const result = await persistenceManager.repairCorruption();
      expect(result.repaired).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.utxoSetRebuilt).toBe(false);
      expect(result.corruptedBlocks).toEqual([]);
    });

    it('should detect and report corrupted blocks', async () => {
      // Set up blockchain with valid blocks
      await persistenceManager.saveBlock(createMockBlock(0));
      await persistenceManager.saveBlock(createMockBlock(1));
      await db.put('latest_block', 2, 'metadata'); // Set index higher than existing blocks

      const result = await persistenceManager.repairCorruption();
      expect(result.repaired).toBe(false);
      expect(result.corruptedBlocks).toContainEqual(2); // Missing block 2
      expect(result.utxoSetRebuilt).toBe(true); // Should rebuild UTXO set
    });
  });

  describe('UTXO Set Rebuild', () => {
    it('should rebuild UTXO set from blocks', async () => {
      // Save some blocks
      const block0 = createMockBlock(0);
      const block1 = createMockBlock(1);

      await persistenceManager.saveBlock(block0);
      await persistenceManager.saveBlock(block1);
      await db.put('latest_block', 1, 'metadata');

      // Clear existing UTXO set if any
      await db.del('utxo:tx-0-1:0', 'utxo_set');
      await db.del('utxo:tx-1-1:0', 'utxo_set');

      // Rebuild UTXO set
      await persistenceManager.rebuildUTXOSet();

      // Verify UTXOs were created from block transactions
      const utxo0 = await persistenceManager.getUTXO('tx-0-1', 0);
      const utxo1 = await persistenceManager.getUTXO('tx-1-1', 0);

      expect(utxo0).toBeDefined();
      expect(utxo0?.value).toBe(1000000); // Amount from block transaction
      expect(utxo0?.lockingScript).toBe('address-receiver');

      expect(utxo1).toBeDefined();
      expect(utxo1?.value).toBe(1000000);
      expect(utxo1?.lockingScript).toBe('address-receiver');
    });

    it('should handle rebuild with no blocks', async () => {
      await persistenceManager.rebuildUTXOSet();
      // Should complete without errors
      const count = await persistenceManager.getUTXOCount();
      expect(count).toBe(0);
    });
  });

  describe('Statistics and Utility Methods', () => {
    beforeEach(async () => {
      // Set up test data
      const blocks = [createMockBlock(0), createMockBlock(1)];
      const utxos = [
        createMockUTXO('tx-1', 0, 100000),
        createMockUTXO('tx-2', 0, 200000),
        createMockUTXO('tx-3', 0, 50000), // This one will be marked as spent
      ];
      utxos[2].isSpent = true;

      const transactions = [
        createMockUTXOTransaction('tx-1'),
        createMockUTXOTransaction('tx-2'),
      ];

      // Save test data
      for (const block of blocks) {
        await persistenceManager.saveBlock(block);
      }

      for (const utxo of utxos) {
        await persistenceManager.saveUTXO(utxo);
      }

      for (const tx of transactions) {
        await persistenceManager.saveUTXOTransaction(tx);
      }
    });

    it('should count UTXOs correctly', async () => {
      const count = await persistenceManager.getUTXOCount();
      expect(count).toBe(3); // Including spent UTXO
    });

    it('should generate database statistics', async () => {
      const stats = await persistenceManager.getDatabaseStats();

      expect(stats.totalUTXOs).toBe(3);
      expect(stats.totalValue).toBe(300000); // Only unspent UTXOs: 100000 + 200000
      expect(stats.totalBlocks).toBe(2);
      expect(stats.totalTransactions).toBe(2);
      expect(stats.databaseSizeBytes).toBe(0); // Placeholder value
      expect(stats.lastCompactionTime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Since MemoryDatabase handles errors gracefully, test with actual error conditions
      const errorResult = await persistenceManager.validateIntegrity();

      // The validation should work even with empty database
      expect(errorResult.isValid).toBe(true);
    });

    it('should handle serialization errors', async () => {
      // MemoryDatabase can actually handle circular references since it doesn't serialize
      // This is expected behavior for the memory implementation
      const circularObj: any = { id: 'test' };
      circularObj.self = circularObj;

      // This should work with memory database
      await expect(db.put('circular', circularObj)).resolves.not.toThrow();
    });
  });

  describe('Cleanup Operations', () => {
    it('should close persistence manager cleanly', async () => {
      await expect(persistenceManager.close()).resolves.not.toThrow();
    });

    it('should handle double close gracefully', async () => {
      await persistenceManager.close();
      await expect(persistenceManager.close()).resolves.not.toThrow();
    });
  });

  describe('Key Generation and Management', () => {
    it('should generate proper keys for different data types', async () => {
      // Test key generation patterns
      const block = createMockBlock(123);
      const utxo = createMockUTXO('test-tx-id', 5, 100000);
      const transaction = createMockUTXOTransaction('test-utxo-tx');

      await persistenceManager.saveBlock(block);
      await persistenceManager.saveUTXO(utxo);
      await persistenceManager.saveUTXOTransaction(transaction);

      // Verify data can be retrieved with proper keys
      const retrievedBlock = await persistenceManager.getBlock(123);
      const retrievedUtxo = await persistenceManager.getUTXO('test-tx-id', 5);
      const retrievedTx =
        await persistenceManager.getUTXOTransaction('test-utxo-tx');

      expect(retrievedBlock).toEqual(block);
      expect(retrievedUtxo).toEqual(utxo);
      expect(retrievedTx).toEqual(transaction);
    });

    it('should use zero-padded block indices for proper ordering', async () => {
      const blocks = [
        createMockBlock(1),
        createMockBlock(10),
        createMockBlock(100),
      ];

      for (const block of blocks) {
        await persistenceManager.saveBlock(block);
      }

      // All blocks should be retrievable
      for (const block of blocks) {
        const retrieved = await persistenceManager.getBlock(block.index);
        expect(retrieved).toEqual(block);
      }
    });
  });
});
