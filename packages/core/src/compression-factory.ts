/**
 * Compression Factory
 * 
 * Factory for creating and configuring compression system components
 * Provides easy setup for UTXO-optimized compression with proper defaults
 */

import { UTXOCompressionManager } from './utxo-compression-manager.js';
import { 
  ProtobufCompressionEngine, 
  GzipCompressionEngine, 
  LZ4CompressionEngine 
} from './compression-engines.js';
import { 
  UTXOCustomCompressionEngine, 
  DictionaryCompressionEngine 
} from './utxo-compression-engines.js';
import type {
  ICompressionManager,
  ICompressionEngine,
  ICompressedMeshProtocol,
  IDictionaryManager,
  ICompressionSecurityManager,
  IStreamingCompression,
  IAdaptiveCompressionSelector,
  ICompressionFactory,
  ICompressionConfigBuilder
} from './compression-interfaces.js';
import {
  CompressionAlgorithm,
  CompressionLevel,
  MessageType,
  type UTXOCompressionConfig,
  type CompressionDictionary,
  type PerformanceMetrics,
  type CompressionSecurityConfig
} from './compression-types.js';

/**
 * Configuration Builder for fluent API
 */
export class CompressionConfigBuilder implements ICompressionConfigBuilder {
  private config: Partial<UTXOCompressionConfig> = {};

  constructor() {
    // Set reasonable defaults for LoRa constraints
    this.config = {
      defaultAlgorithm: CompressionAlgorithm.PROTOBUF,
      compressionLevel: CompressionLevel.BALANCED,
      enableDictionary: true,
      maxCompressionMemory: 512 * 1024, // 512KB for LoRa devices
      enableAdaptive: true,
      compressionThreshold: 64,
      dutyCycleIntegration: true,
      utxoOptimization: true,
      regionalCompliance: 'EU', // Default to EU regulations
      enableIntegrityCheck: true,
      enablePadding: false, // Disabled by default for LoRa efficiency
      maxExpansionRatio: 100,
      compressionTimeout: 5000 // 5 seconds
    };
  }

  algorithm(algorithm: CompressionAlgorithm): CompressionConfigBuilder {
    this.config.defaultAlgorithm = algorithm;
    return this;
  }

  level(level: CompressionLevel): CompressionConfigBuilder {
    this.config.compressionLevel = level;
    return this;
  }

  enableDictionary(enable: boolean): CompressionConfigBuilder {
    this.config.enableDictionary = enable;
    return this;
  }

  memoryLimit(bytes: number): CompressionConfigBuilder {
    this.config.maxCompressionMemory = bytes;
    return this;
  }

  enableUTXOOptimization(enable: boolean): CompressionConfigBuilder {
    this.config.utxoOptimization = enable;
    return this;
  }

  enableDutyCycleIntegration(enable: boolean): CompressionConfigBuilder {
    this.config.dutyCycleIntegration = enable;
    return this;
  }

  regionalCompliance(region: string): CompressionConfigBuilder {
    this.config.regionalCompliance = region;
    return this;
  }

  enableSecurity(enabled: boolean): CompressionConfigBuilder {
    this.config.enableIntegrityCheck = enabled;
    this.config.enablePadding = enabled;
    return this;
  }

  build(): UTXOCompressionConfig {
    // Validate configuration
    if (!this.config.defaultAlgorithm) {
      throw new Error('Default algorithm must be specified');
    }
    
    if (!this.config.compressionLevel) {
      throw new Error('Compression level must be specified');
    }
    
    if (!this.config.maxCompressionMemory || this.config.maxCompressionMemory <= 0) {
      throw new Error('Memory limit must be positive');
    }

    return this.config as UTXOCompressionConfig;
  }
}

/**
 * Main compression factory implementation
 */
class CompressionFactoryImpl implements ICompressionFactory {
  private static instance: CompressionFactoryImpl;

  private constructor() {}

  static getInstance(): CompressionFactoryImpl {
    if (!CompressionFactoryImpl.instance) {
      CompressionFactoryImpl.instance = new CompressionFactoryImpl();
    }
    return CompressionFactoryImpl.instance;
  }

  /**
   * Create a fully configured compression manager with all engines registered
   */
  createCompressionManager(config: UTXOCompressionConfig): ICompressionManager {
    const manager = new UTXOCompressionManager(config);
    
    // Register all available compression engines
    this.registerAllEngines(manager);
    
    return manager;
  }

  /**
   * Create compression manager with external dependencies
   */
  createCompressionManagerWithDependencies(
    config: UTXOCompressionConfig,
    dutyCycleManager?: any,
    utxoManager?: any,
    regionalValidator?: any
  ): ICompressionManager {
    const manager = new UTXOCompressionManager(
      config,
      dutyCycleManager,
      utxoManager,
      regionalValidator
    );
    
    this.registerAllEngines(manager);
    return manager;
  }

