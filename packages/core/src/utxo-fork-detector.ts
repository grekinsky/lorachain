import { Logger } from '@lorachain/shared';
import {
  Block,
  UTXOChainState,
  UTXOChainBranch,
  UTXOForkDetectionResult,
  UTXOSetDelta,
  UTXOChainConfig,
  IUTXOForkDetector,
  UTXOTransaction,
  UTXO,
  UTXOMessageType
} from './types.js';
import { UTXOCompressionManager } from './utxo-compression-manager.js';
import { UTXOReliableDeliveryManager } from './utxo-reliable-delivery-manager.js';
import { UTXOManager } from './utxo.js';

/**
 * UTXO Fork Detector - NO BACKWARDS COMPATIBILITY
 * 
 * Detects and classifies competing blockchain branches using UTXO-only validation.
 * Integrates with existing LoRa infrastructure for optimization and compliance.
 * 
 * Key Features:
 * - UTXO-only block validation (no legacy transaction support)
 * - LoRa fragmentation analysis using existing UTXOCompressionManager  
 * - Integration with existing UTXOReliableDeliveryManager
 * - Cryptographic fork detection with existing infrastructure
 */
export class UTXOForkDetector implements IUTXOForkDetector {
  private readonly logger: Logger;
  private readonly config: UTXOChainConfig;
  private readonly compressionManager: UTXOCompressionManager;
  private readonly reliableDelivery: UTXOReliableDeliveryManager;
  private readonly utxoManager: UTXOManager;

  // Cache for block lookups and branch points
  private readonly blockCache = new Map<string, Block>();
  private readonly branchPointCache = new Map<string, number>();

  constructor(
    config: UTXOChainConfig,
    compressionManager: UTXOCompressionManager,
    reliableDelivery: UTXOReliableDeliveryManager,
    utxoManager: UTXOManager
  ) {
    this.logger = new Logger('UTXOForkDetector');
    this.config = config;
    this.compressionManager = compressionManager;
    this.reliableDelivery = reliableDelivery;
    this.utxoManager = utxoManager;

    this.logger.info('UTXOForkDetector initialized with UTXO-only support');
  }

  /**
   * Detect UTXO fork with LoRa optimization analysis
   * NO LEGACY SUPPORT - only UTXO transactions
   */
  detectUTXOFork(newBlock: Block, chainState: UTXOChainState): UTXOForkDetectionResult {
    const startTime = Date.now();
    this.logger.info(`Detecting UTXO fork for block ${newBlock.hash} at height ${newBlock.index}`);

    try {
      // CRITICAL: Validate block contains only UTXO transactions - NO LEGACY SUPPORT
      if (!this.isUTXOOnlyBlock(newBlock)) {
        throw new Error('Fork detection failed: Non-UTXO transactions detected - breaking change from legacy support');
      }

      const parentBlock = this.findParentUTXOBlock(newBlock, chainState);
      
      if (!parentBlock) {
        return this.createOrphanResult(newBlock, chainState);
      }

      const activeTip = chainState.activeBranch.utxoBlocks[chainState.activeBranch.utxoBlocks.length - 1];
      
      if (newBlock.previousHash === activeTip.hash) {
        // Block extends active UTXO chain - simple extension
        return this.createExtensionResult(newBlock, chainState);
      }

      // UTXO fork detected - find branch point and analyze
      const branchPoint = this.findUTXOBranchPoint(newBlock, chainState.activeBranch);
      const competingBranch = this.createCompetingUTXOBranch(newBlock, branchPoint, chainState);

      return this.createForkResult(newBlock, branchPoint, competingBranch, chainState);

    } catch (error) {
      this.logger.error(`UTXO fork detection failed: ${error.message}`);
      throw error;
    } finally {
      const processingTime = Date.now() - startTime;
      this.logger.debug(`UTXO fork detection completed in ${processingTime}ms`);
    }
  }

