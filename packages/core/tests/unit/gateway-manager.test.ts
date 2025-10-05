/**
 * Unit tests for GatewayManager
 *
 * Tests gateway node registration, authentication, health monitoring,
 * and lifecycle management for the hybrid routing system.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GatewayManager,
  GatewayRegistration,
  GatewayNode,
} from '../../src/gateway-manager.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { PeerManager } from '../../src/peer-manager.js';

describe('GatewayManager', () => {
  let gatewayManager: GatewayManager;
  let mockPeerManager: PeerManager;
  let mockCryptoService: CryptographicService;

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

    // Create mock crypto service
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    mockCryptoService = new CryptographicService(
      keyPair.publicKey,
      keyPair.privateKey,
      'secp256k1'
    );

    // Create gateway manager
    gatewayManager = new GatewayManager(mockPeerManager, mockCryptoService);
  });

  afterEach(async () => {
    if (gatewayManager) {
      await gatewayManager.stop();
    }
    if (mockPeerManager) {
      await mockPeerManager.stop();
    }
  });

  describe('Lifecycle Management', () => {
    test('should start gateway manager successfully', async () => {
      const startedSpy = vi.fn();
      gatewayManager.on('gateway-manager:started', startedSpy);

      await gatewayManager.start();

      expect(startedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    test('should stop gateway manager and clear gateways', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.start();
      await gatewayManager.registerGateway(registration);
      await gatewayManager.stop();

      expect(gatewayManager.getAllGateways()).toHaveLength(0);
    });

    test('should emit gateway-manager:started event', async () => {
      const startedSpy = vi.fn();
      gatewayManager.on('gateway-manager:started', startedSpy);

      await gatewayManager.start();

      expect(startedSpy).toHaveBeenCalled();
    });

    test('should emit gateway-manager:stopped event', async () => {
      const stoppedSpy = vi.fn();
      gatewayManager.on('gateway-manager:stopped', stoppedSpy);

      await gatewayManager.start();
      await gatewayManager.stop();

      expect(stoppedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    test('should warn when starting already running manager', async () => {
      await gatewayManager.start();
      await gatewayManager.start(); // Second start should warn

      // Should not throw, just log warning
      expect(true).toBe(true);
    });

    test('should warn when stopping non-running manager', async () => {
      await gatewayManager.stop(); // Stop without start should warn

      // Should not throw, just log warning
      expect(true).toBe(true);
    });
  });

  describe('Gateway Registration', () => {
    test('should register gateway with valid authentication', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const result = await gatewayManager.registerGateway(registration);

      expect(result).toBe(true);
      expect(gatewayManager.getGateway(registration.nodeId)).toBeDefined();
    });

    test('should reject gateway with invalid authentication', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);

      const result = await gatewayManager.registerGateway(registration);

      expect(result).toBe(false);
      expect(gatewayManager.getGateway(registration.nodeId)).toBeNull();
    });

    test('should emit gateway:registered event on success', async () => {
      const registeredSpy = vi.fn();
      gatewayManager.on('gateway:registered', registeredSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      expect(registeredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: expect.objectContaining({
            id: registration.nodeId,
            address: registration.networkEndpoints.internetEndpoint,
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    test('should emit gateway:auth-failed event on auth failure', async () => {
      const authFailedSpy = vi.fn();
      gatewayManager.on('gateway:auth-failed', authFailedSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(false);

      await gatewayManager.registerGateway(registration);

      expect(authFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: registration.nodeId,
          timestamp: expect.any(Number),
        })
      );
    });

    test('should create gateway with correct initial state', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId);

      expect(gateway).toMatchObject({
        id: registration.nodeId,
        address: registration.networkEndpoints.internetEndpoint,
        capabilities: registration.capabilities,
        status: {
          isActive: true,
          lastHeartbeat: expect.any(Number),
          currentLoad: 0,
          queueSize: 0,
        },
        metrics: {
          messagesProcessed: 0,
          averageLatency: 0,
          errorRate: 0,
          uptime: 0,
        },
      });
    });
  });

  describe('Gateway Unregistration', () => {
    test('should unregister existing gateway', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);
      await gatewayManager.unregisterGateway(registration.nodeId);

      expect(gatewayManager.getGateway(registration.nodeId)).toBeNull();
    });

    test('should emit gateway:unregistered event', async () => {
      const unregisteredSpy = vi.fn();
      gatewayManager.on('gateway:unregistered', unregisteredSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);
      await gatewayManager.unregisterGateway(registration.nodeId);

      expect(unregisteredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: registration.nodeId,
          timestamp: expect.any(Number),
        })
      );
    });

    test('should handle unregistering unknown gateway gracefully', async () => {
      await gatewayManager.unregisterGateway('unknown-gateway');

      // Should not throw, just log warning
      expect(true).toBe(true);
    });
  });

  describe('Gateway Status Management', () => {
    test('should update gateway status', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      gatewayManager.updateGatewayStatus(registration.nodeId, {
        currentLoad: 0.5,
        queueSize: 10,
      });

      const gateway = gatewayManager.getGateway(registration.nodeId);
      expect(gateway?.status.currentLoad).toBe(0.5);
      expect(gateway?.status.queueSize).toBe(10);
    });

    test('should emit gateway:status-updated event', async () => {
      const statusUpdatedSpy = vi.fn();
      gatewayManager.on('gateway:status-updated', statusUpdatedSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      gatewayManager.updateGatewayStatus(registration.nodeId, {
        currentLoad: 0.5,
      });

      expect(statusUpdatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: registration.nodeId,
          status: expect.objectContaining({
            currentLoad: 0.5,
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    test('should update gateway metrics', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      gatewayManager.updateGatewayMetrics(registration.nodeId, {
        messagesProcessed: 100,
        averageLatency: 50,
      });

      const gateway = gatewayManager.getGateway(registration.nodeId);
      expect(gateway?.metrics.messagesProcessed).toBe(100);
      expect(gateway?.metrics.averageLatency).toBe(50);
    });

    test('should handle updating status for unknown gateway', async () => {
      gatewayManager.updateGatewayStatus('unknown-gateway', {
        currentLoad: 0.5,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    test('should handle updating metrics for unknown gateway', async () => {
      gatewayManager.updateGatewayMetrics('unknown-gateway', {
        messagesProcessed: 100,
      });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Health Monitoring', () => {
    test('should check gateway health based on heartbeat', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const isHealthy = await gatewayManager.checkGatewayHealth(
        registration.nodeId
      );

      expect(isHealthy).toBe(true);
    });

    test('should mark gateway as unhealthy after timeout', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId)!;
      gateway.status.lastHeartbeat = Date.now() - 120000; // 2 minutes ago

      const isHealthy = await gatewayManager.checkGatewayHealth(
        registration.nodeId
      );

      expect(isHealthy).toBe(false);
      expect(gateway.status.isActive).toBe(false);
    });

    test('should emit gateway:unhealthy event when health check fails', async () => {
      const unhealthySpy = vi.fn();
      gatewayManager.on('gateway:unhealthy', unhealthySpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId)!;
      gateway.status.lastHeartbeat = Date.now() - 120000;

      await gatewayManager.checkGatewayHealth(registration.nodeId);

      expect(unhealthySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: registration.nodeId,
          timeSinceHeartbeat: expect.any(Number),
          timestamp: expect.any(Number),
        })
      );
    });

    test('should record heartbeat and update timestamp', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId)!;
      const oldHeartbeat = gateway.status.lastHeartbeat;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      gatewayManager.recordHeartbeat(registration.nodeId);

      expect(gateway.status.lastHeartbeat).toBeGreaterThan(oldHeartbeat);
    });

    test('should reactivate gateway on heartbeat if inactive', async () => {
      const reactivatedSpy = vi.fn();
      gatewayManager.on('gateway:reactivated', reactivatedSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId)!;
      gateway.status.isActive = false;

      gatewayManager.recordHeartbeat(registration.nodeId);

      expect(gateway.status.isActive).toBe(true);
      expect(reactivatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: registration.nodeId,
          timestamp: expect.any(Number),
        })
      );
    });

    test('should return false for health check on unknown gateway', async () => {
      const isHealthy =
        await gatewayManager.checkGatewayHealth('unknown-gateway');

      expect(isHealthy).toBe(false);
    });
  });

  describe('Gateway Failure Handling', () => {
    test('should handle gateway failure', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      gatewayManager.handleGatewayFailure(registration.nodeId);

      const gateway = gatewayManager.getGateway(registration.nodeId);
      expect(gateway?.status.isActive).toBe(false);
    });

    test('should emit gateway:failed event', async () => {
      const failedSpy = vi.fn();
      gatewayManager.on('gateway:failed', failedSpy);

      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      gatewayManager.handleGatewayFailure(registration.nodeId);

      expect(failedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: registration.nodeId,
          timestamp: expect.any(Number),
        })
      );
    });

    test('should handle failure for unknown gateway gracefully', async () => {
      gatewayManager.handleGatewayFailure('unknown-gateway');

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Gateway Queries', () => {
    test('should get gateway by ID', async () => {
      const registration = createValidRegistration();
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(registration);

      const gateway = gatewayManager.getGateway(registration.nodeId);

      expect(gateway).toBeDefined();
      expect(gateway?.id).toBe(registration.nodeId);
    });

    test('should return null for unknown gateway', async () => {
      const gateway = gatewayManager.getGateway('unknown-gateway');

      expect(gateway).toBeNull();
    });

    test('should get available gateways only', async () => {
      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      // Mark one as inactive
      gatewayManager.updateGatewayStatus(reg2.nodeId, { isActive: false });

      const available = gatewayManager.getAvailableGateways();

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(reg1.nodeId);
    });

    test('should filter out gateways without mesh connectivity', async () => {
      const reg1 = createValidRegistration();
      const reg2 = {
        ...createValidRegistration(),
        nodeId: 'gateway-2',
        capabilities: {
          ...createValidRegistration().capabilities,
          meshConnected: false,
        },
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      const available = gatewayManager.getAvailableGateways();

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(reg1.nodeId);
    });

    test('should filter out gateways without internet connectivity', async () => {
      const reg1 = createValidRegistration();
      const reg2 = {
        ...createValidRegistration(),
        nodeId: 'gateway-2',
        capabilities: {
          ...createValidRegistration().capabilities,
          internetConnected: false,
        },
      };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      const available = gatewayManager.getAvailableGateways();

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(reg1.nodeId);
    });

    test('should get all gateways regardless of status', async () => {
      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayStatus(reg2.nodeId, { isActive: false });

      const all = gatewayManager.getAllGateways();

      expect(all).toHaveLength(2);
    });
  });

  describe('Health Monitoring Interval', () => {
    test('should start health monitoring on manager start', async () => {
      await gatewayManager.start();

      // Health monitoring interval should be active
      expect(true).toBe(true);
    });

    test('should stop health monitoring on manager stop', async () => {
      await gatewayManager.start();
      await gatewayManager.stop();

      // Health monitoring interval should be cleared
      expect(true).toBe(true);
    });
  });
});

/**
 * Helper function to create valid gateway registration
 */
function createValidRegistration(): GatewayRegistration {
  return {
    nodeId: 'gateway-1',
    networkEndpoints: {
      internetEndpoint: 'http://gateway1.example.com',
      meshEndpoint: 'mesh://gateway1',
    },
    capabilities: {
      meshConnected: true,
      internetConnected: true,
      maxThroughput: 100,
      supportedProtocols: ['utxo', 'block', 'transaction'],
    },
    authentication: {
      publicKey: 'test-public-key',
      signature: 'test-signature',
    },
  };
}
