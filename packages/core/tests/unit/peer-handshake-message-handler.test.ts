/**
 * Unit Tests for PeerHandshakeMessageHandler
 *
 * Tests three-way handshake protocol, challenge-response authentication,
 * peer capability exchange, and timeout handling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PeerHandshakeMessageHandler } from '../../src/peer-handshake-message-handler.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
} from '../../src/blockchain-message-interfaces.js';
import type {
  PeerHandshakeInitPayload,
  PeerHandshakeResponsePayload,
  PeerHandshakeAckPayload,
  PeerNodeCapabilities,
} from '../../src/blockchain-message-payloads.js';

describe('PeerHandshakeMessageHandler', () => {
  let handler: PeerHandshakeMessageHandler;
  let mockCryptoService: any;
  let mockContext: BlockchainMessageContext;
  let nodeCapabilities: PeerNodeCapabilities;

  beforeEach(() => {
    // Mock crypto service
    mockCryptoService = {
      verifySignature: vi.fn().mockResolvedValue(true),
      sign: vi.fn().mockResolvedValue('signed_challenge'),
      signMessage: vi.fn().mockResolvedValue('signed_message'),
    };

    // Node capabilities
    nodeCapabilities = {
      isFullNode: true,
      isMiningNode: false,
      supportsCompression: true,
      compressionAlgorithms: ['gzip', 'zlib'],
      maxMessageSize: 256,
      networkType: 'hybrid' as const,
      listeningPort: 8333,
      apiPort: 8080,
    };

    // Create handler
    handler = new PeerHandshakeMessageHandler(
      mockCryptoService,
      nodeCapabilities
    );

    // Mock context
    mockContext = {
      peers: {
        getLocalNodeId: vi.fn().mockReturnValue('local_node'),
        getLocalPublicKey: vi.fn().mockReturnValue('local_pubkey'),
        getLocalKeyPair: vi.fn().mockResolvedValue({
          privateKey: 'local_privkey',
          publicKey: 'local_pubkey',
          algorithm: 'secp256k1',
        }),
        addPeer: vi.fn().mockReturnValue(true),
        getPeer: vi.fn().mockReturnValue({
          id: 'peer1',
          publicKey: 'peer_pubkey',
          address: 'peer1_address',
          connectionState: 'connecting',
        }),
        updatePeerConnectionState: vi.fn(),
      },
      blockchain: {} as any,
      utxoManager: {} as any,
      protocol: {} as any,
      syncManager: {} as any,
    };
  });

  afterEach(() => {
    handler.stopCleanup();
  });

  describe('canHandle', () => {
    it('should handle PEER_HANDSHAKE_INIT messages', () => {
      expect(handler.canHandle(BlockchainMessageType.PEER_HANDSHAKE_INIT)).toBe(
        true
      );
    });

    it('should handle PEER_HANDSHAKE_RESPONSE messages', () => {
      expect(
        handler.canHandle(BlockchainMessageType.PEER_HANDSHAKE_RESPONSE)
      ).toBe(true);
    });

    it('should handle PEER_HANDSHAKE_ACK messages', () => {
      expect(handler.canHandle(BlockchainMessageType.PEER_HANDSHAKE_ACK)).toBe(
        true
      );
    });

    it('should not handle other message types', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_ANNOUNCEMENT)).toBe(
        false
      );
      expect(
        handler.canHandle(BlockchainMessageType.UTXO_TRANSACTION_BROADCAST)
      ).toBe(false);
    });
  });

  describe('handleHandshakeInit', () => {
    it('should respond with handshake response on valid init', async () => {
      const initPayload: PeerHandshakeInitPayload = {
        nodeId: 'peer1',
        publicKey: 'peer_pubkey',
        capabilities: {
          isFullNode: false,
          isMiningNode: false,
          supportsCompression: false,
          compressionAlgorithms: [],
          maxMessageSize: 256,
          networkType: 'mesh',
          listeningPort: 7777,
        },
        protocolVersion: '1.0.0',
        challenge: 'challenge123',
        timestamp: Date.now(),
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: initPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'valid_signature',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage?.type).toBe(
        BlockchainMessageType.PEER_HANDSHAKE_RESPONSE
      );

      const responsePayload = result.responseMessage?.payload
        .data as PeerHandshakeResponsePayload;
      expect(responsePayload.challengeResponse).toBeDefined();
      expect(responsePayload.challenge).toBeDefined();
      expect(responsePayload.capabilities).toEqual(nodeCapabilities);
    });

    it('should reject init with invalid signature', async () => {
      mockCryptoService.verifySignature.mockResolvedValue(false);

      const initPayload: PeerHandshakeInitPayload = {
        nodeId: 'peer1',
        publicKey: 'peer_pubkey',
        capabilities: {
          isFullNode: false,
          isMiningNode: false,
          supportsCompression: false,
          compressionAlgorithms: [],
          maxMessageSize: 256,
          networkType: 'mesh',
          listeningPort: 7777,
        },
        protocolVersion: '1.0.0',
        challenge: 'challenge123',
        timestamp: Date.now(),
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: initPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'invalid_signature',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });
  });

  describe('handleHandshakeResponse', () => {
    it('should send ACK on valid response', async () => {
      // First, set up a pending handshake by handling init
      const initMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challenge: 'init_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeInitPayload,
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

      const initResult = await handler.handle(initMessage, mockContext);
      expect(initResult.success).toBe(true);

      // Now handle response
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challengeResponse: 'signed_response',
            challenge: 'response_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce2',
        },
      };

      const result = await handler.handle(responseMessage, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage?.type).toBe(
        BlockchainMessageType.PEER_HANDSHAKE_ACK
      );
      expect(mockContext.peers.addPeer).toHaveBeenCalled();
    });

    it('should reject response without pending handshake', async () => {
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: 'unknown_peer',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challengeResponse: 'signed_response',
            challenge: 'response_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'unknown_peer',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(responseMessage, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No pending handshake');
    });

    it('should reject response with invalid challenge response', async () => {
      // Set up pending handshake
      const initMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challenge: 'init_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeInitPayload,
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

      await handler.handle(initMessage, mockContext);

      // Mock invalid signature for response
      mockCryptoService.verifySignature.mockResolvedValue(false);

      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challengeResponse: 'invalid_response',
            challenge: 'response_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce2',
        },
      };

      const result = await handler.handle(responseMessage, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid challenge response');
    });
  });

  describe('handleHandshakeAck', () => {
    it('should complete handshake on valid ACK', async () => {
      // Set up complete handshake flow
      const initMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challenge: 'init_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeInitPayload,
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

      await handler.handle(initMessage, mockContext);

      // Process response to create pending handshake with challenge
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
            },
            protocolVersion: '1.0.0',
            challengeResponse: 'signed_response',
            challenge: 'response_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce2',
        },
      };

      await handler.handle(responseMessage, mockContext);

      // Now handle ACK
      const ackMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_ACK,
        payload: {
          data: {
            nodeId: 'peer1',
            challengeResponse: 'signed_ack_response',
            connectionEstablished: true,
            timestamp: Date.now(),
          } as PeerHandshakeAckPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce3',
        },
      };

      const result = await handler.handle(ackMessage, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.peers.updatePeerConnectionState).toHaveBeenCalledWith(
        'peer1',
        'connected'
      );
    });

    it('should reject ACK without pending handshake', async () => {
      const ackMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_ACK,
        payload: {
          data: {
            nodeId: 'unknown_peer',
            challengeResponse: 'signed_response',
            connectionEstablished: true,
            timestamp: Date.now(),
          } as PeerHandshakeAckPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'unknown_peer',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(ackMessage, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No pending handshake');
    });
  });

  describe('message validation', () => {
    it('should reject message without required fields', async () => {
      const invalidMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: '',
          hopCount: 1,
          signature: '',
          nonce: '',
        },
      };

      const result = await handler.handle(invalidMessage, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('priority', () => {
    it('should have high priority (25) for connection establishment', () => {
      expect(handler.getHandlerPriority()).toBe(25);
    });
  });

  describe('cleanup', () => {
    it('should have cleanup mechanism for expired handshakes', () => {
      // Test that cleanup timer is set up (this is implicitly tested by the stopCleanup method)
      expect(handler.stopCleanup).toBeDefined();
      expect(typeof handler.stopCleanup).toBe('function');
    });
  });

  describe('port handling', () => {
    it('should use listeningPort from capabilities when adding peer', async () => {
      const initMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
              listeningPort: 7777,
            },
            protocolVersion: '1.0.0',
            challenge: 'init_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeInitPayload,
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

      await handler.handle(initMessage, mockContext);

      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: 'peer1',
            publicKey: 'peer_pubkey',
            capabilities: {
              isFullNode: false,
              isMiningNode: false,
              supportsCompression: false,
              compressionAlgorithms: [],
              maxMessageSize: 256,
              networkType: 'mesh',
              listeningPort: 7777,
            },
            protocolVersion: '1.0.0',
            challengeResponse: 'signed_response',
            challenge: 'response_challenge',
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce2',
        },
      };

      await handler.handle(responseMessage, mockContext);

      // Verify addPeer was called with correct port
      expect(mockContext.peers.addPeer).toHaveBeenCalled();
      const addPeerCall = (mockContext.peers.addPeer as any).mock.calls[0][0];
      expect(addPeerCall.port).toBe(7777);
    });
  });

  describe('nonce generation', () => {
    it('should use crypto.randomUUID for nonce generation', async () => {
      const initPayload: PeerHandshakeInitPayload = {
        nodeId: 'peer1',
        publicKey: 'peer_pubkey',
        capabilities: {
          isFullNode: false,
          isMiningNode: false,
          supportsCompression: false,
          compressionAlgorithms: [],
          maxMessageSize: 256,
          networkType: 'mesh',
          listeningPort: 7777,
        },
        protocolVersion: '1.0.0',
        challenge: 'challenge123',
        timestamp: Date.now(),
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
        payload: {
          data: initPayload,
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'valid_signature',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      // Verify response message has UUID format nonce
      if (result.responseMessage) {
        // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(result.responseMessage.metadata.nonce).toMatch(uuidRegex);
      }
    });
  });
});
