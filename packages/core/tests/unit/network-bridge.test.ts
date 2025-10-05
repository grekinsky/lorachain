import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkBridge } from '../../src/network-bridge';
import { CryptographicService } from '../../src/cryptographic';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager';
import type { CompressedData } from '../../src/compression-types';

describe('NetworkBridge', () => {
  let bridge: NetworkBridge;
  let mockCompressionManager: UTXOCompressionManager;
  let mockCryptoService: CryptographicService;

  beforeEach(() => {
    // Create mock compression manager
    mockCompressionManager = {
      compress: vi.fn(),
      decompress: vi.fn(),
    } as unknown as UTXOCompressionManager;

    // Create mock crypto service
    mockCryptoService = {} as CryptographicService;

    bridge = new NetworkBridge(mockCompressionManager, mockCryptoService);
  });

  describe('Protocol Transformation', () => {
    it('should transform mesh message to HTTP format', async () => {
      const meshMessage = {
        type: 'transaction',
        payload: { inputs: [], outputs: [] },
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const transformed = await bridge.transformProtocol(meshMessage, 'http');
      const trans = transformed as Record<string, unknown>;

      expect(trans.headers).toBeDefined();
      expect(
        (trans.headers as Record<string, unknown>)['X-Source-Network']
      ).toBe('mesh');
      expect((trans.headers as Record<string, unknown>)['X-Message-Type']).toBe(
        'transaction'
      );
      expect(trans.type).toBe('transaction');
      expect(trans.timestamp).toBe(meshMessage.timestamp);
    });

    it('should transform HTTP message to mesh format', async () => {
      const httpMessage = {
        type: 'block',
        payload: { transactions: [] },
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const transformed = await bridge.transformProtocol(httpMessage, 'mesh');
      const trans = transformed as Record<string, unknown>;

      expect(trans.type).toBe('block');
      expect(trans.signature).toBe('test-sig');
      expect(trans.timestamp).toBe(httpMessage.timestamp);
    });

    it('should compress large messages for mesh network', async () => {
      const largePayload = { data: 'x'.repeat(300) }; // >256 bytes
      const message = {
        type: 'sync',
        payload: largePayload,
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const compressedData = new Uint8Array([1, 2, 3]);
      vi.spyOn(mockCompressionManager, 'compress').mockReturnValue({
        data: compressedData,
        algorithm: 'gzip',
        originalSize: 300,
        compressedSize: 3,
        compressionRatio: 0.01,
        metadata: {},
      } as CompressedData);

      const transformed = await bridge.transformProtocol(message, 'mesh');
      const trans = transformed as Record<string, unknown>;

      expect(trans.compressed).toBe(true);
      expect(mockCompressionManager.compress).toHaveBeenCalled();
    });

    it('should not compress small messages for mesh network', async () => {
      const smallPayload = { data: 'small' }; // <256 bytes
      const message = {
        type: 'sync',
        payload: smallPayload,
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const transformed = await bridge.transformProtocol(message, 'mesh');
      const trans = transformed as Record<string, unknown>;

      expect(trans.compressed).toBeUndefined();
      expect(mockCompressionManager.compress).not.toHaveBeenCalled();
    });

    it('should emit protocol:transformed event', async () => {
      const transformedSpy = vi.fn();
      bridge.on('protocol:transformed', transformedSpy);

      const message = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      await bridge.transformProtocol(message, 'http');

      expect(transformedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          targetFormat: 'http',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should decompress mesh message when transforming to HTTP', async () => {
      const compressedPayload = new Uint8Array([1, 2, 3]);
      const meshMessage = {
        type: 'transaction',
        payload: compressedPayload,
        compressed: true,
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const decompressedData = new Uint8Array(
        new TextEncoder().encode(JSON.stringify({ inputs: [], outputs: [] }))
      );
      vi.spyOn(mockCompressionManager, 'decompress').mockReturnValue(
        decompressedData
      );

      const transformed = await bridge.transformProtocol(meshMessage, 'http');
      const trans = transformed as Record<string, unknown>;

      expect(mockCompressionManager.decompress).toHaveBeenCalledWith(
        expect.objectContaining({
          data: compressedPayload,
          algorithm: 'gzip',
        })
      );
      expect(trans.payload).toEqual({ inputs: [], outputs: [] });
    });
  });

  describe('Message Bridging', () => {
    it('should bridge mesh to internet successfully', async () => {
      const meshMessage = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        signature: 'test-sig',
        publicKey: 'test-key',
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const result = await bridge.bridgeMessage(meshMessage, 'internet');

      expect(result).toBe(true);
    });

    it('should bridge internet to mesh successfully', async () => {
      const internetMessage = {
        type: 'block',
        payload: {},
        timestamp: Date.now(),
        signature: 'test-sig',
        headers: { 'X-Source-Network': 'internet' },
      };

      const result = await bridge.bridgeMessage(internetMessage, 'mesh');

      expect(result).toBe(true);
    });

    it('should skip bridging for same network', async () => {
      const message = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        signature: 'test-sig',
        headers: { 'X-Source-Network': 'internet' },
      };

      const result = await bridge.bridgeMessage(message, 'internet');

      expect(result).toBe(true);
    });

    it('should emit message:bridged event on success', async () => {
      const bridgedSpy = vi.fn();
      bridge.on('message:bridged', bridgedSpy);

      const message = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        signature: 'test-sig',
        publicKey: 'test-key',
        compressed: true, // Mark as mesh message
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await bridge.bridgeMessage(message, 'internet');

      expect(bridgedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceNetwork: 'mesh',
          targetNetwork: 'internet',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should emit bridge:error event on failure', async () => {
      const errorSpy = vi.fn();
      bridge.on('bridge:error', errorSpy);

      const message = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
        compressed: true, // Mark as mesh to trigger transformation
      };

      // Mock transformation to throw error
      vi.spyOn(bridge as any, 'transformProtocol').mockRejectedValue(
        new Error('Transform failed')
      );

      const result = await bridge.bridgeMessage(message, 'internet');

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('Message Validation', () => {
    it('should validate message structure correctly', () => {
      const validMessage = {
        type: 'transaction',
        timestamp: Date.now(),
        payload: {},
      };

      const isValid = bridge.validateBridgedMessage(validMessage, 'mesh');

      expect(isValid).toBe(true);
    });

    it('should reject non-object message', () => {
      const invalidMessage = 'not an object';

      const isValid = bridge.validateBridgedMessage(invalidMessage, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should reject null message', () => {
      const isValid = bridge.validateBridgedMessage(null, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should reject message with missing type', () => {
      const invalidMessage = {
        timestamp: Date.now(),
        payload: {},
      };

      const isValid = bridge.validateBridgedMessage(invalidMessage, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should reject message with missing timestamp', () => {
      const invalidMessage = {
        type: 'transaction',
        payload: {},
      };

      const isValid = bridge.validateBridgedMessage(invalidMessage, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should verify cryptographic signatures when present', () => {
      const message = {
        type: 'transaction',
        timestamp: Date.now(),
        payload: {},
        signature: 'test-sig',
        publicKey: 'test-key',
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const isValid = bridge.validateBridgedMessage(message, 'mesh');

      expect(isValid).toBe(true);
      expect(CryptographicService.verify).toHaveBeenCalled();
    });

    it('should reject message with invalid signature', () => {
      const message = {
        type: 'transaction',
        timestamp: Date.now(),
        payload: {},
        signature: 'invalid-sig',
        publicKey: 'test-key',
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);

      const isValid = bridge.validateBridgedMessage(message, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should accept message without signature', () => {
      const message = {
        type: 'transaction',
        timestamp: Date.now(),
        payload: {},
      };

      const isValid = bridge.validateBridgedMessage(message, 'mesh');

      expect(isValid).toBe(true);
    });

    it('should handle signature verification errors gracefully', () => {
      const message = {
        type: 'transaction',
        timestamp: Date.now(),
        payload: {},
        signature: 'test-sig',
        publicKey: 'test-key',
      };

      vi.spyOn(CryptographicService, 'verify').mockImplementation(() => {
        throw new Error('Verification error');
      });

      const isValid = bridge.validateBridgedMessage(message, 'mesh');

      expect(isValid).toBe(false);
    });

    it('should emit bridge:validation-failed event on validation failure', async () => {
      const failedSpy = vi.fn();
      bridge.on('bridge:validation-failed', failedSpy);

      const invalidMessage = {
        timestamp: Date.now(),
        payload: {},
        compressed: true, // Mark as mesh to trigger transformation
      };

      await bridge.bridgeMessage(invalidMessage, 'internet');

      expect(failedSpy).toHaveBeenCalled();
    });
  });

  describe('Integrity Verification', () => {
    it('should verify message integrity correctly', () => {
      const original = {
        type: 'transaction',
        timestamp: 12345,
        payload: { data: 'test' },
      };

      const transformed = {
        type: 'transaction',
        timestamp: 12345,
        payload: { data: 'test' },
        headers: {},
      };

      const isValid = bridge.verifyMessageIntegrity(original, transformed);

      expect(isValid).toBe(true);
    });

    it('should detect type mismatch', () => {
      const original = {
        type: 'transaction',
        timestamp: 12345,
        payload: {},
      };

      const transformed = {
        type: 'block',
        timestamp: 12345,
        payload: {},
      };

      const isValid = bridge.verifyMessageIntegrity(original, transformed);

      expect(isValid).toBe(false);
    });

    it('should detect timestamp mismatch', () => {
      const original = {
        type: 'transaction',
        timestamp: 12345,
        payload: {},
      };

      const transformed = {
        type: 'transaction',
        timestamp: 67890,
        payload: {},
      };

      const isValid = bridge.verifyMessageIntegrity(original, transformed);

      expect(isValid).toBe(false);
    });

    it('should detect payload tampering', () => {
      const original = {
        type: 'transaction',
        timestamp: 12345,
        payload: { amount: 100 },
      };

      const transformed = {
        type: 'transaction',
        timestamp: 12345,
        payload: { amount: 1000 },
      };

      const isValid = bridge.verifyMessageIntegrity(original, transformed);

      expect(isValid).toBe(false);
    });

    it('should handle messages without payload', () => {
      const original = {
        type: 'transaction',
        timestamp: 12345,
      };

      const transformed = {
        type: 'transaction',
        timestamp: 12345,
      };

      const isValid = bridge.verifyMessageIntegrity(original, transformed);

      expect(isValid).toBe(true);
    });

    it('should reject non-object original message', () => {
      const isValid = bridge.verifyMessageIntegrity('not an object', {
        type: 'test',
        timestamp: 123,
      });

      expect(isValid).toBe(false);
    });

    it('should reject non-object transformed message', () => {
      const isValid = bridge.verifyMessageIntegrity(
        { type: 'test', timestamp: 123 },
        'not an object'
      );

      expect(isValid).toBe(false);
    });

    it('should emit bridge:integrity-failed event on integrity failure', async () => {
      const failedSpy = vi.fn();
      bridge.on('bridge:integrity-failed', failedSpy);

      const message = {
        type: 'transaction',
        timestamp: 12345,
        payload: {},
        compressed: true, // Mark as mesh to trigger transformation
      };

      // Mock transformation to change type
      vi.spyOn(bridge as any, 'transformProtocol').mockResolvedValue({
        type: 'block',
        timestamp: 12345,
        payload: {},
      });

      await bridge.bridgeMessage(message, 'internet');

      expect(failedSpy).toHaveBeenCalled();
    });
  });

  describe('Network Detection', () => {
    it('should detect mesh network from headers', () => {
      const message = {
        type: 'transaction',
        headers: { 'X-Source-Network': 'mesh' },
      };

      const network = bridge['detectSourceNetwork'](message);

      expect(network).toBe('mesh');
    });

    it('should detect internet network from headers', () => {
      const message = {
        type: 'transaction',
        headers: { 'X-Source-Network': 'internet' },
      };

      const network = bridge['detectSourceNetwork'](message);

      expect(network).toBe('internet');
    });

    it('should detect mesh network from compressed flag', () => {
      const message = {
        type: 'transaction',
        compressed: true,
      };

      const network = bridge['detectSourceNetwork'](message);

      expect(network).toBe('mesh');
    });

    it('should detect mesh network from fragmentId', () => {
      const message = {
        type: 'transaction',
        fragmentId: 'frag-123',
      };

      const network = bridge['detectSourceNetwork'](message);

      expect(network).toBe('mesh');
    });

    it('should default to internet for unknown messages', () => {
      const message = {
        type: 'transaction',
        payload: {},
      };

      const network = bridge['detectSourceNetwork'](message);

      expect(network).toBe('internet');
    });

    it('should default to internet for non-object messages', () => {
      const network = bridge['detectSourceNetwork']('not an object');

      expect(network).toBe('internet');
    });

    it('should default to internet for null messages', () => {
      const network = bridge['detectSourceNetwork'](null);

      expect(network).toBe('internet');
    });
  });

  describe('Error Handling', () => {
    it('should handle compression errors gracefully', async () => {
      const largeMessage = {
        type: 'sync',
        payload: { data: 'x'.repeat(300) },
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      vi.spyOn(mockCompressionManager, 'compress').mockImplementation(() => {
        throw new Error('Compression failed');
      });

      const transformed = await bridge.transformProtocol(largeMessage, 'mesh');
      const trans = transformed as Record<string, unknown>;

      // Should still transform, just without compression
      expect(trans.type).toBe('sync');
      expect(trans.payload).toEqual(new Uint8Array());
    });

    it('should handle decompression errors gracefully', async () => {
      const compressedMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        compressed: true,
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      vi.spyOn(mockCompressionManager, 'decompress').mockImplementation(() => {
        throw new Error('Decompression failed');
      });

      const transformed = await bridge.transformProtocol(
        compressedMessage,
        'http'
      );
      const trans = transformed as Record<string, unknown>;

      // Should return original payload on decompression error
      expect(trans.payload).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle transformation errors', async () => {
      const message = {
        type: 'transaction',
        payload: {},
        timestamp: Date.now(),
      };

      // Mock transformer to throw error
      const transformation = bridge['transformations'].get('http');
      if (transformation) {
        transformation.transformer = () => {
          throw new Error('Transform error');
        };
      }

      await expect(bridge.transformProtocol(message, 'http')).rejects.toThrow(
        'Transform error'
      );
    });
  });
});
