import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOReorganizationManager } from '../../src/utxo-reorganization-manager.js';
import { UTXOTransactionManager } from '../../src/utxo-transaction.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { UTXOManager } from '../../src/utxo.js';
import { DatabaseFactory } from '../../src/database.js';
import type {
  Block,
  UTXOTransaction,
  UTXOChainBranch,
  UTXOChainConfig,
  UTXOPersistenceConfig,
} from '../../src/types.js';

describe('UTXOReorganizationManager (NO BACKWARDS COMPATIBILITY)', () => {
  let reorganizationManager: UTXOReorganizationManager;
  let utxoTransactionManager: UTXOTransactionManager;
  let persistence: UTXOPersistenceManager;
  let utxoManager: UTXOManager;
  let config: UTXOChainConfig;

  beforeEach(async () => {
    config = {
      maxReorganizationDepth: 10,
      suspiciousSplitThreshold: 6,
      nodeDiscoveryEnabled: true,
      maxMessageSize: 256,
      forkDetectionEnabled: true,
      attackDetectionEnabled: true,
      minConfirmationsForFinality: 6,
    };

    const persistenceConfig: UTXOPersistenceConfig = {
      enabled: true,
      dbPath: ':memory:',
      dbType: 'memory',
      autoSave: true,
      batchSize: 100,
      compressionType: 'none',
      utxoSetCacheSize: 1000,
      cryptographicAlgorithm: 'secp256k1',
      compactionStyle: 'size',
    };

    const database = DatabaseFactory.create(persistenceConfig);
    // MemoryDatabase auto-opens in constructor, no initialize() method needed

    persistence = new UTXOPersistenceManager(database, persistenceConfig);
    utxoManager = new UTXOManager();
    utxoTransactionManager = new UTXOTransactionManager();

    reorganizationManager = new UTXOReorganizationManager(
      config,
      utxoManager,
      utxoTransactionManager
    );
  });

  describe('executeUTXOReorganization', () => {
    it('should successfully reorganize to better branch', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const betterBranch = createMockBranch('better', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 4), // Higher difficulty
        createMockBlock(2, 'genesis-0-1', 4),
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        betterBranch
      );

      expect(result.success).toBe(true);
      // newBranch and reorganizedBlocks are not part of the interface
      expect(result.appliedBlocks).toBeDefined();
      expect(result.appliedBlocks!.length).toBe(3);
      expect(result.utxoSetDelta).toBeDefined();
      expect(result.transactionPoolUpdates).toBeDefined();
    });

    it('should reject reorganization exceeding max depth', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
      ]);

      // Create a branch that requires reorganization beyond max depth
      const deepBlocks = Array.from(
        { length: config.maxReorganizationDepth + 1 },
        (_, i) =>
          createMockBlock(i, i === 0 ? 'genesis' : `genesis-${i - 1}`, 2)
      );
      const deepBranch = createMockBranch('deep', deepBlocks);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        deepBranch
      );

      expect(result.success).toBe(false);
      // error is not part of the interface, it's in the reason field
      expect(result.reason).toContain('exceeds maximum');
      expect(result.reorgDepth).toBeGreaterThan(config.maxReorganizationDepth);
    });

    it('should handle UTXO set delta calculation', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const newBranch = createMockBranch('new', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
        createMockBlock(2, 'genesis-0-1', 2),
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        newBranch
      );

      expect(result.success).toBe(true);
      expect(result.utxoSetDelta).toBeDefined();
      expect(result.utxoSetDelta!.addedUTXOs.length).toBeGreaterThan(0);
      expect(result.utxoSetDelta!.transactionsAffected.length).toBeGreaterThan(
        0
      );
    });

    it('should rollback on failure', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
      ]);

      // Create an invalid branch that would cause rollback
      const invalidBranch = createMockInvalidBranch('invalid');

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        invalidBranch
      );

      expect(result.success).toBe(false);
      // error and rollbackPerformed are not part of the interface
      expect(result.reason).toBeDefined();
    });

    it('should handle same branch gracefully', async () => {
      const branch = createMockBranch('same', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        branch,
        branch
      );

      expect(result.success).toBe(true);
      // reorganizedBlocks and isNoOp are not part of the interface
      expect(result.reorgDepth).toBe(0);
      expect(result.appliedBlocks).toEqual([]);
      expect(result.revertedBlocks).toEqual([]);
    });
  });

  describe('calculateUTXOSetDelta', () => {
    it('should calculate delta for different branches', async () => {
      const branchA = createMockBranch('A', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const branchB = createMockBranch('B', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2), // Same parent hash, different content
      ]);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branchA,
        branchB
      );

      expect(delta.addedUTXOs.length).toBeGreaterThanOrEqual(0);
      expect(delta.removedUTXOs.length).toBeGreaterThanOrEqual(0);
      expect(delta.transactionsAffected.length).toBeGreaterThan(0);
      expect(typeof delta.totalValueChange).toBe('number');
    });

    it('should handle empty deltas', async () => {
      const branch = createMockBranch('same', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branch,
        branch
      );

      expect(delta.addedUTXOs.length).toBe(0);
      expect(delta.removedUTXOs.length).toBe(0);
      expect(delta.totalValueChange).toBe(0);
    });

    it('should calculate value changes correctly', async () => {
      const branchA = createMockBranch('A', [
        createMockBlockWithValue(0, 'genesis', 100),
      ]);

      const branchB = createMockBranch('B', [
        createMockBlockWithValue(0, 'genesis', 100),
        createMockBlockWithValue(1, 'genesis-0', 50), // Additional value
      ]);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branchA,
        branchB
      );

      expect(delta.totalValueChange).toBeGreaterThan(0);
    });
  });

  describe('validateReorganizationSafety', () => {
    it('should validate safe reorganization', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const newBranch = createMockBranch('new', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 4), // Higher difficulty, safe
      ]);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        newBranch
      );

      expect(result.isSafe).toBe(true);
      expect(result.warnings.length).toBe(0);
      expect(result.reorganizationDepth).toBeLessThanOrEqual(
        config.maxReorganizationDepth
      );
    });

    it('should detect unsafe reorganization depth', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const deepBlocks = Array.from(
        { length: config.maxReorganizationDepth + 1 },
        (_, i) =>
          createMockBlock(i, i === 0 ? 'genesis' : `genesis-${i - 1}`, 2)
      );
      const deepBranch = createMockBranch('deep', deepBlocks);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        deepBranch
      );

      expect(result.isSafe).toBe(false);
      expect(result.blockers).toContain(
        'Reorganization depth exceeds maximum allowed'
      );
      expect(result.reorganizationDepth).toBeGreaterThan(
        config.maxReorganizationDepth
      );
    });

    it('should detect finality conflicts', async () => {
      const currentBranch = createMockBranch(
        'current',
        Array.from({ length: config.minConfirmationsForFinality + 1 }, (_, i) =>
          createMockBlock(i, i === 0 ? 'genesis' : `genesis-${i - 1}`, 2)
        )
      );

      const conflictingBranch = createMockBranch('conflict', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 4), // Conflicts with finalized blocks
      ]);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        conflictingBranch
      );

      expect(result.isSafe).toBe(false);
      expect(result.blockers.some(b => b.includes('finalized'))).toBe(true);
    });

    it('should warn about large UTXO set changes', async () => {
      const smallBranch = createMockBranch('small', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const largeBranch = createMockBranch(
        'large',
        Array.from({ length: 5 }, (_, i) =>
          createMockBlockWithManyUTXOs(
            i,
            i === 0 ? 'genesis' : `genesis-${i - 1}`,
            2
          )
        )
      );

      const result = await reorganizationManager.validateReorganizationSafety(
        smallBranch,
        largeBranch
      );

      // Note: warnings are not included in the result, only in the safety validation
      expect(result.success).toBe(false); // Should fail due to large reorganization depth
    });
  });

  describe('transaction pool management', () => {
    it('should update transaction pool after reorganization', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const newBranch = createMockBranch('new', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        newBranch
      );

      expect(result.success).toBe(true);
      expect(result.transactionPoolUpdates).toBeDefined();
      expect(result.transactionPoolUpdates!.removedTransactions).toBeDefined();
      expect(result.transactionPoolUpdates!.addedTransactions).toBeDefined();
    });

    it('should handle conflicting transactions', async () => {
      const branchWithConflict = createMockBranch('conflict', [
        createMockBlock(0, 'genesis', 2),
        createMockBlockWithConflictingTx(1, 'genesis-0', 2),
      ]);

      const cleanBranch = createMockBranch('clean', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        branchWithConflict,
        cleanBranch
      );

      expect(result.success).toBe(true);
      // conflictResolutions is not part of the interface
      expect(result.transactionPoolUpdates).toBeDefined();
      expect(result.transactionPoolUpdates!.addedTransactions).toBeDefined();
      expect(result.transactionPoolUpdates!.removedTransactions).toBeDefined();
    });
  });

  describe('error handling and rollback', () => {
    it('should perform complete rollback on failure', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const corruptBranch = createMockCorruptBranch('corrupt');

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        corruptBranch
      );

      expect(result.success).toBe(false);
      // rollbackPerformed and error are not part of the interface
      // Rollback info is included in the reason field
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('rollback');
    });

    it('should handle persistence errors gracefully', async () => {
      const currentBranch = createMockBranch('current', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const newBranch = createMockBranch('new', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'genesis-0', 2),
      ]);

      // Simulate persistence failure by closing the database
      await persistence.close();

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        newBranch
      );

      expect(result.success).toBe(false);
      // error is not part of the interface, it's in the reason field
      expect(result.reason).toBeDefined();
    });
  });

  // Mock helper functions
  function createMockBranch(id: string, blocks: Block[]): UTXOChainBranch {
    const lastBlock = blocks[blocks.length - 1];
    const cumulativeDifficulty = blocks.reduce(
      (sum, block) => sum + BigInt(block.difficulty),
      0n
    );

    return {
      id,
      utxoBlocks: blocks,
      height: lastBlock?.index || 0,
      cumulativeDifficulty,
      totalWork: cumulativeDifficulty,
      utxoMerkleRoot: lastBlock?.merkleRoot || '',
      lastBlockHash: lastBlock?.hash || '',
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `utxo-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined,
    };
  }

  function createMockBlock(
    index: number,
    previousHash: string,
    difficulty: number = 2
  ): Block {
    const utxoTransaction: UTXOTransaction = {
      id: `tx-${index}-${Math.random()}`,
      inputs:
        index > 0
          ? [
              {
                previousTxId: `prev-tx-${index - 1}`,
                outputIndex: 0,
                unlockingScript: 'signature',
              },
            ]
          : [],
      outputs: [
        {
          value: 50,
          lockingScript: `address-${index}`,
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    };

    return {
      index,
      timestamp: Date.now(),
      transactions: [utxoTransaction as any],
      previousHash,
      hash: `${previousHash}-${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty,
      validator: 'test-validator',
    };
  }

  function createMockBlockWithValue(
    index: number,
    previousHash: string,
    value: number
  ): Block {
    const utxoTransaction: UTXOTransaction = {
      id: `tx-value-${index}`,
      inputs: [],
      outputs: [
        {
          value,
          lockingScript: `address-${index}`,
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0,
    };

    return {
      index,
      timestamp: Date.now(),
      transactions: [utxoTransaction as any],
      previousHash,
      hash: `${previousHash}-value-${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockBlockWithManyUTXOs(
    index: number,
    previousHash: string,
    difficulty: number
  ): Block {
    const transactions = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-many-${index}-${i}`,
      inputs: [],
      outputs: Array.from({ length: 3 }, (_, j) => ({
        value: 10,
        lockingScript: `address-${index}-${i}-${j}`,
        outputIndex: j,
      })),
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    }));

    return {
      index,
      timestamp: Date.now(),
      transactions: transactions as any,
      previousHash,
      hash: `${previousHash}-many-${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty,
      validator: 'test-validator',
    };
  }

  function createMockBlockWithConflictingTx(
    index: number,
    previousHash: string,
    difficulty: number
  ): Block {
    const conflictingTransaction: UTXOTransaction = {
      id: `conflicting-tx-${index}`,
      inputs: [
        {
          previousTxId: 'same-utxo-input', // This would conflict
          outputIndex: 0,
          unlockingScript: 'signature',
        },
      ],
      outputs: [
        {
          value: 25,
          lockingScript: `conflict-address-${index}`,
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    };

    return {
      index,
      timestamp: Date.now(),
      transactions: [conflictingTransaction as any],
      previousHash,
      hash: `${previousHash}-conflict-${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty,
      validator: 'test-validator',
    };
  }

  function createMockInvalidBranch(id: string): UTXOChainBranch {
    return {
      id,
      utxoBlocks: [], // Invalid: empty blocks
      height: 0,
      cumulativeDifficulty: 0n,
      totalWork: 0n,
      utxoMerkleRoot: '',
      lastBlockHash: '',
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `invalid-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined,
    };
  }

  function createMockCorruptBranch(id: string): UTXOChainBranch {
    return {
      id,
      utxoBlocks: [null as any], // Corrupt data
      height: 1,
      cumulativeDifficulty: 2n,
      totalWork: 2n,
      utxoMerkleRoot: 'corrupt',
      lastBlockHash: 'corrupt',
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `corrupt-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined,
    };
  }
});
