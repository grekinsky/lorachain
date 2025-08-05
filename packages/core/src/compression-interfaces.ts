/**
 * Compression Interfaces for UTXO-Based Lorachain Network
 * 
 * This module defines the core interfaces for the compression system
 * following the specification requirements for UTXO-only support.
 */

import type {
  CompressionAlgorithm,
  CompressionLevel,
  CompressionPriority,
  MessageType,
  CompressedData,
  CompressionOptions,
  UTXOCompressionConfig,
  CompressionStats,
  CompressionDictionary,
  UTXOContext,
  UTXOPatterns,
  DutyCycleConstraints,
  DutyCycleEfficiency,
  PerformanceConstraints,
  CompressionResult,
  DecompressionResult,
  CompressionError,
  PerformanceMetrics,
  AlgorithmSelectionData,
  DictionaryChanges,
  MemoryUsage
} from './compression-types.js';

// Core compression manager interface
export interface ICompressionManager {
  // Core compression operations
  compress(data: Uint8Array, type?: MessageType, options?: CompressionOptions): CompressedData;
  decompress(compressedData: CompressedData): Uint8Array;
  
  // Algorithm management
  selectOptimalAlgorithm(data: Uint8Array, type?: MessageType, constraints?: PerformanceConstraints): CompressionAlgorithm;
  registerAlgorithm(algorithm: CompressionAlgorithm, engine: ICompressionEngine): void;
  
  // Dictionary management
  createDictionary(samples: Uint8Array[], id: string): CompressionDictionary;
  getDictionary(id: string): CompressionDictionary | null;
  updateDictionary(id: string, newSamples: Uint8Array[]): void;
  
  // Configuration and monitoring
  updateConfig(config: Partial<UTXOCompressionConfig>): void;
  getCompressionStats(): CompressionStats;
  resetStats(): void;
  
  // UTXO-specific optimizations
  optimizeForUTXOPatterns(patterns: UTXOPatterns): void;
  analyzeDutyCycleEfficiency(): DutyCycleEfficiency;
  
  // Adaptive compression
  enableAdaptiveCompression(enable: boolean): void;
  benchmarkAlgorithms(testData: Uint8Array[]): Map<CompressionAlgorithm, PerformanceMetrics>;
}

// Compression engine interface for different algorithms
export interface ICompressionEngine {
  // Basic operations
  compress(data: Uint8Array, options?: CompressionOptions): CompressedData;
  decompress(compressedData: CompressedData): Uint8Array;
  
  // Algorithm information
  getAlgorithmName(): CompressionAlgorithm;
  getSupportedTypes(): MessageType[];
  getCompressionLevel(): CompressionLevel;
  
  // Performance characteristics
  getExpectedRatio(dataSize: number, type?: MessageType): number;
  getCompressionSpeed(): number; // bytes per second
  getDecompressionSpeed(): number; // bytes per second
  
  // Configuration
  configure(options: ICompressionEngineOptions): void;
  getConfiguration(): ICompressionEngineOptions;
  
  // UTXO-specific optimizations
  optimizeForUTXO(context: UTXOContext): void;
  supportsDutyCyclePlanning(): boolean;
}

// Configuration options for compression engines
export interface ICompressionEngineOptions {
  level?: CompressionLevel;
  dictionaryId?: string;
  enablePadding?: boolean;
  memoryLimit?: number;
  timeout?: number;
  utxoOptimizations?: boolean;
}

// Enhanced mesh protocol interface with compression support
export interface ICompressedMeshProtocol {
  // Compressed messaging
  sendCompressedMessage(message: any, options?: CompressionOptions): Promise<boolean>;
  
  // Compression configuration
  setCompressionConfig(config: UTXOCompressionConfig): void;
  getCompressionConfig(): UTXOCompressionConfig;
  
  // Statistics and monitoring
  getCompressionStats(): CompressionStats;
  getCompressionEfficiency(): DutyCycleEfficiency;
  
