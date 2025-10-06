/**
 * Blockchain Message Handler Integration Example
 *
 * This example demonstrates the complete setup of blockchain message handling
 * in the Lorachain network, including:
 * - Blockchain message router initialization
 * - Handler registration (Block, Transaction, Handshake, Version)
 * - Integration with UTXOEnhancedMeshProtocol
 * - Message routing and handling workflows
 *
 * DESIGN NOTES:
 * - UTXO-only message handling (no backwards compatibility)
 * - Cryptographic signing with ECDSA/Ed25519
 * - Integration with existing mesh protocol and peer management
 *
 * @module blockchain-message-handler-example
 */

import {
  BlockchainMessageRouter,
  UTXOBlockMessageHandler,
  UTXOTransactionMessageHandler,
  PeerHandshakeMessageHandler,
  ProtocolVersionHandler,
  CryptographicService,
  UTXOPriorityQueue,
  UTXOReliableDeliveryManager,
  BlockchainMessageType,
  type BlockchainNetworkMessage,
  type ProtocolFeatureFlags,
  type PeerNodeCapabilities,
} from '../index.js';

/**
 * Example 1: Complete Blockchain Message Handling Setup
 *
 * Demonstrates how to initialize and configure all components for
 * blockchain message handling in a Lorachain node.
 */
async function exampleCompleteSetup() {
  console.log(
    '=== Example 1: Complete Blockchain Message Handling Setup ===\n'
  );

  // Step 1: Initialize cryptographic service and generate key pair
  const _cryptoService = new CryptographicService();
  const nodeKeyPair = await CryptographicService.generateKeyPair('secp256k1');

  console.log('✓ Cryptographic service initialized');
  const pubKeyStr = Buffer.from(nodeKeyPair.publicKey).toString('hex');
  console.log(`  Node public key: ${pubKeyStr.substring(0, 20)}...`);

  // Step 2: Initialize priority queue for message management
  const priorityQueue = new UTXOPriorityQueue({
    maxTotalMessages: 1000,
    capacityByPriority: {
      0: 250, // CRITICAL
      1: 300, // HIGH
      2: 300, // NORMAL
      3: 150, // LOW
    },
    emergencyCapacityReserve: 50,
    memoryLimitBytes: 10 * 1024 * 1024, // 10 MB
    evictionStrategy: 'priority',
  });

  console.log('✓ Priority queue initialized');

  // Step 3: Initialize reliable delivery manager
  const reliableDelivery = new UTXOReliableDeliveryManager(
    'node_1',
    nodeKeyPair,
    {
      defaultRetryPolicy: {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 1.5,
        jitterMaxMs: 500,
        maxAttempts: 3,
      },
      maxPendingMessages: 1000,
      ackTimeoutMs: 5000,
      enablePersistence: false,
      deadLetterThreshold: 10,
      enableCompression: true,
      enableDutyCycleIntegration: true,
      enablePriorityCalculation: true,
    },
    undefined,
    _cryptoService
  );

  console.log('✓ Reliable delivery manager initialized');

  // Step 4: Create blockchain message router
  const _blockchainMessageRouter = new BlockchainMessageRouter(
    _cryptoService,
    priorityQueue,
    reliableDelivery
  );

  console.log('✓ Blockchain message router created');

  // Step 5: Define protocol feature flags
  const localFeatures: ProtocolFeatureFlags = {
    supportsUTXOOnly: true, // Required
    supportsCompression: true,
    supportsFragmentation: true,
    supportsCryptographicSigning: true, // Required
    supportsMeshRouting: true,
    supportsHybridNetworking: true,
  };

  console.log('✓ Protocol features defined');

  // Step 6: Define node capabilities
  const nodeCapabilities: PeerNodeCapabilities = {
    isFullNode: true,
    isMiningNode: false,
    supportsCompression: true,
    compressionAlgorithms: ['gzip', 'zlib'],
    maxMessageSize: 256,
    networkType: 'hybrid',
    listeningPort: 8080,
  };

  console.log('✓ Node capabilities defined');

  // Step 7: Register message handlers with priorities
  const blockHandler = new UTXOBlockMessageHandler(_cryptoService, 20);
  const txHandler = new UTXOTransactionMessageHandler(_cryptoService, 15);
  const handshakeHandler = new PeerHandshakeMessageHandler(
    _cryptoService,
    nodeCapabilities,
    25
  );
  const versionHandler = new ProtocolVersionHandler(
    _cryptoService,
    localFeatures,
    30
  );

  _blockchainMessageRouter.registerHandler(blockHandler);
  _blockchainMessageRouter.registerHandler(txHandler);
  _blockchainMessageRouter.registerHandler(handshakeHandler);
  _blockchainMessageRouter.registerHandler(versionHandler);

  console.log('✓ All message handlers registered');
  console.log('  - Version Handler (priority: 30)');
  console.log('  - Handshake Handler (priority: 25)');
  console.log('  - Block Handler (priority: 20)');
  console.log('  - Transaction Handler (priority: 15)');

  console.log('\n✅ Complete setup finished!\n');

  return {
    cryptoService: _cryptoService,
    nodeKeyPair,
    priorityQueue,
    reliableDelivery,
    blockchainMessageRouter: _blockchainMessageRouter,
  };
}

