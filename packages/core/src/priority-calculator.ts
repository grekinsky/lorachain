/**
 * UTXO Priority Calculator Service
 *
 * BREAKING CHANGE: Advanced fee-based priority calculation for UTXO transactions
 * Integrates with existing MessagePriority enum and network context
 * NO legacy support - UTXO-only architecture
 */

import { EventEmitter } from 'events';
import type { MeshMessage, UTXOTransaction, Block } from './types.js';
import { MessagePriority } from './types.js';
import type {
  UTXONetworkContext,
  PriorityFactor,
  UTXOPriorityThresholds,
  IPriorityCalculator,
} from './priority-types.js';
import { Logger } from '@lorachain/shared';

// Re-export interface for index.ts
export type { IPriorityCalculator } from './priority-types.js';

/**
 * Cached priority calculation result
 */
interface CachedPriorityResult {
  messageHash: string;
  priority: MessagePriority;
  timestamp: number;
  context: UTXONetworkContext;
}

/**
 * UTXO Priority Calculator with advanced fee-based analysis
 *
 * Features:
 * - UTXO transaction fee analysis with dynamic thresholds
 * - Context-aware priority adjustment based on network conditions
 * - Configurable priority factors with weighted scoring
 * - Priority calculation caching for performance
 * - Emergency and block message special handling
 * - Integration with existing MessagePriority enum
 */
