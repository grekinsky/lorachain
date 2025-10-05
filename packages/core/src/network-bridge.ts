/**
 * NetworkBridge - Protocol translation between mesh and internet networks
 *
 * This module handles protocol transformation between mesh-optimized (LoRa)
 * and internet-native (HTTP/WebSocket) message formats while maintaining
 * cryptographic integrity.
 *
 * Part 6 of 8 in the hybrid routing system implementation.
 */

import { EventEmitter } from 'events';
import { Logger } from '@lorachain/shared';
import { CryptographicService } from './cryptographic';
import { UTXOCompressionManager } from './utxo-compression-manager';

/**
 * Bridge message metadata interface
 */
export interface NetworkBridgeMessage {
  /** Original message content */
  originalMessage: unknown;
  /** Source network type */
  sourceNetwork: 'mesh' | 'internet';
  /** Target network type */
  targetNetwork: 'mesh' | 'internet';
  /** Bridge metadata */
  bridgeMetadata: {
    /** Timestamp when bridging occurred */
    timestamp: number;
    /** Gateway identifier that performed bridging */
    gatewayId: string;
    /** Whether transformation was applied */
    transformationApplied: boolean;
    /** Message priority level */
    priority: number;
  };
}

/**
 * Protocol transformation definition
 */
export interface ProtocolTransformation {
  /** Source format identifier */
  sourceFormat: string;
  /** Target format identifier */
  targetFormat: string;
  /** Transformation function */
  transformer: (message: unknown) => unknown;
  /** Validation function */
  validator: (message: unknown) => boolean;
}

/**
 * NetworkBridge - Handles protocol translation between mesh and internet formats
 *
 * Features:
 * - Mesh-to-HTTP and HTTP-to-Mesh transformations
 * - Message integrity verification
 * - Cryptographic signature validation
 * - Compression integration for mesh messages
 * - Event emission for monitoring
 *
 * @fires message:bridged - Emitted when message is successfully bridged
 * @fires protocol:transformed - Emitted when protocol transformation occurs
 * @fires bridge:validation-failed - Emitted when validation fails
 * @fires bridge:integrity-failed - Emitted when integrity check fails
 * @fires bridge:error - Emitted when bridging error occurs
 */
export class NetworkBridge extends EventEmitter {
  private transformations: Map<string, ProtocolTransformation>;
  private compressionManager: UTXOCompressionManager;
  private cryptoService: CryptographicService;
  private logger: Logger;

  constructor(
    compressionManager: UTXOCompressionManager,
    cryptoService: CryptographicService
  ) {
    super();
    this.transformations = new Map();
    this.compressionManager = compressionManager;
    this.cryptoService = cryptoService;
    this.logger = Logger.getInstance();

    this.initializeTransformations();
  }

