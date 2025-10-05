import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOChainSelector } from '../../src/utxo-chain-selector.js';
import { DifficultyManager } from '../../src/difficulty.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import type {
  Block,
  UTXOChainBranch,
  UTXOChainConfig,
  UTXOTransaction,
} from '../../src/types.js';

describe('UTXOChainSelector (NO BACKWARDS COMPATIBILITY)', () => {
  let chainSelector: UTXOChainSelector;
  let difficultyManager: DifficultyManager;
  let compressionManager: UTXOCompressionManager;
  let config: UTXOChainConfig;

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

    difficultyManager = new DifficultyManager({
      targetBlockTime: 300,
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      minDifficulty: 1,
      maxDifficulty: 1000000,
    });

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

    chainSelector = new UTXOChainSelector(
      config,
      difficultyManager,
      compressionManager
    );
  });

  describe('selectBestUTXOChain', () => {
    it('should throw error for empty branch map', async () => {
      const branches = new Map<string, UTXOChainBranch>();

      await expect(chainSelector.selectBestUTXOChain(branches)).rejects.toThrow(
        'No branches available for selection'
      );
    });

    it('should select branch with highest cumulative difficulty', async () => {
      const branch1 = createMockBranch('branch1', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 2),
      ]);

      const branch2 = createMockBranch('branch2', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 4), // Higher difficulty
      ]);

      const branches = new Map([
        ['branch1', branch1],
        ['branch2', branch2],
      ]);

      const result = await chainSelector.selectBestUTXOChain(branches);

      expect(result.id).toBe('branch2');
      expect(result.cumulativeDifficulty).toBe(6n); // 2 + 4
    });

    it('should use tie-breaker rules for equal difficulty', async () => {
      const branch1 = createMockBranch('branch1', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 2),
      ]);
      branch1.utxoSetHash = 'aaaa';

      const branch2 = createMockBranch('branch2', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 2),
      ]);
      branch2.utxoSetHash = 'bbbb';

      const branches = new Map([
        ['branch1', branch1],
        ['branch2', branch2],
      ]);

      const result = await chainSelector.selectBestUTXOChain(branches);

      // Should select branch1 due to lexicographically smaller UTXO set hash
      expect(result.id).toBe('branch1');
    });

    it('should prefer longer chains when difficulty is equal', async () => {
      const shortBranch = createMockBranch('short', [
        createMockBlock(0, 'genesis', 4),
      ]);

      const longBranch = createMockBranch('long', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 2), // Same total difficulty but longer
      ]);

      const branches = new Map([
        ['short', shortBranch],
        ['long', longBranch],
      ]);

      const result = await chainSelector.selectBestUTXOChain(branches);

      expect(result.id).toBe('long');
      expect(result.height).toBeGreaterThan(shortBranch.height);
    });

    it('should reject invalid UTXO branches', async () => {
      const validBranch = createMockBranch('valid', [
        createMockBlock(0, 'genesis', 2),
      ]);

      const invalidBranch = createMockInvalidBranch('invalid');

      const branches = new Map([
        ['valid', validBranch],
        ['invalid', invalidBranch],
      ]);

      const result = await chainSelector.selectBestUTXOChain(branches);

      expect(result.id).toBe('valid');
    });

    it('should throw error when no valid UTXO branches exist', async () => {
      const invalidBranch = createMockInvalidBranch('invalid');
      const branches = new Map([['invalid', invalidBranch]]);

      await expect(chainSelector.selectBestUTXOChain(branches)).rejects.toThrow(
        'No valid UTXO branches available - legacy branches not supported'
      );
    });
  });

  describe('compareUTXOBranches', () => {
    it('should return 1 when branchA has higher difficulty', () => {
      const branchA = createMockBranch('A', [createMockBlock(0, 'genesis', 4)]);
      const branchB = createMockBranch('B', [createMockBlock(0, 'genesis', 2)]);

      const result = chainSelector.compareUTXOBranches(branchA, branchB);

      expect(result).toBe(1);
    });

    it('should return -1 when branchB has higher difficulty', () => {
      const branchA = createMockBranch('A', [createMockBlock(0, 'genesis', 2)]);
      const branchB = createMockBranch('B', [createMockBlock(0, 'genesis', 4)]);

      const result = chainSelector.compareUTXOBranches(branchA, branchB);

      expect(result).toBe(-1);
    });

    it('should use height as tie-breaker', () => {
      const shortBranch = createMockBranch('short', [
        createMockBlock(0, 'genesis', 4),
      ]);
      const longBranch = createMockBranch('long', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 2),
      ]);

      const result = chainSelector.compareUTXOBranches(longBranch, shortBranch);

      expect(result).toBe(1); // longBranch wins due to higher height
    });

    it('should use UTXO set hash as tie-breaker', () => {
      const branchA = createMockBranch('A', [createMockBlock(0, 'genesis', 2)]);
      branchA.utxoSetHash = 'aaaa';

      const branchB = createMockBranch('B', [createMockBlock(0, 'genesis', 2)]);
      branchB.utxoSetHash = 'bbbb';

      const result = chainSelector.compareUTXOBranches(branchA, branchB);

      expect(result).toBeLessThan(0); // branchA wins due to smaller hash
    });

    it('should use timestamp as final tie-breaker', () => {
      const olderBranch = createMockBranch('older', [
        createMockBlock(0, 'genesis', 2),
      ]);
      olderBranch.timestamp = 1000;
      olderBranch.utxoSetHash = 'same';
      olderBranch.lastBlockHash = 'same';

      const newerBranch = createMockBranch('newer', [
        createMockBlock(0, 'genesis', 2),
      ]);
      newerBranch.timestamp = 2000;
      newerBranch.utxoSetHash = 'same';
      newerBranch.lastBlockHash = 'same';

      const result = chainSelector.compareUTXOBranches(
        olderBranch,
        newerBranch
      );

      expect(result).toBeLessThan(0); // olderBranch wins due to earlier timestamp
    });
  });

  describe('calculateCumulativeDifficulty', () => {
    it('should calculate correct cumulative difficulty', () => {
      const blocks = [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 4),
        createMockBlock(2, 'block1', 6),
      ];

      const result = chainSelector.calculateCumulativeDifficulty(blocks);

      expect(result).toBe(12n); // 2 + 4 + 6
    });

    it('should return 0n for empty block array', () => {
      const result = chainSelector.calculateCumulativeDifficulty([]);

      expect(result).toBe(0n);
    });

    it('should cache results for performance', () => {
      const blocks = [createMockBlock(0, 'genesis', 2)];

      // First call
      const result1 = chainSelector.calculateCumulativeDifficulty(blocks);
      // Second call should use cache
      const result2 = chainSelector.calculateCumulativeDifficulty(blocks);

      expect(result1).toBe(result2);
      expect(result1).toBe(2n);
    });

    it('should validate difficulty bounds', () => {
      const blocks = [
        createMockBlock(0, 'genesis', -1), // Invalid difficulty
        createMockBlock(1, 'block0', 4),
      ];

      const result = chainSelector.calculateCumulativeDifficulty(blocks);

      expect(result).toBe(5n); // Invalid difficulty -1 is corrected to 1, so 1 + 4 = 5
    });
  });

  describe('isValidUTXOBranch', () => {
    it('should validate correct UTXO branch', async () => {
      const validBranch = createMockBranch('valid', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'block0', 4),
      ]);

      const result = await chainSelector.isValidUTXOBranch(validBranch);

      expect(result).toBe(true);
    });

    it('should reject branch with invalid chain continuity', async () => {
      const invalidBranch = createMockBranch('invalid', [
        createMockBlock(0, 'genesis', 2),
        createMockBlock(1, 'wrong-parent', 4), // Wrong previous hash
      ]);

      const result = await chainSelector.isValidUTXOBranch(invalidBranch);

      expect(result).toBe(false);
    });

    it('should cache validation results', async () => {
      const branch = createMockBranch('test', [
        createMockBlock(0, 'genesis', 2),
      ]);

      // First validation
      const result1 = await chainSelector.isValidUTXOBranch(branch);
      // Second validation should use cache
      const result2 = await chainSelector.isValidUTXOBranch(branch);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const corruptBranch = {
        ...createMockBranch('corrupt', []),
        utxoBlocks: null as any, // Corrupt data
      };

      const result = await chainSelector.isValidUTXOBranch(corruptBranch);

      expect(result).toBe(false);
    });
  });

  describe('meetsLoRaConstraints', () => {
    it('should accept blocks within LoRa constraints', async () => {
      const smallBlocks = [createMockSmallBlock(0, 'genesis')];
      const branch = createMockBranch('small', smallBlocks);

      const result = await chainSelector.meetsLoRaConstraints(branch);

      expect(result).toBe(true);
    });

    it('should reject blocks exceeding LoRa constraints', async () => {
      const largeBlocks = [createMockLargeBlock(0, 'genesis')];
      const branch = createMockBranch('large', largeBlocks);

      const result = await chainSelector.meetsLoRaConstraints(branch);

      expect(result).toBe(false);
    });

    it('should handle compression analysis', async () => {
      const compressibleBlocks = [createMockCompressibleBlock(0, 'genesis')];
      const branch = createMockBranch('compressible', compressibleBlocks);

      const result = await chainSelector.meetsLoRaConstraints(branch);

      expect(typeof result).toBe('boolean');
    });
  });

  describe('cache management', () => {
    it('should clear caches when requested', () => {
      const blocks = [createMockBlock(0, 'genesis', 2)];

      // Populate cache
      chainSelector.calculateCumulativeDifficulty(blocks);

      chainSelector.clearCaches();

      const stats = chainSelector.getCacheStats();
      expect(stats.difficultyCacheSize).toBe(0);
      expect(stats.validationCacheSize).toBe(0);
    });

    it('should provide cache statistics', () => {
      const stats = chainSelector.getCacheStats();

      expect(stats).toHaveProperty('difficultyCacheSize');
      expect(stats).toHaveProperty('validationCacheSize');
      expect(typeof stats.difficultyCacheSize).toBe('number');
      expect(typeof stats.validationCacheSize).toBe('number');
    });
  });

  // Mock helper functions
  function createMockBranch(id: string, blocks: Block[]): UTXOChainBranch {
    const lastBlock = blocks[blocks.length - 1];
    // Use the actual chain selector's method to calculate cumulative difficulty
    // to ensure consistency with validation
    const cumulativeDifficulty =
      chainSelector.calculateCumulativeDifficulty(blocks);

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
      transactions: [utxoTransaction as any],
      previousHash,
      hash: `block${index}`,
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

  function createMockSmallBlock(index: number, _previousHash: string): Block {
    return {
      index,
      timestamp: 1000000, // Much shorter timestamp
      transactions: [], // Empty transactions array
      previousHash: '', // Empty previousHash
      hash: `${index}`, // Minimal hash
      merkleRoot: '', // Empty merkle root
      nonce: 1,
      difficulty: 1,
      validator: '', // Empty validator
    };
  }

  function createMockLargeBlock(index: number, previousHash: string): Block {
    // Create a block that would exceed LoRa 256-byte limit
    const largeData = 'x'.repeat(500); // Large payload

    return {
      index,
      timestamp: Date.now(),
      transactions: [
        {
          id: `large-tx-${index}-${largeData}`,
          inputs: [],
          outputs: [
            {
              value: 50,
              lockingScript: `large-address-${largeData}`,
              outputIndex: 0,
            },
          ],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 0,
        } as any,
      ],
      previousHash,
      hash: `large${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }

  function createMockCompressibleBlock(
    index: number,
    previousHash: string
  ): Block {
    // Create a block with repetitive data that compresses well
    const repetitiveData = 'abcabc'.repeat(50);

    return {
      index,
      timestamp: Date.now(),
      transactions: [
        {
          id: `compress-tx-${index}`,
          inputs: [],
          outputs: [
            {
              value: 50,
              lockingScript: repetitiveData,
              outputIndex: 0,
            },
          ],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 0,
        } as any,
      ],
      previousHash,
      hash: `compress${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'test-validator',
    };
  }
});
