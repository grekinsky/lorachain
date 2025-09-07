import { Logger } from '@lorachain/shared';
import {
  UTXOChainBranch,
  UTXOChainConfig,
  IUTXOChainSelector,
  Block,
  UTXOTransaction,
  UTXOMessageType
} from './types.js';
import { DifficultyManager } from './difficulty.js';
import { UTXOCompressionManager } from './utxo-compression-manager.js';

/**
 * UTXO Chain Selector - NO BACKWARDS COMPATIBILITY  
 * 
 * Selects the best blockchain branch using UTXO-only cumulative difficulty comparison.
 * Integrates with existing DifficultyManager and compression infrastructure.
 * 
 * Key Features:
 * - UTXO-only branch validation (no legacy transaction support) 
 * - Cumulative difficulty comparison using existing DifficultyManager
 * - Deterministic tie-breaking with UTXO set hashes
 * - LoRa constraint validation using existing UTXOCompressionManager
 * - Performance-optimized branch comparison algorithms
 */
export class UTXOChainSelector implements IUTXOChainSelector {
  private readonly logger: Logger;
  private readonly config: UTXOChainConfig;
  private readonly difficultyManager: DifficultyManager;
  private readonly compressionManager: UTXOCompressionManager;

  // Performance optimization caches
  private readonly difficultyCache = new Map<string, bigint>();
  private readonly validationCache = new Map<string, boolean>();

  constructor(
    config: UTXOChainConfig,
    difficultyManager: DifficultyManager,
    compressionManager: UTXOCompressionManager
  ) {
    this.logger = new Logger('UTXOChainSelector');
    this.config = config;
    this.difficultyManager = difficultyManager;
    this.compressionManager = compressionManager;

    this.logger.info('UTXOChainSelector initialized with UTXO-only support');
  }

  /**
   * Select best UTXO chain from competing branches
   * Primary rule: Highest cumulative difficulty using existing DifficultyManager
   */
  selectBestUTXOChain(branches: Map<string, UTXOChainBranch>): UTXOChainBranch {
    const startTime = Date.now();
    this.logger.info(`Selecting best UTXO chain from ${branches.size} branches`);

    if (branches.size === 0) {
      throw new Error('No branches available for selection');
    }

    const validUTXOBranches = Array.from(branches.values())
      .filter(branch => this.isValidUTXOBranch(branch));

    if (validUTXOBranches.length === 0) {
      throw new Error('No valid UTXO branches available - legacy branches not supported');
    }

    // Sort branches by comparison result (best first)
    validUTXOBranches.sort((a, b) => this.compareUTXOBranches(b, a));
    
    const bestBranch = validUTXOBranches[0];
    const processingTime = Date.now() - startTime;
    
    this.logger.info(`Selected best UTXO chain: ${bestBranch.id} (height: ${bestBranch.height}, difficulty: ${bestBranch.cumulativeDifficulty}) in ${processingTime}ms`);
    
    // Log comparison details for debugging
    if (validUTXOBranches.length > 1) {
      const runnerUp = validUTXOBranches[1];
      this.logger.debug(`Runner-up: ${runnerUp.id} (height: ${runnerUp.height}, difficulty: ${runnerUp.cumulativeDifficulty})`);
    }

    return bestBranch;
  }

