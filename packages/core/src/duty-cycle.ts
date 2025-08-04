import {
  type DutyCycleConfig,
  type FrequencyBandConfig,
  type TransmissionRecord,
  type QueuedMessage,
  type ComplianceResult,
  type RegionalLimits,
  type MessageQueue,
  type QueueStats,
  type DutyCycleStats,
  type DutyCycleMetrics,
  type DutyCycleViolation,
  type DutyCycleWarning,
  type MessageSizeEstimate,
  type LoRaTransmissionParams,
  type IDutyCycleManager,
  type DutyCycleEvents,
  type TransmissionWindow,
  type ScheduledTransmission,
  MessagePriority,
  type IDatabase,
} from './types.js';
import { Logger } from '@lorachain/shared';
import { EventEmitter } from 'events';

/**
 * RegionalComplianceValidator - Validates transmissions against regional regulations
 * 
 * Supports comprehensive regional compliance including:
 * - EU ETSI with sub-band duty cycles (0.1%, 1%, 10%)
 * - US/CA/MX FCC with frequency hopping and dwell time limits
 * - Japan ARIB with 10% duty cycle limits
 * - Australia/NZ ACMA with power limits but no duty cycle
 * - Custom regions with configurable parameters
 */
export class RegionalComplianceValidator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Validates a transmission against regional compliance rules
   */
  validateTransmission(
    config: DutyCycleConfig,
    transmissionTimeMs: number,
    frequencyMHz: number,
    currentDutyCycle: number
  ): ComplianceResult {
    // Check frequency band compliance
    const band = this.getFrequencyBand(config, frequencyMHz);
    if (!band) {
      return { 
        compliant: false, 
        reason: `Frequency ${frequencyMHz}MHz not allowed in region ${config.region}` 
      };
    }
    
    // Check maximum single transmission time
    if (transmissionTimeMs > config.maxTransmissionTimeMs) {
      return {
        compliant: false,
        reason: `Transmission time ${transmissionTimeMs}ms exceeds limit ${config.maxTransmissionTimeMs}ms`
      };
    }
    
    // Region-specific validation
    switch (config.region) {
      case 'EU':
        return this.validateEU(config, transmissionTimeMs, frequencyMHz, band, currentDutyCycle);
      case 'US':
      case 'CA':
      case 'MX':
        return this.validateNorthAmerica(config, transmissionTimeMs);
      case 'JP':
        return this.validateJapan(config, transmissionTimeMs, currentDutyCycle);
      case 'AU':
      case 'NZ':
        return this.validateAustralia(config, transmissionTimeMs);
      case 'BR':
      case 'AR':
        return this.validateSouthAmerica(config, transmissionTimeMs);
      default:
        return this.validateGeneric(config, transmissionTimeMs, currentDutyCycle);
    }
  }

  private validateEU(
    config: DutyCycleConfig,
    transmissionTimeMs: number,
    frequencyMHz: number,
    band: FrequencyBandConfig,
    currentDutyCycle: number
  ): ComplianceResult {
    // Find applicable sub-band duty cycle
    const subBand = band.subBands?.find(sb => 
      frequencyMHz >= sb.minMHz && frequencyMHz <= sb.maxMHz
    );
    
    const dutyCycleLimit = subBand?.dutyCyclePercent || config.maxDutyCyclePercent || 0.01;
    const newTransmissionDutyCycle = transmissionTimeMs / (config.trackingWindowHours * 60 * 60 * 1000);
    
    if (currentDutyCycle + newTransmissionDutyCycle > dutyCycleLimit) {
      const waitTime = this.calculateWaitTime(dutyCycleLimit, currentDutyCycle, config.trackingWindowHours);
      return { 
        compliant: false, 
        reason: `Would exceed ${(dutyCycleLimit * 100).toFixed(1)}% duty cycle limit (current: ${(currentDutyCycle * 100).toFixed(2)}%)`,
        waitTimeMs: waitTime
      };
    }
    
    return { compliant: true };
  }
  
  private validateNorthAmerica(
    config: DutyCycleConfig,
    transmissionTimeMs: number
  ): ComplianceResult {
    // Check dwell time for frequency hopping
    if (config.frequencyHopping?.enabled) {
      const maxDwellTime = config.dwellTimeMs || 400; // FCC limit: 400ms
      if (transmissionTimeMs > maxDwellTime) {
        return { 
          compliant: false, 
          reason: `Exceeds ${maxDwellTime}ms dwell time limit for frequency hopping` 
        };
      }
    }
    
    // No duty cycle restrictions in North America
    return { compliant: true };
  }

  private validateJapan(
    config: DutyCycleConfig,
    transmissionTimeMs: number,
    currentDutyCycle: number
  ): ComplianceResult {
    const dutyCycleLimit = config.maxDutyCyclePercent || 0.1; // 10% default for Japan
    const newTransmissionDutyCycle = transmissionTimeMs / (config.trackingWindowHours * 60 * 60 * 1000);
    
    if (currentDutyCycle + newTransmissionDutyCycle > dutyCycleLimit) {
      const waitTime = this.calculateWaitTime(dutyCycleLimit, currentDutyCycle, config.trackingWindowHours);
      return { 
        compliant: false, 
        reason: `Would exceed ${(dutyCycleLimit * 100).toFixed(0)}% duty cycle limit`,
        waitTimeMs: waitTime
      };
    }
    
    return { compliant: true };
  }

  private validateAustralia(
    config: DutyCycleConfig,
    transmissionTimeMs: number
  ): ComplianceResult {
    // Australia has no duty cycle restrictions, only power limits
    // Power validation would be handled by radio hardware
    return { compliant: true };
  }

  private validateSouthAmerica(
    config: DutyCycleConfig,
    transmissionTimeMs: number
  ): ComplianceResult {
    // Brazil and Argentina generally follow FCC rules - no duty cycle
    return { compliant: true };
  }

  private validateGeneric(
    config: DutyCycleConfig,
    transmissionTimeMs: number,
    currentDutyCycle: number
  ): ComplianceResult {
    if (!config.maxDutyCyclePercent) {
      return { compliant: true }; // No duty cycle limit
    }

    const newTransmissionDutyCycle = transmissionTimeMs / (config.trackingWindowHours * 60 * 60 * 1000);
    
    if (currentDutyCycle + newTransmissionDutyCycle > config.maxDutyCyclePercent) {
      const waitTime = this.calculateWaitTime(config.maxDutyCyclePercent, currentDutyCycle, config.trackingWindowHours);
      return { 
        compliant: false, 
        reason: `Would exceed ${(config.maxDutyCyclePercent * 100).toFixed(1)}% duty cycle limit`,
        waitTimeMs: waitTime
      };
    }
    
    return { compliant: true };
  }

  private getFrequencyBand(config: DutyCycleConfig, frequencyMHz: number): FrequencyBandConfig | null {
    return config.frequencyBands.find(band => 
      frequencyMHz >= band.minFrequencyMHz && frequencyMHz <= band.maxFrequencyMHz
    ) || null;
  }

  private calculateWaitTime(dutyCycleLimit: number, currentDutyCycle: number, windowHours: number): number {
    if (currentDutyCycle <= dutyCycleLimit) return 0;
    
    // Estimate wait time until duty cycle falls below limit
    // This is a simplified calculation - in practice, you'd need to analyze transmission history
    const excessDutyCycle = currentDutyCycle - dutyCycleLimit;
    const windowMs = windowHours * 60 * 60 * 1000;
    
    // Wait for excess duty cycle to "age out" of the sliding window
    return Math.ceil(excessDutyCycle * windowMs);
  }
}

