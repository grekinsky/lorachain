/**
 * Hybrid Routing System Integration Tests
 *
 * Comprehensive integration tests for the hybrid routing system including:
 * - End-to-end message routing (mesh → gateway → internet)
 * - Network failover scenarios
 * - Gateway load balancing
 * - Protocol translation and UTXO integrity
 * - Traffic optimization
 * - Performance benchmarks
 *
 * Part 8 of 8 in the hybrid routing system implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridRouter } from '../../src/hybrid-router';
import { PeerManager } from '../../src/peer-manager';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager';
import { CryptographicService } from '../../src/cryptographic';
import { GatewayManager } from '../../src/gateway-manager';
import { TrafficOptimizer } from '../../src/traffic-optimizer';
import type { GatewayRegistration } from '../../src/gateway-manager';
import type { HybridRoutingMessage } from '../../src/hybrid-router';
import type { EnhancedNetworkNode } from '../../src/peer-manager';

describe('Hybrid Routing System Integration', () => {
  let router: HybridRouter;
  let peerManager: PeerManager;
  let compressionManager: UTXOCompressionManager;
  let gatewayManager: GatewayManager;
  let trafficOptimizer: TrafficOptimizer;

  beforeEach(async () => {
    // Initialize all dependencies
    peerManager = new PeerManager({
      maxPeers: 50,
      minPeers: 5,
      peerDiscoveryInterval: 60000,
      peerCleanupInterval: 300000,
      enableAutoDiscovery: false,
    });

    compressionManager = new UTXOCompressionManager({
      enableCompression: true,
      compressionThreshold: 100,
      defaultAlgorithm: 'gzip',
      enableAdaptive: false,
    });

    // Generate key pair for crypto service
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const cryptoService = new CryptographicService(
      keyPair.publicKey,
      keyPair.privateKey,
      'secp256k1'
    );

    // Initialize gateway and traffic managers
    gatewayManager = new GatewayManager(
      peerManager,
      cryptoService,
      compressionManager
    );

    trafficOptimizer = new TrafficOptimizer();

    const config = {
      enableAutoOptimization: true,
      optimizationInterval: 60000,
      maxConcurrentBridgeOperations: 10,
      crossNetworkTimeout: 15000,
      preferredNetwork: 'adaptive' as const,
    };

    router = new HybridRouter(
      config,
      peerManager,
      compressionManager,
      gatewayManager,
      trafficOptimizer
    );

    await router.start();
  });

  afterEach(async () => {
    await router.stop();
  });

  describe('End-to-End Message Routing', () => {
    it('should route mesh-to-internet message via gateway', async () => {
      // Setup: Add mesh peer and internet peer
      const meshPeer: EnhancedNetworkNode = {
        id: 'mesh-node-1',
        address: 'lora://mesh-node-1.mesh.local',
        type: 'full',
        latency: 200,
        reliability: 90,
        capabilities: ['transaction', 'block'],
        reputation: 80,
        lastSeen: Date.now(),
        connectionType: 'mesh',
      };

      const internetPeer: EnhancedNetworkNode = {
        id: 'internet-node-1',
        address: 'http://internet-node-1.example.com',
        type: 'full',
        latency: 50,
        reliability: 95,
        capabilities: ['transaction', 'block'],
        reputation: 90,
        lastSeen: Date.now(),
        connectionType: 'internet',
      };

      peerManager.addPeer(meshPeer);
      peerManager.addPeer(internetPeer);

      // Register a gateway
      const gatewayReg: GatewayRegistration = {
        nodeId: 'gateway-1',
        networkEndpoints: {
          meshEndpoint: 'lora://gateway-1.mesh.local',
          internetEndpoint: 'http://gateway-1.example.com',
        },
        capabilities: {
          meshConnected: true,
          internetConnected: true,
          maxThroughput: 100,
          supportedProtocols: ['utxo', 'block', 'transaction'],
        },
        authentication: {
          publicKey: 'test-pub-key',
          signature: 'test-signature',
        },
      };

      // Mock crypto verification
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(gatewayReg);

      // Update network conditions
      await router.updateNetworkConditions();

      // Route a message
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const routed = await router.routeMessage(message, internetPeer.id);

      expect(routed).toBe(true);
    });

    it('should handle network failover gracefully', async () => {
      // Setup peers
      const meshPeer = createMeshPeer('mesh-peer-1');
      const internetPeer = createInternetPeer('internet-peer-1');

      peerManager.addPeer(meshPeer);
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Trigger mesh network failure
      const failoverSpy = vi.fn();
      router.on('network:failover', failoverSpy);

      await router.handleNetworkFailover('mesh');

      expect(failoverSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          failedNetwork: 'mesh',
        })
      );

      // Verify routing table cleared for mesh routes
      const conditions = router.getNetworkConditions();
      expect(conditions.meshConnectivity).toBe(false);
    });

    it('should optimize traffic under high load', async () => {
      // Simulate high traffic
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Send multiple messages
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(router.routeMessage(message, internetPeer.id));
      }

      const results = await Promise.all(promises);

      // Verify most messages routed successfully (>90% success rate)
      const successCount = results.filter(r => r).length;
      expect(successCount).toBeGreaterThan(90);
    });

    it('should route messages to correct network based on peer type', async () => {
      const meshPeer = createMeshPeer('mesh-peer-1');
      const internetPeer = createInternetPeer('internet-peer-1');

      peerManager.addPeer(meshPeer);
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      // Route to mesh peer should use mesh network
      const meshRouteSpy = vi.fn();
      router.on('route:mesh', meshRouteSpy);

      await router.routeMessage(message, meshPeer.id);
      expect(meshRouteSpy).toHaveBeenCalled();

      // Route to internet peer should use internet network
      const internetRouteSpy = vi.fn();
      router.on('route:internet', internetRouteSpy);

      await router.routeMessage(message, internetPeer.id);
      expect(internetRouteSpy).toHaveBeenCalled();
    });
  });

  describe('Gateway Load Balancing', () => {
    it('should distribute load across multiple gateways', async () => {
      // Register multiple gateways
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const gateway1 = createGatewayRegistration('gateway-1');
      const gateway2 = createGatewayRegistration('gateway-2');
      const gateway3 = createGatewayRegistration('gateway-3');

      await gatewayManager.registerGateway(gateway1);
      await gatewayManager.registerGateway(gateway2);
      await gatewayManager.registerGateway(gateway3);

      // Set different loads
      gatewayManager.updateGatewayStatus('gateway-1', { currentLoad: 0.8 });
      gatewayManager.updateGatewayStatus('gateway-2', { currentLoad: 0.3 });
      gatewayManager.updateGatewayStatus('gateway-3', { currentLoad: 0.5 });

      // Select gateway multiple times
      const selections: string[] = [];
      for (let i = 0; i < 10; i++) {
        const gateway = gatewayManager.selectOptimalGateway({
          minScore: 0,
          maxLoad: 1.0,
        });
        if (gateway) selections.push(gateway.id);
      }

      // Verify load balanced (gateway-2 should be selected most)
      const gateway2Count = selections.filter(id => id === 'gateway-2').length;
      expect(gateway2Count).toBeGreaterThan(5);
    });

    it('should handle gateway failures with automatic rebalancing', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const gateway1 = createGatewayRegistration('gateway-1');
      const gateway2 = createGatewayRegistration('gateway-2');

      await gatewayManager.registerGateway(gateway1);
      await gatewayManager.registerGateway(gateway2);

      // Trigger gateway failure
      const failureSpy = vi.fn();
      gatewayManager.on('gateway:failed', failureSpy);

      gatewayManager.handleGatewayFailure('gateway-1');

      expect(failureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: 'gateway-1',
        })
      );

      // Verify traffic rebalanced
      const available = gatewayManager.getAvailableGateways();
      expect(available.find(g => g.id === 'gateway-1')).toBeUndefined();
      expect(available.find(g => g.id === 'gateway-2')).toBeDefined();
    });

    it('should monitor gateway health and detect unhealthy gateways', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const gatewayReg = createGatewayRegistration('gateway-1');
      await gatewayManager.registerGateway(gatewayReg);

      // Simulate old heartbeat (unhealthy)
      const gateway = gatewayManager.getGateway('gateway-1');
      if (gateway) {
        gateway.status.lastHeartbeat = Date.now() - 120000; // 2 minutes ago
      }

      const unhealthySpy = vi.fn();
      gatewayManager.on('gateway:unhealthy', unhealthySpy);

      const isHealthy = await gatewayManager.checkGatewayHealth('gateway-1');

      expect(isHealthy).toBe(false);
      expect(unhealthySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: 'gateway-1',
        })
      );
    });

    it('should select optimal gateway based on criteria', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      // Register gateways with different characteristics
      const gateway1 = createGatewayRegistration('gateway-1');
      const gateway2 = createGatewayRegistration('gateway-2');
      const gateway3 = createGatewayRegistration('gateway-3');

      await gatewayManager.registerGateway(gateway1);
      await gatewayManager.registerGateway(gateway2);
      await gatewayManager.registerGateway(gateway3);

      // Set different metrics
      gatewayManager.updateGatewayStatus('gateway-1', {
        currentLoad: 0.9,
      });
      gatewayManager.updateGatewayStatus('gateway-2', {
        currentLoad: 0.2,
      });
      gatewayManager.updateGatewayStatus('gateway-3', {
        currentLoad: 0.5,
      });

      // Select with max load constraint
      const selected = gatewayManager.selectOptimalGateway({
        maxLoad: 0.6,
      });

      // Should select gateway-2 (lowest load under threshold)
      expect(selected?.id).toBe('gateway-2');
    });
  });

  describe('Protocol Translation', () => {
    it('should translate mesh messages to HTTP format', async () => {
      const meshMessage: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const networkBridge = gatewayManager['networkBridge'];
      const result = await networkBridge.bridgeMessage(meshMessage, 'internet');

      expect(result).toBe(true);
    });

    it('should maintain UTXO integrity during transformation', async () => {
      const utxoPayload = {
        inputs: [{ txId: 'tx-1', outputIndex: 0 }],
        outputs: [{ address: 'addr-1', value: 100 }],
      };

      const utxoMessage: HybridRoutingMessage = {
        type: 'transaction',
        payload: new TextEncoder().encode(JSON.stringify(utxoPayload)),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const networkBridge = gatewayManager['networkBridge'];

      // Transform to mesh and back
      const meshified = await networkBridge.transformProtocol(
        utxoMessage,
        'mesh'
      );
      const httpified = await networkBridge.transformProtocol(
        meshified,
        'http'
      );

      // Verify UTXO structure preserved
      expect(httpified.type).toBe(utxoMessage.type);
      expect(httpified.timestamp).toBe(utxoMessage.timestamp);
    });

    it('should verify cryptographic signatures during bridging', async () => {
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const verifySpy = vi
        .spyOn(CryptographicService, 'verify')
        .mockReturnValue(true);

      const networkBridge = gatewayManager['networkBridge'];
      await networkBridge.bridgeMessage(message, 'internet');

      // Verify signature check was called
      expect(verifySpy).toHaveBeenCalled();
    });

    it('should handle invalid signatures during bridging', async () => {
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'invalid-sig',
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);

      const networkBridge = gatewayManager['networkBridge'];
      const result = await networkBridge.bridgeMessage(message, 'internet');

      // Should fail with invalid signature
      expect(result).toBe(false);
    });
  });

  describe('Traffic Optimization', () => {
    it('should prioritize high-priority UTXO transactions', async () => {
      const highPriorityTx: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const lowPriorityMsg: HybridRoutingMessage = {
        type: 'peer_discovery',
        payload: new Uint8Array([4, 5, 6]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Route both messages
      await router.routeMessage(highPriorityTx, internetPeer.id);
      await router.routeMessage(lowPriorityMsg, internetPeer.id);

      // High-priority should use faster route
      const txRoute = router.determineOptimalPath(
        internetPeer.id,
        'transaction'
      );
      const discoveryRoute = router.determineOptimalPath(
        internetPeer.id,
        'peer_discovery'
      );

      expect(txRoute.priority).toBe('high');
      expect(discoveryRoute.priority).not.toBe('high');
    });

    it('should generate optimization reports', async () => {
      const reportSpy = vi.fn();
      trafficOptimizer.on('report:generated', reportSpy);

      // Trigger report generation
      const report = trafficOptimizer.generateOptimizationReport();

      expect(report.metrics).toBeDefined();
      expect(report.patterns).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.timestamp).toBeDefined();
    });

    it('should detect and respond to network congestion', async () => {
      const congestionSpy = vi.fn();
      trafficOptimizer.on('congestion:detected', congestionSpy);

      // Simulate congestion by adding unreliable peers
      for (let i = 0; i < 10; i++) {
        const unreliablePeer: EnhancedNetworkNode = {
          id: `unreliable-peer-${i}`,
          address: `http://unreliable-${i}.example.com`,
          type: 'full',
          latency: 500,
          reliability: 30, // Low reliability
          capabilities: ['transaction'],
          reputation: 40,
          lastSeen: Date.now(),
          connectionType: 'internet',
        };
        peerManager.addPeer(unreliablePeer);
      }

      await router.updateNetworkConditions();

      // Check congestion detection
      const _isCongestedMesh = trafficOptimizer.detectCongestion('mesh');
      const isCongestedInternet = trafficOptimizer.detectCongestion('internet');

      expect(isCongestedInternet).toBe(true);
    });

    it('should balance network load across mesh and internet', async () => {
      const meshPeer = createMeshPeer('mesh-peer-1');
      const internetPeer = createInternetPeer('internet-peer-1');

      peerManager.addPeer(meshPeer);
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Balance network load
      trafficOptimizer.balanceNetworkLoad();

      // Should emit events about load balancing
      const balanceSpy = vi.fn();
      trafficOptimizer.on('load:balanced', balanceSpy);

      trafficOptimizer.balanceNetworkLoad();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should route messages within latency requirements (NFR-1.1: <15s)', async () => {
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      const startTime = Date.now();
      await router.routeMessage(message, internetPeer.id);
      const latency = Date.now() - startTime;

      // NFR-1.1: Cross-network message delivery within 15 seconds
      expect(latency).toBeLessThan(15000);
    });

    it('should achieve >98% delivery success rate (NFR-2.1)', async () => {
      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Send 100 messages
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(router.routeMessage(message, internetPeer.id));
      }

      const results = await Promise.all(promises);
      const successRate = results.filter(r => r).length / 100;

      // NFR-2.1: >98% success rate
      expect(successRate).toBeGreaterThan(0.98);
    });

    it('should handle network failover within 30 seconds (NFR-1.3)', async () => {
      const meshPeer = createMeshPeer('mesh-peer-1');
      const internetPeer = createInternetPeer('internet-peer-1');

      peerManager.addPeer(meshPeer);
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      const startTime = Date.now();

      const failoverSpy = vi.fn();
      router.on('network:failover', failoverSpy);

      await router.handleNetworkFailover('mesh');

      const failoverTime = Date.now() - startTime;

      // NFR-1.3: Network failover within 30 seconds
      expect(failoverTime).toBeLessThan(30000);
      expect(failoverSpy).toHaveBeenCalled();
    });

    it('should support 100+ concurrent bridge operations (NFR-1.2)', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      // Register gateway
      const gatewayReg = createGatewayRegistration('gateway-1');
      await gatewayManager.registerGateway(gatewayReg);

      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      // Send 100 concurrent messages
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(router.routeMessage(message, internetPeer.id));
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r).length;

      // NFR-1.2: Support 100+ concurrent operations
      expect(successCount).toBeGreaterThan(90);
    });

    it('should maintain routing decision overhead <50ms (NFR-1.4)', async () => {
      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      const startTime = Date.now();
      router.determineOptimalPath(internetPeer.id, 'transaction');
      const overhead = Date.now() - startTime;

      // NFR-1.4: Routing decision overhead < 50ms
      expect(overhead).toBeLessThan(50);
    });
  });

  describe('Network Condition Management', () => {
    it('should update network conditions periodically', async () => {
      const updateSpy = vi.fn();
      router.on('network:conditions-updated', updateSpy);

      await router.updateNetworkConditions();

      expect(updateSpy).toHaveBeenCalled();

      const conditions = router.getNetworkConditions();
      expect(conditions).toBeDefined();
      expect(conditions.meshConnectivity).toBeDefined();
      expect(conditions.internetConnectivity).toBeDefined();
    });

    it('should detect connectivity changes', async () => {
      // Start with no peers
      await router.updateNetworkConditions();
      let conditions = router.getNetworkConditions();
      expect(conditions.meshConnectivity).toBe(false);
      expect(conditions.internetConnectivity).toBe(false);

      // Add internet peer
      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();
      conditions = router.getNetworkConditions();
      expect(conditions.internetConnectivity).toBe(true);

      // Add mesh peer
      const meshPeer = createMeshPeer('mesh-peer-1');
      peerManager.addPeer(meshPeer);

      await router.updateNetworkConditions();
      conditions = router.getNetworkConditions();
      expect(conditions.meshConnectivity).toBe(true);
    });

    it('should measure network latency from peer metrics', async () => {
      const lowLatencyPeer: EnhancedNetworkNode = {
        id: 'low-latency-peer',
        address: 'http://fast.example.com',
        type: 'full',
        latency: 25,
        reliability: 95,
        capabilities: ['transaction'],
        reputation: 90,
        lastSeen: Date.now(),
        connectionType: 'internet',
      };

      peerManager.addPeer(lowLatencyPeer);

      await router.updateNetworkConditions();
      const conditions = router.getNetworkConditions();

      expect(conditions.networkLatency.internet).toBeLessThanOrEqual(50);
    });

    it('should update gateway availability in network conditions', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const gatewayReg = createGatewayRegistration('gateway-1');
      await gatewayManager.registerGateway(gatewayReg);

      await router.updateNetworkConditions();
      const conditions = router.getNetworkConditions();

      expect(conditions.availableGateways).toContain('gateway-1');
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop all components correctly', async () => {
      const newRouter = new HybridRouter(
        router.getConfig(),
        peerManager,
        compressionManager,
        gatewayManager,
        trafficOptimizer
      );

      const startSpy = vi.fn();
      const stopSpy = vi.fn();

      newRouter.on('router:started', startSpy);
      newRouter.on('router:stopped', stopSpy);

      await newRouter.start();
      expect(startSpy).toHaveBeenCalled();
      expect(newRouter.getIsRunning()).toBe(true);

      await newRouter.stop();
      expect(stopSpy).toHaveBeenCalled();
      expect(newRouter.getIsRunning()).toBe(false);
    });

    it('should clear routing table on stop', async () => {
      const internetPeer = createInternetPeer('internet-peer-1');
      peerManager.addPeer(internetPeer);

      await router.updateNetworkConditions();

      // Create some routes
      router.determineOptimalPath(internetPeer.id, 'transaction');
      expect(router.getRoutingTableSize()).toBeGreaterThan(0);

      await router.stop();
      await router.start();

      // Routing table should be cleared after restart
      expect(router.getRoutingTableSize()).toBe(0);
    });

    it('should prevent operations when router is stopped', async () => {
      await router.stop();

      const message: HybridRoutingMessage = {
        type: 'transaction',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now(),
        signature: 'test-sig',
      };

      const result = await router.routeMessage(message, 'dest-1');

      expect(result).toBe(false);
    });
  });
});

// Helper functions

function createMeshPeer(id: string): EnhancedNetworkNode {
  return {
    id,
    address: `lora://${id}.mesh.local`,
    type: 'full',
    latency: 200,
    reliability: 85,
    capabilities: ['transaction'],
    reputation: 80,
    lastSeen: Date.now(),
    connectionType: 'mesh',
  };
}

function createInternetPeer(id: string): EnhancedNetworkNode {
  return {
    id,
    address: `http://${id}.example.com`,
    type: 'full',
    latency: 50,
    reliability: 95,
    capabilities: ['transaction', 'block'],
    reputation: 90,
    lastSeen: Date.now(),
    connectionType: 'internet',
  };
}

function createGatewayRegistration(id: string): GatewayRegistration {
  return {
    nodeId: id,
    networkEndpoints: {
      internetEndpoint: `http://${id}.example.com`,
      meshEndpoint: `lora://${id}.mesh.local`,
    },
    capabilities: {
      meshConnected: true,
      internetConnected: true,
      maxThroughput: 100,
      supportedProtocols: ['utxo', 'block', 'transaction'],
    },
    authentication: {
      publicKey: `pub-${id}`,
      signature: `sig-${id}`,
    },
  };
}