  // Dictionary management
  shareDictionary(dictionaryId: string, nodes: string[]): Promise<boolean>;
  requestDictionary(dictionaryId: string, fromNode: string): Promise<CompressionDictionary | null>;
  
  // UTXO-specific mesh operations
  sendUTXOTransaction(transaction: any, compression?: CompressionOptions): Promise<boolean>;
  sendUTXOBlock(block: any, compression?: CompressionOptions): Promise<boolean>;
  
  // Events
  on(event: 'compression_stats_updated', listener: (stats: CompressionStats) => void): void;
  on(event: 'compression_error', listener: (error: CompressionError) => void): void;
  on(event: 'dictionary_updated', listener: (dictionaryId: string) => void): void;
  on(event: 'duty_cycle_optimized', listener: (efficiency: DutyCycleEfficiency) => void): void;
}

// Protocol Buffer serialization interface
export interface IProtobufSerializer {
  // UTXO transaction serialization
  serializeUTXOTransaction(transaction: any): Uint8Array;
  deserializeUTXOTransaction(data: Uint8Array): any;
  
  // UTXO block serialization
  serializeUTXOBlock(block: any): Uint8Array;
  deserializeUTXOBlock(data: Uint8Array): any;
  
  // Mesh message serialization
  serializeUTXOMeshMessage(message: any): Uint8Array;
  deserializeUTXOMeshMessage(data: Uint8Array): any;
  
  // Schema management
  getSchemaVersion(): number;
  isCompatible(data: Uint8Array): boolean;
  validateUTXOData(data: any): boolean;
}

// Dictionary manager interface
export interface IDictionaryManager {
  // Dictionary lifecycle
  createDictionary(samples: Uint8Array[], id: string): CompressionDictionary;
  updateDictionary(id: string, newSamples: Uint8Array[]): void;
  deleteDictionary(id: string): boolean;
  
  // Dictionary operations
  compress(data: Uint8Array, dictionaryId: string): Uint8Array;
  decompress(data: Uint8Array, dictionaryId: string): Uint8Array;
  
  // Dictionary management
  getDictionary(id: string): CompressionDictionary | null;
  listDictionaries(): string[];
  getDictionaryStats(id: string): any;
  
  // UTXO-specific dictionary operations
  createUTXODictionary(utxoSamples: any[], id: string): CompressionDictionary;
  optimizeDictionaryForRegion(id: string, region: string): void;
  
  // Persistence
  saveDictionary(dictionary: CompressionDictionary): Promise<void>;
  loadDictionary(id: string): Promise<CompressionDictionary | null>;
}

// Security manager interface for compression
export interface ICompressionSecurityManager {
  // Integrity verification
  verifyIntegrity(compressedData: CompressedData): boolean;
  addIntegrityCheck(data: Uint8Array): Uint8Array;
  
  // Attack prevention
  validateExpansionRatio(compressedData: CompressedData): boolean;
  addRandomPadding(data: Uint8Array): Uint8Array;
  removePadding(data: Uint8Array): Uint8Array;
  
  // Dictionary security
  signDictionary(dictionary: CompressionDictionary, privateKey: Uint8Array): CompressionDictionary;
  verifyDictionarySignature(dictionary: CompressionDictionary, publicKey: Uint8Array): boolean;
  
  // Memory protection
  enforceMemoryLimits(operation: 'compression' | 'decompression', size: number): boolean;
  detectCompressionBomb(compressedData: CompressedData): boolean;
}

// Streaming compression interface for large data
export interface IStreamingCompression {
  // Stream creation
  createCompressionStream(algorithm: CompressionAlgorithm): ICompressionStream;
  createDecompressionStream(algorithm: CompressionAlgorithm): ICompressionStream;
  
  // Streaming operations
  compressStream(input: ReadableStream<Uint8Array>, algorithm: CompressionAlgorithm): Promise<ReadableStream<Uint8Array>>;
  decompressStream(input: ReadableStream<Uint8Array>, algorithm: CompressionAlgorithm): Promise<ReadableStream<Uint8Array>>;
  
