/**
 * UTXO Compression Manager
 * 
 * Core compression manager for UTXO-based Lorachain network
 * Implements comprehensive compression with duty cycle awareness and regional compliance
 * 
 * BREAKING CHANGE: UTXO-only support, no backwards compatibility
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type {
  ICompressionManager,
  ICompressionEngine,
  ICompressionEventEmitter
} from './compression-interfaces.js';
import {
  CompressionAlgorithm,
  CompressionLevel,
  MessageType,
  CompressionErrorCode,
  type CompressedData,
  type CompressionOptions,
  type UTXOCompressionConfig,
  type CompressionStats,
  type CompressionDictionary,
  type UTXOContext,
  type UTXOPatterns,
  type DutyCycleConstraints,
  type DutyCycleEfficiency,
  type PerformanceConstraints,
  type CompressionResult,
  type DecompressionResult,
  type CompressionError,
  type PerformanceMetrics,
  type AlgorithmStats,
  type DataPatterns,
  type CompressionMetadata
} from './compression-types.js';

// LRU Cache implementation for algorithm selection
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Core UTXO Compression Manager
 * Implements comprehensive compression system with UTXO optimizations
 */
export class UTXOCompressionManager extends EventEmitter implements ICompressionManager, ICompressionEventEmitter {
  private config: UTXOCompressionConfig;
  private stats: CompressionStats;
  private engines: Map<CompressionAlgorithm, ICompressionEngine>;
  private dictionaries: Map<string, CompressionDictionary>;
  private algorithmCache: LRUCache<string, CompressionAlgorithm>;
  private performanceHistory: CompressionResult[];
  private utxoPatterns: UTXOPatterns | null = null;
  
  // External dependencies for UTXO and duty cycle integration
  private dutyCycleManager?: any;
  private utxoManager?: any;
  private regionalValidator?: any;

  constructor(
    config: UTXOCompressionConfig,
    dutyCycleManager?: any,
    utxoManager?: any,
    regionalValidator?: any
  ) {
    super();
    this.config = config;
    this.dutyCycleManager = dutyCycleManager;
    this.utxoManager = utxoManager;
    this.regionalValidator = regionalValidator;
    
    this.stats = this.initializeStats();
    this.engines = new Map();
    this.dictionaries = new Map();
    this.algorithmCache = new LRUCache(500); // Reduced cache size for resource constraints
    this.performanceHistory = [];
    
    this.validateConfig();
    this.initializeDefaultEngines();
  }

  /**
   * Core compression operation with UTXO optimizations
   */
  compress(data: Uint8Array, type?: MessageType, options?: CompressionOptions): CompressedData {
    const startTime = performance.now();
    
    try {
      // Validate input
      if (!data || data.length === 0) {
        throw new Error('Cannot compress empty data');
      }

      // Check compression threshold
      if (data.length < this.config.compressionThreshold) {
        return this.createUncompressedResult(data, type);
      }

      // Select optimal algorithm
      const algorithm = options?.algorithm || this.selectOptimalAlgorithm(data, type);
      const engine = this.engines.get(algorithm);
      
      if (!engine) {
        throw new Error(`Compression engine not found for algorithm: ${algorithm}`);
      }

      // Check duty cycle constraints if integrated
      if (this.config.dutyCycleIntegration && this.dutyCycleManager) {
        const constraints = this.dutyCycleManager.getCurrentConstraints();
        if (!this.canCompressWithinDutyCycle(constraints, data.length)) {
          // Fall back to faster algorithm
          const fallbackAlgorithm = this.selectFastAlgorithm(data, type);
          const fallbackEngine = this.engines.get(fallbackAlgorithm);
          if (fallbackEngine) {
            return this.performCompression(fallbackEngine, data, type, options, startTime);
          }
        }
      }

      return this.performCompression(engine, data, type, options, startTime);

    } catch (error) {
      const compressionError: CompressionError = {
        code: CompressionErrorCode.COMPRESSION_FAILED,
        message: error instanceof Error ? error.message : String(error),
        originalSize: data.length,
        timestamp: Date.now()
      };
      
      this.stats.errorCount++;
      this.emit('compression_error', compressionError);
      
      // Return uncompressed data on error
      return this.createUncompressedResult(data, type, compressionError.message);
    }
  }

