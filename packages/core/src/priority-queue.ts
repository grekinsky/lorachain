/**
 * Enhanced UTXO Priority Message Queue
 *
 * BREAKING CHANGE: Advanced heap-based priority queue with UTXO-aware features
 * Integrates with existing MessagePriority enum and DutyCycleManager
 * NO legacy support - UTXO-only architecture
 */

import { EventEmitter } from 'events';
import type {
  MeshMessage,
  UTXOTransaction,
  Block,
  CompressedMerkleProof,
  IDatabase,
} from './types.js';
import { MessagePriority } from './types.js';
import type {
  UTXOPrioritizedMeshMessage,
  UTXOQueueStatistics,
  QueueCapacityConfig,
  IUTXOPriorityQueue,
  PriorityEvents,
  UTXONetworkContext,
} from './priority-types.js';
import { Logger } from '@lorachain/shared';
import { v4 as uuidv4 } from 'uuid';

// Re-export interface for index.ts
export type { IUTXOPriorityQueue } from './priority-types.js';

/**
 * Heap-based priority queue node
 */
interface PriorityQueueNode {
  message: UTXOPrioritizedMeshMessage;
  priority: number; // Numerical priority for heap (lower = higher priority)
  insertTime: number; // For age-based tiebreaking
  utxoFeeScore: number; // Cached UTXO fee score
}

/**
 * Enhanced UTXO Priority Queue with heap-based data structure
 *
 * Features:
 * - Heap-based implementation for O(log n) operations
 * - UTXO fee-based priority calculation
 * - Age-based priority boosting
 * - Fair queuing within priority levels
 * - Emergency message preemption
 * - Memory management with bounded queues
 * - Persistence integration with existing database
 */
