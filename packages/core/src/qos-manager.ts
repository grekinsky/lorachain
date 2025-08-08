/**
 * UTXO QoS Manager
 *
 * BREAKING CHANGE: Advanced QoS management for UTXO-aware mesh protocol
 * Integrates with existing DutyCycleManager and MessagePriority system
 * NO legacy support - UTXO-only architecture
 */

import { EventEmitter } from 'events';
import type { MeshMessage, IDutyCycleManager } from './types.js';
import { MessagePriority } from './types.js';
import type {
  UTXOQoSPolicy,
  TransmissionParams,
  UTXOQoSStatistics,
  IQoSManager,
  EmergencyModeConfig,
  DeliveryTracker,
} from './priority-types.js';
import { Logger } from '@lorachain/shared';

// Re-export interface for index.ts
export type { IQoSManager } from './priority-types.js';

/**
 * QoS level statistics tracking
 */
interface QoSLevelStats {
  messagesSent: number;
  messagesFailed: number;
  totalDeliveryTime: number;
  totalCompressionSavings: number;
  totalDutyCycleUsage: number;
  lastTransmission: number;
}

/**
 * UTXO Quality of Service Manager
 *
 * Features:
 * - QoS level assignment based on message type and priority
 * - Transmission parameters management per priority level
 * - Integration with existing DutyCycleManager for regulatory compliance
 * - Emergency mode with duty cycle exemptions
 * - Delivery confirmation tracking
 * - Performance monitoring and statistics
 * - Dynamic policy adjustment based on network conditions
 */
export class UTXOQoSManager extends EventEmitter implements IQoSManager {
  private qosPolicy: UTXOQoSPolicy;
  private emergencyConfig: EmergencyModeConfig;
  private dutyCycleManager?: IDutyCycleManager;
  private logger: Logger;

  // Statistics tracking
  private qosStats: Map<MessagePriority, QoSLevelStats> = new Map();
  private globalStats: {
    totalMessages: number;
    emergencyOverrides: number;
    totalBytesTransmitted: number;
    averageNetworkEfficiency: number;
    lastStatisticsReset: number;
  };

  // Delivery tracking
  private deliveryTrackers: Map<string, DeliveryTracker> = new Map();
  private emergencyMode = false;

  // Performance monitoring
  private networkEfficiencyWindow: number[] = [];
  private maxEfficiencyWindowSize = 100;

  constructor(
    qosPolicy: UTXOQoSPolicy,
    emergencyConfig: EmergencyModeConfig,
    dutyCycleManager?: IDutyCycleManager
  ) {
    super();
    this.qosPolicy = qosPolicy;
    this.emergencyConfig = emergencyConfig;
    this.dutyCycleManager = dutyCycleManager;
    this.logger = Logger.getInstance();

    // Initialize statistics
    this.initializeStatistics();
    this.globalStats = {
      totalMessages: 0,
      emergencyOverrides: 0,
      totalBytesTransmitted: 0,
      averageNetworkEfficiency: 1.0,
      lastStatisticsReset: Date.now(),
    };

    this.emergencyMode = emergencyConfig.enabled;

    this.startPerformanceMonitoring();

    this.logger.info('UTXOQoSManager initialized', {
      emergencyMode: this.emergencyMode,
      dutyCycleIntegration: !!this.dutyCycleManager,
      policyLevels: Object.keys(this.qosPolicy.transmissionPower),
    });
  }

  // ==========================================
  // QOS LEVEL MANAGEMENT
  // ==========================================

  assignQoSLevel(message: MeshMessage): MessagePriority {
    try {
      // Default to message priority if available
      let qosLevel = MessagePriority.NORMAL;

      // Message type-based assignment
      switch (message.type) {
        case 'block':
          qosLevel = MessagePriority.CRITICAL;
          break;
        case 'transaction':
          qosLevel = this.calculateTransactionQoSLevel(message);
          break;
        case 'sync':
          qosLevel = MessagePriority.HIGH; // SPV proofs
          break;
        case 'discovery':
          qosLevel = MessagePriority.NORMAL;
          break;
        default:
          qosLevel = MessagePriority.LOW;
      }

      // Apply emergency mode adjustments
      if (this.emergencyMode) {
        qosLevel = this.applyEmergencyModeAdjustment(qosLevel, message);
      }

      this.logger.debug('QoS level assigned', {
        messageType: message.type,
        assignedLevel: qosLevel,
        emergencyMode: this.emergencyMode,
      });

      return qosLevel;
    } catch (error) {
      this.logger.error(
        'QoS level assignment failed, using default',
        error as Record<string, any>
      );
      return MessagePriority.NORMAL;
    }
  }