  /**
   * Core decompression operation with integrity verification
   */
  decompress(compressedData: CompressedData): Uint8Array {
    const startTime = performance.now();
    
    try {
      // Validate compressed data
      this.validateCompressedData(compressedData);

      // Get decompression engine
      const engine = this.engines.get(compressedData.algorithm);
      if (!engine) {
        throw new Error(`Decompression engine not found for algorithm: ${compressedData.algorithm}`);
      }

      // Check expansion ratio for security
      const expansionRatio = compressedData.originalSize / compressedData.data.length;
      if (expansionRatio > (this.config.maxExpansionRatio || 100)) {
        throw new Error(`Expansion ratio ${expansionRatio} exceeds maximum allowed`);
      }

      // Perform decompression
      const decompressed = engine.decompress(compressedData);
      const decompressionTime = performance.now() - startTime;

      // Verify integrity
      if (decompressed.length !== compressedData.originalSize) {
        throw new Error(`Decompressed size mismatch: expected ${compressedData.originalSize}, got ${decompressed.length}`);
      }

      // Update statistics
      this.updateDecompressionStats(compressedData, decompressionTime);

      const result: DecompressionResult = {
        compressedSize: compressedData.data.length,
        decompressedSize: decompressed.length,
        algorithm: compressedData.algorithm,
        decompressionTime,
        integrityVerified: true,
        success: true
      };

      this.emit('decompression_completed', result);
      return decompressed;

    } catch (error) {
      const compressionError: CompressionError = {
        code: CompressionErrorCode.DECOMPRESSION_FAILED,
        message: error instanceof Error ? error.message : String(error),
        algorithm: compressedData.algorithm,
        timestamp: Date.now()
      };
      
      this.stats.errorCount++;
      this.emit('compression_error', compressionError);
      throw error;
    }
  }

  /**
   * Select optimal compression algorithm based on data characteristics and constraints
   */
  selectOptimalAlgorithm(data: Uint8Array, type?: MessageType, constraints?: PerformanceConstraints): CompressionAlgorithm {
    // Check cache first
    const cacheKey = `${data.length}_${type || 'unknown'}_${JSON.stringify(constraints)}`;
    const cached = this.algorithmCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fast path for small data
    if (data.length < this.config.compressionThreshold) {
      return CompressionAlgorithm.NONE;
    }

    // UTXO-specific optimizations
    if (this.config.utxoOptimization && this.utxoPatterns) {
      const utxoOptimal = this.selectUTXOOptimizedAlgorithm(data, type);
      if (utxoOptimal) {
        this.algorithmCache.set(cacheKey, utxoOptimal);
        return utxoOptimal;
      }
    }

    // Type-specific preferences
    if (type) {
      const typeOptimal = this.getAlgorithmForType(type);
      if (typeOptimal) {
        this.algorithmCache.set(cacheKey, typeOptimal);
        return typeOptimal;
      }
    }

    // Analyze data patterns
    const patterns = this.analyzeDataPatterns(data);
    const optimal = this.selectAlgorithmByPatterns(patterns, constraints);
    
    this.algorithmCache.set(cacheKey, optimal);
    return optimal;
  }

  /**
   * Register a compression engine for a specific algorithm
   */
  registerAlgorithm(algorithm: CompressionAlgorithm, engine: ICompressionEngine): void {
    this.engines.set(algorithm, engine);
    
    // Initialize algorithm stats
    if (!this.stats.algorithmUsage.has(algorithm)) {
      this.stats.algorithmUsage.set(algorithm, {
        compressions: 0,
        totalBytesIn: 0,
        totalBytesOut: 0,
        averageRatio: 0,
        averageTime: 0,
        errorCount: 0
      });
    }
  }

