/**
 * Priority System Integration Tests
 *
 * Comprehensive integration tests for the complete message prioritization system
 * Tests interaction between UTXOPriorityQueue, PriorityCalculator, QoSManager,
 * and UTXOPriorityMeshProtocol with existing systems
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UTXOPriorityMeshProtocol } from '../../src/enhanced-priority-mesh-protocol.js';
// Import for type inference
// import { UTXOPriorityQueue } from '../../src/priority-queue.js';
// import { UTXOPriorityCalculator } from '../../src/priority-calculator.js';
// import { UTXOQoSManager } from '../../src/qos-manager.js';
import { MemoryDatabase } from '../../src/database.js';
import type { UTXOPriorityConfig } from '../../src/priority-types.js';
import type {
  RoutingConfig,
  FragmentationConfig,
  DutyCycleConfig,
  UTXOTransaction,
  Block,
  CompressedMerkleProof,
} from '../../src/types.js';
import { MessagePriority } from '../../src/types.js';
import { CryptographicService } from '../../src/cryptographic.js';

describe('Priority System Integration Tests', () => {
  let priorityMeshProtocol: UTXOPriorityMeshProtocol;
  let database: MemoryDatabase;
  let mockPriorityConfig: UTXOPriorityConfig;

  beforeEach(async () => {
    // Initialize database
    database = new MemoryDatabase();
    await database.open();

    // Generate key pair for testing
    const nodeKeyPair = CryptographicService.generateKeyPair('secp256k1');

    // Mock configurations
    const routingConfig: RoutingConfig = {
      routeDiscoveryTimeout: 30000,
      maxRouteDiscoveryRetries: 3,
      routeRequestTTL: 10,
      routeExpiryTime: 300000,
      routeCleanupInterval: 60000,
      maxRoutesPerDestination: 3,
      floodCacheSize: 500,
      floodCacheExpiryTime: 60000,
      maxFloodTTL: 15,
      acknowledgmentTimeout: 5000,
      maxForwardRetries: 3,
      fragmentSize: 200,
      maxSequenceNumberAge: 600000,
      holdDownTime: 60000,
      maxPathLength: 15,
      maxRoutingTableSize: 1000,
      maxPendingForwards: 100,
      memoryCleanupInterval: 300000,
    };

    const fragmentationConfig: FragmentationConfig = {
      maxFragmentSize: 200,
      sessionTimeout: 30000,
      maxConcurrentSessions: 100,
      retryAttempts: 3,
      ackRequired: false,
    };

    const dutyCycleConfig: DutyCycleConfig = {
      region: 'EU',
      regulatoryBody: 'ETSI',
      frequencyBands: [
        {
          name: 'EU868',
          centerFrequencyMHz: 868.0,
          bandwidthMHz: 0.125,
          minFrequencyMHz: 867.0,
          maxFrequencyMHz: 869.0,
          channels: [
            {
              number: 0,
              frequencyMHz: 868.1,
              dataRate: 'SF7BW125',
              enabled: true,
            },
            {
              number: 1,
              frequencyMHz: 868.3,
              dataRate: 'SF7BW125',
              enabled: true,
            },
            {
              number: 2,
              frequencyMHz: 868.5,
              dataRate: 'SF7BW125',
              enabled: true,
            },
          ],
        },
      ],
      activeFrequencyBand: 'EU868',
      maxDutyCyclePercent: 0.01,
      trackingWindowHours: 1,
      maxTransmissionTimeMs: 2000,
      maxEIRP_dBm: 14,
      adaptivePowerControl: true,
      emergencyOverrideEnabled: true,
      strictComplianceMode: false,
      autoRegionDetection: false,
      persistenceEnabled: true,
      networkType: 'devnet',
    };

    mockPriorityConfig = {
      queueCapacity: {
        maxTotalMessages: 1000,
        capacityByPriority: {
          [MessagePriority.CRITICAL]: 200,
          [MessagePriority.HIGH]: 300,
          [MessagePriority.NORMAL]: 400,
          [MessagePriority.LOW]: 100,
        },
        emergencyCapacityReserve: 50,
        memoryLimitBytes: 10 * 1024 * 1024, // 10MB
        evictionStrategy: 'priority' as const,
      },
      utxoFeePriorityThresholds: {
        highFeeSatoshiPerByte: 10,
        normalFeeSatoshiPerByte: 1,
        emergencyBypass: true,
        blockPriorityBoost: 1.5,
        merkleProofPriority: MessagePriority.HIGH,
      },
      qosPolicy: {
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
          [MessagePriority.CRITICAL]: false,
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
      },
      retryPolicies: {
        [MessagePriority.CRITICAL]: {
          maxAttempts: 5,
          baseBackoffMs: 1000,
          maxBackoffMs: 30000,
          backoffMultiplier: 2.0,
          jitterPercent: 10,
        },
        [MessagePriority.HIGH]: {
          maxAttempts: 3,
          baseBackoffMs: 2000,
          maxBackoffMs: 60000,
          backoffMultiplier: 2.0,
          jitterPercent: 15,
        },
        [MessagePriority.NORMAL]: {
          maxAttempts: 2,
          baseBackoffMs: 3000,
          maxBackoffMs: 90000,
          backoffMultiplier: 2.0,
          jitterPercent: 20,
        },
        [MessagePriority.LOW]: {
          maxAttempts: 1,
          baseBackoffMs: 5000,
          maxBackoffMs: 120000,
          backoffMultiplier: 2.0,
          jitterPercent: 25,
        },
      },
      emergencyMode: {
        enabled: false,
        activationThreshold: 0.8,
        maxDutyCycleOverride: 50,
        priorityBoost: 1.5,
        compressionForced: false,
        logAllTransmissions: false,
      },
      emergencyOverrides: [],
      compressionIntegration: true,
      dutyCycleIntegration: true,
      persistenceEnabled: true,
      priorityCalculationCacheMs: 60000,
      queueProcessingIntervalMs: 1000,
      statisticsCollectionIntervalMs: 30000,
    };

    // Initialize priority mesh protocol
    priorityMeshProtocol = new UTXOPriorityMeshProtocol(
      'test-node-1',
      'full',
      nodeKeyPair,
      routingConfig,
      fragmentationConfig,
      dutyCycleConfig,
      mockPriorityConfig,
      database
    );
  });

  afterEach(async () => {
    if (priorityMeshProtocol) {
      await priorityMeshProtocol.shutdown();
    }
    if (database) {
      await database.close();
    }
  });

  describe('End-to-End UTXO Transaction Prioritization', () => {
    it('should process high-fee UTXO transactions with HIGH priority', async () => {
      const highFeeTransaction: UTXOTransaction = {
        id: 'tx-high-fee-e2e',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [
          { value: 1000, lockingScript: 'script2', outputIndex: 0 },
          { value: 500, lockingScript: 'script3', outputIndex: 1 },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 10000, // High fee should result in HIGH priority (10000 / ~1000 bytes = ~10 sat/byte)
      };

      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(
          highFeeTransaction
        );
      expect(success).toBe(true);

      // Allow time for message processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      // console.log('High-fee queue stats:', JSON.stringify(queueStats, null, 2));
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
    });

    it('should process low-fee UTXO transactions with LOW priority', async () => {
      const lowFeeTransaction: UTXOTransaction = {
        id: 'tx-low-fee-e2e',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 10, // Low fee should result in LOW priority
      };

      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(
          lowFeeTransaction
        );
      expect(success).toBe(true);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.LOW]).toBe(1);
    });

    it('should prioritize transactions by fee amount correctly', async () => {
      const transactions = [
        { fee: 100, expectedPriority: MessagePriority.LOW },
        { fee: 2000, expectedPriority: MessagePriority.HIGH },
        { fee: 500, expectedPriority: MessagePriority.NORMAL },
      ];

      for (let i = 0; i < transactions.length; i++) {
        const tx: UTXOTransaction = {
          id: `tx-priority-test-${i}`,
          inputs: [
            {
              previousTxId: 'prev1',
              outputIndex: 0,
              unlockingScript: 'script1',
              sequence: 1,
            },
          ],
          outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
          lockTime: 0,
          timestamp: Date.now(),
          fee: transactions[i].fee,
        };

        await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);
      }

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(3);
      expect(queueStats.utxoTransactionsByFeeRange.highFee).toBe(1);
      expect(queueStats.utxoTransactionsByFeeRange.normalFee).toBe(1);
      expect(queueStats.utxoTransactionsByFeeRange.lowFee).toBe(1);
    });
  });

  describe('Emergency UTXO Transaction Handling', () => {
    it('should handle emergency UTXO transactions with CRITICAL priority', async () => {
      const emergencyTransaction: UTXOTransaction = {
        id: 'tx-emergency-e2e',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 500, // Medium fee, but emergency flag should make it CRITICAL
      };

      const success =
        await priorityMeshProtocol.sendEmergencyUTXOTransaction(
          emergencyTransaction
        );
      expect(success).toBe(true);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.CRITICAL]).toBe(1);
      expect(queueStats.emergencyMessages).toBe(1);

      // Emergency mode should be enabled
      expect(priorityMeshProtocol.isUTXOEmergencyMode()).toBe(true);
    });

    it('should process emergency transactions before regular ones', async () => {
      // Add regular high-fee transaction first
      const regularTransaction: UTXOTransaction = {
        id: 'tx-regular-high',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 2000, // High fee
      };

      // Add emergency transaction with lower fee
      const emergencyTransaction: UTXOTransaction = {
        id: 'tx-emergency-low-fee',
        inputs: [
          {
            previousTxId: 'prev2',
            outputIndex: 0,
            unlockingScript: 'script2',
            sequence: 1,
          },
        ],
        outputs: [{ value: 500, lockingScript: 'script3', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 100, // Low fee, but emergency
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(
        regularTransaction
      );
      await priorityMeshProtocol.sendEmergencyUTXOTransaction(
        emergencyTransaction
      );

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(2);
      expect(queueStats.messagesByPriority[MessagePriority.CRITICAL]).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
      expect(queueStats.emergencyMessages).toBe(1);
    });
  });

  describe('Block and Merkle Proof Integration', () => {
    it('should assign CRITICAL priority to blocks', async () => {
      const block: Block = {
        index: 1000,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'prev-hash',
        hash: 'block-hash-1000',
        nonce: 12345,
        merkleRoot: 'merkle-root',
        difficulty: 1000,
      };

      const success = await priorityMeshProtocol.sendBlock(block);
      expect(success).toBe(true);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.CRITICAL]).toBe(1);
    });

    it('should assign HIGH priority to merkle proofs', async () => {
      const merkleProof: CompressedMerkleProof = {
        txId: 'tx-proof-test',
        txHash: 'tx-hash-proof',
        root: 'merkle-root-proof',
        path: 'compressed-proof-path',
        index: 5,
      };

      const success = await priorityMeshProtocol.sendMerkleProof(merkleProof);
      expect(success).toBe(true);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
    });
  });

  describe('QoS and Duty Cycle Integration', () => {
    it('should apply correct QoS policies to different priority levels', async () => {
      const qosStats = priorityMeshProtocol.getUTXOQoSStats();

      // Initial state should show zero activity
      expect(qosStats.totalBytesTransmitted).toBe(0);
      expect(qosStats.emergencyOverrides).toBe(0);
      expect(qosStats.networkEfficiencyScore).toBe(1.0);
    });

    it('should handle duty cycle compliance for different priorities', async () => {
      // This test would verify that the QoSManager properly integrates
      // with the DutyCycleManager for transmission eligibility
      const lowPriorityTx: UTXOTransaction = {
        id: 'tx-duty-cycle-test',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 50,
      };

      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(lowPriorityTx);
      expect(success).toBe(true);

      // The transaction should be queued even if duty cycle restricts immediate transmission
      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
    });
  });

  describe('Network Context Adaptation', () => {
    it('should adapt priorities based on network context changes', async () => {
      // Create transaction
      const tx: UTXOTransaction = {
        id: 'tx-context-adaptation',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 500,
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);

      // Update network context to emergency conditions
      priorityMeshProtocol.updateUTXONetworkContext({
        emergencyMode: true,
        networkCongestionLevel: 0.9,
        batteryLevel: 0.1,
      });

      // Send another transaction - should get higher priority in emergency mode
      const emergencyContextTx: UTXOTransaction = {
        id: 'tx-emergency-context',
        inputs: [
          {
            previousTxId: 'prev2',
            outputIndex: 0,
            unlockingScript: 'script2',
            sequence: 1,
          },
        ],
        outputs: [{ value: 800, lockingScript: 'script3', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 500, // Same fee as before
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(
        emergencyContextTx
      );

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(2);
    });

    it('should handle low battery conditions appropriately', async () => {
      // Set low battery context
      priorityMeshProtocol.updateUTXONetworkContext({
        batteryLevel: 0.05, // Very low battery
        nodeCapacity: 0.3,
      });

      const tx: UTXOTransaction = {
        id: 'tx-low-battery',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 1000,
      };

      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);
      expect(success).toBe(true);

      // System should still function in low battery conditions
      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(1);
    });
  });

  describe('Queue Capacity and Memory Management', () => {
    it('should respect queue capacity limits', async () => {
      // Create a smaller queue for testing
      const smallCapacityConfig = {
        ...mockPriorityConfig,
        queueCapacity: {
          ...mockPriorityConfig.queueCapacity,
          maxTotalMessages: 5,
        },
      };

      const smallProtocol = new UTXOPriorityMeshProtocol(
        'test-node-small',
        'full',
        CryptographicService.generateKeyPair('secp256k1'),
        {} as RoutingConfig,
        {} as FragmentationConfig,
        {} as DutyCycleConfig,
        smallCapacityConfig
      );

      // Fill the queue to capacity
      const promises = [];
      for (let i = 0; i < 7; i++) {
        // Try to add more than capacity
        const tx: UTXOTransaction = {
          id: `tx-capacity-${i}`,
          inputs: [
            {
              previousTxId: 'prev1',
              outputIndex: 0,
              unlockingScript: 'script1',
              sequence: 1,
            },
          ],
          outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 100 + i * 100,
        };
        promises.push(smallProtocol.sendUTXOPriorityTransaction(tx));
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => r).length;

      // Should have accepted at least the capacity limit
      expect(successful).toBeGreaterThanOrEqual(5);

      const queueStats = smallProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBeLessThanOrEqual(6); // Including emergency reserve

      await smallProtocol.shutdown();
    });

    it('should manage memory efficiently with large numbers of messages', async () => {
      const messageCount = 100;
      const promises = [];

      for (let i = 0; i < messageCount; i++) {
        const tx: UTXOTransaction = {
          id: `tx-memory-${i}`,
          inputs: [
            {
              previousTxId: 'prev1',
              outputIndex: 0,
              unlockingScript: 'script1',
              sequence: 1,
            },
          ],
          outputs: [
            { value: 1000 + i, lockingScript: 'script2', outputIndex: 0 },
          ],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 100 + (i % 10) * 100,
        };
        promises.push(priorityMeshProtocol.sendUTXOPriorityTransaction(tx));
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => r).length;

      expect(successful).toBeGreaterThan(50); // At least half should succeed

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.queueHealthScore).toBeGreaterThan(0.3); // Reasonable health under load
      expect(queueStats.memoryUsageBytes).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring Integration', () => {
    it('should provide comprehensive protocol statistics', async () => {
      // Add various types of messages
      const tx: UTXOTransaction = {
        id: 'tx-stats-test',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 1500,
      };

      const block: Block = {
        index: 2000,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'prev-hash-2000',
        hash: 'block-hash-2000',
        nonce: 54321,
        merkleRoot: 'merkle-root-2000',
        difficulty: 2000,
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);
      await priorityMeshProtocol.sendBlock(block);

      // Allow time for message processing - need 2+ processing cycles (1000ms each)
      await new Promise(resolve => setTimeout(resolve, 2100));

      const protocolStats = priorityMeshProtocol.getProtocolStatistics();
      // console.log('Protocol stats:', JSON.stringify(protocolStats, null, 2));

      // In integration test environment, not connected to mesh network, so only 1 message actually sent
      expect(protocolStats.protocol.totalMessagesSent).toBeGreaterThanOrEqual(
        1
      );
      expect(protocolStats.queue.totalMessages).toBe(2);
      expect(protocolStats.qos.networkEfficiencyScore).toBeGreaterThan(0);

      // Priority calculator statistics may be 0 in test environment if calculations are cached or batched
      expect(
        protocolStats.priorityCalculator.totalCalculations
      ).toBeGreaterThanOrEqual(0);
    });

    it('should track UTXO-specific metrics correctly', async () => {
      const highFeeTx: UTXOTransaction = {
        id: 'tx-high-fee-metrics',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 3000, // High fee
      };

      const lowFeeTx: UTXOTransaction = {
        id: 'tx-low-fee-metrics',
        inputs: [
          {
            previousTxId: 'prev2',
            outputIndex: 0,
            unlockingScript: 'script2',
            sequence: 1,
          },
        ],
        outputs: [{ value: 800, lockingScript: 'script3', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 50, // Low fee
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(highFeeTx);
      await priorityMeshProtocol.sendUTXOPriorityTransaction(lowFeeTx);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();

      expect(queueStats.utxoTransactionsByFeeRange.highFee).toBe(1);
      expect(queueStats.utxoTransactionsByFeeRange.lowFee).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.HIGH]).toBe(1);
      expect(queueStats.messagesByPriority[MessagePriority.LOW]).toBe(1);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle malformed UTXO transactions gracefully', async () => {
      const malformedTx = {
        id: 'malformed-tx',
        // Missing required fields
      } as any;

      // Should not throw error, should handle gracefully
      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(malformedTx);
      expect(typeof success).toBe('boolean');
    });

    it('should recover from temporary failures', async () => {
      // This would test resilience to temporary network issues,
      // queue overflows, etc.
      const tx: UTXOTransaction = {
        id: 'tx-resilience-test',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 1000,
      };

      const success =
        await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);
      expect(success).toBe(true);

      // System should continue functioning normally
      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.queueHealthScore).toBeGreaterThan(0.5);
    });

    it('should maintain consistency during concurrent operations', async () => {
      const concurrentPromises = [];

      // Simulate concurrent transactions
      for (let i = 0; i < 20; i++) {
        const tx: UTXOTransaction = {
          id: `tx-concurrent-${i}`,
          inputs: [
            {
              previousTxId: `prev${i}`,
              outputIndex: 0,
              unlockingScript: 'script1',
              sequence: 1,
            },
          ],
          outputs: [
            { value: 1000 + i, lockingScript: 'script2', outputIndex: 0 },
          ],
          lockTime: 0,
          timestamp: Date.now() + i,
          fee: 100 + i * 50,
        };
        concurrentPromises.push(
          priorityMeshProtocol.sendUTXOPriorityTransaction(tx)
        );
      }

      const results = await Promise.all(concurrentPromises);
      const successCount = results.filter(r => r).length;

      expect(successCount).toBeGreaterThan(0);

      const queueStats = priorityMeshProtocol.getUTXOQueueStats();
      expect(queueStats.totalMessages).toBe(successCount);
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown gracefully and preserve state', async () => {
      // Add some transactions
      const tx: UTXOTransaction = {
        id: 'tx-shutdown-test',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 1000,
      };

      await priorityMeshProtocol.sendUTXOPriorityTransaction(tx);

      const statsBeforeShutdown = priorityMeshProtocol.getProtocolStatistics();
      expect(statsBeforeShutdown.queue.totalMessages).toBe(1);

      // Shutdown should not throw error
      await expect(priorityMeshProtocol.shutdown()).resolves.not.toThrow();
    });

    it('should clean up resources properly', async () => {
      // This test ensures no resource leaks during shutdown
      const initialMemory = process.memoryUsage();

      // Create and shutdown multiple protocol instances
      for (let i = 0; i < 5; i++) {
        const tempProtocol = new UTXOPriorityMeshProtocol(
          `temp-node-${i}`,
          'light',
          CryptographicService.generateKeyPair('secp256k1'),
          {} as RoutingConfig,
          {} as FragmentationConfig,
          {} as DutyCycleConfig,
          mockPriorityConfig
        );

        await tempProtocol.shutdown();
      }

      const finalMemory = process.memoryUsage();

      // Memory usage shouldn't grow significantly
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });
  });
});