/**
 * MessageSizeEstimator - Estimates transmission time for LoRa messages
 * 
 * Calculates accurate air time based on LoRa parameters including:
 * - Spreading factor, bandwidth, coding rate
 * - Preamble length and header overhead
 * - Fragment overhead for large messages
 */
export class MessageSizeEstimator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Estimates transmission time for a message
   */
  estimateTransmissionTime(
    payloadBytes: number,
    loraParams: LoRaTransmissionParams
  ): MessageSizeEstimate {
    const headerBytes = this.calculateHeaderBytes();
    const totalBytes = payloadBytes + headerBytes;
    const airTimeMs = this.calculateAirTime(totalBytes, loraParams);
    const fragmentCount = Math.ceil(totalBytes / 255); // LoRa max payload ~255 bytes
    
    return {
      payloadBytes,
      headerBytes,
      totalBytes,
      airTimeMs,
      fragmentCount,
      estimatedTransmissionTime: airTimeMs * fragmentCount
    };
  }

  /**
   * Calculates LoRa air time using the standard formula
   */
  private calculateAirTime(payloadBytes: number, params: LoRaTransmissionParams): number {
    const { spreadingFactor, bandwidth, codingRate, preambleLength } = params;
    
    // Symbol time in milliseconds
    const symbolTime = (1 << spreadingFactor) / (bandwidth * 1000);
    
    // Preamble time
    const preambleTime = (preambleLength + 4.25) * symbolTime;
    
    // Payload symbols calculation
    const payloadBits = payloadBytes * 8;
    const headerBits = params.headerMode === 'explicit' ? 20 : 0;
    const crcBits = params.crcEnabled ? 16 : 0;
    
    const numerator = Math.max(
      Math.ceil((8 * payloadBytes - 4 * spreadingFactor + 28 + crcBits - (params.headerMode === 'implicit' ? 20 : 0)) / (4 * (spreadingFactor - (params.lowDataRateOptimize ? 2 : 0)))) * (codingRate + 4),
      0
    );
    
    const payloadSymbols = 8 + numerator;
    const payloadTime = payloadSymbols * symbolTime;
    
    return preambleTime + payloadTime;
  }

  private calculateHeaderBytes(): number {
    // Estimate overhead for mesh protocol headers, signatures, etc.
    return 32; // Simplified estimate
  }
}