  /**
   * Find UTXO branch point where fork diverges from main chain
   * Uses efficient caching for performance optimization
   */
  findUTXOBranchPoint(block: Block, mainBranch: UTXOChainBranch): number {
    const cacheKey = `${block.hash}-${mainBranch.id}`;
    
    if (this.branchPointCache.has(cacheKey)) {
      return this.branchPointCache.get(cacheKey)!;
    }

    let currentBlock = block;
    const mainBlockHashes = new Set(mainBranch.utxoBlocks.map(b => b.hash));
    
    // Trace back until we find a common UTXO ancestor
    let depth = 0;
    while (currentBlock && !mainBlockHashes.has(currentBlock.previousHash) && depth < this.config.maxReorganizationDepth) {
      currentBlock = this.findUTXOBlockByHash(currentBlock.previousHash);
      depth++;
    }
    
    const branchPoint = currentBlock ? currentBlock.index : 0;
    
    // Cache the result for future lookups
    this.branchPointCache.set(cacheKey, branchPoint);
    
    this.logger.debug(`Found UTXO branch point at height ${branchPoint} after ${depth} steps`);
    return branchPoint;
  }

  /**
   * Validate block contains only UTXO transactions
   * CRITICAL: NO LEGACY TRANSACTION SUPPORT
   */
  isUTXOOnlyBlock(block: Block): boolean {
    if (!block.transactions || block.transactions.length === 0) {
      return true; // Empty blocks are valid
    }

    // Every transaction must be a valid UTXO transaction
    return block.transactions.every(tx => this.isUTXOTransaction(tx));
  }

  /**
   * Validate block has complete UTXO transaction data
   */
  validateBlockUTXOCompleteness(block: Block): boolean {
    if (!this.isUTXOOnlyBlock(block)) {
      return false;
    }

    // Validate UTXO transaction structure completeness
    return block.transactions.every(tx => {
      const utxoTx = tx as unknown as UTXOTransaction;
      return (
        utxoTx.inputs &&
        utxoTx.outputs &&
        utxoTx.inputs.length > 0 &&
        utxoTx.outputs.length > 0 &&
        typeof utxoTx.fee === 'number'
      );
    });
  }

  /**
   * Estimate LoRa fragmentation requirements using existing compression infrastructure
   */
  estimateLoRaFragmentation(block: Block): boolean {
    try {
      // Use existing compression manager to estimate compressed size
      const compressionResult = this.compressionManager.compressIfBeneficial(
        Buffer.from(JSON.stringify(block)),
        UTXOMessageType.BLOCK
      );

      const estimatedSize = compressionResult.compressedData?.length || Buffer.from(JSON.stringify(block)).length;
      
      // Check if block exceeds LoRa 256-byte limit and requires fragmentation
      const fragmentationRequired = estimatedSize > this.config.maxMessageSize;
      
      if (fragmentationRequired) {
        this.logger.debug(`Block ${block.hash} requires fragmentation: ${estimatedSize} > ${this.config.maxMessageSize} bytes`);
      }

      return fragmentationRequired;
    } catch (error) {
      this.logger.warn(`Failed to estimate LoRa fragmentation for block ${block.hash}: ${error.message}`);
      return true; // Assume fragmentation required on error (safe default)
    }
  }

  /**
   * Create orphan block result with compression analysis
   */
  private createOrphanResult(block: Block, chainState: UTXOChainState): UTXOForkDetectionResult {
    const compressionInfo = this.analyzeBlockCompression(block);
    
    return {
      type: 'orphan',
      utxoBlock: block,
      reason: 'Parent UTXO block not found in chain state',
      compressionInfo,
      fragmentationRequired: this.estimateLoRaFragmentation(block),
      timestamp: Date.now()
    };
  }

  /**
   * Create chain extension result with UTXO delta analysis
   */
  private createExtensionResult(block: Block, chainState: UTXOChainState): UTXOForkDetectionResult {
    const utxoSetDelta = this.calculateUTXOSetDelta(block, chainState);
    const compressionInfo = this.analyzeBlockCompression(block);

    return {
      type: 'extension',
      utxoBlock: block,
      branch: chainState.activeBranch,
      utxoSetDelta,
      compressionInfo,
      fragmentationRequired: this.estimateLoRaFragmentation(block),
      timestamp: Date.now()
    };
  }

