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
import type { CompressionAlgorithm } from './compression-types';

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
 * Typed event interfaces for NetworkBridge events
 */
export interface BridgeEvents {
  'message:bridged': {
    message: unknown;
    sourceNetwork: string;
    targetNetwork: string;
    timestamp: number;
  };
  'protocol:transformed': {
    targetFormat: string;
    timestamp: number;
    compressionApplied?: boolean;
    compressionRatio?: number;
  };
  'bridge:validation-failed': {
    sourceNetwork: string;
    targetNetwork: string;
    message: unknown;
    timestamp: number;
  };
  'bridge:integrity-failed': {
    sourceNetwork: string;
    targetNetwork: string;
    timestamp: number;
  };
  'bridge:error': {
    message: unknown;
    sourceNetwork: string;
    targetNetwork: string;
    error: unknown;
    timestamp: number;
  };
}

/**
 * Bridge performance metrics
 */
export interface BridgeMetrics {
  /** Total number of transformations performed */
  totalTransformations: number;
  /** Successful transformations */
  successfulTransformations: number;
  /** Failed transformations */
  failedTransformations: number;
  /** Average transformation time in milliseconds */
  averageTransformationTime: number;
  /** Average compression ratio (original size / compressed size) */
  averageCompressionRatio: number;
  /** Transformations by type */
  transformationsByType: Map<string, number>;
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
  /** LoRa message size limit in bytes (256-byte LoRa constraint) */
  private static readonly LORA_MESSAGE_SIZE_LIMIT = 256;

  private transformations: Map<string, ProtocolTransformation>;
  private compressionManager: UTXOCompressionManager;
  private cryptoService: CryptographicService;
  private logger: Logger;
  private metrics: BridgeMetrics;
  private transformationTimes: number[] = [];

