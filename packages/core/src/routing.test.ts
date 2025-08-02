import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  UTXORouteManager,
  BlockchainFloodManager,
  UTXOMessageForwarder,
  CryptoLoopPrevention,
} from './routing.js';
import {
  type BlockchainRouteEntry,
  type BlockchainFloodMessage,
  type RoutingConfig,
  type MeshMessage,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';

// Mock Logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('UTXORouteManager', () => {
  let routeManager: UTXORouteManager;
  let nodeKeyPair: KeyPair;
  let config: RoutingConfig;

  beforeEach(() => {
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');
    config = {
      routeDiscoveryTimeout: 30000,
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

    routeManager = new UTXORouteManager('test-node', nodeKeyPair, config);
  });

  test('should initialize with empty routing table', () => {
    const routes = routeManager.getAllRoutes();
    expect(routes.size).toBe(0);
  });

  test('should add and retrieve blockchain routes', () => {
    const route: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'node-2',
      hopCount: 2,
      sequenceNumber: 1,
      timestamp: Date.now(),
      linkQuality: 0.9,
      nodeType: 'full',
      utxoSetCompleteness: 1.0,
      blockchainHeight: 100,
      isActive: true,
      lastUTXOSync: Date.now(),
      signature: 'valid-signature',
    };

    const added = routeManager.addRoute(route);
    expect(added).toBe(true);

    const retrieved = routeManager.getBestRouteForUTXO('node-1');
    expect(retrieved).toEqual(route);
  });

  test('should prioritize full nodes over light clients', () => {
    const lightRoute: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'light-node',
      hopCount: 1,
      sequenceNumber: 1,
      timestamp: Date.now(),
      linkQuality: 0.9,
      nodeType: 'light',
      utxoSetCompleteness: 0.5,
      blockchainHeight: 50,
      isActive: true,
      lastUTXOSync: Date.now() - 60000,
      signature: 'valid-signature',
    };

    const fullRoute: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'full-node',
      hopCount: 2,
      sequenceNumber: 2,
      timestamp: Date.now(),
      linkQuality: 0.8,
      nodeType: 'full',
      utxoSetCompleteness: 1.0,
      blockchainHeight: 100,
      isActive: true,
      lastUTXOSync: Date.now(),
      signature: 'valid-signature',
    };

    routeManager.addRoute(lightRoute);
    routeManager.addRoute(fullRoute);

    const bestRoute = routeManager.getBestRouteForUTXO('node-1');
    expect(bestRoute?.nodeType).toBe('full');
    expect(bestRoute?.nextHop).toBe('full-node');
  });

  test('should find best route to full node', () => {
    const routes: BlockchainRouteEntry[] = [
      {
        destination: 'full-node-1',
        nextHop: 'hop-1',
        hopCount: 1,
        sequenceNumber: 1,
        timestamp: Date.now(),
        linkQuality: 0.9,
        nodeType: 'full',
        utxoSetCompleteness: 1.0,
        blockchainHeight: 100,
        isActive: true,
        lastUTXOSync: Date.now(),
        signature: 'valid-signature',
      },
      {
        destination: 'light-node-1',
        nextHop: 'hop-2',
        hopCount: 1,
        sequenceNumber: 1,
        timestamp: Date.now(),
        linkQuality: 0.95,
        nodeType: 'light',
        utxoSetCompleteness: 0.5,
        blockchainHeight: 50,
        isActive: true,
        lastUTXOSync: Date.now(),
        signature: 'valid-signature',
      },
    ];

    routes.forEach(route => routeManager.addRoute(route));

    const bestFullNode = routeManager.getBestRouteForFullNode();
    expect(bestFullNode?.nodeType).toBe('full');
    expect(bestFullNode?.destination).toBe('full-node-1');
  });

  test('should update blockchain metrics', () => {
    const route: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'node-2',
      hopCount: 2,
      sequenceNumber: 1,
      timestamp: Date.now(),
      linkQuality: 0.9,
      nodeType: 'full',
      utxoSetCompleteness: 0.8,
      blockchainHeight: 100,
      isActive: true,
      lastUTXOSync: Date.now() - 60000,
      signature: 'valid-signature',
    };

    routeManager.addRoute(route);
    routeManager.updateBlockchainMetrics('node-1', 150, 0.95);

    const updatedRoute = routeManager.getBestRouteForUTXO('node-1');
    expect(updatedRoute?.blockchainHeight).toBe(150);
    expect(updatedRoute?.utxoSetCompleteness).toBe(0.95);
  });

  test('should remove routes', () => {
    const route: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'node-2',
      hopCount: 2,
      sequenceNumber: 1,
      timestamp: Date.now(),
      linkQuality: 0.9,
      nodeType: 'full',
      utxoSetCompleteness: 1.0,
      blockchainHeight: 100,
      isActive: true,
      lastUTXOSync: Date.now(),
      signature: 'valid-signature',
    };

    routeManager.addRoute(route);
    expect(routeManager.getBestRouteForUTXO('node-1')).toBeTruthy();

    const removed = routeManager.removeRoute('node-1', 'node-2');
    expect(removed).toBe(true);
    expect(routeManager.getBestRouteForUTXO('node-1')).toBeNull();
  });

  test('should provide routing statistics', () => {
    const route: BlockchainRouteEntry = {
      destination: 'node-1',
      nextHop: 'node-2',
      hopCount: 2,
      sequenceNumber: 1,
      timestamp: Date.now(),
      linkQuality: 0.9,
      nodeType: 'full',
      utxoSetCompleteness: 1.0,
      blockchainHeight: 100,
      isActive: true,
      lastUTXOSync: Date.now(),
      signature: 'valid-signature',
    };

    routeManager.addRoute(route);
    const stats = routeManager.getRoutingStatistics();

    expect(stats.totalRoutes).toBe(1);
    expect(stats.activeRoutes).toBe(1);
    expect(stats.memoryUsage.routingTable).toBeGreaterThan(0);
  });
});