  /**
   * Create fork result with competing branch analysis
   */
  private createForkResult(
    block: Block,
    branchPoint: number,
    competingBranch: UTXOChainBranch,
    chainState: UTXOChainState
  ): UTXOForkDetectionResult {
    const compressionInfo = this.analyzeBlockCompression(block);
    const utxoSetDelta = this.calculateBranchUTXODelta(competingBranch, chainState.activeBranch);

    return {
      type: 'fork',
      utxoBlock: block,
      branchPoint,
      competingBranch,
      utxoSetDelta,
      compressionInfo,
      fragmentationRequired: this.estimateLoRaFragmentation(block),
      timestamp: Date.now()
    };
  }

  /**
   * Create competing UTXO branch from new block
   */
  private createCompetingUTXOBranch(
    newBlock: Block,
    branchPoint: number,
    chainState: UTXOChainState
  ): UTXOChainBranch {
    const branchId = `branch-${newBlock.hash}-${Date.now()}`;
    
    // Get blocks from branch point to new block
    const branchBlocks = this.collectBranchBlocks(newBlock, branchPoint);
    
    return {
      id: branchId,
      utxoBlocks: branchBlocks,
      height: newBlock.index,
      cumulativeDifficulty: this.calculateBranchCumulativeDifficulty(branchBlocks),
      totalWork: this.calculateBranchTotalWork(branchBlocks),
      utxoMerkleRoot: newBlock.merkleRoot,
      lastBlockHash: newBlock.hash,
      branchPoint,
      isActive: false,
      utxoSetHash: this.calculateUTXOSetHash(branchBlocks),
      timestamp: Date.now(),
      parentBranchId: chainState.activeBranch.id
    };
  }

  /**
   * Collect blocks from branch point to given block
   */
  private collectBranchBlocks(block: Block, branchPoint: number): Block[] {
    const blocks: Block[] = [];
    let currentBlock = block;

    while (currentBlock && currentBlock.index > branchPoint) {
      blocks.unshift(currentBlock); // Add to beginning to maintain order
      currentBlock = this.findUTXOBlockByHash(currentBlock.previousHash);
    }

    return blocks;
  }

  /**
   * Calculate UTXO set delta for a single block
   */
  private calculateUTXOSetDelta(block: Block, chainState: UTXOChainState): UTXOSetDelta {
    const addedUTXOs: UTXO[] = [];
    const removedUTXOs: Array<{ txId: string; outputIndex: number }> = [];
    const transactionsAffected: string[] = [];
    let totalValueChange = 0;

    // Process each UTXO transaction in the block
    for (const tx of block.transactions) {
      const utxoTx = tx as unknown as UTXOTransaction;
      transactionsAffected.push(utxoTx.id);

      // Add new UTXOs from outputs
      for (const [index, output] of utxoTx.outputs.entries()) {
        const utxo: UTXO = {
          txId: utxoTx.id,
          outputIndex: index,
          value: output.value,
          lockingScript: output.lockingScript,
          blockHeight: block.index,
          isSpent: false
        };
        addedUTXOs.push(utxo);
        totalValueChange += output.value;
      }

      // Remove UTXOs consumed by inputs
      for (const input of utxoTx.inputs) {
        removedUTXOs.push({
          txId: input.previousTxId,
          outputIndex: input.outputIndex
        });
        // Note: We don't subtract value here as we'd need to look up the UTXO
      }
    }

    return {
      addedUTXOs,
      removedUTXOs,
      modifiedUTXOs: [], // Not applicable for single block delta
      totalValueChange,
      transactionsAffected
    };
  }

