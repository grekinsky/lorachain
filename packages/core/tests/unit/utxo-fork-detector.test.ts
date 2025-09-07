import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOForkDetector } from '../../src/utxo-fork-detector.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { UTXOManager } from '../../src/utxo.js';
import type {
  Block,
  UTXOTransaction,
  UTXOChainState,
  UTXOChainBranch,
  UTXOChainConfig,
} from '../../src/types.js';

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
    reliableDelivery = new UTXOReliableDeliveryManager(
      config,
      compressionManager
    );
    utxoManager = new UTXOManager();

    forkDetector = new UTXOForkDetector(
      config,
      compressionManager,
      reliableDelivery,
      utxoManager
    );

    // Create mock active branch
    activeBranch = {
      id: 'main',
      utxoBlocks: [createMockBlock(0, 'genesis'), createMockBlock(1, 'block1')],
      height: 1,
      cumulativeDifficulty: 4n,
      totalWork: 4n,
      utxoMerkleRoot: 'merkle1',
      lastBlockHash: 'block1',
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
    it('should detect chain extension for valid block extending active chain', () => {
      const newBlock = createMockBlock(2, 'block1'); // extends block1

      const result = forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('extension');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.branch).toBe(activeBranch);
      expect(result.fragmentationRequired).toBeDefined();
    });

    it('should detect fork for block with different parent', () => {
      const newBlock = createMockBlock(2, 'genesis'); // forks from genesis

      const result = forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('fork');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.competingBranch).toBeDefined();
      expect(result.branchPoint).toBe(0);
    });

    it('should detect orphan for block with unknown parent', () => {
      const newBlock = createMockBlock(5, 'unknown-parent');

      const result = forkDetector.detectUTXOFork(newBlock, chainState);

      expect(result.type).toBe('orphan');
      expect(result.utxoBlock).toBe(newBlock);
      expect(result.reason).toContain('Parent UTXO block not found');
    });

    it('should throw error for non-UTXO blocks', () => {
      const nonUTXOBlock = createMockLegacyBlock(2, 'block1');

      expect(() => {
        forkDetector.detectUTXOFork(nonUTXOBlock, chainState);
      }).toThrow('Non-UTXO transactions detected');
    });

    it('should analyze LoRa fragmentation requirements', () => {
      const largeBlock = createMockLargeBlock(2, 'block1');

      const result = forkDetector.detectUTXOFork(largeBlock, chainState);

      expect(result.fragmentationRequired).toBe(true);
    });
  });

  describe('findUTXOBranchPoint', () => {
    it('should find correct branch point for fork', () => {
      const forkBlock = createMockBlock(2, 'genesis'); // forks from genesis

      const branchPoint = forkDetector.findUTXOBranchPoint(
        forkBlock,
        activeBranch
      );

      expect(branchPoint).toBe(0); // forks from genesis (height 0)
    });

    it('should handle deep reorganization within limits', () => {
      // Create deeper active branch
      const deeperBranch = {
        ...activeBranch,
        utxoBlocks: [
          createMockBlock(0, 'genesis'),
          createMockBlock(1, 'genesis'),
          createMockBlock(2, 'block1'),
          createMockBlock(3, 'block2'),
          createMockBlock(4, 'block3'),
        ],
        height: 4,
      };

      const forkBlock = createMockBlock(2, 'block1'); // forks from block1

      const branchPoint = forkDetector.findUTXOBranchPoint(
        forkBlock,
        deeperBranch
      );

      expect(branchPoint).toBe(1); // forks from block1 (height 1)
    });
  });

  describe('isUTXOOnlyBlock', () => {
    it('should validate UTXO-only blocks', () => {
      const utxoBlock = createMockBlock(1, 'parent');

      const result = forkDetector.isUTXOOnlyBlock(utxoBlock);

      expect(result).toBe(true);
    });

    it('should reject blocks with legacy transactions', () => {
      const legacyBlock = createMockLegacyBlock(1, 'parent');

      const result = forkDetector.isUTXOOnlyBlock(legacyBlock);

      expect(result).toBe(false);
    });

    it('should accept empty blocks', () => {
      const emptyBlock = createMockEmptyBlock(1, 'parent');

      const result = forkDetector.isUTXOOnlyBlock(emptyBlock);

      expect(result).toBe(true);
    });
  });

  describe('validateBlockUTXOCompleteness', () => {
    it('should validate complete UTXO transactions', () => {
      const completeBlock = createMockBlock(1, 'parent');

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
    it('should detect fragmentation for large blocks', () => {
      const largeBlock = createMockLargeBlock(1, 'parent');

      const result = forkDetector.estimateLoRaFragmentation(largeBlock);

      expect(result).toBe(true);
    });

    it('should not require fragmentation for small blocks', () => {
      const smallBlock = createMockSmallBlock(1, 'parent');

      const result = forkDetector.estimateLoRaFragmentation(smallBlock);

      expect(result).toBe(false);
    });

    it('should handle compression analysis gracefully', () => {
      const regularBlock = createMockBlock(1, 'parent');

      const result = forkDetector.estimateLoRaFragmentation(regularBlock);

      expect(typeof result).toBe('boolean');
    });
  });

  // Mock helper functions
  function createMockBlock(index: number, previousHash: string): Block {
    const utxoTransaction: UTXOTransaction = {
      id: `tx-${index}`,
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
          lockingScript: 'address',
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
      transactions: [utxoTransaction as any], // Type assertion for mock
      previousHash,
      hash: `block${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

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
      hash: `legacy-block${index}`,
      merkleRoot: `legacy-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockEmptyBlock(index: number, previousHash: string): Block {
    return {
      index,
      timestamp: Date.now(),
      transactions: [],
      previousHash,
      hash: `empty-block${index}`,
      merkleRoot: `empty-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockLargeBlock(index: number, previousHash: string): Block {
    // Create a block that would exceed LoRa 256-byte limit
    const transactions = Array.from({ length: 10 }, (_, i) => ({
      id: `large-tx-${index}-${i}`,
      inputs: [
        {
          previousTxId: `prev-large-tx-${index - 1}-${i}`,
          outputIndex: 0,
          unlockingScript: 'very-long-signature-that-exceeds-normal-limits',
        },
      ],
      outputs: [
        {
          value: 50,
          lockingScript: 'very-long-address-that-exceeds-normal-limits',
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    }));

    return {
      index,
      timestamp: Date.now(),
      transactions: transactions as any,
      previousHash,
      hash: `large-block${index}`,
      merkleRoot: `large-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockSmallBlock(index: number, previousHash: string): Block {
    // Create a minimal block that fits in LoRa constraints
    return {
      index,
      timestamp: Date.now(),
      transactions: [
        {
          id: `small-tx-${index}`,
          inputs: [],
          outputs: [
            {
              value: 50,
              lockingScript: 'addr',
              outputIndex: 0,
            },
          ],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 0,
        } as any,
      ],
      previousHash,
      hash: `small-block${index}`,
      merkleRoot: `small-merkle${index}`,
      nonce: 123,
      difficulty: 2,
      validator: 'test',
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
      hash: `incomplete-block${index}`,
      merkleRoot: `incomplete-merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }
});