  /**
   * Bridge a message between networks with protocol transformation
   *
   * @param message - Message to bridge
   * @param targetNetwork - Target network type (mesh or internet)
   * @returns Promise resolving to true if bridging succeeded
   */
  async bridgeMessage(
    message: unknown,
    targetNetwork: 'mesh' | 'internet'
  ): Promise<boolean> {
    const sourceNetwork = this.detectSourceNetwork(message);

    if (sourceNetwork === targetNetwork) {
      this.logger.debug('No bridging required - same network');
      return true;
    }

    try {
      // Transform protocol if needed
      const targetFormat = targetNetwork === 'mesh' ? 'mesh' : 'http';
      const transformed = await this.transformProtocol(message, targetFormat);

      // Validate transformed message
      if (!this.validateBridgedMessage(transformed, sourceNetwork)) {
        this.logger.error('Bridge validation failed');
        this.emit('bridge:validation-failed', {
          sourceNetwork,
          targetNetwork,
          message,
          timestamp: Date.now(),
        });
        return false;
      }

      // Verify message integrity
      if (!this.verifyMessageIntegrity(message, transformed)) {
        this.logger.error('Message integrity check failed');
        this.emit('bridge:integrity-failed', {
          sourceNetwork,
          targetNetwork,
          timestamp: Date.now(),
        });
        return false;
      }

      this.logger.info('Message bridged successfully', {
        sourceNetwork,
        targetNetwork,
        messageType: this.getMessageType(message),
      });

      this.emit('message:bridged', {
        message: transformed,
        sourceNetwork,
        targetNetwork,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to bridge message', { error });
      this.emit('bridge:error', {
        message,
        sourceNetwork,
        targetNetwork,
        error,
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Transform message protocol to target format
   *
   * @param message - Message to transform
   * @param targetFormat - Target format identifier
   * @returns Transformed message
   */
  async transformProtocol(
    message: unknown,
    targetFormat: string
  ): Promise<unknown> {
    const transformation = this.transformations.get(targetFormat);

    if (!transformation) {
      this.logger.warn('No transformation found for format', { targetFormat });
      return message;
    }

    try {
      const transformed = transformation.transformer(message);

      this.logger.debug('Protocol transformed', {
        targetFormat,
        originalSize: JSON.stringify(message).length,
        transformedSize: JSON.stringify(transformed).length,
      });

      this.emit('protocol:transformed', {
        targetFormat,
        timestamp: Date.now(),
      });

      return transformed;
    } catch (error) {
      this.logger.error('Protocol transformation failed', {
        error,
        targetFormat,
      });
      throw error;
    }
  }

  /**
   * Validate bridged message structure and signatures
   *
   * @param message - Message to validate
   * @param sourceNetwork - Source network identifier
   * @returns True if message is valid
   */
  validateBridgedMessage(message: unknown, sourceNetwork: string): boolean {
    // Validate message structure
    if (!message || typeof message !== 'object') {
      this.logger.error('Invalid message structure');
      return false;
    }

    const msg = message as Record<string, unknown>;

    // Check required fields
    if (!msg.type || !msg.timestamp) {
      this.logger.error('Missing required message fields');
      return false;
    }

    // Verify signature if present
    if (msg.signature) {
      try {
        const messageData = new TextEncoder().encode(
          JSON.stringify({
            type: msg.type,
            payload: msg.payload,
            timestamp: msg.timestamp,
          })
        );

        const signatureBytes = new TextEncoder().encode(String(msg.signature));
        const publicKey = new TextEncoder().encode(String(msg.publicKey || ''));

        if (publicKey.length > 0) {
          const signatureObj = {
            signature: signatureBytes,
            algorithm: 'secp256k1' as const,
          };
          return CryptographicService.verify(
            signatureObj,
            messageData,
            publicKey
          );
        }
      } catch (error) {
        this.logger.error('Signature verification failed', { error });
        return false;
      }
    }

    return true;
  }

  /**
   * Verify message integrity after transformation
   *
   * @param original - Original message
   * @param transformed - Transformed message
   * @returns True if integrity is maintained
   */
  verifyMessageIntegrity(original: unknown, transformed: unknown): boolean {
    if (
      !original ||
      typeof original !== 'object' ||
      !transformed ||
      typeof transformed !== 'object'
    ) {
      return false;
    }

    const orig = original as Record<string, unknown>;
    const trans = transformed as Record<string, unknown>;

    // Verify that transformation preserved essential data
    const typeMatch = orig.type === trans.type;
    const timestampMatch = orig.timestamp === trans.timestamp;

    // For UTXO messages, verify payload integrity
    let payloadMatch = true;
    if (orig.payload && trans.payload) {
      const originalPayload = JSON.stringify(orig.payload);
      const transformedPayload = JSON.stringify(trans.payload);
      payloadMatch = originalPayload === transformedPayload;
    }

    const isValid = typeMatch && timestampMatch && payloadMatch;

    if (!isValid) {
      this.logger.error('Integrity check failed', {
        typeMatch,
        timestampMatch,
        payloadMatch,
      });
    }

    return isValid;
  }

  /**
   * Initialize protocol transformations
   */
  private initializeTransformations(): void {
    // Mesh to HTTP transformation
    this.transformations.set('http', {
      sourceFormat: 'mesh',
      targetFormat: 'http',
      transformer: (message: unknown) => {
        const msg = message as Record<string, unknown>;

        // Convert mesh message to HTTP-friendly format
        return {
          ...msg,
          headers: {
            'Content-Type': 'application/json',
            'X-Source-Network': 'mesh',
            'X-Message-Type': msg.type,
          },
          // Decompress if mesh message was compressed
          payload:
            msg.compressed && msg.payload
              ? this.decompress(msg.payload as Uint8Array)
              : msg.payload,
        };
      },
      validator: (message: unknown) => {
        const msg = message as Record<string, unknown>;
        return (
          !!msg.headers &&
          (msg.headers as Record<string, unknown>)['X-Source-Network'] ===
            'mesh'
        );
      },
    });

    // HTTP to Mesh transformation
    this.transformations.set('mesh', {
      sourceFormat: 'http',
      targetFormat: 'mesh',
      transformer: (message: unknown) => {
        const msg = message as Record<string, unknown>;

        // Convert HTTP message to mesh-optimized format
        const meshMessage: Record<string, unknown> = {
          type: msg.type,
          payload: msg.payload,
          timestamp: msg.timestamp,
          signature: msg.signature,
        };

        // Compress for LoRa constraints (256-byte limit)
        const messageSize = JSON.stringify(meshMessage).length;
        if (messageSize > 256) {
          meshMessage.payload = this.compress(meshMessage.payload);
          meshMessage.compressed = true;
        }

        return meshMessage;
      },
      validator: (message: unknown) => {
        const msg = message as Record<string, unknown>;
        return !!msg.signature && !!msg.type;
      },
    });
  }

  /**
   * Detect source network from message characteristics
   *
   * @param message - Message to analyze
   * @returns Source network type
   */
  private detectSourceNetwork(message: unknown): 'mesh' | 'internet' {
    if (!message || typeof message !== 'object') {
      return 'internet';
    }

    const msg = message as Record<string, unknown>;

    // Detect based on message characteristics
    if (msg.headers && typeof msg.headers === 'object') {
      const headers = msg.headers as Record<string, unknown>;
      if (headers['X-Source-Network']) {
        return headers['X-Source-Network'] as 'mesh' | 'internet';
      }
    }

    // Check for mesh-specific indicators
    if (msg.compressed !== undefined || msg.fragmentId !== undefined) {
      return 'mesh';
    }

    // Default to internet
    return 'internet';
  }

  /**
   * Compress payload using compression manager
   *
   * @param payload - Payload to compress
   * @returns Compressed payload as Uint8Array
   */
  private compress(payload: unknown): Uint8Array {
    try {
      // Use existing compression manager
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const compressed = this.compressionManager.compress(data);
      return compressed.data;
    } catch (error) {
      this.logger.error('Compression failed', { error });
      return new Uint8Array();
    }
  }

  /**
   * Decompress payload using compression manager
   *
   * @param payload - Compressed payload
   * @returns Decompressed payload
   */
  private decompress(payload: Uint8Array): unknown {
    try {
      // Use existing compression manager
      // Create CompressedData object for decompression
      const compressedData = {
        data: payload,
        algorithm: 'gzip' as const,
        originalSize: payload.length * 10, // Estimate
        metadata: {
          version: 1,
        },
      };
      const decompressed = this.compressionManager.decompress(compressedData);
      const text = new TextDecoder().decode(decompressed);
      return JSON.parse(text);
    } catch (error) {
      this.logger.error('Decompression failed', { error });
      return payload;
    }
  }

  /**
   * Get message type safely
   *
   * @param message - Message to extract type from
   * @returns Message type or 'unknown'
   */
  private getMessageType(message: unknown): string {
    if (message && typeof message === 'object') {
      const msg = message as Record<string, unknown>;
      return String(msg.type || 'unknown');
    }
    return 'unknown';
  }
}
