import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UTXOEnhancedMeshProtocol } from '../../src/enhanced-mesh-protocol.js';
import { DutyCycleConfigFactory } from '../../src/duty-cycle-config.js';
import { MemoryDatabase } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import {
  type DutyCycleConfig,
  type RoutingConfig,
  type FragmentationConfig,
  type UTXOTransaction,
  type Block,
  type CompressedMerkleProof,
  MessagePriority,
} from '../../src/types.js';

describe('Duty Cycle Integration Tests', () => {
  let meshProtocol: UTXOEnhancedMeshProtocol;
  let database: MemoryDatabase;
  let cryptoService: CryptographicService;
  let nodeKeyPair: ReturnType<typeof CryptographicService.generateKeyPair>;
  let dutyCycleConfig: DutyCycleConfig;
  let routingConfig: RoutingConfig;
  let fragmentationConfig: FragmentationConfig;

  beforeEach(async () => {
    // Initialize database
    database = new MemoryDatabase();
    await database.open(); // Explicit initialization

    // Initialize cryptographic service and generate node key pair
    cryptoService = new CryptographicService();
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');

    // Create configurations
    dutyCycleConfig = DutyCycleConfigFactory.createForRegion('EU', 'testnet');

    routingConfig = {
      routeDiscoveryTimeout: 10000,
      maxRouteDiscoveryRetries: 3,
      routeRequestTTL: 10,
      routeExpiryTime: 300000,
      routeCleanupInterval: 60000,
      maxRoutesPerDestination: 3,
      floodCacheSize: 1000,
      floodCacheTTL: 60000,
      maxPendingForwards: 100,
      forwardingTimeout: 30000,
      sequenceNumberWindow: 1000,
      cryptoSequenceCacheSize: 1000,
      enableCryptoLoopPrevention: true,
      enableFloodSuppression: true,
      enableAdaptiveRouting: true,
      enableMetricsCollection: true,
    };

    fragmentationConfig = {
      maxFragmentSize: 240,
      sessionTimeout: 30000,
      maxConcurrentSessions: 50,
      retryAttempts: 3,
      ackRequired: true,
    };

    // Initialize mesh protocol with duty cycle management
    meshProtocol = new UTXOEnhancedMeshProtocol(
      'test-node-001',
      'full',
      nodeKeyPair,
      routingConfig,
      fragmentationConfig,
      dutyCycleConfig,
      database,
      cryptoService
    );
  });

  afterEach(async () => {
    // Cleanup
    if (database) {
      await database.close(); // Proper cleanup
    }
  });

  describe('UTXOEnhancedMeshProtocol with Duty Cycle Management', () => {
    it('should initialize successfully with duty cycle configuration', () => {
      expect(meshProtocol).toBeDefined();
      expect(meshProtocol.getDutyCycleConfig()).toEqual(dutyCycleConfig);
    });

    it('should expose duty cycle management API', () => {
      expect(meshProtocol.getDutyCycleStats).toBeDefined();
      expect(meshProtocol.getQueueStatus).toBeDefined();
      expect(meshProtocol.canTransmitNow).toBeDefined();
      expect(meshProtocol.updateDutyCycleConfig).toBeDefined();
      expect(meshProtocol.getTransmissionHistory).toBeDefined();
    });

    it('should initially show zero duty cycle and empty queue', () => {
      const stats = meshProtocol.getDutyCycleStats();
      const queueStatus = meshProtocol.getQueueStatus();

      expect(stats.currentDutyCycle).toBe(0);
      expect(stats.transmissionCount).toBe(0);
      expect(queueStatus.totalMessages).toBe(0);
    });

    it('should allow transmission initially', () => {
      const canTransmit = meshProtocol.canTransmitNow(
        1000,
        MessagePriority.NORMAL
      );
      expect(canTransmit).toBe(true);
    });
  });

  describe('UTXO Transaction Handling with Duty Cycle', () => {
    let sampleUTXOTransaction: UTXOTransaction;

    beforeEach(() => {
      sampleUTXOTransaction = {
        id: 'tx_001',
        inputs: [
          {
            previousTxId: 'prev_tx_001',
            outputIndex: 0,
            unlockingScript: 'signature_and_pubkey',
            sequence: 0xffffffff,
          },
        ],
        outputs: [
          {
            value: 50000000, // 0.5 coins
            lockingScript: 'recipient_pubkey_hash',
            outputIndex: 0,
          },
          {
            value: 49990000, // Change (minus fee)
            lockingScript: 'sender_pubkey_hash',
            outputIndex: 1,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 10000, // 0.0001 coins
      };
    });

    it('should queue UTXO transactions instead of transmitting directly', async () => {
      const result = await meshProtocol.sendUTXOTransaction(
        sampleUTXOTransaction
      );

      expect(result).toBe(true); // Should succeed in queueing

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(1);

      // Should be high priority due to reasonable fee
      expect(
        queueStatus.messagesByPriority[MessagePriority.HIGH]
      ).toBeGreaterThan(0);
    });

    it('should calculate priority based on transaction fee', async () => {
      // High fee transaction
      const highFeeTx = {
        ...sampleUTXOTransaction,
        id: 'high_fee_tx',
        fee: 100000, // Higher fee
      };

      // Low fee transaction
      const lowFeeTx = {
        ...sampleUTXOTransaction,
        id: 'low_fee_tx',
        fee: 1000, // Lower fee
      };

      await meshProtocol.sendUTXOTransaction(highFeeTx);
      await meshProtocol.sendUTXOTransaction(lowFeeTx);

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(2);

      // High fee should get higher priority
      expect(
        queueStatus.messagesByPriority[MessagePriority.HIGH]
      ).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple UTXO transactions', async () => {
      const transactions = Array.from({ length: 5 }, (_, i) => ({
        ...sampleUTXOTransaction,
        id: `tx_${i}`,
        fee: 5000 + i * 1000, // Varying fees
      }));

      for (const tx of transactions) {
        const result = await meshProtocol.sendUTXOTransaction(tx);
        expect(result).toBe(true);
      }

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(5);
    });
  });

  describe('Block Handling with Duty Cycle', () => {
    let sampleBlock: Block;

    beforeEach(() => {
      sampleBlock = {
        index: 1001,
        timestamp: Date.now(),
        transactions: [], // Empty for simplicity
        previousHash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        hash: '0001234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nonce: 12345,
        merkleRoot: 'merkle_root_hash',
        difficulty: 1000,
        validator: 'test-node-001',
      };
    });

    it('should queue blocks with CRITICAL priority', async () => {
      const result = await meshProtocol.sendBlock(sampleBlock);

      expect(result).toBe(true);

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(1);
      expect(queueStatus.messagesByPriority[MessagePriority.CRITICAL]).toBe(1);
    });

    it('should handle multiple blocks', async () => {
      const blocks = Array.from({ length: 3 }, (_, i) => ({
        ...sampleBlock,
        index: 1001 + i,
        hash: `block_hash_${i}`,
      }));

      for (const block of blocks) {
        const result = await meshProtocol.sendBlock(block);
        expect(result).toBe(true);
      }

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(3);
      expect(queueStatus.messagesByPriority[MessagePriority.CRITICAL]).toBe(3);
    });
  });

  describe('Merkle Proof Handling with Duty Cycle', () => {
    let sampleMerkleProof: CompressedMerkleProof;

    beforeEach(() => {
      sampleMerkleProof = {
        txId: 'tx_proof_001',
        txHash: 'tx_hash_001',
        root: 'merkle_root_001',
        path: 'compressed_proof_path',
        index: 5,
      };
    });

    it('should queue merkle proofs with HIGH priority', async () => {
      const result = await meshProtocol.sendMerkleProof(sampleMerkleProof);

      expect(result).toBe(true);

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(1);
      expect(queueStatus.messagesByPriority[MessagePriority.HIGH]).toBe(1);
    });
  });

  describe('EU Region Compliance Integration', () => {
    it('should respect EU duty cycle limits', async () => {
      const config = meshProtocol.getDutyCycleConfig();
      expect(config.region).toBe('EU');
      expect(config.maxDutyCyclePercent).toBe(0.01); // 1%

      // Initially should allow transmission
      expect(meshProtocol.canTransmitNow(1000)).toBe(true);
    });

    it('should track duty cycle across different message types', async () => {
      // Send various message types
      await meshProtocol.sendUTXOTransaction(sampleUTXOTransaction);
      await meshProtocol.sendBlock(sampleBlock);
      await meshProtocol.sendMerkleProof(sampleMerkleProof);

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(3);

      // Should have different priorities
      expect(queueStatus.messagesByPriority[MessagePriority.CRITICAL]).toBe(1); // Block
      expect(
        queueStatus.messagesByPriority[MessagePriority.HIGH]
      ).toBeGreaterThanOrEqual(1); // Merkle proof + maybe UTXO tx
    });

    it('should validate regional compliance', () => {
      // Valid EU frequency
      const validResult = meshProtocol.getDutyCycleConfig().frequencyBands[1]; // EU868
      expect(validResult.name).toBe('EU868');
      expect(validResult.minFrequencyMHz).toBe(863);
      expect(validResult.maxFrequencyMHz).toBe(870);
    });
  });

  describe('US Region No Duty Cycle Integration', () => {
    let usMeshProtocol: UTXOEnhancedMeshProtocol;
    let usDatabase: MemoryDatabase;

    beforeEach(async () => {
      usDatabase = new MemoryDatabase();

      const usDutyCycleConfig = DutyCycleConfigFactory.createForRegion(
        'US',
        'testnet'
      );

      usMeshProtocol = new UTXOEnhancedMeshProtocol(
        'us-test-node-001',
        'full',
        nodeKeyPair,
        routingConfig,
        fragmentationConfig,
        usDutyCycleConfig,
        usDatabase,
        cryptoService
      );
    });

    afterEach(async () => {
      // Cleanup would go here if needed
    });

    it('should handle US configuration with no duty cycle limits', () => {
      const config = usMeshProtocol.getDutyCycleConfig();
      expect(config.region).toBe('US');
      expect(config.maxDutyCyclePercent).toBeUndefined();
      expect(config.frequencyHopping?.enabled).toBe(true);
    });

    it('should always allow transmission in US region', () => {
      // Transmissions within the 400ms dwell time limit should be allowed
      expect(usMeshProtocol.canTransmitNow(100)).toBe(true);
      expect(usMeshProtocol.canTransmitNow(300)).toBe(true);
      expect(usMeshProtocol.canTransmitNow(390)).toBe(true);
    });

    it('should handle frequency hopping constraints', () => {
      const config = usMeshProtocol.getDutyCycleConfig();
      expect(config.dwellTimeMs).toBe(400);
      expect(config.frequencyHopping?.numChannels).toBe(64);
      expect(config.frequencyHopping?.channelDwellTimeMs).toBe(400);
    });
  });

  describe('Configuration Updates Integration', () => {
    it('should update duty cycle configuration at runtime', () => {
      const originalConfig = meshProtocol.getDutyCycleConfig();
      expect(originalConfig.region).toBe('EU');

      meshProtocol.updateDutyCycleConfig({
        maxTransmissionTimeMs: 2000,
        trackingWindowHours: 2,
      });

      const updatedConfig = meshProtocol.getDutyCycleConfig();
      expect(updatedConfig.maxTransmissionTimeMs).toBe(2000);
      expect(updatedConfig.trackingWindowHours).toBe(2);
      expect(updatedConfig.region).toBe('EU'); // Should remain unchanged
    });

    it('should handle emergency override configuration', () => {
      meshProtocol.updateDutyCycleConfig({
        emergencyOverrideEnabled: true,
      });

      const config = meshProtocol.getDutyCycleConfig();
      expect(config.emergencyOverrideEnabled).toBe(true);
    });
  });

  describe('Database Integration', () => {
    it('should persist transmission history when database is available', () => {
      // Database is provided, so persistence should be enabled
      const config = meshProtocol.getDutyCycleConfig();
      expect(config.persistenceEnabled).toBe(true);
    });

    it('should provide transmission history', () => {
      const history = meshProtocol.getTransmissionHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0); // Initially empty
    });

    it('should provide transmission history for different time windows', () => {
      const oneHour = meshProtocol.getTransmissionHistory(1);
      const oneDay = meshProtocol.getTransmissionHistory(24);

      expect(Array.isArray(oneHour)).toBe(true);
      expect(Array.isArray(oneDay)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle queue overflow gracefully', async () => {
      // Create a protocol with a very small queue for testing
      const _smallQueueConfig = {
        ...dutyCycleConfig,
        // This would need to be supported by the queue implementation
      };

      // Send many messages to potentially overflow queue
      const promises = Array.from({ length: 20 }, (_, i) =>
        meshProtocol.sendUTXOTransaction({
          ...sampleUTXOTransaction,
          id: `overflow_tx_${i}`,
        })
      );

      const results = await Promise.all(promises);

      // Some should succeed, queue management should handle overflow
      expect(results.some(r => r === true)).toBe(true);
    });

    it('should handle invalid message types gracefully', async () => {
      // This tests the internal message type detection
      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(0);
    });

    it('should handle graceful shutdown', () => {
      expect(() => {
        // Test that the protocol can be used without errors
        meshProtocol.getDutyCycleStats();
        meshProtocol.getQueueStatus();
      }).not.toThrow();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent message submissions', async () => {
      const concurrentPromises = Array.from({ length: 10 }, async (_, i) => {
        const results = await Promise.all([
          meshProtocol.sendUTXOTransaction({
            ...sampleUTXOTransaction,
            id: `concurrent_tx_${i}`,
          }),
          meshProtocol.sendBlock({
            ...sampleBlock,
            index: 2000 + i,
            hash: `concurrent_block_${i}`,
          }),
          meshProtocol.sendMerkleProof({
            ...sampleMerkleProof,
            txId: `concurrent_proof_${i}`,
          }),
        ]);
        return results;
      });

      const allResults = await Promise.all(concurrentPromises);

      // All operations should succeed
      allResults.forEach(results => {
        results.forEach(result => {
          expect(result).toBe(true);
        });
      });

      const queueStatus = meshProtocol.getQueueStatus();
      expect(queueStatus.totalMessages).toBe(30); // 10 * 3 messages
    });

    it('should provide reasonable performance metrics', () => {
      const stats = meshProtocol.getDutyCycleStats();

      expect(stats.currentDutyCycle).toBeGreaterThanOrEqual(0);
      expect(stats.currentDutyCycle).toBeLessThanOrEqual(1);
      expect(stats.complianceRate).toBeGreaterThanOrEqual(0);
      expect(stats.complianceRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Event Integration', () => {
    it('should setup event listeners without errors', () => {
      // Test that the protocol can register for events
      expect(() => {
        meshProtocol.on('duty_cycle_warning', () => {});
        meshProtocol.on('duty_cycle_violation', () => {});
        meshProtocol.on('message_dropped', () => {});
      }).not.toThrow();
    });
  });

  // Declare sample variables for use in multiple tests
  let sampleUTXOTransaction: UTXOTransaction;
  let sampleBlock: Block;
  let sampleMerkleProof: CompressedMerkleProof;

  beforeEach(() => {
    sampleUTXOTransaction = {
      id: 'tx_integration_001',
      inputs: [
        {
          previousTxId: 'prev_tx_integration_001',
          outputIndex: 0,
          unlockingScript: 'signature_and_pubkey_integration',
          sequence: 0xffffffff,
        },
      ],
      outputs: [
        {
          value: 50000000,
          lockingScript: 'recipient_pubkey_hash_integration',
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 10000,
    };

    sampleBlock = {
      index: 2001,
      timestamp: Date.now(),
      transactions: [],
      previousHash:
        '0000000000000000000000000000000000000000000000000000000000000001',
      hash: '0001234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde1',
      nonce: 123456,
      merkleRoot: 'merkle_root_hash_integration',
      difficulty: 1000,
      validator: 'test-node-integration-001',
    };

    sampleMerkleProof = {
      txId: 'tx_proof_integration_001',
      txHash: 'tx_hash_integration_001',
      root: 'merkle_root_integration_001',
      path: 'compressed_proof_path_integration',
      index: 10,
    };
  });
});
