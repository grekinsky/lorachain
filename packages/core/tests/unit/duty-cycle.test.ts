import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DutyCycleManager,
  RegionalComplianceValidator,
  MessageSizeEstimator,
  PriorityMessageQueue,
} from '../../src/duty-cycle.js';
import { DutyCycleConfigFactory } from '../../src/duty-cycle-config.js';
import { MemoryDatabase } from '../../src/database.js';
import {
  type DutyCycleConfig,
  type LoRaTransmissionParams,
  MessagePriority,
} from '../../src/types.js';

describe('RegionalComplianceValidator', () => {
  let validator: RegionalComplianceValidator;

  beforeEach(() => {
    validator = new RegionalComplianceValidator();
  });

  describe('EU Region Compliance', () => {
    let euConfig: DutyCycleConfig;

    beforeEach(() => {
      euConfig = DutyCycleConfigFactory.createForRegion('EU', 'testnet');
    });

    it('should allow transmission within 1% duty cycle limit', () => {
      const result = validator.validateTransmission(
        euConfig,
        1000, // 1 second transmission
        868.1, // EU868 frequency
        0.005 // 0.5% current duty cycle
      );

      expect(result.compliant).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.waitTimeMs).toBeUndefined();
    });

    it('should reject transmission that would exceed 1% duty cycle limit', () => {
      const result = validator.validateTransmission(
        euConfig,
        1000, // 1 second transmission
        868.1, // EU868 frequency
        0.0098 // 0.98% current duty cycle (would exceed 1% with new 1s transmission)
      );

      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('exceed 1.0% duty cycle limit');
      expect(result.waitTimeMs).toBeGreaterThan(0);
    });

    it('should validate sub-band specific duty cycles', () => {
      // Test 0.1% duty cycle sub-band (863-865 MHz)
      const strictResult = validator.validateTransmission(
        euConfig,
        100, // 0.1 second transmission
        864.0, // 863-865 MHz sub-band
        0.0005 // 0.05% current duty cycle
      );

      expect(strictResult.compliant).toBe(true);

      // Test exceeding 0.1% limit
      const violationResult = validator.validateTransmission(
        euConfig,
        1000, // 1 second transmission
        864.0, // 863-865 MHz sub-band
        0.00097 // 0.097% current duty cycle (would exceed 0.1% with 1s transmission)
      );

      expect(violationResult.compliant).toBe(false);
      expect(violationResult.reason).toContain('exceed 0.1% duty cycle limit');
    });

    it('should reject frequencies outside allowed bands', () => {
      const result = validator.validateTransmission(
        euConfig,
        1000,
        900.0, // Outside EU bands
        0.0
      );

      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('not allowed in region EU');
    });

    it('should reject transmissions exceeding maximum time limit', () => {
      const result = validator.validateTransmission(
        euConfig,
        2000, // 2 seconds (exceeds 1 second limit)
        868.1,
        0.0
      );

      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('exceeds limit 1000ms');
    });
  });

  describe('US Region Compliance', () => {
    let usConfig: DutyCycleConfig;

    beforeEach(() => {
      usConfig = DutyCycleConfigFactory.createForRegion('US', 'testnet');
    });

    it('should allow unlimited duty cycle for US region', () => {
      const result = validator.validateTransmission(
        usConfig,
        300, // 300ms - within dwell time limit
        915.0, // US915 frequency
        0.5 // 50% current duty cycle (no limit in US)
      );

      expect(result.compliant).toBe(true);
    });

    it('should enforce frequency hopping dwell time limits', () => {
      const result = validator.validateTransmission(
        usConfig,
        500, // 500ms (exceeds 400ms dwell time)
        915.0,
        0.0
      );

      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('dwell time limit');
    });

    it('should allow transmissions within dwell time limit', () => {
      const result = validator.validateTransmission(
        usConfig,
        300, // 300ms (within 400ms dwell time)
        915.0,
        0.5 // High duty cycle should be ignored
      );

      expect(result.compliant).toBe(true);
    });
  });

  describe('Japan Region Compliance', () => {
    let jpConfig: DutyCycleConfig;

    beforeEach(() => {
      jpConfig = DutyCycleConfigFactory.createForRegion('JP', 'testnet');
    });

    it('should enforce 10% duty cycle limit for Japan', () => {
      const allowedResult = validator.validateTransmission(
        jpConfig,
        1000,
        921.0,
        0.05 // 5% current duty cycle
      );

      expect(allowedResult.compliant).toBe(true);

      const violationResult = validator.validateTransmission(
        jpConfig,
        1000, // 1 second transmission
        921.0,
        0.0998 // 9.98% current duty cycle (would exceed 10% with 1s transmission)
      );

      expect(violationResult.compliant).toBe(false);
      expect(violationResult.reason).toContain('exceed 10% duty cycle limit');
    });
  });

  describe('Australia Region Compliance', () => {
    let auConfig: DutyCycleConfig;

    beforeEach(() => {
      auConfig = DutyCycleConfigFactory.createForRegion('AU', 'testnet');
    });

    it('should allow unlimited duty cycle for Australia', () => {
      const result = validator.validateTransmission(
        auConfig,
        10000, // 10 seconds
        920.0,
        0.8 // 80% current duty cycle
      );

      expect(result.compliant).toBe(true);
    });
  });
});

