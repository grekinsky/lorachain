import type { Block, ValidationResult } from './types.js';

export interface DifficultyConfig {
  targetBlockTime: number; // seconds
  adjustmentPeriod: number; // blocks
  maxDifficultyRatio: number; // maximum change ratio
  minDifficulty: number; // minimum allowed difficulty
  maxDifficulty: number; // maximum allowed difficulty
}

export interface DifficultyState {
  currentDifficulty: number;
  nextDifficulty: number;
  adjustmentHeight: number;
  estimatedHashrate: number;
  targetBlockTime: number;
  lastAdjustmentTime: number;
}

export class DifficultyManager {
  private targetBlockTime: number;
  private adjustmentPeriod: number;
  private maxDifficultyRatio: number;
  private minDifficulty: number;
  private maxDifficulty: number;

  constructor(config?: Partial<DifficultyConfig>) {
    this.targetBlockTime = config?.targetBlockTime || 300; // 5 minutes
    this.adjustmentPeriod = config?.adjustmentPeriod || 10; // 10 blocks
    this.maxDifficultyRatio = config?.maxDifficultyRatio || 4; // 4x max change
    this.minDifficulty = config?.minDifficulty || 1;
    this.maxDifficulty = config?.maxDifficulty || Math.pow(2, 32);
  }

  /**
   * Calculate the next difficulty based on recent block times
   * Uses Bitcoin-style difficulty adjustment algorithm
   */
  static calculateNextDifficulty(
    currentDifficulty: number,
    blocks: Block[],
    config: DifficultyConfig
  ): number {
    if (blocks.length < 2) {
      return currentDifficulty;
    }

    // Get the blocks from the current adjustment period
    const adjustmentBlocks = blocks.slice(-config.adjustmentPeriod);
    if (adjustmentBlocks.length < 2) {
      return currentDifficulty;
    }

    // Calculate actual timespan
    const firstBlock = adjustmentBlocks[0];
    const lastBlock = adjustmentBlocks[adjustmentBlocks.length - 1];
    const actualTimespan = (lastBlock.timestamp - firstBlock.timestamp) / 1000; // Convert to seconds

    // Calculate target timespan
    const targetTimespan =
      config.targetBlockTime * (adjustmentBlocks.length - 1);

    // Calculate new difficulty
    let newDifficulty = currentDifficulty * (targetTimespan / actualTimespan);

    // Apply bounds
    newDifficulty = this.validateDifficultyBounds(
      newDifficulty,
      currentDifficulty,
      config.maxDifficultyRatio,
      config.minDifficulty,
      config.maxDifficulty
    );

    return Math.floor(newDifficulty);
  }

  /**
   * Calculate estimated network hashrate from recent blocks
   */
  static calculateNetworkHashrate(
    blocks: Block[],
    sampleSize: number = 10
  ): number {
    if (blocks.length < 2) {
      return 0;
    }

    // Get sample blocks
    const sampleBlocks = blocks.slice(-Math.min(sampleSize, blocks.length));
    if (sampleBlocks.length < 2) {
      return 0;
    }

    // Calculate average difficulty
    let totalDifficulty = 0;
    let count = 0;
    for (const block of sampleBlocks) {
      if (block.difficulty !== undefined) {
        totalDifficulty += block.difficulty;
        count++;
      }
    }

    if (count === 0) {
      return 0;
    }

    const averageDifficulty = totalDifficulty / count;

    // Calculate average block time
    const firstBlock = sampleBlocks[0];
    const lastBlock = sampleBlocks[sampleBlocks.length - 1];
    const totalTime = (lastBlock.timestamp - firstBlock.timestamp) / 1000; // seconds
    const averageBlockTime = totalTime / (sampleBlocks.length - 1);

    if (averageBlockTime <= 0) {
      return 0;
    }

    // Calculate hashrate: (difficulty * 2^32) / block_time
    const hashrate = (averageDifficulty * Math.pow(2, 32)) / averageBlockTime;

    return hashrate;
  }

  /**
   * Check if difficulty should be adjusted at given block height
   */
  static shouldAdjustDifficulty(
    blockHeight: number,
    adjustmentPeriod: number
  ): boolean {
    return blockHeight > 0 && blockHeight % adjustmentPeriod === 0;
  }

  /**
   * Validate and apply difficulty bounds
   */
  static validateDifficultyBounds(
    newDifficulty: number,
    currentDifficulty: number,
    maxRatio: number,
    minDifficulty: number,
    maxDifficulty: number
  ): number {
    // Apply absolute bounds first
    if (newDifficulty < minDifficulty) {
      newDifficulty = minDifficulty;
    } else if (newDifficulty > maxDifficulty) {
      newDifficulty = maxDifficulty;
    }

    // Apply ratio bounds
    const maxIncrease = currentDifficulty * maxRatio;
    const maxDecrease = currentDifficulty / maxRatio;

    if (newDifficulty > maxIncrease) {
      newDifficulty = maxIncrease;
    } else if (newDifficulty < maxDecrease && newDifficulty > minDifficulty) {
      // Only apply decrease bound if it doesn't violate minimum difficulty
      newDifficulty = Math.max(maxDecrease, minDifficulty);
    }

    return newDifficulty;
  }

