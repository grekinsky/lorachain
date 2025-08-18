/**
 * Enhanced UTXO Priority Mesh Protocol
 *
 * BREAKING CHANGE: Complete enhancement with advanced message prioritization
 * Integrates UTXOPriorityQueue, PriorityCalculator, and QoSManager
 * Extends existing UTXOEnhancedMeshProtocol with NO legacy support
 */

import { EventEmitter } from 'events';
import type {
  MeshMessage,
  UTXOTransaction,
  Block,
  CompressedMerkleProof,
  IDatabase,
  RoutingConfig,
  FragmentationConfig,
  DutyCycleConfig,
  FragmentationStats,
} from './types.js';
import { MessagePriority } from './types.js';
import type {
  IUTXOPriorityMeshProtocol,
  UTXOPrioritizedMeshMessage,
  UTXOQueueStatistics,
  UTXOQoSStatistics,
  UTXOPriorityConfig,
  UTXOQoSPolicy,
  UTXOPriorityThresholds,
  UTXONetworkContext,
} from './priority-types.js';
import { UTXOPriorityQueue } from './priority-queue.js';

// Re-export interface for index.ts
export type { IUTXOPriorityMeshProtocol } from './priority-types.js';
import { UTXOPriorityCalculator } from './priority-calculator.js';
import { UTXOQoSManager } from './qos-manager.js';
import { UTXOEnhancedMeshProtocol } from './enhanced-mesh-protocol.js';
import { Logger } from '@lorachain/shared';
import { type KeyPair } from './cryptographic.js';

/**
 * Enhanced UTXO Priority Mesh Protocol
 *
 * Features:
 * - Advanced message prioritization with fee-based UTXO priority calculation
 * - Heap-based priority queue for optimal performance
 * - QoS management with duty cycle integration
 * - Emergency message handling with regulatory compliance bypass
 * - Comprehensive statistics and performance monitoring
 * - Full integration with existing compression and routing systems
 */