  /**
   * Compare UTXO branches using cumulative difficulty with deterministic tie-breaking
   * Returns: 1 if branchA > branchB, -1 if branchA < branchB, 0 if equal
   */
  compareUTXOBranches(branchA: UTXOChainBranch, branchB: UTXOChainBranch): number {
    // Primary comparison: Cumulative difficulty using existing DifficultyManager
    const difficultyA = this.calculateCumulativeDifficulty(branchA.utxoBlocks);
    const difficultyB = this.calculateCumulativeDifficulty(branchB.utxoBlocks);
    
    if (difficultyA > difficultyB) {
      this.logger.debug(`Branch ${branchA.id} selected by higher difficulty: ${difficultyA} > ${difficultyB}`);
      return 1;
    }
    if (difficultyA < difficultyB) {
      this.logger.debug(`Branch ${branchB.id} selected by higher difficulty: ${difficultyB} > ${difficultyA}`);
      return -1;
    }

    // Tie-breaker 1: Compare UTXO set hashes (UTXO-specific deterministic tie-breaking)
    if (branchA.utxoSetHash !== branchB.utxoSetHash) {
      const comparison = branchA.utxoSetHash.localeCompare(branchB.utxoSetHash);
      if (comparison !== 0) {
        this.logger.debug(`Branch selected by UTXO set hash comparison: ${comparison > 0 ? branchA.id : branchB.id}`);
        return comparison;
      }
    }

    // Tie-breaker 2: Higher block count (longer chain preference)
    if (branchA.height !== branchB.height) {
      const comparison = branchA.height - branchB.height;
      this.logger.debug(`Branch selected by height: ${comparison > 0 ? branchA.id : branchB.id} (${Math.abs(comparison)} blocks difference)`);
      return comparison;
    }

    // Tie-breaker 3: Lexicographically smaller last block hash (deterministic)
    const hashComparison = branchA.lastBlockHash.localeCompare(branchB.lastBlockHash);
    if (hashComparison !== 0) {
      this.logger.debug(`Branch selected by last block hash comparison: ${hashComparison < 0 ? branchA.id : branchB.id}`);
      return hashComparison;
    }

    // Tie-breaker 4: Earlier timestamp (prefer older branch)
    const timestampComparison = branchA.timestamp - branchB.timestamp;
    if (timestampComparison !== 0) {
      this.logger.debug(`Branch selected by timestamp: ${timestampComparison < 0 ? branchA.id : branchB.id}`);
      return timestampComparison;
    }

    // Final tie-breaker: Branch ID lexicographic comparison
    const idComparison = branchA.id.localeCompare(branchB.id);
    this.logger.debug(`Branch selected by ID comparison: ${idComparison < 0 ? branchA.id : branchB.id}`);
    
    return idComparison;
  }

  /**
   * Calculate cumulative difficulty using existing DifficultyManager infrastructure
   * Uses caching for performance optimization
   */
  calculateCumulativeDifficulty(blocks: Block[]): bigint {
    if (blocks.length === 0) {
      return 0n;
    }

    // Create cache key from block hashes
    const cacheKey = blocks.map(b => b.hash).join('-');
    
    if (this.difficultyCache.has(cacheKey)) {
      return this.difficultyCache.get(cacheKey)!;
    }

    let cumulativeDifficulty = 0n;
    
    // Use existing difficulty manager for proper difficulty calculations
    for (const block of blocks) {
      // Validate difficulty bounds using existing infrastructure
      if (!this.difficultyManager.validateDifficultyBounds(block.difficulty)) {
        this.logger.warn(`Invalid difficulty in block ${block.hash}: ${block.difficulty}`);
        continue;
      }

      cumulativeDifficulty += BigInt(block.difficulty);
    }

    // Cache the result for future use
    this.difficultyCache.set(cacheKey, cumulativeDifficulty);
    
    this.logger.debug(`Calculated cumulative difficulty: ${cumulativeDifficulty} for ${blocks.length} blocks`);
    return cumulativeDifficulty;
  }

