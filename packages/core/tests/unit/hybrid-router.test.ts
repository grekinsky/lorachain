/**
 * Unit tests for HybridRouter
 *
 * Tests the core hybrid routing infrastructure including:
 * - Router lifecycle management (start/stop)
 * - Event emission
 * - Routing table management
 * - Configuration handling
 * - Route decision logic
 * - Performance metrics updates
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HybridRouter,
  HybridRouterConfig,
  RouteDecision,
  RoutePerformance,
  HybridRoutingMessage,
} from '../../src/hybrid-router.js';
import { PeerManager } from '../../src/peer-manager.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOManager } from '../../src/utxo.js';
import { DutyCycleManager } from '../../src/duty-cycle.js';

describe('HybridRouter', () => {
  let hybridRouter: HybridRouter;
  let mockPeerManager: PeerManager;
  let mockCompressionManager: UTXOCompressionManager;
  let mockConfig: HybridRouterConfig;

  beforeEach(() => {
    // Create mock peer manager
    mockPeerManager = new PeerManager({
      discovery: {
        dnsSeeds: [],
        enablePeerExchange: false,
        enableMdns: false,
        enableMeshAnnounce: false,
        discoveryInterval: 60000,
        maxDiscoveryPeers: 100,
      },
      connectionPool: {
        maxConnections: 10,
        maxOutbound: 8,
        maxInbound: 2,
        connectionTimeout: 5000,
        reconnectInterval: 10000,
        maxReconnectAttempts: 3,
        preferredPeerTypes: ['full'],
      },
      enableAutoOptimization: false,
      optimizationInterval: 120000,
    });

    // Create mock compression manager
    const mockUTXOManager = new UTXOManager();
    const mockDutyCycleManager = new DutyCycleManager({
      region: 'US',
      enableCompliance: false,
      enforceDutyCycle: false,
    });

    mockCompressionManager = new UTXOCompressionManager(
      {
        enableCompression: false,
        compressionThreshold: 100,
        defaultAlgorithm: 'none',
        enableAdaptive: false,
      },
      mockUTXOManager,
      mockDutyCycleManager
    );

    // Create router configuration
    mockConfig = {
      enableAutoOptimization: false,
      optimizationInterval: 60000,
      maxConcurrentBridgeOperations: 10,
      crossNetworkTimeout: 15000,
      preferredNetwork: 'adaptive',
    };

    // Create hybrid router
    hybridRouter = new HybridRouter(
      mockConfig,
      mockPeerManager,
      mockCompressionManager
    );
  });

  afterEach(async () => {
    if (hybridRouter && hybridRouter.getIsRunning()) {
      await hybridRouter.stop();
    }
    if (mockPeerManager) {
      await mockPeerManager.stop();
    }
  });

  describe('Lifecycle Management', () => {
    test('should initialize with provided configuration', () => {
      expect(hybridRouter).toBeDefined();
      expect(hybridRouter.getConfig()).toEqual(mockConfig);
    });

    test('should start router successfully', async () => {
      await hybridRouter.start();
      expect(hybridRouter.getIsRunning()).toBe(true);
    });

    test('should stop router successfully', async () => {
      await hybridRouter.start();
      expect(hybridRouter.getIsRunning()).toBe(true);

      await hybridRouter.stop();
      expect(hybridRouter.getIsRunning()).toBe(false);
    });

    test('should not start if already running', async () => {
      await hybridRouter.start();
      expect(hybridRouter.getIsRunning()).toBe(true);

      // Second start should be idempotent
      await hybridRouter.start();
      expect(hybridRouter.getIsRunning()).toBe(true);
    });

    test('should not stop if not running', async () => {
      expect(hybridRouter.getIsRunning()).toBe(false);

      // Stop should be idempotent
      await hybridRouter.stop();
      expect(hybridRouter.getIsRunning()).toBe(false);
    });

    test('should emit router:started event on start', async () => {
      const startedSpy = vi.fn();
      hybridRouter.on('router:started', startedSpy);

      await hybridRouter.start();

      expect(startedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    test('should emit router:stopped event on stop', async () => {
      const stoppedSpy = vi.fn();
      hybridRouter.on('router:stopped', stoppedSpy);

      await hybridRouter.start();
      await hybridRouter.stop();

      expect(stoppedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    test('should clear routing table on stop', async () => {
      await hybridRouter.start();

      // Create a route to cache
      const destination = 'node-123';
      const messageType = 'block';
      hybridRouter.determineOptimalPath(destination, messageType);

      // Stop should clear routing table
      await hybridRouter.stop();
      expect(hybridRouter.getRoutingTableSize()).toBe(0);
    });
  });

  describe('Routing Table Management', () => {
    test('should initialize with empty routing table', () => {
      expect(hybridRouter.getRoutingTableSize()).toBe(0);
    });

    test('should return routing table size', () => {
      const size = hybridRouter.getRoutingTableSize();
      expect(size).toBe(0);
      expect(typeof size).toBe('number');
    });

    test('should update routing metrics for routes', () => {
      const destination = 'node-123';
      const performance: RoutePerformance = {
        actualDelay: 500,
        successRate: 0.95,
        packetLoss: 0.02,
      };

      // Should handle update even if no cached route exists
      expect(() => {
        hybridRouter.updateRoutingMetrics(destination, performance);
      }).not.toThrow();
    });

    test('should emit route:updated event when metrics updated', async () => {
      const updateSpy = vi.fn();
      hybridRouter.on('route:updated', updateSpy);

      await hybridRouter.start();

      const destination = 'node-456';
      const performance: RoutePerformance = {
        actualDelay: 300,
        successRate: 0.98,
        packetLoss: 0.01,
      };

      // First create a route by determining optimal path
      hybridRouter.determineOptimalPath(destination, 'transaction');

      // Then update metrics
      hybridRouter.updateRoutingMetrics(destination, performance);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          destination,
          performance,
        })
      );
    });
  });

  describe('Configuration', () => {
    test('should use provided configuration', () => {
      const config = hybridRouter.getConfig();
      expect(config.preferredNetwork).toBe('adaptive');
      expect(config.enableAutoOptimization).toBe(false);
      expect(config.optimizationInterval).toBe(60000);
      expect(config.maxConcurrentBridgeOperations).toBe(10);
      expect(config.crossNetworkTimeout).toBe(15000);
    });

    test('should return copy of configuration', () => {
      const config1 = hybridRouter.getConfig();
      const config2 = hybridRouter.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    test('should handle mesh preferred network', () => {
      const meshConfig: HybridRouterConfig = {
        ...mockConfig,
        preferredNetwork: 'mesh',
      };

      const meshRouter = new HybridRouter(
        meshConfig,
        mockPeerManager,
        mockCompressionManager
      );

      const route = meshRouter.determineOptimalPath('node-123', 'block');
      expect(route.targetNetwork).toBe('mesh');
    });

    test('should handle internet preferred network', () => {
      const internetConfig: HybridRouterConfig = {
        ...mockConfig,
        preferredNetwork: 'internet',
      };

      const internetRouter = new HybridRouter(
        internetConfig,
        mockPeerManager,
        mockCompressionManager
      );

      const route = internetRouter.determineOptimalPath('node-456', 'block');
      expect(route.targetNetwork).toBe('internet');
    });

    test('should default adaptive to internet', () => {
      const route = hybridRouter.determineOptimalPath('node-789', 'block');
      expect(route.targetNetwork).toBe('internet');
    });
  });

  describe('Route Decision Logic', () => {
    test('should determine optimal path for destination', () => {
      const destination = 'node-123';
      const messageType = 'block';

      const route = hybridRouter.determineOptimalPath(destination, messageType);

      expect(route).toBeDefined();
      expect(route.targetNetwork).toBeDefined();
      expect(route.priority).toBeDefined();
      expect(route.estimatedDelay).toBeGreaterThan(0);
      expect(route.cost).toBeGreaterThan(0);
      expect(route.reliability).toBeGreaterThanOrEqual(0);
      expect(route.reliability).toBeLessThanOrEqual(1);
    });

    test('should return default route with correct structure', () => {
      const route = hybridRouter.determineOptimalPath('node-123', 'block');

      expect(route).toMatchObject({
        targetNetwork: expect.any(String),
        priority: expect.stringMatching(/^(high|medium|low)$/),
        estimatedDelay: expect.any(Number),
        cost: expect.any(Number),
        reliability: expect.any(Number),
      });
    });

    test('should use cached route when available and valid', () => {
      const destination = 'node-123';
      const messageType = 'block';

      // First call creates and caches route
      const route1 = hybridRouter.determineOptimalPath(
        destination,
        messageType
      );

      // Second call should return same cached route
      const route2 = hybridRouter.determineOptimalPath(
        destination,
        messageType
      );

      expect(route1).toEqual(route2);
    });
  });

  describe('Message Routing', () => {
    test('should route message when router is running', async () => {
      await hybridRouter.start();

      const message: HybridRoutingMessage = {
        type: 'block',
        payload: new Uint8Array([1, 2, 3, 4]),
        timestamp: Date.now(),
        signature: 'test-signature',
      };

      const result = await hybridRouter.routeMessage(message, 'node-123');
      expect(result).toBe(true);
    });

    test('should reject routing when router is not running', async () => {
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([5, 6, 7, 8]),
        timestamp: Date.now(),
        signature: 'test-signature',
      };

      const result = await hybridRouter.routeMessage(message, 'node-456');
      expect(result).toBe(false);
    });

    test('should handle routing different message types', async () => {
      await hybridRouter.start();

      const messageTypes = [
        'block',
        'transaction',
        'sync_request',
        'peer_discovery',
      ];

      for (const type of messageTypes) {
        const message: HybridRoutingMessage = {
          type,
          payload: new Uint8Array([1, 2, 3]),
          timestamp: Date.now(),
          signature: 'test-sig',
        };

        const result = await hybridRouter.routeMessage(message, `node-${type}`);
        expect(result).toBe(true);
      }
    });

    test('should handle routing to different destinations', async () => {
      await hybridRouter.start();

      const message: HybridRoutingMessage = {
        type: 'block',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const destinations = ['node-1', 'node-2', 'node-3'];

      for (const destination of destinations) {
        const result = await hybridRouter.routeMessage(message, destination);
        expect(result).toBe(true);
      }
    });
  });

  describe('Route Decision Properties', () => {
    test('should create route with valid priority levels', () => {
      const route = hybridRouter.determineOptimalPath('node-123', 'block');
      expect(['high', 'medium', 'low']).toContain(route.priority);
    });

    test('should create route with valid target networks', () => {
      const route = hybridRouter.determineOptimalPath(
        'node-456',
        'transaction'
      );
      expect(['mesh', 'internet', 'hybrid']).toContain(route.targetNetwork);
    });

    test('should create route with reasonable delay estimate', () => {
      const route = hybridRouter.determineOptimalPath(
        'node-789',
        'sync_request'
      );
      expect(route.estimatedDelay).toBeGreaterThan(0);
      expect(route.estimatedDelay).toBeLessThan(60000); // Less than 1 minute
    });

    test('should create route with valid reliability range', () => {
      const route = hybridRouter.determineOptimalPath('node-abc', 'block');
      expect(route.reliability).toBeGreaterThanOrEqual(0);
      expect(route.reliability).toBeLessThanOrEqual(1);
    });

    test('should create route with positive cost', () => {
      const route = hybridRouter.determineOptimalPath(
        'node-def',
        'transaction'
      );
      expect(route.cost).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics Updates', () => {
    test('should update delay in cached route', async () => {
      await hybridRouter.start();

      const destination = 'node-123';
      hybridRouter.determineOptimalPath(destination, 'block');

      const performance: RoutePerformance = {
        actualDelay: 250,
        successRate: 0.99,
        packetLoss: 0.005,
      };

      hybridRouter.updateRoutingMetrics(destination, performance);

      // Route should be updated with new metrics
      const updatedRoute = hybridRouter.determineOptimalPath(
        destination,
        'block'
      );
      expect(updatedRoute.estimatedDelay).toBe(250);
      expect(updatedRoute.reliability).toBe(0.99);
    });

    test('should update reliability in cached route', async () => {
      await hybridRouter.start();

      const destination = 'node-456';
      hybridRouter.determineOptimalPath(destination, 'transaction');

      const performance: RoutePerformance = {
        actualDelay: 150,
        successRate: 0.97,
        packetLoss: 0.015,
      };

      hybridRouter.updateRoutingMetrics(destination, performance);

      const updatedRoute = hybridRouter.determineOptimalPath(
        destination,
        'transaction'
      );
      expect(updatedRoute.reliability).toBe(0.97);
    });

    test('should handle multiple metric updates', async () => {
      await hybridRouter.start();

      const destination = 'node-789';
      hybridRouter.determineOptimalPath(destination, 'sync_request');

      const updates: RoutePerformance[] = [
        { actualDelay: 200, successRate: 0.95, packetLoss: 0.02 },
        { actualDelay: 180, successRate: 0.96, packetLoss: 0.015 },
        { actualDelay: 190, successRate: 0.97, packetLoss: 0.01 },
      ];

      for (const performance of updates) {
        hybridRouter.updateRoutingMetrics(destination, performance);
      }

      const finalRoute = hybridRouter.determineOptimalPath(
        destination,
        'sync_request'
      );
      // Should have the last update's values
      expect(finalRoute.estimatedDelay).toBe(190);
      expect(finalRoute.reliability).toBe(0.97);
    });
  });
});