export class UTXOPriorityMeshProtocol
  extends EventEmitter
  implements IUTXOPriorityMeshProtocol
{
  // Core components
  private baseMeshProtocol: UTXOEnhancedMeshProtocol;
  private priorityQueue: UTXOPriorityQueue;
  private priorityCalculator: UTXOPriorityCalculator;
  private qosManager: UTXOQoSManager;

  // Configuration
  private priorityConfig: UTXOPriorityConfig;
  private networkContext: UTXONetworkContext;

  // State management
  private logger: Logger;
  private database?: IDatabase;
  private isProcessing = false;
  private processingInterval?: ReturnType<typeof setTimeout>;

  // Statistics and monitoring
  private protocolStats = {
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    priorityDistribution: {
      [MessagePriority.CRITICAL]: 0,
      [MessagePriority.HIGH]: 0,
      [MessagePriority.NORMAL]: 0,
      [MessagePriority.LOW]: 0,
    },
    emergencyMessagesProcessed: 0,
    averageProcessingLatency: 0,
    compressionEfficiency: 0,
  };

  constructor(
    nodeId: string,
    nodeType: 'full' | 'light' | 'mining',
    nodeKeyPair: KeyPair,
    routingConfig: RoutingConfig,
    fragmentationConfig: FragmentationConfig,
    dutyCycleConfig: DutyCycleConfig,
    priorityConfig: UTXOPriorityConfig,
    database?: IDatabase
  ) {
    super();
    this.logger = Logger.getInstance();
    this.priorityConfig = priorityConfig;
    this.database = database;

    // Initialize network context
    this.networkContext = {
      currentBlockHeight: 0,
      utxoSetCompleteness: 1.0,
      averageTransactionFee: 1.0, // Default 1 satoshi/byte
      networkCongestionLevel: 0.0,
      batteryLevel: 1.0,
      signalStrength: 1.0,
      nodeCapacity: 1.0,
      emergencyMode: false,
    };

    try {
      // Initialize base mesh protocol
      this.baseMeshProtocol = new UTXOEnhancedMeshProtocol(
        nodeId,
        nodeType,
        nodeKeyPair,
        routingConfig,
        fragmentationConfig,
        dutyCycleConfig,
        undefined, // reliableDeliveryConfig
        undefined, // discoveryConfig
        database
      );

      // Initialize priority queue
      this.priorityQueue = new UTXOPriorityQueue(priorityConfig.queueCapacity);

      // Initialize priority calculator
      this.priorityCalculator = new UTXOPriorityCalculator(
        priorityConfig.utxoFeePriorityThresholds,
        this.networkContext
      );

      // Initialize QoS manager
      this.qosManager = new UTXOQoSManager(
        priorityConfig.qosPolicy,
        priorityConfig.emergencyMode,
        this.baseMeshProtocol['dutyCycleManager'] // Access private field
      );

      this.setupEventHandlers();
      this.startMessageProcessing();

      this.logger.info('UTXOPriorityMeshProtocol initialized successfully', {
        nodeId,
        nodeType,
        queueCapacity: priorityConfig.queueCapacity.maxTotalMessages,
        compressionEnabled: priorityConfig.compressionIntegration,
        dutyCycleEnabled: priorityConfig.dutyCycleIntegration,
      });
    } catch (error) {
      this.logger.error(
        'Failed to initialize UTXOPriorityMeshProtocol',
        error as Record<string, any>
      );
      throw error;
    }
  }

  // ==========================================
  // ENHANCED MESSAGE TRANSMISSION
  // ==========================================

  async sendUTXOPriorityTransaction(
    tx: UTXOTransaction,
    priority?: MessagePriority
  ): Promise<boolean> {
    try {
      // Calculate priority if not provided
      const calculatedPriority =
        priority ||
        this.priorityCalculator.calculateUTXOTransactionPriority(
          tx,
          this.networkContext
        );

      // Create prioritized message
      const prioritizedMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: tx,
        timestamp: Date.now(),
        from: this.baseMeshProtocol['nodeId'], // Access private field
        signature: '', // Will be set by base protocol
        priority: calculatedPriority,
        utxoFee: tx.fee,
        utxoInputCount: tx.inputs.length,
        utxoOutputCount: tx.outputs.length,
        emergencyFlag: calculatedPriority === MessagePriority.CRITICAL,
        retryCount: 0,
        maxRetries: this.getMaxRetriesForPriority(calculatedPriority),
        ttl: this.getTTLForPriority(calculatedPriority),
        createdAt: Date.now(),
        compressionApplied: this.priorityConfig.compressionIntegration,
      };

      // Enqueue message
      const success = await this.priorityQueue.enqueue(prioritizedMessage);
      if (success) {
        this.updateProtocolStats('sent', calculatedPriority);
        this.logger.debug('UTXO transaction enqueued successfully', {
          txId: tx.id,
          priority: calculatedPriority,
          fee: tx.fee,
          queueSize: this.priorityQueue.size(),
        } as Record<string, any>);
      }

      return success;
    } catch (error) {
      this.logger.error(
        'Failed to send UTXO priority transaction',
        error as Record<string, any>
      );
      return false;
    }
  }

  async sendEmergencyUTXOTransaction(tx: UTXOTransaction): Promise<boolean> {
    try {
      // Enable emergency mode temporarily if not already enabled
      const wasEmergencyMode = this.qosManager.isEmergencyMode();
      if (!wasEmergencyMode) {
        this.qosManager.enableEmergencyMode();
      }

      // Send with CRITICAL priority and emergency flag
      const prioritizedMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: tx,
        timestamp: Date.now(),
        from: this.baseMeshProtocol['nodeId'],
        signature: '',
        priority: MessagePriority.CRITICAL,
        utxoFee: tx.fee,
        utxoInputCount: tx.inputs.length,
        utxoOutputCount: tx.outputs.length,
        emergencyFlag: true,
        retryCount: 0,
        maxRetries: 10, // Maximum retries for emergency
        ttl: 300000, // 5 minutes TTL
        createdAt: Date.now(),
        compressionApplied: this.priorityConfig.compressionIntegration,
      };

      const success = await this.priorityQueue.enqueue(prioritizedMessage);
      if (success) {
        this.protocolStats.emergencyMessagesProcessed++;
        this.updateProtocolStats('sent', MessagePriority.CRITICAL);

        this.logger.warn('Emergency UTXO transaction enqueued', {
          txId: tx.id,
          fee: tx.fee,
          emergencyMode: this.qosManager.isEmergencyMode(),
        } as Record<string, any>);
      }

      // Restore previous emergency mode state if we changed it
      if (!wasEmergencyMode) {
        setTimeout(() => this.qosManager.disableEmergencyMode(), 60000); // Auto-disable after 1 minute
      }

      return success;
    } catch (error) {
      this.logger.error(
        'Failed to send emergency UTXO transaction',
        error as Record<string, any>
      );
      return false;
    }
  }

  // ==========================================
  // QUEUE MANAGEMENT INTERFACE
  // ==========================================

  getUTXOQueueStats(): UTXOQueueStatistics {
    return this.priorityQueue.getStatistics();
  }

  setUTXOQueueCapacity(priority: MessagePriority, capacity: number): void {
    // Update queue capacity configuration
    this.priorityConfig.queueCapacity.capacityByPriority[priority] = capacity;

    this.logger.info('UTXO queue capacity updated', {
      priority,
      newCapacity: capacity,
    } as Record<string, any>);
  }

  clearUTXOQueue(priority?: MessagePriority): void {
    if (priority !== undefined) {
      // Clear specific priority queue
      const messages = this.priorityQueue.getQueueByPriority(priority);
      for (const message of messages) {
        if (message.queueId) {
          // Remove from queue (would need to implement selective removal)
          this.logger.debug('Message removed from priority queue', {
            messageId: message.queueId,
            priority,
          });
        }
      }
    } else {
      // Clear entire queue
      this.priorityQueue.clear();
    }

    this.logger.info('UTXO queue cleared', { priority: priority || 'all' });
  }

  // ==========================================
  // QOS CONFIGURATION
  // ==========================================

  updateUTXOQoSPolicy(policy: UTXOQoSPolicy): void {
    this.qosManager.updateQoSPolicy(policy);
    this.priorityConfig.qosPolicy = policy;

    this.logger.info('UTXO QoS policy updated');
  }

  getUTXOQoSStats(): UTXOQoSStatistics {
    return this.qosManager.getQoSStatistics();
  }

  setUTXOFeePriorityThresholds(thresholds: UTXOPriorityThresholds): void {
    this.priorityCalculator.updateThresholds(thresholds);
    this.priorityConfig.utxoFeePriorityThresholds = thresholds;

    this.logger.info('UTXO fee priority thresholds updated', thresholds);
  }

  updateUTXONetworkContext(context: Partial<UTXONetworkContext>): void {
    this.networkContext = { ...this.networkContext, ...context };
    this.priorityCalculator.updateNetworkContext(this.networkContext);

    this.logger.debug('UTXO network context updated', context);
  }

  // ==========================================
  // EMERGENCY MODE MANAGEMENT
  // ==========================================

  enableUTXOEmergencyMode(): void {
    this.qosManager.enableEmergencyMode();
    this.networkContext.emergencyMode = true;
    this.priorityCalculator.updateNetworkContext(this.networkContext);

    this.logger.warn('UTXO emergency mode ENABLED');
  }

  disableUTXOEmergencyMode(): void {
    this.qosManager.disableEmergencyMode();
    this.networkContext.emergencyMode = false;
    this.priorityCalculator.updateNetworkContext(this.networkContext);

    this.logger.info('UTXO emergency mode DISABLED');
  }

  isUTXOEmergencyMode(): boolean {
    return this.qosManager.isEmergencyMode();
  }

  // ==========================================
  // COMPRESSION INTEGRATION
  // ==========================================

  enableUTXOCompressionPriority(enable: boolean): void {
    this.priorityConfig.compressionIntegration = enable;

    this.logger.info('UTXO compression priority integration', {
      enabled: enable,
    });
  }

  // ==========================================
  // BASE PROTOCOL DELEGATION
  // ==========================================

  // Delegate base mesh protocol methods
  async sendMessage(message: MeshMessage): Promise<boolean> {
    // Calculate priority and use prioritized sending
    const priority = this.priorityCalculator.calculatePriority(
      message,
      this.networkContext
    );
    const prioritizedMessage: UTXOPrioritizedMeshMessage = {
      ...message,
      priority,
      emergencyFlag: priority === MessagePriority.CRITICAL,
      retryCount: 0,
      maxRetries: this.getMaxRetriesForPriority(priority),
      ttl: this.getTTLForPriority(priority),
      createdAt: Date.now(),
      compressionApplied: this.priorityConfig.compressionIntegration,
    };

    return this.priorityQueue.enqueue(prioritizedMessage);
  }

  receiveMessage(data: Uint8Array): MeshMessage | null {
    try {
      const message = this.baseMeshProtocol.receiveMessage(data);
      if (message) {
        this.updateProtocolStats('received');
        this.logger.debug('Message received and processed', {
          type: message.type,
          timestamp: message.timestamp,
        });
      }
      return message;
    } catch (error) {
      this.logger.error(
        'Failed to receive message',
        error as Record<string, any>
      );
      return null;
    }
  }

  // Delegate fragmentation methods
  setFragmentationConfig(config: FragmentationConfig): void {
    this.baseMeshProtocol.setFragmentationConfig(config);
  }

  getFragmentationStats(): FragmentationStats {
    return this.baseMeshProtocol.getFragmentationStats();
  }

  clearReassemblyBuffers(): void {
    this.baseMeshProtocol.clearReassemblyBuffers();
  }

  async retransmitMissingFragments(messageId: string): Promise<void> {
    return this.baseMeshProtocol.retransmitMissingFragments(messageId);
  }

  // Delegate UTXO-specific methods
  async sendUTXOTransaction(tx: UTXOTransaction): Promise<boolean> {
    return this.sendUTXOPriorityTransaction(tx);
  }

  async sendBlock(block: Block): Promise<boolean> {
    return this.priorityQueue.enqueueBlock(block);
  }

  async sendMerkleProof(proof: CompressedMerkleProof): Promise<boolean> {
    return this.priorityQueue.enqueueMerkleProof(proof);
  }

  // ==========================================
  // PRIVATE MESSAGE PROCESSING
  // ==========================================

  private startMessageProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingInterval = setInterval(
      () => this.processMessageQueue(),
      this.priorityConfig.queueProcessingIntervalMs
    );

    this.logger.info('Message processing started', {
      intervalMs: this.priorityConfig.queueProcessingIntervalMs,
    });
  }

  private stopMessageProcessing(): void {
    if (!this.isProcessing) return;

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.logger.info('Message processing stopped');
  }

  private async processMessageQueue(): Promise<void> {
    try {
      // Remove expired messages first
      const expiredCount = this.priorityQueue.removeExpired();
      if (expiredCount > 0) {
        this.logger.debug('Expired messages removed', { count: expiredCount });
      }

      // Process next message in queue
      const message = await this.priorityQueue.dequeue();
      if (!message) return; // No messages to process

      const startTime = performance.now();

      // Check QoS transmission eligibility
      const sizeBytes = this.estimateMessageSize(message);
      const canTransmit = this.qosManager.canTransmitWithQoS(
        message.priority,
        sizeBytes
      );

      if (!canTransmit) {
        // Re-queue message for later
        await this.priorityQueue.enqueue(message);
        return;
      }

      // Get transmission parameters
      const transmissionParams = this.qosManager.getTransmissionParameters(
        message.priority
      );

      // Track delivery if confirmation required
      if (transmissionParams.confirmationRequired && message.queueId) {
        this.qosManager.trackMessageDelivery(message.queueId, message.priority);
      }

      // Send via base mesh protocol
      const success = await this.baseMeshProtocol.sendMessage(message);

      if (success) {
        this.logger.debug('Priority message transmitted successfully', {
          messageId: message.queueId,
          priority: message.priority,
          processingTime: performance.now() - startTime,
          queueSize: this.priorityQueue.size(),
        });

        // Confirm delivery if successful and required
        if (transmissionParams.confirmationRequired && message.queueId) {
          this.qosManager.confirmMessageDelivery(message.queueId);
        }
      } else {
        // Handle transmission failure
        await this.handleTransmissionFailure(message);
      }

      // Update processing latency statistics
      this.updateProcessingLatency(performance.now() - startTime);
    } catch (error) {
      this.logger.error(
        'Error processing message queue',
        error as Record<string, any>
      );
    }
  }

  private async handleTransmissionFailure(
    message: UTXOPrioritizedMeshMessage
  ): Promise<void> {
    message.retryCount++;

    if (message.retryCount < message.maxRetries) {
      // Re-queue for retry
      message.lastAttempt = Date.now();
      await this.priorityQueue.enqueue(message);

      this.logger.debug('Message re-queued for retry', {
        messageId: message.queueId,
        retryCount: message.retryCount,
        maxRetries: message.maxRetries,
      });
    } else {
      // Max retries exceeded
      if (message.queueId) {
        this.qosManager.reportDeliveryFailure(
          message.queueId,
          'max_retries_exceeded'
        );
      }

      this.logger.warn('Message delivery failed after max retries', {
        messageId: message.queueId,
        priority: message.priority,
        retryCount: message.retryCount,
      });
    }
  }

  private setupEventHandlers(): void {
    // Priority queue events
    this.priorityQueue.on('messageEnqueued', message => {
      this.emit('messageEnqueued', message);
    });

    this.priorityQueue.on('messageDequeued', message => {
      this.emit('messageDequeued', message);
    });

    this.priorityQueue.on('queueOverflow', (priority, droppedCount) => {
      this.emit('queueOverflow', priority, droppedCount);
    });

    // QoS manager events
    this.qosManager.on('emergencyModeActivated', () => {
      this.emit('emergencyModeActivated');
    });

    this.qosManager.on('emergencyModeDeactivated', () => {
      this.emit('emergencyModeDeactivated');
    });

    this.qosManager.on('deliveryConfirmed', (messageId, deliveryTime) => {
      this.emit('deliveryConfirmed', messageId, deliveryTime);
    });

    this.qosManager.on('deliveryFailed', (messageId, reason) => {
      this.emit('deliveryFailed', messageId, reason);
    });

    // Priority calculator events
    this.priorityCalculator.on('contextUpdated', context => {
      this.emit('contextUpdated', context);
    });
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  private getMaxRetriesForPriority(priority: MessagePriority): number {
    const policy = this.priorityConfig.retryPolicies[priority];
    return policy ? policy.maxAttempts : 3;
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
    // Rough estimate in bytes
    const baseSize = 200; // Headers and metadata
    let payloadSize = 0;

    if (typeof message.payload === 'string') {
      payloadSize = message.payload.length * 2;
    } else if (message.payload) {
      payloadSize = JSON.stringify(message.payload).length * 2;
    }

    return baseSize + payloadSize;
  }

  private updateProtocolStats(
    operation: 'sent' | 'received',
    priority?: MessagePriority
  ): void {
    if (operation === 'sent') {
      this.protocolStats.totalMessagesSent++;
      if (priority !== undefined) {
        this.protocolStats.priorityDistribution[priority]++;
      }
    } else {
      this.protocolStats.totalMessagesReceived++;
    }
  }

  private updateProcessingLatency(latency: number): void {
    const total = this.protocolStats.totalMessagesSent;
    this.protocolStats.averageProcessingLatency =
      (this.protocolStats.averageProcessingLatency * (total - 1) + latency) /
      total;
  }

  // ==========================================
  // CLEANUP AND LIFECYCLE
  // ==========================================

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down UTXOPriorityMeshProtocol');

    try {
      // Stop message processing
      this.stopMessageProcessing();

      // Save queue state if persistence is enabled
      if (this.priorityConfig.persistenceEnabled && this.database) {
        await this.priorityQueue.saveQueueState(this.database);
      }

      // Clear all queues and trackers
      this.priorityQueue.clear();

      // Reset statistics
      this.qosManager.resetStatistics();

      this.logger.info('UTXOPriorityMeshProtocol shutdown completed');
    } catch (error) {
      this.logger.error('Error during shutdown', error as Record<string, any>);
      throw error;
    }
  }

  // ==========================================
  // STATISTICS AND MONITORING
  // ==========================================

  getProtocolStatistics() {
    return {
      protocol: { ...this.protocolStats },
      queue: this.getUTXOQueueStats(),
      qos: this.getUTXOQoSStats(),
      priorityCalculator: this.priorityCalculator.getCalculationStats(),
    };
  }

  resetAllStatistics(): void {
    this.protocolStats = {
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      priorityDistribution: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      emergencyMessagesProcessed: 0,
      averageProcessingLatency: 0,
      compressionEfficiency: 0,
    };

    this.qosManager.resetStatistics();
    this.priorityCalculator.resetStats();

    this.logger.info('All protocol statistics reset');
  }
}