  /**
   * Validate difficulty transition between blocks
   */
  static validateDifficultyTransition(
    oldDifficulty: number,
    newDifficulty: number,
    config: DifficultyConfig
  ): ValidationResult {
    const errors: string[] = [];

    if (newDifficulty < config.minDifficulty) {
      errors.push(
        `New difficulty ${newDifficulty} is below minimum ${config.minDifficulty}`
      );
    }

    if (newDifficulty > config.maxDifficulty) {
      errors.push(
        `New difficulty ${newDifficulty} is above maximum ${config.maxDifficulty}`
      );
    }

    const ratio = newDifficulty / oldDifficulty;
    if (ratio > config.maxDifficultyRatio) {
      errors.push(
        `Difficulty increase ratio ${ratio} exceeds maximum ${config.maxDifficultyRatio}`
      );
    } else if (ratio < 1 / config.maxDifficultyRatio) {
      errors.push(
        `Difficulty decrease ratio ${ratio} exceeds maximum ${
          1 / config.maxDifficultyRatio
        }`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get difficulty configuration
   */
  getConfig(): DifficultyConfig {
    return {
      targetBlockTime: this.targetBlockTime,
      adjustmentPeriod: this.adjustmentPeriod,
      maxDifficultyRatio: this.maxDifficultyRatio,
      minDifficulty: this.minDifficulty,
      maxDifficulty: this.maxDifficulty,
    };
  }

  /**
   * Calculate next difficulty for instance configuration
   */
  calculateNextDifficulty(currentDifficulty: number, blocks: Block[]): number {
    return DifficultyManager.calculateNextDifficulty(
      currentDifficulty,
      blocks,
      this.getConfig()
    );
  }

  /**
   * Check if difficulty should adjust at block height
   */
  shouldAdjustDifficulty(blockHeight: number): boolean {
    return DifficultyManager.shouldAdjustDifficulty(
      blockHeight,
      this.adjustmentPeriod
    );
  }

  /**
   * Validate difficulty bounds for instance configuration
   */
  validateDifficultyBounds(
    newDifficulty: number,
    currentDifficulty: number
  ): number {
    return DifficultyManager.validateDifficultyBounds(
      newDifficulty,
      currentDifficulty,
      this.maxDifficultyRatio,
      this.minDifficulty,
      this.maxDifficulty
    );
  }

  /**
   * Get difficulty state for a blockchain
   */
  getDifficultyState(
    blocks: Block[],
    currentDifficulty: number
  ): DifficultyState {
    const latestBlock = blocks[blocks.length - 1];
    const nextAdjustmentHeight =
      Math.floor(latestBlock.index / this.adjustmentPeriod) *
        this.adjustmentPeriod +
      this.adjustmentPeriod;

    let nextDifficulty = currentDifficulty;
    if (this.shouldAdjustDifficulty(latestBlock.index + 1)) {
      nextDifficulty = this.calculateNextDifficulty(currentDifficulty, blocks);
    }

    const hashrate = DifficultyManager.calculateNetworkHashrate(blocks);

    // Find last adjustment time
    let lastAdjustmentTime = 0;
    if (blocks.length > this.adjustmentPeriod) {
      const lastAdjustmentIndex =
        Math.floor(latestBlock.index / this.adjustmentPeriod) *
        this.adjustmentPeriod;
      const lastAdjustmentBlock = blocks.find(
        b => b.index === lastAdjustmentIndex
      );
      if (lastAdjustmentBlock) {
        lastAdjustmentTime = lastAdjustmentBlock.timestamp;
      }
    }

    return {
      currentDifficulty,
      nextDifficulty,
      adjustmentHeight: nextAdjustmentHeight,
      estimatedHashrate: hashrate,
      targetBlockTime: this.targetBlockTime,
      lastAdjustmentTime,
    };
  }

  /**
   * Validate block timestamp
   */
  static validateBlockTimestamp(
    block: Block,
    previousBlocks: Block[]
  ): ValidationResult {
    const errors: string[] = [];

    // Check if timestamp is not too far in the future (2 hours)
    const maxFutureTime = Date.now() + 2 * 60 * 60 * 1000;
    if (block.timestamp > maxFutureTime) {
      errors.push('Block timestamp is too far in the future');
    }

    // Check against median of last 11 blocks
    if (previousBlocks.length >= 11) {
      const recentBlocks = previousBlocks.slice(-11);
      const timestamps = recentBlocks
        .map(b => b.timestamp)
        .sort((a, b) => a - b);
      const medianTimestamp = timestamps[Math.floor(timestamps.length / 2)];

      if (block.timestamp <= medianTimestamp) {
        errors.push(
          'Block timestamp must be greater than median of last 11 blocks'
        );
      }
    } else if (previousBlocks.length > 0) {
      // For early blocks, just check it's after the previous block
      const previousBlock = previousBlocks[previousBlocks.length - 1];
      if (block.timestamp <= previousBlock.timestamp) {
        errors.push('Block timestamp must be greater than previous block');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
