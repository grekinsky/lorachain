/**
 * UTXOReliableDeliveryManager Unit Tests
 *
 * Comprehensive tests for UTXO reliable delivery with retry logic, circuit breakers,
 * and integration with existing systems (compression, duty cycle, priority)
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { CryptographicService } from '../../src/cryptographic.js';
import type {
  ReliableMessage,
  AckMessage,
  ReliableDeliveryConfig,
  KeyPair,
} from '../../src/types.js';
import { Logger } from '@lorachain/shared';

// Mock Logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('UTXOReliableDeliveryManager', () => {
  let deliveryManager: UTXOReliableDeliveryManager;
  let nodeKeyPair: KeyPair;
  let cryptoService: CryptographicService;
  let mockLogger: any;
  let mockMeshProtocol: any;
  let mockDutyCycleManager: any;
  let config: ReliableDeliveryConfig;

  const TEST_NODE_ID = 'test-delivery-node-001';

  beforeEach(() => {
    // Create test key pair
    nodeKeyPair = CryptographicService.generateKeyPair('secp256k1');
    cryptoService = new CryptographicService();
    mockLogger = Logger.getInstance();

    // Create test configuration
    config = {
      defaultRetryPolicy: {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 1.5,
        jitterMaxMs: 500,
        maxAttempts: 3,
      },
      maxPendingMessages: 100,
      ackTimeoutMs: 5000,
      enablePersistence: false,
      deadLetterThreshold: 10,
      enableCompression: true,
      enableDutyCycleIntegration: true,
      enablePriorityCalculation: true,
    };

    // Create mock mesh protocol
    mockMeshProtocol = {
      sendRoutedMessage: vi.fn().mockResolvedValue(true),
      broadcastMessage: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue(true),
    };

    // Create mock duty cycle manager
    mockDutyCycleManager = {
      canTransmit: vi.fn().mockReturnValue(true),
      enqueueMessage: vi.fn().mockResolvedValue(true),
    };

    deliveryManager = new UTXOReliableDeliveryManager(
      TEST_NODE_ID,
      nodeKeyPair,
      config,
      undefined, // ACK handler created internally
      cryptoService
    );

    // Set up integrations
    deliveryManager.setMeshProtocol(mockMeshProtocol);
    deliveryManager.setDutyCycleManager(mockDutyCycleManager);
  });

  afterEach(async () => {
    await deliveryManager.shutdown();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(deliveryManager).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'UTXOReliableDeliveryManager initialized',
        expect.objectContaining({
          nodeId: TEST_NODE_ID,
          maxPendingMessages: config.maxPendingMessages,
          ackTimeoutMs: config.ackTimeoutMs,
        })
      );
    });

    test('should create default configuration when not provided', () => {
      const defaultManager = new UTXOReliableDeliveryManager(
        'test-node',
        nodeKeyPair,
        {} as ReliableDeliveryConfig
      );

      const metrics = defaultManager.getDeliveryMetrics();
      expect(metrics.totalMessagesSent).toBe(0);

      defaultManager.shutdown();
    });

    test('should set up integration with external systems', () => {
      const integrationManager = new UTXOReliableDeliveryManager(
        'integration-test',
        nodeKeyPair,
        config
      );

      integrationManager.setMeshProtocol(mockMeshProtocol);
      integrationManager.setDutyCycleManager(mockDutyCycleManager);

      // Should configure without errors
      expect(integrationManager).toBeDefined();

      integrationManager.shutdown();
    });
  });

  describe('Reliable Message Sending', () => {
    test('should send reliable message successfully', async () => {
      const message: ReliableMessage = {
        id: 'test-reliable-001',
        type: 'transaction',
        payload: { test: 'data' },
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      const messageId = await deliveryManager.sendReliableMessage(message);

      expect(messageId).toBe('test-reliable-001');
      expect(mockMeshProtocol.broadcastMessage).toHaveBeenCalledWith(message);

      const metrics = deliveryManager.getDeliveryMetrics();
      expect(metrics.totalMessagesSent).toBe(1);
      expect(metrics.currentPendingCount).toBe(1);
    });

    test('should send routed reliable message to specific target', async () => {
      const message: ReliableMessage = {
        id: 'test-routed-001',
        type: 'block',
        payload: { blockData: 'test' },
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'guaranteed',
        maxRetries: 5,
        timeoutMs: 5000,
        priority: 0,
      };

      const targetNodeId = 'target-node-001';
      const messageId = await deliveryManager.sendReliableMessage(
        message,
        targetNodeId
      );

      expect(messageId).toBe('test-routed-001');
      expect(mockMeshProtocol.sendRoutedMessage).toHaveBeenCalledWith(
        message,
        targetNodeId
      );
    });

    test('should generate message ID when not provided', async () => {
      const message = {
        type: 'sync',
        payload: { syncData: 'test' },
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'best-effort',
        maxRetries: 1,
        timeoutMs: 5000,
        priority: 2,
      } as ReliableMessage;

      const messageId = await deliveryManager.sendReliableMessage(message);

      expect(messageId).toBeDefined();
      expect(messageId.length).toBeGreaterThan(0);
      expect(message.id).toBe(messageId);
    });

    test('should reject message when pending limit exceeded', async () => {
      const smallConfig: ReliableDeliveryConfig = {
        ...config,
        maxPendingMessages: 1,
      };

      const limitedManager = new UTXOReliableDeliveryManager(
        'limited-node',
        nodeKeyPair,
        smallConfig
      );
      limitedManager.setMeshProtocol(mockMeshProtocol);

      const message1: ReliableMessage = {
        id: 'limit-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'sig1',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      const message2: ReliableMessage = {
        id: 'limit-test-002',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'sig2',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await limitedManager.sendReliableMessage(message1);

      await expect(
        limitedManager.sendReliableMessage(message2)
      ).rejects.toThrow('Maximum pending messages exceeded');

      limitedManager.shutdown();
    });

    test('should respect duty cycle integration when enabled', async () => {
      mockDutyCycleManager.canTransmit.mockReturnValue(false);

      const message: ReliableMessage = {
        id: 'duty-cycle-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      const messageId = await deliveryManager.sendReliableMessage(message);

      // Should still return message ID but schedule for retry
      expect(messageId).toBe('duty-cycle-test');
      expect(mockDutyCycleManager.canTransmit).toHaveBeenCalled();
    });

    test('should handle initial transmission failure', async () => {
      mockMeshProtocol.broadcastMessage.mockResolvedValue(false);

      const message: ReliableMessage = {
        id: 'transmission-fail-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      const messageId = await deliveryManager.sendReliableMessage(message);

      expect(messageId).toBe('transmission-fail-test');
      // Should schedule retry for failed transmission
      const status = deliveryManager.getDeliveryStatus(messageId);
      expect(status).toBeDefined();
      expect(status!.status).toBe('pending');
    });
  });

  describe('Acknowledgment Handling', () => {
    test('should handle successful ACK message', async () => {
      // First send a message
      const message: ReliableMessage = {
        id: 'ack-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Create and process ACK
      const ackMessage: AckMessage = {
        type: 'ack',
        messageId: 'ack-test-001',
        fromNodeId: 'remote-node-001',
        timestamp: Date.now(),
        signature: 'ack-signature',
      };

      let deliveryEvent: any = null;
      deliveryManager.on('delivered', event => {
        deliveryEvent = event;
      });

      await deliveryManager.handleAcknowledgment(ackMessage);

      expect(deliveryEvent).toBeDefined();
      expect(deliveryEvent.messageId).toBe('ack-test-001');

      const status = deliveryManager.getDeliveryStatus('ack-test-001');
      expect(status?.status).toBe('acknowledged');
      expect(status?.acknowledgedTime).toBeDefined();

      const metrics = deliveryManager.getDeliveryMetrics();
      expect(metrics.messagesDelivered).toBe(1);
      expect(metrics.currentPendingCount).toBe(0);
    });

    test('should handle NACK message with retry', async () => {
      const message: ReliableMessage = {
        id: 'nack-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      const nackMessage: AckMessage = {
        type: 'nack',
        messageId: 'nack-test-001',
        fromNodeId: 'remote-node-001',
        timestamp: Date.now(),
        signature: 'nack-signature',
      };

      await deliveryManager.handleAcknowledgment(nackMessage);

      const status = deliveryManager.getDeliveryStatus('nack-test-001');
      expect(status?.lastError).toBe('NACK received');
      expect(status?.retryCount).toBeGreaterThan(0);
    });

    test('should ignore ACK for unknown message', async () => {
      const unknownAck: AckMessage = {
        type: 'ack',
        messageId: 'unknown-message-001',
        fromNodeId: 'remote-node-001',
        timestamp: Date.now(),
        signature: 'ack-signature',
      };

      // Should not throw error
      await deliveryManager.handleAcknowledgment(unknownAck);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ACK received for unknown message',
        expect.objectContaining({
          messageId: 'unknown-message-001',
        })
      );
    });

    test('should handle invalid ACK message', async () => {
      const message: ReliableMessage = {
        id: 'invalid-ack-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Mock ACK handler to return invalid
      const ackHandler = (deliveryManager as any).ackHandler;
      vi.spyOn(ackHandler, 'processIncomingAck').mockResolvedValue(false);

      const invalidAck: AckMessage = {
        type: 'ack',
        messageId: 'invalid-ack-test',
        fromNodeId: 'bad-node',
        timestamp: Date.now(),
        signature: 'invalid-signature',
      };

      await deliveryManager.handleAcknowledgment(invalidAck);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid ACK received',
        expect.objectContaining({
          messageId: 'invalid-ack-test',
        })
      );
    });
  });

  describe('Retry Logic and Circuit Breaker', () => {
    test('should retry failed message with exponential backoff', async () => {
      mockMeshProtocol.broadcastMessage.mockResolvedValue(false);

      const message: ReliableMessage = {
        id: 'retry-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Wait for retry processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = deliveryManager.getDeliveryStatus('retry-test-001');
      expect(status?.retryCount).toBeGreaterThan(0);
    });

    test('should move message to dead letter queue after max retries', async () => {
      mockMeshProtocol.broadcastMessage.mockResolvedValue(false);

      const message: ReliableMessage = {
        id: 'dead-letter-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 1, // Low retry count for test
        timeoutMs: 1000,
        priority: 1,
      };

      let failedEvent: any = null;
      deliveryManager.on('failed', event => {
        failedEvent = event;
      });

      await deliveryManager.sendReliableMessage(message);

      // Process retries manually for test
      for (let i = 0; i < 5; i++) {
        await (deliveryManager as any).processRetryQueue();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      expect(failedEvent).toBeDefined();
      expect(failedEvent.messageId).toBe('dead-letter-test');

      const status = deliveryManager.getDeliveryStatus('dead-letter-test');
      expect(status?.status).toBe('failed');
    });

    test('should implement circuit breaker for failing nodes', async () => {
      const targetNode = 'failing-node-001';
      mockMeshProtocol.sendRoutedMessage.mockResolvedValue(false);

      // Send multiple messages to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        const message: ReliableMessage = {
          id: `circuit-test-${i}`,
          type: 'transaction',
          payload: {},
          timestamp: Date.now(),
          from: TEST_NODE_ID,
          signature: `signature-${i}`,
          reliability: 'confirmed',
          maxRetries: 1,
          timeoutMs: 1000,
          priority: 1,
        };

        try {
          await deliveryManager.sendReliableMessage(message, targetNode);
          // Force failure by manually incrementing circuit breaker
          (deliveryManager as any).incrementCircuitBreakerFailure(targetNode);
        } catch (error) {
          // Circuit breaker should eventually open
          expect(error.message).toContain('Circuit breaker open');
          break;
        }
      }
    });

    test('should reset circuit breaker on successful delivery', async () => {
      const targetNode = 'recovery-node-001';

      // Simulate some failures
      (deliveryManager as any).incrementCircuitBreakerFailure(targetNode);
      (deliveryManager as any).incrementCircuitBreakerFailure(targetNode);

      // Simulate successful delivery
      (deliveryManager as any).resetCircuitBreaker(targetNode);

      // Should be able to send message again
      const message: ReliableMessage = {
        id: 'recovery-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      // Should not throw circuit breaker error
      const messageId = await deliveryManager.sendReliableMessage(
        message,
        targetNode
      );
      expect(messageId).toBe('recovery-test');
    });
  });

  describe('Message Timeout Handling', () => {
    test('should handle ACK timeout with retry', async () => {
      const shortTimeoutConfig: ReliableDeliveryConfig = {
        ...config,
        ackTimeoutMs: 100, // Very short timeout for test
      };

      const timeoutManager = new UTXOReliableDeliveryManager(
        'timeout-test-node',
        nodeKeyPair,
        shortTimeoutConfig
      );
      timeoutManager.setMeshProtocol(mockMeshProtocol);

      const message: ReliableMessage = {
        id: 'timeout-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 100,
        priority: 1,
      };

      await timeoutManager.sendReliableMessage(message);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const status = timeoutManager.getDeliveryStatus('timeout-test-001');
      expect(status?.retryCount).toBeGreaterThan(0);

      await timeoutManager.shutdown();
    });
  });

  describe('Priority and Compression Integration', () => {
    test('should apply message priority when priority calculator is available', async () => {
      const mockPriorityCalculator = {
        calculatePriority: vi.fn().mockReturnValue(0), // Critical priority
      };

      deliveryManager.setPriorityCalculator(mockPriorityCalculator);

      const message: ReliableMessage = {
        id: 'priority-test',
        type: 'block',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 2, // Original priority
      };

      await deliveryManager.sendReliableMessage(message);

      expect(mockPriorityCalculator.calculatePriority).toHaveBeenCalled();
      // Priority should be updated by calculator
      expect(message.priority).toBe(0);
    });

    test('should apply compression when compression manager is available', async () => {
      const mockCompressionManager = {
        compress: vi.fn().mockResolvedValue({ compressed: 'data' }),
      };

      deliveryManager.setCompressionManager(mockCompressionManager);

      const message: ReliableMessage = {
        id: 'compression-test',
        type: 'transaction',
        payload: { large: 'data'.repeat(100) },
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      expect(mockCompressionManager.compress).toHaveBeenCalledWith(
        message.payload
      );
    });
  });

  describe('Delivery Status and Metrics', () => {
    test('should provide accurate delivery status', async () => {
      const message: ReliableMessage = {
        id: 'status-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      const status = deliveryManager.getDeliveryStatus('status-test-001');
      expect(status).toBeDefined();
      expect(status!.messageId).toBe('status-test-001');
      expect(status!.status).toBe('pending');
      expect(status!.sentTime).toBeGreaterThan(0);
      expect(status!.retryCount).toBe(0);
    });

    test('should return null for unknown message status', () => {
      const status = deliveryManager.getDeliveryStatus('unknown-message');
      expect(status).toBeNull();
    });

    test('should provide comprehensive delivery metrics', async () => {
      // Send some messages
      await deliveryManager.sendReliableMessage({
        id: 'metrics-test-1',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'sig1',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      });

      await deliveryManager.sendReliableMessage({
        id: 'metrics-test-2',
        type: 'block',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'sig2',
        reliability: 'guaranteed',
        maxRetries: 5,
        timeoutMs: 5000,
        priority: 0,
      });

      const metrics = deliveryManager.getDeliveryMetrics();
      expect(metrics.totalMessagesSent).toBe(2);
      expect(metrics.currentPendingCount).toBe(2);
      expect(metrics.messagesDelivered).toBe(0);
      expect(metrics.messagesFailed).toBe(0);
      expect(metrics.deliverySuccessRate).toBe(0);
    });

    test('should calculate delivery success rate correctly', async () => {
      // Send a message
      const message: ReliableMessage = {
        id: 'success-rate-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Simulate successful delivery
      const ackMessage: AckMessage = {
        type: 'ack',
        messageId: 'success-rate-test',
        fromNodeId: 'remote-node',
        timestamp: Date.now(),
        signature: 'ack-signature',
      };

      await deliveryManager.handleAcknowledgment(ackMessage);

      const metrics = deliveryManager.getDeliveryMetrics();
      expect(metrics.deliverySuccessRate).toBe(1.0); // 100% success rate
    });
  });

  describe('Manual Message Control', () => {
    test('should manually retry message', async () => {
      const message: ReliableMessage = {
        id: 'manual-retry-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Simulate some retry attempts
      const status = deliveryManager.getDeliveryStatus('manual-retry-test');
      if (status) {
        status.retryCount = 2;
      }

      const success = await deliveryManager.retryMessage('manual-retry-test');
      expect(success).toBe(true);

      // Retry count should be reset
      const updatedStatus =
        deliveryManager.getDeliveryStatus('manual-retry-test');
      expect(updatedStatus?.retryCount).toBe(0);
      expect(updatedStatus?.status).toBe('pending');
    });

    test('should return false for manual retry of unknown message', async () => {
      const success = await deliveryManager.retryMessage('unknown-message');
      expect(success).toBe(false);
    });

    test('should manually cancel message', async () => {
      const message: ReliableMessage = {
        id: 'manual-cancel-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      let failedEvent: any = null;
      deliveryManager.on('failed', event => {
        failedEvent = event;
      });

      const success = await deliveryManager.cancelMessage('manual-cancel-test');
      expect(success).toBe(true);

      expect(failedEvent).toBeDefined();
      expect(failedEvent.reason).toBe('Cancelled by user');

      const status = deliveryManager.getDeliveryStatus('manual-cancel-test');
      expect(status?.status).toBe('failed');
      expect(status?.lastError).toBe('Cancelled by user');

      const metrics = deliveryManager.getDeliveryMetrics();
      expect(metrics.currentPendingCount).toBe(0);
    });

    test('should return false for cancel of unknown message', async () => {
      const success = await deliveryManager.cancelMessage('unknown-message');
      expect(success).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    test('should update retry policy for message type', () => {
      const newPolicy = {
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2.0,
        jitterMaxMs: 1000,
        maxAttempts: 5,
      };

      deliveryManager.setRetryPolicy('block', newPolicy);

      expect(mockLogger.info).toHaveBeenCalledWith('Retry policy updated', {
        messageType: 'block',
        policy: newPolicy,
      });
    });

    test('should update configuration', () => {
      const configUpdate = {
        maxPendingMessages: 200,
        ackTimeoutMs: 10000,
      };

      deliveryManager.updateConfig(configUpdate);

      expect(mockLogger.info).toHaveBeenCalledWith('Configuration updated', {
        config: configUpdate,
      });
    });
  });

  describe('Event Handling', () => {
    test('should emit delivered event on successful acknowledgment', async () => {
      let deliveredEvent: any = null;
      deliveryManager.on('delivered', event => {
        deliveredEvent = event;
      });

      const message: ReliableMessage = {
        id: 'event-test-001',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      const ackMessage: AckMessage = {
        type: 'ack',
        messageId: 'event-test-001',
        fromNodeId: 'remote-node',
        timestamp: Date.now(),
        signature: 'ack-signature',
      };

      await deliveryManager.handleAcknowledgment(ackMessage);

      expect(deliveredEvent).toBeDefined();
      expect(deliveredEvent.messageId).toBe('event-test-001');
      expect(deliveredEvent.deliveryTime).toBeGreaterThan(0);
    });

    test('should emit failed event when message moved to dead letter queue', async () => {
      let failedEvent: any = null;
      deliveryManager.on('failed', event => {
        failedEvent = event;
      });

      const message: ReliableMessage = {
        id: 'failed-event-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 0, // No retries for immediate failure
        timeoutMs: 5000,
        priority: 1,
      };

      // Mock transmission failure
      mockMeshProtocol.broadcastMessage.mockResolvedValue(false);

      await deliveryManager.sendReliableMessage(message);

      // Process retries to trigger failure
      await (deliveryManager as any).processRetryQueue();

      expect(failedEvent).toBeDefined();
      expect(failedEvent.messageId).toBe('failed-event-test');
    });

    test('should emit retry event on retry attempt', async () => {
      let retryEvent: any = null;
      deliveryManager.on('retry', event => {
        retryEvent = event;
      });

      // Mock initial failure followed by success
      mockMeshProtocol.broadcastMessage
        .mockResolvedValueOnce(false) // First attempt fails
        .mockResolvedValueOnce(true); // Retry succeeds

      const message: ReliableMessage = {
        id: 'retry-event-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      // Process retry queue
      await (deliveryManager as any).processRetryQueue();

      expect(retryEvent).toBeDefined();
      expect(retryEvent.messageId).toBe('retry-event-test');
      expect(retryEvent.attemptCount).toBeGreaterThan(0);
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('should shutdown cleanly with pending messages', async () => {
      const message: ReliableMessage = {
        id: 'shutdown-test',
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        from: TEST_NODE_ID,
        signature: 'test-signature',
        reliability: 'confirmed',
        maxRetries: 3,
        timeoutMs: 5000,
        priority: 1,
      };

      await deliveryManager.sendReliableMessage(message);

      const preShutdownMetrics = deliveryManager.getDeliveryMetrics();
      expect(preShutdownMetrics.currentPendingCount).toBe(1);

      await deliveryManager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'UTXOReliableDeliveryManager shutdown completed',
        { nodeId: TEST_NODE_ID }
      );

      // Should clear all data structures
      const postShutdownMetrics = deliveryManager.getDeliveryMetrics();
      expect(postShutdownMetrics.currentPendingCount).toBe(0);
    });

    test('should clear all timers on shutdown', async () => {
      const originalClearInterval = global.clearInterval;
      const clearIntervalSpy = vi.fn();
      global.clearInterval = clearIntervalSpy;

      await deliveryManager.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();

      global.clearInterval = originalClearInterval;
    });

    test('should remove all event listeners on shutdown', async () => {
      let callbackCalled = false;

      deliveryManager.on('delivered', () => {
        callbackCalled = true;
      });

      await deliveryManager.shutdown();

      // Try to emit event after shutdown
      deliveryManager.emit('delivered', {});

      expect(callbackCalled).toBe(false);
    });
  });
});