/**
 * Example 2: Handling Block Announcement Message
 *
 * Demonstrates processing of an incoming block announcement message.
 */
async function exampleBlockAnnouncement() {
  console.log('=== Example 2: Handling Block Announcement ===\n');

  const setup = await exampleCompleteSetup();
  const {
    blockchainMessageRouter: _blockchainMessageRouter,
    cryptoService: _cryptoService,
    nodeKeyPair,
  } = setup;

  // Create a mock block announcement message
  const blockAnnouncement: BlockchainNetworkMessage = {
    type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
    payload: {
      data: {
        blockHash: 'abc123def456',
        blockHeight: 100,
        previousHash: 'prev_hash_987',
        timestamp: Date.now(),
        minerAddress: 'miner_address_1',
      },
      version: '1.0.0',
      timestamp: Date.now(),
    },
    metadata: {
      receivedAt: Date.now(),
      source: 'peer_123',
      hopCount: 1,
      rssi: -75,
      signature: '', // Would be filled by signing
      nonce: `nonce_${Date.now()}`,
    },
  };

  // Sign the message
  const messageData = JSON.stringify({
    type: blockAnnouncement.type,
    payload: blockAnnouncement.payload,
    source: blockAnnouncement.metadata.source,
    nonce: blockAnnouncement.metadata.nonce,
  });

  const messageBytes = new TextEncoder().encode(messageData);
  const signatureObj = CryptographicService.sign(
    messageBytes,
    nodeKeyPair.privateKey,
    'secp256k1'
  );

  const signatureHex = Array.from(signatureObj.signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  blockAnnouncement.metadata.signature = signatureHex;

  console.log('📦 Block announcement created:');
  console.log(
    `  Block height: ${(blockAnnouncement.payload.data as any).blockHeight}`
  );
  console.log(
    `  Block hash: ${(blockAnnouncement.payload.data as any).blockHash}`
  );
  console.log(`  From peer: ${blockAnnouncement.metadata.source}`);

  console.log('\n✅ Block announcement ready for routing!\n');
}

/**
 * Example 3: Transaction Broadcast Flow
 *
 * Demonstrates the complete flow of broadcasting a UTXO transaction.
 */
async function exampleTransactionBroadcast() {
  console.log('=== Example 3: Transaction Broadcast Flow ===\n');

  const setup = await exampleCompleteSetup();
  const {
    blockchainMessageRouter: _blockchainMessageRouter,
    cryptoService: _cryptoService,
    nodeKeyPair,
  } = setup;

  // Create a mock UTXO transaction broadcast message
  const txBroadcast: BlockchainNetworkMessage = {
    type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
    payload: {
      data: {
        transaction: {
          id: 'tx_abc123',
          inputs: [
            {
              previousTxId: 'prev_tx_1',
              outputIndex: 0,
              signature: 'input_sig_1',
              publicKey: 'input_key_1',
            },
          ],
          outputs: [
            { address: 'addr_1', value: 100 },
            { address: 'addr_2', value: 50 },
          ],
          lockTime: 0,
          timestamp: Date.now(),
          fee: 1,
        },
        propagationId: `prop_${Date.now()}`,
        timestamp: Date.now(),
      },
      version: '1.0.0',
      timestamp: Date.now(),
    },
    metadata: {
      receivedAt: Date.now(),
      source: 'node_1',
      hopCount: 0,
      signature: '',
      nonce: `nonce_${Date.now()}`,
    },
  };

  // Sign the transaction broadcast
  const txMessageData = JSON.stringify({
    type: txBroadcast.type,
    payload: txBroadcast.payload,
    source: txBroadcast.metadata.source,
    nonce: txBroadcast.metadata.nonce,
  });

  const txMessageBytes = new TextEncoder().encode(txMessageData);
  const txSignatureObj = CryptographicService.sign(
    txMessageBytes,
    nodeKeyPair.privateKey,
    'secp256k1'
  );

  const txSignatureHex = Array.from(txSignatureObj.signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  txBroadcast.metadata.signature = txSignatureHex;

  console.log('💸 Transaction broadcast created:');
  console.log(
    `  Transaction ID: ${(txBroadcast.payload.data as any).transaction.id}`
  );
  console.log(
    `  Inputs: ${(txBroadcast.payload.data as any).transaction.inputs.length}`
  );
  console.log(
    `  Outputs: ${(txBroadcast.payload.data as any).transaction.outputs.length}`
  );
  console.log(
    `  Fee: ${(txBroadcast.payload.data as any).transaction.fee} satoshis`
  );

  console.log('\n✅ Transaction ready for network broadcast!\n');
}

/**
 * Example 4: Peer Handshake Protocol
 *
 * Demonstrates the three-way handshake protocol for peer authentication.
 */
async function examplePeerHandshake() {
  console.log('=== Example 4: Peer Handshake Protocol ===\n');

  const setup = await exampleCompleteSetup();
  const {
    blockchainMessageRouter: _blockchainMessageRouter,
    cryptoService: _cryptoService,
    nodeKeyPair,
  } = setup;

  // Step 1: Generate challenge for handshake
  const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  console.log('🤝 Initiating peer handshake...');
  console.log(`  Challenge: ${challenge.substring(0, 20)}...`);

  // Step 2: Create handshake init message
  const handshakeInit: BlockchainNetworkMessage = {
    type: BlockchainMessageType.PEER_HANDSHAKE_INIT,
    payload: {
      data: {
        nodeId: 'node_1',
        publicKey: nodeKeyPair.publicKey,
        capabilities: {
          isFullNode: true,
          isMiningNode: false,
          supportsCompression: true,
          compressionAlgorithms: ['gzip', 'zlib'],
          maxMessageSize: 256,
          networkType: 'hybrid',
          listeningPort: 8080,
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
      source: 'node_1',
      hopCount: 0,
      signature: '',
      nonce: `nonce_${Date.now()}`,
    },
  };

  // Sign the handshake
  const hsMessageData = JSON.stringify({
    type: handshakeInit.type,
    payload: handshakeInit.payload,
    source: handshakeInit.metadata.source,
    nonce: handshakeInit.metadata.nonce,
  });

  const hsMessageBytes = new TextEncoder().encode(hsMessageData);
  const hsSignatureObj = CryptographicService.sign(
    hsMessageBytes,
    nodeKeyPair.privateKey,
    'secp256k1'
  );

  const hsSignatureHex = Array.from(hsSignatureObj.signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  handshakeInit.metadata.signature = hsSignatureHex;

  console.log('  Handshake INIT message prepared');
  console.log(`  Node ID: ${(handshakeInit.payload.data as any).nodeId}`);
  console.log(
    `  Protocol version: ${(handshakeInit.payload.data as any).protocolVersion}`
  );

  console.log('\n✅ Handshake initiated - awaiting peer response!\n');
}

/**
 * Example 5: Protocol Version Negotiation
 *
 * Demonstrates version negotiation between peers.
 */
async function exampleVersionNegotiation() {
  console.log('=== Example 5: Protocol Version Negotiation ===\n');

  const setup = await exampleCompleteSetup();
  const {
    blockchainMessageRouter: _blockchainMessageRouter,
    cryptoService: _cryptoService,
    nodeKeyPair,
  } = setup;

  // Create version negotiation message
  const versionNegotiation: BlockchainNetworkMessage = {
    type: BlockchainMessageType.VERSION_NEGOTIATION,
    payload: {
      data: {
        supportedVersions: ['1.0.0'],
        preferredVersion: '1.0.0',
        features: {
          supportsUTXOOnly: true,
          supportsCompression: true,
          supportsFragmentation: true,
          supportsCryptographicSigning: true,
          supportsMeshRouting: true,
          supportsHybridNetworking: true,
        },
        nodeId: 'node_1',
        timestamp: Date.now(),
      },
      version: '1.0.0',
      timestamp: Date.now(),
    },
    metadata: {
      receivedAt: Date.now(),
      source: 'node_1',
      hopCount: 0,
      signature: '',
      nonce: `nonce_${Date.now()}`,
    },
  };

  // Sign the version negotiation
  const vnMessageData = JSON.stringify({
    type: versionNegotiation.type,
    payload: versionNegotiation.payload,
    source: versionNegotiation.metadata.source,
    nonce: versionNegotiation.metadata.nonce,
  });

  const vnMessageBytes = new TextEncoder().encode(vnMessageData);
  const vnSignatureObj = CryptographicService.sign(
    vnMessageBytes,
    nodeKeyPair.privateKey,
    'secp256k1'
  );

  const vnSignatureHex = Array.from(vnSignatureObj.signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  versionNegotiation.metadata.signature = vnSignatureHex;

  console.log('🔄 Version negotiation message created:');
  console.log(
    `  Supported versions: ${(versionNegotiation.payload.data as any).supportedVersions.join(', ')}`
  );
  console.log(
    `  Preferred version: ${(versionNegotiation.payload.data as any).preferredVersion}`
  );
  console.log(
    `  UTXO-only support: ${(versionNegotiation.payload.data as any).features.supportsUTXOOnly}`
  );
  console.log(
    `  Hybrid networking: ${(versionNegotiation.payload.data as any).features.supportsHybridNetworking}`
  );

  console.log('\n✅ Version negotiation ready!\n');
}

/**
 * Main example runner
 *
 * Runs all examples in sequence to demonstrate complete integration
 */
async function runAllExamples() {
  console.log(
    '\n╔═══════════════════════════════════════════════════════════╗'
  );
  console.log('║  Blockchain Message Handler Integration Examples       ║');
  console.log('║  Lorachain Network - UTXO-Only Design                  ║');
  console.log(
    '╚═══════════════════════════════════════════════════════════╝\n'
  );

  try {
    await exampleCompleteSetup();
    await exampleBlockAnnouncement();
    await exampleTransactionBroadcast();
    await examplePeerHandshake();
    await exampleVersionNegotiation();

    console.log(
      '╔═══════════════════════════════════════════════════════════╗'
    );
    console.log('║  All Examples Completed Successfully!                  ║');
    console.log(
      '╚═══════════════════════════════════════════════════════════╝\n'
    );
  } catch (error) {
    console.error('❌ Example failed:', error);
    throw error;
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

export {
  exampleCompleteSetup,
  exampleBlockAnnouncement,
  exampleTransactionBroadcast,
  examplePeerHandshake,
  exampleVersionNegotiation,
  runAllExamples,
};
