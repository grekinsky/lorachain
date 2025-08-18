import { describe, test, expect } from 'vitest';
import {
  UTXOSyncState,
  UTXOSyncMessageType,
  SyncCapability,
  SYNC_PROTOCOL_VERSION,
  SUPPORTED_VERSIONS,
  type UTXOSyncContext,
  type UTXOSyncMessage,
  type UTXOBlockHeader,
  type UTXOSetSnapshot,
  type UTXOSetDelta,
  type SyncPeer,
  type SyncProgress,
  type ValidationResult,
  type UTXOSyncMetrics,
  type UTXOSyncConfig,
  type CompressedPayload,
  type FragmentInfo,
  type DutyCycleInfo,
  type UTXOMerkleProof,
  type UTXOSpentProof,
  type ReorgInfo,
} from '../../src/sync-types.js';
import { MessagePriority } from '../../src/types.js';

describe('UTXO Sync Types', () => {
  describe('Protocol Constants', () => {
    test('should have correct protocol version', () => {
      expect(SYNC_PROTOCOL_VERSION).toBe('2.0.0');
      expect(SUPPORTED_VERSIONS).toEqual(['2.0.0']);
      expect(SUPPORTED_VERSIONS).toContain(SYNC_PROTOCOL_VERSION);
    });

    test('should enforce no backwards compatibility', () => {
      expect(SUPPORTED_VERSIONS.length).toBe(1);
      expect(SUPPORTED_VERSIONS[0]).toBe('2.0.0');
    });
  });

  describe('UTXOSyncState Enum', () => {
    test('should have all required sync states', () => {
      const expectedStates = [
        'discovering',
        'negotiating',
        'header_sync',
        'utxo_set_sync',
        'block_sync',
        'mempool_sync',
        'synchronized',
        'reorg_handling'
      ];

      expectedStates.forEach(state => {
        expect(Object.values(UTXOSyncState)).toContain(state);
      });
    });

    test('should start with discovery state', () => {
      expect(UTXOSyncState.DISCOVERING).toBe('discovering');
    });

    test('should end with synchronized state', () => {
      expect(UTXOSyncState.SYNCHRONIZED).toBe('synchronized');
    });
  });

  describe('UTXOSyncMessageType Enum', () => {
    test('should have discovery and negotiation messages', () => {
      expect(UTXOSyncMessageType.BEACON).toBe('beacon');
      expect(UTXOSyncMessageType.CAPABILITY_ANNOUNCE).toBe('capability_announce');
      expect(UTXOSyncMessageType.VERSION_NEGOTIATE).toBe('version_negotiate');
    });

    test('should have header synchronization messages', () => {
      expect(UTXOSyncMessageType.UTXO_HEADER_REQUEST).toBe('utxo_header_request');
      expect(UTXOSyncMessageType.UTXO_HEADER_BATCH).toBe('utxo_header_batch');
      expect(UTXOSyncMessageType.UTXO_MERKLE_PROOF).toBe('utxo_merkle_proof');
    });

    test('should have UTXO set synchronization messages', () => {
      expect(UTXOSyncMessageType.UTXO_SET_REQUEST).toBe('utxo_set_request');
      expect(UTXOSyncMessageType.UTXO_SET_SNAPSHOT).toBe('utxo_set_snapshot');
      expect(UTXOSyncMessageType.UTXO_SET_DELTA).toBe('utxo_set_delta');
    });

    test('should have block synchronization messages', () => {
      expect(UTXOSyncMessageType.UTXO_BLOCK_REQUEST).toBe('utxo_block_request');
      expect(UTXOSyncMessageType.UTXO_BLOCK_RESPONSE).toBe('utxo_block_response');
      expect(UTXOSyncMessageType.UTXO_BLOCK_FRAGMENT).toBe('utxo_block_fragment');
    });

    test('should have control messages', () => {
      expect(UTXOSyncMessageType.SYNC_STATUS).toBe('sync_status');
      expect(UTXOSyncMessageType.COMPRESSION_NEGOTIATE).toBe('compression_negotiate');
      expect(UTXOSyncMessageType.DUTY_CYCLE_STATUS).toBe('duty_cycle_status');
    });
  });

  describe('SyncCapability Enum', () => {
    test('should have all required capabilities', () => {
      const expectedCapabilities = [
        'header_sync',
        'block_sync',
        'tx_pool_sync',
        'state_sync',
        'fragmentation',
        'utxo_sync'
      ];

      expectedCapabilities.forEach(capability => {
        expect(Object.values(SyncCapability)).toContain(capability);
      });
    });

    test('should have UTXO-specific capability', () => {
      expect(SyncCapability.UTXO_SYNC).toBe('utxo_sync');
    });
  });

  describe('UTXOSyncContext Interface', () => {
    test('should create valid sync context', () => {
      const context: UTXOSyncContext = {
        state: UTXOSyncState.DISCOVERING,
        startTime: Date.now(),
        syncHeight: 0,
        targetHeight: 100,
        utxoSetSize: 1000,
        compressionRatio: 0.7,
        meshLatency: 250,
        dutyCycleRemaining: 85
      };

      expect(context.state).toBe(UTXOSyncState.DISCOVERING);
      expect(context.syncHeight).toBeLessThan(context.targetHeight);
      expect(context.compressionRatio).toBeGreaterThan(0);
      expect(context.compressionRatio).toBeLessThan(1);
      expect(context.dutyCycleRemaining).toBeGreaterThan(0);
      expect(context.dutyCycleRemaining).toBeLessThanOrEqual(100);
    });
  });

  describe('UTXOSyncMessage Interface', () => {
    test('should create valid sync message', () => {
      const compressedPayload: CompressedPayload = {
        algorithm: 'gzip',
        originalSize: 1024,
        compressedSize: 512,
        data: new Uint8Array([1, 2, 3, 4])
      };

      const message: UTXOSyncMessage = {
        version: SYNC_PROTOCOL_VERSION,
        type: UTXOSyncMessageType.UTXO_BLOCK_REQUEST,
        timestamp: Date.now(),
        signature: 'test_signature',
        publicKey: 'test_public_key',
        payload: compressedPayload,
        priority: MessagePriority.HIGH
      };

      expect(message.version).toBe('2.0.0');
      expect(message.type).toBe(UTXOSyncMessageType.UTXO_BLOCK_REQUEST);
      expect(message.payload.compressedSize).toBeLessThan(message.payload.originalSize);
      expect(message.priority).toBe(MessagePriority.HIGH);
    });

    test('should support fragmentation info', () => {
      const fragmentInfo: FragmentInfo = {
        messageId: 'msg_123',
        fragmentIndex: 2,
        totalFragments: 5,
        checksum: 'abc123'
      };

      expect(fragmentInfo.fragmentIndex).toBeLessThan(fragmentInfo.totalFragments);
      expect(fragmentInfo.messageId).toBeTruthy();
      expect(fragmentInfo.checksum).toBeTruthy();
    });

    test('should support duty cycle info', () => {
      const dutyCycleInfo: DutyCycleInfo = {
        region: 'EU',
        dutyCycleUsed: 45.5,
        timeToReset: 15000,
        canTransmit: true
      };

      expect(dutyCycleInfo.dutyCycleUsed).toBeGreaterThanOrEqual(0);
      expect(dutyCycleInfo.dutyCycleUsed).toBeLessThanOrEqual(100);
      expect(dutyCycleInfo.timeToReset).toBeGreaterThanOrEqual(0);
    });
  });

  describe('UTXOBlockHeader Interface', () => {
    test('should create valid block header', () => {
      const header: UTXOBlockHeader = {
        index: 100,
        hash: 'block_hash_123',
        previousHash: 'previous_hash_123',
        timestamp: Date.now(),
        utxoMerkleRoot: 'merkle_root_123',
        difficulty: 1024,
        nonce: 42
      };

      expect(header.index).toBeGreaterThanOrEqual(0);
      expect(header.hash).toBeTruthy();
      expect(header.previousHash).toBeTruthy();
      expect(header.utxoMerkleRoot).toBeTruthy();
      expect(header.difficulty).toBeGreaterThan(0);
    });
  });

  describe('UTXOSetSnapshot Interface', () => {
    test('should create valid UTXO set snapshot', () => {
      const snapshot: UTXOSetSnapshot = {
        height: 1000,
        timestamp: Date.now(),
        merkleRoot: 'utxo_merkle_root',
        utxoCount: 5000,
        totalValue: BigInt('1000000000'),
        compressedUTXOs: [],
        proofs: [],
        signature: 'snapshot_signature'
      };

      expect(snapshot.height).toBeGreaterThan(0);
      expect(snapshot.utxoCount).toBeGreaterThan(0);
      expect(snapshot.totalValue).toBeGreaterThan(0n);
      expect(snapshot.merkleRoot).toBeTruthy();
      expect(snapshot.signature).toBeTruthy();
    });
  });

  describe('SyncPeer Interface', () => {
    test('should create valid sync peer', () => {
      const peer: SyncPeer = {
        id: 'peer_123',
        publicKey: 'peer_public_key',
        type: 'internet',
        capabilities: [SyncCapability.UTXO_SYNC, SyncCapability.HEADER_SYNC],
        protocolVersion: SYNC_PROTOCOL_VERSION,
        syncHeight: 500,
        latency: 150,
        reliability: 0.95,
        lastSeen: Date.now()
      };

      expect(peer.capabilities).toContain(SyncCapability.UTXO_SYNC);
      expect(peer.protocolVersion).toBe('2.0.0');
      expect(peer.reliability).toBeGreaterThan(0);
      expect(peer.reliability).toBeLessThanOrEqual(1);
      expect(['internet', 'mesh', 'gateway']).toContain(peer.type);
    });
  });

  describe('SyncProgress Interface', () => {
    test('should create valid sync progress', () => {
      const progress: SyncProgress = {
        state: UTXOSyncState.BLOCK_SYNC,
        currentHeight: 750,
        targetHeight: 1000,
        headersDownloaded: 1000,
        blocksDownloaded: 750,
        utxosSynced: 3500,
        bytesDownloaded: 1024000,
        bytesUploaded: 512000,
        peersConnected: 5,
        estimatedTimeRemaining: 30000
      };

      expect(progress.currentHeight).toBeLessThanOrEqual(progress.targetHeight);
      expect(progress.headersDownloaded).toBeGreaterThanOrEqual(progress.blocksDownloaded);
      expect(progress.bytesDownloaded).toBeGreaterThan(0);
      expect(progress.peersConnected).toBeGreaterThan(0);
    });
  });

  describe('ValidationResult Interface', () => {
    test('should create successful validation result', () => {
      const result: ValidationResult = {
        success: true
      };

      expect(result.success).toBe(true);
      expect(result.invalidAt).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    test('should create failed validation result', () => {
      const result: ValidationResult = {
        success: false,
        invalidAt: 123,
        error: 'Invalid block header'
      };

      expect(result.success).toBe(false);
      expect(result.invalidAt).toBe(123);
      expect(result.error).toBeTruthy();
    });
  });

  describe('UTXOSyncMetrics Interface', () => {
    test('should create valid sync metrics', () => {
      const metrics: UTXOSyncMetrics = {
        headersPerSecond: 50,
        blocksPerSecond: 2,
        utxosPerSecond: 100,
        compressionRatio: 0.65,
        meshLatency: 200,
        internetBandwidth: 1000000,
        dutyCycleUtilization: 75,
        fragmentSuccessRate: 0.98,
        activePeers: 8,
        syncingPeers: 3,
        peerReliability: new Map([
          ['peer1', 0.95],
          ['peer2', 0.88]
        ]),
        totalUTXOs: 10000,
        syncedHeight: 800,
        targetHeight: 1000,
        mempoolSize: 25
      };

      expect(metrics.headersPerSecond).toBeGreaterThan(metrics.blocksPerSecond);
      expect(metrics.compressionRatio).toBeGreaterThan(0);
      expect(metrics.compressionRatio).toBeLessThan(1);
      expect(metrics.fragmentSuccessRate).toBeGreaterThan(0.9);
      expect(metrics.activePeers).toBeGreaterThanOrEqual(metrics.syncingPeers);
      expect(metrics.syncedHeight).toBeLessThanOrEqual(metrics.targetHeight);
    });
  });

  describe('UTXOSyncConfig Interface', () => {
    test('should create valid sync configuration', () => {
      const config: UTXOSyncConfig = {
        maxPeers: 20,
        maxParallelDownloads: 10,
        headerBatchSize: 100,
        blockBatchSize: 10,
        utxoBatchSize: 1000,
        fragmentSize: 200,
        syncTimeout: 300000,
        retryAttempts: 3,
        minStakeForAuth: 1000,
        compressionThreshold: 100
      };

      expect(config.maxPeers).toBeGreaterThan(0);
      expect(config.maxParallelDownloads).toBeLessThanOrEqual(config.maxPeers);
      expect(config.fragmentSize).toBeLessThanOrEqual(256); // LoRa constraint
      expect(config.retryAttempts).toBeGreaterThan(0);
      expect(config.syncTimeout).toBeGreaterThan(0);
    });
  });

  describe('UTXOMerkleProof Interface', () => {
    test('should create valid merkle proof', () => {
      const proof: UTXOMerkleProof = {
        txId: 'transaction_123',
        proof: ['hash1', 'hash2', 'hash3'],
        position: 5
      };

      expect(proof.txId).toBeTruthy();
      expect(proof.proof.length).toBeGreaterThan(0);
      expect(proof.position).toBeGreaterThanOrEqual(0);
    });
  });

  describe('UTXOSpentProof Interface', () => {
    test('should create valid spent proof', () => {
      const spentProof: UTXOSpentProof = {
        utxoId: 'utxo_123',
        spentInBlock: 500,
        spentByTx: 'spending_tx_123',
        signature: 'spend_signature'
      };

      expect(spentProof.utxoId).toBeTruthy();
      expect(spentProof.spentInBlock).toBeGreaterThan(0);
      expect(spentProof.spentByTx).toBeTruthy();
      expect(spentProof.signature).toBeTruthy();
    });
  });

  describe('ReorgInfo Interface', () => {
    test('should create valid reorganization info', () => {
      const reorgInfo: ReorgInfo = {
        oldTip: 'old_tip_hash',
        newTip: 'new_tip_hash',
        commonAncestor: 'common_ancestor_hash',
        orphanedBlocks: ['block1', 'block2'],
        newBlocks: ['block3', 'block4', 'block5']
      };

      expect(reorgInfo.oldTip).toBeTruthy();
      expect(reorgInfo.newTip).toBeTruthy();
      expect(reorgInfo.commonAncestor).toBeTruthy();
      expect(reorgInfo.orphanedBlocks.length).toBeGreaterThan(0);
      expect(reorgInfo.newBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Type Compatibility', () => {
    test('should be compatible with existing message priority', () => {
      const message: UTXOSyncMessage = {
        version: SYNC_PROTOCOL_VERSION,
        type: UTXOSyncMessageType.BEACON,
        timestamp: Date.now(),
        signature: 'sig',
        publicKey: 'key',
        payload: {
          algorithm: 'gzip',
          originalSize: 100,
          compressedSize: 50,
          data: new Uint8Array([1, 2, 3])
        },
        priority: MessagePriority.NORMAL
      };

      expect(Object.values(MessagePriority)).toContain(message.priority);
    });

    test('should enforce UTXO-only design', () => {
      // All sync message types should be UTXO-specific
      const utxoMessageTypes = Object.values(UTXOSyncMessageType);
      const utxoSpecificTypes = utxoMessageTypes.filter(type => 
        type.includes('utxo') || 
        type === 'beacon' || 
        type === 'capability_announce' ||
        type === 'version_negotiate' ||
        type === 'sync_status' ||
        type === 'compression_negotiate' ||
        type === 'duty_cycle_status' ||
        type === 'priority_override'
      );

      expect(utxoSpecificTypes.length).toBe(utxoMessageTypes.length);
    });
  });
});