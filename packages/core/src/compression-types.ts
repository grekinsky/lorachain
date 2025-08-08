/**
 * Compression Types and Interfaces for UTXO-Based Lorachain Network
 *
 * This module defines all types and interfaces for the compression system
 * following the "NO BACKWARDS COMPATIBILITY" policy - UTXO-only support.
 */

import type { UTXOTransaction, UTXO } from './types.js';

// Compression algorithms supported by the system
export const CompressionAlgorithm = {
  NONE: 'none',
  PROTOBUF: 'protobuf',
  GZIP: 'gzip',
  LZ4: 'lz4',
  UTXO_CUSTOM: 'utxo_custom', // UTXO-specific compression (breaking change)
  UTXO_DICTIONARY: 'utxo_dictionary', // UTXO dictionary compression (breaking change)
} as const;

export type CompressionAlgorithm =
  (typeof CompressionAlgorithm)[keyof typeof CompressionAlgorithm];

// Compression levels for different use cases
export const CompressionLevel = {
  FAST: 'fast', // Low CPU usage, good for mobile/battery constrained
  BALANCED: 'balanced', // Balanced performance and compression ratio
  MAXIMUM: 'maximum', // Maximum compression, higher CPU usage
} as const;

export type CompressionLevel =
  (typeof CompressionLevel)[keyof typeof CompressionLevel];

// Compression priority for message handling
export const CompressionPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type CompressionPriority =
  (typeof CompressionPriority)[keyof typeof CompressionPriority];

// Message types for mesh network (UTXO-only)
export const MessageType = {
  UTXO_TRANSACTION: 'utxo_transaction',
  UTXO_BLOCK: 'utxo_block',
  BLOCKCHAIN_SYNC: 'blockchain_sync',
  NODE_DISCOVERY: 'node_discovery',
  ROUTE_REQUEST: 'route_request',
  ROUTE_REPLY: 'route_reply',
  ROUTE_ERROR: 'route_error',
  HELLO: 'hello',
  FRAGMENT: 'fragment',
  FRAGMENT_ACK: 'fragment_ack',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

// Compression metadata for integrity and performance tracking
export interface CompressionMetadata {
  version: number;
  type?: MessageType;
  dictionaryId?: string;
  compressionLevel?: CompressionLevel;
  customFlags?: number;
  algorithm?: CompressionAlgorithm;
  originalSize?: number;
  compressedSize?: number;
  compressionTime?: number;
  [key: string]: any;
}

// Compressed data container
export interface CompressedData {
  algorithm: CompressionAlgorithm;
  data: Uint8Array;
  originalSize: number;
  metadata: CompressionMetadata;
  checksum?: Uint8Array;
  timestamp?: number;
}

// Compression options for fine-tuning
export interface CompressionOptions {
  algorithm?: CompressionAlgorithm;
  level?: CompressionLevel;
  dictionaryId?: string;
  enablePadding?: boolean;
  priority?: CompressionPriority;
  timeout?: number;
  enableIntegrityCheck?: boolean;
}

// Configuration for the compression manager
export interface UTXOCompressionConfig {
  defaultAlgorithm: CompressionAlgorithm;
  algorithmPreferences?: Map<MessageType, CompressionAlgorithm>;
  compressionLevel: CompressionLevel;
  enableDictionary: boolean;
  maxCompressionMemory: number; // Reduced to 512KB for LoRa devices
  enableAdaptive: boolean;
  compressionThreshold: number; // Minimum size to compress
  dutyCycleIntegration: boolean; // Integration with DutyCycleManager
  utxoOptimization: boolean; // UTXO-specific optimizations
  regionalCompliance: string; // EU/US/Japan/Australia from RegionalComplianceValidator
  maxDictionaries?: number;
  dictionaryUpdateInterval?: number;
  enableIntegrityCheck?: boolean;
  enablePadding?: boolean;
  maxExpansionRatio?: number;
  compressionTimeout?: number;
}

// Performance metrics and statistics
export interface CompressionStats {
  totalBytesIn: number;
  totalBytesOut: number;
  totalCompressions: number;
  totalDecompressions: number;
  averageCompressionRatio: number;
  averageCompressionTime: number;
  averageDecompressionTime: number;
  algorithmUsage: Map<CompressionAlgorithm, AlgorithmStats>;
  errorCount: number;
  lastUpdated: number;
}

// Algorithm-specific performance statistics
export interface AlgorithmStats {
  compressions: number;
  totalBytesIn: number;
  totalBytesOut: number;
  averageRatio: number;
  averageTime: number;
  errorCount: number;
}

// Dictionary for pattern-based compression
export interface CompressionDictionary {
  id: string;
  version: number;
  entries: Map<string, number>;
  reverseEntries: Map<number, string>;
  frequency: Map<string, number>;
  size: number;
  compressionRatio: number;
  createdAt: number;
  lastUpdated: number;
  signature?: Uint8Array;
}

// Dictionary entry for serialization
export interface DictionaryEntry {
  pattern: string;
  frequency: number;
  id: number;
}

// UTXO-specific context for compression optimization
export interface UTXOContext {
  transactionCount?: number;
  inputCount?: number;
  outputCount?: number;
  addressReuse?: number;
  commonPatterns?: string[];
}

// UTXO patterns for compression analysis
export interface UTXOPatterns {
  commonAddresses: string[];
  commonAmounts: number[];
  commonScripts: string[];
  recentTransactions: UTXOTransaction[];
}

// Duty cycle constraints from Milestone 2 integration
export interface DutyCycleConstraints {
  region: string;
  maxTransmissionTime: number;
  currentDutyCycle: number;
  remainingWindow: number;
  priority: CompressionPriority;
}

// Duty cycle efficiency metrics
export interface DutyCycleEfficiency {
  region: string;
  averageCompressionRatio: number;
  transmissionTimeSaved: number;
  dutyCycleOptimization: number;
  complianceLevel: number;
}

// Performance constraints for algorithm selection
export interface PerformanceConstraints {
  prioritizeSpeed?: boolean;
  prioritizeRatio?: boolean;
  maxCompressionTime?: number;
  maxMemoryUsage?: number;
  batteryOptimized?: boolean;
}

// Data pattern analysis for adaptive compression
export interface DataPatterns {
  entropy: number;
  repetition: number;
  structure: 'binary' | 'text' | 'structured' | 'random';
}

// Compression result for tracking performance
export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: CompressionAlgorithm;
  compressionTime: number;
  success: boolean;
  errorMessage?: string;
}

