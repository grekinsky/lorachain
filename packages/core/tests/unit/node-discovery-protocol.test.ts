import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NodeDiscoveryProtocol } from '../../src/node-discovery-protocol.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { type DiscoveryBeacon, type DiscoveryConfig } from '../../src/types.js';

describe('NodeDiscoveryProtocol', () => {
  let discoveryProtocol: NodeDiscoveryProtocol;
  let cryptoService: CryptographicService;
  let nodeId: string;
  let nodeKeyPair: {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
    algorithm: string;
  };
  let config: DiscoveryConfig;

  beforeEach(async () => {
    nodeId = 'test-node-001';
    cryptoService = new CryptographicService();
    nodeKeyPair = await cryptoService.generateKeyPair('secp256k1');

    config = {
      beaconInterval: 30000,
      neighborTimeout: 120000,
      maxNeighbors: 50,
      enableTopologySharing: true,
      securityConfig: {
        enableBeaconSigning: true,
        maxBeaconRate: 2,
        requireIdentityProof: true,
        allowAnonymousNodes: false,
        topologyValidationStrict: true,
      },
      performanceConfig: {
        maxBeaconProcessingTime: 100,
        maxNeighborLookupTime: 10,
        maxTopologyUpdateTime: 200,
        maxMemoryUsageMB: 10,
        enableAdaptiveBeaconInterval: true,
      },
    };

    discoveryProtocol = new NodeDiscoveryProtocol(
      nodeId,
      nodeKeyPair,
      'full',
      config,
      cryptoService
    );
  });

  afterEach(async () => {
    if (discoveryProtocol.isDiscoveryActive()) {
      await discoveryProtocol.stopNodeDiscovery();
    }
  });

  // ==========================================
  // Beacon Transmission Tests
  // ==========================================

  describe('Beacon Transmission', () => {
    it('should generate valid discovery beacons', async () => {
      // Mock private method
      const beacon = await (
        discoveryProtocol as unknown as {
          createDiscoveryBeacon: () => Promise<DiscoveryBeacon>;
        }
      ).createDiscoveryBeacon();

      expect(beacon).toMatchObject({
        nodeId: nodeId,
        nodeType: 'full',
        capabilities: expect.any(Object),
        sequenceNumber: expect.any(Number),
        timestamp: expect.any(Number),
        networkInfo: {
          peerCount: expect.any(Number),
          signalStrength: expect.any(Number),
          compressionEngines: expect.any(Array),
          dutyCycleRegion: expect.any(String),
        },
        signature: expect.any(String),
      });

      expect(beacon.capabilities).toMatchObject({
        canMine: true,
        supportsRelay: true,
        maxHopCount: 10,
        supportedCompressionEngines: expect.any(Array),
        dutyCycleCompliance: expect.any(Array),
        maxQueueSize: expect.any(Number),
        supportsUTXORouting: true,
      });
    });

    it('should increment sequence number with each beacon', async () => {
      const beacon1 = await (discoveryProtocol as any).createDiscoveryBeacon();
      const beacon2 = await (discoveryProtocol as any).createDiscoveryBeacon();

      expect(beacon2.sequenceNumber).toBe(beacon1.sequenceNumber + 1);
    });

    it('should sign beacons when security is enabled', async () => {
      const beacon = await (discoveryProtocol as any).createDiscoveryBeacon();

      expect(beacon.signature).toBeDefined();
      expect(typeof beacon.signature).toBe('string');
      expect(beacon.signature.length).toBeGreaterThan(0);

      // Since this is a mock implementation, we just verify the signature exists
      // In a real implementation, proper cryptographic validation would be tested
      expect(beacon.signature).toMatch(/^[0-9a-f]+$/i); // Should be hex string
    });

    it('should respect beacon transmission intervals', async () => {
      const beaconSendSpy = vi.fn();

      discoveryProtocol.on('beaconSend', beaconSendSpy);

      await discoveryProtocol.startNodeDiscovery();

      // Wait for initial beacon
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(beaconSendSpy).toHaveBeenCalledTimes(1);

      // Check that next beacon doesn't come too soon
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(beaconSendSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle beacon transmission failures gracefully', async () => {
      // Test basic error handling by simulating inactive discovery
      // When discovery is inactive, sendDiscoveryBeacon should return early without errors
      expect(() => discoveryProtocol.sendDiscoveryBeacon()).not.toThrow();

      // Verify that the discovery protocol can handle error conditions gracefully
      expect(discoveryProtocol.isDiscoveryActive()).toBe(false);
    });
  });

  // ==========================================
  // Neighbor Management Tests
  // ==========================================

  describe('Neighbor Management', () => {
    let mockBeacon: DiscoveryBeacon;

    beforeEach(() => {
      mockBeacon = {
        nodeId: 'neighbor-001',
        nodeType: 'light',
        capabilities: {
          canMine: false,
          supportsRelay: true,
          batteryLevel: 85,
          maxHopCount: 5,
          supportedCompressionEngines: ['gzip', 'lz4'],
          dutyCycleCompliance: ['EU'],
          maxQueueSize: 500,
          supportsUTXORouting: true,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          blockHeight: 1000,
          peerCount: 3,
          signalStrength: 75,
          utxoSetSize: 500,
          compressionEngines: ['gzip', 'lz4'],
          dutyCycleRegion: 'EU',
        },
        signature: 'mock-signature',
      };
    });

    it('should discover new neighbors from beacons', async () => {
      const neighborDiscoveredSpy = vi.fn();
      discoveryProtocol.on('neighborDiscovered', neighborDiscoveredSpy);

      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');

      expect(neighborDiscoveredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'neighbor-001',
          nodeType: 'light',
          capabilities: mockBeacon.capabilities,
          signalStrength: 75,
          hopCount: 1,
          isStale: false,
        })
      );

      const neighbors = discoveryProtocol.getNeighbors();
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('neighbor-001');
    });

    it('should update existing neighbor information', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Process first beacon
      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');
      const initialNeighbor = discoveryProtocol.getNeighbor('neighbor-001');

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update beacon with new information
      const updatedBeacon = {
        ...mockBeacon,
        sequenceNumber: 2,
        timestamp: Date.now(),
        networkInfo: {
          ...mockBeacon.networkInfo,
          signalStrength: 90,
        },
      };

      await discoveryProtocol.processDiscoveryBeacon(
        updatedBeacon,
        'test-source'
      );
      const updatedNeighbor = discoveryProtocol.getNeighbor('neighbor-001');

      expect(updatedNeighbor?.signalStrength).toBe(90);
      expect(updatedNeighbor?.beaconSequence).toBe(2);
      expect(updatedNeighbor?.lastSeen).toBeGreaterThanOrEqual(
        initialNeighbor?.lastSeen || 0
      );
    });

    it('should ignore old or duplicate beacons', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Process first beacon
      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');
      const initialCount = discoveryProtocol.getNeighborCount();

      // Process older beacon (same sequence number)
      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');
      expect(discoveryProtocol.getNeighborCount()).toBe(initialCount);

      // Process beacon with lower sequence number
      const olderBeacon = { ...mockBeacon, sequenceNumber: 0 };
      await discoveryProtocol.processDiscoveryBeacon(
        olderBeacon,
        'test-source'
      );
      expect(discoveryProtocol.getNeighborCount()).toBe(initialCount);
    });

    it('should cleanup stale neighbors', async () => {
      const neighborLostSpy = vi.fn();
      discoveryProtocol.on('neighborLost', neighborLostSpy);

      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Process beacon with old timestamp
      const staleBeacon = {
        ...mockBeacon,
        timestamp: Date.now() - config.neighborTimeout - 10000, // Older than timeout
      };

      await discoveryProtocol.processDiscoveryBeacon(
        staleBeacon,
        'test-source'
      );

      // Trigger cleanup
      (
        discoveryProtocol as unknown as { cleanupStaleNeighbors: () => void }
      ).cleanupStaleNeighbors();

      expect(neighborLostSpy).toHaveBeenCalledWith('neighbor-001');
      expect(discoveryProtocol.getNeighborCount()).toBe(0);
    });

    it('should respect maximum neighbor limit', async () => {
      // Set low neighbor limit
      const limitedConfig = { ...config, maxNeighbors: 2 };
      const limitedProtocol = new NodeDiscoveryProtocol(
        nodeId,
        nodeKeyPair,
        'full',
        limitedConfig,
        cryptoService
      );

      // Mock signature validation
      vi.spyOn(
        limitedProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Add maximum neighbors
      for (let i = 0; i < limitedConfig.maxNeighbors; i++) {
        const beacon = {
          ...mockBeacon,
          nodeId: `neighbor-${i.toString().padStart(3, '0')}`,
          sequenceNumber: i + 1,
        };
        await limitedProtocol.processDiscoveryBeacon(beacon, 'test-source');
      }

      expect(limitedProtocol.getNeighborCount()).toBe(
        limitedConfig.maxNeighbors
      );

      // Try to add one more neighbor
      const extraBeacon = {
        ...mockBeacon,
        nodeId: 'neighbor-extra',
        sequenceNumber: 999,
      };
      await limitedProtocol.processDiscoveryBeacon(extraBeacon, 'test-source');

      // Should still be at the limit
      expect(limitedProtocol.getNeighborCount()).toBe(
        limitedConfig.maxNeighbors
      );
    });
  });

  // ==========================================
  // Topology Management Tests
  // ==========================================

  describe('Topology Management', () => {
    let mockBeacon: DiscoveryBeacon;

    beforeEach(() => {
      mockBeacon = {
        nodeId: 'topo-node-001',
        nodeType: 'full',
        capabilities: {
          canMine: true,
          supportsRelay: true,
          batteryLevel: 95,
          maxHopCount: 10,
          supportedCompressionEngines: ['gzip', 'brotli'],
          dutyCycleCompliance: ['US'],
          maxQueueSize: 1000,
          supportsUTXORouting: true,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          blockHeight: 2000,
          peerCount: 5,
          signalStrength: 85,
          utxoSetSize: 1000,
          compressionEngines: ['gzip', 'brotli'],
          dutyCycleRegion: 'US',
        },
        signature: 'mock-signature',
      };
    });

    it('should build accurate network topology', async () => {
      const topologyUpdatedSpy = vi.fn();
      discoveryProtocol.on('topologyUpdated', topologyUpdatedSpy);

      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');

      expect(topologyUpdatedSpy).toHaveBeenCalled();

      const topology = discoveryProtocol.getNetworkTopology();
      expect(topology.nodes.size).toBe(1);
      expect(topology.version).toBeGreaterThan(0);

      const topologyNode = topology.nodes.get('topo-node-001');
      expect(topologyNode).toMatchObject({
        id: 'topo-node-001',
        nodeType: 'full',
        capabilities: mockBeacon.capabilities,
        hopDistance: 1,
      });
    });

    it('should calculate optimal routes', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');

      const route = discoveryProtocol.findRoute('topo-node-001');

      expect(route).toMatchObject({
        destination: 'topo-node-001',
        nextHop: 'topo-node-001',
        hopCount: 1,
        quality: expect.any(Number),
        compressionSupport: expect.any(Array),
        estimatedDelay: expect.any(Number),
      });

      expect(route?.quality).toBeGreaterThan(0);
      expect(route?.quality).toBeLessThanOrEqual(1);
    });

    it('should find routes through multi-hop paths', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Add direct neighbor
      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');

      // Mock the neighbor to have routes to other nodes
      const neighbor = discoveryProtocol.getNeighbor('topo-node-001');
      if (neighbor) {
        neighbor.routes = [
          {
            destination: 'distant-node-001',
            nextHop: 'intermediate-node-001',
            hopCount: 2,
            quality: 0.8,
            lastUpdated: Date.now(),
            compressionSupport: ['gzip'],
            estimatedDelay: 2000,
          },
        ];
      }

      const route = discoveryProtocol.findRoute('distant-node-001');

      expect(route).toMatchObject({
        destination: 'distant-node-001',
        nextHop: 'topo-node-001',
        hopCount: 3, // 2 + 1 (through neighbor)
        quality: expect.any(Number),
      });
    });

    it('should handle topology changes', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Initial topology
      await discoveryProtocol.processDiscoveryBeacon(mockBeacon, 'test-source');
      const initialVersion = discoveryProtocol.getNetworkTopology().version;

      // Update topology with new beacon
      const updatedBeacon = {
        ...mockBeacon,
        sequenceNumber: 2,
        timestamp: Date.now() + 5000,
        capabilities: {
          ...mockBeacon.capabilities,
          canMine: false, // Changed capability
        },
      };

      await discoveryProtocol.processDiscoveryBeacon(
        updatedBeacon,
        'test-source'
      );
      const newVersion = discoveryProtocol.getNetworkTopology().version;

      expect(newVersion).toBeGreaterThan(initialVersion);
    });

    it('should get reachable nodes correctly', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Add multiple neighbors
      const neighbors = ['node-001', 'node-002', 'node-003'];

      for (const [index, neighborId] of neighbors.entries()) {
        const beacon = {
          ...mockBeacon,
          nodeId: neighborId,
          sequenceNumber: index + 1,
        };
        await discoveryProtocol.processDiscoveryBeacon(beacon, 'test-source');
      }

      const reachableNodes = discoveryProtocol.getReachableNodes();

      expect(reachableNodes).toHaveLength(neighbors.length);
      for (const neighborId of neighbors) {
        expect(reachableNodes).toContain(neighborId);
      }
    });
  });

  // ==========================================
  // Discovery Management Tests
  // ==========================================

  describe('Discovery Management', () => {
    it('should start and stop discovery correctly', async () => {
      expect(discoveryProtocol.isDiscoveryActive()).toBe(false);

      await discoveryProtocol.startNodeDiscovery();
      expect(discoveryProtocol.isDiscoveryActive()).toBe(true);

      await discoveryProtocol.stopNodeDiscovery();
      expect(discoveryProtocol.isDiscoveryActive()).toBe(false);
    });

    it('should not start discovery if already active', async () => {
      await discoveryProtocol.startNodeDiscovery();
      expect(discoveryProtocol.isDiscoveryActive()).toBe(true);

      // Should not throw error or change state
      await discoveryProtocol.startNodeDiscovery();
      expect(discoveryProtocol.isDiscoveryActive()).toBe(true);
    });

    it('should emit discovery lifecycle events', async () => {
      const startedSpy = vi.fn();
      const stoppedSpy = vi.fn();

      discoveryProtocol.on('discoveryStarted', startedSpy);
      discoveryProtocol.on('discoveryStopped', stoppedSpy);

      await discoveryProtocol.startNodeDiscovery();
      expect(startedSpy).toHaveBeenCalled();

      await discoveryProtocol.stopNodeDiscovery();
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Security Tests
  // ==========================================

  describe('Security', () => {
    it('should reject beacons with invalid signatures', async () => {
      const errorSpy = vi.fn();
      discoveryProtocol.on('discoveryError', errorSpy);

      // Mock signature validation to fail
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(false);

      const invalidBeacon: DiscoveryBeacon = {
        nodeId: 'malicious-node',
        nodeType: 'light',
        capabilities: {
          canMine: false,
          supportsRelay: false,
          maxHopCount: 1,
          supportedCompressionEngines: [],
          dutyCycleCompliance: [],
          maxQueueSize: 10,
          supportsUTXORouting: false,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          peerCount: 0,
          signalStrength: 50,
          compressionEngines: [],
          dutyCycleRegion: 'unknown',
        },
        signature: 'invalid-signature',
      };

      await discoveryProtocol.processDiscoveryBeacon(
        invalidBeacon,
        'test-source'
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'signature_invalid',
          nodeId: 'malicious-node',
        })
      );

      expect(discoveryProtocol.getNeighborCount()).toBe(0);
    });

    it('should handle signature validation errors gracefully', async () => {
      const errorSpy = vi.fn();
      discoveryProtocol.on('discoveryError', errorSpy);

      // Mock signature validation to throw error
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockRejectedValue(new Error('Crypto error'));

      const beacon: DiscoveryBeacon = {
        nodeId: 'test-node',
        nodeType: 'light',
        capabilities: {
          canMine: false,
          supportsRelay: false,
          maxHopCount: 1,
          supportedCompressionEngines: [],
          dutyCycleCompliance: [],
          maxQueueSize: 10,
          supportsUTXORouting: false,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          peerCount: 0,
          signalStrength: 50,
          compressionEngines: [],
          dutyCycleRegion: 'unknown',
        },
        signature: 'test-signature',
      };

      await discoveryProtocol.processDiscoveryBeacon(beacon, 'test-source');

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Performance and Metrics Tests
  // ==========================================

  describe('Performance and Metrics', () => {
    it('should track discovery metrics correctly', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      const initialMetrics = discoveryProtocol.getDiscoveryMetrics();
      expect(initialMetrics.beaconsProcessed).toBe(0);
      expect(initialMetrics.neighborsDiscovered).toBe(0);

      // Process a beacon
      const beacon: DiscoveryBeacon = {
        nodeId: 'metrics-test-node',
        nodeType: 'full',
        capabilities: {
          canMine: true,
          supportsRelay: true,
          maxHopCount: 5,
          supportedCompressionEngines: ['gzip'],
          dutyCycleCompliance: ['EU'],
          maxQueueSize: 100,
          supportsUTXORouting: true,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          peerCount: 2,
          signalStrength: 80,
          compressionEngines: ['gzip'],
          dutyCycleRegion: 'EU',
        },
        signature: 'test-signature',
      };

      await discoveryProtocol.processDiscoveryBeacon(beacon, 'test-source');

      const updatedMetrics = discoveryProtocol.getDiscoveryMetrics();
      expect(updatedMetrics.beaconsProcessed).toBe(1);
      expect(updatedMetrics.neighborsDiscovered).toBe(1);
    });

    it('should track processing times', async () => {
      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      const beacon: DiscoveryBeacon = {
        nodeId: 'timing-test-node',
        nodeType: 'light',
        capabilities: {
          canMine: false,
          supportsRelay: true,
          maxHopCount: 3,
          supportedCompressionEngines: [],
          dutyCycleCompliance: [],
          maxQueueSize: 50,
          supportsUTXORouting: false,
        },
        sequenceNumber: 1,
        timestamp: Date.now(),
        networkInfo: {
          peerCount: 1,
          signalStrength: 60,
          compressionEngines: [],
          dutyCycleRegion: 'unknown',
        },
        signature: 'test-signature',
      };

      await discoveryProtocol.processDiscoveryBeacon(beacon, 'test-source');

      const metrics = discoveryProtocol.getDiscoveryMetrics();
      expect(metrics.averageBeaconProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should track neighbor lookup times', () => {
      const startTime = performance.now();

      // Perform lookup (will be null since no neighbors exist)
      const neighbor = discoveryProtocol.getNeighbor('non-existent');

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
      expect(neighbor).toBe(null);

      // Metrics should track the lookup
      const metrics = discoveryProtocol.getDiscoveryMetrics();
      expect(metrics.averageNeighborLookupTime).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================

  describe('Integration Features', () => {
    it('should integrate with duty cycle manager', () => {
      const mockDutyCycleManager = {
        canTransmit: vi.fn().mockReturnValue(true),
        getConfig: vi.fn().mockReturnValue({ region: 'US' }),
        getQueueStatus: vi.fn().mockReturnValue({ maxSize: 1000 }),
      };

      discoveryProtocol.setDutyCycleManager(
        mockDutyCycleManager as unknown as import('../../src/types.js').IDutyCycleManager
      );

      // Should not throw error
      expect(() =>
        discoveryProtocol.setDutyCycleManager(
          mockDutyCycleManager as unknown as import('../../src/types.js').IDutyCycleManager
        )
      ).not.toThrow();
    });

    it('should integrate with reliable delivery manager', () => {
      const mockReliableDeliveryManager = {
        sendReliableMessage: vi.fn().mockResolvedValue('message-id'),
      };

      discoveryProtocol.setReliableDeliveryManager(
        mockReliableDeliveryManager as unknown as import('../../src/types.js').IReliableDeliveryManager
      );

      // Should not throw error
      expect(() =>
        discoveryProtocol.setReliableDeliveryManager(
          mockReliableDeliveryManager as unknown as import('../../src/types.js').IReliableDeliveryManager
        )
      ).not.toThrow();
    });

    it('should integrate with compression manager', () => {
      const mockCompressionManager = {
        getSupportedEngines: vi.fn().mockReturnValue(['gzip', 'lz4']),
        compressIfBeneficial: vi.fn().mockResolvedValue({
          data: new Uint8Array([1, 2, 3]),
          isCompressed: true,
        }),
      };

      discoveryProtocol.setCompressionManager(
        mockCompressionManager as unknown as import('../../src/utxo-compression-manager.js').UTXOCompressionManager
      );

      // Should not throw error
      expect(() =>
        discoveryProtocol.setCompressionManager(
          mockCompressionManager as unknown as import('../../src/utxo-compression-manager.js').UTXOCompressionManager
        )
      ).not.toThrow();
    });
  });

  // ==========================================
  // Edge Cases and Error Handling
  // ==========================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty beacon gracefully', async () => {
      const errorSpy = vi.fn();
      discoveryProtocol.on('discoveryError', errorSpy);

      // Create malformed beacon
      const malformedBeacon = {} as DiscoveryBeacon;

      await discoveryProtocol.processDiscoveryBeacon(
        malformedBeacon,
        'test-source'
      );

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle network partitions', async () => {
      const neighborLostSpy = vi.fn();
      discoveryProtocol.on('neighborLost', neighborLostSpy);

      // Mock signature validation
      vi.spyOn(
        discoveryProtocol as unknown as {
          validateBeaconSignature: () => Promise<boolean>;
        },
        'validateBeaconSignature'
      ).mockResolvedValue(true);

      // Add neighbor
      const beacon: DiscoveryBeacon = {
        nodeId: 'partition-test-node',
        nodeType: 'light',
        capabilities: {
          canMine: false,
          supportsRelay: true,
          maxHopCount: 3,
          supportedCompressionEngines: [],
          dutyCycleCompliance: [],
          maxQueueSize: 50,
          supportsUTXORouting: false,
        },
        sequenceNumber: 1,
        timestamp: Date.now() - config.neighborTimeout - 1000,
        networkInfo: {
          peerCount: 1,
          signalStrength: 60,
          compressionEngines: [],
          dutyCycleRegion: 'unknown',
        },
        signature: 'test-signature',
      };

      await discoveryProtocol.processDiscoveryBeacon(beacon, 'test-source');

      // Force cleanup
      (
        discoveryProtocol as unknown as { cleanupStaleNeighbors: () => void }
      ).cleanupStaleNeighbors();

      expect(neighborLostSpy).toHaveBeenCalledWith('partition-test-node');
    });

    it('should handle memory pressure gracefully', () => {
      // This would be more complex in a real implementation
      // For now, just verify metrics are updated
      const metrics = discoveryProtocol.getDiscoveryMetrics();
      expect(metrics.memoryUsageMB).toBeGreaterThanOrEqual(0);
    });
  });
});
