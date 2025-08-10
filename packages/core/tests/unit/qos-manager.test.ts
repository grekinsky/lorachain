/**
 * UTXOQoSManager Tests
 *
 * Comprehensive unit tests for the QoS management service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UTXOQoSManager } from '../../src/qos-manager.js';
import type {
  UTXOQoSPolicy,
  EmergencyModeConfig,
  TransmissionParams,
  UTXOQoSStatistics,
} from '../../src/priority-types.js';
import { MessagePriority } from '../../src/types.js';
import type { MeshMessage, IDutyCycleManager } from '../../src/types.js';

// Mock DutyCycleManager
class MockDutyCycleManager implements Partial<IDutyCycleManager> {
  private canTransmitValue = true;
  private nextTransmissionWindow = Date.now() + 5000;

  canTransmit(
    estimatedTimeMs: number,
    priority?: MessagePriority,
    frequencyMHz?: number
  ): boolean {
    return this.canTransmitValue;
  }

  getNextTransmissionWindow(frequencyMHz?: number): number {
    return this.nextTransmissionWindow;
  }

  setCanTransmit(value: boolean) {
    this.canTransmitValue = value;
  }

  setNextTransmissionWindow(time: number) {
    this.nextTransmissionWindow = time;
  }
}

describe('UTXOQoSManager', () => {
  let qosManager: UTXOQoSManager;
  let mockQoSPolicy: UTXOQoSPolicy;
  let mockEmergencyConfig: EmergencyModeConfig;
  let mockDutyCycleManager: MockDutyCycleManager;

  beforeEach(() => {
    mockQoSPolicy = {
      transmissionPower: {
        [MessagePriority.CRITICAL]: 20,
        [MessagePriority.HIGH]: 17,
        [MessagePriority.NORMAL]: 14,
        [MessagePriority.LOW]: 10,
      },
      retryAttempts: {
        [MessagePriority.CRITICAL]: 5,
        [MessagePriority.HIGH]: 3,
        [MessagePriority.NORMAL]: 2,
        [MessagePriority.LOW]: 1,
      },
      dutyCycleExemption: {
        [MessagePriority.CRITICAL]: true,
        [MessagePriority.HIGH]: false,
        [MessagePriority.NORMAL]: false,
        [MessagePriority.LOW]: false,
      },
      deliveryConfirmation: {
        [MessagePriority.CRITICAL]: true,
        [MessagePriority.HIGH]: true,
        [MessagePriority.NORMAL]: false,
        [MessagePriority.LOW]: false,
      },
      compressionRequired: {
        [MessagePriority.CRITICAL]: false, // Emergency messages skip compression for speed
        [MessagePriority.HIGH]: true,
        [MessagePriority.NORMAL]: true,
        [MessagePriority.LOW]: true,
      },
      utxoFeeMultiplier: {
        [MessagePriority.CRITICAL]: 1.0,
        [MessagePriority.HIGH]: 0.8,
        [MessagePriority.NORMAL]: 0.6,
        [MessagePriority.LOW]: 0.4,
      },
      timeoutMs: {
        [MessagePriority.CRITICAL]: 60000,
        [MessagePriority.HIGH]: 30000,
        [MessagePriority.NORMAL]: 15000,
        [MessagePriority.LOW]: 10000,
      },
    };

    mockEmergencyConfig = {
      enabled: false, // Default disabled, enable per test as needed
      activationThreshold: 0.8,
      maxDutyCycleOverride: 50,
      priorityBoost: 1.5,
      compressionForced: false,
      logAllTransmissions: false,
    };

    mockDutyCycleManager = new MockDutyCycleManager();

    qosManager = new UTXOQoSManager(
      mockQoSPolicy,
      mockEmergencyConfig,
      mockDutyCycleManager as any
    );
  });

  afterEach(() => {
    qosManager.removeAllListeners();
  });

  describe('QoS Level Assignment', () => {
    it('should assign CRITICAL priority to block messages', () => {
      const blockMessage: MeshMessage = {
        type: 'block',
        payload: { index: 100, hash: 'block-hash' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const qosLevel = qosManager.assignQoSLevel(blockMessage);
      expect(qosLevel).toBe(MessagePriority.CRITICAL);
    });

    it('should assign HIGH priority to SPV sync messages', () => {
      const syncMessage: MeshMessage = {
        type: 'sync',
        payload: { merkleProof: 'proof-data' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const qosLevel = qosManager.assignQoSLevel(syncMessage);
      expect(qosLevel).toBe(MessagePriority.HIGH);
    });

    it('should assign NORMAL priority to discovery messages', () => {
      const discoveryMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'node1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const qosLevel = qosManager.assignQoSLevel(discoveryMessage);
      expect(qosLevel).toBe(MessagePriority.NORMAL);
    });

    it('should assign LOW priority to unknown message types', () => {
      const unknownMessage: MeshMessage = {
        type: 'unknown' as any,
        payload: { data: 'test' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const qosLevel = qosManager.assignQoSLevel(unknownMessage);
      expect(qosLevel).toBe(MessagePriority.LOW);
    });
  });

  describe('Transmission Parameters', () => {
    it('should provide correct parameters for CRITICAL priority', () => {
      const params = qosManager.getTransmissionParameters(
        MessagePriority.CRITICAL
      );

      expect(params.power).toBe(20);
      expect(params.retryAttempts).toBe(5);
      expect(params.confirmationRequired).toBe(true);
      expect(params.compressionRequired).toBe(false);
      expect(params.timeoutMs).toBe(60000);
      expect(params.dutyCycleExempt).toBe(true);
    });

    it('should provide correct parameters for HIGH priority', () => {
      const params = qosManager.getTransmissionParameters(MessagePriority.HIGH);

      expect(params.power).toBe(17);
      expect(params.retryAttempts).toBe(3);
      expect(params.confirmationRequired).toBe(true);
      expect(params.compressionRequired).toBe(true);
      expect(params.timeoutMs).toBe(30000);
      expect(params.dutyCycleExempt).toBe(false);
    });

    it('should provide correct parameters for NORMAL priority', () => {
      const params = qosManager.getTransmissionParameters(
        MessagePriority.NORMAL
      );

      expect(params.power).toBe(14);
      expect(params.retryAttempts).toBe(2);
      expect(params.confirmationRequired).toBe(false);
      expect(params.compressionRequired).toBe(true);
      expect(params.timeoutMs).toBe(15000);
      expect(params.dutyCycleExempt).toBe(false);
    });

    it('should provide correct parameters for LOW priority', () => {
      const params = qosManager.getTransmissionParameters(MessagePriority.LOW);

      expect(params.power).toBe(10);
      expect(params.retryAttempts).toBe(1);
      expect(params.confirmationRequired).toBe(false);
      expect(params.compressionRequired).toBe(true);
      expect(params.timeoutMs).toBe(10000);
      expect(params.dutyCycleExempt).toBe(false);
    });

    it('should provide default parameters for invalid priority', () => {
      const params = qosManager.getTransmissionParameters(
        999 as MessagePriority
      );

      expect(params.power).toBe(14); // Default power
      expect(params.retryAttempts).toBe(3);
      expect(params.confirmationRequired).toBe(false);
      expect(params.compressionRequired).toBe(false);
      expect(params.timeoutMs).toBe(30000);
      expect(params.dutyCycleExempt).toBe(false);
    });
  });

  describe('Emergency Mode', () => {
    it('should enable emergency mode', () => {
      expect(qosManager.isEmergencyMode()).toBe(false);

      qosManager.enableEmergencyMode();
      expect(qosManager.isEmergencyMode()).toBe(true);
    });

    it('should disable emergency mode', () => {
      qosManager.enableEmergencyMode();
      expect(qosManager.isEmergencyMode()).toBe(true);

      qosManager.disableEmergencyMode();
      expect(qosManager.isEmergencyMode()).toBe(false);
    });

    it('should boost transmission parameters in emergency mode', () => {
      // First enable emergency config and then emergency mode
      qosManager.updateQoSPolicy({
        ...mockQoSPolicy,
      });
      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();

      const params = qosManager.getTransmissionParameters(
        MessagePriority.NORMAL
      );

      expect(params.power).toBeGreaterThan(14); // Boosted power
      expect(params.retryAttempts).toBeGreaterThanOrEqual(5); // Minimum retries in emergency
      expect(params.timeoutMs).toBeGreaterThanOrEqual(60000); // Minimum timeout in emergency
    });

    it('should make CRITICAL messages duty cycle exempt in emergency mode', () => {
      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();

      const params = qosManager.getTransmissionParameters(
        MessagePriority.CRITICAL
      );
      expect(params.dutyCycleExempt).toBe(true);
    });

    it('should emit events when emergency mode changes', () => {
      return new Promise<void>(resolve => {
        let eventCount = 0;

        qosManager.on('emergencyModeActivated', () => {
          eventCount++;
          if (eventCount === 1) {
            qosManager.disableEmergencyMode();
          }
        });

        qosManager.on('emergencyModeDeactivated', () => {
          eventCount++;
          if (eventCount === 2) {
            resolve();
          }
        });

        qosManager.enableEmergencyMode();
      });
    });
  });

  describe('Duty Cycle Integration', () => {
    it('should check transmission eligibility with duty cycle manager', () => {
      mockDutyCycleManager.setCanTransmit(true);

      const canTransmit = qosManager.canTransmitWithQoS(
        MessagePriority.NORMAL,
        100
      );
      expect(canTransmit).toBe(true);
    });

    it('should respect duty cycle restrictions', () => {
      mockDutyCycleManager.setCanTransmit(false);

      const canTransmit = qosManager.canTransmitWithQoS(
        MessagePriority.NORMAL,
        100
      );
      expect(canTransmit).toBe(false);
    });

    it('should allow exempt messages in emergency mode', () => {
      mockDutyCycleManager.setCanTransmit(false);
      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();

      // CRITICAL messages should be exempt from duty cycle in emergency mode
      const canTransmit = qosManager.canTransmitWithQoS(
        MessagePriority.CRITICAL,
        100
      );
      expect(canTransmit).toBe(true);
    });

    it('should get optimal transmission time from duty cycle manager', () => {
      const expectedTime = Date.now() + 10000;
      mockDutyCycleManager.setNextTransmissionWindow(expectedTime);

      const optimalTime = qosManager.getOptimalTransmissionTime(
        MessagePriority.NORMAL
      );
      expect(optimalTime).toBe(expectedTime);
    });

    it('should allow immediate transmission for exempt messages in emergency mode', () => {
      const futureTime = Date.now() + 60000;
      mockDutyCycleManager.setNextTransmissionWindow(futureTime);
      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();

      const optimalTime = qosManager.getOptimalTransmissionTime(
        MessagePriority.CRITICAL
      );
      expect(optimalTime).toBeLessThan(futureTime); // Should be immediate or very soon
    });
  });

  describe('Policy Management', () => {
    it('should update QoS policy', () => {
      const newPolicy: UTXOQoSPolicy = {
        ...mockQoSPolicy,
        transmissionPower: {
          ...mockQoSPolicy.transmissionPower,
          [MessagePriority.HIGH]: 19, // Increased power
        },
      };

      qosManager.updateQoSPolicy(newPolicy);

      const params = qosManager.getTransmissionParameters(MessagePriority.HIGH);
      expect(params.power).toBe(19);
    });

    it('should return current QoS policy', () => {
      const policy = qosManager.getQoSPolicy();
      expect(policy).toEqual(mockQoSPolicy);
    });

    it('should emit policy updated event', () => {
      return new Promise<void>(resolve => {
        qosManager.on('policyUpdated', policy => {
          expect(policy).toBeDefined();
          resolve();
        });

        const newPolicy: UTXOQoSPolicy = {
          ...mockQoSPolicy,
          retryAttempts: {
            ...mockQoSPolicy.retryAttempts,
            [MessagePriority.NORMAL]: 5,
          },
        };

        qosManager.updateQoSPolicy(newPolicy);
      });
    });
  });

  describe('Message Delivery Tracking', () => {
    it('should track message delivery', () => {
      const messageId = 'test-message-1';

      qosManager.trackMessageDelivery(messageId, MessagePriority.HIGH);

      const trackers = qosManager.getDeliveryTrackers();
      expect(trackers.has(messageId)).toBe(true);

      const tracker = trackers.get(messageId);
      expect(tracker?.priority).toBe(MessagePriority.HIGH);
      expect(tracker?.acknowledged).toBe(false);
    });

    it('should confirm message delivery', async () => {
      const messageId = 'test-message-2';

      // Set up the event listener before starting the process
      const deliveryPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Delivery confirmation timeout'));
        }, 1000);

        qosManager.once('deliveryConfirmed', (id, deliveryTime) => {
          clearTimeout(timeout);
          try {
            expect(id).toBe(messageId);
            expect(deliveryTime).toBeGreaterThan(0);

            const trackers = qosManager.getDeliveryTrackers();
            expect(trackers.has(messageId)).toBe(false); // Should be removed after confirmation
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });

      // Track the message delivery
      qosManager.trackMessageDelivery(messageId, MessagePriority.NORMAL);

      // Verify tracker was created
      expect(qosManager.getDeliveryTrackers().has(messageId)).toBe(true);

      // Add a small delay to ensure delivery time > 0
      await new Promise(resolve => setTimeout(resolve, 5));

      // Confirm delivery
      qosManager.confirmMessageDelivery(messageId);

      // Wait for the event
      await deliveryPromise;
    });

    it('should report delivery failures', async () => {
      const messageId = 'test-message-3';
      const failureReason = 'network_timeout';

      // Set up the event listener before starting the process
      const failurePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Delivery failure event timeout'));
        }, 1000);

        qosManager.once('deliveryFailed', (id, reason) => {
          clearTimeout(timeout);
          try {
            expect(id).toBe(messageId);
            expect(reason).toBe(failureReason);

            const trackers = qosManager.getDeliveryTrackers();
            expect(trackers.has(messageId)).toBe(false); // Should be removed after failure report
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });

      // Track the message delivery
      qosManager.trackMessageDelivery(messageId, MessagePriority.LOW);

      // Verify tracker was created
      expect(qosManager.getDeliveryTrackers().has(messageId)).toBe(true);

      // Report failure immediately
      qosManager.reportDeliveryFailure(messageId, failureReason);

      // Wait for the event
      await failurePromise;
    });

    it('should get pending deliveries count', () => {
      expect(qosManager.getPendingDeliveries()).toBe(0);

      qosManager.trackMessageDelivery('msg-1', MessagePriority.HIGH);
      qosManager.trackMessageDelivery('msg-2', MessagePriority.NORMAL);

      expect(qosManager.getPendingDeliveries()).toBe(2);

      qosManager.confirmMessageDelivery('msg-1');
      expect(qosManager.getPendingDeliveries()).toBe(1);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide QoS statistics', () => {
      const stats = qosManager.getQoSStatistics();

      expect(stats).toHaveProperty('messagesSentByPriority');
      expect(stats).toHaveProperty('messagesFailedByPriority');
      expect(stats).toHaveProperty('averageDeliveryTimeByPriority');
      expect(stats).toHaveProperty('compressionEfficiencyByPriority');
      expect(stats).toHaveProperty('dutyCycleUsageByPriority');
      expect(stats).toHaveProperty('emergencyOverrides');
      expect(stats).toHaveProperty('totalBytesTransmitted');
      expect(stats).toHaveProperty('networkEfficiencyScore');

      // Initial values should be zero or default
      expect(stats.emergencyOverrides).toBe(0);
      expect(stats.totalBytesTransmitted).toBe(0);
      expect(stats.networkEfficiencyScore).toBe(1.0); // Perfect efficiency initially
    });

    it('should reset statistics', () => {
      // Generate some statistics by enabling emergency mode
      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();

      let stats = qosManager.getQoSStatistics();
      expect(stats.emergencyOverrides).toBeGreaterThan(0);

      qosManager.resetStatistics();

      stats = qosManager.getQoSStatistics();
      expect(stats.emergencyOverrides).toBe(0);
    });

    it('should track emergency overrides', () => {
      let stats = qosManager.getQoSStatistics();
      const initialOverrides = stats.emergencyOverrides;

      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      qosManager.enableEmergencyMode();
      qosManager.disableEmergencyMode();
      qosManager.enableEmergencyMode();

      stats = qosManager.getQoSStatistics();
      expect(stats.emergencyOverrides).toBe(initialOverrides + 2);
    });

    it('should provide efficiency history', () => {
      const history = qosManager.getEfficiencyHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid QoS levels gracefully', () => {
      const invalidPriority = 999 as MessagePriority;

      expect(() => {
        qosManager.getTransmissionParameters(invalidPriority);
      }).not.toThrow();

      const params = qosManager.getTransmissionParameters(invalidPriority);
      expect(params).toBeDefined();
      expect(params.power).toBeGreaterThan(0);
    });

    it('should handle missing duty cycle manager gracefully', () => {
      const standaloneQoSManager = new UTXOQoSManager(
        mockQoSPolicy,
        mockEmergencyConfig
        // No duty cycle manager
      );

      // Should default to allowing transmission
      const canTransmit = standaloneQoSManager.canTransmitWithQoS(
        MessagePriority.NORMAL,
        100
      );
      expect(canTransmit).toBe(true);

      // Should default to immediate transmission
      const optimalTime = standaloneQoSManager.getOptimalTransmissionTime(
        MessagePriority.NORMAL
      );
      expect(optimalTime).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('should handle unknown message types in QoS assignment', () => {
      const unknownMessage: MeshMessage = {
        type: 'completely_unknown' as any,
        payload: null,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      expect(() => {
        qosManager.assignQoSLevel(unknownMessage);
      }).not.toThrow();

      const qosLevel = qosManager.assignQoSLevel(unknownMessage);
      expect(typeof qosLevel).toBe('number');
    });

    it('should handle delivery tracking for non-existent messages', () => {
      const nonExistentId = 'does-not-exist';

      expect(() => {
        qosManager.confirmMessageDelivery(nonExistentId);
      }).not.toThrow();

      expect(() => {
        qosManager.reportDeliveryFailure(nonExistentId, 'test_reason');
      }).not.toThrow();
    });

    it('should handle policy updates with partial data', () => {
      const partialPolicy = {
        transmissionPower: {
          [MessagePriority.CRITICAL]: 25,
        },
      } as any;

      expect(() => {
        qosManager.updateQoSPolicy(partialPolicy);
      }).not.toThrow();

      // Should still be able to get transmission parameters
      const params = qosManager.getTransmissionParameters(
        MessagePriority.CRITICAL
      );
      expect(params.power).toBe(25);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple simultaneous delivery trackings', () => {
      const messageCount = 100;
      const messageIds: string[] = [];

      // Track many messages
      for (let i = 0; i < messageCount; i++) {
        const messageId = `perf-test-${i}`;
        messageIds.push(messageId);
        qosManager.trackMessageDelivery(messageId, MessagePriority.NORMAL);
      }

      expect(qosManager.getPendingDeliveries()).toBe(messageCount);

      // Confirm half, fail half
      for (let i = 0; i < messageCount; i++) {
        if (i % 2 === 0) {
          qosManager.confirmMessageDelivery(messageIds[i]);
        } else {
          qosManager.reportDeliveryFailure(messageIds[i], 'test_failure');
        }
      }

      expect(qosManager.getPendingDeliveries()).toBe(0);
    });

    it('should maintain reasonable performance for parameter retrieval', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const priority = (i % 4) as MessagePriority;
        qosManager.getTransmissionParameters(priority);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (less than 100ms for 1000 operations)
      expect(duration).toBeLessThan(100);
    });

    it('should handle rapid emergency mode toggling', () => {
      const toggleCount = 50;

      qosManager['emergencyConfig'].enabled = true; // Enable emergency config
      for (let i = 0; i < toggleCount; i++) {
        qosManager.enableEmergencyMode();
        qosManager.disableEmergencyMode();
      }

      const stats = qosManager.getQoSStatistics();
      expect(stats.emergencyOverrides).toBe(toggleCount);
      expect(qosManager.isEmergencyMode()).toBe(false);
    });
  });
});
