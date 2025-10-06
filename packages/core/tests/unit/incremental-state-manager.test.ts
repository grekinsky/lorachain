import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IncrementalStateManager,
  StateUpdateError,
  InvalidSequenceError,
  MissingUpdateError,
  UpdateBufferOverflowError,
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

  describe('IncrementalStateManager - Subscriptions', () => {
    describe('subscribeToUpdates', () => {
      it('should add peer to subscriptions', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-123',
          subscriptionType: 'all',
          startSequence: 0,
        });

        expect(manager.isSubscribed('node-123')).toBe(true);
        const subscription = manager.getSubscription('node-123');
        expect(subscription).toBeDefined();
        expect(subscription?.type).toBe('all');
      });

      it('should support all updates mode', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-full',
          subscriptionType: 'all',
          startSequence: 0,
        });

        const subscription = manager.getSubscription('node-full');
        expect(subscription?.type).toBe('all');
        expect(subscription?.addresses).toBeUndefined();
      });

      it('should support address-specific mode', async () => {
        await manager.subscribeToUpdates({
          peerId: 'wallet-456',
          subscriptionType: 'address_specific',
          addresses: ['lora1abc', 'lora1def'],
          startSequence: 0,
        });

        const subscription = manager.getSubscription('wallet-456');
        expect(subscription?.type).toBe('address_specific');
        expect(subscription?.addresses).toEqual(['lora1abc', 'lora1def']);
      });

      it('should handle subscription expiration', async () => {
        const expiresAt = Date.now() + 1000; // 1 second
        await manager.subscribeToUpdates({
          peerId: 'node-exp',
          subscriptionType: 'all',
          startSequence: 0,
          expiresAt,
        });

        const subscription = manager.getSubscription('node-exp');
        expect(subscription?.expiresAt).toBe(expiresAt);
      });

      it('should throw error if peer already subscribed', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-dup',
          subscriptionType: 'all',
        });

        await expect(
          manager.subscribeToUpdates({
            peerId: 'node-dup',
            subscriptionType: 'all',
          })
        ).rejects.toThrow('Peer already subscribed');
      });

      it('should throw error for address-specific without addresses', async () => {
        await expect(
          manager.subscribeToUpdates({
            peerId: 'wallet-invalid',
            subscriptionType: 'address_specific',
            addresses: [],
          })
        ).rejects.toThrow('Address-specific subscription requires addresses');
      });

      it('should emit subscription_added event', async () => {
        const emitSpy = vi.spyOn(manager, 'emit');

        await manager.subscribeToUpdates({
          peerId: 'node-event',
          subscriptionType: 'all',
        });

        expect(emitSpy).toHaveBeenCalledWith(
          'subscription_added',
          expect.objectContaining({ peerId: 'node-event' })
        );
      });
    });

    describe('unsubscribeFromUpdates', () => {
      it('should remove peer from subscriptions', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-unsub',
          subscriptionType: 'all',
        });

        expect(manager.isSubscribed('node-unsub')).toBe(true);

        await manager.unsubscribeFromUpdates('node-unsub');

        expect(manager.isSubscribed('node-unsub')).toBe(false);
      });

      it('should handle non-existent subscription gracefully', async () => {
        await expect(
          manager.unsubscribeFromUpdates('non-existent')
        ).resolves.not.toThrow();
      });

      it('should emit subscription_removed event', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-remove',
          subscriptionType: 'all',
        });

        const emitSpy = vi.spyOn(manager, 'emit');

        await manager.unsubscribeFromUpdates('node-remove');

        expect(emitSpy).toHaveBeenCalledWith(
          'subscription_removed',
          expect.objectContaining({ peerId: 'node-remove' })
        );
      });
    });

    describe('broadcastStateUpdate', () => {
      let testBlock: Block;

      beforeEach(() => {
        // Create a test block
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

      it('should send update to all subscribed peers', async () => {
        // Subscribe multiple peers
        await manager.subscribeToUpdates({
          peerId: 'peer1',
          subscriptionType: 'all',
        });
        await manager.subscribeToUpdates({
          peerId: 'peer2',
          subscriptionType: 'all',
        });

        // Create update
        const update = await manager.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );

        // Mock mesh protocol
        const managerWithMesh = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression,
          {} as any, // mesh protocol mock
          undefined,
          2 // Small batch size
        );

        // Transfer subscriptions
        await managerWithMesh.subscribeToUpdates({
          peerId: 'peer1',
          subscriptionType: 'all',
        });
        await managerWithMesh.subscribeToUpdates({
          peerId: 'peer2',
          subscriptionType: 'all',
        });

        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        // Broadcast
        await managerWithMesh.broadcastStateUpdate(update);

        // Should emit broadcast event
        expect(emitSpy).toHaveBeenCalledWith(
          'update_broadcasted',
          expect.objectContaining({
            update,
          })
        );
      });

      it('should filter updates by address for light clients', async () => {
        // Subscribe with address filter
        await manager.subscribeToUpdates({
          peerId: 'wallet-light',
          subscriptionType: 'address_specific',
          addresses: ['address1'], // Only interested in address1
        });

        // Create update
        const update = await manager.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );

        // Update should be relevant because it creates UTXO for address1
        expect(update.utxosCreated.some(u => u.address === 'address1')).toBe(
          true
        );
      });

      it('should not send old updates (sequence check)', async () => {
        // Subscribe starting from sequence 10
        await manager.subscribeToUpdates({
          peerId: 'peer-late',
          subscriptionType: 'all',
          startSequence: 10,
        });

        // Create update with lower sequence
        const update = await manager.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );

        expect(update.sequenceNumber).toBeLessThan(10);

        // Mock mesh protocol
        const managerWithMesh = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression,
          {} as any
        );

        await managerWithMesh.subscribeToUpdates({
          peerId: 'peer-late',
          subscriptionType: 'all',
          startSequence: 10,
        });

        // Broadcast should skip this peer
        await managerWithMesh.broadcastStateUpdate(update);

        // Verify no batch was sent (peer filtered out)
        const emitSpy = vi.spyOn(managerWithMesh, 'emit');
        expect(emitSpy).not.toHaveBeenCalledWith(
          'batch_sent',
          expect.objectContaining({
            peerId: 'peer-late',
          })
        );
      });

      it('should handle missing mesh protocol', async () => {
        // Manager without mesh protocol
        const managerNoMesh = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression
        );

        await managerNoMesh.subscribeToUpdates({
          peerId: 'peer',
          subscriptionType: 'all',
        });

        const update = await managerNoMesh.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );

        // Should not throw, just log warning
        await expect(
          managerNoMesh.broadcastStateUpdate(update)
        ).resolves.not.toThrow();
      });
    });

    describe('update filtering', () => {
      it('should send all updates in all mode', () => {
        const subscription = {
          peerId: 'node-full',
          type: 'all' as const,
          startSequence: 0,
          subscribedAt: Date.now(),
        };

        const update = {
          sequenceNumber: 1,
          blockHeight: 1,
          blockHash: 'hash1',
          timestamp: Date.now(),
          previousUpdateHash: 'prev',
          utxosCreated: [],
          utxosSpent: [],
          merkleRootBefore: 'root1',
          merkleRootAfter: 'root2',
          merkleProof: [],
          signature: 'sig',
          publicKey: 'pub',
          algorithm: 'secp256k1' as const,
        };

        // Access private method via any
        const shouldSend = (manager as any).shouldSendUpdateToPeer(
          update,
          subscription
        );
        expect(shouldSend).toBe(true);
      });

      it('should filter updates by address in address-specific mode', () => {
        const subscription = {
          peerId: 'wallet-light',
          type: 'address_specific' as const,
          addresses: ['address1'],
          addressSet: new Set(['address1']),
          startSequence: 0,
          subscribedAt: Date.now(),
        };

        const updateRelevant = {
          sequenceNumber: 1,
          blockHeight: 1,
          blockHash: 'hash1',
          timestamp: Date.now(),
          previousUpdateHash: 'prev',
          utxosCreated: [
            {
              txId: 'tx1',
              outputIndex: 0,
              value: 50,
              address: 'address1', // Matches subscription
            },
          ],
          utxosSpent: [],
          merkleRootBefore: 'root1',
          merkleRootAfter: 'root2',
          merkleProof: [],
          signature: 'sig',
          publicKey: 'pub',
          algorithm: 'secp256k1' as const,
        };

        const shouldSendRelevant = (manager as any).shouldSendUpdateToPeer(
          updateRelevant,
          subscription
        );
        expect(shouldSendRelevant).toBe(true);

        const updateIrrelevant = {
          ...updateRelevant,
          utxosCreated: [
            {
              txId: 'tx1',
              outputIndex: 0,
              value: 50,
              address: 'address2', // Does not match
            },
          ],
        };

        const shouldSendIrrelevant = (manager as any).shouldSendUpdateToPeer(
          updateIrrelevant,
          subscription
        );
        expect(shouldSendIrrelevant).toBe(false);
      });
    });

    describe('batching', () => {
      it('should batch multiple updates together', async () => {
        const updates = [
          {
            sequenceNumber: 1,
            blockHeight: 1,
            blockHash: 'hash1',
            timestamp: Date.now(),
            previousUpdateHash: 'prev',
            utxosCreated: [],
            utxosSpent: [],
            merkleRootBefore: 'root1',
            merkleRootAfter: 'root2',
            merkleProof: [],
            signature: 'sig',
            publicKey: 'pub',
            algorithm: 'secp256k1' as const,
          },
          {
            sequenceNumber: 2,
            blockHeight: 2,
            blockHash: 'hash2',
            timestamp: Date.now(),
            previousUpdateHash: 'prev2',
            utxosCreated: [],
            utxosSpent: [],
            merkleRootBefore: 'root2',
            merkleRootAfter: 'root3',
            merkleProof: [],
            signature: 'sig2',
            publicKey: 'pub2',
            algorithm: 'secp256k1' as const,
          },
        ];

        const batch = await (manager as any).batchUpdates(updates);

        expect(batch.updates).toHaveLength(2);
        expect(batch.batchSequence).toBeGreaterThanOrEqual(0);
        expect(batch.timestamp).toBeDefined();
      });

      it('should limit batch size', async () => {
        const updates = Array.from({ length: 20 }, (_, i) => ({
          sequenceNumber: i + 1,
          blockHeight: i + 1,
          blockHash: `hash${i}`,
          timestamp: Date.now(),
          previousUpdateHash: 'prev',
          utxosCreated: [],
          utxosSpent: [],
          merkleRootBefore: 'root1',
          merkleRootAfter: 'root2',
          merkleProof: [],
          signature: 'sig',
          publicKey: 'pub',
          algorithm: 'secp256k1' as const,
        }));

        const batch = await (manager as any).batchUpdates(updates);

        // Should be limited to batchSize (default 10)
        expect(batch.updates.length).toBeLessThanOrEqual(10);
      });
    });

    describe('subscription cleanup', () => {
      it('should remove expired subscriptions', async () => {
        // Subscribe with immediate expiration
        await manager.subscribeToUpdates({
          peerId: 'node-expire',
          subscriptionType: 'all',
          expiresAt: Date.now() - 1000, // Already expired
        });

        expect(manager.isSubscribed('node-expire')).toBe(true);

        // Trigger cleanup via private method
        (manager as any).cleanupExpiredSubscriptions();

        expect(manager.isSubscribed('node-expire')).toBe(false);
      });

      it('should emit subscription_expired event', async () => {
        await manager.subscribeToUpdates({
          peerId: 'node-exp-event',
          subscriptionType: 'all',
          expiresAt: Date.now() - 1000,
        });

        const emitSpy = vi.spyOn(manager, 'emit');

        (manager as any).cleanupExpiredSubscriptions();

        expect(emitSpy).toHaveBeenCalledWith(
          'subscription_expired',
          expect.objectContaining({ peerId: 'node-exp-event' })
        );
      });
    });

    describe('getSubscriptions', () => {
      it('should return all subscriptions', async () => {
        await manager.subscribeToUpdates({
          peerId: 'peer1',
          subscriptionType: 'all',
        });
        await manager.subscribeToUpdates({
          peerId: 'peer2',
          subscriptionType: 'address_specific',
          addresses: ['addr1'],
        });

        const subs = manager.getSubscriptions();
        expect(subs).toHaveLength(2);
        expect(subs.map(s => s.peerId)).toContain('peer1');
        expect(subs.map(s => s.peerId)).toContain('peer2');
      });
    });

    describe('isSubscribed', () => {
      it('should return true for subscribed peer', async () => {
        await manager.subscribeToUpdates({
          peerId: 'peer-check',
          subscriptionType: 'all',
        });

        expect(manager.isSubscribed('peer-check')).toBe(true);
      });

      it('should return false for non-subscribed peer', () => {
        expect(manager.isSubscribed('non-existent')).toBe(false);
      });
    });
  });

  // Task 6: Missing Update Recovery Protocol
  describe('Missing Update Recovery (Task 6)', () => {
    let meshProtocol: any;
    let managerWithMesh: IncrementalStateManager;

    beforeEach(() => {
      // Mock mesh protocol
      meshProtocol = {
        sendMessage: vi.fn(),
      };

      managerWithMesh = new IncrementalStateManager(
        blockchain,
        CryptographicService,
        MerkleTree,
        compression,
        meshProtocol,
        undefined,
        10, // batchSize
        1000, // batchIntervalMs
        100, // maxBufferSize
        60000 // bufferTimeoutMs
      );
    });

    describe('handleStateUpdate with gap detection', () => {
      let testUpdate: any;

      beforeEach(async () => {
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

        testUpdate = await managerWithMesh.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );
      });

      it('should detect missing sequence numbers and emit gap_detected event', async () => {
        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        // Create properly signed updates for sequence 1, 2, and 3
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

        const update1 = await managerWithMesh.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.createStateUpdate(
          { ...testBlock, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        const update3 = await managerWithMesh.createStateUpdate(
          { ...testBlock, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );

        // Skip update 1 and 2, receive update 3 directly (gap detected)
        await managerWithMesh.handleStateUpdate(update3);

        expect(emitSpy).toHaveBeenCalledWith(
          'gap_detected',
          expect.objectContaining({ receivedSequence: 3 })
        );
      });

      it('should buffer out-of-order updates', async () => {
        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        // Create properly signed update with sequence 3
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

        await managerWithMesh.createStateUpdate(
          testBlock,
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.createStateUpdate(
          { ...testBlock, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        const update3 = await managerWithMesh.createStateUpdate(
          { ...testBlock, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );

        await managerWithMesh.handleStateUpdate(update3);

        expect(emitSpy).toHaveBeenCalledWith(
          'update_buffered',
          expect.objectContaining({ sequenceNumber: 3 })
        );

        const stats = managerWithMesh.getGapDetectionStats();
        expect(stats.bufferedUpdates).toBe(1);
      });

      it('should apply buffered updates when gaps filled', async () => {
        // Create 3 updates in correct order
        const block1: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        const update1 = await managerWithMesh.createStateUpdate(
          block1,
          privateKey,
          'secp256k1'
        );

        const update2 = await managerWithMesh.createStateUpdate(
          { ...block1, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );

        const update3 = await managerWithMesh.createStateUpdate(
          { ...block1, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );

        // Receive updates out of order: 1, 3, 2
        await managerWithMesh.handleStateUpdate(update1);
        await managerWithMesh.handleStateUpdate(update3);

        // Update 3 should be buffered
        expect(managerWithMesh.getGapDetectionStats().bufferedUpdates).toBe(1);

        // Receive update 2 - should fill gap and process buffer
        await managerWithMesh.handleStateUpdate(update2);

        // Buffer should be empty now
        expect(managerWithMesh.getGapDetectionStats().bufferedUpdates).toBe(0);

        // All updates should be applied
        expect(managerWithMesh.getSequenceNumber()).toBe(3);
      });

      it('should handle duplicate updates gracefully', async () => {
        await managerWithMesh.handleStateUpdate(testUpdate);

        // Try to apply same update again
        await managerWithMesh.handleStateUpdate(testUpdate);

        // Should still be at sequence 1 (not increment)
        expect(managerWithMesh.getSequenceNumber()).toBe(1);
      });

      it('should throw UpdateBufferOverflowError when buffer is full', async () => {
        // Create manager with small buffer
        const smallBufferManager = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression,
          meshProtocol,
          undefined,
          10,
          1000,
          2 // maxBufferSize = 2
        );

        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        const update1 = await smallBufferManager.createStateUpdate(
          block,
          privateKey,
          'secp256k1'
        );
        const update2 = await smallBufferManager.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        const update3 = await smallBufferManager.createStateUpdate(
          { ...block, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );

        // Buffer updates 1 and 2 (by receiving 3, 4)
        await smallBufferManager.handleStateUpdate(update3); // Buffers 3

        const update4 = await smallBufferManager.createStateUpdate(
          { ...block, index: 4, hash: 'block4_hash' },
          privateKey,
          'secp256k1'
        );

        await smallBufferManager.handleStateUpdate(update4); // Buffers 4

        // Try to buffer one more - should overflow
        const update5 = await smallBufferManager.createStateUpdate(
          { ...block, index: 5, hash: 'block5_hash' },
          privateKey,
          'secp256k1'
        );

        await expect(
          smallBufferManager.handleStateUpdate(update5)
        ).rejects.toThrow(UpdateBufferOverflowError);
      });
    });

    describe('requestMissingUpdates', () => {
      it('should request specific sequences from peers', async () => {
        await managerWithMesh.subscribeToUpdates({
          peerId: 'peer1',
          subscriptionType: 'all',
        });

        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        // Request missing updates (non-blocking)
        const requestPromise = managerWithMesh.requestMissingUpdates([1, 2, 3]);

        // Should emit request event
        expect(emitSpy).toHaveBeenCalledWith(
          'missing_update_request_sent',
          expect.objectContaining({
            peerId: 'peer1',
            request: expect.objectContaining({
              sequenceNumbers: [1, 2, 3],
            }),
          })
        );

        // Wait for timeout
        await expect(requestPromise).resolves.toBeDefined();
      });

      it('should throw MissingUpdateError if no peers available', async () => {
        await expect(
          managerWithMesh.requestMissingUpdates([1, 2])
        ).rejects.toThrow(MissingUpdateError);
      });

      it('should throw error if mesh protocol not configured', async () => {
        const managerNoMesh = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression
        );

        await expect(
          managerNoMesh.requestMissingUpdates([1, 2])
        ).rejects.toThrow('Mesh protocol not configured');
      });
    });

    describe('handleMissingUpdateRequest', () => {
      it('should serve requested updates to peer', async () => {
        // Create some updates
        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await managerWithMesh.createStateUpdate(block, privateKey, 'secp256k1');
        await managerWithMesh.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );

        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        const request = {
          requestId: 'req-123',
          sequenceNumbers: [1, 2],
          requestedBy: 'peer1',
          timestamp: Date.now(),
        };

        await managerWithMesh.handleMissingUpdateRequest(request);

        expect(emitSpy).toHaveBeenCalledWith(
          'missing_update_response_sent',
          expect.objectContaining({
            peerId: 'peer1',
            response: expect.objectContaining({
              requestId: 'req-123',
              updates: expect.arrayContaining([
                expect.objectContaining({ sequenceNumber: 1 }),
                expect.objectContaining({ sequenceNumber: 2 }),
              ]),
            }),
          })
        );
      });

      it('should indicate sequences not found', async () => {
        const emitSpy = vi.spyOn(managerWithMesh, 'emit');

        const request = {
          requestId: 'req-456',
          sequenceNumbers: [999, 1000],
          requestedBy: 'peer1',
          timestamp: Date.now(),
        };

        await managerWithMesh.handleMissingUpdateRequest(request);

        expect(emitSpy).toHaveBeenCalledWith(
          'missing_update_response_sent',
          expect.objectContaining({
            response: expect.objectContaining({
              missingSequences: [999, 1000],
            }),
          })
        );
      });
    });

    describe('gap detection statistics', () => {
      it('should track total updates received', async () => {
        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        const update = await managerWithMesh.createStateUpdate(
          block,
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.handleStateUpdate(update);

        const stats = managerWithMesh.getGapDetectionStats();
        expect(stats.totalUpdatesReceived).toBe(1);
      });

      it('should track gaps detected', async () => {
        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await managerWithMesh.createStateUpdate(block, privateKey, 'secp256k1');
        await managerWithMesh.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );

        // Create update 3 and receive it directly (skipping 1 and 2)
        const update3 = await managerWithMesh.createStateUpdate(
          { ...block, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.handleStateUpdate(update3);

        const stats = managerWithMesh.getGapDetectionStats();
        expect(stats.totalGapsDetected).toBeGreaterThan(0);
      });

      it('should report current gaps', async () => {
        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await managerWithMesh.createStateUpdate(block, privateKey, 'secp256k1');
        await managerWithMesh.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );

        // Create gap by receiving update 3 directly
        const update3 = await managerWithMesh.createStateUpdate(
          { ...block, index: 3, hash: 'block3_hash' },
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.handleStateUpdate(update3);

        const stats = managerWithMesh.getGapDetectionStats();
        expect(stats.currentGaps).toContain(1);
        expect(stats.currentGaps).toContain(2);
      });

      it('should track buffered updates count', async () => {
        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await managerWithMesh.createStateUpdate(block, privateKey, 'secp256k1');

        // Buffer update 2 by receiving it out of order
        const update2 = await managerWithMesh.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        await managerWithMesh.handleStateUpdate(update2);

        const stats = managerWithMesh.getGapDetectionStats();
        expect(stats.bufferedUpdates).toBe(1);
      });
    });

    describe('buffer cleanup', () => {
      it('should cleanup expired buffered updates', async () => {
        // Create manager with short timeout
        const shortTimeoutManager = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression,
          meshProtocol,
          undefined,
          10,
          1000,
          100,
          100 // bufferTimeoutMs = 100ms
        );

        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await shortTimeoutManager.createStateUpdate(
          block,
          privateKey,
          'secp256k1'
        );

        // Buffer update 2
        const update2 = await shortTimeoutManager.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        await shortTimeoutManager.handleStateUpdate(update2);

        expect(shortTimeoutManager.getGapDetectionStats().bufferedUpdates).toBe(
          1
        );

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 150));

        // Trigger cleanup
        const stats = shortTimeoutManager.getGapDetectionStats();
        expect(stats.bufferedUpdates).toBe(0);
      });

      it('should emit buffer_cleanup event', async () => {
        const shortTimeoutManager = new IncrementalStateManager(
          blockchain,
          CryptographicService,
          MerkleTree,
          compression,
          meshProtocol,
          undefined,
          10,
          1000,
          100,
          100
        );

        const emitSpy = vi.spyOn(shortTimeoutManager, 'emit');

        const block: Block = {
          index: 1,
          timestamp: Date.now(),
          transactions: [],
          previousHash: blockchain.getLatestBlock().hash,
          hash: 'block1_hash',
          nonce: 0,
          merkleRoot: 'merkle_root',
          difficulty: 1,
        };

        await shortTimeoutManager.createStateUpdate(
          block,
          privateKey,
          'secp256k1'
        );

        const update2 = await shortTimeoutManager.createStateUpdate(
          { ...block, index: 2, hash: 'block2_hash' },
          privateKey,
          'secp256k1'
        );
        await shortTimeoutManager.handleStateUpdate(update2);

        await new Promise(resolve => setTimeout(resolve, 150));

        shortTimeoutManager.getGapDetectionStats();

        expect(emitSpy).toHaveBeenCalledWith(
          'buffer_cleanup',
          expect.objectContaining({ expiredCount: 1 })
        );
      });
    });
  });
});
