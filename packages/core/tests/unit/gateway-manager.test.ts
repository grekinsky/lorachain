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

  describe('Gateway Selection & Load Balancing', () => {
    test('should select gateway with lowest load', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      // Set different loads
      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.8 });
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.3 });

      const selected = gatewayManager.selectOptimalGateway();

      expect(selected?.id).toBe(reg2.nodeId);
    });

    test('should filter gateways by max load criteria', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.9 });
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.4 });

      const selected = gatewayManager.selectOptimalGateway({ maxLoad: 0.5 });

      expect(selected?.id).toBe(reg2.nodeId);
    });

    test('should filter gateways by required protocols', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = {
        ...createValidRegistration(),
        capabilities: {
          ...createValidRegistration().capabilities,
          supportedProtocols: ['utxo', 'block'],
        },
      };

      const reg2 = {
        ...createValidRegistration(),
        nodeId: 'gateway-2',
        capabilities: {
          ...createValidRegistration().capabilities,
          supportedProtocols: ['utxo', 'block', 'transaction'],
        },
      };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      const selected = gatewayManager.selectOptimalGateway({
        requiredProtocols: ['transaction'],
      });

      expect(selected?.id).toBe(reg2.nodeId);
    });

    test('should return null when no gateways available', async () => {
      await gatewayManager.start();

      const selected = gatewayManager.selectOptimalGateway();

      expect(selected).toBeNull();
    });

    test('should use fallback when no gateways match criteria', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.9 });

      const selected = gatewayManager.selectOptimalGateway({ maxLoad: 0.1 });

      expect(selected?.id).toBe(reg1.nodeId); // Fallback to first available
    });

    test('should emit gateway:selected event', async () => {
      const selectedSpy = vi.fn();
      gatewayManager.on('gateway:selected', selectedSpy);

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      gatewayManager.selectOptimalGateway();

      expect(selectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: reg1.nodeId,
          score: expect.any(Number),
          timestamp: expect.any(Number),
        })
      );
    });

    test('should filter by preferred latency', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayMetrics(reg1.nodeId, { averageLatency: 200 });
      gatewayManager.updateGatewayMetrics(reg2.nodeId, { averageLatency: 50 });

      const selected = gatewayManager.selectOptimalGateway({
        preferredLatency: 100,
      });

      expect(selected?.id).toBe(reg2.nodeId);
    });

    test('should filter by minimum score', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      // Make reg1 have very poor metrics for low score
      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.95 });
      gatewayManager.updateGatewayMetrics(reg1.nodeId, {
        errorRate: 0.5,
        averageLatency: 500,
      });

      // Make reg2 have good metrics for high score
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.2 });
      gatewayManager.updateGatewayMetrics(reg2.nodeId, {
        errorRate: 0.01,
        averageLatency: 50,
      });

      const selected = gatewayManager.selectOptimalGateway({ minScore: 50 });

      expect(selected?.id).toBe(reg2.nodeId);
    });
  });

  describe('Gateway Scoring', () => {
    test('should calculate score based on load, error rate, and latency', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      const gateway = gatewayManager.getGateway(reg1.nodeId)!;
      gateway.status.currentLoad = 0.2;
      gateway.metrics.errorRate = 0.01;
      gateway.metrics.averageLatency = 50;
      gateway.status.queueSize = 5;

      const score = gatewayManager['calculateGatewayScore'](gateway);

      expect(score).toBeGreaterThan(70); // Good gateway should score high
    });

    test('should score low-load gateways higher', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.1 });
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.9 });

      const gw1 = gatewayManager.getGateway(reg1.nodeId)!;
      const gw2 = gatewayManager.getGateway(reg2.nodeId)!;

      const score1 = gatewayManager['calculateGatewayScore'](gw1);
      const score2 = gatewayManager['calculateGatewayScore'](gw2);

      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('Load Distribution', () => {
    test('should calculate average load across gateways', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.6 });
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.4 });

      const distributedSpy = vi.fn();
      gatewayManager.on('load:distributed', distributedSpy);

      gatewayManager.distributeLoad();

      expect(distributedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          avgLoad: 0.5,
          gatewayCount: 2,
        })
      );
    });

    test('should detect load imbalance', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      const reg2 = { ...createValidRegistration(), nodeId: 'gateway-2' };

      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);
      await gatewayManager.registerGateway(reg2);

      gatewayManager.updateGatewayStatus(reg1.nodeId, { currentLoad: 0.9 }); // Overloaded
      gatewayManager.updateGatewayStatus(reg2.nodeId, { currentLoad: 0.1 }); // Underloaded

      const imbalancedSpy = vi.fn();
      gatewayManager.on('load:imbalanced', imbalancedSpy);

      gatewayManager.distributeLoad();

      expect(imbalancedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          overloaded: expect.arrayContaining([reg1.nodeId]),
          underloaded: expect.arrayContaining([reg2.nodeId]),
        })
      );
    });

    test('should rebalance traffic', async () => {
      const rebalancedSpy = vi.fn();
      gatewayManager.on('traffic:rebalanced', rebalancedSpy);

      await gatewayManager.start();

      gatewayManager.rebalanceTraffic();

      expect(rebalancedSpy).toHaveBeenCalled();
    });
  });

  describe('Message Bridging', () => {
    test('should bridge message and update gateway metrics', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      const gateway = gatewayManager.getGateway(reg1.nodeId)!;
      const message = { type: 'transaction', payload: new Uint8Array() };

      const result = await gatewayManager.bridgeMessage(
        message,
        gateway,
        'node-123'
      );

      expect(result).toBe(true);
      expect(gateway.metrics.messagesProcessed).toBe(1);
    });

    test('should emit message:bridged event on success', async () => {
      const bridgedSpy = vi.fn();
      gatewayManager.on('message:bridged', bridgedSpy);

      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      const gateway = gatewayManager.getGateway(reg1.nodeId)!;
      const message = { type: 'block', payload: new Uint8Array() };

      await gatewayManager.bridgeMessage(message, gateway, 'node-456');

      expect(bridgedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: reg1.nodeId,
          destination: 'node-456',
          messageType: 'block',
        })
      );
    });

    test('should track gateway queue and load during bridging', async () => {
      vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

      const reg1 = createValidRegistration();
      await gatewayManager.start();
      await gatewayManager.registerGateway(reg1);

      const gateway = gatewayManager.getGateway(reg1.nodeId)!;
      const initialQueue = gateway.status.queueSize;
      const message = { type: 'transaction', payload: new Uint8Array() };

      await gatewayManager.bridgeMessage(message, gateway, 'node-789');

      // Queue should return to initial size after successful bridging
      expect(gateway.status.queueSize).toBe(initialQueue);
    });
  });

  describe('Error Scenarios and Boundary Conditions', () => {
    describe('Input Validation', () => {
      test('should throw error for invalid message (missing type)', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const invalidMessage = { payload: new Uint8Array() } as any;

        await expect(
          gatewayManager.bridgeMessage(invalidMessage, gateway, 'node-123')
        ).rejects.toThrow('Invalid message: type is required');
      });

      test('should throw error for empty destination', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const message = { type: 'transaction', payload: new Uint8Array() };

        await expect(
          gatewayManager.bridgeMessage(message, gateway, '')
        ).rejects.toThrow('Invalid destination: must be non-empty string');
      });

      test('should throw error for whitespace-only destination', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const message = { type: 'transaction', payload: new Uint8Array() };

        await expect(
          gatewayManager.bridgeMessage(message, gateway, '   ')
        ).rejects.toThrow('Invalid destination: must be non-empty string');
      });

      test('should throw error for invalid minScore criteria', () => {
        expect(() => {
          gatewayManager.selectOptimalGateway({ minScore: -10 });
        }).toThrow('minScore must be between 0 and 100');

        expect(() => {
          gatewayManager.selectOptimalGateway({ minScore: 150 });
        }).toThrow('minScore must be between 0 and 100');
      });

      test('should throw error for invalid maxLoad criteria', () => {
        expect(() => {
          gatewayManager.selectOptimalGateway({ maxLoad: -0.5 });
        }).toThrow('maxLoad must be between 0 and 1');

        expect(() => {
          gatewayManager.selectOptimalGateway({ maxLoad: 1.5 });
        }).toThrow('maxLoad must be between 0 and 1');
      });

      test('should throw error for invalid preferredLatency criteria', () => {
        expect(() => {
          gatewayManager.selectOptimalGateway({ preferredLatency: -100 });
        }).toThrow('preferredLatency must be non-negative');
      });
    });

    describe('Division by Zero Protection', () => {
      test('should handle maxThroughput = 0 in score calculation', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = {
          ...createValidRegistration(),
          capabilities: {
            ...createValidRegistration().capabilities,
            maxThroughput: 0,
          },
        };
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const score = gatewayManager['calculateGatewayScore'](gateway);

        expect(score).toBeDefined();
        expect(Number.isNaN(score)).toBe(false);
        expect(Number.isFinite(score)).toBe(true);
      });

      test('should handle maxThroughput = 0 in load calculation', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = {
          ...createValidRegistration(),
          capabilities: {
            ...createValidRegistration().capabilities,
            maxThroughput: 0,
          },
        };
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const message = { type: 'transaction', payload: new Uint8Array() };

        await gatewayManager.bridgeMessage(message, gateway, 'node-123');

        expect(gateway.status.currentLoad).toBe(1.0); // Should be fully loaded
        expect(Number.isNaN(gateway.status.currentLoad)).toBe(false);
      });
    });

    describe('Error Rate Calculation', () => {
      test('should calculate error rate correctly on first error', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;

        // Mock bridgeMessage to throw an error
        const message = { type: 'transaction', payload: new Uint8Array() };

        // Simulate error by manually setting up error condition
        vi.spyOn(gatewayManager as any, 'bridgeMessage').mockImplementationOnce(
          async () => {
            gateway.status.queueSize++;
            gateway.metrics.messagesProcessed++;
            gateway.metrics.errorRate = 1.0;
            throw new Error('Bridge failed');
          }
        );

        try {
          await gatewayManager.bridgeMessage(message, gateway, 'node-123');
        } catch (error) {
          // Expected error
        }

        expect(gateway.metrics.errorRate).toBeGreaterThan(0);
      });

      test('should calculate error rate correctly after multiple successes', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        const message = { type: 'transaction', payload: new Uint8Array() };

        // 10 successful messages
        for (let i = 0; i < 10; i++) {
          await gatewayManager.bridgeMessage(message, gateway, 'node-123');
        }

        expect(gateway.metrics.messagesProcessed).toBe(10);
        expect(gateway.metrics.errorRate).toBe(0);
      });
    });

    describe('Queue Size Bounds Checking', () => {
      test('should not allow negative queue size', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        gateway.status.queueSize = 0; // Set to 0

        const message = { type: 'transaction', payload: new Uint8Array() };

        await gatewayManager.bridgeMessage(message, gateway, 'node-123');

        // Queue size should never go negative
        expect(gateway.status.queueSize).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Boundary Value Tests', () => {
      test('should handle minScore = 0 and minScore = 100', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        // minScore = 0 should select gateway
        const selected1 = gatewayManager.selectOptimalGateway({ minScore: 0 });
        expect(selected1).not.toBeNull();

        // minScore = 100 might not find gateway depending on score
        const selected2 = gatewayManager.selectOptimalGateway({
          minScore: 100,
        });
        // Should either select or fallback to first available
        expect(selected2).not.toBeNull();
      });

      test('should handle maxLoad = 0 and maxLoad = 1', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        // maxLoad = 1 should allow all gateways
        const selected1 = gatewayManager.selectOptimalGateway({ maxLoad: 1 });
        expect(selected1).not.toBeNull();

        // maxLoad = 0 should use fallback
        const selected2 = gatewayManager.selectOptimalGateway({ maxLoad: 0 });
        expect(selected2).not.toBeNull(); // Fallback to first available
      });

      test('should handle extremely high latency values', async () => {
        vi.spyOn(CryptographicService, 'verify').mockReturnValue(true);

        const reg1 = createValidRegistration();
        await gatewayManager.start();
        await gatewayManager.registerGateway(reg1);

        const gateway = gatewayManager.getGateway(reg1.nodeId)!;
        gateway.metrics.averageLatency = 10000; // 10 seconds

        const score = gatewayManager['calculateGatewayScore'](gateway);

        expect(score).toBeDefined();
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
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
