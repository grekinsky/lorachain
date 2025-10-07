import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AtomicSyncManager,
  TransactionError,
  RollbackError,
  StateValidationError,
  type BlockchainSnapshot,
} from '../../src/atomic-sync-manager.js';
import { Blockchain } from '../../src/blockchain.js';
import { UTXOManager } from '../../src/utxo.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { MemoryDatabase } from '../../src/database.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { createTestnetGenesisConfig } from '../shared/fixtures/mock-genesis-config.js';

describe('AtomicSyncManager', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let atomicManager: AtomicSyncManager;
  let db: MemoryDatabase;

  beforeEach(async () => {
    // Create in-memory database
    db = new MemoryDatabase({
      dbPath: ':memory:',
      compressionType: 'gzip',
    });

    // Create persistence manager
    const cryptoService = new CryptographicService();
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

  describe('beginTransaction', () => {
    it('should create blockchain snapshot', async () => {
      const txId = await atomicManager.beginTransaction();

      expect(txId).toBeDefined();
      expect(typeof txId).toBe('string');
      expect(txId.length).toBe(16);
    });

    it('should generate unique transaction ID', async () => {
      const txId1 = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId1);

      const txId2 = await atomicManager.beginTransaction();

      expect(txId1).not.toBe(txId2);
    });

    it('should prevent concurrent transactions', async () => {
      await atomicManager.beginTransaction();

      await expect(atomicManager.beginTransaction()).rejects.toThrow(
        TransactionError
      );
    });

    it('should emit transaction_started event', async () => {
      const eventSpy = vi.fn();
      atomicManager.on('transaction_started', eventSpy);

      const txId = await atomicManager.beginTransaction();

      expect(eventSpy).toHaveBeenCalledWith(txId);
    });

    it('should store transaction in history', async () => {
      const txId = await atomicManager.beginTransaction();
      const history = atomicManager.getTransactionHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(txId);
      expect(history[0].status).toBe('pending');
    });

    it('should capture current blockchain height in snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction).toBeDefined();
      expect(transaction!.snapshot.height).toBe(0); // Genesis block only
    });

    it('should capture UTXO count in snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction).toBeDefined();
      expect(transaction!.snapshot.utxoCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('commitTransaction', () => {
    it('should validate state before commit', async () => {
      const txId = await atomicManager.beginTransaction();

      // Should succeed with valid state
      await expect(
        atomicManager.commitTransaction(txId)
      ).resolves.not.toThrow();
    });

    it('should mark transaction as committed', async () => {
      const txId = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId);

      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);

      expect(transaction).toBeDefined();
      expect(transaction!.status).toBe('committed');
    });

    it('should emit transaction_committed event', async () => {
      const eventSpy = vi.fn();
      atomicManager.on('transaction_committed', eventSpy);

      const txId = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId);

      expect(eventSpy).toHaveBeenCalledWith(txId);
    });

    it('should clear active transaction after commit', async () => {
      const txId = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId);

      const activeTransaction = atomicManager.getActiveTransaction();
      expect(activeTransaction).toBeUndefined();
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        atomicManager.commitTransaction('invalid-tx-id')
      ).rejects.toThrow(TransactionError);
    });

    it('should throw error for already committed transaction', async () => {
      const _txId = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(_txId);

      await expect(atomicManager.commitTransaction(_txId)).rejects.toThrow(
        TransactionError
      );
    });

    it('should rollback on validation failure', async () => {
      const _txId = await atomicManager.beginTransaction();

      // Mock validation to fail
      const validateStateSpy = vi.spyOn(atomicManager, 'validateState');
      validateStateSpy.mockResolvedValueOnce({
        isValid: false,
        errors: ['Test validation error'],
        warnings: [],
      });

      await expect(atomicManager.commitTransaction(_txId)).rejects.toThrow(
        StateValidationError
      );

      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === _txId);
      expect(transaction!.status).toBe('rolled_back');
    });
  });

  describe('rollbackTransaction', () => {
    it('should restore blockchain snapshot', async () => {
      const txId = await atomicManager.beginTransaction();
      const initialHeight = blockchain.getBlocks().length - 1;

      // Rollback should maintain the same height
      await atomicManager.rollbackTransaction(txId);

      const finalHeight = blockchain.getBlocks().length - 1;
      expect(finalHeight).toBe(initialHeight);
    });

    it('should mark transaction as rolled back', async () => {
      const txId = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId);

      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);

      expect(transaction).toBeDefined();
      expect(transaction!.status).toBe('rolled_back');
    });

    it('should emit transaction_rolled_back event', async () => {
      const eventSpy = vi.fn();
      atomicManager.on('transaction_rolled_back', eventSpy);

      const txId = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId);

      expect(eventSpy).toHaveBeenCalledWith(txId);
    });

    it('should clear active transaction after rollback', async () => {
      const txId = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId);

      const activeTransaction = atomicManager.getActiveTransaction();
      expect(activeTransaction).toBeUndefined();
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        atomicManager.rollbackTransaction('invalid-tx-id')
      ).rejects.toThrow(TransactionError);
    });

    it('should handle rollback errors gracefully', async () => {
      const txId = await atomicManager.beginTransaction();

      // Mock restoreSnapshot to throw error
      const restoreSnapshotSpy = vi.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        atomicManager as any,
        'restoreSnapshot'
      );
      restoreSnapshotSpy.mockRejectedValueOnce(
        new Error('Test rollback error')
      );

      await expect(atomicManager.rollbackTransaction(txId)).rejects.toThrow(
        RollbackError
      );
    });
  });

  describe('recordOperation', () => {
    it('should record operation in active transaction', async () => {
      await atomicManager.beginTransaction();

      await atomicManager.recordOperation({
        type: 'add_block',
        data: { blockHash: 'test-hash' },
        timestamp: Date.now(),
        reversible: true,
      });

      const transaction = atomicManager.getActiveTransaction();
      expect(transaction).toBeDefined();
      expect(transaction!.operations).toHaveLength(1);
      expect(transaction!.operations[0].type).toBe('add_block');
    });

    it('should throw error when no active transaction', async () => {
      await expect(
        atomicManager.recordOperation({
          type: 'add_utxo',
          data: {},
          timestamp: Date.now(),
          reversible: true,
        })
      ).rejects.toThrow(TransactionError);
    });

    it('should record multiple operations', async () => {
      await atomicManager.beginTransaction();

      await atomicManager.recordOperation({
        type: 'add_block',
        data: {},
        timestamp: Date.now(),
        reversible: true,
      });

      await atomicManager.recordOperation({
        type: 'add_utxo',
        data: {},
        timestamp: Date.now(),
        reversible: true,
      });

      const transaction = atomicManager.getActiveTransaction();
      expect(transaction!.operations).toHaveLength(2);
    });
  });

  describe('state validation', () => {
    it('should validate blockchain height', async () => {
      const result = await atomicManager.validateState();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate chain continuity', async () => {
      const result = await atomicManager.validateState();

      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain('Block chain continuity invalid');
    });

    it('should validate UTXO set integrity', async () => {
      const result = await atomicManager.validateState();

      expect(result.isValid).toBe(true);
    });

    it('should detect invalid blockchain height', async () => {
      // Mock getBlocks to return empty array
      const getBlocksSpy = vi.spyOn(blockchain, 'getBlocks');
      getBlocksSpy.mockReturnValueOnce([]);

      const result = await atomicManager.validateState();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid blockchain height');
    });

    it('should handle validation exceptions', async () => {
      // Mock validateChain to throw error
      const validateChainSpy = vi.spyOn(blockchain, 'validateChain');
      validateChainSpy.mockRejectedValueOnce(
        new Error('Test validation error')
      );

      const result = await atomicManager.validateState();

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('snapshot and restore', () => {
    it('should create accurate snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction).toBeDefined();
      expect(transaction!.snapshot).toBeDefined();
      expect(transaction!.snapshot.height).toBe(0);
      expect(transaction!.snapshot.timestamp).toBeGreaterThan(0);
      expect(transaction!.snapshot.difficulty).toBe(4); // Testnet initial difficulty
      expect(transaction!.snapshot.miningReward).toBe(50);
    });

    it('should capture merkle root in snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction!.snapshot.merkleRoot).toBeDefined();
    });

    it('should capture UTXO set hash in snapshot', async () => {
      await atomicManager.beginTransaction();
      const transaction = atomicManager.getActiveTransaction();

      expect(transaction!.snapshot.utxoSetHash).toBeDefined();
      expect(typeof transaction!.snapshot.utxoSetHash).toBe('string');
    });

    it('should handle invalid snapshots', async () => {
      const invalidSnapshot: BlockchainSnapshot = {
        height: -1,
        merkleRoot: '',
        utxoSetHash: '',
        utxoCount: 0,
        timestamp: Date.now(),
        difficulty: 2,
        miningReward: 50,
      };

      await expect(
        (atomicManager as any).restoreSnapshot(invalidSnapshot)
      ).rejects.toThrow('Invalid snapshot');
    });

    it('should validate state after restore', async () => {
      const _txId = await atomicManager.beginTransaction();

      // Rollback should validate restored state
      await atomicManager.rollbackTransaction(_txId);

      const validation = await atomicManager.validateState();
      expect(validation.isValid).toBe(true);
    });
  });

  describe('transaction lifecycle', () => {
    it('should complete full commit lifecycle', async () => {
      const txId = await atomicManager.beginTransaction();
      expect(atomicManager.getActiveTransaction()).toBeDefined();

      await atomicManager.commitTransaction(txId);
      expect(atomicManager.getActiveTransaction()).toBeUndefined();

      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);
      expect(transaction!.status).toBe('committed');
    });

    it('should complete full rollback lifecycle', async () => {
      const txId = await atomicManager.beginTransaction();
      expect(atomicManager.getActiveTransaction()).toBeDefined();

      await atomicManager.rollbackTransaction(txId);
      expect(atomicManager.getActiveTransaction()).toBeUndefined();

      const history = atomicManager.getTransactionHistory();
      const transaction = history.find(tx => tx.id === txId);
      expect(transaction!.status).toBe('rolled_back');
    });

    it('should allow new transaction after commit', async () => {
      const txId1 = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId1);

      const txId2 = await atomicManager.beginTransaction();
      expect(txId2).toBeDefined();
      expect(txId2).not.toBe(txId1);
    });

    it('should allow new transaction after rollback', async () => {
      const txId1 = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId1);

      const txId2 = await atomicManager.beginTransaction();
      expect(txId2).toBeDefined();
      expect(txId2).not.toBe(txId1);
    });
  });

  describe('error handling', () => {
    it('should throw TransactionError for invalid operations', async () => {
      await expect(
        atomicManager.commitTransaction('non-existent')
      ).rejects.toThrow(TransactionError);
    });

    it('should throw RollbackError on restore failure', async () => {
      const txId = await atomicManager.beginTransaction();

      // Mock restoreSnapshot to fail
      vi.spyOn(atomicManager as any, 'restoreSnapshot').mockRejectedValueOnce(
        new Error('Restore failed')
      );

      await expect(atomicManager.rollbackTransaction(txId)).rejects.toThrow(
        RollbackError
      );
    });

    it('should throw StateValidationError on validation failure', async () => {
      const _txId = await atomicManager.beginTransaction();

      // Mock validation to fail
      vi.spyOn(atomicManager, 'validateState').mockResolvedValueOnce({
        isValid: false,
        errors: ['Validation failed'],
        warnings: [],
      });

      await expect(atomicManager.commitTransaction(_txId)).rejects.toThrow(
        StateValidationError
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('should return empty array initially', () => {
      const history = atomicManager.getTransactionHistory();
      expect(history).toEqual([]);
    });

    it('should track multiple transactions', async () => {
      const txId1 = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId1);

      const txId2 = await atomicManager.beginTransaction();
      await atomicManager.rollbackTransaction(txId2);

      const history = atomicManager.getTransactionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(txId1);
      expect(history[1].id).toBe(txId2);
    });
  });

  describe('getActiveTransaction', () => {
    it('should return undefined when no active transaction', () => {
      const active = atomicManager.getActiveTransaction();
      expect(active).toBeUndefined();
    });

    it('should return active transaction', async () => {
      const txId = await atomicManager.beginTransaction();
      const active = atomicManager.getActiveTransaction();

      expect(active).toBeDefined();
      expect(active!.id).toBe(txId);
    });

    it('should return undefined after commit', async () => {
      const txId = await atomicManager.beginTransaction();
      await atomicManager.commitTransaction(txId);

      const active = atomicManager.getActiveTransaction();
      expect(active).toBeUndefined();
    });
  });
});