// Decompression result for integrity verification
export interface DecompressionResult {
  compressedSize: number;
  decompressedSize: number;
  algorithm: CompressionAlgorithm;
  decompressionTime: number;
  integrityVerified: boolean;
  success: boolean;
  errorMessage?: string;
}

// Error codes for compression operations
export const CompressionErrorCode = {
  ALGORITHM_NOT_SUPPORTED: 'ALGORITHM_NOT_SUPPORTED',
  COMPRESSION_FAILED: 'COMPRESSION_FAILED',
  DECOMPRESSION_FAILED: 'DECOMPRESSION_FAILED',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  TIMEOUT_EXCEEDED: 'TIMEOUT_EXCEEDED',
  INTEGRITY_CHECK_FAILED: 'INTEGRITY_CHECK_FAILED',
  DICTIONARY_NOT_FOUND: 'DICTIONARY_NOT_FOUND',
  EXPANSION_RATIO_EXCEEDED: 'EXPANSION_RATIO_EXCEEDED',
  UTXO_VALIDATION_FAILED: 'UTXO_VALIDATION_FAILED',
} as const;

export type CompressionErrorCode =
  (typeof CompressionErrorCode)[keyof typeof CompressionErrorCode];

// Compression error with detailed information
export interface CompressionError {
  code: CompressionErrorCode;
  message: string;
  algorithm?: CompressionAlgorithm;
  originalSize?: number;
  timestamp: number;
  stack?: string;
  context?: any;
}

// Security configuration for compression
export interface CompressionSecurityConfig {
  maxExpansionRatio: number; // Maximum allowed expansion ratio
  maxDecompressionMemory: number; // Memory limit for decompression
  enablePadding: boolean; // Add random padding to prevent analysis
  validateIntegrity: boolean; // Verify integrity of compressed data
  requireSignedDictionaries: boolean; // Require cryptographic signatures on dictionaries
}

// Memory usage tracking
export interface MemoryUsage {
  currentUsage: number;
  maxUsage: number;
  compressionBuffers: number;
  dictionaryMemory: number;
  cacheMemory: number;
}

// Performance metrics for monitoring
export interface PerformanceMetrics {
  compressionThroughput: number; // bytes per second
  decompressionThroughput: number; // bytes per second
  averageLatency: number; // milliseconds
  memoryEfficiency: number; // percentage
  errorRate: number; // percentage
  averageCompressionRatio: number;
}

// Buffer pool statistics
export interface BufferPoolStats {
  totalBuffers: number;
  availableBuffers: number;
  bufferSize: number;
  memoryUsage: number;
}

// Algorithm selection data for adaptive compression
export interface AlgorithmSelectionData {
  dataSize: number;
  dataType: MessageType;
  patterns: DataPatterns;
  constraints: PerformanceConstraints;
  selectedAlgorithm: CompressionAlgorithm;
  reason: string;
}

// Dictionary update tracking
export interface DictionaryChanges {
  entriesAdded: number;
  entriesRemoved: number;
  frequencyUpdates: number;
  sizeChange: number;
  ratioImprovement: number;
}