/**
 * PriorityMessageQueue - Priority-based message queue with duty cycle awareness
 */
export class PriorityMessageQueue implements MessageQueue {
  private queues: Map<MessagePriority, QueuedMessage[]> = new Map();
  private maxSize: number;
  private logger: Logger;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.logger = Logger.getInstance();
    
    // Initialize priority queues
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    });
  }

  async enqueue(message: any, priority: MessagePriority): Promise<boolean> {
    const queue = this.queues.get(priority);
    if (!queue) {
      this.logger.error(`Invalid priority: ${priority}`);
      return false;
    }

    // Check if queue is full
    if (this.size() >= this.maxSize) {
      // Try to remove expired messages first
      this.removeExpired();
      
      // If still full, remove lowest priority messages
      if (this.size() >= this.maxSize) {
        this.evictLowestPriority();
      }
    }

    const queuedMessage: QueuedMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message,
      priority,
      queuedAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes TTL
      estimatedTransmissionTimeMs: 1000, // Default estimate
      retryCount: 0,
      isFragmented: false,
      frequencyBand: 'EU868', // Default
      regionConfig: {} as DutyCycleConfig // Will be filled by DutyCycleManager
    };

    queue.push(queuedMessage);
    return true;
  }

  async dequeue(): Promise<QueuedMessage | null> {
    // Process queues in priority order (EMERGENCY -> CRITICAL -> HIGH -> NORMAL -> LOW)
    for (const [priority, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        return queue.shift() || null;
      }
    }
    return null;
  }

  peek(): QueuedMessage | null {
    for (const [priority, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  size(): number {
    return Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
  }

  clear(): void {
    this.queues.forEach(queue => queue.length = 0);
  }

  removeExpired(): number {
    const now = Date.now();
    let removedCount = 0;
    
    this.queues.forEach(queue => {
      const originalLength = queue.length;
      const filtered = queue.filter(msg => msg.expiresAt > now);
      queue.length = 0;
      queue.push(...filtered);
      removedCount += originalLength - queue.length;
    });
    
    return removedCount;
  }

  getMessagesByPriority(priority: MessagePriority): QueuedMessage[] {
    return this.queues.get(priority) || [];
  }

  getQueueStats(): QueueStats {
    const messagesByPriority: Record<MessagePriority, number> = {} as any;
    let totalWaitTime = 0;
    let oldestMessageAge = 0;
    let totalSizeBytes = 0;
    const now = Date.now();

    this.queues.forEach((queue, priority) => {
      messagesByPriority[priority] = queue.length;
      
      queue.forEach(msg => {
        const age = now - msg.queuedAt;
        totalWaitTime += age;
        oldestMessageAge = Math.max(oldestMessageAge, age);
        totalSizeBytes += JSON.stringify(msg.message).length; // Rough estimate
      });
    });

    const totalMessages = this.size();
    
    return {
      totalMessages,
      messagesByPriority,
      averageWaitTime: totalMessages > 0 ? totalWaitTime / totalMessages : 0,
      oldestMessageAge,
      estimatedProcessingTime: totalMessages * 1000, // Rough estimate
      queueSizeBytes: totalSizeBytes,
      messagesExpired: 0, // Would be tracked separately
      messagesDropped: 0  // Would be tracked separately
    };
  }

  private evictLowestPriority(): void {
    // Remove one message from the lowest priority non-empty queue
    const priorities = [MessagePriority.LOW, MessagePriority.NORMAL, MessagePriority.HIGH, MessagePriority.CRITICAL];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        queue.shift();
        this.logger.warn(`Evicted message due to queue overflow, priority: ${priority}`);
        break;
      }
    }
  }
}