export class UTXOPriorityQueue
  extends EventEmitter
  implements IUTXOPriorityQueue
{
  private heap: PriorityQueueNode[] = [];
  private messageIndex: Map<string, number> = new Map(); // messageId -> heap index
  private priorityCounters: Map<MessagePriority, number> = new Map();
  private capacityConfig: QueueCapacityConfig;
  private logger: Logger;
  private totalMemoryUsage = 0;
  private processedMessages = 0;
  private expiredMessages = 0;
  private emergencyReserveUsed = 0;

  // Statistics tracking
  private stats: {
    totalEnqueued: number;
    totalDequeued: number;
    priorityDistribution: Record<MessagePriority, number>;
    averageWaitTimes: Record<MessagePriority, number>;
    utxoFeeDistribution: { highFee: number; normalFee: number; lowFee: number };
    emergencyMessages: number;
    compressionSavings: number;
  };

  constructor(capacityConfig: QueueCapacityConfig) {
    super();
    this.capacityConfig = capacityConfig;
    this.logger = Logger.getInstance();

    // Initialize priority counters
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.priorityCounters.set(priority, 0);
      }
    });

    // Initialize statistics
    this.stats = {
      totalEnqueued: 0,
      totalDequeued: 0,
      priorityDistribution: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      averageWaitTimes: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      utxoFeeDistribution: { highFee: 0, normalFee: 0, lowFee: 0 },
      emergencyMessages: 0,
      compressionSavings: 0,
    };

    this.logger.info('UTXOPriorityQueue initialized', {
      maxCapacity: capacityConfig.maxTotalMessages,
      memoryLimit: capacityConfig.memoryLimitBytes,
    });
  }

  // ==========================================
  // BASIC QUEUE OPERATIONS
  // ==========================================

  async enqueue(message: UTXOPrioritizedMeshMessage): Promise<boolean> {
    try {
      // Check capacity limits
      if (!this.checkCapacityLimits(message)) {
        return false;
      }

      // Estimate memory usage
      const messageSize = this.estimateMessageSize(message);
      if (
        this.totalMemoryUsage + messageSize >
        this.capacityConfig.memoryLimitBytes
      ) {
        this.logger.warn('Memory limit exceeded, attempting to free space');
        if (!this.freeMemorySpace(messageSize)) {
          return false;
        }
      }

      // Assign unique queue ID if not present
      if (!message.queueId) {
        message.queueId = uuidv4();
      }

      // Create heap node with calculated priority
      const priorityScore = this.calculatePriorityScore(message);
      const utxoFeeScore = this.calculateUTXOFeeScore(message);

      const node: PriorityQueueNode = {
        message,
        priority: priorityScore,
        insertTime: Date.now(),
        utxoFeeScore,
      };

      // Insert into heap
      this.heapInsert(node);

      // Update statistics
      this.updateEnqueueStats(message, messageSize);

      // Emit event
      this.emit('messageEnqueued', message);

      this.logger.debug('Message enqueued successfully', {
        messageId: message.queueId,
        priority: message.priority,
        utxoFee: message.utxoFee,
        queueSize: this.heap.length,
      });

      return true;
    } catch (error) {
      this.logger.error(
        'Failed to enqueue message',
        error as Record<string, any>
      );
      return false;
    }
  }

  async dequeue(): Promise<UTXOPrioritizedMeshMessage | null> {
    if (this.heap.length === 0) {
      return null;
    }

    try {
      // Extract highest priority message
      const node = this.heapExtractMax();
      if (!node) return null;

      const message = node.message;

      // Update statistics
      this.updateDequeueStats(message);

      // Emit event
      this.emit('messageDequeued', message);

      this.logger.debug('Message dequeued successfully', {
        messageId: message.queueId,
        priority: message.priority,
        waitTime: Date.now() - message.createdAt,
        queueSize: this.heap.length,
      });

      return message;
    } catch (error) {
      this.logger.error(
        'Failed to dequeue message',
        error as Record<string, any>
      );
      return null;
    }
  }

  peek(): UTXOPrioritizedMeshMessage | null {
    return this.heap.length > 0 ? this.heap[0].message : null;
  }

  size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
    this.messageIndex.clear();
    this.priorityCounters.forEach((_, key) =>
      this.priorityCounters.set(key, 0)
    );
    this.totalMemoryUsage = 0;
    this.emergencyReserveUsed = 0;
    this.logger.info('Queue cleared');
  }

  // ==========================================
  // PRIORITY-SPECIFIC OPERATIONS
  // ==========================================

  async enqueueWithPriority(
    message: MeshMessage,
    priority: MessagePriority
  ): Promise<boolean> {
    const prioritizedMessage: UTXOPrioritizedMeshMessage = {
      ...message,
      priority,
      emergencyFlag: priority === MessagePriority.CRITICAL,
      retryCount: 0,
      maxRetries: this.getMaxRetriesForPriority(priority),
      ttl: this.getTTLForPriority(priority),
      createdAt: Date.now(),
      compressionApplied: false,
    };

    return this.enqueue(prioritizedMessage);
  }

  async dequeueByPriority(
    priority: MessagePriority
  ): Promise<UTXOPrioritizedMeshMessage | null> {
    // Find first message with specified priority
    for (let i = 0; i < this.heap.length; i++) {
      if (this.heap[i].message.priority === priority) {
        const node = this.heapRemoveAt(i);
        if (node) {
          this.updateDequeueStats(node.message);
          this.emit('messageDequeued', node.message);
          return node.message;
        }
      }
    }
    return null;
  }

  getQueueByPriority(priority: MessagePriority): UTXOPrioritizedMeshMessage[] {
    return this.heap
      .filter(node => node.message.priority === priority)
      .map(node => node.message);
  }

  // ==========================================
  // UTXO-SPECIFIC OPERATIONS
  // ==========================================

  async enqueueUTXOTransaction(
    tx: UTXOTransaction,
    emergencyFlag = false
  ): Promise<boolean> {
    const priority = this.calculateUTXOTransactionPriority(tx);
    const message: UTXOPrioritizedMeshMessage = {
      type: 'transaction',
      payload: tx,
      timestamp: Date.now(),
      from: 'local',
      signature: '', // Would be populated by mesh protocol
      priority,
      utxoFee: tx.fee,
      utxoInputCount: tx.inputs.length,
      utxoOutputCount: tx.outputs.length,
      emergencyFlag,
      retryCount: 0,
      maxRetries: this.getMaxRetriesForPriority(priority),
      ttl: this.getTTLForPriority(priority),
      createdAt: Date.now(),
      compressionApplied: false,
    };

    return this.enqueue(message);
  }

  async enqueueBlock(block: Block): Promise<boolean> {
    const message: UTXOPrioritizedMeshMessage = {
      type: 'block',
      payload: block,
      timestamp: Date.now(),
      from: 'local',
      signature: '', // Would be populated by mesh protocol
      priority: MessagePriority.CRITICAL, // Blocks always get critical priority
      blockHeight: block.index,
      emergencyFlag: false,
      retryCount: 0,
      maxRetries: this.getMaxRetriesForPriority(MessagePriority.CRITICAL),
      ttl: this.getTTLForPriority(MessagePriority.CRITICAL),
      createdAt: Date.now(),
      compressionApplied: false,
    };

    return this.enqueue(message);
  }

  async enqueueMerkleProof(proof: CompressedMerkleProof): Promise<boolean> {
    const message: UTXOPrioritizedMeshMessage = {
      type: 'sync',
      payload: proof,
      timestamp: Date.now(),
      from: 'local',
      signature: '', // Would be populated by mesh protocol
      priority: MessagePriority.HIGH, // SPV proofs get high priority
      emergencyFlag: false,
      retryCount: 0,
      maxRetries: this.getMaxRetriesForPriority(MessagePriority.HIGH),
      ttl: this.getTTLForPriority(MessagePriority.HIGH),
      createdAt: Date.now(),
      compressionApplied: false,
    };

    return this.enqueue(message);
  }

  // ==========================================
  // MANAGEMENT OPERATIONS
  // ==========================================

  removeExpired(): number {
    const now = Date.now();
    let removedCount = 0;

    // Remove expired messages (iterate backwards to avoid index issues)
    for (let i = this.heap.length - 1; i >= 0; i--) {
      const node = this.heap[i];
      if (node.message.createdAt + node.message.ttl < now) {
        this.heapRemoveAt(i);
        removedCount++;
        this.expiredMessages++;

        this.logger.debug('Expired message removed', {
          messageId: node.message.queueId,
          age: now - node.message.createdAt,
          ttl: node.message.ttl,
        });
      }
    }

    if (removedCount > 0) {
      this.logger.info(`Removed ${removedCount} expired messages`);
    }

    return removedCount;
  }

  updatePriority(messageId: string, newPriority: MessagePriority): boolean {
    for (let i = 0; i < this.heap.length; i++) {
      if (this.heap[i].message.queueId === messageId) {
        const oldPriority = this.heap[i].message.priority;
        this.heap[i].message.priority = newPriority;
        this.heap[i].priority = this.calculatePriorityScore(
          this.heap[i].message
        );

        // Reheapify to maintain heap property
        this.heapify(i);

        this.emit('priorityAdjusted', messageId, oldPriority, newPriority);

        this.logger.debug('Message priority updated', {
          messageId,
          oldPriority,
          newPriority,
        });

        return true;
      }
    }

    return false;
  }

  getStatistics(): UTXOQueueStatistics {
    const now = Date.now();

    return {
      totalMessages: this.heap.length,
      messagesByPriority: {
        [MessagePriority.CRITICAL]:
          this.priorityCounters.get(MessagePriority.CRITICAL) || 0,
        [MessagePriority.HIGH]:
          this.priorityCounters.get(MessagePriority.HIGH) || 0,
        [MessagePriority.NORMAL]:
          this.priorityCounters.get(MessagePriority.NORMAL) || 0,
        [MessagePriority.LOW]:
          this.priorityCounters.get(MessagePriority.LOW) || 0,
      },
      utxoTransactionsByFeeRange: this.stats.utxoFeeDistribution,
      averageWaitTimeByPriority: this.stats.averageWaitTimes,
      compressionSavings: this.stats.compressionSavings,
      emergencyMessages: this.stats.emergencyMessages,
      expiredMessages: this.expiredMessages,
      memoryUsageBytes: this.totalMemoryUsage,
      queueHealthScore: this.calculateHealthScore(),
    };
  }

  // ==========================================
  // PERSISTENCE OPERATIONS
  // ==========================================

  async saveQueueState(database: IDatabase): Promise<void> {
    try {
      const queueData = {
        heap: this.heap.map(node => ({
          message: node.message,
          priority: node.priority,
          insertTime: node.insertTime,
          utxoFeeScore: node.utxoFeeScore,
        })),
        stats: this.stats,
        metadata: {
          totalMemoryUsage: this.totalMemoryUsage,
          processedMessages: this.processedMessages,
          expiredMessages: this.expiredMessages,
          savedAt: Date.now(),
        },
      };

      await database.put('priority_queue_state', queueData);
      this.logger.info('Queue state saved to database');
    } catch (error) {
      this.logger.error(
        'Failed to save queue state',
        error as Record<string, any>
      );
      throw error;
    }
  }

  async loadQueueState(database: IDatabase): Promise<void> {
    try {
      const queueData = await database.get<any>('priority_queue_state');
      if (!queueData) {
        this.logger.info('No saved queue state found');
        return;
      }

      // Restore heap
      this.heap = queueData.heap.map((nodeData: any) => ({
        message: nodeData.message,
        priority: nodeData.priority,
        insertTime: nodeData.insertTime,
        utxoFeeScore: nodeData.utxoFeeScore,
      }));

      // Rebuild message index
      this.messageIndex.clear();
      this.heap.forEach((node, index) => {
        if (node.message.queueId) {
          this.messageIndex.set(node.message.queueId, index);
        }
      });

      // Restore statistics
      if (queueData.stats) {
        this.stats = { ...this.stats, ...queueData.stats };
      }

      // Restore metadata
      if (queueData.metadata) {
        this.totalMemoryUsage = queueData.metadata.totalMemoryUsage || 0;
        this.processedMessages = queueData.metadata.processedMessages || 0;
        this.expiredMessages = queueData.metadata.expiredMessages || 0;
      }

      this.logger.info('Queue state loaded from database', {
        messageCount: this.heap.length,
        memoryUsage: this.totalMemoryUsage,
      });
    } catch (error) {
      this.logger.error(
        'Failed to load queue state',
        error as Record<string, any>
      );
      throw error;
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private checkCapacityLimits(message: UTXOPrioritizedMeshMessage): boolean {
    // Check total capacity
    if (this.heap.length >= this.capacityConfig.maxTotalMessages) {
      // Allow emergency messages to use reserved capacity
      if (
        message.emergencyFlag &&
        this.emergencyReserveUsed < this.capacityConfig.emergencyCapacityReserve
      ) {
        this.emergencyReserveUsed++;
        return true;
      }

      // Try to evict low priority message
      if (this.evictLowPriorityMessage()) {
        return true;
      }

      this.logger.warn('Queue capacity exceeded, message rejected');
      this.emit('queueOverflow', message.priority, 1);
      return false;
    }

    // Check priority-specific capacity
    const currentCount = this.priorityCounters.get(message.priority) || 0;
    const maxCount = this.capacityConfig.capacityByPriority[message.priority];

    if (currentCount >= maxCount && !message.emergencyFlag) {
      this.logger.warn('Priority queue capacity exceeded', {
        priority: message.priority,
        currentCount,
        maxCount,
      });
      return false;
    }

    return true;
  }

  private calculatePriorityScore(message: UTXOPrioritizedMeshMessage): number {
    // Lower score = higher priority (for min-heap behavior)
    let score = message.priority * 1000; // Base priority weight

    // Emergency messages get highest priority
    if (message.emergencyFlag) {
      score -= 10000;
    }

    // UTXO fee-based adjustment
    if (message.utxoFee && message.utxoInputCount) {
      const feePerByte =
        message.utxoFee /
        (message.utxoInputCount * 148 + message.utxoOutputCount! * 34); // Rough estimate
      score -= feePerByte * 10; // Higher fee = lower score = higher priority
    }

    // Age-based priority boost (older messages get slight priority boost)
    const age = Date.now() - message.createdAt;
    score -= Math.min(age / 1000, 100); // Max 100 point boost for age

    // Block height boost for blockchain messages
    if (message.blockHeight !== undefined) {
      score -= message.blockHeight * 0.01; // Recent blocks get priority
    }

    return score;
  }

  private calculateUTXOFeeScore(message: UTXOPrioritizedMeshMessage): number {
    if (
      !message.utxoFee ||
      !message.utxoInputCount ||
      !message.utxoOutputCount
    ) {
      return 0;
    }

    // Estimate transaction size and calculate fee per byte
    const estimatedSize =
      message.utxoInputCount * 148 + message.utxoOutputCount * 34 + 10; // Rough estimate
    return message.utxoFee / estimatedSize;
  }

  private calculateUTXOTransactionPriority(
    tx: UTXOTransaction
  ): MessagePriority {
    // Calculate fee per byte
    const estimatedSize = tx.inputs.length * 148 + tx.outputs.length * 34 + 10;
    const feePerByte = tx.fee / estimatedSize;

    // Priority thresholds (these would come from configuration)
    if (feePerByte >= 10) return MessagePriority.HIGH;
    if (feePerByte >= 1) return MessagePriority.NORMAL;
    return MessagePriority.LOW;
  }

  private getMaxRetriesForPriority(priority: MessagePriority): number {
    switch (priority) {
      case MessagePriority.CRITICAL:
        return 5;
      case MessagePriority.HIGH:
        return 3;
      case MessagePriority.NORMAL:
        return 2;
      case MessagePriority.LOW:
        return 1;
      default:
        return 1;
    }
  }

  private getTTLForPriority(priority: MessagePriority): number {
    switch (priority) {
      case MessagePriority.CRITICAL:
        return 60000; // 1 minute
      case MessagePriority.HIGH:
        return 300000; // 5 minutes
      case MessagePriority.NORMAL:
        return 600000; // 10 minutes
      case MessagePriority.LOW:
        return 1800000; // 30 minutes
      default:
        return 600000;
    }
  }

  private estimateMessageSize(message: UTXOPrioritizedMeshMessage): number {
    // Rough estimate of message size in bytes
    const baseSize = 200; // Headers and metadata
    let payloadSize = 0;

    if (typeof message.payload === 'string') {
      payloadSize = message.payload.length * 2; // UTF-8 encoding estimate
    } else if (message.payload) {
      payloadSize = JSON.stringify(message.payload).length * 2;
    }

    return baseSize + payloadSize;
  }

  private freeMemorySpace(requiredBytes: number): boolean {
    let freedBytes = 0;

    // First remove expired messages
    const expiredRemoved = this.removeExpired();
    freedBytes += expiredRemoved * 200; // Rough estimate

    if (freedBytes >= requiredBytes) return true;

    // Then evict low priority messages
    while (freedBytes < requiredBytes && this.heap.length > 0) {
      if (this.evictLowPriorityMessage()) {
        freedBytes += 200; // Rough estimate
      } else {
        break;
      }
    }

    return freedBytes >= requiredBytes;
  }

  private evictLowPriorityMessage(): boolean {
    // Find lowest priority message that's not emergency
    let lowestPriorityIndex = -1;
    let lowestPriority = MessagePriority.CRITICAL;

    for (let i = 0; i < this.heap.length; i++) {
      const node = this.heap[i];
      if (
        !node.message.emergencyFlag &&
        node.message.priority > lowestPriority
      ) {
        lowestPriority = node.message.priority;
        lowestPriorityIndex = i;
      }
    }

    if (lowestPriorityIndex >= 0) {
      const node = this.heapRemoveAt(lowestPriorityIndex);
      if (node) {
        this.logger.debug('Evicted low priority message', {
          messageId: node.message.queueId,
          priority: node.message.priority,
        });
        return true;
      }
    }

    return false;
  }

  private updateEnqueueStats(
    message: UTXOPrioritizedMeshMessage,
    size: number
  ): void {
    this.stats.totalEnqueued++;
    this.stats.priorityDistribution[message.priority]++;
    this.priorityCounters.set(
      message.priority,
      (this.priorityCounters.get(message.priority) || 0) + 1
    );
    this.totalMemoryUsage += size;

    if (message.emergencyFlag) {
      this.stats.emergencyMessages++;
    }

    // Update UTXO fee distribution
    if (message.utxoFee && message.utxoInputCount && message.utxoOutputCount) {
      const feePerByte = this.calculateUTXOFeeScore(message);
      if (feePerByte >= 10) {
        this.stats.utxoFeeDistribution.highFee++;
      } else if (feePerByte >= 1) {
        this.stats.utxoFeeDistribution.normalFee++;
      } else {
        this.stats.utxoFeeDistribution.lowFee++;
      }
    }
  }

  private updateDequeueStats(message: UTXOPrioritizedMeshMessage): void {
    this.stats.totalDequeued++;
    const count = this.priorityCounters.get(message.priority) || 0;
    this.priorityCounters.set(message.priority, Math.max(0, count - 1));

    // Update average wait time
    const waitTime = Date.now() - message.createdAt;
    const currentAvg = this.stats.averageWaitTimes[message.priority];
    const totalProcessed = this.stats.priorityDistribution[message.priority];
    this.stats.averageWaitTimes[message.priority] =
      (currentAvg * (totalProcessed - 1) + waitTime) / totalProcessed;
  }

  private calculateHealthScore(): number {
    // Calculate queue health score (0-1, where 1 is perfect health)
    let score = 1.0;

    // Penalize high memory usage
    const memoryUtilization =
      this.totalMemoryUsage / this.capacityConfig.memoryLimitBytes;
    score -= Math.max(0, memoryUtilization - 0.8) * 0.5;

    // Penalize high queue utilization
    const queueUtilization =
      this.heap.length / this.capacityConfig.maxTotalMessages;
    score -= Math.max(0, queueUtilization - 0.8) * 0.3;

    // Penalize high expired message rate
    const expiredRate =
      this.expiredMessages / Math.max(1, this.processedMessages);
    score -= Math.min(expiredRate * 0.2, 0.2);

    return Math.max(0, score);
  }

  // ==========================================
  // HEAP OPERATIONS
  // ==========================================

  private heapInsert(node: PriorityQueueNode): void {
    this.heap.push(node);
    this.heapifyUp(this.heap.length - 1);

    // Update message index
    if (node.message.queueId) {
      this.messageIndex.set(node.message.queueId, this.heap.length - 1);
    }
  }

  private heapExtractMax(): PriorityQueueNode | null {
    if (this.heap.length === 0) return null;

    const max = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.heapifyDown(0);
    }

    // Update message index
    if (max.message.queueId) {
      this.messageIndex.delete(max.message.queueId);
    }

    return max;
  }

  private heapRemoveAt(index: number): PriorityQueueNode | null {
    if (index >= this.heap.length) return null;

    const node = this.heap[index];
    const last = this.heap.pop();

    if (index < this.heap.length && last) {
      this.heap[index] = last;
      this.heapify(index);
    }

    // Update message index
    if (node.message.queueId) {
      this.messageIndex.delete(node.message.queueId);
    }

    return node;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;

      this.heapSwap(parentIndex, index);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].priority < this.heap[minIndex].priority
      ) {
        minIndex = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].priority < this.heap[minIndex].priority
      ) {
        minIndex = rightChild;
      }

      if (minIndex === index) break;

      this.heapSwap(index, minIndex);
      index = minIndex;
    }
  }

  private heapify(index: number): void {
    this.heapifyUp(index);
    this.heapifyDown(index);
  }

  private heapSwap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];

    // Update message index
    if (this.heap[i].message.queueId) {
      this.messageIndex.set(this.heap[i].message.queueId, i);
    }
    if (this.heap[j].message.queueId) {
      this.messageIndex.set(this.heap[j].message.queueId, j);
    }
  }
}