  /**
   * Create compression dictionary from UTXO samples
   */
  createDictionary(samples: Uint8Array[], id: string): CompressionDictionary {
    if (samples.length === 0) {
      throw new Error('Cannot create dictionary from empty samples');
    }

    const patterns = this.extractPatterns(samples);
    const frequency = this.calculateFrequency(patterns);
    const entries = this.selectBestEntries(frequency);

    const dictionary: CompressionDictionary = {
      id,
      version: 1,
      entries: new Map(entries.map((entry, index) => [entry, index])),
      reverseEntries: new Map(entries.map((entry, index) => [index, entry])),
      frequency,
      size: entries.length,
      compressionRatio: this.estimateDictionaryRatio(samples, entries),
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    this.dictionaries.set(id, dictionary);
    this.emit('dictionary_created', dictionary);
    
    return dictionary;
  }

  /**
   * Get compression dictionary by ID
   */
  getDictionary(id: string): CompressionDictionary | null {
    return this.dictionaries.get(id) || null;
  }

  /**
   * Update existing dictionary with new samples
   */
  updateDictionary(id: string, newSamples: Uint8Array[]): void {
    const dictionary = this.dictionaries.get(id);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${id}`);
    }

    const newPatterns = this.extractPatterns(newSamples);
    for (const pattern of newPatterns) {
      const currentFreq = dictionary.frequency.get(pattern) || 0;
      dictionary.frequency.set(pattern, currentFreq + 1);
    }

    // Rebuild entries based on updated frequency
    const entries = this.selectBestEntries(dictionary.frequency);
    dictionary.entries = new Map(entries.map((entry, index) => [entry, index]));
    dictionary.reverseEntries = new Map(entries.map((entry, index) => [index, entry]));
    dictionary.size = entries.length;
    dictionary.lastUpdated = Date.now();
    dictionary.version++;

    this.emit('dictionary_updated', id, {
      entriesAdded: entries.length - dictionary.size,
      entriesRemoved: 0,
      frequencyUpdates: newPatterns.length,
      sizeChange: 0,
      ratioImprovement: 0
    });
  }

  /**
   * Update compression configuration
   */
  updateConfig(config: Partial<UTXOCompressionConfig>): void {
    this.config = { ...this.config, ...config };
    this.validateConfig();
  }

  /**
   * Get current compression statistics
   */
  getCompressionStats(): CompressionStats {
    return { ...this.stats };
  }

  /**
   * Reset compression statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.performanceHistory = [];
  }

  /**
   * Optimize compression for UTXO patterns
   */
  optimizeForUTXOPatterns(patterns: UTXOPatterns): void {
    this.utxoPatterns = patterns;
    
    // Create or update UTXO-specific dictionary
    if (this.config.enableDictionary) {
      const samples = patterns.recentTransactions.map(tx => 
        new TextEncoder().encode(JSON.stringify(tx))
      );
      
      if (samples.length > 0) {
        const dictionaryId = `utxo_${this.config.regionalCompliance}`;
        
        if (this.dictionaries.has(dictionaryId)) {
          this.updateDictionary(dictionaryId, samples);
        } else {
          this.createDictionary(samples, dictionaryId);
        }
      }
    }
  }

  /**
   * Analyze duty cycle efficiency for regional compliance
   */
  analyzeDutyCycleEfficiency(): DutyCycleEfficiency {
    if (!this.config.dutyCycleIntegration || !this.dutyCycleManager) {
      return {
        region: this.config.regionalCompliance,
        averageCompressionRatio: this.stats.averageCompressionRatio,
        transmissionTimeSaved: 0,
        dutyCycleOptimization: 0,
        complianceLevel: 100
      };
    }

    const compressionSavings = this.calculateCompressionSavings();
    const dutyCycleOptimization = this.dutyCycleManager.getOptimizationLevel();
    
    return {
      region: this.config.regionalCompliance,
      averageCompressionRatio: this.stats.averageCompressionRatio,
      transmissionTimeSaved: compressionSavings.timeSaved,
      dutyCycleOptimization,
      complianceLevel: this.dutyCycleManager.getComplianceLevel()
    };
  }

  /**
   * Enable or disable adaptive compression
   */
  enableAdaptiveCompression(enable: boolean): void {
    this.config.enableAdaptive = enable;
    if (!enable) {
      this.algorithmCache.clear();
    }
  }

  /**
   * Benchmark compression algorithms with test data
   */
  benchmarkAlgorithms(testData: Uint8Array[]): Map<CompressionAlgorithm, PerformanceMetrics> {
    const results = new Map<CompressionAlgorithm, PerformanceMetrics>();
    
    for (const [algorithm, engine] of this.engines) {
      if (algorithm === CompressionAlgorithm.NONE) continue;
      
      const metrics = this.benchmarkAlgorithm(engine, testData);
      results.set(algorithm, metrics);
    }
    
    return results;
  }

  // Private helper methods

  private initializeStats(): CompressionStats {
    return {
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalCompressions: 0,
      totalDecompressions: 0,
      averageCompressionRatio: 0,
      averageCompressionTime: 0,
      averageDecompressionTime: 0,
      algorithmUsage: new Map(),
      errorCount: 0,
      lastUpdated: Date.now()
    };
  }

  private validateConfig(): void {
    if (this.config.maxCompressionMemory <= 0) {
      throw new Error('maxCompressionMemory must be positive');
    }
    
    if (this.config.compressionThreshold < 0) {
      throw new Error('compressionThreshold must be non-negative');
    }
    
    if (!Object.values(CompressionAlgorithm).includes(this.config.defaultAlgorithm)) {
      throw new Error(`Invalid default algorithm: ${this.config.defaultAlgorithm}`);
    }
  }

  private initializeDefaultEngines(): void {
    // Default engines will be registered by the factory
    // This is a placeholder for engine initialization
  }

  private createUncompressedResult(data: Uint8Array, type?: MessageType, error?: string): CompressedData {
    const metadata: CompressionMetadata = {
      version: 1,
      type,
      algorithm: CompressionAlgorithm.NONE,
      originalSize: data.length,
      compressedSize: data.length,
      compressionTime: 0
    };

    if (error) {
      metadata.error = error;
    }

    return {
      algorithm: CompressionAlgorithm.NONE,
      data,
      originalSize: data.length,
      metadata,
      timestamp: Date.now()
    };
  }

  private performCompression(
    engine: ICompressionEngine,
    data: Uint8Array,
    type?: MessageType,
    options?: CompressionOptions,
    startTime?: number
  ): CompressedData {
    const actualStartTime = startTime || performance.now();
    const compressed = engine.compress(data, options);
    const compressionTime = performance.now() - actualStartTime;

    // Update metadata
    compressed.metadata.compressionTime = compressionTime;
    compressed.metadata.type = type;

    // Update statistics
    this.updateCompressionStats(compressed, compressionTime);

    const result: CompressionResult = {
      originalSize: data.length,
      compressedSize: compressed.data.length,
      compressionRatio: compressed.data.length / data.length,
      algorithm: compressed.algorithm,
      compressionTime,
      success: true
    };

    this.recordPerformance(result);
    this.emit('compression_completed', result);

    return compressed;
  }

  private validateCompressedData(compressedData: CompressedData): void {
    if (!compressedData.data || compressedData.data.length === 0) {
      throw new Error('Invalid compressed data: empty data');
    }
    
    if (compressedData.originalSize <= 0) {
      throw new Error('Invalid compressed data: invalid original size');
    }
    
    if (!Object.values(CompressionAlgorithm).includes(compressedData.algorithm)) {
      throw new Error(`Invalid compression algorithm: ${compressedData.algorithm}`);
    }
  }

  private updateCompressionStats(compressed: CompressedData, compressionTime: number): void {
    this.stats.totalBytesIn += compressed.originalSize;
    this.stats.totalBytesOut += compressed.data.length;
    this.stats.totalCompressions++;
    
    // Update average compression ratio
    this.stats.averageCompressionRatio = this.stats.totalBytesOut / this.stats.totalBytesIn;
    
    // Update average compression time
    this.stats.averageCompressionTime = 
      (this.stats.averageCompressionTime * (this.stats.totalCompressions - 1) + compressionTime) / 
      this.stats.totalCompressions;

    // Update algorithm-specific stats
    const algorithmStats = this.stats.algorithmUsage.get(compressed.algorithm);
    if (algorithmStats) {
      algorithmStats.compressions++;
      algorithmStats.totalBytesIn += compressed.originalSize;
      algorithmStats.totalBytesOut += compressed.data.length;
      algorithmStats.averageRatio = algorithmStats.totalBytesOut / algorithmStats.totalBytesIn;
      algorithmStats.averageTime = 
        (algorithmStats.averageTime * (algorithmStats.compressions - 1) + compressionTime) / 
        algorithmStats.compressions;
    }

    this.stats.lastUpdated = Date.now();
    this.emit('stats_updated', this.stats);
  }

  private updateDecompressionStats(compressedData: CompressedData, decompressionTime: number): void {
    this.stats.totalDecompressions++;
    
    // Update average decompression time
    this.stats.averageDecompressionTime = 
      (this.stats.averageDecompressionTime * (this.stats.totalDecompressions - 1) + decompressionTime) / 
      this.stats.totalDecompressions;

    this.stats.lastUpdated = Date.now();
  }

  private recordPerformance(result: CompressionResult): void {
    this.performanceHistory.push(result);
    
    // Keep only recent history (limit memory usage)
    const maxHistory = 1000;
    if (this.performanceHistory.length > maxHistory) {
      this.performanceHistory = this.performanceHistory.slice(-maxHistory);
    }
  }

  private analyzeDataPatterns(data: Uint8Array): DataPatterns {
    const entropy = this.calculateEntropy(data);
    const repetition = this.calculateRepetitionRatio(data);
    
    let structure: DataPatterns['structure'] = 'binary';
    
    // Simple structure detection
    try {
      const text = new TextDecoder().decode(data);
      if (text.includes('{') && text.includes('}')) {
        structure = 'structured';
      } else if (/^[a-zA-Z0-9\s\.,!?]+$/.test(text)) {
        structure = 'text';
      }
    } catch {
      // Keep binary if decoding fails
    }
    
    if (entropy > 7.5) {
      structure = 'random';
    }

    return { entropy, repetition, structure };
  }

  private calculateEntropy(data: Uint8Array): number {
    const frequency = new Map<number, number>();
    
    for (const byte of data) {
      frequency.set(byte, (frequency.get(byte) || 0) + 1);
    }
    
    let entropy = 0;
    const length = data.length;
    
    for (const count of frequency.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  }

  private calculateRepetitionRatio(data: Uint8Array): number {
    if (data.length < 2) return 0;
    
    let repetitions = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i] === data[i - 1]) {
        repetitions++;
      }
    }
    
    return repetitions / (data.length - 1);
  }

  private selectAlgorithmByPatterns(patterns: DataPatterns, constraints?: PerformanceConstraints): CompressionAlgorithm {
    // Battery optimization for mobile devices
    if (constraints?.batteryOptimized) {
      return CompressionAlgorithm.LZ4; // Fast, low CPU usage
    }
    
    // High entropy data (random/encrypted)
    if (patterns.entropy > 7.5) {
      return CompressionAlgorithm.NONE; // Don't waste CPU on uncompressible data
    }
    
    // High repetition data
    if (patterns.repetition > 0.3) {
      return CompressionAlgorithm.LZ4; // Good for repetitive data
    }
    
    // Structured data (JSON, etc.)
    if (patterns.structure === 'structured') {
      return CompressionAlgorithm.GZIP; // Good for structured text
    }
    
    // Default to configured algorithm
    return this.config.defaultAlgorithm;
  }

  private selectUTXOOptimizedAlgorithm(data: Uint8Array, type?: MessageType): CompressionAlgorithm | null {
    if (!this.utxoPatterns) return null;
    
    // UTXO transactions with many common addresses
    if (type === MessageType.UTXO_TRANSACTION && this.utxoPatterns.commonAddresses.length > 10) {
      return CompressionAlgorithm.UTXO_DICTIONARY;
    }
    
    // Large UTXO blocks
    if (type === MessageType.UTXO_BLOCK && data.length > 10000) {
      return CompressionAlgorithm.UTXO_CUSTOM;
    }
    
    return null;
  }

  private getAlgorithmForType(type: MessageType): CompressionAlgorithm | null {
    if (this.config.algorithmPreferences?.has(type)) {
      return this.config.algorithmPreferences.get(type)!;
    }
    
    // Default type preferences
    switch (type) {
      case MessageType.UTXO_TRANSACTION:
        return CompressionAlgorithm.PROTOBUF;
      case MessageType.UTXO_BLOCK:
        return CompressionAlgorithm.UTXO_CUSTOM;
      case MessageType.BLOCKCHAIN_SYNC:
        return CompressionAlgorithm.GZIP;
      default:
        return null;
    }
  }

  private selectFastAlgorithm(data: Uint8Array, type?: MessageType): CompressionAlgorithm {
    return CompressionAlgorithm.LZ4; // Always use LZ4 for fast compression
  }

  private canCompressWithinDutyCycle(constraints: DutyCycleConstraints, dataSize: number): boolean {
    if (!constraints) return true;
    
    // Estimate compression time based on data size and algorithm performance
    const estimatedTime = this.estimateCompressionTime(dataSize);
    return estimatedTime <= constraints.remainingWindow;
  }

  private estimateCompressionTime(dataSize: number): number {
    // Simple estimation: 1MB/s compression speed
    return dataSize / (1024 * 1024) * 1000; // milliseconds
  }

  private calculateCompressionSavings(): { timeSaved: number; bytesSaved: number } {
    const totalBytesSaved = this.stats.totalBytesIn - this.stats.totalBytesOut;
    
    // Estimate transmission time savings (assuming 1KB/s transmission rate for LoRa)
    const timeSaved = totalBytesSaved / 1024; // seconds
    
    return { timeSaved, bytesSaved: totalBytesSaved };
  }

  private benchmarkAlgorithm(engine: ICompressionEngine, testData: Uint8Array[]): PerformanceMetrics {
    let totalCompressionTime = 0;
    let totalDecompressionTime = 0;
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let errors = 0;

    for (const data of testData) {
      try {
        // Compression benchmark
        const startCompress = performance.now();
        const compressed = engine.compress(data);
        const compressionTime = performance.now() - startCompress;
        
        totalCompressionTime += compressionTime;
        totalBytesIn += data.length;
        totalBytesOut += compressed.data.length;
        
        // Decompression benchmark
        const startDecompress = performance.now();
        engine.decompress(compressed);
        const decompressionTime = performance.now() - startDecompress;
        
        totalDecompressionTime += decompressionTime;
        
      } catch {
        errors++;
      }
    }

    const testCount = testData.length;
    
    return {
      compressionThroughput: totalBytesIn / (totalCompressionTime / 1000), // bytes per second
      decompressionThroughput: totalBytesIn / (totalDecompressionTime / 1000), // bytes per second
      averageLatency: (totalCompressionTime + totalDecompressionTime) / testCount,
      memoryEfficiency: 100, // Placeholder
      errorRate: (errors / testCount) * 100,
      averageCompressionRatio: totalBytesOut / totalBytesIn
    };
  }

  private extractPatterns(samples: Uint8Array[]): string[] {
    const patterns = new Set<string>();
    
    for (const sample of samples) {
      try {
        const text = new TextDecoder().decode(sample);
        
        // Extract n-grams of various lengths
        for (let len = 2; len <= 8; len++) {
          for (let i = 0; i <= text.length - len; i++) {
            patterns.add(text.substr(i, len));
          }
        }
      } catch {
        // Skip binary data that can't be decoded
      }
    }
    
    return Array.from(patterns);
  }

  private calculateFrequency(patterns: string[]): Map<string, number> {
    const frequency = new Map<string, number>();
    
    for (const pattern of patterns) {
      frequency.set(pattern, (frequency.get(pattern) || 0) + 1);
    }
    
    return frequency;
  }

  private selectBestEntries(frequency: Map<string, number>): string[] {
    const maxEntries = 1000; // Limit dictionary size for memory constraints
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, maxEntries)
      .map(([pattern]) => pattern);
  }

  private estimateDictionaryRatio(samples: Uint8Array[], entries: string[]): number {
    // Simple estimation of compression ratio with dictionary
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    
    for (const sample of samples) {
      totalOriginalSize += sample.length;
      totalCompressedSize += sample.length * 0.7; // Estimate 30% compression
    }
    
    return totalCompressedSize / totalOriginalSize;
  }
}