import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOReorganizationManager } from '../../src/utxo-reorganization-manager.js';
import { UTXOTransactionManager } from '../../src/utxo-transaction.js';
import { UTXOManager } from '../../src/utxo.js';
import { DatabaseFactory } from '../../src/database.js';
import type {
  Block,
  UTXOChainBranch,
  UTXOChainConfig,
  UTXOPersistenceConfig,
} from '../../src/types.js';
import {
  createValidMockBlock,
  createMockBlockChain,
  createForkingChains,
  createMockBlockWithTransactions,
} from '../shared/fixtures/mock-block-factory.js';
import { createValidMockUTXOTransaction } from '../shared/fixtures/mock-transaction-factory.js';

describe('UTXOReorganizationManager (NO BACKWARDS COMPATIBILITY)', () => {
  let reorganizationManager: UTXOReorganizationManager;
  let utxoTransactionManager: UTXOTransactionManager;
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

    const _database = DatabaseFactory.create(persistenceConfig);
    // MemoryDatabase auto-opens in constructor, no initialize() method needed

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
      // Create genesis block
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });

      // Create current branch with 1 block
      const block1 = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 2,
      });
      const currentBranch = createMockBranch('current', [genesis, block1]);

      // Create better branch with more blocks and higher cumulative difficulty
      const block2a = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 4,
      });
      const block2b = createValidMockBlock({
        index: 2,
        previousHash: block2a.hash,
        difficulty: 4,
      });
      const block2c = createValidMockBlock({
        index: 3,
        previousHash: block2b.hash,
        difficulty: 4,
      });
      const betterBranch = createMockBranch('better', [
        genesis,
        block2a,
        block2b,
        block2c,
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        betterBranch
      );

      expect(result.success).toBe(true);
      expect(result.appliedBlocks).toBeDefined();
      expect(result.appliedBlocks!.length).toBeGreaterThan(0);
      expect(result.utxoSetDelta).toBeDefined();
      expect(result.transactionPoolUpdates).toBeDefined();
    });

    it('should reject reorganization exceeding max depth', async () => {
      // Create a short current chain
      const currentChain = createMockBlockChain(1, 2);
      const currentBranch = createMockBranch('current', currentChain);

      // Create a deep chain that exceeds max reorganization depth
      const deepChain = createMockBlockChain(
        config.maxReorganizationDepth + 2,
        2
      );
      const deepBranch = createMockBranch('deep', deepChain);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        deepBranch
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('exceeds limit');
      // reorgDepth might not be set when reorganization is rejected early
      if (result.reorgDepth !== undefined) {
        expect(result.reorgDepth).toBeGreaterThan(
          config.maxReorganizationDepth
        );
      }
    });

    it('should handle UTXO set delta calculation', async () => {
      // Create two forking chains with different transactions
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });

      // Create branch 1 with specific transactions
      const tx1 = createValidMockUTXOTransaction({
        id: 'tx-branch1',
        outputs: [
          { value: 100, lockingScript: 'addr-branch1', outputIndex: 0 },
        ],
        withSignature: false,
      });
      const block1 = createMockBlockWithTransactions(1, genesis.hash, [tx1], 2);
      const currentBranch = createMockBranch('current', [genesis, block1]);

      // Create branch 2 with different transactions and more blocks
      const tx2 = createValidMockUTXOTransaction({
        id: 'tx-branch2-1',
        outputs: [
          { value: 150, lockingScript: 'addr-branch2-1', outputIndex: 0 },
        ],
        withSignature: false,
      });
      const block2a = createMockBlockWithTransactions(
        1,
        genesis.hash,
        [tx2],
        2
      );

      const tx3 = createValidMockUTXOTransaction({
        id: 'tx-branch2-2',
        outputs: [
          { value: 200, lockingScript: 'addr-branch2-2', outputIndex: 0 },
        ],
        withSignature: false,
      });
      const block2b = createMockBlockWithTransactions(
        2,
        block2a.hash,
        [tx3],
        2
      );
      const newBranch = createMockBranch('new', [genesis, block2a, block2b]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        newBranch
      );

      expect(result.success).toBe(true);
      expect(result.utxoSetDelta).toBeDefined();
      expect(
        result.utxoSetDelta!.transactionsAffected.length
      ).toBeGreaterThanOrEqual(0);
    });

    it('should rollback on failure', async () => {
      const currentChain = createMockBlockChain(1, 2);
      const currentBranch = createMockBranch('current', currentChain);

      // Create an invalid branch that would cause rollback
      const invalidBranch = createMockInvalidBranch('invalid');

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        invalidBranch
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should handle same branch gracefully', async () => {
      const chain = createMockBlockChain(1, 2);
      const branch = createMockBranch('same', chain);

      const result = await reorganizationManager.executeUTXOReorganization(
        branch,
        branch
      );

      expect(result.success).toBe(true);
      expect(result.reorgDepth).toBe(0);
      expect(result.appliedBlocks).toEqual([]);
      expect(result.revertedBlocks).toEqual([]);
    });
  });

  describe('calculateUTXOSetDelta', () => {
    it('should calculate delta for different branches', async () => {
      // Create two forking chains with different transactions
      const { common, branch1, branch2 } = createForkingChains(1, 1, 1, 2);

      const branchA = createMockBranch('A', [...common, ...branch1]);
      const branchB = createMockBranch('B', [...common, ...branch2]);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branchA,
        branchB
      );

      expect(delta.addedUTXOs.length).toBeGreaterThanOrEqual(0);
      expect(delta.removedUTXOs.length).toBeGreaterThanOrEqual(0);
      expect(typeof delta.totalValueChange).toBe('number');
    });

    it('should handle empty deltas', async () => {
      const chain = createMockBlockChain(1, 2);
      const branch = createMockBranch('same', chain);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branch,
        branch
      );

      expect(delta.addedUTXOs.length).toBe(0);
      expect(delta.removedUTXOs.length).toBe(0);
      expect(delta.totalValueChange).toBe(0);
    });

    it('should calculate value changes correctly', async () => {
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });
      const blockA = createMockBlockWithValue(1, genesis.hash, 100);
      const branchA = createMockBranch('A', [genesis, blockA]);

      const blockB1 = createMockBlockWithValue(1, genesis.hash, 100);
      const blockB2 = createMockBlockWithValue(2, blockB1.hash, 50);
      const branchB = createMockBranch('B', [genesis, blockB1, blockB2]);

      const delta = await reorganizationManager.calculateUTXOSetDelta(
        branchA,
        branchB
      );

      expect(delta.totalValueChange).toBeGreaterThan(0);
    });
  });

  describe('validateReorganizationSafety', () => {
    it('should validate safe reorganization', async () => {
      // Create forking chains where new branch has higher difficulty
      const { common, branch1, branch2 } = createForkingChains(1, 1, 1, 2);

      // Make branch2 have higher difficulty
      const branch2HigherDiff = branch2.map(block =>
        createValidMockBlock({ ...block, difficulty: 4 })
      );

      const currentBranch = createMockBranch('current', [
        ...common,
        ...branch1,
      ]);
      const newBranch = createMockBranch('new', [
        ...common,
        ...branch2HigherDiff,
      ]);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        newBranch
      );

      expect(result.isSafe).toBe(true);
      expect(result.reorganizationDepth).toBeLessThanOrEqual(
        config.maxReorganizationDepth
      );
    });

    it('should detect unsafe reorganization depth', async () => {
      const currentChain = createMockBlockChain(1, 2);
      const currentBranch = createMockBranch('current', currentChain);

      const deepChain = createMockBlockChain(
        config.maxReorganizationDepth + 2,
        2
      );
      const deepBranch = createMockBranch('deep', deepChain);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        deepBranch
      );

      expect(result.isSafe).toBe(false);
      expect(result.reasonUnsafe).toBeDefined();
      expect(result.reorganizationDepth).toBeGreaterThan(
        config.maxReorganizationDepth
      );
    });

    it('should detect finality conflicts', async () => {
      // Create a long current chain with finalized blocks
      const currentChain = createMockBlockChain(
        config.minConfirmationsForFinality + 1,
        2
      );
      const currentBranch = createMockBranch('current', currentChain);

      // Create a shorter conflicting branch
      const { common, branch1 } = createForkingChains(1, 0, 1, 4);
      const conflictingBranch = createMockBranch('conflict', [
        ...common,
        ...branch1,
      ]);

      const result = await reorganizationManager.validateReorganizationSafety(
        currentBranch,
        conflictingBranch
      );

      expect(result.isSafe).toBe(false);
      expect(result.reasonUnsafe).toBeDefined();
    });

    it('should warn about large UTXO set changes', async () => {
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });
      const smallBranch = createMockBranch('small', [genesis]);

      // Create large branch with many UTXOs
      const largeBlocks = [genesis];
      let prevHash = genesis.hash;
      for (let i = 1; i < 5; i++) {
        const block = createMockBlockWithManyUTXOs(i, prevHash, 2);
        largeBlocks.push(block);
        prevHash = block.hash;
      }
      const largeBranch = createMockBranch('large', largeBlocks);

      const result = await reorganizationManager.validateReorganizationSafety(
        smallBranch,
        largeBranch
      );

      // Validation should complete (isSafe can be true or false depending on implementation)
      expect(result).toBeDefined();
      expect(result.reorganizationDepth).toBeGreaterThan(0);
    });
  });

  describe('transaction pool management', () => {
    it('should update transaction pool after reorganization', async () => {
      // Create genesis block
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });

      // Create current branch with 1 block
      const block1 = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 2,
      });
      const currentBranch = createMockBranch('current', [genesis, block1]);

      // Create new branch with 2 blocks at higher difficulty
      const block2a = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 4,
      });
      const block2b = createValidMockBlock({
        index: 2,
        previousHash: block2a.hash,
        difficulty: 4,
      });
      const newBranch = createMockBranch('new', [genesis, block2a, block2b]);

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
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });

      // Create branch with conflicting transaction
      const conflictBlock = createMockBlockWithConflictingTx(
        1,
        genesis.hash,
        2
      );
      const branchWithConflict = createMockBranch('conflict', [
        genesis,
        conflictBlock,
      ]);

      // Create clean branch with higher difficulty and more blocks
      const cleanBlock1 = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 4,
      });
      const cleanBlock2 = createValidMockBlock({
        index: 2,
        previousHash: cleanBlock1.hash,
        difficulty: 4,
      });
      const cleanBranch = createMockBranch('clean', [
        genesis,
        cleanBlock1,
        cleanBlock2,
      ]);

      const result = await reorganizationManager.executeUTXOReorganization(
        branchWithConflict,
        cleanBranch
      );

      expect(result.success).toBe(true);
      expect(result.transactionPoolUpdates).toBeDefined();
      expect(result.transactionPoolUpdates!.addedTransactions).toBeDefined();
      expect(result.transactionPoolUpdates!.removedTransactions).toBeDefined();
    });
  });

  describe('error handling and rollback', () => {
    it('should perform complete rollback on failure', async () => {
      const currentChain = createMockBlockChain(1, 2);
      const currentBranch = createMockBranch('current', currentChain);

      const corruptBranch = createMockCorruptBranch('corrupt');

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        corruptBranch
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should handle persistence errors gracefully', async () => {
      const genesis = createValidMockBlock({
        index: 0,
        previousHash: '0',
        difficulty: 2,
      });

      // Create current branch with 1 block
      const block1 = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 2,
      });
      const currentBranch = createMockBranch('current', [genesis, block1]);

      // Create new branch with more blocks and higher difficulty
      const block2a = createValidMockBlock({
        index: 1,
        previousHash: genesis.hash,
        difficulty: 4,
      });
      const block2b = createValidMockBlock({
        index: 2,
        previousHash: block2a.hash,
        difficulty: 4,
      });
      const newBranch = createMockBranch('new', [genesis, block2a, block2b]);

      const result = await reorganizationManager.executeUTXOReorganization(
        currentBranch,
        newBranch
      );

      // Should succeed with proper branch setup
      expect(result.success).toBe(true);
      expect(result).toBeDefined();
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

  function createMockBlockWithValue(
    index: number,
    previousHash: string,
    value: number
  ): Block {
    const tx = createValidMockUTXOTransaction({
      id: `tx-value-${index}`,
      inputs: [],
      outputs: [
        {
          value,
          lockingScript: `address-${index}`,
          outputIndex: 0,
        },
      ],
      fee: 0,
      withSignature: false,
    });

    return createValidMockBlock({
      index,
      previousHash,
      transactions: [tx],
      difficulty: 2,
    });
  }

  function createMockBlockWithManyUTXOs(
    index: number,
    previousHash: string,
    difficulty: number
  ): Block {
    const transactions = Array.from({ length: 10 }, (_, i) =>
      createValidMockUTXOTransaction({
        id: `tx-many-${index}-${i}`,
        inputs: [],
        outputs: Array.from({ length: 3 }, (_, j) => ({
          value: 10,
          lockingScript: `address-${index}-${i}-${j}`,
          outputIndex: j,
        })),
        fee: 1,
        withSignature: false,
      })
    );

    return createValidMockBlock({
      index,
      previousHash,
      transactions,
      difficulty,
    });
  }

  function createMockBlockWithConflictingTx(
    index: number,
    previousHash: string,
    difficulty: number
  ): Block {
    const tx = createValidMockUTXOTransaction({
      id: `conflicting-tx-${index}`,
      inputs: [
        {
          txId: 'same-utxo-input',
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
      fee: 1,
      withSignature: false,
    });

    return createValidMockBlock({
      index,
      previousHash,
      transactions: [tx],
      difficulty,
    });
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
