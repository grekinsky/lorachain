/**
 * Compressed UTXO Mesh Protocol
 * 
 * Integration of the compression system with the existing EnhancedMeshProtocol
 * Provides transparent compression for all mesh communications with UTXO optimization
 * BREAKING CHANGE: Requires compression for all mesh communications
 */

import { EventEmitter } from 'events';
import { UTXOEnhancedMeshProtocol } from './enhanced-mesh-protocol.js';
import { UTXOCompressionManager } from './utxo-compression-manager.js';
import { ProtobufCompressionEngine } from './compression-engines.js';
import { CompressionFactory } from './compression-factory.js';
import type {
  ICompressedMeshProtocol,
  IProtobufSerializer
} from './compression-interfaces.js';
import {
  CompressionAlgorithm,
  MessageType,
  type CompressionOptions,
  type UTXOCompressionConfig,
  type CompressionStats,
  type DutyCycleEfficiency,
  type CompressedData,
  type CompressionDictionary,
  type CompressionError
} from './compression-types.js';
import type {
  MeshMessage,
  UTXOTransaction,
  Block,
  RoutingConfig,
  FragmentationConfig,
  DutyCycleConfig,
  IDatabase,
  IDutyCycleManager,
  NetworkNode
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
// Simple logger for compression protocol
class SimpleLogger {
  info(message: string, context?: any): void {
    console.log(`[INFO] CompressedMeshProtocol: ${message}`, context || '');
  }
  warn(message: string, context?: any): void {
    console.warn(`[WARN] CompressedMeshProtocol: ${message}`, context || '');
  }
  error(message: string, context?: any): void {
    console.error(`[ERROR] CompressedMeshProtocol: ${message}`, context || '');
  }
  debug(message: string, context?: any): void {
    console.log(`[DEBUG] CompressedMeshProtocol: ${message}`, context || '');
  }
}

/**
 * Compressed UTXO Mesh Message
 * Enhanced mesh message with compression metadata
 */
export interface CompressedUTXOMeshMessage extends MeshMessage {
  // Compression-specific fields
  compression: CompressionAlgorithm;
  originalSize: number;
  compressionMetadata: any;
  fragmentId?: number;
  totalFragments?: number;
  compressionRatio?: number;
}

/**
 * Compressed Mesh Protocol Configuration
 */
export interface CompressedMeshConfig {
  // Inherited from base mesh config
  nodeId: string;
  nodeType: 'full' | 'light' | 'mining';
  nodeKeyPair: KeyPair;
  routingConfig: RoutingConfig;
  fragmentationConfig: FragmentationConfig;
  dutyCycleConfig: DutyCycleConfig;
  
  // Compression-specific config
  compressionConfig: UTXOCompressionConfig;
  enableCompressionByDefault: boolean;
  compressionThreshold: number;
  maxCompressionLatency: number;
}

/**
 * Compressed UTXO Mesh Protocol
 * 
 * Extends the existing UTXOEnhancedMeshProtocol with comprehensive compression support
 * Provides transparent compression/decompression for all mesh communications
 */
export class CompressedUTXOMeshProtocol 
  extends EventEmitter 
  implements ICompressedMeshProtocol 
{
  private baseMeshProtocol: UTXOEnhancedMeshProtocol;
  private compressionManager!: UTXOCompressionManager;
  private protobufSerializer!: IProtobufSerializer;
  private compressionStats!: CompressionStats;
  private compressionConfig: UTXOCompressionConfig;
  private logger: SimpleLogger;
  
  // Configuration
  private enableCompressionByDefault: boolean;
  private compressionThreshold: number;
  private maxCompressionLatency: number;
  
  // Dependencies for duty cycle and UTXO integration
  private dutyCycleManager: IDutyCycleManager;
  private database?: IDatabase;

  constructor(config: CompressedMeshConfig, database?: IDatabase) {
    super();
    
    this.enableCompressionByDefault = config.enableCompressionByDefault;
    this.compressionThreshold = config.compressionThreshold;
    this.maxCompressionLatency = config.maxCompressionLatency;
    this.compressionConfig = config.compressionConfig;
    this.database = database;
    this.logger = new SimpleLogger();
    
    // Initialize base mesh protocol
    this.baseMeshProtocol = new UTXOEnhancedMeshProtocol(
      config.nodeId,
      config.nodeType,
      config.nodeKeyPair,
      config.routingConfig,
      config.fragmentationConfig,
      config.dutyCycleConfig,
      database
    );
    
    // Initialize compression system
    this.initializeCompressionSystem(config);
    
    // Set up event forwarding
    this.setupEventForwarding();
    
    // Initialize empty properties
    this.dutyCycleManager = {} as IDutyCycleManager; // Placeholder
    
    this.logger.info('CompressedUTXOMeshProtocol initialized', {
      nodeId: config.nodeId,
      compressionEnabled: this.enableCompressionByDefault,
      compressionThreshold: this.compressionThreshold
    });
  }

  /**
   * Send compressed message through the mesh network
   */
  async sendCompressedMessage(message: MeshMessage, options?: CompressionOptions): Promise<boolean> {
    try {
      const startTime = performance.now();
      
      // Determine if compression should be applied
      const shouldCompress = this.shouldCompressMessage(message, options);
      
      if (!shouldCompress) {
        // Send uncompressed through base protocol
        return this.baseMeshProtocol.sendMessage(message);
      }
      
      // Check duty cycle constraints before compression
      // Note: This would integrate with actual duty cycle manager in real implementation
      const dutyCycleOk = true; // Placeholder for duty cycle check
      if (!dutyCycleOk) {
        this.logger.warn('Duty cycle constraints prevent compression, sending uncompressed', {
          messageType: message.type
        });
        return this.baseMeshProtocol.sendMessage(message);
      }
      
      // Serialize message to UTXO protobuf format
      const serialized = this.serializeMessage(message);
      
      // Apply UTXO-optimized compression
      const compressed = this.compressionManager.compress(
        serialized,
        this.mapMessageType(message.type),
        options
      );
      
      // Create compressed mesh message
      const compressedMessage: CompressedUTXOMeshMessage = {
        ...message,
        payload: compressed.data,
        compression: compressed.algorithm,
        originalSize: compressed.originalSize,
        compressionMetadata: compressed.metadata,
        fragmentId: this.generateFragmentId(),
        totalFragments: this.calculateFragments(compressed.data.length),
        compressionRatio: compressed.data.length / compressed.originalSize
      };
      
      const processingTime = performance.now() - startTime;
      
      // Log compression performance
      this.logger.debug('Message compressed for transmission', {
        originalSize: compressed.originalSize,
        compressedSize: compressed.data.length,
        compressionRatio: compressedMessage.compressionRatio,
        algorithm: compressed.algorithm,
        processingTime
      });
      
      // Send through base mesh protocol
      const result = await this.baseMeshProtocol.sendMessage(compressedMessage as any);
      
      if (result) {
        this.updateCompressionStats(compressed, processingTime);
        this.emit('message_compressed', {
          messageType: message.type,
          originalSize: compressed.originalSize,
          compressedSize: compressed.data.length,
          algorithm: compressed.algorithm
        });
      }
      
      return result;
      
    } catch (error) {
      const compressionError: CompressionError = {
        code: 'COMPRESSION_FAILED' as any,
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
      
      this.emit('compression_error', compressionError);
      this.logger.error('Failed to send compressed message', {
        error: compressionError.message,
        messageType: message.type
      });
      
      // Fallback to uncompressed transmission
      return this.baseMeshProtocol.sendMessage(message);
    }
  }

  /**
   * Send UTXO transaction with optimal compression
   */
  async sendUTXOTransaction(transaction: UTXOTransaction, compression?: CompressionOptions): Promise<boolean> {
    const message: MeshMessage = {
      type: 'transaction', // Use compatible type
      payload: transaction,
      timestamp: Date.now(),
      from: 'node_placeholder', // Placeholder since getNodeId doesn't exist
      signature: await this.signMessage(transaction)
    };
    
    const options: CompressionOptions = {
      algorithm: CompressionAlgorithm.UTXO_CUSTOM, // Use UTXO-specific compression
      ...compression
    };
    
    return this.sendCompressedMessage(message, options);
  }

  /**
   * Send UTXO block with optimal compression
   */
  async sendUTXOBlock(block: Block, compression?: CompressionOptions): Promise<boolean> {
    const message: MeshMessage = {
      type: 'block', // Use compatible type
      payload: block,
      timestamp: Date.now(),
      from: 'node_placeholder', // Placeholder since getNodeId doesn't exist
      signature: await this.signMessage(block)
    };
    
    const options: CompressionOptions = {
      algorithm: CompressionAlgorithm.UTXO_CUSTOM, // Use UTXO-specific compression
      ...compression
    };
    
    return this.sendCompressedMessage(message, options);
  }

  /**
   * Receive and decompress mesh message
   */
  async receiveMessage(data: Uint8Array): Promise<MeshMessage | null> {
    try {
      // First, let base protocol handle the message
      const baseMessage = await this.baseMeshProtocol.receiveMessage(data);
      if (!baseMessage) {
        return null;
      }
      
      // Check if message is compressed
      const compressedMessage = baseMessage as CompressedUTXOMeshMessage;
      if (!compressedMessage.compression || compressedMessage.compression === CompressionAlgorithm.NONE) {
        return baseMessage;
      }
      
      // Decompress the message
      const compressedData: CompressedData = {
        algorithm: compressedMessage.compression,
        data: compressedMessage.payload as Uint8Array,
        originalSize: compressedMessage.originalSize,
        metadata: compressedMessage.compressionMetadata || {}
      };
      
      const decompressed = this.compressionManager.decompress(compressedData);
      const originalMessage = this.deserializeMessage(decompressed);
      
      this.logger.debug('Message decompressed', {
        compressedSize: compressedData.data.length,
        decompressedSize: decompressed.length,
        algorithm: compressedData.algorithm
      });
      
      this.emit('message_decompressed', {
        messageType: originalMessage.type,
        compressedSize: compressedData.data.length,
        decompressedSize: decompressed.length,
        algorithm: compressedData.algorithm
      });
      
      return originalMessage;
      
    } catch (error) {
      this.logger.error('Failed to decompress received message', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return base message on decompression failure
      return this.baseMeshProtocol.receiveMessage(data);
    }
  }

  /**
   * Set compression configuration
   */
  setCompressionConfig(config: UTXOCompressionConfig): void {
    this.compressionConfig = config;
    this.compressionManager.updateConfig(config);
    
    this.logger.info('Compression configuration updated', {
      algorithm: config.defaultAlgorithm,
      level: config.compressionLevel,
      utxoOptimization: config.utxoOptimization
    });
  }

  /**
   * Get current compression configuration
   */
  getCompressionConfig(): UTXOCompressionConfig {
    return { ...this.compressionConfig };
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(): CompressionStats {
    return this.compressionManager.getCompressionStats();
  }

  /**
   * Get compression efficiency metrics
   */
  getCompressionEfficiency(): DutyCycleEfficiency {
    return this.compressionManager.analyzeDutyCycleEfficiency();
  }

  /**
   * Share compression dictionary with other nodes
   */
  async shareDictionary(dictionaryId: string, nodes: string[]): Promise<boolean> {
    const dictionary = this.compressionManager.getDictionary(dictionaryId);
    if (!dictionary) {
      this.logger.warn('Dictionary not found for sharing', { dictionaryId });
      return false;
    }
    
    const shareMessage: MeshMessage = {
      type: 'sync', // Use compatible type
      payload: dictionary,
      timestamp: Date.now(),
      from: 'node_placeholder', // Placeholder since getNodeId doesn't exist
      signature: await this.signMessage(dictionary)
    };
    
    // Share with specified nodes
    let success = true;
    for (const nodeId of nodes) {
      try {
        const result = await this.baseMeshProtocol.sendMessage(shareMessage);
        success = success && result;
      } catch (error) {
        this.logger.error('Failed to share dictionary with node', {
          nodeId,
          dictionaryId,
          error: error instanceof Error ? error.message : String(error)
        });
        success = false;
      }
    }
    
    return success;
  }

  /**
   * Request compression dictionary from another node
   */
  async requestDictionary(dictionaryId: string, fromNode: string): Promise<CompressionDictionary | null> {
    const requestMessage: MeshMessage = {
      type: 'discovery', // Use compatible type
      payload: { dictionaryId },
      timestamp: Date.now(),
      from: 'node_placeholder', // Placeholder since getNodeId doesn't exist
      to: fromNode,
      signature: await this.signMessage({ dictionaryId })
    };
    
    try {
      // In a real implementation, this would use a request-response pattern
      await this.baseMeshProtocol.sendMessage(requestMessage);
      
      // For now, return null (would need to implement response handling)
      return null;
    } catch (error) {
      this.logger.error('Failed to request dictionary', {
        dictionaryId,
        fromNode,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Connect to the mesh network
   */
  async connect(): Promise<void> {
    await this.baseMeshProtocol.connect();
    this.emit('connected');
  }

  /**
   * Disconnect from the mesh network
   */
  async disconnect(): Promise<void> {
    await this.baseMeshProtocol.disconnect();
    this.emit('disconnected');
  }

  // Event emitter methods for ICompressedMeshProtocol
  on(event: 'compression_stats_updated', listener: (stats: CompressionStats) => void): this;
  on(event: 'compression_error', listener: (error: CompressionError) => void): this;
  on(event: 'dictionary_updated', listener: (dictionaryId: string) => void): this;
  on(event: 'duty_cycle_optimized', listener: (efficiency: DutyCycleEfficiency) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  // Private helper methods

  private initializeCompressionSystem(config: CompressedMeshConfig): void {
    // Create compression manager with dependencies
    this.compressionManager = new UTXOCompressionManager(
      config.compressionConfig,
      this.dutyCycleManager,
      undefined, // UTXOManager would be injected in real implementation
      undefined  // RegionalValidator would be injected in real implementation
    );
    
    // Create and register compression engines
    const factory = CompressionFactory.getInstance();
    const protobufEngine = factory.createCompressionEngine(CompressionAlgorithm.PROTOBUF);
    
    if (protobufEngine instanceof ProtobufCompressionEngine) {
      this.protobufSerializer = protobufEngine;
    } else {
      throw new Error('Failed to create Protocol Buffer serializer');
    }
    
    // Initialize compression statistics
    this.compressionStats = this.compressionManager.getCompressionStats();
  }

  private setupEventForwarding(): void {
    // Forward base mesh protocol events
    this.baseMeshProtocol.on('message_received', (message) => {
      this.emit('message_received', message);
    });
    
    this.baseMeshProtocol.on('neighbor_discovered', (neighbor) => {
      this.emit('neighbor_discovered', neighbor);
    });
    
    this.baseMeshProtocol.on('route_updated', (route) => {
      this.emit('route_updated', route);
    });
    
    // Forward compression events
    this.compressionManager.on('compression_completed', (result) => {
      this.emit('compression_completed', result);
    });
    
    this.compressionManager.on('compression_error', (error) => {
      this.emit('compression_error', error);
    });
    
    this.compressionManager.on('stats_updated', (stats) => {
      this.compressionStats = stats;
      this.emit('compression_stats_updated', stats);
    });
  }

  private shouldCompressMessage(message: MeshMessage, options?: CompressionOptions): boolean {
    // Don't compress if explicitly disabled
    if (options?.algorithm === 'none') {
      return false;
    }
    
    // Always compress if compression is requested
    if (options?.algorithm) {
      return true;
    }
    
    // Use default compression policy
    if (!this.enableCompressionByDefault) {
      return false;
    }
    
    // Check message size threshold
    const messageSize = this.estimateMessageSize(message);
    return messageSize >= this.compressionThreshold;
  }

  private estimateMessageSize(message: MeshMessage): number {
    // Simple size estimation
    try {
      return JSON.stringify(message).length;
    } catch {
      return 1024; // Default size if serialization fails
    }
  }

  private canCompressWithinDutyCycle(constraints: any, message: MeshMessage): boolean {
    // Estimate compression time
    const messageSize = this.estimateMessageSize(message);
    const estimatedCompressionTime = messageSize / (1024 * 1024) * 1000; // Assume 1MB/s
    
    return estimatedCompressionTime <= (constraints.remainingWindow || 1000);
  }

  private serializeMessage(message: MeshMessage): Uint8Array {
    // Use Protocol Buffer serialization
    return this.protobufSerializer.serializeUTXOMeshMessage(message);
  }

  private deserializeMessage(data: Uint8Array): MeshMessage {
    // Use Protocol Buffer deserialization
    return this.protobufSerializer.deserializeUTXOMeshMessage(data);
  }

  private mapMessageType(type: string): MessageType {
    // Map mesh message types to compression message types
    const typeMap: Record<string, MessageType> = {
      'transaction': MessageType.UTXO_TRANSACTION,
      'block': MessageType.UTXO_BLOCK,
      'sync': MessageType.BLOCKCHAIN_SYNC,
      'discovery': MessageType.NODE_DISCOVERY
    };
    
    return typeMap[type] || MessageType.BLOCKCHAIN_SYNC;
  }

  private generateFragmentId(): number {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  private calculateFragments(dataSize: number): number {
    const maxPacketSize = 256; // LoRa constraint
    return Math.ceil(dataSize / maxPacketSize);
  }

  private async signMessage(data: any): Promise<string> {
    // Use cryptographic service to sign message
    // For now, return a placeholder signature
    return 'compressed_signature_placeholder';
  }

  private updateCompressionStats(compressed: CompressedData, processingTime: number): void {
    // Update internal compression statistics
    // This would typically be handled by the compression manager
  }
}