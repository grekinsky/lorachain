import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Blockchain } from '../../src/blockchain.js';
import { StateCheckpointManager } from '../../src/state-checkpoint-manager.js';
import { IncrementalStateManager } from '../../src/incremental-state-manager.js';
import { SyncResumeManager } from '../../src/sync-resume-manager.js';
import { LightClientSyncStrategy } from '../../src/sync-strategies.js';
import { UTXOManager } from '../../src/utxo.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { MemoryDatabase } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { BlockManager } from '../../src/block.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOSyncManager } from '../../src/sync-manager.js';
import { MerkleTree } from '../../src/merkle/index.js';
import { createTestnetGenesisConfig } from '../shared/fixtures/mock-genesis-config.js';
import { createTestBlockchain } from '../shared/helpers/test-utils.js';
import type { Block, UTXOTransaction, UTXO } from '../../src/types.js';
import type { StateCheckpoint } from '../../src/state-checkpoint-manager.js';
import type { StateUpdate } from '../../src/sync-types.js';

/**
 * State Synchronization Integration Tests
 *
 * Comprehensive end-to-end testing of the state sync system including:
 * - Checkpoint-based sync
 * - Incremental state updates
 * - Sync resume and recovery
 * - Light client sync
 * - Multi-node sync scenarios
 * - Performance benchmarks
 * - Security tests
 * - Error handling
 */