/**
 * DutyCycleManager - Main duty cycle management implementation
 * 
 * Provides comprehensive duty cycle management including:
 * - Multi-regional compliance (EU, US, JP, AU, etc.)
 * - Priority-based message queuing
 * - Adaptive transmission scheduling
 * - Persistent transmission history tracking
 * - Real-time duty cycle monitoring
 */
export class DutyCycleManager extends EventEmitter implements IDutyCycleManager {
  private config: DutyCycleConfig;
  private messageQueue: PriorityMessageQueue;
  private complianceValidator: RegionalComplianceValidator;
  private sizeEstimator: MessageSizeEstimator;
  private transmissionHistory: TransmissionRecord[] = [];
  private logger: Logger;
  private database?: IDatabase;
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;

  // Statistics tracking
  private stats: DutyCycleStats = {
    currentDutyCycle: 0,
    dailyDutyCycle: 0,
    hourlyDutyCycle: 0,
    transmissionCount: 0,
    totalTransmissionTime: 0,
    averageTransmissionTime: 0,
    queuedMessages: 0,
    violationsCount: 0,
    complianceRate: 1.0
  };

  constructor(config: DutyCycleConfig, database?: IDatabase) {
    super();
    
    this.config = { ...config };
    this.database = database;
    this.logger = Logger.getInstance();
    
    this.messageQueue = new PriorityMessageQueue(1000);
    this.complianceValidator = new RegionalComplianceValidator();
    this.sizeEstimator = new MessageSizeEstimator();

    this.logger.info(`DutyCycleManager initialized for region ${config.region}, band ${config.activeFrequencyBand}`);
  }

  // Core functionality
  canTransmit(estimatedTimeMs: number, priority?: MessagePriority, frequencyMHz?: number): boolean {
    const freq = frequencyMHz || this.getDefaultFrequency();
    const currentDutyCycle = this.getCurrentDutyCycle(this.config.trackingWindowHours, freq);
    
    const result = this.complianceValidator.validateTransmission(
      this.config,
      estimatedTimeMs,
      freq,
      currentDutyCycle
    );

    // Emergency override for critical messages
    if (!result.compliant && priority === MessagePriority.CRITICAL && this.config.emergencyOverrideEnabled) {
      this.logger.warn(`Emergency override activated for critical message`);
      this.emit('complianceOverride', { estimatedTimeMs, priority, reason: result.reason });
      return true;
    }

    return result.compliant;
  }

  async enqueueMessage(message: any, priority: MessagePriority): Promise<boolean> {
    const success = await this.messageQueue.enqueue(message, priority);
    
    if (success) {
      this.stats.queuedMessages = this.messageQueue.size();
      this.logger.debug(`Message queued with priority ${priority}, queue size: ${this.stats.queuedMessages}`);
    } else {
      this.logger.error(`Failed to queue message with priority ${priority}`);
    }
    
    return success;
  }

  getNextTransmissionWindow(frequencyMHz?: number): number {
    const freq = frequencyMHz || this.getDefaultFrequency();
    
    // No wait time for regions without duty cycle
    if (['US', 'CA', 'MX', 'AU', 'NZ', 'BR', 'AR'].includes(this.config.region)) {
      // Check frequency hopping dwell time instead
      if (this.config.frequencyHopping?.enabled) {
        return this.calculateNextHopWindow();
      }
      return 0; // Can transmit immediately
    }
    
    const currentDutyCycle = this.getCurrentDutyCycle(this.config.trackingWindowHours, freq);
    const dutyCycleLimit = this.getDutyCycleLimitForFrequency(freq);
    
    if (currentDutyCycle >= dutyCycleLimit) {
      return this.calculateDutyCycleResetTime(freq);
    }
    
    return 0; // Can transmit immediately
  }

