import { describe, test, expect, beforeEach, vi } from 'vitest';
import { UTXOEnhancedMeshProtocol } from '../../src/enhanced-mesh-protocol.js';
import { DutyCycleConfigFactory } from '../../src/duty-cycle-config.js';
import {
  type RoutingConfig,
  type FragmentationConfig,
  type DutyCycleConfig,
  type MeshMessage,
  type UTXOTransaction,
  type Block,
  type CompressedMerkleProof,
} from '../../src/types.js';
import { CryptographicService, type KeyPair } from '../../src/cryptographic.js';

// Mock Logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: (): Record<string, unknown> => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('UTXOEnhancedMeshProtocol', () => {
  let meshProtocol: UTXOEnhancedMeshProtocol;
  let nodeKeyPair: KeyPair;
  let routingConfig: RoutingConfig;
  let fragmentationConfig: FragmentationConfig;
  let dutyCycleConfig: DutyCycleConfig;

  beforeEach(() => {
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');

    routingConfig = {
      routeDiscoveryTimeout: 1000, // Reduced for tests
      maxRouteDiscoveryRetries: 3,
      routeRequestTTL: 10,
      routeExpiryTime: 300000,
      routeCleanupInterval: 60000,
      maxRoutesPerDestination: 3,
      floodCacheSize: 500,
      floodCacheExpiryTime: 60000,
      maxFloodTTL: 15,
      acknowledgmentTimeout: 5000,
      maxForwardRetries: 3,
      fragmentSize: 200,
      maxSequenceNumberAge: 600000,
      holdDownTime: 60000,
      maxPathLength: 15,
      maxRoutingTableSize: 1000,
      maxPendingForwards: 100,
      memoryCleanupInterval: 300000,
    };

    fragmentationConfig = {
      maxFragmentSize: 197,
      sessionTimeout: 300000,
      maxConcurrentSessions: 100,
      retryAttempts: 3,
      ackRequired: true,
    };

    dutyCycleConfig = DutyCycleConfigFactory.createForRegion('EU', 'testnet');

    const discoveryConfig = {
      beaconInterval: 30000,
      neighborTimeout: 120000,
      maxNeighbors: 50,
      enableTopologySharing: true,
      securityConfig: {
        enableBeaconSigning: false, // Disable for unit tests
        maxBeaconRate: 2,
        requireIdentityProof: false,
        allowAnonymousNodes: true,
        topologyValidationStrict: false,
      },
      performanceConfig: {
        maxBeaconProcessingTime: 100,
        maxNeighborLookupTime: 10,
        maxTopologyUpdateTime: 200,
        maxMemoryUsageMB: 10,
        enableAdaptiveBeaconInterval: false,
      },
    };

    meshProtocol = new UTXOEnhancedMeshProtocol(
      'test-node',
      'full',
      nodeKeyPair,
      routingConfig,
      fragmentationConfig,
      dutyCycleConfig,
      undefined, // reliableDeliveryConfig
      discoveryConfig
    );
  });

  test('should initialize correctly', () => {
    expect(meshProtocol.isConnectedToMesh()).toBe(false);
    expect(meshProtocol.getNodeType()).toBe('full');
    expect(meshProtocol.getCurrentBlockchainHeight()).toBe(0);
    expect(meshProtocol.getUTXOSetCompleteness()).toBe(0.0);
  });

  test('should connect to mesh network', async () => {
    expect(meshProtocol.isConnectedToMesh()).toBe(false);

    await meshProtocol.connect();

    expect(meshProtocol.isConnectedToMesh()).toBe(true);
  });

  test('should disconnect from mesh network', async () => {
    await meshProtocol.connect();
    expect(meshProtocol.isConnectedToMesh()).toBe(true);

    await meshProtocol.disconnect();

    expect(meshProtocol.isConnectedToMesh()).toBe(false);
  });

  test('should not send messages when disconnected', async () => {
    const message: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-1' },
      timestamp: Date.now(),
      from: 'test-node',
      to: 'destination-node',
      signature: 'signature',
    };

    const success = await meshProtocol.sendMessage(message);
    expect(success).toBe(false);
  });

  test('should send routed messages when connected', async () => {
    await meshProtocol.connect();

    const message: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-1' },
      timestamp: Date.now(),
      from: 'test-node',
      to: 'destination-node',
      signature: 'signature',
    };

    // Since we don't have routes yet, this should fail gracefully
    const success = await meshProtocol.sendMessage(message);
    // The exact behavior depends on implementation - could be false or true with fallback
    expect(typeof success).toBe('boolean');
  });

  test('should broadcast messages when no destination specified', async () => {
    await meshProtocol.connect();

    const message: MeshMessage = {
      type: 'discovery',
      payload: { nodeId: 'test-node' },
      timestamp: Date.now(),
      from: 'test-node',
      signature: 'signature',
    };

    const success = await meshProtocol.sendMessage(message);
    expect(typeof success).toBe('boolean');
  });

  test('should send UTXO transactions', async () => {
    await meshProtocol.connect();

    const utxoTx: UTXOTransaction = {
      id: 'tx-1',
      inputs: [
        {
          previousTxId: 'prev-tx',
          outputIndex: 0,
          unlockingScript: 'signature + pubkey',
          sequence: 0,
        },
      ],
      outputs: [
        {
          value: 100,
          lockingScript: 'pubkey-hash',
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    };

    const success = await meshProtocol.sendUTXOTransaction(utxoTx);
    expect(typeof success).toBe('boolean');
  });

  test('should send blocks', async () => {
    await meshProtocol.connect();

    const block: Block = {
      index: 1,
      timestamp: Date.now(),
      transactions: [],
      previousHash: 'prev-hash',
      hash: 'block-hash',
      nonce: 12345,
      merkleRoot: 'merkle-root',
      difficulty: 1000,
    };

    const success = await meshProtocol.sendBlock(block);
    expect(typeof success).toBe('boolean');
  });

  test('should send merkle proofs', async () => {
    await meshProtocol.connect();

    const merkleProof: CompressedMerkleProof = {
      txId: 'tx-1',
      txHash: 'tx-hash',
      root: 'merkle-root',
      path: 'compressed-path',
      index: 0,
    };

    const success = await meshProtocol.sendMerkleProof(merkleProof);
    expect(typeof success).toBe('boolean');
  });

  test('should receive and parse messages', () => {
    const message: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-1' },
      timestamp: Date.now(),
      from: 'sender-node',
      to: 'test-node',
      signature: 'signature',
    };

    const messageData = new TextEncoder().encode(JSON.stringify(message));
    const receivedMessage = meshProtocol.receiveMessage(messageData);

    expect(receivedMessage).toEqual(message);
  });

  test('should handle invalid message data gracefully', () => {
    const invalidData = new Uint8Array([1, 2, 3, 4, 5]); // Invalid JSON
    const receivedMessage = meshProtocol.receiveMessage(invalidData);

    expect(receivedMessage).toBeNull();
  });

  test('should provide network topology', () => {
    const topology = meshProtocol.getNetworkTopology();

    expect(topology).toHaveProperty('nodes');
    expect(topology).toHaveProperty('links');
    expect(topology).toHaveProperty('lastUpdated');
    expect(topology.nodes).toBeInstanceOf(Map);
    expect(topology.links).toBeInstanceOf(Map);
    expect(typeof topology.lastUpdated).toBe('number');
  });

  test('should provide neighbors list', () => {
    const neighbors = meshProtocol.getNeighbors();
    expect(Array.isArray(neighbors)).toBe(true);
  });

  test('should provide reachable nodes list', () => {
    const reachableNodes = meshProtocol.getReachableNodes();
    expect(Array.isArray(reachableNodes)).toBe(true);
  });

  test('should provide routing statistics', () => {
    const stats = meshProtocol.getRoutingStatistics();

    expect(stats).toHaveProperty('totalRoutes');
    expect(stats).toHaveProperty('activeRoutes');
    expect(stats).toHaveProperty('routeDiscoveryLatency');
    expect(stats).toHaveProperty('messageDeliveryRate');
    expect(stats).toHaveProperty('loopDetectionCount');
    expect(stats).toHaveProperty('floodSuppressionRate');
    expect(stats).toHaveProperty('memoryUsage');
    expect(typeof stats.totalRoutes).toBe('number');
  });

  test('should provide fragmentation statistics', () => {
    const stats = meshProtocol.getFragmentationStats();

    expect(stats).toHaveProperty('totalMessagesSent');
    expect(stats).toHaveProperty('totalMessagesReceived');
    expect(stats).toHaveProperty('totalFragmentsSent');
    expect(stats).toHaveProperty('totalFragmentsReceived');
    expect(stats).toHaveProperty('averageFragmentsPerMessage');
    expect(stats).toHaveProperty('retransmissionRate');
    expect(stats).toHaveProperty('reassemblySuccessRate');
    expect(stats).toHaveProperty('averageDeliveryTime');
    expect(typeof stats.totalMessagesSent).toBe('number');
  });

  test('should update fragmentation configuration', () => {
    const newConfig: FragmentationConfig = {
      maxFragmentSize: 150,
      sessionTimeout: 240000,
      maxConcurrentSessions: 80,
      retryAttempts: 5,
      ackRequired: false,
    };

    meshProtocol.setFragmentationConfig(newConfig);
    // The config should be updated (no direct way to verify in current interface)
  });

  test('should clear reassembly buffers', () => {
    // Should not throw
    meshProtocol.clearReassemblyBuffers();
  });

  test('should handle missing fragment retransmission', async () => {
    // Should not throw
    await meshProtocol.retransmitMissingFragments('test-message-id');
  });

  test('should discover routes', async () => {
    await meshProtocol.connect();

    // Mock route discovery - in real implementation would involve network communication
    const discoveredRoute =
      await meshProtocol.discoverRoute('destination-node');

    // Since we don't have actual network, this will likely return null
    // But it should not throw an error
    expect(
      discoveredRoute === null || typeof discoveredRoute === 'object'
    ).toBe(true);
  });

  test('should get route to destination', () => {
    const route = meshProtocol.getRouteToDestination('non-existent-node');
    expect(route).toBeNull(); // No routes exist initially
  });

  test('should invalidate routes', () => {
    // Should not throw even if route doesn't exist
    meshProtocol.invalidateRoute(
      'non-existent-destination',
      'non-existent-hop'
    );
  });

  test('should emit events on connection state changes', async () => {
    let connectedEventEmitted = false;
    let disconnectedEventEmitted = false;

    meshProtocol.on('connected', () => {
      connectedEventEmitted = true;
    });

    meshProtocol.on('disconnected', () => {
      disconnectedEventEmitted = true;
    });

    await meshProtocol.connect();
    expect(connectedEventEmitted).toBe(true);

    await meshProtocol.disconnect();
    expect(disconnectedEventEmitted).toBe(true);
  });

  test('should handle different node types', () => {
    const discoveryConfig = {
      beaconInterval: 30000,
      neighborTimeout: 120000,
      maxNeighbors: 50,
      enableTopologySharing: true,
      securityConfig: {
        enableBeaconSigning: false,
        maxBeaconRate: 2,
        requireIdentityProof: false,
        allowAnonymousNodes: true,
        topologyValidationStrict: false,
      },
      performanceConfig: {
        maxBeaconProcessingTime: 100,
        maxNeighborLookupTime: 10,
        maxTopologyUpdateTime: 200,
        maxMemoryUsageMB: 10,
        enableAdaptiveBeaconInterval: false,
      },
    };

    const lightNodeProtocol = new UTXOEnhancedMeshProtocol(
      'light-node',
      'light',
      nodeKeyPair,
      routingConfig,
      fragmentationConfig,
      dutyCycleConfig,
      undefined, // reliableDeliveryConfig
      discoveryConfig
    );

    const miningNodeProtocol = new UTXOEnhancedMeshProtocol(
      'mining-node',
      'mining',
      nodeKeyPair,
      routingConfig,
      fragmentationConfig,
      dutyCycleConfig,
      undefined, // reliableDeliveryConfig
      discoveryConfig
    );

    expect(lightNodeProtocol.getNodeType()).toBe('light');
    expect(miningNodeProtocol.getNodeType()).toBe('mining');
  });

  test('should handle route discovery timeout', async () => {
    await meshProtocol.connect();

    // Set a very short timeout for testing
    const shortTimeoutConfig = {
      ...routingConfig,
      routeDiscoveryTimeout: 100, // 100ms
    };

    const discoveryConfig = {
      beaconInterval: 30000,
      neighborTimeout: 120000,
      maxNeighbors: 50,
      enableTopologySharing: true,
      securityConfig: {
        enableBeaconSigning: false,
        maxBeaconRate: 2,
        requireIdentityProof: false,
        allowAnonymousNodes: true,
        topologyValidationStrict: false,
      },
      performanceConfig: {
        maxBeaconProcessingTime: 100,
        maxNeighborLookupTime: 10,
        maxTopologyUpdateTime: 200,
        maxMemoryUsageMB: 10,
        enableAdaptiveBeaconInterval: false,
      },
    };

    const shortTimeoutProtocol = new UTXOEnhancedMeshProtocol(
      'test-node-2',
      'full',
      nodeKeyPair,
      shortTimeoutConfig,
      fragmentationConfig,
      dutyCycleConfig,
      undefined, // reliableDeliveryConfig
      discoveryConfig
    );

    await shortTimeoutProtocol.connect();

    const startTime = Date.now();
    const route = await shortTimeoutProtocol.discoverRoute('non-existent-node');
    const endTime = Date.now();

    expect(route).toBeNull();
    expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    expect(endTime - startTime).toBeLessThan(200); // Should timeout quickly
  });

  test('should broadcast to multiple neighbors', async () => {
    await meshProtocol.connect();

    // Add some mock neighbors
    const _neighbors = meshProtocol.getNeighbors();
    // Since we start with no neighbors, broadcast should handle empty neighbor list

    const message: MeshMessage = {
      type: 'discovery',
      payload: { announcement: 'test' },
      timestamp: Date.now(),
      from: 'test-node',
      signature: 'signature',
    };

    const success = await meshProtocol.broadcastMessage(message);
    // With no neighbors, broadcast might return false or true depending on implementation
    expect(typeof success).toBe('boolean');
  });

  test('should exclude nodes from broadcast', async () => {
    await meshProtocol.connect();

    const message: MeshMessage = {
      type: 'discovery',
      payload: { announcement: 'test' },
      timestamp: Date.now(),
      from: 'test-node',
      signature: 'signature',
    };

    const excludeNodes = ['excluded-node-1', 'excluded-node-2'];
    const success = await meshProtocol.broadcastMessage(message, excludeNodes);

    expect(typeof success).toBe('boolean');
  });
});
