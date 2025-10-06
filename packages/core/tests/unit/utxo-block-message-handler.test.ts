/**
 * Unit Tests for UTXOBlockMessageHandler
 *
 * Tests the UTXO block message handler for:
 * - Block announcement handling
 * - Block request handling
 * - Block response handling
 * - Message validation
 * - Integration with blockchain and sync manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UTXOBlockMessageHandler } from '../../src/utxo-block-message-handler.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
} from '../../src/blockchain-message-interfaces.js';
import type {
  BlockAnnouncementPayload,
  BlockRequestPayload,
  BlockResponsePayload,
} from '../../src/blockchain-message-payloads.js';
import type { Block } from '../../src/types.js';

describe('UTXOBlockMessageHandler', () => {
  let handler: UTXOBlockMessageHandler;
  let mockCryptoService: any;
  let mockContext: BlockchainMessageContext;
  let mockBlock: Block;

  beforeEach(() => {
    mockCryptoService = {
      generateKeyPair: vi.fn(),
      sign: vi.fn(),
      verify: vi.fn(),
    };

    mockBlock = {
      index: 1,
      timestamp: Date.now(),
      transactions: [],
      previousHash: 'genesis',
      hash: 'block1',
      nonce: 12345,
      merkleRoot: 'merkleRoot',
      difficulty: 1,
      validator: 'validator1',
    };

    handler = new UTXOBlockMessageHandler(mockCryptoService);

    mockContext = {
      blockchain: {
        getBlocks: vi.fn().mockReturnValue([]),
        getLatestBlock: vi.fn().mockReturnValue({
          index: 0,
          hash: 'genesis',
          timestamp: Date.now(),
          transactions: [],
          previousHash: '',
          nonce: 0,
          merkleRoot: '',
          difficulty: 1,
        }),
        validateChain: vi.fn().mockResolvedValue(true),
        addBlock: vi.fn(),
      },
      utxoManager: {} as any,
      peers: {} as any,
      protocol: {} as any,
      syncManager: {
        startSync: vi.fn().mockResolvedValue(undefined),
      },
    } as any;
  });

  describe('canHandle', () => {
    it('should handle BLOCK_ANNOUNCEMENT messages', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_ANNOUNCEMENT)).toBe(
        true
      );
    });

    it('should handle BLOCK_REQUEST messages', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_REQUEST)).toBe(true);
    });

    it('should handle BLOCK_RESPONSE messages', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_RESPONSE)).toBe(
        true
      );
    });

    it('should not handle other message types', () => {
      expect(
        handler.canHandle(BlockchainMessageType.UTXO_TRANSACTION_BROADCAST)
      ).toBe(false);
    });

    it('should not handle PEER_HANDSHAKE_INIT messages', () => {
      expect(handler.canHandle(BlockchainMessageType.PEER_HANDSHAKE_INIT)).toBe(
        false
      );
    });

    it('should not handle VERSION_NEGOTIATION messages', () => {
      expect(handler.canHandle(BlockchainMessageType.VERSION_NEGOTIATION)).toBe(
        false
      );
    });
  });

  describe('getHandlerPriority', () => {
    it('should return priority 20 by default', () => {
      expect(handler.getHandlerPriority()).toBe(20);
    });

    it('should return custom priority when specified', () => {
      const customHandler = new UTXOBlockMessageHandler(mockCryptoService, 50);
      expect(customHandler.getHandlerPriority()).toBe(50);
    });
  });

  describe('handle - basic validation', () => {
    it('should reject message without type', async () => {
      const message = {
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      } as any;

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message type is required');
    });

    it('should reject message without payload', async () => {
      const message = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      } as any;

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message payload is required');
    });

    it('should reject message without signature', async () => {
      const message = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          nonce: 'nonce1',
        },
      } as any;

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message signature is required');
    });

    it('should reject message without nonce', async () => {
      const message = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
        },
      } as any;

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Message nonce is required');
    });
  });

  describe('handleBlockAnnouncement', () => {
    it('should request next block in sequence', async () => {
      const payload: BlockAnnouncementPayload = {
        blockHash: 'block1',
        blockHeight: 1,
        previousHash: 'genesis',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage).toBeDefined();
      expect(result.responseMessage?.type).toBe(
        BlockchainMessageType.BLOCK_REQUEST
      );

      const requestPayload = result.responseMessage?.payload
        .data as BlockRequestPayload;
      expect(requestPayload.blockHash).toBe('block1');
      expect(requestPayload.requestId).toBeDefined();
    });

    it('should trigger sync for ahead blocks', async () => {
      const payload: BlockAnnouncementPayload = {
        blockHash: 'block10',
        blockHeight: 10,
        previousHash: 'block9',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.syncManager.startSync).toHaveBeenCalled();
    });

    it('should skip already existing blocks', async () => {
      mockContext.blockchain.getBlocks = vi.fn().mockReturnValue([
        {
          hash: 'block1',
          index: 1,
        },
      ]);

      const payload: BlockAnnouncementPayload = {
        blockHash: 'block1',
        blockHeight: 1,
        previousHash: 'genesis',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage).toBeUndefined();
    });

    it('should handle block announcement for current height gracefully', async () => {
      const payload: BlockAnnouncementPayload = {
        blockHash: 'genesis',
        blockHeight: 0,
        previousHash: '',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('handleBlockRequest', () => {
    beforeEach(() => {
      mockContext.blockchain.getBlocks = vi.fn().mockReturnValue([mockBlock]);
    });

    it('should respond with block when requested by hash', async () => {
      const payload: BlockRequestPayload = {
        blockHash: 'block1',
        requestId: 'req123',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_REQUEST,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage).toBeDefined();
      expect(result.responseMessage?.type).toBe(
        BlockchainMessageType.BLOCK_RESPONSE
      );

      const responsePayload = result.responseMessage?.payload
        .data as BlockResponsePayload;
      expect(responsePayload.block.hash).toBe('block1');
      expect(responsePayload.requestId).toBe('req123');
    });

    it('should respond with block when requested by height', async () => {
      const payload: BlockRequestPayload = {
        blockHeight: 1,
        requestId: 'req456',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_REQUEST,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage).toBeDefined();

      const responsePayload = result.responseMessage?.payload
        .data as BlockResponsePayload;
      expect(responsePayload.block.index).toBe(1);
      expect(responsePayload.requestId).toBe('req456');
    });

    it('should return error when block not found', async () => {
      const payload: BlockRequestPayload = {
        blockHash: 'nonexistent',
        requestId: 'req789',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_REQUEST,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Requested block not found');
    });

    it('should prioritize hash over height when both provided', async () => {
      const payload: BlockRequestPayload = {
        blockHash: 'block1',
        blockHeight: 999,
        requestId: 'req999',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_REQUEST,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      const responsePayload = result.responseMessage?.payload
        .data as BlockResponsePayload;
      expect(responsePayload.block.hash).toBe('block1');
    });
  });

  describe('handleBlockResponse', () => {
    it('should validate and add block to blockchain', async () => {
      // Simulate the announcement that triggers the request
      const announcementPayload: BlockAnnouncementPayload = {
        blockHash: 'block1',
        blockHeight: 1,
        previousHash: 'genesis',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const announcementMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: announcementPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce_announcement',
        },
      };

      // Trigger announcement to create pending request
      await handler.handle(announcementMessage, mockContext);

      // Extract actual request ID from announcement response
      const announcementResult = await handler.handle(
        announcementMessage,
        mockContext
      );
      const actualRequestId = (
        announcementResult.responseMessage?.payload.data as BlockRequestPayload
      ).requestId;

      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_RESPONSE,
        payload: {
          data: {
            block: mockBlock,
            requestId: actualRequestId,
          } as BlockResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce_response',
        },
      };

      const result = await handler.handle(responseMessage, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.blockchain.validateChain).toHaveBeenCalled();
      expect(mockContext.blockchain.addBlock).toHaveBeenCalledWith(mockBlock);
    });

    it('should reject unsolicited block responses', async () => {
      const payload: BlockResponsePayload = {
        block: mockBlock,
        requestId: 'unsolicited123',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_RESPONSE,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsolicited response');
    });

    it('should reject invalid blocks', async () => {
      // First create a pending request
      const announcementPayload: BlockAnnouncementPayload = {
        blockHash: 'block1',
        blockHeight: 1,
        previousHash: 'genesis',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const announcementMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: announcementPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce_announcement',
        },
      };

      const announcementResult = await handler.handle(
        announcementMessage,
        mockContext
      );
      const requestId = (
        announcementResult.responseMessage?.payload.data as BlockRequestPayload
      ).requestId;

      // Mock validateChain to return false
      mockContext.blockchain.validateChain = vi.fn().mockResolvedValue(false);

      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_RESPONSE,
        payload: {
          data: {
            block: mockBlock,
            requestId,
          } as BlockResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce_response',
        },
      };

      const result = await handler.handle(responseMessage, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid block');
      expect(mockContext.blockchain.addBlock).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle blockchain errors gracefully in announcements', async () => {
      mockContext.blockchain.getBlocks = vi.fn().mockImplementation(() => {
        throw new Error('Blockchain error');
      });

      const payload: BlockAnnouncementPayload = {
        blockHash: 'block1',
        blockHeight: 1,
        previousHash: 'genesis',
        timestamp: Date.now(),
        minerAddress: 'miner1',
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: payload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blockchain error');
    });

    it('should handle unsupported message types', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported message type');
    });
  });
});
