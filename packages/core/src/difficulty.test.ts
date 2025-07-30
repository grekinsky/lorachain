import { describe, it, expect } from 'vitest';
import { DifficultyManager, type DifficultyConfig } from './difficulty.js';
import { BlockManager } from './block.js';
import type { Block } from './types.js';

describe('DifficultyManager', () => {
  const defaultConfig: DifficultyConfig = {
    targetBlockTime: 300, // 5 minutes
    adjustmentPeriod: 10,
    maxDifficultyRatio: 4,
    minDifficulty: 1,
    maxDifficulty: Math.pow(2, 32),
  };

  const createMockBlock = (
    index: number,
    timestamp: number,
    difficulty: number = 2
  ): Block => {
    const block = BlockManager.createGenesisBlock(difficulty);
    return {
      ...block,
      index,
      timestamp,
      difficulty,
    };
  };

  describe('calculateNextDifficulty', () => {
    it('should calculate correct difficulty for blocks mined too fast', () => {
      const currentDifficulty = 100;

      // Create blocks that are mined twice as fast as target (150s instead of 300s)
      const blocks: Block[] = [];
      let timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, currentDifficulty));
        timestamp += 150 * 1000; // 150 seconds between blocks
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should approximately double (but limited by maxRatio)
      expect(newDifficulty).toBe(200); // 100 * 2 = 200
    });

    it('should calculate correct difficulty for blocks mined too slow', () => {
      const currentDifficulty = 100;

      // Create blocks that are mined twice as slow as target (600s instead of 300s)
      const blocks: Block[] = [];
      let timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, currentDifficulty));
        timestamp += 600 * 1000; // 600 seconds between blocks
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should approximately halve
      expect(newDifficulty).toBe(50); // 100 / 2 = 50
    });

    it('should enforce maximum difficulty increase of 4x', () => {
      const currentDifficulty = 100;

      // Create blocks that are mined 10x faster than target
      const blocks: Block[] = [];
      let timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, currentDifficulty));
        timestamp += 30 * 1000; // 30 seconds between blocks (10x faster)
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should be capped at 4x increase
      expect(newDifficulty).toBe(400); // 100 * 4 = 400
    });

    it('should enforce maximum difficulty decrease of 1/4x', () => {
      const currentDifficulty = 100;

      // Create blocks that are mined 10x slower than target
      const blocks: Block[] = [];
      let timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, currentDifficulty));
        timestamp += 3000 * 1000; // 3000 seconds between blocks (10x slower)
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should be capped at 1/4x decrease
      expect(newDifficulty).toBe(25); // 100 / 4 = 25
    });

    it('should handle edge case with single block', () => {
      const currentDifficulty = 100;
      const blocks = [createMockBlock(0, Date.now(), currentDifficulty)];

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Should return current difficulty when not enough blocks
      expect(newDifficulty).toBe(currentDifficulty);
    });

    it('should handle edge case with no blocks', () => {
      const currentDifficulty = 100;
      const blocks: Block[] = [];

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Should return current difficulty when no blocks
      expect(newDifficulty).toBe(currentDifficulty);
    });

    it('should enforce minimum difficulty of 1', () => {
      const currentDifficulty = 2;

      // Create blocks that are mined very slowly
      const blocks: Block[] = [];
      let timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, currentDifficulty));
        timestamp += 10000 * 1000; // Very slow blocks
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should not go below 1
      expect(newDifficulty).toBeGreaterThanOrEqual(1);
    });

    it('should work exclusively with UTXO transactions', () => {
      // This test verifies that difficulty calculation is independent of transaction type
      // Since difficulty is based on block times, not transaction content
      const currentDifficulty = 100;
      const blocks: Block[] = [];
      let timestamp = Date.now();

      for (let i = 0; i < 10; i++) {
        const block = createMockBlock(i, timestamp, currentDifficulty);
        // Add mock UTXO-style transactions (the actual transaction type doesn't matter for difficulty)
        block.transactions = [
          {
            id: `utxo-tx-${i}`,
            from: 'utxo-based',
            to: 'address',
            amount: 10,
            fee: 1,
            timestamp,
            signature: 'utxo-signed',
            nonce: 0,
          },
        ];
        blocks.push(block);
        timestamp += 300 * 1000; // Target block time
      }

      const newDifficulty = DifficultyManager.calculateNextDifficulty(
        currentDifficulty,
        blocks,
        defaultConfig
      );

      // Difficulty should remain stable with target block times
      expect(newDifficulty).toBe(currentDifficulty);
    });
  });

  describe('calculateNetworkHashrate', () => {
    it('should calculate network hashrate correctly', () => {
      const blocks: Block[] = [];
      let timestamp = Date.now();
      const difficulty = 10;

      // Create 10 blocks with 60 second intervals and difficulty 10
      for (let i = 0; i < 10; i++) {
        blocks.push(createMockBlock(i, timestamp, difficulty));
        timestamp += 60 * 1000; // 60 seconds between blocks
      }

      const hashrate = DifficultyManager.calculateNetworkHashrate(blocks);

      // Expected hashrate = (difficulty * 2^32) / average_block_time
      // average_block_time = 60 seconds
      const expectedHashrate = (difficulty * Math.pow(2, 32)) / 60;

      expect(hashrate).toBeCloseTo(expectedHashrate, 2);
    });

    it('should handle blocks without difficulty field', () => {
      const blocks: Block[] = [];
      let timestamp = Date.now();

      // Create blocks without difficulty field (legacy blocks)
      for (let i = 0; i < 10; i++) {
        const block = createMockBlock(i, timestamp);
        // @ts-ignore - Simulating legacy block without difficulty
        delete block.difficulty;
        blocks.push(block);
        timestamp += 60 * 1000;
      }

      const hashrate = DifficultyManager.calculateNetworkHashrate(blocks);

      // Should return 0 when no blocks have difficulty
      expect(hashrate).toBe(0);
    });

    it('should use custom sample size', () => {
      const blocks: Block[] = [];
      let timestamp = Date.now();

      // Create 20 blocks
      for (let i = 0; i < 20; i++) {
        blocks.push(createMockBlock(i, timestamp, 10));
        timestamp += 60 * 1000;
      }

      const hashrate5 = DifficultyManager.calculateNetworkHashrate(blocks, 5);
      const hashrate10 = DifficultyManager.calculateNetworkHashrate(blocks, 10);

      // Both should be approximately the same since block time is constant
      expect(hashrate5).toBeCloseTo(hashrate10, 2);
    });

    it('should return 0 for single block', () => {
      const blocks = [createMockBlock(0, Date.now(), 10)];
      const hashrate = DifficultyManager.calculateNetworkHashrate(blocks);
      expect(hashrate).toBe(0);
    });

    it('should return 0 for no blocks', () => {
      const blocks: Block[] = [];
      const hashrate = DifficultyManager.calculateNetworkHashrate(blocks);
      expect(hashrate).toBe(0);
    });
  });

  describe('shouldAdjustDifficulty', () => {
    it('should return true at adjustment intervals', () => {
      expect(DifficultyManager.shouldAdjustDifficulty(10, 10)).toBe(true);
      expect(DifficultyManager.shouldAdjustDifficulty(20, 10)).toBe(true);
      expect(DifficultyManager.shouldAdjustDifficulty(100, 10)).toBe(true);
    });

    it('should return false between adjustment intervals', () => {
      expect(DifficultyManager.shouldAdjustDifficulty(5, 10)).toBe(false);
      expect(DifficultyManager.shouldAdjustDifficulty(15, 10)).toBe(false);
      expect(DifficultyManager.shouldAdjustDifficulty(99, 10)).toBe(false);
    });

    it('should return false for genesis block', () => {
      expect(DifficultyManager.shouldAdjustDifficulty(0, 10)).toBe(false);
    });
  });

  describe('validateDifficultyBounds', () => {
    it('should enforce maximum increase ratio', () => {
      const result = DifficultyManager.validateDifficultyBounds(
        500, // new difficulty
        100, // current difficulty
        4, // max ratio
        1, // min difficulty
        1000 // max difficulty
      );
      expect(result).toBe(400); // 100 * 4
    });

    it('should enforce maximum decrease ratio', () => {
      const result = DifficultyManager.validateDifficultyBounds(
        10, // new difficulty
        100, // current difficulty
        4, // max ratio
        1, // min difficulty
        1000 // max difficulty
      );
      expect(result).toBe(25); // 100 / 4
    });

    it('should enforce minimum difficulty', () => {
      const result = DifficultyManager.validateDifficultyBounds(
        0.5, // new difficulty
        100, // current difficulty
        4, // max ratio
        1, // min difficulty
        1000 // max difficulty
      );
      expect(result).toBe(1); // min difficulty
    });

    it('should enforce maximum difficulty', () => {
      const result = DifficultyManager.validateDifficultyBounds(
        2000, // new difficulty
        100, // current difficulty
        100, // max ratio (high to test max bound)
        1, // min difficulty
        1000 // max difficulty
      );
      expect(result).toBe(1000); // max difficulty
    });
  });

  describe('validateDifficultyTransition', () => {
    it('should validate correct difficulty transition', () => {
      const result = DifficultyManager.validateDifficultyTransition(
        100, // old difficulty
        200, // new difficulty
        defaultConfig
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject difficulty below minimum', () => {
      const result = DifficultyManager.validateDifficultyTransition(
        100, // old difficulty
        0, // new difficulty
        defaultConfig
      );
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('New difficulty 0 is below minimum 1');
    });

    it('should reject difficulty above maximum', () => {
      const config = { ...defaultConfig, maxDifficulty: 1000 };
      const result = DifficultyManager.validateDifficultyTransition(
        100, // old difficulty
        2000, // new difficulty
        config
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('above maximum');
    });

    it('should reject excessive difficulty increase', () => {
      const result = DifficultyManager.validateDifficultyTransition(
        100, // old difficulty
        500, // new difficulty (5x increase)
        defaultConfig
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('increase ratio');
    });

    it('should reject excessive difficulty decrease', () => {
      const result = DifficultyManager.validateDifficultyTransition(
        100, // old difficulty
        10, // new difficulty (10x decrease)
        defaultConfig
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('decrease ratio');
    });
  });

  describe('validateBlockTimestamp', () => {
    it('should accept valid timestamp', () => {
      const block = createMockBlock(11, Date.now());
      const previousBlocks: Block[] = [];

      // Create 11 previous blocks
      let timestamp = Date.now() - 11 * 300 * 1000;
      for (let i = 0; i < 11; i++) {
        previousBlocks.push(createMockBlock(i, timestamp));
        timestamp += 300 * 1000;
      }

      const result = DifficultyManager.validateBlockTimestamp(
        block,
        previousBlocks
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject timestamp too far in future', () => {
      const futureTime = Date.now() + 3 * 60 * 60 * 1000; // 3 hours in future
      const block = createMockBlock(1, futureTime);
      const previousBlocks = [createMockBlock(0, Date.now())];

      const result = DifficultyManager.validateBlockTimestamp(
        block,
        previousBlocks
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too far in the future');
    });

    it('should reject timestamp before median of last 11 blocks', () => {
      const previousBlocks: Block[] = [];
      let timestamp = Date.now() - 11 * 300 * 1000;

      // Create 11 previous blocks
      for (let i = 0; i < 11; i++) {
        previousBlocks.push(createMockBlock(i, timestamp));
        timestamp += 300 * 1000;
      }

      // Create new block with timestamp before median
      const medianTimestamp = previousBlocks[5].timestamp;
      const block = createMockBlock(11, medianTimestamp - 1000);

      const result = DifficultyManager.validateBlockTimestamp(
        block,
        previousBlocks
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('greater than median');
    });

    it('should handle early blocks without 11 block history', () => {
      const previousBlocks = [createMockBlock(0, Date.now() - 1000)];
      const block = createMockBlock(1, Date.now());

      const result = DifficultyManager.validateBlockTimestamp(
        block,
        previousBlocks
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject block with timestamp before previous block', () => {
      const previousTime = Date.now();
      const previousBlocks = [createMockBlock(0, previousTime)];
      const block = createMockBlock(1, previousTime - 1000);

      const result = DifficultyManager.validateBlockTimestamp(
        block,
        previousBlocks
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('greater than previous block');
    });
  });

  describe('DifficultyManager instance methods', () => {
    it('should initialize with default config', () => {
      const manager = new DifficultyManager();
      const config = manager.getConfig();

      expect(config.targetBlockTime).toBe(300);
      expect(config.adjustmentPeriod).toBe(10);
      expect(config.maxDifficultyRatio).toBe(4);
      expect(config.minDifficulty).toBe(1);
      expect(config.maxDifficulty).toBe(Math.pow(2, 32));
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<DifficultyConfig> = {
        targetBlockTime: 600,
        adjustmentPeriod: 20,
        maxDifficultyRatio: 2,
      };

      const manager = new DifficultyManager(customConfig);
      const config = manager.getConfig();

      expect(config.targetBlockTime).toBe(600);
      expect(config.adjustmentPeriod).toBe(20);
      expect(config.maxDifficultyRatio).toBe(2);
    });

    it('should calculate difficulty state correctly', () => {
      const manager = new DifficultyManager();
      const blocks: Block[] = [];
      let timestamp = Date.now() - 10 * 300 * 1000;

      // Create 20 blocks
      for (let i = 0; i < 20; i++) {
        blocks.push(createMockBlock(i, timestamp, 100));
        timestamp += 300 * 1000;
      }

      const state = manager.getDifficultyState(blocks, 100);

      expect(state.currentDifficulty).toBe(100);
      expect(state.targetBlockTime).toBe(300);
      expect(state.adjustmentHeight).toBe(30); // Next adjustment at block 30
      expect(state.estimatedHashrate).toBeGreaterThan(0);
      expect(state.lastAdjustmentTime).toBeGreaterThan(0);
    });

    it('should check adjustment correctly', () => {
      const manager = new DifficultyManager();

      expect(manager.shouldAdjustDifficulty(10)).toBe(true);
      expect(manager.shouldAdjustDifficulty(11)).toBe(false);
      expect(manager.shouldAdjustDifficulty(20)).toBe(true);
    });

    it('should reject blocks without difficulty field', () => {
      const block = createMockBlock(1, Date.now());
      // @ts-ignore - Simulating block without difficulty
      delete block.difficulty;

      const validation = BlockManager.validateBlock(block, null);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Block must have a valid difficulty field'
      );
    });
  });
});