  // Status and monitoring
  getCurrentDutyCycle(windowHours: number = 1, frequencyMHz?: number): number {
    // Skip calculation for regions without duty cycle
    if (['US', 'CA', 'MX', 'AU', 'NZ', 'BR', 'AR'].includes(this.config.region)) {
      return 0; // No duty cycle restrictions
    }
    
    const windowStartTime = Date.now() - (windowHours * 60 * 60 * 1000);
    let recentTransmissions = this.transmissionHistory.filter(
      record => record.timestamp >= windowStartTime
    );
    
    // Filter by frequency if specified (for EU sub-band calculations)
    if (frequencyMHz && this.config.region === 'EU') {
      recentTransmissions = recentTransmissions.filter(
        record => this.isSameSubBand(record.frequencyMHz, frequencyMHz)
      );
    }
    
    const totalTransmissionTime = recentTransmissions.reduce(
      (sum, record) => sum + record.durationMs, 0
    );
    
    const windowDurationMs = windowHours * 60 * 60 * 1000;
    return totalTransmissionTime / windowDurationMs;
  }

  getQueueStatus(): QueueStats {
    return this.messageQueue.getQueueStats();
  }

  getTransmissionHistory(hours: number = 24): TransmissionRecord[] {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    return this.transmissionHistory.filter(record => record.timestamp >= cutoffTime);
  }

  getDutyCycleStats(): DutyCycleStats {
    this.updateStats();
    return { ...this.stats };
  }

  // Configuration
  updateConfig(config: Partial<DutyCycleConfig>): void {
    const oldRegion = this.config.region;
    this.config = { ...this.config, ...config };
    
    if (oldRegion !== this.config.region) {
      this.logger.info(`Region changed from ${oldRegion} to ${this.config.region}`);
      this.emit('regionChanged', oldRegion, this.config.region);
    }
  }

  getConfig(): DutyCycleConfig {
    return { ...this.config };
  }

  validateRegionalCompliance(transmissionTimeMs: number, frequencyMHz: number): ComplianceResult {
    const currentDutyCycle = this.getCurrentDutyCycle(this.config.trackingWindowHours, frequencyMHz);
    return this.complianceValidator.validateTransmission(
      this.config,
      transmissionTimeMs,
      frequencyMHz,
      currentDutyCycle
    );
  }

