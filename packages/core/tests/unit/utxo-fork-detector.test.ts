import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOForkDetector } from '../../src/utxo-fork-detector.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { UTXOManager } from '../../src/utxo.js';
import type {
  Block,
  UTXOChainState,
  UTXOChainBranch,
  UTXOChainConfig,
} from '../../src/types.js';
import {
  createValidMockBlock,
  createMockBlockChain,
} from '../shared/fixtures/mock-block-factory.js';
import { createValidMockUTXOTransaction } from '../shared/fixtures/mock-transaction-factory.js';

describe('UTXOForkDetector (NO BACKWARDS COMPATIBILITY)', () => {
  let forkDetector: UTXOForkDetector;
  let compressionManager: UTXOCompressionManager;
  let reliableDelivery: UTXOReliableDeliveryManager;
  let utxoManager: UTXOManager;
  let config: UTXOChainConfig;
  let chainState: UTXOChainState;
  let activeBranch: UTXOChainBranch;

  beforeEach(() => {
    config = {
      maxReorganizationDepth: 10,
      suspiciousSplitThreshold: 6,
      nodeDiscoveryEnabled: true,
      maxMessageSize: 256,
      forkDetectionEnabled: true,
      attackDetectionEnabled: true,
      minConfirmationsForFinality: 6,
    };

    compressionManager = new UTXOCompressionManager({
      defaultAlgorithm: 'gzip' as const,
      compressionLevel: 'balanced' as const,
      enableDictionary: false,
      maxCompressionMemory: 512 * 1024,
      enableAdaptive: true,
      compressionThreshold: 64,
      dutyCycleIntegration: false,
      utxoOptimization: true,
      regionalCompliance: 'US',
    });
    // Create proper config for UTXOReliableDeliveryManager
    const deliveryConfig = {
      defaultRetryPolicy: {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
      maxPendingMessages: 100,
      ackTimeoutMs: 5000,
      enablePersistence: false,
      deadLetterThreshold: 5,
      enableCompression: true,
      enableDutyCycleIntegration: false,
      enablePriorityCalculation: true,
    };

    const nodeKeyPair = {
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
    };

    reliableDelivery = new UTXOReliableDeliveryManager(
      'test-node-id',
      nodeKeyPair,
      deliveryConfig
    );
    utxoManager = new UTXOManager();

    forkDetector = new UTXOForkDetector(
      config,
      compressionManager,
      reliableDelivery,
      utxoManager
    );

    // Create mock active branch using standardized factory
    const mockChain = createMockBlockChain(2, 2); // 2 blocks, difficulty 2
    activeBranch = {
      id: 'main',
      utxoBlocks: mockChain,
      height: mockChain.length - 1,
      cumulativeDifficulty: BigInt(mockChain.length * 2), // difficulty * length
      totalWork: BigInt(mockChain.length * 2),
      utxoMerkleRoot: mockChain[mockChain.length - 1].merkleRoot,
      lastBlockHash: mockChain[mockChain.length - 1].hash,
      branchPoint: 0,
      isActive: true,
      utxoSetHash: 'utxo1',
      timestamp: Date.now(),
      parentBranchId: undefined,
    };

    chainState = {
      activeBranch,
      branches: new Map(),
      orphanUTXOBlocks: [],
    };
  });

  describe('detectUTXOFork', () => {
    it('should detect chain extension for valid block extending active chain', async () => {
      // Create block that extends the last block in active chain
      const lastBlock =
        activeBranch.utxoBlocks[activeBranch.utxoBlocks.length - 1];
      const newBlock = createValidMockBlock({
        index: lastBlock.index + 1,
        previousHash: lastBlock.hash,
        difficulty: 2,
      });

      const result = await forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('extension');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.branch).toBe(activeBranch);
      expect(result.fragmentationRequired).toBeDefined();
    });

    it('should detect fork for block with different parent', async () => {
      // Create block that forks from genesis (first block in chain)
      const genesisBlock = activeBranch.utxoBlocks[0];
      const newBlock = createValidMockBlock({
        index: 1,
        previousHash: genesisBlock.hash,
        difficulty: 2,
        validator: 'fork-validator', // Different validator to ensure different hash
      });

      const result = await forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('fork');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.competingBranch).toBeDefined();
      // Branch point is the index of the forking block (newBlock.index = 1)
      // because findUTXOBranchPoint returns currentBlock.index where
      // currentBlock.previousHash is in main branch
      expect(result.branchPoint).toBe(1);
    });

    it('should detect orphan for block with unknown parent', async () => {
      // Create block with a parent hash that doesn't exist in the chain
      const newBlock = createValidMockBlock({
        index: 5,
        previousHash: 'unknown-parent-hash-that-does-not-exist',
        difficulty: 2,
      });

      const result = await forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('orphan');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.reason).toContain('Parent UTXO block not found');
    });

    it('should throw error for non-UTXO blocks', async () => {
      const nonUTXOBlock = createMockLegacyBlock(2, 'block1');

      await expect(
        forkDetector.detectUTXOFork(nonUTXOBlock, chainState)
      ).rejects.toThrow('Non-UTXO transactions detected');
    });

    it('should analyze LoRa fragmentation requirements', async () => {
      // Create block with multiple transactions to exceed 256 bytes
      const lastBlock =
        activeBranch.utxoBlocks[activeBranch.utxoBlocks.length - 1];
      const transactions = Array.from({ length: 5 }, (_, i) =>
        createValidMockUTXOTransaction({
          id: `large-tx-${i}`,
        })
      );
      const largeBlock = createValidMockBlock({
        index: lastBlock.index + 1,
        previousHash: lastBlock.hash,
        difficulty: 2,
        transactions,
      });

      const result = await forkDetector.detectUTXOFork(largeBlock, chainState);

      expect(result.fragmentationRequired).toBe(true);
    });
  });

  describe('findUTXOBranchPoint', () => {
    it('should find correct branch point for fork', () => {
      // Create a fork that diverges from genesis
      const genesisBlock = activeBranch.utxoBlocks[0];
      const forkBlock = createValidMockBlock({
        index: 1,
        previousHash: genesisBlock.hash,
        difficulty: 2,
        validator: 'fork-validator',
      });

      const branchPoint = forkDetector.findUTXOBranchPoint(
        forkBlock,
        activeBranch
      );

      // Branch point is the index of the forking block itself (1)
      // because algorithm returns currentBlock.index where
      // currentBlock.previousHash is in the main branch
      expect(branchPoint).toBe(1);
    });

    it('should handle deep reorganization within limits', () => {
      // Create deeper active branch using standardized factory
      const deeperChain = createMockBlockChain(5, 2);
      const deeperBranch = {
        ...activeBranch,
        utxoBlocks: deeperChain,
        height: 4,
      };

      // Create fork block that references block at index 1
      const forkBlock = createValidMockBlock({
        index: 2,
        previousHash: deeperChain[1].hash,
        difficulty: 2,
        validator: 'fork-validator',
      });

      const branchPoint = forkDetector.findUTXOBranchPoint(
        forkBlock,
        deeperBranch
      );

      // Branch point is the index of the forking block itself (2)
      expect(branchPoint).toBe(2);
    });
  });

  describe('isUTXOOnlyBlock', () => {
    it('should validate UTXO-only blocks', () => {
      const utxoBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions: [createValidMockUTXOTransaction()],
      });

      const result = forkDetector.isUTXOOnlyBlock(utxoBlock);

      expect(result).toBe(true);
    });

    it('should reject blocks with legacy transactions', () => {
      const legacyBlock = createMockLegacyBlock(1, 'parent');

      const result = forkDetector.isUTXOOnlyBlock(legacyBlock);

      expect(result).toBe(false);
    });

    it('should accept empty blocks', () => {
      const emptyBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions: [],
      });

      const result = forkDetector.isUTXOOnlyBlock(emptyBlock);

      expect(result).toBe(true);
    });
  });

  describe('validateBlockUTXOCompleteness', () => {
    it('should validate complete UTXO transactions', () => {
      const completeBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions: [createValidMockUTXOTransaction()],
      });

      const result = forkDetector.validateBlockUTXOCompleteness(completeBlock);

      expect(result).toBe(true);
    });

    it('should reject incomplete UTXO transactions', () => {
      const incompleteBlock = createMockIncompleteBlock(1, 'parent');

      const result =
        forkDetector.validateBlockUTXOCompleteness(incompleteBlock);

      expect(result).toBe(false);
    });
  });

  describe('estimateLoRaFragmentation', () => {
    it('should detect fragmentation for large blocks', async () => {
      // Create block with multiple transactions to guarantee > 256 bytes
      const transactions = Array.from({ length: 10 }, (_, i) =>
        createValidMockUTXOTransaction({
          id: `large-tx-${i}`,
        })
      );
      const largeBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions,
      });

      const result = await forkDetector.estimateLoRaFragmentation(largeBlock);

      expect(result).toBe(true);
    });

    it('should require fragmentation for blocks over 256 bytes', async () => {
      // Even a "small" block with proper structure is > 256 bytes
      // This is expected behavior - real LoRa transmission requires fragmentation
      const smallBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions: [],
      });

      // Verify the block size is actually > 256 bytes (JSON serialization)
      const blockSize = JSON.stringify(smallBlock).length;
      expect(blockSize).toBeGreaterThan(256);

      const result = await forkDetector.estimateLoRaFragmentation(smallBlock);

      // Should require fragmentation since size > 256 bytes
      expect(result).toBe(true);
    });

    it('should handle compression analysis gracefully', async () => {
      const regularBlock = createValidMockBlock({
        index: 1,
        previousHash: 'parent-hash',
        difficulty: 2,
        transactions: [createValidMockUTXOTransaction()],
      });

      const result = await forkDetector.estimateLoRaFragmentation(regularBlock);

      expect(typeof result).toBe('boolean');
    });
  });

  // Mock helper functions for legacy and incomplete blocks
  // (kept for testing validation edge cases)

  function createMockLegacyBlock(index: number, previousHash: string): Block {
    return {
      index,
      timestamp: Date.now(),
      transactions: [
        {
          id: `legacy-tx-${index}`,
          from: 'legacy-from',
          to: 'legacy-to',
          amount: 50,
          fee: 1,
          timestamp: Date.now(),
          signature: 'legacy-signature',
          nonce: 0,
        },
      ],
      previousHash,
      hash: `${previousHash}-legacy-${index}`,
      merkleRoot: `legacy-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockIncompleteBlock(
    index: number,
    previousHash: string
  ): Block {
    return {
      index,
      timestamp: Date.now(),
      transactions: [
        {
          id: `incomplete-tx-${index}`,
          inputs: [], // Missing required fields
          outputs: [], // Empty outputs - incomplete
          lockTime: 0,
          timestamp: Date.now(),
          // Missing fee
        } as any,
      ],
      previousHash,
      hash: `${previousHash}-incomplete-${index}`,
      merkleRoot: `incomplete-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }
});