  getTransmissionParameters(qosLevel: MessagePriority): TransmissionParams {
    try {
      const params: TransmissionParams = {
        power: this.qosPolicy.transmissionPower[qosLevel] || 14, // Default 14 dBm
        retryAttempts: this.qosPolicy.retryAttempts[qosLevel] || 3,
        confirmationRequired:
          this.qosPolicy.deliveryConfirmation[qosLevel] || false,
        compressionRequired:
          this.qosPolicy.compressionRequired[qosLevel] || false,
        timeoutMs: this.qosPolicy.timeoutMs[qosLevel] || 30000, // 30 seconds default
        dutyCycleExempt: this.qosPolicy.dutyCycleExemption[qosLevel] || false,
      };

      // Apply emergency mode overrides
      if (this.emergencyMode && this.emergencyConfig.enabled) {
        params.power = Math.min(params.power + 3, 20); // Boost power by 3dBm, max 20dBm
        params.retryAttempts = Math.max(params.retryAttempts, 5); // Minimum 5 retries
        params.timeoutMs = Math.max(params.timeoutMs, 60000); // Minimum 1 minute timeout

        if (qosLevel === MessagePriority.CRITICAL) {
          params.dutyCycleExempt = true; // Critical messages bypass duty cycle in emergency
        }
      }

      this.logger.debug('Transmission parameters assigned', {
        qosLevel,
        params,
        emergencyMode: this.emergencyMode,
      });

      return params;
    } catch (error) {
      this.logger.error(
        'Failed to get transmission parameters, using defaults',
        error as Record<string, any>
      );
      return this.getDefaultTransmissionParams();
    }
  }

  // ==========================================
  // POLICY MANAGEMENT
  // ==========================================

  updateQoSPolicy(policy: UTXOQoSPolicy): void {
    const oldPolicy = { ...this.qosPolicy };
    this.qosPolicy = policy;

    this.logger.info('QoS policy updated', {
      changes: this.compareQoSPolicies(oldPolicy, policy),
    });

    this.emit('policyUpdated', policy);
  }

  getQoSPolicy(): UTXOQoSPolicy {
    return { ...this.qosPolicy };
  }

  // ==========================================
  // STATISTICS AND MONITORING
  // ==========================================