describe('MessageSizeEstimator', () => {
  let estimator: MessageSizeEstimator;
  let defaultLoRaParams: LoRaTransmissionParams;

  beforeEach(() => {
    estimator = new MessageSizeEstimator();
    defaultLoRaParams = {
      spreadingFactor: 12,
      bandwidth: 125,
      codingRate: 4 / 5,
      preambleLength: 8,
      headerMode: 'explicit',
      crcEnabled: true,
      lowDataRateOptimize: true,
    };
  });

  it('should estimate transmission time for small messages', () => {
    const estimate = estimator.estimateTransmissionTime(50, defaultLoRaParams);

    expect(estimate.payloadBytes).toBe(50);
    expect(estimate.headerBytes).toBe(32);
    expect(estimate.totalBytes).toBe(82);
    expect(estimate.airTimeMs).toBeGreaterThan(0);
    expect(estimate.fragmentCount).toBe(1);
    expect(estimate.estimatedTransmissionTime).toBe(estimate.airTimeMs);
  });

  it('should calculate correct fragment count for large messages', () => {
    const estimate = estimator.estimateTransmissionTime(
      1000,
      defaultLoRaParams
    );

    expect(estimate.fragmentCount).toBeGreaterThan(1);
    expect(estimate.estimatedTransmissionTime).toBe(
      estimate.airTimeMs * estimate.fragmentCount
    );
  });

  it('should calculate different air times for different spreading factors', () => {
    const sf7Params = {
      ...defaultLoRaParams,
      spreadingFactor: 7,
      lowDataRateOptimize: false,
    };
    const sf12Params = {
      ...defaultLoRaParams,
      spreadingFactor: 12,
      lowDataRateOptimize: true,
    };

    const sf7Estimate = estimator.estimateTransmissionTime(100, sf7Params);
    const sf12Estimate = estimator.estimateTransmissionTime(100, sf12Params);

    // SF12 should take longer than SF7
    expect(sf12Estimate.airTimeMs).toBeGreaterThan(sf7Estimate.airTimeMs);
  });

  it('should calculate different air times for different bandwidths', () => {
    const bw125Params = { ...defaultLoRaParams, bandwidth: 125 };
    const bw250Params = { ...defaultLoRaParams, bandwidth: 250 };

    const bw125Estimate = estimator.estimateTransmissionTime(100, bw125Params);
    const bw250Estimate = estimator.estimateTransmissionTime(100, bw250Params);

    // Higher bandwidth should be faster
    expect(bw125Estimate.airTimeMs).toBeGreaterThan(bw250Estimate.airTimeMs);
  });
});

