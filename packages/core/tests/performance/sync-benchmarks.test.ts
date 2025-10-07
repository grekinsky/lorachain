import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';
import { Blockchain } from '../../src/blockchain.js';
import { StateCheckpointManager } from '../../src/state-checkpoint-manager.js';
import { IncrementalStateManager } from '../../src/incremental-state-manager.js';
import { UTXOManager } from '../../src/utxo.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { MemoryDatabase } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { MerkleTree } from '../../src/merkle/index.js';
import { createTestnetGenesisConfig } from '../shared/fixtures/mock-genesis-config.js';
import {
  measureSyncPerformance,
  formatBytes,
  formatDuration,
  calculateCompressionRatio,
} from '../shared/helpers/sync-test-utils.js';

/**
 * Sync Performance Benchmarks
 *
 * Measures performance characteristics of state synchronization:
 * - Checkpoint creation time
 * - Sync bandwidth usage
 * - Memory usage during sync
 * - State update latency
 */
describe('Sync Performance Benchmarks', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let compression: UTXOCompressionManager;
  let cryptoService: CryptographicService;
  let db: MemoryDatabase;

  beforeEach(async () => {
    // Create in-memory database
    db = new MemoryDatabase({
      dbPath: ':memory:',
      compressionType: 'gzip',
    });

    // Create crypto service
    cryptoService = new CryptographicService();

    // Create persistence manager
    persistence = new UTXOPersistenceManager(
      db,
      {
        dbPath: ':memory:',
        compressionType: 'gzip',
      },
      cryptoService
    );

    // Create compression manager
    compression = new UTXOCompressionManager();

    // Create UTXO manager
    const utxoManager = new UTXOManager();

    // Create genesis config
    const genesisConfig = createTestnetGenesisConfig();

    // Create blockchain
    blockchain = new Blockchain(
      persistence,
      utxoManager,
      { targetBlockTime: 180 },
      genesisConfig
    );

    // Wait for blockchain initialization
    await blockchain.waitForInitialization();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('Checkpoint Creation Performance', () => {
    it('should measure checkpoint creation time for various UTXO set sizes', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        10 // small interval for testing
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const sizes = [10, 50, 100]; // Reduced for test performance
      const results: Array<{
        utxoCount: number;
        creationTime: number;
        checkpointSize: number;
        compressionRatio: number;
      }> = [];

      for (const targetSize of sizes) {
        // Mine blocks to reach target UTXO count
        const currentBlocks = blockchain.getBlocks().length;
        const blocksToMine = Math.max(1, targetSize - currentBlocks);

        for (let i = 0; i < blocksToMine; i++) {
          await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        }

        // Measure checkpoint creation time
        const start = performance.now();
        const checkpoint = await checkpointManager.createCheckpoint();
        const end = performance.now();

        const creationTime = end - start;
        const utxoCount = checkpoint.utxoCount;

        // Calculate checkpoint size
        let checkpointSize = 0;
        let originalSize = 0;
        for (const batch of checkpoint.compressedUTXOs) {
          checkpointSize += batch.data.length;
          originalSize += batch.originalSize;
        }

        const compressionRatio = calculateCompressionRatio(
          originalSize,
          checkpointSize
        );

        results.push({
          utxoCount,
          creationTime,
          checkpointSize,
          compressionRatio,
        });

        console.log(
          `Checkpoint creation (${utxoCount} UTXOs): ${creationTime.toFixed(2)}ms, ` +
            `Size: ${formatBytes(checkpointSize)}, ` +
            `Compression: ${compressionRatio.toFixed(1)}%`
        );
      }

      // Verify results
      expect(results.length).toBe(sizes.length);
      results.forEach(result => {
        expect(result.creationTime).toBeGreaterThan(0);
        expect(result.checkpointSize).toBeGreaterThan(0);
        expect(result.compressionRatio).toBeGreaterThan(0);
      });
    });

    it('should benchmark checkpoint creation with different compression levels', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // Mine some blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      for (let i = 0; i < 20; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      const compressionLevels = [1, 6, 9];
      const results: Array<{
        level: number;
        creationTime: number;
        checkpointSize: number;
      }> = [];

      for (const level of compressionLevels) {
        const start = performance.now();
        const checkpoint = await checkpointManager.createCheckpoint({
          compressionLevel: level,
        });
        const end = performance.now();

        const creationTime = end - start;
        let checkpointSize = 0;
        for (const batch of checkpoint.compressedUTXOs) {
          checkpointSize += batch.data.length;
        }

        results.push({
          level,
          creationTime,
          checkpointSize,
        });

        console.log(
          `Compression level ${level}: ${creationTime.toFixed(2)}ms, ` +
            `Size: ${formatBytes(checkpointSize)}`
        );
      }

      // Verify compression improves with higher levels
      expect(results.length).toBe(compressionLevels.length);
      expect(results[2].checkpointSize).toBeLessThanOrEqual(
        results[0].checkpointSize
      );
    });
  });

  describe('Sync Bandwidth Usage', () => {
    it('should measure bandwidth usage for checkpoint sync', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // Mine blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      for (let i = 0; i < 30; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      // Create checkpoint
      const checkpoint = await checkpointManager.createCheckpoint();

      // Calculate total bandwidth
      let totalBytes = 0;
      for (const batch of checkpoint.compressedUTXOs) {
        totalBytes += batch.data.length;
      }

      // Add metadata overhead (estimated)
      const metadataSize = JSON.stringify({
        height: checkpoint.height,
        merkleRoot: checkpoint.merkleRoot,
        utxoCount: checkpoint.utxoCount,
        totalValue: checkpoint.totalValue.toString(),
      }).length;

      totalBytes += metadataSize;

      console.log(`Total checkpoint bandwidth: ${formatBytes(totalBytes)}`);
      console.log(`UTXOs synced: ${checkpoint.utxoCount}`);
      console.log(
        `Bytes per UTXO: ${(totalBytes / checkpoint.utxoCount).toFixed(2)}`
      );

      expect(totalBytes).toBeGreaterThan(0);
      expect(checkpoint.utxoCount).toBeGreaterThan(0);
    });

    it('should measure bandwidth for incremental updates', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const updateSizes: number[] = [];

      // Create multiple updates and measure size
      for (let i = 0; i < 10; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        const blocks = blockchain.getBlocks();
        const block = blocks[blocks.length - 1];

        const update = await stateManager.createStateUpdate(
          block,
          Buffer.from(keyPair.privateKey).toString('hex'),
          'secp256k1'
        );

        // Calculate update size
        const updateSize = JSON.stringify(update).length;
        updateSizes.push(updateSize);
      }

      const totalBandwidth = updateSizes.reduce((sum, size) => sum + size, 0);
      const avgUpdateSize = totalBandwidth / updateSizes.length;

      console.log(`Total update bandwidth: ${formatBytes(totalBandwidth)}`);
      console.log(`Average update size: ${formatBytes(avgUpdateSize)}`);
      console.log(`Updates sent: ${updateSizes.length}`);

      expect(totalBandwidth).toBeGreaterThan(0);
      expect(avgUpdateSize).toBeGreaterThan(0);
    });
  });

  describe('Memory Usage During Sync', () => {
    it('should monitor memory usage during checkpoint creation', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Mine blocks
      for (let i = 0; i < 50; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      // Create checkpoint
      await checkpointManager.createCheckpoint();

      const finalMemory = process.memoryUsage();

      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const rssIncrease = finalMemory.rss - initialMemory.rss;

      console.log(`Heap increase: ${formatBytes(heapIncrease)}`);
      console.log(`RSS increase: ${formatBytes(rssIncrease)}`);
      console.log(`External: ${formatBytes(finalMemory.external)}`);

      // Memory increase should be reasonable (<100MB)
      expect(heapIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should measure memory usage for update buffering', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression,
        undefined,
        undefined,
        10, // batch size
        1000, // batch interval
        100 // max buffer size
      );

      const initialMemory = process.memoryUsage().heapUsed;
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Create many updates
      for (let i = 0; i < 50; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        const blocks = blockchain.getBlocks();
        const block = blocks[blocks.length - 1];

        await stateManager.createStateUpdate(
          block,
          Buffer.from(keyPair.privateKey).toString('hex'),
          'secp256k1'
        );
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(
        `Memory increase for buffering: ${formatBytes(memoryIncrease)}`
      );

      // Memory should be bounded
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('State Update Latency', () => {
    it('should measure time from block add to update broadcast', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      // Subscribe peer
      await stateManager.subscribeToUpdates({
        peerId: 'test-peer',
        subscriptionType: 'all',
        startSequence: 0,
      });

      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const latencies: number[] = [];

      // Measure latency for multiple updates
      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        // Mine block
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        const blocks = blockchain.getBlocks();
        const block = blocks[blocks.length - 1];

        // Create update
        const update = await stateManager.createStateUpdate(
          block,
          Buffer.from(keyPair.privateKey).toString('hex'),
          'secp256k1'
        );

        // Broadcast (in real implementation)
        await stateManager.broadcastStateUpdate(update);

        const end = performance.now();
        const latency = end - start;
        latencies.push(latency);
      }

      const avgLatency =
        latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);

      console.log(`Average update latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`Min latency: ${minLatency.toFixed(2)}ms`);
      console.log(`Max latency: ${maxLatency.toFixed(2)}ms`);

      // Target: sub-500ms latency
      expect(avgLatency).toBeLessThan(500);
    });

    it('should measure update validation time', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Create update
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      const blocks = blockchain.getBlocks();
      const block = blocks[blocks.length - 1];

      const update = await stateManager.createStateUpdate(
        block,
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      // Measure validation time
      const validationTimes: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await stateManager.validateStateUpdate(update);
        const end = performance.now();
        validationTimes.push(end - start);
      }

      const avgValidationTime =
        validationTimes.reduce((sum, t) => sum + t, 0) / validationTimes.length;

      console.log(`Average validation time: ${avgValidationTime.toFixed(2)}ms`);

      // Validation should be fast (<50ms)
      expect(avgValidationTime).toBeLessThan(50);
    });
  });

  describe('End-to-End Sync Performance', () => {
    it('should benchmark complete checkpoint-based sync', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        10
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Mine blocks
      for (let i = 0; i < 50; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      // Measure complete sync workflow
      const metrics = await measureSyncPerformance(async () => {
        // Create checkpoint
        const checkpoint = await checkpointManager.createCheckpoint();

        // Simulate applying checkpoint
        await checkpointManager.applyCheckpoint(checkpoint);
      });

      console.log('=== Complete Checkpoint Sync Benchmark ===');
      console.log(`Duration: ${formatDuration(metrics.duration)}`);
      console.log(`Memory used: ${formatBytes(metrics.memoryUsed)}`);

      expect(metrics.duration).toBeGreaterThan(0);
    });

    it('should benchmark incremental sync performance', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Measure incremental update performance
      const metrics = await measureSyncPerformance(async () => {
        // Create 20 updates
        for (let i = 0; i < 20; i++) {
          await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
          const blocks = blockchain.getBlocks();
          const block = blocks[blocks.length - 1];

          await stateManager.createStateUpdate(
            block,
            Buffer.from(keyPair.privateKey).toString('hex'),
            'secp256k1'
          );
        }
      });

      console.log('=== Incremental Sync Benchmark ===');
      console.log(`Duration: ${formatDuration(metrics.duration)}`);
      console.log(`Memory used: ${formatBytes(metrics.memoryUsed)}`);
      console.log(`Updates created: 20`);

      expect(metrics.duration).toBeGreaterThan(0);
    });
  });
});