  getQoSStatistics(): UTXOQoSStatistics {
    const stats: UTXOQoSStatistics = {
      messagesSentByPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      messagesFailedByPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      averageDeliveryTimeByPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      compressionEfficiencyByPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      dutyCycleUsageByPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
      emergencyOverrides: this.globalStats.emergencyOverrides,
      totalBytesTransmitted: this.globalStats.totalBytesTransmitted,
      networkEfficiencyScore: this.calculateNetworkEfficiency(),
    };

    // Populate priority-based statistics
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        const levelStats = this.qosStats.get(priority);
        if (levelStats) {
          stats.messagesSentByPriority[priority] = levelStats.messagesSent;
          stats.messagesFailedByPriority[priority] = levelStats.messagesFailed;
          stats.averageDeliveryTimeByPriority[priority] =
            levelStats.messagesSent > 0
              ? levelStats.totalDeliveryTime / levelStats.messagesSent
              : 0;
          stats.compressionEfficiencyByPriority[priority] =
            levelStats.totalCompressionSavings /
            Math.max(1, levelStats.messagesSent);
          stats.dutyCycleUsageByPriority[priority] =
            levelStats.totalDutyCycleUsage;
        } else {
          stats.messagesSentByPriority[priority] = 0;
          stats.messagesFailedByPriority[priority] = 0;
          stats.averageDeliveryTimeByPriority[priority] = 0;
          stats.compressionEfficiencyByPriority[priority] = 0;
          stats.dutyCycleUsageByPriority[priority] = 0;
        }
      }
    }

    return stats;
  }

  resetStatistics(): void {
    this.initializeStatistics();
    this.globalStats = {
      totalMessages: 0,
      emergencyOverrides: 0,
      totalBytesTransmitted: 0,
      averageNetworkEfficiency: 1.0,
      lastStatisticsReset: Date.now(),
    };
    this.deliveryTrackers.clear();
    this.networkEfficiencyWindow = [];

    this.logger.info('QoS statistics reset');
  }

  // ==========================================
  // EMERGENCY MANAGEMENT
  // ==========================================

  enableEmergencyMode(): void {
    if (!this.emergencyMode) {
      this.emergencyMode = true;
      this.globalStats.emergencyOverrides++;

      this.logger.warn('Emergency mode ENABLED', {
        maxDutyCycleOverride: this.emergencyConfig.maxDutyCycleOverride,
        priorityBoost: this.emergencyConfig.priorityBoost,
      });

      this.emit('emergencyModeActivated');
    }
  }

  disableEmergencyMode(): void {
    if (this.emergencyMode) {
      this.emergencyMode = false;

      this.logger.info('Emergency mode DISABLED');
      this.emit('emergencyModeDeactivated');
    }
  }

  isEmergencyMode(): boolean {
    return this.emergencyMode;
  }

  // ==========================================
  // DUTY CYCLE INTEGRATION
  // ==========================================

  canTransmitWithQoS(qosLevel: MessagePriority, sizeBytes: number): boolean {
    if (!this.dutyCycleManager) {
      return true; // No duty cycle restrictions
    }

    try {
      // Get transmission parameters for QoS level
      const params = this.getTransmissionParameters(qosLevel);

      // Check if exempt from duty cycle
      if (params.dutyCycleExempt && this.emergencyMode) {
        this.logger.debug('Transmission allowed (duty cycle exempt)', {
          qosLevel,
          sizeBytes,
          emergencyMode: this.emergencyMode,
        });
        return true;
      }

      // Estimate transmission time based on size
      const estimatedTimeMs = this.estimateTransmissionTime(sizeBytes);

      // Check with duty cycle manager
      const canTransmit = this.dutyCycleManager.canTransmit(
        estimatedTimeMs,
        qosLevel,
        undefined // Use default frequency
      );

      this.logger.debug('Duty cycle transmission check', {
        qosLevel,
        sizeBytes,
        estimatedTimeMs,
        canTransmit,
      });

      return canTransmit;
    } catch (error) {
      this.logger.error(
        'Duty cycle check failed, allowing transmission',
        error as Record<string, any>
      );
      return true;
    }
  }

  getOptimalTransmissionTime(qosLevel: MessagePriority): number {
    if (!this.dutyCycleManager) {
      return Date.now(); // Transmit immediately if no duty cycle
    }

    try {
      const nextWindow = this.dutyCycleManager.getNextTransmissionWindow();
      const params = this.getTransmissionParameters(qosLevel);

      // Emergency messages can transmit immediately if exempt
      if (params.dutyCycleExempt && this.emergencyMode) {
        return Date.now();
      }

      return nextWindow;
    } catch (error) {
      this.logger.error(
        'Failed to get optimal transmission time',
        error as Record<string, any>
      );
      return Date.now();
    }
  }

  // ==========================================
  // MESSAGE TRACKING AND DELIVERY
  // ==========================================

  trackMessageDelivery(messageId: string, priority: MessagePriority): void {
    const tracker: DeliveryTracker = {
      messageId,
      priority,
      sentAt: Date.now(),
      expectedDeliveryTime: this.calculateExpectedDeliveryTime(priority),
      acknowledged: false,
    };

    this.deliveryTrackers.set(messageId, tracker);

    // Clean up old trackers
    this.cleanupDeliveryTrackers();

    this.logger.debug('Message delivery tracking started', {
      messageId,
      priority,
      expectedDeliveryTime: tracker.expectedDeliveryTime,
    });
  }

  confirmMessageDelivery(messageId: string, deliveryTime?: number): void {
    const tracker = this.deliveryTrackers.get(messageId);
    if (tracker) {
      tracker.acknowledged = true;
      tracker.actualDeliveryTime = deliveryTime || Date.now();

      // Update statistics
      this.updateDeliveryStatistics(tracker);

      this.logger.debug('Message delivery confirmed', {
        messageId,
        deliveryTime: tracker.actualDeliveryTime - tracker.sentAt,
        priority: tracker.priority,
      });

      this.emit(
        'deliveryConfirmed',
        messageId,
        tracker.actualDeliveryTime - tracker.sentAt
      );
      this.deliveryTrackers.delete(messageId);
    }
  }

  reportDeliveryFailure(messageId: string, reason: string): void {
    const tracker = this.deliveryTrackers.get(messageId);
    if (tracker) {
      tracker.failureReason = reason;

      // Update failure statistics
      const levelStats = this.qosStats.get(tracker.priority);
      if (levelStats) {
        levelStats.messagesFailed++;
      }

      this.logger.warn('Message delivery failed', {
        messageId,
        reason,
        priority: tracker.priority,
        timeSinceTransmission: Date.now() - tracker.sentAt,
      });

      this.emit('deliveryFailed', messageId, reason);
      this.deliveryTrackers.delete(messageId);
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private initializeStatistics(): void {
    this.qosStats.clear();
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        this.qosStats.set(priority, {
          messagesSent: 0,
          messagesFailed: 0,
          totalDeliveryTime: 0,
          totalCompressionSavings: 0,
          totalDutyCycleUsage: 0,
          lastTransmission: 0,
        });
      }
    }
  }

  private calculateTransactionQoSLevel(message: MeshMessage): MessagePriority {
    // This would analyze the transaction payload
    // For now, default to HIGH for all transactions
    return MessagePriority.HIGH;
  }

  private applyEmergencyModeAdjustment(
    qosLevel: MessagePriority,
    message: MeshMessage
  ): MessagePriority {
    if (!this.emergencyConfig.enabled) {
      return qosLevel;
    }

    // Boost priority in emergency mode
    const boost = this.emergencyConfig.priorityBoost;
    if (boost > 1.0) {
      // Boost critical messages and transactions
      if (message.type === 'transaction' || message.type === 'block') {
        return Math.max(
          MessagePriority.CRITICAL,
          qosLevel - 1
        ) as MessagePriority;
      }
    }

    return qosLevel;
  }

  private getDefaultTransmissionParams(): TransmissionParams {
    return {
      power: 14, // 14 dBm
      retryAttempts: 3,
      confirmationRequired: false,
      compressionRequired: false,
      timeoutMs: 30000, // 30 seconds
      dutyCycleExempt: false,
    };
  }

  private compareQoSPolicies(
    oldPolicy: UTXOQoSPolicy,
    newPolicy: UTXOQoSPolicy
  ): string[] {
    const changes: string[] = [];

    // Compare power settings
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        if (
          oldPolicy.transmissionPower[priority] !==
          newPolicy.transmissionPower[priority]
        ) {
          changes.push(`transmissionPower[${priority}]`);
        }
        if (
          oldPolicy.retryAttempts[priority] !==
          newPolicy.retryAttempts[priority]
        ) {
          changes.push(`retryAttempts[${priority}]`);
        }
      }
    }

    return changes;
  }

  private calculateNetworkEfficiency(): number {
    if (this.networkEfficiencyWindow.length === 0) {
      return 1.0;
    }

    const sum = this.networkEfficiencyWindow.reduce((acc, val) => acc + val, 0);
    return sum / this.networkEfficiencyWindow.length;
  }

  private estimateTransmissionTime(sizeBytes: number): number {
    // Rough estimate based on LoRa SF7 BW125 (fastest setting)
    // ~5470 bps effective throughput
    const bitsPerSecond = 5470;
    const bits = sizeBytes * 8;
    return Math.ceil((bits / bitsPerSecond) * 1000); // Convert to milliseconds
  }

  private calculateExpectedDeliveryTime(priority: MessagePriority): number {
    // Base delivery time expectations by priority
    const baseDeliveryTimes = {
      [MessagePriority.CRITICAL]: 5000, // 5 seconds
      [MessagePriority.HIGH]: 15000, // 15 seconds
      [MessagePriority.NORMAL]: 30000, // 30 seconds
      [MessagePriority.LOW]: 60000, // 1 minute
    };

    return Date.now() + (baseDeliveryTimes[priority] || 30000);
  }

  private updateDeliveryStatistics(tracker: DeliveryTracker): void {
    const levelStats = this.qosStats.get(tracker.priority);
    if (levelStats && tracker.actualDeliveryTime) {
      levelStats.messagesSent++;
      levelStats.totalDeliveryTime +=
        tracker.actualDeliveryTime - tracker.sentAt;
      levelStats.lastTransmission = tracker.actualDeliveryTime;
    }

    this.globalStats.totalMessages++;
  }

  private cleanupDeliveryTrackers(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [messageId, tracker] of this.deliveryTrackers.entries()) {
      if (now - tracker.sentAt > maxAge) {
        this.reportDeliveryFailure(messageId, 'timeout');
      }
    }
  }

  private startPerformanceMonitoring(): void {
    // Monitor network efficiency every 30 seconds
    setInterval(() => {
      this.updateNetworkEfficiencyScore();
    }, 30000);

    // Clean up delivery trackers every minute
    setInterval(() => {
      this.cleanupDeliveryTrackers();
    }, 60000);
  }

  private updateNetworkEfficiencyScore(): void {
    // Calculate efficiency based on successful delivery rate
    let totalSent = 0;
    let totalSuccessful = 0;

    for (const levelStats of this.qosStats.values()) {
      totalSent += levelStats.messagesSent + levelStats.messagesFailed;
      totalSuccessful += levelStats.messagesSent;
    }

    const efficiency = totalSent > 0 ? totalSuccessful / totalSent : 1.0;

    // Add to efficiency window
    this.networkEfficiencyWindow.push(efficiency);
    if (this.networkEfficiencyWindow.length > this.maxEfficiencyWindowSize) {
      this.networkEfficiencyWindow.shift();
    }

    // Update global average
    this.globalStats.averageNetworkEfficiency =
      this.calculateNetworkEfficiency();
  }

  // ==========================================
  // PUBLIC STATISTICS ACCESS
  // ==========================================

  getDeliveryTrackers(): Map<string, DeliveryTracker> {
    return new Map(this.deliveryTrackers);
  }

  getPendingDeliveries(): number {
    return this.deliveryTrackers.size;
  }

  getEfficiencyHistory(): number[] {
    return [...this.networkEfficiencyWindow];
  }
}