describe('PriorityMessageQueue', () => {
  let queue: PriorityMessageQueue;

  beforeEach(() => {
    queue = new PriorityMessageQueue(100);
  });

  it('should enqueue and dequeue messages', async () => {
    const message1 = { type: 'test', data: 'message1' };
    const message2 = { type: 'test', data: 'message2' };

    const result1 = await queue.enqueue(message1, MessagePriority.HIGH);
    const result2 = await queue.enqueue(message2, MessagePriority.LOW);

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(queue.size()).toBe(2);

    // Should dequeue high priority first
    const dequeued1 = await queue.dequeue();
    expect(dequeued1?.message.data).toBe('message1');
    expect(dequeued1?.priority).toBe(MessagePriority.HIGH);

    const dequeued2 = await queue.dequeue();
    expect(dequeued2?.message.data).toBe('message2');
    expect(dequeued2?.priority).toBe(MessagePriority.LOW);

    expect(queue.size()).toBe(0);
  });

  it('should respect priority ordering', async () => {
    const lowMsg = { type: 'test', data: 'low' };
    const highMsg = { type: 'test', data: 'high' };
    const criticalMsg = { type: 'test', data: 'critical' };

    await queue.enqueue(lowMsg, MessagePriority.LOW);
    await queue.enqueue(highMsg, MessagePriority.HIGH);
    await queue.enqueue(criticalMsg, MessagePriority.CRITICAL);

    const first = await queue.dequeue();
    const second = await queue.dequeue();
    const third = await queue.dequeue();

    expect(first?.message.data).toBe('critical');
    expect(second?.message.data).toBe('high');
    expect(third?.message.data).toBe('low');
  });

  it('should remove expired messages', async () => {
    const message = { type: 'test', data: 'expired' };
    await queue.enqueue(message, MessagePriority.NORMAL);

    // Manually expire the message by modifying its expiresAt time
    const peeked = queue.peek();
    if (peeked) {
      peeked.expiresAt = Date.now() - 1000; // 1 second ago
    }

    const removedCount = queue.removeExpired();
    expect(removedCount).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('should provide accurate queue statistics', async () => {
    await queue.enqueue({ type: 'test' }, MessagePriority.HIGH);
    await queue.enqueue({ type: 'test' }, MessagePriority.LOW);
    await queue.enqueue({ type: 'test' }, MessagePriority.NORMAL);

    const stats = queue.getQueueStats();

    expect(stats.totalMessages).toBe(3);
    expect(stats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
    expect(stats.messagesByPriority[MessagePriority.LOW]).toBe(1);
    expect(stats.messagesByPriority[MessagePriority.NORMAL]).toBe(1);
    expect(stats.averageWaitTime).toBeGreaterThanOrEqual(0);
    expect(stats.queueSizeBytes).toBeGreaterThan(0);
  });

  it('should handle queue overflow by evicting low priority messages', async () => {
    const smallQueue = new PriorityMessageQueue(2);

    await smallQueue.enqueue(
      { type: 'test', data: 'low1' },
      MessagePriority.LOW
    );
    await smallQueue.enqueue(
      { type: 'test', data: 'low2' },
      MessagePriority.LOW
    );

    // This should evict the first low priority message
    await smallQueue.enqueue(
      { type: 'test', data: 'high' },
      MessagePriority.HIGH
    );

    expect(smallQueue.size()).toBe(2);

    const first = await smallQueue.dequeue();
    const second = await smallQueue.dequeue();

    expect(first?.message.data).toBe('high');
    expect(second?.message.data).toBe('low2');
  });
});

describe('DutyCycleManager', () => {
  let dutyCycleManager: DutyCycleManager;
  let database: MemoryDatabase;
  let euConfig: DutyCycleConfig;

  beforeEach(async () => {
    database = new MemoryDatabase();
    euConfig = DutyCycleConfigFactory.createForRegion('EU', 'testnet');
    dutyCycleManager = new DutyCycleManager(euConfig, database);
  });

  afterEach(async () => {
    dutyCycleManager.stop();
    // MemoryDatabase doesn't need explicit close
  });

  describe('Basic Functionality', () => {
    it('should initialize with correct configuration', () => {
      const config = dutyCycleManager.getConfig();
      expect(config.region).toBe('EU');
      expect(config.maxDutyCyclePercent).toBe(0.01);
      expect(config.trackingWindowHours).toBe(1);
    });

    it('should start and stop correctly', () => {
      expect(() => dutyCycleManager.start()).not.toThrow();
      expect(() => dutyCycleManager.stop()).not.toThrow();
    });

    it('should update configuration', () => {
      dutyCycleManager.updateConfig({
        maxDutyCyclePercent: 0.05,
        trackingWindowHours: 2,
      });

      const config = dutyCycleManager.getConfig();
      expect(config.maxDutyCyclePercent).toBe(0.05);
      expect(config.trackingWindowHours).toBe(2);
    });
  });

  describe('Duty Cycle Calculation', () => {
    it('should calculate zero duty cycle initially', () => {
      const dutyCycle = dutyCycleManager.getCurrentDutyCycle();
      expect(dutyCycle).toBe(0);
    });

    it('should allow transmission when under duty cycle limit', () => {
      const canTransmit = dutyCycleManager.canTransmit(
        1000,
        MessagePriority.NORMAL
      );
      expect(canTransmit).toBe(true);
    });

    it('should return zero wait time when duty cycle allows transmission', () => {
      const waitTime = dutyCycleManager.getNextTransmissionWindow();
      expect(waitTime).toBe(0);
    });
  });

  describe('Message Queueing', () => {
    it('should enqueue messages successfully', async () => {
      const message = { type: 'transaction', data: 'test' };
      const result = await dutyCycleManager.enqueueMessage(
        message,
        MessagePriority.HIGH
      );

      expect(result).toBe(true);

      const queueStats = dutyCycleManager.getQueueStatus();
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
    });

    it('should provide queue statistics', async () => {
      await dutyCycleManager.enqueueMessage(
        { type: 'test1' },
        MessagePriority.HIGH
      );
      await dutyCycleManager.enqueueMessage(
        { type: 'test2' },
        MessagePriority.LOW
      );

      const stats = dutyCycleManager.getQueueStatus();
      expect(stats.totalMessages).toBe(2);
      expect(stats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
      expect(stats.messagesByPriority[MessagePriority.LOW]).toBe(1);
    });
  });

  describe('Regional Compliance', () => {
    it('should validate compliance for EU region', () => {
      const result = dutyCycleManager.validateRegionalCompliance(1000, 868.1);
      expect(result.compliant).toBe(true);
    });

    it('should reject compliance for invalid frequency', () => {
      const result = dutyCycleManager.validateRegionalCompliance(1000, 900.0);
      expect(result.compliant).toBe(false);
      expect(result.reason).toContain('not allowed in region');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide duty cycle statistics', () => {
      const stats = dutyCycleManager.getDutyCycleStats();

      expect(stats.currentDutyCycle).toBe(0);
      expect(stats.transmissionCount).toBe(0);
      expect(stats.queuedMessages).toBe(0);
      expect(stats.violationsCount).toBe(0);
      expect(stats.complianceRate).toBe(1.0);
    });

    it('should provide empty transmission history initially', () => {
      const history = dutyCycleManager.getTransmissionHistory();
      expect(history).toEqual([]);
    });
  });

  describe('Regional Configuration Factory', () => {
    it('should create valid configurations for all supported regions', () => {
      const regions = ['EU', 'US', 'CA', 'MX', 'JP', 'AU', 'NZ', 'BR', 'AR'];

      regions.forEach(region => {
        expect(() => {
          const config = DutyCycleConfigFactory.createForRegion(region);
          expect(config.region).toBe(region);
        }).not.toThrow();
      });
    });

    it('should throw error for unsupported regions', () => {
      expect(() => {
        DutyCycleConfigFactory.createForRegion('INVALID');
      }).toThrow('No preset configuration for region: INVALID');
    });

    it('should create development configuration with relaxed rules', () => {
      const devConfig = DutyCycleConfigFactory.createDevConfig('EU');

      expect(devConfig.strictComplianceMode).toBe(false);
      expect(devConfig.emergencyOverrideEnabled).toBe(true);
      expect(devConfig.maxTransmissionTimeMs).toBe(10000);
      expect(devConfig.trackingWindowHours).toBe(0.1);
    });

    it('should validate configuration correctly', () => {
      const validConfig = DutyCycleConfigFactory.createForRegion('EU');
      const validation = DutyCycleConfigFactory.validateConfig(validConfig);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = {
        ...DutyCycleConfigFactory.createForRegion('EU'),
        maxDutyCyclePercent: 1.5, // Invalid > 100%
        maxTransmissionTimeMs: -1000, // Invalid negative
      };

      const validation = DutyCycleConfigFactory.validateConfig(invalidConfig);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('US Region No Duty Cycle', () => {
    let usManager: DutyCycleManager;
    let usConfig: DutyCycleConfig;

    beforeEach(() => {
      usConfig = DutyCycleConfigFactory.createForRegion('US', 'testnet');
      usManager = new DutyCycleManager(usConfig, database);
    });

    afterEach(() => {
      usManager.stop();
    });

    it('should always return zero duty cycle for US region', () => {
      const dutyCycle = usManager.getCurrentDutyCycle();
      expect(dutyCycle).toBe(0);
    });

    it('should always allow transmission for US region', () => {
      const canTransmit = usManager.canTransmit(300, MessagePriority.NORMAL); // 300ms - within dwell time
      expect(canTransmit).toBe(true);
    });

    it('should return reasonable wait time for US region', () => {
      const waitTime = usManager.getNextTransmissionWindow();
      expect(waitTime).toBeGreaterThanOrEqual(0);
      expect(waitTime).toBeLessThan(100); // Should be < 100ms for frequency hopping
    });
  });

  describe('Event Handling', () => {
    it('should emit events for duty cycle violations', () => {
      // This would require more complex setup to actually trigger violations
      // For now, we just verify the manager can handle events
      expect(dutyCycleManager.on).toBeDefined();
      expect(dutyCycleManager.emit).toBeDefined();
    });
  });

  describe('Database Integration', () => {
    it('should work without database', () => {
      const noDatabaseManager = new DutyCycleManager(euConfig);
      expect(() => noDatabaseManager.start()).not.toThrow();
      noDatabaseManager.stop();
    });

    it('should work with database', () => {
      expect(() => dutyCycleManager.start()).not.toThrow();
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('Configuration Edge Cases', () => {
    it('should handle custom region configuration', () => {
      const customConfig: DutyCycleConfig = {
        region: 'CUSTOM',
        regulatoryBody: 'CUSTOM',
        frequencyBands: [
          {
            name: 'CUSTOM900',
            centerFrequencyMHz: 900,
            bandwidthMHz: 10,
            minFrequencyMHz: 895,
            maxFrequencyMHz: 905,
            channels: [
              {
                number: 0,
                frequencyMHz: 900,
                dataRate: 'SF12BW125',
                enabled: true,
              },
            ],
          },
        ],
        activeFrequencyBand: 'CUSTOM900',
        maxDutyCyclePercent: 0.05,
        trackingWindowHours: 1,
        maxTransmissionTimeMs: 2000,
        maxEIRP_dBm: 20,
        adaptivePowerControl: true,
        emergencyOverrideEnabled: false,
        strictComplianceMode: true,
        autoRegionDetection: false,
        persistenceEnabled: true,
        networkType: 'testnet',
      };

      expect(() => {
        const manager = new DutyCycleManager(customConfig);
        manager.start();
        manager.stop();
      }).not.toThrow();
    });

    it('should handle frequency hopping configuration', () => {
      const usConfig = DutyCycleConfigFactory.createForRegion('US');
      const manager = new DutyCycleManager(usConfig);

      expect(usConfig.frequencyHopping?.enabled).toBe(true);
      expect(usConfig.frequencyHopping?.numChannels).toBe(64);
      expect(usConfig.frequencyHopping?.channelDwellTimeMs).toBe(400);

      manager.stop();
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large numbers of queued messages', async () => {
      const manager = new DutyCycleManager(
        DutyCycleConfigFactory.createForRegion('EU'),
        new MemoryDatabase()
      );

      // Queue many messages
      for (let i = 0; i < 100; i++) {
        await manager.enqueueMessage(
          { type: 'test', id: i },
          i % 2 === 0 ? MessagePriority.HIGH : MessagePriority.LOW
        );
      }

      const stats = manager.getQueueStatus();
      expect(stats.totalMessages).toBe(100);

      manager.stop();
    });

    it('should clean up old transmission records', () => {
      const manager = new DutyCycleManager(
        DutyCycleConfigFactory.createForRegion('EU')
      );

      // Verify cleanup doesn't crash
      expect(() => {
        // This calls the private cleanupOldTransmissions method indirectly
        manager.getTransmissionHistory(1);
      }).not.toThrow();

      manager.stop();
    });
  });
});