  /**
   * Create a specific compression engine
   */
  createCompressionEngine(algorithm: CompressionAlgorithm): ICompressionEngine {
    switch (algorithm) {
      case CompressionAlgorithm.PROTOBUF:
        return new ProtobufCompressionEngine();
      case CompressionAlgorithm.GZIP:
        return new GzipCompressionEngine();
      case CompressionAlgorithm.LZ4:
        return new LZ4CompressionEngine();
      case CompressionAlgorithm.UTXO_CUSTOM:
        return new UTXOCustomCompressionEngine();
      case CompressionAlgorithm.UTXO_DICTIONARY:
        return new DictionaryCompressionEngine();
      case CompressionAlgorithm.NONE:
        return this.createNullEngine();
      default:
        throw new Error(`Unsupported compression algorithm: ${algorithm}`);
    }
  }

  /**
   * Create compressed mesh protocol (placeholder for integration)
   */
  createCompressedMeshProtocol(meshConfig: any, compressionConfig: UTXOCompressionConfig): ICompressedMeshProtocol {
    // This would integrate with the existing EnhancedMeshProtocol
    // For now, return a placeholder
    throw new Error('CompressedMeshProtocol integration pending');
  }

  /**
   * Create dictionary manager
   */
  createDictionaryManager(): IDictionaryManager {
    return new DictionaryCompressionEngine();
  }

  /**
   * Create security manager (placeholder)
   */
  createSecurityManager(): ICompressionSecurityManager {
    throw new Error('CompressionSecurityManager implementation pending');
  }

  /**
   * Create streaming compression (placeholder)
   */
  createStreamingCompression(): IStreamingCompression {
    throw new Error('StreamingCompression implementation pending');
  }

  /**
   * Create adaptive selector (placeholder)
   */
  createAdaptiveSelector(): IAdaptiveCompressionSelector {
    throw new Error('AdaptiveCompressionSelector implementation pending');
  }

  /**
   * Detect best algorithm for given samples
   */
  detectBestAlgorithm(samples: Uint8Array[]): CompressionAlgorithm {
    const benchmarkResults = this.benchmarkAlgorithms(samples);
    
    let bestAlgorithm: CompressionAlgorithm = 'protobuf';
    let bestScore = 0;
    
    for (const [algorithm, metrics] of benchmarkResults) {
      // Score based on compression ratio and speed
      const score = (1 - metrics.averageCompressionRatio) * 0.7 + 
                   (metrics.compressionThroughput / (4 * 1024 * 1024)) * 0.3; // Normalize to 4MB/s
      
      if (score > bestScore) {
        bestScore = score;
        bestAlgorithm = algorithm;
      }
    }
    
    return bestAlgorithm;
  }

  /**
   * Create dictionary from UTXO samples
   */
  createDictionaryFromUTXOSamples(samples: any[], id: string): CompressionDictionary {
    const dictionaryManager = this.createDictionaryManager();
    return dictionaryManager.createUTXODictionary(samples, id);
  }