describe('BlockchainFloodManager', () => {
  let floodManager: BlockchainFloodManager;
  let config: RoutingConfig;

  beforeEach(() => {
    config = {
      routeDiscoveryTimeout: 30000,
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

    floodManager = new BlockchainFloodManager('test-node', config);
  });

  test('should allow new flood messages', () => {
    const floodMessage: BlockchainFloodMessage = {
      id: 'msg-1',
      originator: 'node-1',
      sequenceNumber: 1,
      ttl: 5,
      messageType: 'utxo_transaction',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'high',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const shouldForward = floodManager.shouldForwardFlood(floodMessage);
    expect(shouldForward).toBe(true);
  });

  test('should suppress duplicate flood messages', () => {
    const floodMessage: BlockchainFloodMessage = {
      id: 'msg-1',
      originator: 'node-1',
      sequenceNumber: 1,
      ttl: 5,
      messageType: 'utxo_transaction',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'high',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const firstAttempt = floodManager.shouldForwardFlood(floodMessage);
    expect(firstAttempt).toBe(true);

    floodManager.markFloodProcessed('msg-1');

    const secondAttempt = floodManager.shouldForwardFlood(floodMessage);
    expect(secondAttempt).toBe(false);
  });

  test('should suppress messages with expired TTL', () => {
    const expiredMessage: BlockchainFloodMessage = {
      id: 'msg-2',
      originator: 'node-1',
      sequenceNumber: 2,
      ttl: 0,
      messageType: 'block',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'medium',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const shouldForward = floodManager.shouldForwardFlood(expiredMessage);
    expect(shouldForward).toBe(false);
  });

  test('should decrement TTL correctly', () => {
    const message: BlockchainFloodMessage = {
      id: 'msg-3',
      originator: 'node-1',
      sequenceNumber: 3,
      ttl: 5,
      messageType: 'discovery',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'low',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const decremented = floodManager.decrementTTL(message);
    expect(decremented.ttl).toBe(4);
    expect(decremented.id).toBe(message.id);
  });

  test('should prioritize UTXO transactions', () => {
    const utxoMessage: BlockchainFloodMessage = {
      id: 'msg-4',
      originator: 'node-1',
      sequenceNumber: 4,
      ttl: 5,
      messageType: 'utxo_transaction',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'high',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const discoveryMessage: BlockchainFloodMessage = {
      id: 'msg-5',
      originator: 'node-1',
      sequenceNumber: 5,
      ttl: 5,
      messageType: 'discovery',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'low',
      signature: 'valid-signature',
      isFragmented: false,
    };

    const utxoPriority = floodManager.prioritizeByMessageType(utxoMessage);
    const discoveryPriority =
      floodManager.prioritizeByMessageType(discoveryMessage);

    expect(utxoPriority).toBeGreaterThan(discoveryPriority);
  });

  test('should provide flood statistics', () => {
    const message: BlockchainFloodMessage = {
      id: 'msg-6',
      originator: 'node-1',
      sequenceNumber: 6,
      ttl: 5,
      messageType: 'block',
      payload: {} as any,
      timestamp: Date.now(),
      priority: 'medium',
      signature: 'valid-signature',
      isFragmented: false,
    };

    floodManager.shouldForwardFlood(message);
    const stats = floodManager.getFloodStatistics();

    expect(stats.cacheSize).toBe(1);
    expect(stats.maxCacheSize).toBe(config.floodCacheSize);
  });
});

describe('UTXOMessageForwarder', () => {
  let messageForwarder: UTXOMessageForwarder;
  let config: RoutingConfig;

  beforeEach(() => {
    config = {
      routeDiscoveryTimeout: 30000,
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

    messageForwarder = new UTXOMessageForwarder('test-node', config);
  });

  test('should forward UTXO messages successfully', async () => {
    const message: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-1' },
      timestamp: Date.now(),
      from: 'test-node',
      to: 'destination-node',
      signature: 'valid-signature',
    };

    const success = await messageForwarder.forwardUTXOMessage(
      message,
      'next-hop'
    );
    expect(success).toBe(true);
  });

  test('should handle acknowledgments', async () => {
    const message: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-2' },
      timestamp: Date.now(),
      from: 'test-node',
      to: 'destination-node',
      signature: 'valid-signature',
    };

    await messageForwarder.forwardUTXOMessage(message, 'next-hop');
    const stats = messageForwarder.getForwardingStatistics();

    expect(stats.pendingForwards).toBeGreaterThan(0);

    // Simulate acknowledgment
    const messageId = Object.keys(stats)[0]; // Get first pending message ID
    if (messageId) {
      messageForwarder.handleAcknowledgment(messageId);
    }
  });

  test('should prioritize UTXO transactions over other messages', () => {
    const utxoEntry = {
      messageId: 'msg-1',
      destination: 'node-1',
      nextHop: 'hop-1',
      messageType: 'utxo_transaction' as const,
      priority: 100,
      timestamp: Date.now(),
      retryCount: 0,
      acknowledged: false,
      isFragmented: false,
    };

    const discoveryEntry = {
      messageId: 'msg-2',
      destination: 'node-2',
      nextHop: 'hop-2',
      messageType: 'discovery' as const,
      priority: 40,
      timestamp: Date.now(),
      retryCount: 0,
      acknowledged: false,
      isFragmented: false,
    };

    const prioritized = messageForwarder.prioritizeUTXOTransactions([
      discoveryEntry,
      utxoEntry,
    ]);
    expect(prioritized[0].messageType).toBe('utxo_transaction');
    expect(prioritized[1].messageType).toBe('discovery');
  });

  test('should provide forwarding statistics', () => {
    const stats = messageForwarder.getForwardingStatistics();

    expect(stats).toHaveProperty('pendingForwards');
    expect(stats).toHaveProperty('queueLength');
    expect(stats).toHaveProperty('averageRetryCount');
    expect(typeof stats.pendingForwards).toBe('number');
  });
});

describe('CryptoLoopPrevention', () => {
  let loopPrevention: CryptoLoopPrevention;
  let nodeKeyPair: KeyPair;
  let config: RoutingConfig;

  beforeEach(() => {
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');
    config = {
      routeDiscoveryTimeout: 30000,
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

    loopPrevention = new CryptoLoopPrevention('test-node', nodeKeyPair, config);
  });

  test('should detect obvious loops in path', () => {
    const message: MeshMessage = {
      type: 'discovery',
      payload: {},
      timestamp: Date.now(),
      from: 'node-1',
      signature: 'valid-signature',
    };

    const pathWithLoop = ['node-1', 'node-2', 'node-3', 'node-2', 'node-4'];
    const hasLoop = loopPrevention.detectLoop(message, pathWithLoop);
    expect(hasLoop).toBe(true);
  });

  test('should detect when our node is already in path', () => {
    const message: MeshMessage = {
      type: 'discovery',
      payload: {},
      timestamp: Date.now(),
      from: 'node-1',
      signature: 'valid-signature',
    };

    const pathWithOurNode = ['node-1', 'node-2', 'test-node', 'node-3'];
    const hasLoop = loopPrevention.detectLoop(message, pathWithOurNode);
    expect(hasLoop).toBe(true);
  });

  test('should not detect loops in valid paths', () => {
    const message: MeshMessage = {
      type: 'discovery',
      payload: {},
      timestamp: Date.now(),
      from: 'node-1',
      signature: 'valid-signature',
    };

    const validPath = ['node-1', 'node-2', 'node-3', 'node-4'];
    const hasLoop = loopPrevention.detectLoop(message, validPath);
    expect(hasLoop).toBe(false);
  });

  test('should detect paths that are too long', () => {
    const message: MeshMessage = {
      type: 'discovery',
      payload: {},
      timestamp: Date.now(),
      from: 'node-1',
      signature: 'valid-signature',
    };

    const tooLongPath = Array.from({ length: 20 }, (_, i) => `node-${i}`);
    const hasLoop = loopPrevention.detectLoop(message, tooLongPath);
    expect(hasLoop).toBe(true);
  });

  test('should update and validate sequence numbers', () => {
    const nodeId = 'node-1';
    const seqNum = 100;
    const signature = 'valid-signature';

    // First sequence number should be valid
    const isValid1 = loopPrevention.isValidSequenceNumber(nodeId, seqNum);
    expect(isValid1).toBe(true);

    // Update sequence number
    loopPrevention.updateSequenceNumber(nodeId, seqNum, signature);

    // Higher sequence number should be valid
    const isValid2 = loopPrevention.isValidSequenceNumber(nodeId, seqNum + 1);
    expect(isValid2).toBe(true);

    // Lower sequence number should be invalid
    const isValid3 = loopPrevention.isValidSequenceNumber(nodeId, seqNum - 1);
    expect(isValid3).toBe(false);
  });

  test('should validate node identity', () => {
    const validNodeId = 'valid-node-123';
    const validPublicKey = 'abcdef123456';

    const isValid = loopPrevention.validateNodeIdentity(
      validNodeId,
      validPublicKey
    );
    expect(isValid).toBe(true);

    const isInvalid1 = loopPrevention.validateNodeIdentity('', validPublicKey);
    expect(isInvalid1).toBe(false);

    const isInvalid2 = loopPrevention.validateNodeIdentity(validNodeId, '');
    expect(isInvalid2).toBe(false);
  });

  test('should poison routes and start hold-down timers', () => {
    const destination = 'problem-node';
    const reason = 'link_failure';

    loopPrevention.poisonRoute(destination, reason);

    const stats = loopPrevention.getLoopPreventionStatistics();
    expect(stats.activeHoldDownTimers).toBe(1);
  });

  test('should provide loop prevention statistics', () => {
    const stats = loopPrevention.getLoopPreventionStatistics();

    expect(stats).toHaveProperty('activePathVectors');
    expect(stats).toHaveProperty('knownSequenceNumbers');
    expect(stats).toHaveProperty('activeHoldDownTimers');
    expect(typeof stats.activePathVectors).toBe('number');
  });
});
