/**
 * Blockchain Message Performance Tests
 *
 * This test suite validates that blockchain message processing meets
 * performance requirements, particularly the <100ms latency requirement
 * for message processing.
 *
 * Tests cover:
 * - Message processing latency for different message types
 * - Handler selection performance
 * - Cryptographic validation overhead
 * - Memory usage under load
 *
 * @module blockchain-message-performance.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BlockchainMessageRouter } from '../../src/blockchain-message-router.js';
import { UTXOBlockMessageHandler } from '../../src/utxo-block-message-handler.js';
import { UTXOTransactionMessageHandler } from '../../src/utxo-transaction-message-handler.js';
import { PeerHandshakeMessageHandler } from '../../src/peer-handshake-message-handler.js';
import { ProtocolVersionHandler } from '../../src/protocol-version-handler.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { UTXOPriorityQueue } from '../../src/priority-queue.js';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
} from '../../src/blockchain-message-interfaces.js';
import type {
  ProtocolFeatureFlags,
  PeerNodeCapabilities,
} from '../../src/blockchain-message-payloads.js';
import type { Blockchain } from '../../src/blockchain.js';
import type { UTXOManager } from '../../src/utxo.js';
import type { PeerManager } from '../../src/peer-manager.js';
import type { UTXOEnhancedMeshProtocol } from '../../src/enhanced-mesh-protocol.js';
import type { UTXOSyncManager } from '../../src/sync-manager.js';
import type { MessageResponse } from '../../src/blockchain-message-handler.js';

describe('Blockchain Message Performance', () => {
  let router: BlockchainMessageRouter;
  let cryptoService: CryptographicService;
  let mockContext: BlockchainMessageContext;

  beforeEach(async () => {
    cryptoService = new CryptographicService();
    const priorityQueue = new UTXOPriorityQueue({
      maxTotalMessages: 1000,
      maxMessagesPerPriority: {
        CRITICAL: 100,
        HIGH: 300,
        NORMAL: 400,
        LOW: 200,
      },
      memoryLimitBytes: 10 * 1024 * 1024, // 10MB
    });

    // Generate key pair for reliable delivery
    const nodeKeyPair = await cryptoService.generateKeyPair('secp256k1');
    const reliableDelivery = new UTXOReliableDeliveryManager(
      'blockchain-node',
      nodeKeyPair,
      {
        maxPendingMessages: 100,
        ackTimeoutMs: 5000,
        maxRetries: 3,
        enableCompression: true,
        enableDutyCycleIntegration: false,
      }
    );

    router = new BlockchainMessageRouter(
      cryptoService,
      priorityQueue,
      reliableDelivery
    );

    // Register all handlers
    const localFeatures: ProtocolFeatureFlags = {
      supportsUTXOOnly: true,
      supportsCompression: true,
      supportsFragmentation: true,
      supportsCryptographicSigning: true,
      supportsMeshRouting: true,
      supportsHybridNetworking: true,
    };

    const nodeCapabilities: PeerNodeCapabilities = {
      isFullNode: true,
      isMiningNode: false,
      supportsCompression: true,
      compressionAlgorithms: ['gzip'],
      maxMessageSize: 256,
      networkType: 'hybrid',
      listeningPort: 8333,
    };

    router.registerHandler(new UTXOBlockMessageHandler(cryptoService, 20));
    router.registerHandler(
      new UTXOTransactionMessageHandler(cryptoService, 15)
    );
    router.registerHandler(
      new PeerHandshakeMessageHandler(cryptoService, nodeCapabilities, 25)
    );
    router.registerHandler(
      new ProtocolVersionHandler(cryptoService, localFeatures, 30)
    );

    // Create mock context
    mockContext = {
      blockchain: {
        getChain: () => [],
        getLatestBlock: () => ({ index: 0, hash: 'genesis' }),
      } as Partial<Blockchain>,
      utxoManager: {
        getUTXO: () => null,
        getUTXOsForAddress: () => [],
      } as Partial<UTXOManager>,
      peers: {
        getAllPeers: () => [],
        getPeer: () => null,
      } as Partial<PeerManager>,
      protocol: {} as Partial<UTXOEnhancedMeshProtocol>,
      syncManager: {
        startSync: async () => {},
      } as Pick<UTXOSyncManager, 'startSync'>,
    } as BlockchainMessageContext;
  });

  it('should process block announcement within latency requirements', async () => {
    const keyPair = await cryptoService.generateKeyPair('secp256k1');
    const messageData = JSON.stringify({
      type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
      payload: { blockHash: 'hash1', blockHeight: 100 },
      source: keyPair.publicKey,
      nonce: `nonce_${Date.now()}`,
    });

    const signature = await cryptoService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    const message: BlockchainNetworkMessage = {
      type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
      payload: {
        data: {
          blockHash: 'hash1',
          blockHeight: 100,
          previousHash: 'hash99',
          timestamp: Date.now(),
          minerAddress: 'miner1',
        },
        version: '1.0.0',
        timestamp: Date.now(),
      },
      metadata: {
        receivedAt: Date.now(),
        source: keyPair.publicKey,
        hopCount: 1,
        signature,
        nonce: `nonce_${Date.now()}`,
      },
    };

    const startTime = Date.now();
    await router.routeMessage(message, mockContext);
    const endTime = Date.now();

    const latency = endTime - startTime;

    // Should process within 100ms requirement
    expect(latency).toBeLessThan(100);
  });

  it('should process transaction broadcast within latency requirements', async () => {
    const keyPair = await cryptoService.generateKeyPair('secp256k1');

    const transaction = {
      id: 'tx_perf_test',
      inputs: [
        {
          previousTxId: 'genesis',
          outputIndex: 0,
          signature: await cryptoService.sign(
            'tx_data',
            keyPair.privateKey,
            'secp256k1'
          ),
          publicKey: keyPair.publicKey,
          scriptSig: '',
        },
      ],
      outputs: [{ address: 'addr1', value: 100, scriptPubKey: '' }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    };

    const messageData = JSON.stringify({
      type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
      payload: { transaction, propagationId: 'prop_perf' },
      source: keyPair.publicKey,
      nonce: `nonce_${Date.now()}`,
    });

    const signature = await cryptoService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    const message: BlockchainNetworkMessage = {
      type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
      payload: {
        data: {
          transaction,
          propagationId: 'prop_perf',
          timestamp: Date.now(),
        },
        version: '1.0.0',
        timestamp: Date.now(),
      },
      metadata: {
        receivedAt: Date.now(),
        source: keyPair.publicKey,
        hopCount: 1,
        signature,
        nonce: `nonce_${Date.now()}`,
      },
    };

    const startTime = Date.now();
    await router.routeMessage(message, mockContext);
    const endTime = Date.now();

    const latency = endTime - startTime;

    // Should process within 100ms requirement
    expect(latency).toBeLessThan(100);
  });

  it('should process version negotiation within latency requirements', async () => {
    const keyPair = await cryptoService.generateKeyPair('secp256k1');
    const messageData = JSON.stringify({
      type: BlockchainMessageType.VERSION_NEGOTIATION,
      payload: { nodeId: 'peer_perf', supportedVersions: ['1.0.0'] },
      source: keyPair.publicKey,
      nonce: `nonce_${Date.now()}`,
    });

    const signature = await cryptoService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    const message: BlockchainNetworkMessage = {
      type: BlockchainMessageType.VERSION_NEGOTIATION,
      payload: {
        data: {
          nodeId: 'peer_perf',
          supportedVersions: ['1.0.0'],
          currentVersion: '1.0.0',
          minRequiredVersion: '1.0.0',
          featureFlags: {
            supportsUTXOOnly: true,
            supportsCompression: true,
            supportsFragmentation: true,
            supportsCryptographicSigning: true,
            supportsMeshRouting: true,
            supportsHybridNetworking: true,
          },
          timestamp: Date.now(),
        },
        version: '1.0.0',
        timestamp: Date.now(),
      },
      metadata: {
        receivedAt: Date.now(),
        source: keyPair.publicKey,
        hopCount: 0,
        signature,
        nonce: `nonce_${Date.now()}`,
      },
    };

    const startTime = Date.now();
    await router.routeMessage(message, mockContext);
    const endTime = Date.now();

    const latency = endTime - startTime;

    // Should process within 100ms requirement
    expect(latency).toBeLessThan(100);
  });

  it('should process peer handshake within latency requirements', async () => {
    const keyPair = await cryptoService.generateKeyPair('secp256k1');
    const challenge = 'challenge_perf_test';
    const messageData = JSON.stringify({
      type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
      payload: {
        nodeId: 'peer_perf',
        publicKey: keyPair.publicKey,
        challenge,
      },
      source: keyPair.publicKey,
      nonce: `nonce_${Date.now()}`,
    });

    const signature = await cryptoService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    const message: BlockchainNetworkMessage = {
      type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
      payload: {
        data: {
          nodeId: 'peer_perf',
          publicKey: keyPair.publicKey,
          capabilities: {
            isFullNode: true,
            isMiningNode: false,
            supportsCompression: true,
            compressionAlgorithms: ['gzip'],
            maxMessageSize: 256,
            networkType: 'mesh' as const,
            listeningPort: 8333,
          },
          protocolVersion: '1.0.0',
          challenge,
          timestamp: Date.now(),
        },
        version: '1.0.0',
        timestamp: Date.now(),
      },
      metadata: {
        receivedAt: Date.now(),
        source: keyPair.publicKey,
        hopCount: 0,
        signature,
        nonce: `nonce_${Date.now()}`,
      },
    };

    const startTime = Date.now();
    await router.routeMessage(message, mockContext);
    const endTime = Date.now();

    const latency = endTime - startTime;

    // Should process within 100ms requirement
    expect(latency).toBeLessThan(100);
  });

  it('should handle multiple concurrent messages efficiently', async () => {
    const keyPair = await cryptoService.generateKeyPair('secp256k1');
    const numMessages = 10;
    const messages: Promise<MessageResponse>[] = [];

    for (let i = 0; i < numMessages; i++) {
      const messageData = JSON.stringify({
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: { blockHash: `hash${i}`, blockHeight: i },
        source: keyPair.publicKey,
        nonce: `nonce_concurrent_${i}`,
      });

      const signature = await cryptoService.sign(
        messageData,
        keyPair.privateKey,
        'secp256k1'
      );

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {
            blockHash: `hash${i}`,
            blockHeight: i,
            previousHash: `hash${i - 1}`,
            timestamp: Date.now(),
            minerAddress: 'miner1',
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: keyPair.publicKey,
          hopCount: 1,
          signature,
          nonce: `nonce_concurrent_${i}`,
        },
      };

      messages.push(router.routeMessage(message, mockContext));
    }

    const startTime = Date.now();
    await Promise.all(messages);
    const endTime = Date.now();

    const avgLatency = (endTime - startTime) / numMessages;

    // Average latency should be reasonable
    expect(avgLatency).toBeLessThan(150); // Slightly higher for concurrent load
  });
});