  /**
   * Calculate UTXO delta between two branches
   */
  private calculateBranchUTXODelta(branchA: UTXOChainBranch, branchB: UTXOChainBranch): UTXOSetDelta {
    // This is a simplified implementation
    // In a full implementation, we'd need to calculate the actual UTXO set differences
    
    const transactionsAffected: string[] = [];
    
    // Collect all affected transactions from both branches
    for (const block of [...branchA.utxoBlocks, ...branchB.utxoBlocks]) {
      for (const tx of block.transactions) {
        const utxoTx = tx as unknown as UTXOTransaction;
        if (!transactionsAffected.includes(utxoTx.id)) {
          transactionsAffected.push(utxoTx.id);
        }
      }
    }

    return {
      addedUTXOs: [],
      removedUTXOs: [],
      modifiedUTXOs: [],
      totalValueChange: 0,
      transactionsAffected
    };
  }

  /**
   * Analyze block compression for LoRa optimization
   */
  private analyzeBlockCompression(block: Block): {
    algorithm: string;
    compressedSize: number;
    compressionRatio: number;
    fragmentationRequired: boolean;
  } {
    try {
      const originalSize = Buffer.from(JSON.stringify(block)).length;
      const compressionResult = this.compressionManager.compressIfBeneficial(
        Buffer.from(JSON.stringify(block)),
        UTXOMessageType.BLOCK
      );

      const compressedSize = compressionResult.compressedData?.length || originalSize;
      const algorithm = compressionResult.algorithm || 'none';
      const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;
      const fragmentationRequired = compressedSize > this.config.maxMessageSize;

      return {
        algorithm,
        compressedSize,
        compressionRatio,
        fragmentationRequired
      };
    } catch (error) {
      this.logger.warn(`Failed to analyze block compression: ${error.message}`);
      return {
        algorithm: 'none',
        compressedSize: Buffer.from(JSON.stringify(block)).length,
        compressionRatio: 1,
        fragmentationRequired: true
      };
    }
  }

  /**
   * Find UTXO block by hash with caching
   */
  private findUTXOBlockByHash(hash: string): Block | null {
    if (this.blockCache.has(hash)) {
      return this.blockCache.get(hash)!;
    }

    // In a full implementation, this would query the persistence layer
    // For now, return null (block not found)
    return null;
  }

  /**
   * Find parent UTXO block in chain state
   */
  private findParentUTXOBlock(block: Block, chainState: UTXOChainState): Block | null {
    // Check active branch first
    const activeBlocks = chainState.activeBranch.utxoBlocks;
    const parentInActiveBranch = activeBlocks.find(b => b.hash === block.previousHash);
    
    if (parentInActiveBranch) {
      return parentInActiveBranch;
    }

    // Check other branches
    for (const branch of chainState.branches.values()) {
      const parentInBranch = branch.utxoBlocks.find(b => b.hash === block.previousHash);
      if (parentInBranch) {
        return parentInBranch;
      }
    }

    // Check orphan blocks
    return chainState.orphanUTXOBlocks.find(b => b.hash === block.previousHash) || null;
  }

  /**
   * Calculate cumulative difficulty for branch blocks
   */
  private calculateBranchCumulativeDifficulty(blocks: Block[]): bigint {
    return blocks.reduce((total, block) => total + BigInt(block.difficulty), 0n);
  }

  /**
   * Calculate total work for branch blocks  
   */
  private calculateBranchTotalWork(blocks: Block[]): bigint {
    // For simplicity, using same as cumulative difficulty
    // In a full implementation, this would use proper work calculation
    return this.calculateBranchCumulativeDifficulty(blocks);
  }

  /**
   * Calculate UTXO set hash for branch
   */
  private calculateUTXOSetHash(blocks: Block[]): string {
    // Simplified hash calculation
    // In a full implementation, this would hash the actual UTXO set
    const blockHashes = blocks.map(b => b.hash).join('');
    return `utxo-set-${blockHashes.slice(0, 16)}`;
  }

  /**
   * Check if transaction is a UTXO transaction (NO LEGACY SUPPORT)
   */
  private isUTXOTransaction(tx: any): boolean {
    // UTXO transactions must have inputs and outputs arrays
    return (
      tx &&
      Array.isArray(tx.inputs) &&
      Array.isArray(tx.outputs) &&
      typeof tx.fee === 'number' &&
      typeof tx.timestamp === 'number'
    );
  }
}