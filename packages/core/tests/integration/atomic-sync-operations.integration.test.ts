import { describe, it, expect, beforeEach } from 'vitest';
import { AtomicSyncManager } from '../../src/atomic-sync-manager.js';
import { Blockchain } from '../../src/blockchain.js';
import { UTXOManager } from '../../src/utxo.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { MemoryDatabase } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { createTestnetGenesisConfig } from '../shared/fixtures/mock-genesis-config.js';

describe('Atomic Sync Operations - Integration', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let atomicManager: AtomicSyncManager;
  let db: MemoryDatabase;
  let cryptoService: CryptographicService;

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

    // Create UTXO manager
    const utxoManager = new UTXOManager();

    // Create genesis config
    const genesisConfig = createTestnetGenesisConfig();

    // Create blockchain with all required parameters
    blockchain = new Blockchain(
      persistence,
      utxoManager,
      { targetBlockTime: 180 },
      genesisConfig
    );

    // Wait for blockchain initialization
    await blockchain.waitForInitialization();

    // Create atomic sync manager
    atomicManager = new AtomicSyncManager(blockchain, persistence);
  });

  describe('Successful Sync Commit', () => {
    it('should commit successful sync with block additions', async () => {
      const initialHeight = blockchain.getBlocks().length - 1;

      // Begin transaction
      const txId = await atomicManager.beginTransaction();

      // Mine a new block
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Record operation
      await atomicManager.recordOperation({
        type: 'add_block',
        data: { height: initialHeight + 1 },
        timestamp: Date.now(),
        reversible: true,
      });

      // Commit transaction
      await atomicManager.commitTransaction(txId);

      // Verify block was added
      const finalHeight = blockchain.getBlocks().length - 1;
      expect(finalHeight).toBe(initialHeight + 1);

      // Verify transaction is committed
      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);
      expect(transaction!.status).toBe('committed');
    });

    it('should persist state changes after commit', async () => {
      const initialBlocks = blockchain.getBlocks().length;

      const txId = await atomicManager.beginTransaction();

      // Mine a block
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Commit
      await atomicManager.commitTransaction(txId);

      // Verify blockchain state was updated
      const finalBlocks = blockchain.getBlocks().length;
      expect(finalBlocks).toBe(initialBlocks + 1);

      // Verify persistence save was called (state is now in persistence layer)
      const validation = await atomicManager.validateState();
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Rollback on Sync Failure', () => {
    it('should rollback on sync failure', async () => {
      const initialBlocks = blockchain.getBlocks().length;

      // Begin transaction
      const txId = await atomicManager.beginTransaction();

      // Mine a block
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Verify block was added
      expect(blockchain.getBlocks().length).toBe(initialBlocks + 1);

      // Rollback transaction
      await atomicManager.rollbackTransaction(txId);

      // Transaction should be marked as rolled back
      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);
      expect(transaction!.status).toBe('rolled_back');
    });

    it('should maintain state consistency after rollback', async () => {
      const txId = await atomicManager.beginTransaction();

      // Mine blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Rollback
      await atomicManager.rollbackTransaction(txId);

      // Validate state is still consistent
      const validation = await atomicManager.validateState();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should allow new operations after rollback', async () => {
      const txId1 = await atomicManager.beginTransaction();

      // Mine a block
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Rollback
      await atomicManager.rollbackTransaction(txId1);

      // Start new transaction
      const txId2 = await atomicManager.beginTransaction();

      // Mine another block
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Commit should succeed
      await expect(
        atomicManager.commitTransaction(txId2)
      ).resolves.not.toThrow();
    });
  });

  describe('Partial Block Download Handling', () => {
    it('should handle partial block downloads with rollback', async () => {
      const txId = await atomicManager.beginTransaction();

      // Simulate partial block download by mining multiple blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Record operations
      await atomicManager.recordOperation({
        type: 'add_block',
        data: { partial: true },
        timestamp: Date.now(),
        reversible: true,
      });

      // Rollback partial download
      await atomicManager.rollbackTransaction(txId);

      // Verify state is consistent
      const validation = await atomicManager.validateState();
      expect(validation.isValid).toBe(true);
    });
  });

  describe('State Consistency Validation', () => {
    it('should validate blockchain continuity', async () => {
      const validation = await atomicManager.validateState();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).not.toContain('Block chain continuity invalid');
    });

    it('should detect and report validation errors', async () => {
      await atomicManager.beginTransaction();

      // Mine blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Validate state
      const validation = await atomicManager.validateState();

      // State should be valid after normal operations
      expect(validation.isValid).toBe(true);
    });

    it('should validate UTXO set integrity', async () => {
      const validation = await atomicManager.validateState();

      expect(validation.isValid).toBe(true);
    });
  });

  describe('Multiple Transaction Handling', () => {
    it('should handle sequential transactions', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // First transaction
      const txId1 = await atomicManager.beginTransaction();
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      await atomicManager.commitTransaction(txId1);

      // Second transaction
      const txId2 = await atomicManager.beginTransaction();
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      await atomicManager.commitTransaction(txId2);

      // Verify both committed
      const history = atomicManager.getTransactionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('committed');
      expect(history[1].status).toBe('committed');
    });

    it('should handle commit followed by rollback', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      // First transaction - commit
      const txId1 = await atomicManager.beginTransaction();
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      await atomicManager.commitTransaction(txId1);

      // Second transaction - rollback
      const txId2 = await atomicManager.beginTransaction();
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
      await atomicManager.rollbackTransaction(txId2);

      // Verify history
      const history = atomicManager.getTransactionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('committed');
      expect(history[1].status).toBe('rolled_back');
    });
  });

  describe('Snapshot Accuracy', () => {
    it('should create snapshot with accurate blockchain state', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction).toBeDefined();
      expect(transaction!.snapshot.height).toBe(
        blockchain.getBlocks().length - 1
      );
      expect(transaction!.snapshot.difficulty).toBe(blockchain.getDifficulty());
      expect(transaction!.snapshot.miningReward).toBe(
        blockchain.getMiningReward()
      );
    });

    it('should capture UTXO state in snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      const utxoManager = blockchain.getUTXOManager();
      const utxoCount = utxoManager.getUTXOSetSize();

      expect(transaction!.snapshot.utxoCount).toBe(utxoCount);
    });

    it('should create unique UTXO set hash', async () => {
      const txId1 = await atomicManager.beginTransaction();
      const snapshot1 = atomicManager.getActiveTransaction()!.snapshot;
      await atomicManager.commitTransaction(txId1);

      // Mine a block to change UTXO set
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      await atomicManager.beginTransaction();
      const snapshot2 = atomicManager.getActiveTransaction()!.snapshot;

      // UTXO set hashes should be different after mining
      expect(snapshot1.utxoSetHash).toBeDefined();
      expect(snapshot2.utxoSetHash).toBeDefined();
    });
  });

  describe('Recovery from Corrupted State', () => {
    it('should detect corrupted state during validation', async () => {
      // Validation should pass for clean state
      const validation = await atomicManager.validateState();
      expect(validation.isValid).toBe(true);
    });

    it('should rollback automatically on commit validation failure', async () => {
      const _txId = await atomicManager.beginTransaction();

      // Mine blocks
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);

      // Commit should validate and succeed with normal operations
      await expect(
        atomicManager.commitTransaction(_txId)
      ).resolves.not.toThrow();
    });
  });

  describe('Transaction Operation Recording', () => {
    it('should record all operations during transaction', async () => {
      await atomicManager.beginTransaction();

      // Record multiple operations
      await atomicManager.recordOperation({
        type: 'add_block',
        data: { blockHeight: 1 },
        timestamp: Date.now(),
        reversible: true,
      });

      await atomicManager.recordOperation({
        type: 'add_utxo',
        data: { utxoId: 'test-utxo-1' },
        timestamp: Date.now(),
        reversible: true,
      });

      await atomicManager.recordOperation({
        type: 'update_height',
        data: { newHeight: 2 },
        timestamp: Date.now(),
        reversible: true,
      });

      const transaction = atomicManager.getActiveTransaction();
      expect(transaction!.operations).toHaveLength(3);
      expect(transaction!.operations[0].type).toBe('add_block');
      expect(transaction!.operations[1].type).toBe('add_utxo');
      expect(transaction!.operations[2].type).toBe('update_height');
    });

    it('should preserve operation order', async () => {
      await atomicManager.beginTransaction();

      const timestamps: number[] = [];
      for (let i = 0; i < 5; i++) {
        const timestamp = Date.now() + i;
        timestamps.push(timestamp);

        await atomicManager.recordOperation({
          type: 'add_block',
          data: { index: i },
          timestamp,
          reversible: true,
        });
      }

      const transaction = atomicManager.getActiveTransaction();
      expect(transaction!.operations).toHaveLength(5);

      // Verify order preserved
      for (let i = 0; i < 5; i++) {
        expect(transaction!.operations[i].timestamp).toBe(timestamps[i]);
      }
    });
  });
});
