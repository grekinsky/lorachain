/**
 * Compression System Tests
 * 
 * Comprehensive unit tests for the UTXO compression system
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
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
import { CompressionFactory, CompressionConfigBuilder } from './compression-factory.js';
import type {
  UTXOCompressionConfig,
  CompressionAlgorithm,
  CompressionLevel,
  MessageType,
  CompressedData
} from './compression-types.js';

// Test data helpers
function createTestUTXOTransaction() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    inputs: [
      {
        previousTxId: '123e4567-e89b-12d3-a456-426614174000',
        outputIndex: 0,
        unlockingScript: 'OP_DUP OP_HASH160 1234567890abcdef OP_EQUALVERIFY OP_CHECKSIG',
        sequence: 0
      }
    ],
    outputs: [
      {
        value: 5000000000, // 50 BTC in satoshis
        lockingScript: 'OP_DUP OP_HASH160 abcdef1234567890 OP_EQUALVERIFY OP_CHECKSIG',
        outputIndex: 0
      },
      {
        value: 4999990000, // Change output
        lockingScript: 'OP_DUP OP_HASH160 fedcba0987654321 OP_EQUALVERIFY OP_CHECKSIG',
        outputIndex: 1
      }
    ],
    fee: 10000,
    timestamp: Date.now(),
    lockTime: 0
  };
}

function createTestUTXOBlock() {
  return {
    index: 12345,
    timestamp: Date.now(),
    transactions: [createTestUTXOTransaction()],
    previousHash: '0000000000000000000123456789abcdef0123456789abcdef0123456789abcdef',
    hash: '000000000000000000fedcba9876543210fedcba9876543210fedcba9876543210',
    merkleRoot: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    nonce: 987654321,
    difficulty: 404472624
  };
}

function createTestConfig(): UTXOCompressionConfig {
  return new CompressionConfigBuilder()
    .algorithm('protobuf' as CompressionAlgorithm)
    .level('balanced' as CompressionLevel)
    .memoryLimit(1024 * 1024) // 1MB
    .enableDictionary(true)
    .enableUTXOOptimization(true)
    .enableDutyCycleIntegration(false) // Disable for testing
    .build();
}

function createLargeTestData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  return data;
}

function createRepetitiveTestData(size: number): Uint8Array {
  const pattern = new TextEncoder().encode('UTXO_PATTERN_');
  const data = new Uint8Array(size);
  
  for (let i = 0; i < size; i++) {
    data[i] = pattern[i % pattern.length];
  }
  
  return data;
}

describe('UTXOCompressionManager', () => {
  let compressionManager: UTXOCompressionManager;
  let config: UTXOCompressionConfig;

  beforeEach(() => {
    config = createTestConfig();
    compressionManager = new UTXOCompressionManager(config);
    
    // Register test engines
    compressionManager.registerAlgorithm('protobuf' as CompressionAlgorithm, new ProtobufCompressionEngine());
    compressionManager.registerAlgorithm('gzip' as CompressionAlgorithm, new GzipCompressionEngine());
    compressionManager.registerAlgorithm('lz4' as CompressionAlgorithm, new LZ4CompressionEngine());
  });

  describe('Basic Compression Operations', () => {
    test('should compress and decompress data correctly', () => {
      const testData = new TextEncoder().encode('Hello, UTXO Compression World!');
      
      const compressed = compressionManager.compress(testData);
      const decompressed = compressionManager.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      expect(compressed.originalSize).toBe(testData.length);
      expect(compressed.data.length).toBeLessThan(testData.length);
    });

    test('should handle empty data gracefully', () => {
      const emptyData = new Uint8Array(0);
      
      expect(() => {
        compressionManager.compress(emptyData);
      }).toThrow('Cannot compress empty data');
    });

    test('should respect compression threshold', () => {
      const smallData = new Uint8Array(32); // Below default threshold
      
      const compressed = compressionManager.compress(smallData);
      
      expect(compressed.algorithm).toBe('none' as CompressionAlgorithm);
      expect(compressed.data).toEqual(smallData);
    });

    test('should compress large data effectively', () => {
      const largeData = createLargeTestData(2048);
      
      const compressed = compressionManager.compress(largeData);
      
      expect(compressed.data.length).toBeLessThan(largeData.length);
      expect(compressed.algorithm).not.toBe('none' as CompressionAlgorithm);
      
      const decompressed = compressionManager.decompress(compressed);
      expect(decompressed).toEqual(largeData);
    });
  });

  describe('Algorithm Selection', () => {
    test('should select optimal algorithm for UTXO transactions', () => {
      const txData = new TextEncoder().encode(JSON.stringify(createTestUTXOTransaction()));
      
      const algorithm = compressionManager.selectOptimalAlgorithm(
        txData, 
        'utxo_transaction' as MessageType
      );
      
      expect(algorithm).toBe('protobuf' as CompressionAlgorithm);
    });

    test('should select appropriate algorithm for repetitive data', () => {
      const repetitiveData = createRepetitiveTestData(1024);
      
      const algorithm = compressionManager.selectOptimalAlgorithm(repetitiveData);
      
      // Should select an algorithm that handles repetitive data well
      expect(['lz4', 'gzip']).toContain(algorithm);
    });

    test('should return NONE for very small data', () => {
      const smallData = new Uint8Array(16);
      
      const algorithm = compressionManager.selectOptimalAlgorithm(smallData);
      
      expect(algorithm).toBe('none' as CompressionAlgorithm);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should track compression statistics', () => {
      const testData = createLargeTestData(1024);
      
      // Initial stats
      const initialStats = compressionManager.getCompressionStats();
      expect(initialStats.totalCompressions).toBe(0);
      
      // Perform compression
      const compressed = compressionManager.compress(testData);
      compressionManager.decompress(compressed);
      
      // Check updated stats
      const updatedStats = compressionManager.getCompressionStats();
      expect(updatedStats.totalCompressions).toBe(1);
      expect(updatedStats.totalDecompressions).toBe(1);
      expect(updatedStats.totalBytesIn).toBe(testData.length);
      expect(updatedStats.totalBytesOut).toBe(compressed.data.length);
    });

    test('should calculate compression ratio correctly', () => {
      const testData = createRepetitiveTestData(2048);
      
      const compressed = compressionManager.compress(testData);
      const stats = compressionManager.getCompressionStats();
      
      const expectedRatio = compressed.data.length / testData.length;
      expect(stats.averageCompressionRatio).toBeCloseTo(expectedRatio, 2);
    });

    test('should reset statistics', () => {
      const testData = createLargeTestData(512);
      
      // Perform some operations
      compressionManager.compress(testData);
      expect(compressionManager.getCompressionStats().totalCompressions).toBe(1);
      
      // Reset stats
      compressionManager.resetStats();
      expect(compressionManager.getCompressionStats().totalCompressions).toBe(0);
    });
  });

  describe('Dictionary Management', () => {
    test('should create compression dictionary from samples', () => {
      const samples = [
        new TextEncoder().encode('UTXO_TRANSACTION_DATA_PATTERN'),
        new TextEncoder().encode('UTXO_TRANSACTION_COMMON_FIELDS'),
        new TextEncoder().encode('UTXO_TRANSACTION_SIGNATURE_DATA')
      ];
      
      const dictionary = compressionManager.createDictionary(samples, 'test_dict');
      
      expect(dictionary.id).toBe('test_dict');
      expect(dictionary.entries.size).toBeGreaterThan(0);
      expect(dictionary.frequency.size).toBeGreaterThan(0);
    });

    test('should retrieve dictionary by ID', () => {
      const samples = [new TextEncoder().encode('test pattern')];
      const dictionary = compressionManager.createDictionary(samples, 'retrieve_test');
      
      const retrieved = compressionManager.getDictionary('retrieve_test');
      
      expect(retrieved).toEqual(dictionary);
    });

    test('should return null for non-existent dictionary', () => {
      const retrieved = compressionManager.getDictionary('non_existent');
      
      expect(retrieved).toBeNull();
    });

    test('should update existing dictionary', () => {
      const initialSamples = [new TextEncoder().encode('initial pattern')];
      const dictionary = compressionManager.createDictionary(initialSamples, 'update_test');
      const initialVersion = dictionary.version;
      
      const newSamples = [new TextEncoder().encode('new pattern data')];
      compressionManager.updateDictionary('update_test', newSamples);
      
      const updated = compressionManager.getDictionary('update_test');
      expect(updated!.version).toBe(initialVersion + 1);
      expect(updated!.lastUpdated).toBeGreaterThan(dictionary.lastUpdated);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const newConfig = {
        defaultAlgorithm: 'lz4' as CompressionAlgorithm,
        compressionLevel: 'fast' as CompressionLevel
      };
      
      compressionManager.updateConfig(newConfig);
      
      // Verify configuration change affects algorithm selection
      const testData = createLargeTestData(512);
      const compressed = compressionManager.compress(testData);
      
      // Should use LZ4 due to updated default
      expect(compressed.algorithm).toBe('lz4' as CompressionAlgorithm);
    });

    test('should enable/disable adaptive compression', () => {
      // Test enabling adaptive compression
      compressionManager.enableAdaptiveCompression(true);
      
      const testData = createLargeTestData(1024);
      const compressed1 = compressionManager.compress(testData);
      
      // Test disabling adaptive compression
      compressionManager.enableAdaptiveCompression(false);
      const compressed2 = compressionManager.compress(testData);
      
      // Both should work, but behavior may differ
      expect(compressed1.data.length).toBeGreaterThan(0);
      expect(compressed2.data.length).toBeGreaterThan(0);
    });
  });
});

describe('Compression Engines', () => {
  describe('ProtobufCompressionEngine', () => {
    let engine: ProtobufCompressionEngine;

    beforeEach(() => {
      engine = new ProtobufCompressionEngine();
    });

    test('should compress and decompress JSON data', () => {
      const testData = new TextEncoder().encode(JSON.stringify(createTestUTXOTransaction()));
      
      const compressed = engine.compress(testData);
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      expect(compressed.algorithm).toBe('protobuf' as CompressionAlgorithm);
    });

    test('should achieve good compression ratio', () => {
      const testData = new TextEncoder().encode(JSON.stringify(createTestUTXOTransaction()));
      
      const compressed = engine.compress(testData);
      const ratio = compressed.data.length / testData.length;
      
      expect(ratio).toBeLessThan(0.8); // Should achieve at least 20% compression
    });

    test('should serialize UTXO transactions', () => {
      const transaction = createTestUTXOTransaction();
      
      const serialized = engine.serializeUTXOTransaction(transaction);
      const deserialized = engine.deserializeUTXOTransaction(serialized);
      
      expect(deserialized).toBeDefined();
      expect(deserialized.id).toBeDefined();
    });

    test('should validate UTXO data', () => {
      const validData = createTestUTXOTransaction();
      const invalidData = { invalid: 'data' };
      
      expect(engine.validateUTXOData(validData)).toBe(true);
      expect(engine.validateUTXOData(invalidData)).toBe(false);
    });
  });

  describe('GzipCompressionEngine', () => {
    let engine: GzipCompressionEngine;

    beforeEach(() => {
      engine = new GzipCompressionEngine();
    });

    test('should compress repetitive data effectively', () => {
      const repetitiveData = createRepetitiveTestData(2048);
      
      const compressed = engine.compress(repetitiveData);
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(repetitiveData);
      expect(compressed.data.length).toBeLessThan(repetitiveData.length * 0.5); // >50% compression
    });

    test('should handle different compression levels', () => {
      const testData = createRepetitiveTestData(1024);
      
      engine.configure({ level: 'fast' as CompressionLevel });
      const fastCompressed = engine.compress(testData);
      
      engine.configure({ level: 'maximum' as CompressionLevel });
      const maxCompressed = engine.compress(testData);
      
      // Maximum compression should achieve better ratio (smaller size)
      expect(maxCompressed.data.length).toBeLessThanOrEqual(fastCompressed.data.length);
    });
  });

  describe('LZ4CompressionEngine', () => {
    let engine: LZ4CompressionEngine;

    beforeEach(() => {
      engine = new LZ4CompressionEngine();
    });

    test('should prioritize speed over compression ratio', () => {
      const testData = createLargeTestData(1024);
      
      const startTime = performance.now();
      const compressed = engine.compress(testData);
      const compressionTime = performance.now() - startTime;
      
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      expect(compressionTime).toBeLessThan(50); // Should be fast (<50ms)
      expect(engine.getCompressionSpeed()).toBeGreaterThan(1024 * 1024); // >1MB/s
    });

    test('should support duty cycle planning', () => {
      expect(engine.supportsDutyCyclePlanning()).toBe(true);
    });
  });

  describe('UTXOCustomCompressionEngine', () => {
    let engine: UTXOCustomCompressionEngine;

    beforeEach(() => {
      engine = new UTXOCustomCompressionEngine();
    });

    test('should achieve high compression for UTXO transactions', () => {
      const transaction = createTestUTXOTransaction();
      const testData = new TextEncoder().encode(JSON.stringify(transaction));
      
      const compressed = engine.compress(testData);
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      
      const ratio = compressed.data.length / testData.length;
      expect(ratio).toBeLessThan(0.4); // Should achieve >60% compression for UTXO data
    });

    test('should compress UTXO blocks effectively', () => {
      const block = createTestUTXOBlock();
      const testData = new TextEncoder().encode(JSON.stringify(block));
      
      const compressed = engine.compress(testData);
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      
      const ratio = compressed.data.length / testData.length;
      expect(ratio).toBeLessThan(0.6); // Should achieve >40% compression for blocks
    });
  });

  describe('DictionaryCompressionEngine', () => {
    let engine: DictionaryCompressionEngine;

    beforeEach(() => {
      engine = new DictionaryCompressionEngine();
    });

    test('should create and use dictionaries for compression', () => {
      const samples = [
        new TextEncoder().encode('UTXO_COMMON_PATTERN_ABCDEF'),
        new TextEncoder().encode('UTXO_COMMON_PATTERN_123456'),
        new TextEncoder().encode('UTXO_COMMON_PATTERN_FEDCBA')
      ];
      
      const dictionary = engine.createDictionary(samples, 'test_dict');
      expect(dictionary.id).toBe('test_dict');
      
      const testData = new TextEncoder().encode('UTXO_COMMON_PATTERN_TEST_DATA');
      const compressed = engine.compress(testData, { dictionaryId: 'test_dict' });
      const decompressed = engine.decompress(compressed);
      
      expect(decompressed).toEqual(testData);
      expect(compressed.data.length).toBeLessThan(testData.length);
    });

    test('should achieve very high compression for repetitive data', () => {
      const pattern = 'UTXO_REPEATED_PATTERN_';
      const samples = Array.from({ length: 10 }, (_, i) => 
        new TextEncoder().encode(pattern + i.toString())
      );
      
      engine.createDictionary(samples, 'repetitive_dict');
      
      const testData = new TextEncoder().encode(pattern.repeat(20));
      const compressed = engine.compress(testData, { dictionaryId: 'repetitive_dict' });
      
      const ratio = compressed.data.length / testData.length;
      expect(ratio).toBeLessThan(0.3); // Should achieve >70% compression
    });

    test('should manage multiple dictionaries', () => {
      const samples1 = [new TextEncoder().encode('pattern1')];
      const samples2 = [new TextEncoder().encode('pattern2')];
      
      engine.createDictionary(samples1, 'dict1');
      engine.createDictionary(samples2, 'dict2');
      
      const dictionaries = engine.listDictionaries();
      expect(dictionaries).toContain('dict1');
      expect(dictionaries).toContain('dict2');
      
      expect(engine.getDictionary('dict1')).toBeDefined();
      expect(engine.getDictionary('dict2')).toBeDefined();
    });
  });
});

describe('CompressionFactory', () => {
  let factory: CompressionFactory;

  beforeEach(() => {
    factory = CompressionFactory.getInstance();
  });

  test('should create compression manager with default configuration', () => {
    const config = createTestConfig();
    const manager = factory.createCompressionManager(config);
    
    expect(manager).toBeDefined();
    expect(manager.getCompressionStats()).toBeDefined();
  });

  test('should create different compression engines', () => {
    const algorithms: CompressionAlgorithm[] = [
      'protobuf' as CompressionAlgorithm,
      'gzip' as CompressionAlgorithm,
      'lz4' as CompressionAlgorithm,
      'utxo_custom' as CompressionAlgorithm,
      'utxo_dictionary' as CompressionAlgorithm
    ];
    
    algorithms.forEach(algorithm => {
      const engine = factory.createCompressionEngine(algorithm);
      expect(engine.getAlgorithmName()).toBe(algorithm);
    });
  });

  test('should create optimized configurations', () => {
    const mobileConfig = CompressionFactory.createMobileConfig();
    expect(mobileConfig.defaultAlgorithm).toBe('lz4' as CompressionAlgorithm);
    expect(mobileConfig.compressionLevel).toBe('fast' as CompressionLevel);
    
    const nodeConfig = CompressionFactory.createNodeConfig();
    expect(nodeConfig.defaultAlgorithm).toBe('utxo_custom' as CompressionAlgorithm);
    expect(nodeConfig.compressionLevel).toBe('maximum' as CompressionLevel);
    
    const loraConfig = CompressionFactory.createLoRaOptimizedConfig();
    expect(loraConfig.defaultAlgorithm).toBe('protobuf' as CompressionAlgorithm);
    expect(loraConfig.dutyCycleIntegration).toBe(true);
  });

  test('should detect best algorithm for test data', () => {
    const samples = [
      createRepetitiveTestData(512),
      createLargeTestData(512),
      new TextEncoder().encode(JSON.stringify(createTestUTXOTransaction()))
    ];
    
    const bestAlgorithm = factory.detectBestAlgorithm(samples);
    
    expect(Object.values({
      PROTOBUF: 'protobuf',
      GZIP: 'gzip', 
      LZ4: 'lz4',
      UTXO_CUSTOM: 'utxo_custom'
    })).toContain(bestAlgorithm);
  });

  test('should benchmark algorithms', () => {
    const testData = [
      createLargeTestData(1024),
      createRepetitiveTestData(1024)
    ];
    
    const benchmarkResults = factory.benchmarkAlgorithms(testData);
    
    expect(benchmarkResults.size).toBeGreaterThan(0);
    
    for (const [algorithm, metrics] of benchmarkResults) {
      expect(metrics.compressionThroughput).toBeGreaterThan(0);
      expect(metrics.decompressionThroughput).toBeGreaterThan(0);
      expect(metrics.averageCompressionRatio).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('CompressionConfigBuilder', () => {
  test('should build configuration with fluent API', () => {
    const config = new CompressionConfigBuilder()
      .algorithm('utxo_custom' as CompressionAlgorithm)
      .level('maximum' as CompressionLevel)
      .memoryLimit(2048 * 1024)
      .enableDictionary(true)
      .enableUTXOOptimization(true)
      .regionalCompliance('US')
      .build();
    
    expect(config.defaultAlgorithm).toBe('utxo_custom' as CompressionAlgorithm);
    expect(config.compressionLevel).toBe('maximum' as CompressionLevel);
    expect(config.maxCompressionMemory).toBe(2048 * 1024);
    expect(config.enableDictionary).toBe(true);
    expect(config.utxoOptimization).toBe(true);
    expect(config.regionalCompliance).toBe('US');
  });

  test('should validate configuration during build', () => {
    expect(() => {
      new CompressionConfigBuilder()
        .memoryLimit(-1) // Invalid memory limit
        .build();
    }).toThrow('Memory limit must be positive');
  });

  test('should provide reasonable defaults', () => {
    const config = new CompressionConfigBuilder().build();
    
    expect(config.defaultAlgorithm).toBe('protobuf' as CompressionAlgorithm);
    expect(config.compressionLevel).toBe('balanced' as CompressionLevel);
    expect(config.maxCompressionMemory).toBe(512 * 1024); // 512KB default
    expect(config.dutyCycleIntegration).toBe(true);
    expect(config.utxoOptimization).toBe(true);
  });
});