  // Control
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
      this.cleanupOldTransmissions();
      this.updateStats();
    }, 1000); // Process queue every second
    
    this.logger.info('DutyCycleManager started');
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    this.logger.info('DutyCycleManager stopped');
  }

  pause(): void {
    // Implementation would pause queue processing
    this.logger.info('DutyCycleManager paused');
  }

  resume(): void {
    // Implementation would resume queue processing
    this.logger.info('DutyCycleManager resumed');
  }

  // Private helper methods
  private async processQueue(): Promise<void> {
    // Process messages from queue based on duty cycle availability
    const nextMessage = this.messageQueue.peek();
    if (!nextMessage) return;

    const estimatedTime = nextMessage.estimatedTransmissionTimeMs;
    const canTransmit = this.canTransmit(estimatedTime, nextMessage.priority);
    
    if (canTransmit) {
      const message = await this.messageQueue.dequeue();
      if (message) {
        await this.scheduleTransmission(message);
      }
    }
  }

  private async scheduleTransmission(message: QueuedMessage): Promise<void> {
    // In a real implementation, this would interface with the LoRa hardware
    const transmissionRecord: TransmissionRecord = {
      timestamp: Date.now(),
      durationMs: message.estimatedTransmissionTimeMs,
      messageType: this.getMessageType(message.message),
      priority: message.priority,
      frequencyBand: message.frequencyBand,
      frequencyMHz: this.getDefaultFrequency(),
      sourceNodeId: 'local_node', // Would come from node config
      hopCount: 0,
      messageSize: JSON.stringify(message.message).length,
      powerLevel_dBm: this.config.maxEIRP_dBm
    };

    this.transmissionHistory.push(transmissionRecord);
    
    // Persist to database if available
    if (this.database && this.config.persistenceEnabled) {
      await this.persistTransmissionRecord(transmissionRecord);
    }

    this.emit('transmissionComplete', transmissionRecord);
    this.logger.debug(`Transmission completed: ${transmissionRecord.messageType}, duration: ${transmissionRecord.durationMs}ms`);
  }

  private getMessageType(message: any): 'UTXO_TRANSACTION' | 'BLOCK' | 'ROUTING' | 'DISCOVERY' {
    // Simple message type detection - would be more sophisticated in practice
    if (message.type === 'utxo_transaction') return 'UTXO_TRANSACTION';
    if (message.type === 'block') return 'BLOCK';
    if (message.type === 'discovery') return 'DISCOVERY';
    return 'ROUTING';
  }

  private cleanupOldTransmissions(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // Keep 24 hours of history
    this.transmissionHistory = this.transmissionHistory.filter(
      record => record.timestamp >= cutoffTime
    );
  }

  private updateStats(): void {
    this.stats.currentDutyCycle = this.getCurrentDutyCycle(1);
    this.stats.dailyDutyCycle = this.getCurrentDutyCycle(24);
    this.stats.hourlyDutyCycle = this.getCurrentDutyCycle(1);
    this.stats.transmissionCount = this.transmissionHistory.length;
    this.stats.queuedMessages = this.messageQueue.size();
    
    if (this.stats.transmissionCount > 0) {
      this.stats.totalTransmissionTime = this.transmissionHistory.reduce(
        (sum, record) => sum + record.durationMs, 0
      );
      this.stats.averageTransmissionTime = this.stats.totalTransmissionTime / this.stats.transmissionCount;
    }
  }

  private getDefaultFrequency(): number {
    const activeBand = this.config.frequencyBands.find(
      band => band.name === this.config.activeFrequencyBand
    );
    return activeBand?.centerFrequencyMHz || 868.1; // Default to EU868
  }

  private getDutyCycleLimitForFrequency(frequencyMHz: number): number {
    if (this.config.region === 'EU') {
      const band = this.config.frequencyBands.find(b => 
        frequencyMHz >= b.minFrequencyMHz && frequencyMHz <= b.maxFrequencyMHz
      );
      
      const subBand = band?.subBands?.find(sb => 
        frequencyMHz >= sb.minMHz && frequencyMHz <= sb.maxMHz
      );
      
      return subBand?.dutyCyclePercent || this.config.maxDutyCyclePercent || 0.01;
    }
    
    return this.config.maxDutyCyclePercent || 0.01;
  }

  private isSameSubBand(freq1: number, freq2: number): boolean {
    // Check if two frequencies are in the same EU sub-band
    const band = this.config.frequencyBands.find(b => 
      freq1 >= b.minFrequencyMHz && freq1 <= b.maxFrequencyMHz
    );
    
    if (!band?.subBands) return true;
    
    const subBand1 = band.subBands.find(sb => freq1 >= sb.minMHz && freq1 <= sb.maxMHz);
    const subBand2 = band.subBands.find(sb => freq2 >= sb.minMHz && freq2 <= sb.maxMHz);
    
    return subBand1 === subBand2;
  }

  private calculateNextHopWindow(): number {
    // Simplified frequency hopping calculation
    return Math.random() * 100; // Random backoff up to 100ms
  }

  private calculateDutyCycleResetTime(frequencyMHz: number): number {
    // Calculate time until duty cycle window resets enough to allow transmission
    const windowMs = this.config.trackingWindowHours * 60 * 60 * 1000;
    const currentDutyCycle = this.getCurrentDutyCycle(this.config.trackingWindowHours, frequencyMHz);
    const limit = this.getDutyCycleLimitForFrequency(frequencyMHz);
    
    if (currentDutyCycle <= limit) return 0;
    
    // Find the oldest transmission that's contributing to the excess
    const cutoffTime = Date.now() - windowMs;
    const relevantTransmissions = this.transmissionHistory
      .filter(record => record.timestamp >= cutoffTime)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (relevantTransmissions.length === 0) return 0;
    
    // Estimate when the oldest transmission will age out
    const oldestTransmission = relevantTransmissions[0];
    const ageOutTime = oldestTransmission.timestamp + windowMs;
    
    return Math.max(0, ageOutTime - Date.now());
  }

  private async persistTransmissionRecord(record: TransmissionRecord): Promise<void> {
    if (!this.database) return;
    
    try {
      const key = `transmission_${record.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
      await this.database.put(key, record, 'duty_cycle_history');
    } catch (error) {
      this.logger.error(`Failed to persist transmission record: ${error}`);
    }
  }
}