  // Memory management
  setStreamBufferSize(size: number): void;
  getStreamStats(): any;
}

// Compression stream interface
export interface ICompressionStream {
  write(chunk: Uint8Array): void;
  end(): void;
  on(event: 'data', callback: (chunk: Uint8Array) => void): void;
  on(event: 'end', callback: () => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
}

// Adaptive compression selector interface
export interface IAdaptiveCompressionSelector {
  // Algorithm selection
  selectAlgorithm(data: Uint8Array, type?: MessageType, constraints?: PerformanceConstraints): CompressionAlgorithm;
  
  // Learning and optimization
  recordPerformance(result: CompressionResult): void;
  updateAlgorithmPreferences(preferences: Map<MessageType, CompressionAlgorithm[]>): void;
  
  // Analysis
  analyzeDataPatterns(data: Uint8Array): any;
  predictCompressionRatio(data: Uint8Array, algorithm: CompressionAlgorithm): number;
  
  // UTXO-specific optimizations
  optimizeForUTXOWorkload(samples: any[]): void;
  getDutyCycleOptimizedAlgorithm(constraints: DutyCycleConstraints): CompressionAlgorithm;
}

// Factory interface for creating compression components
export interface ICompressionFactory {
  // Manager creation
  createCompressionManager(config: UTXOCompressionConfig): ICompressionManager;
  createCompressionEngine(algorithm: CompressionAlgorithm): ICompressionEngine;
  createCompressedMeshProtocol(meshConfig: any, compressionConfig: UTXOCompressionConfig): ICompressedMeshProtocol;
  
  // Specialized components
  createDictionaryManager(): IDictionaryManager;
  createSecurityManager(): ICompressionSecurityManager;
  createStreamingCompression(): IStreamingCompression;
  createAdaptiveSelector(): IAdaptiveCompressionSelector;
  
  // Utility methods
  detectBestAlgorithm(samples: Uint8Array[]): CompressionAlgorithm;
  createDictionaryFromUTXOSamples(samples: any[], id: string): CompressionDictionary;
  benchmarkAlgorithms(testData: Uint8Array[]): Map<CompressionAlgorithm, PerformanceMetrics>;
}

// Event emitter interface for compression events
export interface ICompressionEventEmitter {
  on(event: 'compression_completed', listener: (result: CompressionResult) => void): void;
  on(event: 'decompression_completed', listener: (result: DecompressionResult) => void): void;
  on(event: 'compression_error', listener: (error: CompressionError) => void): void;
  on(event: 'algorithm_selected', listener: (data: AlgorithmSelectionData) => void): void;
  on(event: 'dictionary_created', listener: (dictionary: CompressionDictionary) => void): void;
  on(event: 'dictionary_updated', listener: (dictionaryId: string, changes: DictionaryChanges) => void): void;
  on(event: 'stats_updated', listener: (stats: CompressionStats) => void): void;
  on(event: 'memory_warning', listener: (usage: MemoryUsage) => void): void;
  on(event: 'performance_warning', listener: (metrics: PerformanceMetrics) => void): void;
  on(event: 'duty_cycle_optimized', listener: (efficiency: DutyCycleEfficiency) => void): void;
}

// Configuration builder interface for fluent API
export interface ICompressionConfigBuilder {
  algorithm(algorithm: CompressionAlgorithm): ICompressionConfigBuilder;
  level(level: CompressionLevel): ICompressionConfigBuilder;
  enableDictionary(enable: boolean): ICompressionConfigBuilder;
  memoryLimit(bytes: number): ICompressionConfigBuilder;
  enableUTXOOptimization(enable: boolean): ICompressionConfigBuilder;
  enableDutyCycleIntegration(enable: boolean): ICompressionConfigBuilder;
  regionalCompliance(region: string): ICompressionConfigBuilder;
  enableSecurity(enabled: boolean): ICompressionConfigBuilder;
  build(): UTXOCompressionConfig;
}