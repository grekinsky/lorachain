/**
 * Unit tests for ProtocolVersionHandler
 *
 * Tests version negotiation, feature validation, and peer rejection logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProtocolVersionHandler } from '../../src/protocol-version-handler.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
} from '../../src/blockchain-message-interfaces.js';
import type { ProtocolFeatureFlags } from '../../src/blockchain-message-payloads.js';

describe('ProtocolVersionHandler', () => {
  let handler: ProtocolVersionHandler;
  let mockCryptoService: any;
  let mockContext: BlockchainMessageContext;
  let localFeatures: ProtocolFeatureFlags;

  beforeEach(() => {
    mockCryptoService = {};

    localFeatures = {
      supportsUTXOOnly: true,
      supportsCompression: true,
      supportsFragmentation: true,
      supportsCryptographicSigning: true,
      supportsMeshRouting: true,
      supportsHybridNetworking: true,
    };

    handler = new ProtocolVersionHandler(mockCryptoService, localFeatures);

    mockContext = {
      peers: {
        getLocalNodeId: vi.fn().mockReturnValue('local_node'),
        updatePeerVersion: vi.fn().mockResolvedValue(undefined),
        rejectPeer: vi.fn().mockResolvedValue(undefined),
      },
    } as any;
  });

  describe('constructor', () => {
    it('should throw error if supportsUTXOOnly is false', () => {
      const invalidFeatures: ProtocolFeatureFlags = {
        ...localFeatures,
        supportsUTXOOnly: false,
      };

      expect(() => {
        new ProtocolVersionHandler(mockCryptoService, invalidFeatures);
      }).toThrow('Local node must support UTXO-only transactions');
    });

    it('should throw error if supportsCryptographicSigning is false', () => {
      const invalidFeatures: ProtocolFeatureFlags = {
        ...localFeatures,
        supportsCryptographicSigning: false,
      };

      expect(() => {
        new ProtocolVersionHandler(mockCryptoService, invalidFeatures);
      }).toThrow('Local node must support cryptographic signing');
    });

    it('should initialize successfully with valid features', () => {
      expect(handler).toBeDefined();
      expect(handler.getCurrentVersion()).toBe('1.0.0');
      expect(handler.getSupportedVersions()).toEqual(['1.0.0']);
      expect(handler.getLocalFeatureFlags()).toEqual(localFeatures);
    });
  });

  describe('canHandle', () => {
    it('should handle VERSION_NEGOTIATION messages', () => {
      expect(handler.canHandle(BlockchainMessageType.VERSION_NEGOTIATION)).toBe(
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

  describe('handleVersionNegotiation', () => {
    it('should accept compatible version and features', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['1.0.0'],
            currentVersion: '1.0.0',
            minRequiredVersion: '1.0.0',
            featureFlags: {
              supportsUTXOOnly: true,
              supportsCompression: true,
              supportsFragmentation: false,
              supportsCryptographicSigning: true,
              supportsMeshRouting: false,
              supportsHybridNetworking: false,
            },
            timestamp: Date.now(),
          },
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
      expect(mockContext.peers.updatePeerVersion).toHaveBeenCalledWith(
        'peer1',
        expect.objectContaining({
          version: '1.0.0',
        })
      );
    });

    it('should reject peer without UTXO-only support', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['1.0.0'],
            currentVersion: '1.0.0',
            minRequiredVersion: '1.0.0',
            featureFlags: {
              supportsUTXOOnly: false, // Missing required feature
              supportsCompression: true,
              supportsFragmentation: true,
              supportsCryptographicSigning: true,
              supportsMeshRouting: true,
              supportsHybridNetworking: true,
            },
            timestamp: Date.now(),
          },
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
      expect(result.error).toContain('Incompatible features');
      expect(mockContext.peers.rejectPeer).toHaveBeenCalledWith(
        'peer1',
        expect.stringContaining('UTXO-only')
      );
    });

    it('should reject peer without cryptographic signing support', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['1.0.0'],
            currentVersion: '1.0.0',
            minRequiredVersion: '1.0.0',
            featureFlags: {
              supportsUTXOOnly: true,
              supportsCompression: true,
              supportsFragmentation: true,
              supportsCryptographicSigning: false, // Missing required feature
              supportsMeshRouting: true,
              supportsHybridNetworking: true,
            },
            timestamp: Date.now(),
          },
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
      expect(result.error).toContain('Incompatible features');
      expect(mockContext.peers.rejectPeer).toHaveBeenCalledWith(
        'peer1',
        expect.stringContaining('cryptographic signing')
      );
    });

    it('should reject incompatible version', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['0.9.0'], // Incompatible version
            currentVersion: '0.9.0',
            minRequiredVersion: '0.9.0',
            featureFlags: {
              supportsUTXOOnly: true,
              supportsCompression: true,
              supportsFragmentation: true,
              supportsCryptographicSigning: true,
              supportsMeshRouting: true,
              supportsHybridNetworking: true,
            },
            timestamp: Date.now(),
          },
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
      expect(result.error).toContain('Version negotiation failed');
      expect(mockContext.peers.rejectPeer).toHaveBeenCalledWith(
        'peer1',
        expect.stringContaining('No compatible version found')
      );
    });

    it('should reject version below minimum requirement', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['1.0.0'],
            currentVersion: '0.8.0', // Below minimum
            minRequiredVersion: '0.8.0',
            featureFlags: {
              supportsUTXOOnly: true,
              supportsCompression: true,
              supportsFragmentation: true,
              supportsCryptographicSigning: true,
              supportsMeshRouting: true,
              supportsHybridNetworking: true,
            },
            timestamp: Date.now(),
          },
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
      expect(result.error).toContain('Version negotiation failed');
      expect(mockContext.peers.rejectPeer).toHaveBeenCalledWith(
        'peer1',
        expect.stringContaining('does not meet minimum requirement')
      );
    });

    it('should determine agreed features correctly', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: 'peer1',
            supportedVersions: ['1.0.0'],
            currentVersion: '1.0.0',
            minRequiredVersion: '1.0.0',
            featureFlags: {
              supportsUTXOOnly: true,
              supportsCompression: false, // Different from local
              supportsFragmentation: true,
              supportsCryptographicSigning: true,
              supportsMeshRouting: false, // Different from local
              supportsHybridNetworking: true,
            },
            timestamp: Date.now(),
          },
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
      expect(mockContext.peers.updatePeerVersion).toHaveBeenCalledWith(
        'peer1',
        expect.objectContaining({
          features: expect.objectContaining({
            supportsUTXOOnly: true, // Always required
            supportsCompression: false, // Intersection (local: true, peer: false)
            supportsFragmentation: true, // Intersection (local: true, peer: true)
            supportsCryptographicSigning: true, // Always required
            supportsMeshRouting: false, // Intersection (local: true, peer: false)
            supportsHybridNetworking: true, // Intersection (local: true, peer: true)
          }),
        })
      );
    });

    it('should return error if message validation fails', async () => {
      const invalidMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
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

  describe('getters', () => {
    it('should return current version', () => {
      expect(handler.getCurrentVersion()).toBe('1.0.0');
    });

    it('should return supported versions', () => {
      expect(handler.getSupportedVersions()).toEqual(['1.0.0']);
    });

    it('should return local feature flags', () => {
      expect(handler.getLocalFeatureFlags()).toEqual(localFeatures);
    });
  });

  describe('getHandlerPriority', () => {
    it('should return priority 30 by default', () => {
      expect(handler.getHandlerPriority()).toBe(30);
    });

    it('should use custom priority if provided', () => {
      const customHandler = new ProtocolVersionHandler(
        mockCryptoService,
        localFeatures,
        50
      );
      expect(customHandler.getHandlerPriority()).toBe(50);
    });
  });
});
