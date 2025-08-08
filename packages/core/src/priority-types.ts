/**
 * Enhanced Message Prioritization Types
 *
 * BREAKING CHANGE: UTXO-only prioritization system with NO legacy support
 * Integrates with existing MessagePriority, DutyCycleManager, and UTXOEnhancedMeshProtocol
 */

import type {
  MeshMessage,
  UTXOTransaction,
  Block,
  CompressedMerkleProof,
  IDatabase,
} from './types.js';
import { MessagePriority } from './types.js';

// ==========================================
// ENHANCED MESH MESSAGE TYPES
// ==========================================

/**
 * Enhanced UTXO MeshMessage with priority metadata
 * BREAKING CHANGE: Extends existing MeshMessage for UTXO-only architecture
 */
export interface UTXOPrioritizedMeshMessage extends MeshMessage {
  priority: MessagePriority; // Use existing enum: CRITICAL, HIGH, NORMAL, LOW
  utxoFee?: number; // Fee for UTXO transactions (satoshi/byte)
  utxoInputCount?: number; // Number of UTXO inputs
  utxoOutputCount?: number; // Number of UTXO outputs
  blockHeight?: number; // For blockchain messages
  emergencyFlag: boolean; // Manual emergency override
  retryCount: number;
  maxRetries: number;
  ttl: number; // Time to live in milliseconds
  createdAt: number;
  lastAttempt?: number;
  deliveryConfirmation?: boolean;
  compressionApplied?: boolean; // Integration with existing compression system
  queueId?: string; // Internal queue tracking ID
}

// ==========================================
// PRIORITY CALCULATION TYPES
// ==========================================

/**
 * Network context for priority calculations
 */
export interface UTXONetworkContext {
  currentBlockHeight: number;
  utxoSetCompleteness: number; // 0-1 score
  averageTransactionFee: number; // satoshi/byte
  networkCongestionLevel: number; // 0-1 score
  batteryLevel: number; // 0-1 score
  signalStrength: number; // 0-1 score
  nodeCapacity: number; // 0-1 score
  emergencyMode: boolean;
}

/**
 * Priority factor for calculation weights
 */
export interface PriorityFactor {
  name: string;
  weight: number;
  calculator: (message: MeshMessage, context: UTXONetworkContext) => number;
}

/**
 * UTXO fee-based priority thresholds
 */
export interface UTXOPriorityThresholds {
  highFeeSatoshiPerByte: number; // HIGH priority threshold (default: 10)
  normalFeeSatoshiPerByte: number; // NORMAL priority threshold (default: 1)
  emergencyBypass: boolean; // Allow emergency transactions to bypass fees
  blockPriorityBoost: number; // Priority boost for block messages
  merkleProofPriority: MessagePriority; // Fixed priority for SPV proofs
}

// ==========================================
// QOS MANAGEMENT TYPES
// ==========================================

/**
 * QoS policy for transmission parameters
 * BREAKING CHANGE: Integrates with existing DutyCycleManager
 */
export interface UTXOQoSPolicy {
  transmissionPower: Record<MessagePriority, number>; // Power per priority
  retryAttempts: Record<MessagePriority, number>; // Retry attempts per priority
  dutyCycleExemption: Record<MessagePriority, boolean>; // Emergency bypass
  deliveryConfirmation: Record<MessagePriority, boolean>; // ACK required
  compressionRequired: Record<MessagePriority, boolean>; // Force compression
  utxoFeeMultiplier: Record<MessagePriority, number>; // Fee-based scaling
  timeoutMs: Record<MessagePriority, number>; // Message timeout per priority
}

/**
 * Transmission parameters based on QoS level
 */
export interface TransmissionParams {
  power: number; // Transmission power
  retryAttempts: number;
  confirmationRequired: boolean;
  compressionRequired: boolean;
  timeoutMs: number;
  dutyCycleExempt: boolean;
}

/**
 * QoS statistics and metrics
 */
export interface UTXOQoSStatistics {
  messagesSentByPriority: Record<MessagePriority, number>;
  messagesFailedByPriority: Record<MessagePriority, number>;
  averageDeliveryTimeByPriority: Record<MessagePriority, number>;
  compressionEfficiencyByPriority: Record<MessagePriority, number>;
  dutyCycleUsageByPriority: Record<MessagePriority, number>;
  emergencyOverrides: number;
  totalBytesTransmitted: number;
  networkEfficiencyScore: number; // 0-1 score
}

// ==========================================
// QUEUE MANAGEMENT TYPES
// ==========================================

/**
 * Enhanced queue statistics with UTXO awareness
 */