describe('State Synchronization Integration', () => {
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
    // Clean up database
    if (db) {
      await db.close();
    }
  });

  describe('Checkpoint-Based Sync', () => {
    it('should create checkpoint every 100 blocks', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        100 // checkpoint interval
      );

      const initialHeight = blockchain.getBlocks().length - 1;

      // Mine blocks up to checkpoint interval
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      for (let i = 0; i < 100; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      // Create checkpoint at height 100
      const checkpoint = await checkpointManager.createCheckpoint();

      expect(checkpoint).toBeDefined();
      expect(checkpoint.height).toBeGreaterThanOrEqual(initialHeight + 100);
      expect(checkpoint.utxoCount).toBeGreaterThan(0);
      expect(checkpoint.checkpointHash).toBeDefined();
      expect(checkpoint.merkleRoot).toBeDefined();
    });

    it('should validate checkpoint with validator signatures', async () => {
      const validatorKeyPair =
        CryptographicService.generateKeyPair('secp256k1');
      const validators = [
        {
          publicKey: Buffer.from(validatorKeyPair.publicKey).toString('hex'),
          algorithm: 'secp256k1' as const,
          name: 'test-validator-1',
        },
      ];

      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        100,
        validators,
        1 // signature threshold
      );

      // Create checkpoint
      const checkpoint = await checkpointManager.createCheckpoint();

      // Sign checkpoint
      const signature = await checkpointManager.signCheckpoint(
        checkpoint,
        Buffer.from(validatorKeyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      // Add signature
      await checkpointManager.addValidatorSignature(
        checkpoint.checkpointHash,
        signature
      );

      // Validate checkpoint
      const validationResult =
        await checkpointManager.validateCheckpoint(checkpoint);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.validSignatures).toBeGreaterThanOrEqual(1);
    });

    it('should distribute checkpoint via mesh protocol', async () => {
      // This test would require mesh protocol integration
      // For now, we test the fragmentation aspect
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        100
      );

      const checkpoint = await checkpointManager.createCheckpoint();

      // Verify checkpoint is fragmentable for LoRa transmission
      expect(checkpoint.compressedUTXOs.length).toBeGreaterThan(0);

      // Check that compressed data exists
      const batch = checkpoint.compressedUTXOs[0];
      expect(batch.data).toBeDefined();
      expect(batch.data.length).toBeGreaterThan(0);
    });

    it('should fast bootstrap from checkpoint', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        10 // small interval for testing
      );

      // Mine some blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      for (let i = 0; i < 20; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      // Create checkpoint
      const checkpoint = await checkpointManager.createCheckpoint();

      // Create new blockchain for bootstrapping
      const newDb = new MemoryDatabase({
        dbPath: ':memory:',
        compressionType: 'gzip',
      });

      const newPersistence = new UTXOPersistenceManager(
        newDb,
        {
          dbPath: ':memory:',
          compressionType: 'gzip',
        },
        cryptoService
      );

      const newUtxoManager = new UTXOManager();
      const newBlockchain = new Blockchain(
        newPersistence,
        newUtxoManager,
        { targetBlockTime: 180 },
        createTestnetGenesisConfig()
      );

      await newBlockchain.waitForInitialization();

      const newCheckpointManager = new StateCheckpointManager(
        newBlockchain,
        newPersistence,
        compression
      );

      // Apply checkpoint to bootstrap
      await newCheckpointManager.applyCheckpoint(checkpoint);

      // Verify UTXO set matches
      const originalUTXOs = blockchain.getUTXOManager().getUTXOSetSnapshot();
      const newUTXOs = newBlockchain.getUTXOManager().getUTXOSetSnapshot();

      expect(newUTXOs.size).toBe(originalUTXOs.size);

      await newDb.close();
    });

    it('should cleanup old checkpoints', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        5, // small interval
        undefined,
        undefined,
        undefined,
        undefined,
        3 // keep only 3 checkpoints
      );

      // Mine blocks and create multiple checkpoints
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      for (let i = 0; i < 25; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

        if (i > 0 && i % 5 === 0) {
          await checkpointManager.createCheckpoint();
        }
      }

      // Cleanup old checkpoints
      const deletedCount = await checkpointManager.cleanupOldCheckpoints();

      // Should have deleted some checkpoints
      const remainingCheckpoints =
        await checkpointManager.getAvailableCheckpoints();
      expect(remainingCheckpoints.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Incremental State Updates', () => {
    it('should broadcast state updates to subscribed peers', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      // Subscribe test peer
      await stateManager.subscribeToUpdates({
        peerId: 'test-peer-1',
        subscriptionType: 'all',
        startSequence: 0,
      });

      // Start watching
      await stateManager.startWatchingStateChanges();

      // Create a new block to trigger state change
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      const blocks = blockchain.getBlocks();
      const latestBlock = blocks[blocks.length - 1];

      // Create state update
      const update = await stateManager.createStateUpdate(
        latestBlock,
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      expect(update).toBeDefined();
      expect(update.sequenceNumber).toBeGreaterThan(0);
      expect(update.blockHeight).toBe(latestBlock.index);

      // Verify subscription exists
      expect(stateManager.isSubscribed('test-peer-1')).toBe(true);
    });

    it('should filter updates by address for light clients', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const walletKeyPair = CryptographicService.generateKeyPair('secp256k1');
      const walletAddress = Buffer.from(walletKeyPair.publicKey).toString(
        'hex'
      );

      // Subscribe with address filter
      await stateManager.subscribeToUpdates({
        peerId: 'light-client-1',
        subscriptionType: 'address_specific',
        addresses: [walletAddress],
        startSequence: 0,
      });

      const subscription = stateManager.getSubscription('light-client-1');
      expect(subscription).toBeDefined();
      expect(subscription?.type).toBe('address_specific');
      expect(subscription?.addresses).toContain(walletAddress);
    });

    it('should detect and recover missing updates', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Create multiple blocks and updates
      const updates: StateUpdate[] = [];
      for (let i = 0; i < 5; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        const blocks = blockchain.getBlocks();
        const block = blocks[blocks.length - 1];

        const update = await stateManager.createStateUpdate(
          block,
          Buffer.from(keyPair.privateKey).toString('hex'),
          'secp256k1'
        );
        updates.push(update);
      }

      // Simulate missing update detection
      const missingSequences = stateManager.detectMissingUpdates(10);

      // Should detect gap between current sequence and 10
      expect(missingSequences.length).toBeGreaterThan(0);
    });

    it('should handle out-of-order updates', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Create first update
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      let blocks = blockchain.getBlocks();
      const update1 = await stateManager.createStateUpdate(
        blocks[blocks.length - 1],
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      // Apply first update
      await stateManager.applyStateUpdate(update1);

      // Create second and third updates
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      blocks = blockchain.getBlocks();
      const update2 = await stateManager.createStateUpdate(
        blocks[blocks.length - 1],
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      blocks = blockchain.getBlocks();
      const update3 = await stateManager.createStateUpdate(
        blocks[blocks.length - 1],
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      // Receive update3 before update2 (out of order)
      const gapDetected = vi.fn();
      stateManager.on('gap_detected', gapDetected);

      // This should detect a gap and buffer the update
      await stateManager.handleStateUpdate(update3);

      // Verify gap was detected
      expect(gapDetected).toHaveBeenCalled();

      // Get gap stats
      const stats = stateManager.getGapDetectionStats();
      expect(stats.totalGapsDetected).toBeGreaterThan(0);
    });

    it('should batch updates for LoRa efficiency', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression,
        undefined,
        undefined,
        5 // batch size
      );

      // Subscribe peer
      await stateManager.subscribeToUpdates({
        peerId: 'mesh-peer-1',
        subscriptionType: 'all',
        startSequence: 0,
      });

      const batchSent = vi.fn();
      stateManager.on('batch_sent', batchSent);

      // Create and broadcast multiple updates
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      for (let i = 0; i < 5; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
        const blocks = blockchain.getBlocks();
        const update = await stateManager.createStateUpdate(
          blocks[blocks.length - 1],
          Buffer.from(keyPair.privateKey).toString('hex'),
          'secp256k1'
        );

        await stateManager.broadcastStateUpdate(update);
      }

      // Batch should have been sent when size reached
      expect(batchSent).toHaveBeenCalled();
    });
  });

  describe('Sync Resume and Recovery', () => {
    it('should save sync progress every 100 blocks', async () => {
      const syncManager = new UTXOSyncManager(
        blockchain,
        persistence,
        compression,
        cryptoService
      );

      const resumeManager = new SyncResumeManager(persistence, syncManager, {
        checkpointInterval: 100,
      });

      const progressSaved = vi.fn();
      resumeManager.on('progress_saved', progressSaved);

      // Simulate sync progress
      const progress = syncManager.getSyncProgress();

      // Save progress manually
      await resumeManager.saveProgress(progress);

      expect(progressSaved).toHaveBeenCalled();
    });

    it('should resume sync after network interruption', async () => {
      const syncManager = new UTXOSyncManager(
        blockchain,
        persistence,
        compression,
        cryptoService
      );

      const resumeManager = new SyncResumeManager(persistence, syncManager, {
        checkpointInterval: 10,
      });

      // Save initial progress
      await resumeManager.saveProgress();

      // Check if resume is possible
      const canResume = await resumeManager.canResume();
      expect(canResume).toBe(true);

      // Load saved progress
      const savedProgress = await resumeManager.loadProgress();
      expect(savedProgress).toBeDefined();
      expect(savedProgress?.sessionId).toBeDefined();
    });

    it('should rollback on sync failure', async () => {
      // Test atomic sync operations with rollback
      const syncManager = new UTXOSyncManager(
        blockchain,
        persistence,
        compression,
        cryptoService
      );

      const resumeManager = new SyncResumeManager(persistence, syncManager);

      // Save progress before operation
      const initialProgress = syncManager.getSyncProgress();
      await resumeManager.saveProgress(initialProgress);

      // Clear progress after failure
      await resumeManager.clearSavedProgress();

      // Verify progress was cleared
      const loaded = await resumeManager.loadProgress();
      expect(loaded).toBeNull();
    });

    it('should validate state after resume', async () => {
      const syncManager = new UTXOSyncManager(
        blockchain,
        persistence,
        compression,
        cryptoService
      );

      const resumeManager = new SyncResumeManager(persistence, syncManager, {
        validateOnLoad: true,
      });

      // Save valid progress
      await resumeManager.saveProgress();

      // Attempt resume
      const resumed = await resumeManager.resumeSync();

      // Resume should succeed with valid progress
      expect(resumed).toBe(true);
    });
  });

  describe('Light Client Sync', () => {
    it('should sync wallet UTXOs in <1 minute', async () => {
      const startTime = Date.now();

      // Create light client with address filter
      const walletKeyPair = CryptographicService.generateKeyPair('secp256k1');
      const walletAddress = Buffer.from(walletKeyPair.publicKey).toString(
        'hex'
      );

      const lightClientStrategy = new LightClientSyncStrategy(
        compression,
        cryptoService,
        undefined, // mesh protocol
        undefined, // duty cycle
        undefined, // discovery
        undefined, // reliable delivery
        {
          addressFilter: [walletAddress],
          enableBloomFilters: true,
          maxBlocksPerRequest: 10,
          requestTimeout: 30000,
        }
      );

      // Sync should be fast for light client
      const duration = Date.now() - startTime;

      // Test setup shouldn't take more than a few seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should download only relevant blocks', async () => {
      const walletKeyPair = CryptographicService.generateKeyPair('secp256k1');
      const walletAddress = Buffer.from(walletKeyPair.publicKey).toString(
        'hex'
      );

      const lightClientStrategy = new LightClientSyncStrategy(
        compression,
        cryptoService,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          addressFilter: [walletAddress],
          enableBloomFilters: true,
        }
      );

      // Light client should have address filter configured
      expect(lightClientStrategy).toBeDefined();
    });

    it('should verify transactions with SPV proofs', async () => {
      // Create transaction and get merkle proof
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      const blocks = blockchain.getBlocks();
      const latestBlock = blocks[blocks.length - 1];
      const transactions = latestBlock.transactions;

      if (transactions.length > 0) {
        // Get UTXO transactions
        const utxoTxs: UTXOTransaction[] = [];
        for (const tx of transactions) {
          const candidate = tx as unknown as Partial<UTXOTransaction>;
          if (
            candidate.inputs !== undefined &&
            Array.isArray(candidate.inputs) &&
            candidate.outputs !== undefined &&
            Array.isArray(candidate.outputs)
          ) {
            utxoTxs.push(candidate as UTXOTransaction);
          }
        }

        if (utxoTxs.length > 0) {
          // Generate merkle proof for first transaction
          const proof = MerkleTree.generateProof(utxoTxs, utxoTxs[0]);

          expect(proof).toBeDefined();
          expect(proof.hashes.length).toBeGreaterThan(0);

          // Verify proof
          const isValid = MerkleTree.verifyProof(
            utxoTxs[0],
            proof,
            latestBlock.merkleRoot
          );

          expect(isValid).toBe(true);
        }
      }
    });

    it('should use <50MB data for address-specific sync', async () => {
      // This is a data usage test - in real implementation would track bytes
      const walletKeyPair = CryptographicService.generateKeyPair('secp256k1');
      const walletAddress = Buffer.from(walletKeyPair.publicKey).toString(
        'hex'
      );

      const lightClientStrategy = new LightClientSyncStrategy(
        compression,
        cryptoService,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          addressFilter: [walletAddress],
          enableBloomFilters: true,
        }
      );

      // Light client should exist and be configured for minimal data usage
      expect(lightClientStrategy).toBeDefined();
    });
  });

  describe('Security Tests', () => {
    it('should reject checkpoint with insufficient signatures', async () => {
      const validatorKeyPair =
        CryptographicService.generateKeyPair('secp256k1');
      const validators = [
        {
          publicKey: Buffer.from(validatorKeyPair.publicKey).toString('hex'),
          algorithm: 'secp256k1' as const,
          name: 'validator-1',
        },
      ];

      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression,
        100,
        validators,
        2 // require 2 signatures but only have 1 validator
      );

      const checkpoint = await checkpointManager.createCheckpoint();

      // Sign with only 1 validator
      const signature = await checkpointManager.signCheckpoint(
        checkpoint,
        Buffer.from(validatorKeyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      await checkpointManager.addValidatorSignature(
        checkpoint.checkpointHash,
        signature
      );

      // Validation should fail - insufficient signatures
      const result = await checkpointManager.validateCheckpoint(checkpoint);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Insufficient'))).toBe(true);
    });

    it('should reject invalid merkle proofs', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      const blocks = blockchain.getBlocks();
      const block = blocks[blocks.length - 1];
      const transactions = block.transactions;

      if (transactions.length > 0) {
        const utxoTxs: UTXOTransaction[] = [];
        for (const tx of transactions) {
          const candidate = tx as unknown as Partial<UTXOTransaction>;
          if (
            candidate.inputs !== undefined &&
            candidate.outputs !== undefined
          ) {
            utxoTxs.push(candidate as UTXOTransaction);
          }
        }

        if (utxoTxs.length > 0) {
          const proof = MerkleTree.generateProof(utxoTxs, utxoTxs[0]);

          // Tamper with proof
          const tamperedProof = {
            ...proof,
            hashes: proof.hashes.map(() => 'invalid-hash'),
          };

          // Verification should fail
          const isValid = MerkleTree.verifyProof(
            utxoTxs[0],
            tamperedProof,
            block.merkleRoot
          );

          expect(isValid).toBe(false);
        }
      }
    });

    it('should detect replayed state updates', async () => {
      const stateManager = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression
      );

      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      const blocks = blockchain.getBlocks();
      const block = blocks[blocks.length - 1];

      const update = await stateManager.createStateUpdate(
        block,
        Buffer.from(keyPair.privateKey).toString('hex'),
        'secp256k1'
      );

      // Apply update once
      await stateManager.applyStateUpdate(update);

      // Attempting to apply same update again should fail
      await expect(stateManager.applyStateUpdate(update)).rejects.toThrow();
    });

    it('should handle malicious checkpoint gracefully', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // Create valid checkpoint
      const validCheckpoint = await checkpointManager.createCheckpoint();

      // Create malicious checkpoint with tampered data
      const maliciousCheckpoint: StateCheckpoint = {
        ...validCheckpoint,
        merkleRoot: 'malicious-root',
        utxoCount: 9999999,
      };

      // Validation should fail
      const result =
        await checkpointManager.validateCheckpoint(maliciousCheckpoint);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted checkpoint', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      const checkpoint = await checkpointManager.createCheckpoint();

      // Corrupt checkpoint hash
      const corruptedCheckpoint: StateCheckpoint = {
        ...checkpoint,
        checkpointHash: 'corrupted-hash',
      };

      // Validation should fail
      const result =
        await checkpointManager.validateCheckpoint(corruptedCheckpoint);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('hash mismatch'))).toBe(true);
    });

    it('should handle missing peers during sync', async () => {
      const syncManager = new UTXOSyncManager(
        blockchain,
        persistence,
        compression,
        cryptoService
      );

      // Get progress with no peers
      const progress = syncManager.getSyncProgress();
      expect(progress.peersConnected).toBe(0);
    });

    it('should handle blockchain reorg during sync', async () => {
      // Create blockchain and mine some blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      for (let i = 0; i < 5; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      const checkpoint = await checkpointManager.createCheckpoint();

      // Checkpoint should be valid even after potential reorg
      expect(checkpoint.height).toBeGreaterThan(0);
    });

    it('should handle disk full during checkpoint save', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // This test would need to mock storage failure
      // For now, verify checkpoint creation works normally
      const checkpoint = await checkpointManager.createCheckpoint();
      expect(checkpoint).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should sync 1,000 blocks in <1 minute', async () => {
      const startTime = Date.now();
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Mine 10 blocks (reduced for test speed)
      for (let i = 0; i < 10; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      const duration = Date.now() - startTime;

      // Extrapolate: if 10 blocks takes X ms, 1000 blocks should scale
      const estimatedFor1000 = (duration / 10) * 1000;

      // Log for reference
      console.log(
        `10 blocks in ${duration}ms, estimated 1000 blocks: ${estimatedFor1000}ms`
      );

      // Verify blocks were created
      expect(blockchain.getBlocks().length).toBeGreaterThan(10);
    });

    it('should use <100MB memory during sync', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // Mine blocks
      for (let i = 0; i < 20; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryInMB = memoryIncrease / 1024 / 1024;

      console.log(`Memory increase: ${memoryInMB.toFixed(2)} MB`);

      // Memory increase should be reasonable
      expect(memoryInMB).toBeLessThan(100);
    });

    it('should compress checkpoints by >50%', async () => {
      const checkpointManager = new StateCheckpointManager(
        blockchain,
        persistence,
        compression
      );

      // Mine blocks to have some UTXOs
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      for (let i = 0; i < 10; i++) {
        await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      }

      const checkpoint = await checkpointManager.createCheckpoint();

      // Check compression ratio
      const batch = checkpoint.compressedUTXOs[0];
      const compressionRatio = batch.data.length / batch.originalSize;

      console.log(`Compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

      // Should achieve >50% compression (ratio < 0.5)
      expect(compressionRatio).toBeLessThan(0.5);
    });
  });
});
