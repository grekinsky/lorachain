/**
 * Unit tests for blockchain message handling system
 *
 * Tests cover:
 * - BlockchainMessageType enum values
 * - Message interfaces and structure
 * - BaseBlockchainMessageHandler functionality
 * - Message validation
 * - Response creation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BlockchainMessageType,
  BaseBlockchainMessageHandler,
  type BlockchainNetworkMessage,
  type BlockchainMessageContext,
  type MessageResponse,
  type UTXOMessagePayload,
  type Blockchain,
  type UTXOManager,
  type PeerManager,
  type UTXOEnhancedMeshProtocol,
  type UTXOSyncManager,
} from '../../src/index.js';
import { CryptographicService } from '../../src/cryptographic.js';

// Mock handler implementation for testing
class TestBlockchainMessageHandler extends BaseBlockchainMessageHandler {
  canHandle(messageType: BlockchainMessageType): boolean {
    return messageType === BlockchainMessageType.BLOCK_ANNOUNCEMENT;
  }

  async handle(
    message: BlockchainNetworkMessage,
    _context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    const validation = this.validateBasicMessage(message);
    if (!validation.isValid) {
      return this.createResponse(
        false,
        undefined,
        validation.errors.join(', ')
      );
    }
    return this.createResponse(true);
  }
}

describe('BlockchainMessageType', () => {
  it('should have all required message types', () => {
    expect(BlockchainMessageType.BLOCK_ANNOUNCEMENT).toBe('block_announcement');
    expect(BlockchainMessageType.BLOCK_REQUEST).toBe('block_request');
    expect(BlockchainMessageType.BLOCK_RESPONSE).toBe('block_response');
    expect(BlockchainMessageType.UTXO_TRANSACTION_BROADCAST).toBe(
      'utxo_transaction_broadcast'
    );
    expect(BlockchainMessageType.UTXO_TRANSACTION_REQUEST).toBe(
      'utxo_transaction_request'
    );
    expect(BlockchainMessageType.PEER_HANDSHAKE_INIT).toBe(
      'peer_handshake_init'
    );
    expect(BlockchainMessageType.PEER_HANDSHAKE_RESPONSE).toBe(
      'peer_handshake_response'
    );
    expect(BlockchainMessageType.PEER_HANDSHAKE_ACK).toBe('peer_handshake_ack');
    expect(BlockchainMessageType.VERSION_NEGOTIATION).toBe(
      'version_negotiation'
    );
    expect(BlockchainMessageType.HEARTBEAT).toBe('heartbeat');
    expect(BlockchainMessageType.ERROR_RESPONSE).toBe('error_response');
  });

  it('should have correct number of message types', () => {
    const messageTypes = Object.values(BlockchainMessageType);
    expect(messageTypes).toHaveLength(11);
  });
});

describe('BaseBlockchainMessageHandler', () => {
  let handler: TestBlockchainMessageHandler;
  let cryptoService: CryptographicService;
  let context: BlockchainMessageContext;

  beforeEach(() => {
    cryptoService = new CryptographicService();
    handler = new TestBlockchainMessageHandler(80, cryptoService);

    // Create minimal mock context for testing
    // We don't actually call these objects in the basic tests,
    // so we can use simple mocks
    context = {
      blockchain: {} as Blockchain,
      utxoManager: {} as UTXOManager,
      peers: {} as PeerManager,
      protocol: {} as UTXOEnhancedMeshProtocol,
      syncManager: {} as UTXOSyncManager,
    };
  });

  describe('constructor', () => {
    it('should initialize with correct priority', () => {
      expect(handler.getHandlerPriority()).toBe(80);
    });

    it('should initialize with default priority of 0', () => {
      const defaultHandler = new TestBlockchainMessageHandler(0, cryptoService);
      expect(defaultHandler.getHandlerPriority()).toBe(0);
    });
  });

  describe('canHandle', () => {
    it('should return true for supported message types', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_ANNOUNCEMENT)).toBe(
        true
      );
    });

    it('should return false for unsupported message types', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_REQUEST)).toBe(
        false
      );
      expect(
        handler.canHandle(BlockchainMessageType.UTXO_TRANSACTION_BROADCAST)
      ).toBe(false);
    });
  });

  describe('validateBasicMessage', () => {
    let validMessage: BlockchainNetworkMessage;

    beforeEach(() => {
      const payload: UTXOMessagePayload = {
        data: { test: 'data' },
        version: '1.0.0',
        timestamp: Date.now(),
      };

      validMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload,
        metadata: {
          receivedAt: Date.now(),
          source: 'test-node',
          hopCount: 0,
          signature: 'test-signature',
          nonce: 'test-nonce',
        },
      };
    });

    it('should validate a correct message', () => {
      const result = (handler as any).validateBasicMessage(validMessage);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject message without type', () => {
      const invalidMessage = { ...validMessage, type: undefined } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message type is required');
    });

    it('should reject message without payload', () => {
      const invalidMessage = { ...validMessage, payload: undefined } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message payload is required');
    });

    it('should reject message without metadata', () => {
      const invalidMessage = { ...validMessage, metadata: undefined } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message metadata is required');
    });

    it('should reject message without signature', () => {
      const invalidMessage = {
        ...validMessage,
        metadata: { ...validMessage.metadata, signature: undefined },
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message signature is required');
    });

    it('should reject message without nonce', () => {
      const invalidMessage = {
        ...validMessage,
        metadata: { ...validMessage.metadata, nonce: undefined },
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message nonce is required');
    });

    it('should reject message without source', () => {
      const invalidMessage = {
        ...validMessage,
        metadata: { ...validMessage.metadata, source: undefined },
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message source is required');
    });

    it('should reject message without payload version', () => {
      const invalidMessage = {
        ...validMessage,
        payload: { ...validMessage.payload, version: undefined },
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Payload version is required');
    });

    it('should reject message with invalid timestamp type', () => {
      const invalidMessage = {
        ...validMessage,
        payload: { ...validMessage.payload, timestamp: 'invalid' },
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Payload timestamp must be a number');
    });

    it('should accept message with missing payload.data field', () => {
      // Note: payload.data is application-specific and not validated by base handler
      // Subclasses can add validation for payload.data if needed
      const messageWithoutData = {
        ...validMessage,
        payload: {
          version: '1.0.0',
          timestamp: Date.now(),
        },
      };
      const result = (handler as any).validateBasicMessage(messageWithoutData);
      // Should pass basic validation - data field is optional at this level
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple validation errors', () => {
      const invalidMessage = {
        type: undefined,
        payload: undefined,
        metadata: undefined,
      } as any;
      const result = (handler as any).validateBasicMessage(invalidMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('createResponse', () => {
    it('should create a success response without extras', () => {
      const response = (handler as any).createResponse(true);
      expect(response.success).toBe(true);
      expect(response.responseMessage).toBeUndefined();
      expect(response.error).toBeUndefined();
      expect(response.forwardToPeers).toBeUndefined();
    });

    it('should create a success response with response message', () => {
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_RESPONSE,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'test',
          hopCount: 0,
          signature: 'sig',
          nonce: 'nonce',
        },
      };
      const response = (handler as any).createResponse(true, responseMessage);
      expect(response.success).toBe(true);
      expect(response.responseMessage).toEqual(responseMessage);
    });

    it('should create a failure response with error message', () => {
      const errorMsg = 'Validation failed';
      const response = (handler as any).createResponse(
        false,
        undefined,
        errorMsg
      );
      expect(response.success).toBe(false);
      expect(response.error).toBe(errorMsg);
    });

    it('should create a response with forwardToPeers flag', () => {
      const response = (handler as any).createResponse(
        true,
        undefined,
        undefined,
        true
      );
      expect(response.success).toBe(true);
      expect(response.forwardToPeers).toBe(true);
    });
  });

  describe('handle', () => {
    it('should successfully handle a valid message', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'test',
          hopCount: 0,
          signature: 'sig',
          nonce: 'nonce',
        },
      };

      const response = await handler.handle(message, context);
      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it('should reject an invalid message', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'test',
          hopCount: 0,
          signature: '', // Invalid - empty signature
          nonce: 'nonce',
        },
      };

      const response = await handler.handle(message, context);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });
});