export interface UTXOQueueStatistics {
  totalMessages: number;
  messagesByPriority: Record<MessagePriority, number>;
  utxoTransactionsByFeeRange: {
    highFee: number; // >= highFeeSatoshiPerByte
    normalFee: number; // >= normalFeeSatoshiPerByte, < highFeeSatoshiPerByte
    lowFee: number; // < normalFeeSatoshiPerByte
  };
  averageWaitTimeByPriority: Record<MessagePriority, number>;
  compressionSavings: number; // Bytes saved through compression
  emergencyMessages: number;
  expiredMessages: number;
  memoryUsageBytes: number;
  queueHealthScore: number; // 0-1 health score
}

/**
 * Queue capacity configuration
 */
export interface QueueCapacityConfig {
  maxTotalMessages: number;
  capacityByPriority: Record<MessagePriority, number>;
  emergencyCapacityReserve: number; // Reserved slots for emergency
  memoryLimitBytes: number;
  evictionStrategy: 'lru' | 'priority' | 'age';
}

// ==========================================
// EMERGENCY SYSTEM TYPES
// ==========================================

/**
 * Emergency UTXO transaction override
 */
export interface UTXOEmergencyOverride {
  nodeId: string;
  publicKey: string; // For cryptographic verification
  maxEmergencyMessagesPerHour: number;
  allowedMessageTypes: ('utxo_transaction' | 'block' | 'routing')[];
  validFrom: number; // Timestamp
  validUntil: number; // Timestamp
  signature: string; // Cryptographic signature
}

/**
 * Emergency mode configuration
 */
export interface EmergencyModeConfig {
  enabled: boolean;
  activationThreshold: number; // Network conditions threshold
  maxDutyCycleOverride: number; // Percentage override allowed
  priorityBoost: number; // Priority boost for emergency messages
  compressionForced: boolean; // Force compression in emergency mode
  logAllTransmissions: boolean; // Enhanced logging
}

// ==========================================
// RETRY AND DELIVERY TYPES
// ==========================================

/**
 * Retry policy per priority level
 */
export interface UTXORetryPolicy {
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  jitterPercent: number; // Random jitter to avoid congestion
}

/**
 * Delivery confirmation tracking
 */
export interface DeliveryTracker {
  messageId: string;
  priority: MessagePriority;
  sentAt: number;
  expectedDeliveryTime: number;
  actualDeliveryTime?: number;
  acknowledged: boolean;
  failureReason?: string;
}

// ==========================================
// CONFIGURATION TYPES
// ==========================================

/**
 * Complete UTXO priority configuration
 * BREAKING CHANGE: Extends existing DutyCycleConfig integration
 */
export interface UTXOPriorityConfig {
  // Queue configuration
  queueCapacity: QueueCapacityConfig;

  // UTXO-specific settings
  utxoFeePriorityThresholds: UTXOPriorityThresholds;

  // QoS policies
  qosPolicy: UTXOQoSPolicy;

  // Retry policies
  retryPolicies: Record<MessagePriority, UTXORetryPolicy>;

  // Emergency system
  emergencyMode: EmergencyModeConfig;
  emergencyOverrides: UTXOEmergencyOverride[];

  // Integration settings
  compressionIntegration: boolean; // Use existing compression system
  dutyCycleIntegration: boolean; // Use existing duty cycle system
  persistenceEnabled: boolean; // Use existing database for queue persistence

  // Performance tuning
  priorityCalculationCacheMs: number; // Cache priority calculations
  queueProcessingIntervalMs: number; // Queue processing frequency
  statisticsCollectionIntervalMs: number; // Stats collection frequency
}

// ==========================================
// INTERFACE DEFINITIONS
// ==========================================

/**
 * Enhanced Priority Queue interface
 * BREAKING CHANGE: Extends existing MessageQueue with UTXO features
 */
export interface IUTXOPriorityQueue {
  // Basic operations
  enqueue(message: UTXOPrioritizedMeshMessage): Promise<boolean>;
  dequeue(): Promise<UTXOPrioritizedMeshMessage | null>;
  peek(): UTXOPrioritizedMeshMessage | null;
  size(): number;
  clear(): void;

  // Priority-specific operations
  enqueueWithPriority(
    message: MeshMessage,
    priority: MessagePriority
  ): Promise<boolean>;
  dequeueByPriority(
    priority: MessagePriority
  ): Promise<UTXOPrioritizedMeshMessage | null>;
  getQueueByPriority(priority: MessagePriority): UTXOPrioritizedMeshMessage[];

  // UTXO-specific operations
  enqueueUTXOTransaction(
    tx: UTXOTransaction,
    emergencyFlag?: boolean
  ): Promise<boolean>;
  enqueueBlock(block: Block): Promise<boolean>;
  enqueueMerkleProof(proof: CompressedMerkleProof): Promise<boolean>;

  // Management operations
  removeExpired(): number;
  updatePriority(messageId: string, newPriority: MessagePriority): boolean;
  getStatistics(): UTXOQueueStatistics;

  // Persistence operations (integrate with existing IDatabase)
  saveQueueState(database: IDatabase): Promise<void>;
  loadQueueState(database: IDatabase): Promise<void>;
}

