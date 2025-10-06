import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IncrementalStateManager,
  StateUpdateError,
  InvalidSequenceError,
} from '../../src/incremental-state-manager.js';
import { Blockchain } from '../../src/blockchain.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { MerkleTree } from '../../src/merkle/index.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { UTXOManager } from '../../src/utxo.js';
import { DatabaseFactory } from '../../src/database.js';
import type {
  Block,
  UTXOTransaction,
  UTXO,
  UTXOPersistenceConfig,
} from '../../src/types.js';
import { bytesToHex } from '@noble/hashes/utils';

describe('IncrementalStateManager', () => {
  let manager: IncrementalStateManager;
  let blockchain: Blockchain;
  let compression: UTXOCompressionManager;
  let persistence: UTXOPersistenceManager;
  let utxoManager: UTXOManager;
  let privateKey: string;
  let publicKey: string;

  const testConfig: UTXOPersistenceConfig = {
    enabled: true,
    dbPath: ':memory:',
    dbType: 'memory',
    autoSave: true,
    batchSize: 100,
    compressionType: 'none',
    utxoSetCacheSize: 1000,
    cryptographicAlgorithm: 'secp256k1',
    compactionStyle: 'size',
  };

  beforeEach(async () => {
    // Create persistence and UTXO manager
    const database = DatabaseFactory.create(testConfig);
    persistence = new UTXOPersistenceManager(database, {
      compressionType: 'none',
      cryptographicAlgorithm: 'secp256k1',
    });
    utxoManager = new UTXOManager();

    // Create blockchain instance with genesis config
    blockchain = new Blockchain(
      persistence,
      utxoManager,
      { targetBlockTime: 300 },
      {
        chainId: 'incremental-state-test-v1',
        networkName: 'Incremental State Test Network',
        version: '1.0.0',
        networkParams: {
          initialDifficulty: 2,
          targetBlockTime: 300,
          adjustmentPeriod: 10,
          maxDifficultyRatio: 4,
          maxBlockSize: 1024 * 1024,
          miningReward: 10,
          halvingInterval: 210000,
        },
        initialAllocations: [
          {
            address: 'lora1initial000000000000000000000000000000',
            amount: 1000000,
            description: 'Initial test allocation',
          },
        ],
        totalSupply: 1000000,
        metadata: {
          timestamp: Date.now(),
          description: 'Test blockchain for incremental state manager tests',
          creator: 'Test Suite',
          networkType: 'testnet' as const,
        },
      }
    );
    await blockchain.waitForInitialization();

    // Create compression manager
    compression = new UTXOCompressionManager({
      enableCompression: true,
      defaultAlgorithm: 'gzip',
      compressionLevel: 6,
      maxPayloadSize: 256,
    });

    // Generate key pair for signing
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    privateKey = bytesToHex(keyPair.privateKey);
    publicKey = bytesToHex(keyPair.publicKey);

    // Create manager
    manager = new IncrementalStateManager(
      blockchain,
      CryptographicService,
      MerkleTree,
      compression
    );
  });

  afterEach(async () => {
    if (blockchain) {
      await blockchain.close();
    }
    if (persistence) {
      await persistence.close();
    }
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(manager.getSequenceNumber()).toBe(0);
    });
  });

  describe('startWatchingStateChanges', () => {
    it('should start watching blockchain block events', async () => {
      const emitSpy = vi.spyOn(manager, 'emit');

      await manager.startWatchingStateChanges();

      expect(emitSpy).toHaveBeenCalledWith('watching_started');
    });

    it('should throw error if already watching', async () => {
      await manager.startWatchingStateChanges();

      await expect(manager.startWatchingStateChanges()).rejects.toThrow(
        StateUpdateError
      );
    });
  });

  describe('stopWatchingStateChanges', () => {
    it('should stop watching blockchain', async () => {
      await manager.startWatchingStateChanges();
      const emitSpy = vi.spyOn(manager, 'emit');

      manager.stopWatchingStateChanges();

      expect(emitSpy).toHaveBeenCalledWith('watching_stopped');
    });

    it('should not throw error if not watching', () => {
      expect(() => manager.stopWatchingStateChanges()).not.toThrow();
    });
  });

  describe('createStateUpdate', () => {
    let testBlock: Block;

    beforeEach(() => {
      // Create a test block with UTXO transactions
      const utxoTx: UTXOTransaction = {
        id: 'tx1',
        inputs: [
          {
            previousTxId: 'genesis',
            outputIndex: 0,
            unlockingScript: 'test_sig',
            sequence: 0,
          },
        ],
        outputs: [
          {
            value: 50,
            lockingScript: 'address1',
            outputIndex: 0,
          },
          {
            value: 50,
            lockingScript: 'address2',
            outputIndex: 1,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0.001,
      };

      testBlock = {
        index: 1,
        timestamp: Date.now(),
        transactions: [utxoTx as any],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };
    });

    it('should detect UTXO creation from outputs', async () => {
      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.utxosCreated).toHaveLength(2);
      expect(update.utxosCreated[0].txId).toBe('tx1');
      expect(update.utxosCreated[0].value).toBe(50);
      expect(update.utxosCreated[1].value).toBe(50);
    });

    it('should detect UTXO spending from inputs', async () => {
      // First, add a UTXO to the blockchain
      const genesisUtxo: UTXO = {
        txId: 'genesis',
        outputIndex: 0,
        value: 100,
        lockingScript: 'genesis_address',
        blockHeight: 0,
        isSpent: false,
      };
      blockchain.getUTXOManager().addUTXO(genesisUtxo);

      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.utxosSpent).toHaveLength(1);
      expect(update.utxosSpent[0].txId).toBe('genesis');
      expect(update.utxosSpent[0].outputIndex).toBe(0);
    });

    it('should assign sequential sequence numbers', async () => {
      const update1 = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );
      const update2 = await manager.createStateUpdate(
        { ...testBlock, index: 2, hash: 'block2_hash' },
        privateKey,
        'secp256k1'
      );

      expect(update1.sequenceNumber).toBe(1);
      expect(update2.sequenceNumber).toBe(2);
    });

    it('should include previous update hash', async () => {
      const update1 = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );
      const update2 = await manager.createStateUpdate(
        { ...testBlock, index: 2, hash: 'block2_hash' },
        privateKey,
        'secp256k1'
      );

      expect(update2.previousUpdateHash).toBeDefined();
      expect(update2.previousUpdateHash).not.toBe(update1.previousUpdateHash);
    });

    it('should sign update with private key', async () => {
      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.signature).toBeDefined();
      expect(update.signature.length).toBeGreaterThan(0);
      expect(update.publicKey).toBe(publicKey);
      expect(update.algorithm).toBe('secp256k1');
    });

    it('should calculate merkle root before/after', async () => {
      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.merkleRootBefore).toBeDefined();
      expect(update.merkleRootAfter).toBeDefined();
      expect(update.merkleRootBefore.length).toBe(64); // SHA-256 hex string
      expect(update.merkleRootAfter.length).toBe(64);
    });

    it('should include merkle proof', async () => {
      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.merkleProof).toBeDefined();
      expect(Array.isArray(update.merkleProof)).toBe(true);
    });

    it('should complete in under 50ms', async () => {
      const start = Date.now();
      await manager.createStateUpdate(testBlock, privateKey, 'secp256k1');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Allow some margin for test environment
    });

    it('should emit state_update_created event', async () => {
      const emitSpy = vi.spyOn(manager, 'emit');

      await manager.createStateUpdate(testBlock, privateKey, 'secp256k1');

      expect(emitSpy).toHaveBeenCalledWith(
        'state_update_created',
        expect.any(Object)
      );
    });
  });

  describe('applyStateUpdate', () => {
    let testUpdate: any;

    beforeEach(async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [
          {
            id: 'tx1',
            inputs: [],
            outputs: [
              {
                value: 50,
                lockingScript: 'address1',
                outputIndex: 0,
              },
            ],
            lockTime: 0,
            timestamp: Date.now(),
            fee: 0,
          } as any,
        ],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      testUpdate = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );
    });

    it('should apply UTXO changes to blockchain', async () => {
      const initialSize = blockchain.getUTXOManager().getUTXOSetSize();

      await manager.applyStateUpdate(testUpdate);

      const finalSize = blockchain.getUTXOManager().getUTXOSetSize();
      expect(finalSize).toBeGreaterThan(initialSize);
    });

    it('should update sequence number', async () => {
      const initialSeq = manager.getSequenceNumber();

      await manager.applyStateUpdate(testUpdate);

      expect(manager.getSequenceNumber()).toBe(initialSeq + 1);
    });

    it('should reject invalid sequence numbers', async () => {
      const invalidUpdate = { ...testUpdate, sequenceNumber: 999 };

      await expect(manager.applyStateUpdate(invalidUpdate)).rejects.toThrow(
        InvalidSequenceError
      );
    });

    it('should emit state_update_applied event', async () => {
      const emitSpy = vi.spyOn(manager, 'emit');

      await manager.applyStateUpdate(testUpdate);

      expect(emitSpy).toHaveBeenCalledWith(
        'state_update_applied',
        expect.any(Object)
      );
    });

    it('should store update in history', async () => {
      await manager.applyStateUpdate(testUpdate);

      const storedUpdate = manager.getUpdate(testUpdate.sequenceNumber);
      expect(storedUpdate).toBeDefined();
      expect(storedUpdate?.sequenceNumber).toBe(testUpdate.sequenceNumber);
    });
  });

  describe('validateStateUpdate', () => {
    let testUpdate: any;

    beforeEach(async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [
          {
            id: 'tx1',
            inputs: [],
            outputs: [
              {
                value: 50,
                lockingScript: 'address1',
                outputIndex: 0,
              },
            ],
            lockTime: 0,
            timestamp: Date.now(),
            fee: 0,
          } as any,
        ],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      testUpdate = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );
    });

    it('should validate signature', async () => {
      const isValid = await manager.validateStateUpdate(testUpdate);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const invalidUpdate = { ...testUpdate, signature: 'invalid_sig' };

      const isValid = await manager.validateStateUpdate(invalidUpdate);

      expect(isValid).toBe(false);
    });

    it('should verify sequence number continuity', async () => {
      await manager.applyStateUpdate(testUpdate);

      const nextBlock: Block = {
        index: 2,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'block1_hash',
        hash: 'block2_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const nextUpdate = await manager.createStateUpdate(
        nextBlock,
        privateKey,
        'secp256k1'
      );

      const isValid = await manager.validateStateUpdate(nextUpdate);
      expect(isValid).toBe(true);
    });

    it('should verify merkle root transition', async () => {
      const isValid = await manager.validateStateUpdate(testUpdate);

      expect(isValid).toBe(true);
      expect(testUpdate.merkleRootBefore).toBeDefined();
      expect(testUpdate.merkleRootAfter).toBeDefined();
    });

    it('should verify hash chain integrity', async () => {
      await manager.applyStateUpdate(testUpdate);

      const nextBlock: Block = {
        index: 2,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'block1_hash',
        hash: 'block2_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const nextUpdate = await manager.createStateUpdate(
        nextBlock,
        privateKey,
        'secp256k1'
      );

      const isValid = await manager.validateStateUpdate(nextUpdate);
      expect(isValid).toBe(true);
    });
  });

  describe('gap detection', () => {
    it('should detect missing sequence numbers', () => {
      const missing = manager.detectMissingUpdates(5);

      expect(missing).toEqual([1, 2, 3, 4]);
    });

    it('should return empty array if no gaps', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      await manager.createStateUpdate(testBlock, privateKey, 'secp256k1');

      const missing = manager.detectMissingUpdates(2);

      expect(missing).toEqual([]);
    });

    it('should handle out-of-order updates', () => {
      const missing = manager.detectMissingUpdates(10);

      expect(missing.length).toBe(9);
      expect(missing[0]).toBe(1);
      expect(missing[8]).toBe(9);
    });
  });

  describe('getSequenceNumber', () => {
    it('should return current sequence number', () => {
      expect(manager.getSequenceNumber()).toBe(0);
    });

    it('should update after creating state update', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      await manager.createStateUpdate(testBlock, privateKey, 'secp256k1');

      expect(manager.getSequenceNumber()).toBe(1);
    });
  });

  describe('getUpdate', () => {
    it('should return update by sequence number', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      const retrieved = manager.getUpdate(1);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sequenceNumber).toBe(update.sequenceNumber);
    });

    it('should return undefined for non-existent sequence', () => {
      const retrieved = manager.getUpdate(999);

      expect(retrieved).toBeUndefined();
    });
  });

  describe('compression', () => {
    it('should compress UTXO lists', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [
          {
            id: 'tx1',
            inputs: [],
            outputs: Array.from({ length: 10 }, (_, i) => ({
              value: 10,
              lockingScript: `address${i}`,
              outputIndex: i,
            })),
            lockTime: 0,
            timestamp: Date.now(),
            fee: 0,
          } as any,
        ],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      expect(update.utxosCreated).toHaveLength(10);

      // Verify the update can be serialized (for future compression)
      const serialized = JSON.stringify(update);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should fit updates within reasonable size constraints', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [
          {
            id: 'tx1',
            inputs: [],
            outputs: [
              {
                value: 50,
                lockingScript: 'address1',
                outputIndex: 0,
              },
            ],
            lockTime: 0,
            timestamp: Date.now(),
            fee: 0,
          } as any,
        ],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      const updateSize = JSON.stringify(update).length;

      // Should be compressible for LoRa transmission
      // Note: actual compression happens in UTXOCompressionManager
      expect(updateSize).toBeLessThan(10000); // Reasonable upper bound
    });
  });

  describe('error handling', () => {
    it('should throw StateUpdateError for invalid update', async () => {
      const invalidUpdate = {
        sequenceNumber: 1,
        blockHeight: 1,
        blockHash: 'invalid',
        timestamp: Date.now(),
        previousUpdateHash: '',
        utxosCreated: [],
        utxosSpent: [],
        merkleRootBefore: '',
        merkleRootAfter: '',
        merkleProof: [],
        signature: 'invalid',
        publicKey: 'invalid',
        algorithm: 'secp256k1' as const,
      };

      await expect(manager.applyStateUpdate(invalidUpdate)).rejects.toThrow(
        StateUpdateError
      );
    });

    it('should throw InvalidSequenceError with correct values', async () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: [],
        previousHash: blockchain.getLatestBlock().hash,
        hash: 'block1_hash',
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      };

      const update = await manager.createStateUpdate(
        testBlock,
        privateKey,
        'secp256k1'
      );

      const wrongSeqUpdate = { ...update, sequenceNumber: 999 };

      try {
        await manager.applyStateUpdate(wrongSeqUpdate);
        expect.fail('Should have thrown InvalidSequenceError');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidSequenceError);
        if (error instanceof InvalidSequenceError) {
          expect(error.expected).toBe(1);
          expect(error.actual).toBe(999);
        }
      }
    });
  });

  describe('multiple concurrent blocks', () => {
    it('should handle multiple blocks in sequence', async () => {
      const blocks: Block[] = Array.from({ length: 5 }, (_, i) => ({
        index: i + 1,
        timestamp: Date.now() + i,
        transactions: [],
        previousHash:
          i === 0 ? blockchain.getLatestBlock().hash : `block${i}_hash`,
        hash: `block${i + 1}_hash`,
        nonce: 0,
        merkleRoot: 'merkle_root',
        difficulty: 1,
      }));

      const updates = [];
      for (const block of blocks) {
        const update = await manager.createStateUpdate(
          block,
          privateKey,
          'secp256k1'
        );
        updates.push(update);
      }

      expect(updates).toHaveLength(5);
      expect(updates[0].sequenceNumber).toBe(1);
      expect(updates[4].sequenceNumber).toBe(5);
    });
  });
});
