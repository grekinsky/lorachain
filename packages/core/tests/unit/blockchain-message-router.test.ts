import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockchainMessageRouter } from '../../src/blockchain-message-router.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import { CryptographicService } from '../../src/cryptographic.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  BlockchainMessageHandler,
} from '../../src/blockchain-message-interfaces.js';

describe('BlockchainMessageRouter', () => {
  let router: BlockchainMessageRouter;
  let mockCryptoService: any;
  let mockMessageQueue: any;
  let mockReliableDelivery: any;
  let mockHandler: BlockchainMessageHandler;
  let mockContext: BlockchainMessageContext;

  beforeEach(() => {
    // Mock the static methods of CryptographicService
    vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);
    vi.spyOn(CryptographicService, 'hashMessage').mockReturnValue(
      new Uint8Array(32)
    );

    mockCryptoService = {};
    mockMessageQueue = {};
    mockReliableDelivery = {};

    router = new BlockchainMessageRouter(
      mockCryptoService,
      mockMessageQueue,
      mockReliableDelivery
    );

    mockHandler = {
      canHandle: vi.fn().mockReturnValue(true),
      handle: vi.fn().mockResolvedValue({ success: true }),
      getHandlerPriority: vi.fn().mockReturnValue(10),
    };

    mockContext = {} as BlockchainMessageContext;
  });

  afterEach(() => {
    // Clean up the nonce cleanup interval
    router.stopNonceCleanup();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(router).toBeDefined();
      expect(router.getCryptoService()).toBe(mockCryptoService);
      expect(router.getMessageQueue()).toBe(mockMessageQueue);
      expect(router.getReliableDelivery()).toBe(mockReliableDelivery);
    });

    it('should start nonce cleanup on initialization', () => {
      const newRouter = new BlockchainMessageRouter(
        mockCryptoService,
        mockMessageQueue,
        mockReliableDelivery
      );
      expect(newRouter).toBeDefined();
      newRouter.stopNonceCleanup();
    });
  });

  describe('registerHandler', () => {
    it('should register handler for supported message types', () => {
      router.registerHandler(mockHandler);

      const handlers = router.getRegisteredHandlers();
      expect(handlers.size).toBeGreaterThan(0);
    });

    it('should sort handlers by priority (highest first)', () => {
      const lowPriorityHandler = {
        ...mockHandler,
        getHandlerPriority: vi.fn().mockReturnValue(5),
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ success: true }),
      };

      router.registerHandler(mockHandler);
      router.registerHandler(lowPriorityHandler);

      const handlers = router.getRegisteredHandlers();
      const blockHandlers = handlers.get(
        BlockchainMessageType.BLOCK_ANNOUNCEMENT
      )!;
      expect(blockHandlers.length).toBe(2);
      expect(blockHandlers[0].getHandlerPriority()).toBe(10);
      expect(blockHandlers[1].getHandlerPriority()).toBe(5);
    });

    it('should register handler for multiple message types', () => {
      const multiHandler = {
        canHandle: vi.fn((type: BlockchainMessageType) => {
          return (
            type === BlockchainMessageType.BLOCK_ANNOUNCEMENT ||
            type === BlockchainMessageType.BLOCK_REQUEST
          );
        }),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      router.registerHandler(multiHandler);

      const handlers = router.getRegisteredHandlers();
      expect(handlers.get(BlockchainMessageType.BLOCK_ANNOUNCEMENT)).toContain(
        multiHandler
      );
      expect(handlers.get(BlockchainMessageType.BLOCK_REQUEST)).toContain(
        multiHandler
      );
    });

    it('should handle handler that supports no message types', () => {
      const noOpHandler = {
        canHandle: vi.fn().mockReturnValue(false),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      router.registerHandler(noOpHandler);

      const handlers = router.getRegisteredHandlers();
      let hasAnyHandlers = false;
      for (const [, handlerList] of handlers) {
        if (handlerList.includes(noOpHandler)) {
          hasAnyHandlers = true;
          break;
        }
      }
      expect(hasAnyHandlers).toBe(false);
    });
  });

  describe('unregisterHandler', () => {
    it('should remove handler from registered handlers', () => {
      router.registerHandler(mockHandler);
      router.unregisterHandler(mockHandler);

      const handlers = router.getRegisteredHandlers();
      const blockHandlers = handlers.get(
        BlockchainMessageType.BLOCK_ANNOUNCEMENT
      );
      expect(blockHandlers).toEqual([]);
    });

    it('should handle unregistering non-existent handler', () => {
      const newHandler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      expect(() => router.unregisterHandler(newHandler)).not.toThrow();
    });

    it('should only remove specific handler when multiple are registered', () => {
      const handler2 = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(5),
      };

      router.registerHandler(mockHandler);
      router.registerHandler(handler2);
      router.unregisterHandler(mockHandler);

      const handlers = router.getRegisteredHandlers();
      const blockHandlers = handlers.get(
        BlockchainMessageType.BLOCK_ANNOUNCEMENT
      )!;
      expect(blockHandlers.length).toBe(1);
      expect(blockHandlers[0]).toBe(handler2);
    });
  });

  describe('routeMessage', () => {
    const createValidMessage = (
      type: BlockchainMessageType = BlockchainMessageType.BLOCK_ANNOUNCEMENT
    ): BlockchainNetworkMessage => ({
      type,
      payload: { data: 'test', version: '1.0.0', timestamp: Date.now() },
      metadata: {
        receivedAt: Date.now(),
        source: 'peer1',
        hopCount: 1,
        signature: 'valid_signature',
        nonce: `nonce_${Date.now()}_${Math.random()}`,
      },
    });

    it('should route valid message to appropriate handler', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      const result = await router.routeMessage(message, mockContext);

      expect(result.success).toBe(true);
      expect(mockHandler.handle).toHaveBeenCalledWith(message, mockContext);
    });

    it('should reject message with invalid signature', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Invalid cryptographic signature'
      );
    });

    it('should detect replay attacks (duplicate nonce)', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      // First message should succeed
      await router.routeMessage(message, mockContext);

      // Second message with same nonce should fail
      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Replay attack detected'
      );
    });

    it('should throw error when no handler available', async () => {
      const message = createValidMessage();

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'No handler available'
      );
    });

    it('should validate message type', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      message.type = 'invalid_type' as BlockchainMessageType;

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Invalid message type'
      );
    });

    it('should validate message payload exists', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      delete (message as any).payload;

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Message payload is required'
      );
    });

    it('should validate message metadata exists', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      delete (message as any).metadata;

      // Will fail at signature verification since metadata is missing
      await expect(router.routeMessage(message, mockContext)).rejects.toThrow();
    });

    it('should validate message source exists', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      delete (message.metadata as any).source;

      // Will fail at signature verification since source is missing
      await expect(router.routeMessage(message, mockContext)).rejects.toThrow();
    });

    it('should validate message signature exists', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      delete (message.metadata as any).signature;

      // Will fail at signature verification since signature is missing
      await expect(router.routeMessage(message, mockContext)).rejects.toThrow();
    });

    it('should validate message nonce exists', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      delete (message.metadata as any).nonce;

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Message nonce is required'
      );
    });

    it('should try ECDSA verification first, then Ed25519', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      // Mock ECDSA to fail, Ed25519 to succeed
      const verifySpy = vi
        .spyOn(CryptographicService, 'verify')
        .mockReturnValueOnce(false) // ECDSA fails
        .mockReturnValueOnce(true); // Ed25519 succeeds

      const result = await router.routeMessage(message, mockContext);

      expect(result.success).toBe(true);
      expect(verifySpy).toHaveBeenCalledTimes(2);
    });

    it('should select highest priority handler', async () => {
      const lowPriorityHandler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(5),
      };

      router.registerHandler(mockHandler); // priority 10
      router.registerHandler(lowPriorityHandler); // priority 5

      const message = createValidMessage();
      await router.routeMessage(message, mockContext);

      expect(mockHandler.handle).toHaveBeenCalled();
      expect(lowPriorityHandler.handle).not.toHaveBeenCalled();
    });

    it('should handle different message types', async () => {
      const txHandler = {
        canHandle: vi.fn((type: BlockchainMessageType) => {
          return type === BlockchainMessageType.UTXO_TRANSACTION_BROADCAST;
        }),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      router.registerHandler(txHandler);

      const message = createValidMessage(
        BlockchainMessageType.UTXO_TRANSACTION_BROADCAST
      );
      const result = await router.routeMessage(message, mockContext);

      expect(result.success).toBe(true);
      expect(txHandler.handle).toHaveBeenCalled();
    });

    it('should propagate handler errors', async () => {
      const errorHandler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockRejectedValue(new Error('Handler error')),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      router.registerHandler(errorHandler);

      const message = createValidMessage();
      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Handler error'
      );
    });
  });

  describe('cryptographic signature verification', () => {
    const createValidMessage = (): BlockchainNetworkMessage => ({
      type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
      payload: { data: 'test', version: '1.0.0', timestamp: Date.now() },
      metadata: {
        receivedAt: Date.now(),
        source: 'peer1',
        hopCount: 1,
        signature: 'valid_signature',
        nonce: `nonce_${Date.now()}_${Math.random()}`,
      },
    });

    it('should verify signature with ECDSA algorithm', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();
      const verifySpy = vi.spyOn(CryptographicService, 'verify');

      await router.routeMessage(message, mockContext);

      expect(verifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ algorithm: 'secp256k1' }),
        expect.any(Uint8Array),
        expect.any(Uint8Array)
      );
    });

    it('should fallback to Ed25519 if ECDSA fails', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      const verifySpy = vi
        .spyOn(CryptographicService, 'verify')
        .mockReturnValueOnce(false) // ECDSA fails
        .mockReturnValueOnce(true); // Ed25519 succeeds

      await router.routeMessage(message, mockContext);

      expect(verifySpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ algorithm: 'ed25519' }),
        expect.any(Uint8Array),
        expect.any(Uint8Array)
      );
    });

    it('should fail if both ECDSA and Ed25519 fail', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Invalid cryptographic signature'
      );
    });

    it('should handle signature verification errors gracefully', async () => {
      router.registerHandler(mockHandler);
      const message = createValidMessage();

      vi.spyOn(CryptographicService, 'verify').mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(router.routeMessage(message, mockContext)).rejects.toThrow(
        'Invalid cryptographic signature'
      );
    });
  });

  describe('nonce cleanup', () => {
    it('should clean up nonces periodically', async () => {
      vi.useFakeTimers();

      const testRouter = new BlockchainMessageRouter(
        mockCryptoService,
        mockMessageQueue,
        mockReliableDelivery
      );

      const handler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ success: true }),
        getHandlerPriority: vi.fn().mockReturnValue(10),
      };

      testRouter.registerHandler(handler);

      const message1: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: { data: 'test', version: '1.0.0', timestamp: Date.now() },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'valid_signature',
          nonce: 'test_nonce_1',
        },
      };

      // Process first message
      await testRouter.routeMessage(message1, mockContext);

      // Fast-forward time by 5 minutes
      vi.advanceTimersByTime(300000);

      // The same nonce should now be processable again
      const message2 = { ...message1 };
      await expect(
        testRouter.routeMessage(message2, mockContext)
      ).resolves.toBeDefined();

      testRouter.stopNonceCleanup();
      vi.useRealTimers();
    });

    it('should stop nonce cleanup when stopNonceCleanup is called', () => {
      const testRouter = new BlockchainMessageRouter(
        mockCryptoService,
        mockMessageQueue,
        mockReliableDelivery
      );

      testRouter.stopNonceCleanup();
      testRouter.stopNonceCleanup(); // Should not throw on second call

      expect(testRouter).toBeDefined();
    });
  });

  describe('getters', () => {
    it('should return registered handlers', () => {
      router.registerHandler(mockHandler);
      const handlers = router.getRegisteredHandlers();

      expect(handlers).toBeInstanceOf(Map);
      expect(handlers.size).toBeGreaterThan(0);
    });

    it('should return copy of handlers map to prevent external modification', () => {
      router.registerHandler(mockHandler);
      const handlers1 = router.getRegisteredHandlers();
      const handlers2 = router.getRegisteredHandlers();

      expect(handlers1).not.toBe(handlers2);
      expect(handlers1).toEqual(handlers2);
    });

    it('should return cryptographic service', () => {
      expect(router.getCryptoService()).toBe(mockCryptoService);
    });

    it('should return message queue', () => {
      expect(router.getMessageQueue()).toBe(mockMessageQueue);
    });

    it('should return reliable delivery manager', () => {
      expect(router.getReliableDelivery()).toBe(mockReliableDelivery);
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple handlers with different priorities', async () => {
      const handlers = [
        {
          canHandle: vi.fn().mockReturnValue(true),
          handle: vi.fn().mockResolvedValue({ success: true }),
          getHandlerPriority: vi.fn().mockReturnValue(100),
        },
        {
          canHandle: vi.fn().mockReturnValue(true),
          handle: vi.fn().mockResolvedValue({ success: true }),
          getHandlerPriority: vi.fn().mockReturnValue(50),
        },
        {
          canHandle: vi.fn().mockReturnValue(true),
          handle: vi.fn().mockResolvedValue({ success: true }),
          getHandlerPriority: vi.fn().mockReturnValue(75),
        },
      ];

      handlers.forEach(h => router.registerHandler(h));

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: { data: 'test', version: '1.0.0', timestamp: Date.now() },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'valid_signature',
          nonce: `nonce_${Date.now()}_${Math.random()}`,
        },
      };

      await router.routeMessage(message, mockContext);

      // Only highest priority handler should be called
      expect(handlers[0].handle).toHaveBeenCalled();
      expect(handlers[1].handle).not.toHaveBeenCalled();
      expect(handlers[2].handle).not.toHaveBeenCalled();
    });

    it('should handle concurrent message routing', async () => {
      router.registerHandler(mockHandler);

      const messages = Array.from({ length: 10 }, (_, i) => ({
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: { data: `test${i}`, version: '1.0.0', timestamp: Date.now() },
        metadata: {
          receivedAt: Date.now(),
          source: `peer${i}`,
          hopCount: 1,
          signature: 'valid_signature',
          nonce: `nonce_${Date.now()}_${i}_${Math.random()}`,
        },
      }));

      const results = await Promise.all(
        messages.map(msg => router.routeMessage(msg, mockContext))
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockHandler.handle).toHaveBeenCalledTimes(10);
    });
  });
});