  /**
   * Validate UTXO branch contains only valid UTXO transactions
   * NO LEGACY SUPPORT - strict UTXO-only validation
   */
  isValidUTXOBranch(branch: UTXOChainBranch): boolean {
    const cacheKey = `${branch.id}-${branch.lastBlockHash}`;
    
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    try {
      // Validate branch contains only UTXO blocks
      const isValid = (
        branch.utxoBlocks.every(block => this.isUTXOOnlyBlock(block)) &&
        this.isValidUTXOChain(branch) &&
        this.meetsLoRaConstraints(branch)
      );

      // Cache the validation result
      this.validationCache.set(cacheKey, isValid);
      
      if (!isValid) {
        this.logger.warn(`Invalid UTXO branch detected: ${branch.id}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Error validating UTXO branch ${branch.id}: ${error.message}`);
      return false;
    }
  }

  /**
   * Check LoRa constraints using existing compression infrastructure
   */
  meetsLoRaConstraints(branch: UTXOChainBranch): boolean {
    // Check if branch blocks can be transmitted over LoRa network
    return branch.utxoBlocks.every(block => {
      try {
        // Use existing compression manager to estimate transmission size
        const compressionResult = this.compressionManager.compressIfBeneficial(
          Buffer.from(JSON.stringify(block)),
          UTXOMessageType.BLOCK
        );

        const estimatedSize = compressionResult.compressedData?.length || 
                            Buffer.from(JSON.stringify(block)).length;

        // Allow blocks that fit in one message OR can be fragmented
        return estimatedSize <= this.config.maxMessageSize || this.canFragment(block);
      } catch (error) {
        this.logger.warn(`Failed to check LoRa constraints for block ${block.hash}: ${error.message}`);
        return false; // Reject blocks that can't be analyzed
      }
    });
  }

  /**
   * Check if block can be fragmented for LoRa transmission
   */
  private canFragment(block: Block): boolean {
    // Blocks can be fragmented if they have valid UTXO transactions
    // and don't exceed maximum fragmentation limits
    
    if (!this.isUTXOOnlyBlock(block)) {
      return false;
    }

    const maxFragments = Math.floor(8192 / this.config.maxMessageSize); // Reasonable fragment limit
    const estimatedFragments = Math.ceil(
      Buffer.from(JSON.stringify(block)).length / this.config.maxMessageSize
    );

    return estimatedFragments <= maxFragments;
  }

  /**
   * Validate block contains only UTXO transactions (NO LEGACY SUPPORT)
   */
  private isUTXOOnlyBlock(block: Block): boolean {
    if (!block.transactions || block.transactions.length === 0) {
      return true; // Empty blocks are valid UTXO blocks
    }

    // Every transaction must be a valid UTXO transaction
    return block.transactions.every(tx => this.isUTXOTransaction(tx));
  }

  /**
   * Validate UTXO chain structure and consistency
   */
  private isValidUTXOChain(branch: UTXOChainBranch): boolean {
    const blocks = branch.utxoBlocks;
    
    if (blocks.length === 0) {
      return false; // Empty chain is invalid
    }

    // Validate chain continuity
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].previousHash !== blocks[i-1].hash) {
        this.logger.warn(`Chain discontinuity in branch ${branch.id} at height ${blocks[i].index}`);
        return false;
      }
      
      if (blocks[i].index !== blocks[i-1].index + 1) {
        this.logger.warn(`Height discontinuity in branch ${branch.id}: ${blocks[i-1].index} -> ${blocks[i].index}`);
        return false;
      }
    }

    // Validate branch metadata consistency
    const lastBlock = blocks[blocks.length - 1];
    if (branch.height !== lastBlock.index) {
      this.logger.warn(`Branch height mismatch: ${branch.height} != ${lastBlock.index}`);
      return false;
    }

    if (branch.lastBlockHash !== lastBlock.hash) {
      this.logger.warn(`Branch last hash mismatch: ${branch.lastBlockHash} != ${lastBlock.hash}`);
      return false;
    }

    // Validate cumulative difficulty matches calculated value
    const calculatedDifficulty = this.calculateCumulativeDifficulty(blocks);
    if (branch.cumulativeDifficulty !== calculatedDifficulty) {
      this.logger.warn(`Branch cumulative difficulty mismatch: ${branch.cumulativeDifficulty} != ${calculatedDifficulty}`);
      return false;
    }

    return true;
  }

  /**
   * Check if transaction is a UTXO transaction (NO LEGACY SUPPORT)
   */
  private isUTXOTransaction(tx: any): boolean {
    const utxoTx = tx as UTXOTransaction;
    
    return (
      utxoTx &&
      typeof utxoTx.id === 'string' &&
      Array.isArray(utxoTx.inputs) &&
      Array.isArray(utxoTx.outputs) &&
      utxoTx.inputs.length > 0 &&
      utxoTx.outputs.length > 0 &&
      typeof utxoTx.fee === 'number' &&
      typeof utxoTx.timestamp === 'number' &&
      utxoTx.fee >= 0 // Fee must be non-negative
    );
  }

  /**
   * Clear performance caches (for memory management)
   */
  public clearCaches(): void {
    this.difficultyCache.clear();
    this.validationCache.clear();
    this.logger.debug('UTXOChainSelector caches cleared');
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): {
    difficultyCacheSize: number;
    validationCacheSize: number;
  } {
    return {
      difficultyCacheSize: this.difficultyCache.size,
      validationCacheSize: this.validationCache.size
    };
  }
}