  /**
   * Benchmark compression algorithms
   */
  benchmarkAlgorithms(testData: Uint8Array[]): Map<CompressionAlgorithm, PerformanceMetrics> {
    const results = new Map<CompressionAlgorithm, PerformanceMetrics>();
    
    const algorithms = [
      CompressionAlgorithm.PROTOBUF,
      CompressionAlgorithm.GZIP,
      CompressionAlgorithm.LZ4,
      CompressionAlgorithm.UTXO_CUSTOM
    ];
    
    for (const algorithm of algorithms) {
      try {
        const engine = this.createCompressionEngine(algorithm);
        const metrics = this.benchmarkEngine(engine, testData);
        results.set(algorithm, metrics);
      } catch (error) {
        // Skip algorithms that fail to initialize
        console.warn(`Failed to benchmark ${algorithm}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Create configuration builder
   */
  static createConfigBuilder(): CompressionConfigBuilder {
    return new CompressionConfigBuilder();
  }

  /**
   * Create optimized configuration for specific use cases
   */
  static createMobileConfig(): UTXOCompressionConfig {
    return new CompressionConfigBuilder()
      .algorithm(CompressionAlgorithm.LZ4) // Fast compression for mobile
      .level(CompressionLevel.FAST)
      .memoryLimit(256 * 1024) // 256KB for mobile constraints
      .enableDictionary(false) // Disable for memory savings
      .enableUTXOOptimization(true)
      .enableDutyCycleIntegration(true)
      .enableSecurity(false) // Reduce overhead
      .build();
  }

  static createNodeConfig(): UTXOCompressionConfig {
    return new CompressionConfigBuilder()
      .algorithm(CompressionAlgorithm.UTXO_CUSTOM) // Best compression for nodes
      .level(CompressionLevel.MAXIMUM)
      .memoryLimit(4 * 1024 * 1024) // 4MB for full nodes
      .enableDictionary(true)
      .enableUTXOOptimization(true)
      .enableDutyCycleIntegration(true)
      .enableSecurity(true)
      .build();
  }

  static createLoRaOptimizedConfig(region: string = 'EU'): UTXOCompressionConfig {
    return new CompressionConfigBuilder()
      .algorithm(CompressionAlgorithm.PROTOBUF) // Good balance for LoRa
      .level(CompressionLevel.BALANCED)
      .memoryLimit(512 * 1024) // 512KB for LoRa devices
      .enableDictionary(true)
      .enableUTXOOptimization(true)
      .enableDutyCycleIntegration(true)
      .regionalCompliance(region)
      .enableSecurity(true)
      .build();
  }

  // Private helper methods

  private registerAllEngines(manager: ICompressionManager): void {
    const algorithms = [
      CompressionAlgorithm.PROTOBUF,
      CompressionAlgorithm.GZIP,
      CompressionAlgorithm.LZ4,
      CompressionAlgorithm.UTXO_CUSTOM,
      CompressionAlgorithm.UTXO_DICTIONARY
    ];

    for (const algorithm of algorithms) {
      try {
        const engine = this.createCompressionEngine(algorithm);
        manager.registerAlgorithm(algorithm, engine);
      } catch (error) {
        console.warn(`Failed to register engine ${algorithm}:`, error);
      }
    }
  }

  private createNullEngine(): ICompressionEngine {
    return {
      compress: (data: Uint8Array) => ({
        algorithm: CompressionAlgorithm.NONE,
        data,
        originalSize: data.length,
        metadata: { version: 1, algorithm: CompressionAlgorithm.NONE },
        timestamp: Date.now()
      }),
      decompress: (compressedData) => compressedData.data,
      getAlgorithmName: () => CompressionAlgorithm.NONE,
      getSupportedTypes: () => Object.values(MessageType),
      getCompressionLevel: () => CompressionLevel.FAST,
      getExpectedRatio: () => 1.0,
      getCompressionSpeed: () => Number.MAX_SAFE_INTEGER,
      getDecompressionSpeed: () => Number.MAX_SAFE_INTEGER,
      configure: () => {},
      getConfiguration: () => ({}),
      optimizeForUTXO: () => {},
      supportsDutyCyclePlanning: () => true
    };
  }

  private benchmarkEngine(engine: ICompressionEngine, testData: Uint8Array[]): PerformanceMetrics {
    let totalCompressionTime = 0;
    let totalDecompressionTime = 0;
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let errors = 0;
    
    const startTime = performance.now();
    
    for (const data of testData) {
      try {
        // Compression benchmark
        const compressStart = performance.now();
        const compressed = engine.compress(data);
        const compressTime = performance.now() - compressStart;
        
        totalCompressionTime += compressTime;
        totalBytesIn += data.length;
        totalBytesOut += compressed.data.length;
        
        // Decompression benchmark
        const decompressStart = performance.now();
        const decompressed = engine.decompress(compressed);
        const decompressTime = performance.now() - decompressStart;
        
        totalDecompressionTime += decompressTime;
        
        // Verify integrity
        if (decompressed.length !== data.length) {
          errors++;
        }
        
      } catch (error) {
        errors++;
      }
    }
    
    const totalTime = performance.now() - startTime;
    const testCount = testData.length;
    
    return {
      compressionThroughput: totalBytesIn / (totalCompressionTime / 1000), // bytes per second
      decompressionThroughput: totalBytesIn / (totalDecompressionTime / 1000),
      averageLatency: totalTime / testCount,
      memoryEfficiency: 90, // Placeholder
      errorRate: (errors / testCount) * 100,
      averageCompressionRatio: totalBytesOut / totalBytesIn
    };
  }
}

// Convenience exports for easy usage
export const createCompressionManager = (config: UTXOCompressionConfig) => 
  CompressionFactory.getInstance().createCompressionManager(config);

export const createMobileCompressionManager = () => 
  CompressionFactory.getInstance().createCompressionManager(
    CompressionFactory.createMobileConfig()
  );

export const createNodeCompressionManager = () => 
  CompressionFactory.getInstance().createCompressionManager(
    CompressionFactory.createNodeConfig()
  );

export const createLoRaCompressionManager = (region: string = 'EU') => 
  CompressionFactory.getInstance().createCompressionManager(
    CompressionFactory.createLoRaOptimizedConfig(region)
  );

// Export the factory instance
export const CompressionFactory = CompressionFactoryImpl;