export class UTXOPriorityCalculator
  extends EventEmitter
  implements IPriorityCalculator
{
  private priorityFactors: Map<string, PriorityFactor> = new Map();
  private thresholds: UTXOPriorityThresholds;
  private networkContext: UTXONetworkContext;
  private logger: Logger;
  private priorityCache: Map<string, CachedPriorityResult> = new Map();
  private cacheTimeout: number = 60000; // 1 minute cache

  // Statistics
  private calculationStats = {
    totalCalculations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    priorityDistribution: {
      [MessagePriority.CRITICAL]: 0,
      [MessagePriority.HIGH]: 0,
      [MessagePriority.NORMAL]: 0,
      [MessagePriority.LOW]: 0,
    },
    averageCalculationTime: 0,
  };

  constructor(
    thresholds: UTXOPriorityThresholds,
    initialContext: UTXONetworkContext
  ) {
    super();
    this.thresholds = thresholds;
    this.networkContext = initialContext;
    this.logger = Logger.getInstance();

    this.initializeDefaultPriorityFactors();
    this.startCacheCleanup();

    this.logger.info('UTXOPriorityCalculator initialized', {
      thresholds: this.thresholds,
      factors: Array.from(this.priorityFactors.keys()),
    });
  }

  // ==========================================
  // CORE PRIORITY CALCULATION
  // ==========================================

  calculatePriority(
    message: MeshMessage,
    context: UTXONetworkContext
  ): MessagePriority {
    const startTime = performance.now();

    try {
      // Update context
      this.updateNetworkContext(context);

      // Check cache first
      const messageHash = this.hashMessage(message);
      const cachedResult = this.getCachedPriority(messageHash, context);
      if (cachedResult) {
        this.calculationStats.cacheHits++;
        return cachedResult;
      }

      this.calculationStats.cacheMisses++;

      // Calculate priority based on message type
      let priority: MessagePriority;

      switch (message.type) {
        case 'transaction':
          priority = this.calculateUTXOTransactionPriority(
            message.payload as UTXOTransaction,
            context
          );
          break;
        case 'block':
          priority = this.calculateBlockPriority(
            message.payload as Block,
            context
          );
          break;
        case 'sync':
          priority = MessagePriority.HIGH; // SPV proofs get high priority
          break;
        case 'discovery':
          priority = MessagePriority.NORMAL; // Discovery messages get normal priority
          break;
        default:
          priority = MessagePriority.LOW;
      }

      // Apply contextual adjustments
      priority = this.applyContextualAdjustments(priority, message, context);

      // Cache result
      this.cachePriorityResult(messageHash, priority, context);

      // Update statistics
      this.updateCalculationStats(priority, performance.now() - startTime);

      this.logger.debug('Priority calculated', {
        messageType: message.type,
        priority,
        calculationTime: performance.now() - startTime,
        fromCache: false,
      });

      return priority;
    } catch (error) {
      this.logger.error(
        'Priority calculation failed, using default',
        error as Record<string, any>
      );
      return MessagePriority.NORMAL;
    }
  }

  calculateUTXOTransactionPriority(
    tx: UTXOTransaction,
    context: UTXONetworkContext
  ): MessagePriority {
    try {
      // Validate transaction has required fields
      if (!tx || !tx.inputs || !tx.outputs) {
        this.logger.warn(
          'Invalid transaction structure, using default priority'
        );
        return MessagePriority.NORMAL;
      }

      // Calculate fee per byte
      const feePerByte = this.calculateFeePerByte(tx);

      // Base priority from fee
      let basePriority = this.getFeeBasedPriority(feePerByte);

      // Apply priority factors
      const factorScore = this.calculatePriorityFactorScore(
        { type: 'transaction', payload: tx } as MeshMessage,
        context
      );

      // Adjust priority based on factor score
      basePriority = this.adjustPriorityByScore(basePriority, factorScore);

      this.logger.debug('UTXO transaction priority calculated', {
        txId: tx.id,
        feePerByte,
        basePriority,
        factorScore,
        finalPriority: basePriority,
      });

      return basePriority;
    } catch (error) {
      this.logger.error(
        'Failed to calculate UTXO transaction priority',
        error as Record<string, any>
      );
      return MessagePriority.NORMAL;
    }
  }

  calculateBlockPriority(
    block: Block,
    context: UTXONetworkContext
  ): MessagePriority {
    // Blocks always start with CRITICAL priority
    let priority = MessagePriority.CRITICAL;

    // Apply block priority boost if configured
    const boostFactor = this.thresholds.blockPriorityBoost;
    if (boostFactor > 1.0) {
      // Already CRITICAL, so boost doesn't change it
      priority = MessagePriority.CRITICAL;
    }

    // Consider block age - recent blocks get priority
    const blockAge = context.currentBlockHeight - block.index;
    if (blockAge > 10) {
      // Old blocks get slightly lower priority (but still high)
      priority = MessagePriority.HIGH;
    }

    this.logger.debug('Block priority calculated', {
      blockHeight: block.index,
      currentHeight: context.currentBlockHeight,
      blockAge,
      priority,
    });

    return priority;
  }

  // ==========================================
  // PRIORITY FACTORS MANAGEMENT
  // ==========================================

  addPriorityFactor(factor: PriorityFactor): void {
    this.priorityFactors.set(factor.name, factor);
    this.clearPriorityCache(); // Clear cache when factors change

    this.logger.info('Priority factor added', {
      name: factor.name,
      weight: factor.weight,
    });
  }

  removePriorityFactor(name: string): void {
    if (this.priorityFactors.delete(name)) {
      this.clearPriorityCache(); // Clear cache when factors change
      this.logger.info('Priority factor removed', { name });
    }
  }

  getPriorityFactors(): PriorityFactor[] {
    return Array.from(this.priorityFactors.values());
  }

  // ==========================================
  // DYNAMIC PRIORITY ADJUSTMENT
  // ==========================================

  updatePriority(messageId: string, newPriority: MessagePriority): boolean {
    // This would be implemented with a message tracking system
    // For now, just emit event and return true
    this.emit('priorityUpdated', messageId, newPriority);
    return true;
  }

  boostPriorityTemporarily(messageId: string, durationMs: number): boolean {
    // Temporary priority boost implementation
    setTimeout(() => {
      this.emit('priorityBoostExpired', messageId);
    }, durationMs);

    this.emit('priorityBoosted', messageId, durationMs);
    return true;
  }

  // ==========================================
  // CONTEXT MANAGEMENT
  // ==========================================

  updateNetworkContext(context: Partial<UTXONetworkContext>): void {
    const oldContext = { ...this.networkContext };
    this.networkContext = { ...this.networkContext, ...context };

    // Clear cache if significant context changes
    if (this.hasSignificantContextChange(oldContext, this.networkContext)) {
      this.clearPriorityCache();
      this.logger.debug('Network context updated, cache cleared', {
        changes: this.getContextChanges(oldContext, this.networkContext),
      });
    }

    this.emit('contextUpdated', this.networkContext);
  }

  getNetworkContext(): UTXONetworkContext {
    return { ...this.networkContext };
  }

  // ==========================================
  // CONFIGURATION MANAGEMENT
  // ==========================================

  updateThresholds(thresholds: UTXOPriorityThresholds): void {
    this.thresholds = { ...thresholds };
    this.clearPriorityCache(); // Clear cache when thresholds change

    this.logger.info('Priority thresholds updated', {
      highFeeSatoshiPerByte: thresholds.highFeeSatoshiPerByte,
      normalFeeSatoshiPerByte: thresholds.normalFeeSatoshiPerByte,
      emergencyBypass: thresholds.emergencyBypass,
    });
  }

  getThresholds(): UTXOPriorityThresholds {
    return { ...this.thresholds };
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private initializeDefaultPriorityFactors(): void {
    // Fee per byte factor
    this.addPriorityFactor({
      name: 'fee_per_byte',
      weight: 1.0,
      calculator: (message: MeshMessage, context: UTXONetworkContext) => {
        if (message.type === 'transaction') {
          const tx = message.payload as UTXOTransaction;
          const feePerByte = this.calculateFeePerByte(tx);
          return Math.min(feePerByte / context.averageTransactionFee, 2.0); // Cap at 2x average
        }
        return 1.0;
      },
    });

    // Network congestion factor
    this.addPriorityFactor({
      name: 'network_congestion',
      weight: 0.3,
      calculator: (message: MeshMessage, context: UTXONetworkContext) => {
        // Higher congestion = lower priority multiplier for non-critical messages
        return message.type === 'block'
          ? 1.0
          : Math.max(0.5, 1.0 - context.networkCongestionLevel * 0.5);
      },
    });

    // Battery level factor
    this.addPriorityFactor({
      name: 'battery_level',
      weight: 0.2,
      calculator: (message: MeshMessage, context: UTXONetworkContext) => {
        // Low battery = prefer higher priority messages
        if (context.batteryLevel < 0.2) {
          return message.type === 'transaction' ? 0.8 : 1.0;
        }
        return 1.0;
      },
    });

    // Emergency mode factor
    this.addPriorityFactor({
      name: 'emergency_mode',
      weight: 2.0,
      calculator: (message: MeshMessage, context: UTXONetworkContext) => {
        return context.emergencyMode ? 1.5 : 1.0;
      },
    });

    // UTXO set completeness factor
    this.addPriorityFactor({
      name: 'utxo_completeness',
      weight: 0.1,
      calculator: (message: MeshMessage, context: UTXONetworkContext) => {
        // If UTXO set is incomplete, prioritize sync messages
        if (context.utxoSetCompleteness < 0.9) {
          return message.type === 'sync' ? 1.2 : 0.9;
        }
        return 1.0;
      },
    });
  }

  private calculateFeePerByte(tx: UTXOTransaction): number {
    try {
      // Validate transaction structure
      if (!tx || !tx.inputs || !tx.outputs || tx.fee == null) {
        return 0; // Return 0 fee per byte for invalid transactions
      }

      // Estimate transaction size
      const inputSize = tx.inputs.length * 148; // Rough estimate for P2PKH input
      const outputSize = tx.outputs.length * 34; // Rough estimate for P2PKH output
      const baseSize = 10; // Transaction overhead
      const estimatedSize = inputSize + outputSize + baseSize;

      // Avoid division by zero
      if (estimatedSize === 0) {
        return 0;
      }

      return tx.fee / estimatedSize;
    } catch (error) {
      this.logger.warn(
        'Failed to calculate fee per byte',
        error as Record<string, any>
      );
      return 0;
    }
  }

  private getFeeBasedPriority(feePerByte: number): MessagePriority {
    if (feePerByte >= this.thresholds.highFeeSatoshiPerByte) {
      return MessagePriority.HIGH;
    }
    if (feePerByte >= this.thresholds.normalFeeSatoshiPerByte) {
      return MessagePriority.NORMAL;
    }
    return MessagePriority.LOW;
  }

  private calculatePriorityFactorScore(
    message: MeshMessage,
    context: UTXONetworkContext
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of this.priorityFactors.values()) {
      try {
        const score = factor.calculator(message, context);
        totalScore += score * factor.weight;
        totalWeight += factor.weight;
      } catch (error) {
        this.logger.warn('Priority factor calculation failed', {
          factorName: factor.name,
          error,
        });
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 1.0;
  }

  private adjustPriorityByScore(
    basePriority: MessagePriority,
    score: number
  ): MessagePriority {
    // Score adjustments:
    // > 1.3: Boost by one level
    // < 0.7: Reduce by one level

    if (score > 1.3) {
      return Math.max(
        MessagePriority.CRITICAL,
        basePriority - 1
      ) as MessagePriority;
    }

    if (score < 0.7) {
      return Math.min(MessagePriority.LOW, basePriority + 1) as MessagePriority;
    }

    return basePriority;
  }

  private applyContextualAdjustments(
    priority: MessagePriority,
    message: MeshMessage,
    context: UTXONetworkContext
  ): MessagePriority {
    // Emergency bypass
    if (context.emergencyMode && this.thresholds.emergencyBypass) {
      if (message.type === 'transaction' || message.type === 'block') {
        return Math.max(MessagePriority.HIGH, priority) as MessagePriority;
      }
    }

    // Block priority boost
    if (message.type === 'block' && this.thresholds.blockPriorityBoost > 1.0) {
      return MessagePriority.CRITICAL;
    }

    // Merkle proof priority override
    if (message.type === 'sync') {
      return this.thresholds.merkleProofPriority;
    }

    return priority;
  }

  private hashMessage(message: MeshMessage): string {
    // Simple hash for caching (would use proper crypto hash in production)
    const key = `${message.type}_${message.timestamp}_${JSON.stringify(message.payload).slice(0, 100)}`;
    return Buffer.from(key).toString('base64');
  }

  private getCachedPriority(
    messageHash: string,
    context: UTXONetworkContext
  ): MessagePriority | null {
    const cached = this.priorityCache.get(messageHash);
    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.priorityCache.delete(messageHash);
      return null;
    }

    // Check if context has changed significantly
    if (this.hasSignificantContextChange(cached.context, context)) {
      this.priorityCache.delete(messageHash);
      return null;
    }

    return cached.priority;
  }

  private cachePriorityResult(
    messageHash: string,
    priority: MessagePriority,
    context: UTXONetworkContext
  ): void {
    this.priorityCache.set(messageHash, {
      messageHash,
      priority,
      timestamp: Date.now(),
      context: { ...context },
    });

    // Limit cache size
    if (this.priorityCache.size > 1000) {
      const oldestKey = this.priorityCache.keys().next().value;
      if (oldestKey) {
        this.priorityCache.delete(oldestKey);
      }
    }
  }

  private clearPriorityCache(): void {
    this.priorityCache.clear();
    this.logger.debug('Priority cache cleared');
  }

  private hasSignificantContextChange(
    oldContext: UTXONetworkContext,
    newContext: UTXONetworkContext
  ): boolean {
    // Define thresholds for significant changes
    const thresholds = {
      averageTransactionFee: 0.1, // 10% change
      networkCongestionLevel: 0.2, // 20% change
      batteryLevel: 0.1, // 10% change
      utxoSetCompleteness: 0.05, // 5% change
    };

    return (
      Math.abs(
        oldContext.averageTransactionFee - newContext.averageTransactionFee
      ) /
        oldContext.averageTransactionFee >
        thresholds.averageTransactionFee ||
      Math.abs(
        oldContext.networkCongestionLevel - newContext.networkCongestionLevel
      ) > thresholds.networkCongestionLevel ||
      Math.abs(oldContext.batteryLevel - newContext.batteryLevel) >
        thresholds.batteryLevel ||
      Math.abs(
        oldContext.utxoSetCompleteness - newContext.utxoSetCompleteness
      ) > thresholds.utxoSetCompleteness ||
      oldContext.emergencyMode !== newContext.emergencyMode
    );
  }

  private getContextChanges(
    oldContext: UTXONetworkContext,
    newContext: UTXONetworkContext
  ): string[] {
    const changes: string[] = [];

    if (oldContext.averageTransactionFee !== newContext.averageTransactionFee) {
      changes.push('averageTransactionFee');
    }
    if (
      oldContext.networkCongestionLevel !== newContext.networkCongestionLevel
    ) {
      changes.push('networkCongestionLevel');
    }
    if (oldContext.batteryLevel !== newContext.batteryLevel) {
      changes.push('batteryLevel');
    }
    if (oldContext.emergencyMode !== newContext.emergencyMode) {
      changes.push('emergencyMode');
    }

    return changes;
  }

  private updateCalculationStats(
    priority: MessagePriority,
    calculationTime: number
  ): void {
    this.calculationStats.totalCalculations++;
    this.calculationStats.priorityDistribution[priority]++;

    // Update running average of calculation time
    const total = this.calculationStats.totalCalculations;
    this.calculationStats.averageCalculationTime =
      (this.calculationStats.averageCalculationTime * (total - 1) +
        calculationTime) /
      total;
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every 5 minutes
    setInterval(
      () => {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, cached] of this.priorityCache.entries()) {
          if (now - cached.timestamp > this.cacheTimeout) {
            this.priorityCache.delete(key);
            cleanedCount++;
          }
        }

        if (cleanedCount > 0) {
          this.logger.debug('Priority cache cleaned', {
            cleanedEntries: cleanedCount,
            remainingEntries: this.priorityCache.size,
          });
        }
      },
      5 * 60 * 1000
    ); // 5 minutes
  }

  // ==========================================
  // PUBLIC STATISTICS
  // ==========================================

  getCalculationStats() {
    return {
      ...this.calculationStats,
      cacheSize: this.priorityCache.size,
      cacheHitRate:
        this.calculationStats.totalCalculations > 0
          ? this.calculationStats.cacheHits /
            this.calculationStats.totalCalculations
          : 0,
    };
  }

  resetStats(): void {
    this.calculationStats = {
      totalCalculations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      priorityDistribution: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      averageCalculationTime: 0,
    };

    this.logger.info('Priority calculation statistics reset');
  }
}