/**
 * Priority Calculator service interface
 */
export interface IPriorityCalculator {
  // Core priority calculation
  calculatePriority(
    message: MeshMessage,
    context: UTXONetworkContext
  ): MessagePriority;
  calculateUTXOTransactionPriority(
    tx: UTXOTransaction,
    context: UTXONetworkContext
  ): MessagePriority;
  calculateBlockPriority(
    block: Block,
    context: UTXONetworkContext
  ): MessagePriority;

  // Priority factors management
  addPriorityFactor(factor: PriorityFactor): void;
  removePriorityFactor(name: string): void;
  getPriorityFactors(): PriorityFactor[];

  // Dynamic priority adjustment
  updatePriority(messageId: string, newPriority: MessagePriority): boolean;
  boostPriorityTemporarily(messageId: string, durationMs: number): boolean;

  // Context management
  updateNetworkContext(context: Partial<UTXONetworkContext>): void;
  getNetworkContext(): UTXONetworkContext;

  // Configuration
  updateThresholds(thresholds: UTXOPriorityThresholds): void;
  getThresholds(): UTXOPriorityThresholds;
}

/**
 * QoS Manager interface
 */
export interface IQoSManager {
  // QoS level management
  assignQoSLevel(message: MeshMessage): MessagePriority;
  getTransmissionParameters(qosLevel: MessagePriority): TransmissionParams;

  // Policy management
  updateQoSPolicy(policy: UTXOQoSPolicy): void;
  getQoSPolicy(): UTXOQoSPolicy;

  // Statistics and monitoring
  getQoSStatistics(): UTXOQoSStatistics;
  resetStatistics(): void;

  // Emergency management
  enableEmergencyMode(): void;
  disableEmergencyMode(): void;
  isEmergencyMode(): boolean;

  // Integration with duty cycle system
  canTransmitWithQoS(qosLevel: MessagePriority, sizeBytes: number): boolean;
  getOptimalTransmissionTime(qosLevel: MessagePriority): number;
}

// ==========================================
// EVENT TYPES
// ==========================================

/**
 * Priority system events
 */
export interface PriorityEvents {
  // Queue events
  onMessageEnqueued: (message: UTXOPrioritizedMeshMessage) => void;
  onMessageDequeued: (message: UTXOPrioritizedMeshMessage) => void;
  onQueueOverflow: (priority: MessagePriority, droppedCount: number) => void;

  // Priority events
  onPriorityCalculated: (messageId: string, priority: MessagePriority) => void;
  onPriorityAdjusted: (
    messageId: string,
    oldPriority: MessagePriority,
    newPriority: MessagePriority
  ) => void;

  // Emergency events
  onEmergencyMessageReceived: (message: UTXOPrioritizedMeshMessage) => void;
  onEmergencyModeActivated: () => void;
  onEmergencyModeDeactivated: () => void;

  // QoS events
  onQoSViolation: (
    message: UTXOPrioritizedMeshMessage,
    violation: string
  ) => void;
  onDeliveryConfirmed: (messageId: string, deliveryTime: number) => void;
  onDeliveryFailed: (messageId: string, reason: string) => void;

  // Performance events
  onStatisticsUpdated: (stats: UTXOQueueStatistics) => void;
  onPerformanceAlert: (alert: string, severity: 'warning' | 'critical') => void;
}

// ==========================================
// ENHANCED MESH PROTOCOL INTERFACE
// ==========================================

/**
 * Enhanced interface for UTXO Priority Mesh Protocol
 * BREAKING CHANGE: Extends existing IEnhancedMeshProtocol with priority features
 */
export interface IUTXOPriorityMeshProtocol {
  // UTXO Priority queue operations
  sendUTXOPriorityTransaction(
    tx: UTXOTransaction,
    priority?: MessagePriority
  ): Promise<boolean>;
  sendEmergencyUTXOTransaction(tx: UTXOTransaction): Promise<boolean>;

  // Queue management (extends existing duty cycle queue)
  getUTXOQueueStats(): UTXOQueueStatistics;
  setUTXOQueueCapacity(priority: MessagePriority, capacity: number): void;
  clearUTXOQueue(priority?: MessagePriority): void;

  // UTXO-specific QoS configuration
  updateUTXOQoSPolicy(policy: UTXOQoSPolicy): void;
  getUTXOQoSStats(): UTXOQoSStatistics;

  // Fee-based priority configuration
  setUTXOFeePriorityThresholds(thresholds: UTXOPriorityThresholds): void;
  updateUTXONetworkContext(context: Partial<UTXONetworkContext>): void;

  // Emergency mode (integrate with existing duty cycle system)
  enableUTXOEmergencyMode(): void;
  disableUTXOEmergencyMode(): void;
  isUTXOEmergencyMode(): boolean;

  // Integration with existing compression system
  enableUTXOCompressionPriority(enable: boolean): void;
}