  constructor(
    compressionManager: UTXOCompressionManager,
    cryptoService: CryptographicService
  ) {
    super();
    this.transformations = new Map();
    this.compressionManager = compressionManager;
    this.cryptoService = cryptoService;
    this.logger = Logger.getInstance();
    this.metrics = {
      totalTransformations: 0,
      successfulTransformations: 0,
      failedTransformations: 0,
      averageTransformationTime: 0,
      averageCompressionRatio: 0,
      transformationsByType: new Map(),
    };

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

    const startTime = Date.now();
    const originalSize = JSON.stringify(message).length;

    try {
      const transformed = transformation.transformer(message);
      const transformedSize = JSON.stringify(transformed).length;
      const transformationTime = Date.now() - startTime;

      // Update metrics
      this.metrics.totalTransformations++;
      this.metrics.successfulTransformations++;
      this.transformationTimes.push(transformationTime);
      this.metrics.averageTransformationTime =
        this.transformationTimes.reduce((a, b) => a + b, 0) /
        this.transformationTimes.length;

      // Track transformations by type
      const messageType = this.getMessageType(message);
      this.metrics.transformationsByType.set(
        messageType,
        (this.metrics.transformationsByType.get(messageType) || 0) + 1
      );

      // Check if compression was applied
      const compressionApplied =
        targetFormat === 'mesh' && transformedSize < originalSize;
      const compressionRatio = compressionApplied
        ? originalSize / transformedSize
        : 1;

      if (compressionApplied) {
        this.updateCompressionRatio(compressionRatio);
      }

      this.logger.debug('Protocol transformed', {
        targetFormat,
        originalSize,
        transformedSize,
        transformationTime,
        compressionApplied,
        compressionRatio: compressionRatio.toFixed(2),
      });

      this.emit('protocol:transformed', {
        targetFormat,
        timestamp: Date.now(),
        compressionApplied,
        compressionRatio,
      });

      return transformed;
    } catch (error) {
      this.metrics.totalTransformations++;
      this.metrics.failedTransformations++;

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
  validateBridgedMessage(message: unknown, _sourceNetwork: string): boolean {
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

    // Validate UTXO payload structure for transactions and blocks
    // Only validate if payload is present and appears to be a UTXO structure
    if (
      msg.type === 'transaction' &&
      msg.payload &&
      typeof msg.payload === 'object'
    ) {
      const payload = msg.payload as Record<string, unknown>;
      // Only validate if it has inputs/outputs arrays (UTXO transaction structure)
      if (Array.isArray(payload.inputs) || Array.isArray(payload.outputs)) {
        if (!this.isValidUTXOTransaction(msg.payload)) {
          this.logger.error('Invalid UTXO transaction payload');
          return false;
        }
      }
    }

    if (
      msg.type === 'block' &&
      msg.payload &&
      typeof msg.payload === 'object'
    ) {
      const payload = msg.payload as Record<string, unknown>;
      // Only validate if it has transactions array (UTXO block structure)
      if (Array.isArray(payload.transactions)) {
        if (!this.isValidUTXOBlock(msg.payload)) {
          this.logger.error('Invalid UTXO block payload');
          return false;
        }
      }
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
          // Decompress if mesh message was compressed using stored algorithm
          payload:
            msg.compressed && msg.payload
              ? this.decompress(
                  msg.payload as Uint8Array,
                  (msg.compressionAlgorithm as CompressionAlgorithm) || 'gzip',
                  msg.originalSize as number | undefined
                )
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

        // Compress for LoRa constraints (use static constant)
        const messageSize = JSON.stringify(meshMessage).length;
        if (messageSize > NetworkBridge.LORA_MESSAGE_SIZE_LIMIT) {
          const compressionResult = this.compress(meshMessage.payload);
          meshMessage.payload = compressionResult.data;
          meshMessage.compressed = true;
          meshMessage.compressionAlgorithm = compressionResult.algorithm;
          meshMessage.originalSize = compressionResult.originalSize;
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
   * @returns Compression result with data, algorithm, and original size
   */
  private compress(payload: unknown): {
    data: Uint8Array;
    algorithm: CompressionAlgorithm;
    originalSize: number;
  } {
    try {
      // Use existing compression manager
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const compressed = this.compressionManager.compress(data);
      return {
        data: compressed.data,
        algorithm: compressed.algorithm,
        originalSize: data.length,
      };
    } catch (error) {
      this.logger.error('Compression failed', { error });
      return {
        data: new Uint8Array(),
        algorithm: 'gzip',
        originalSize: 0,
      };
    }
  }

  /**
   * Decompress payload using compression manager
   *
   * @param payload - Compressed payload
   * @param algorithm - Compression algorithm used (defaults to gzip if not specified)
   * @param originalSize - Original size before compression (optional)
   * @returns Decompressed payload
   */
  private decompress(
    payload: Uint8Array,
    algorithm: CompressionAlgorithm = 'gzip',
    originalSize?: number
  ): unknown {
    try {
      // Use existing compression manager with stored algorithm
      const compressedData = {
        data: payload,
        algorithm,
        originalSize: originalSize || payload.length * 10, // Use stored size or estimate
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

  /**
   * Validate UTXO transaction payload structure
   *
   * @param payload - Transaction payload to validate
   * @returns True if payload has valid UTXO transaction structure
   */
  private isValidUTXOTransaction(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const tx = payload as Record<string, unknown>;

    // Check for required UTXO transaction fields
    if (!Array.isArray(tx.inputs) || !Array.isArray(tx.outputs)) {
      this.logger.debug('Invalid UTXO transaction: missing inputs or outputs');
      return false;
    }

    // Validate inputs have required fields
    for (const input of tx.inputs) {
      if (!input || typeof input !== 'object') {
        return false;
      }
      const inp = input as Record<string, unknown>;
      if (!inp.txHash || !inp.outputIndex) {
        this.logger.debug('Invalid UTXO transaction: invalid input structure');
        return false;
      }
    }

    // Validate outputs have required fields
    for (const output of tx.outputs) {
      if (!output || typeof output !== 'object') {
        return false;
      }
      const out = output as Record<string, unknown>;
      if (!out.address || typeof out.amount !== 'number') {
        this.logger.debug('Invalid UTXO transaction: invalid output structure');
        return false;
      }
    }

    return true;
  }

  /**
   * Validate UTXO block payload structure
   *
   * @param payload - Block payload to validate
   * @returns True if payload has valid UTXO block structure
   */
  private isValidUTXOBlock(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const block = payload as Record<string, unknown>;

    // Check for required block fields
    if (!Array.isArray(block.transactions)) {
      this.logger.debug('Invalid UTXO block: missing transactions array');
      return false;
    }

    // Validate each transaction in the block
    for (const tx of block.transactions) {
      if (!this.isValidUTXOTransaction(tx)) {
        this.logger.debug('Invalid UTXO block: contains invalid transaction');
        return false;
      }
    }

    // Check for block header fields
    if (!block.previousHash || !block.merkleRoot || !block.timestamp) {
      this.logger.debug('Invalid UTXO block: missing header fields');
      return false;
    }

    return true;
  }

  /**
   * Update average compression ratio metric
   *
   * @param ratio - Compression ratio to add to running average
   */
  private updateCompressionRatio(ratio: number): void {
    const currentTotal =
      this.metrics.averageCompressionRatio *
      this.metrics.successfulTransformations;
    this.metrics.averageCompressionRatio =
      (currentTotal + ratio) / (this.metrics.successfulTransformations + 1);
  }

  /**
   * Get current bridge metrics
   *
   * @returns Current bridge performance metrics
   */
  getMetrics(): BridgeMetrics {
    return {
      ...this.metrics,
      transformationsByType: new Map(this.metrics.transformationsByType),
    };
  }

  /**
   * Reset bridge metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalTransformations: 0,
      successfulTransformations: 0,
      failedTransformations: 0,
      averageTransformationTime: 0,
      averageCompressionRatio: 0,
      transformationsByType: new Map(),
    };
    this.transformationTimes = [];
  }
}
