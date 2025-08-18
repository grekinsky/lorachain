/**
 * Unit tests for Enhanced Lorachain Node with Peer Management
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EnhancedLorachainNode, EnhancedNodeConfig } from './enhanced-node.js';
import type { GenesisConfig } from '@lorachain/core';

describe('EnhancedLorachainNode', () => {
  let node: EnhancedLorachainNode;
  let mockConfig: EnhancedNodeConfig;
  let testGenesisConfig: GenesisConfig;

  beforeEach(() => {
    // Test genesis configuration
    testGenesisConfig = {
      chainId: 'enhanced-node-test-chain',
      networkName: 'Enhanced Node Test Network',
      version: '1.0.0',
      initialAllocations: [
        {
          address: 'lora1enhanced000000000000000000000000000000',
          amount: 1000000,
          description: 'Test allocation for enhanced node tests',
        },
      ],
      totalSupply: 21000000,
      networkParams: {
        initialDifficulty: 1,
        targetBlockTime: 180,
        adjustmentPeriod: 10,
        maxDifficultyRatio: 4,
        maxBlockSize: 1024 * 1024,
        miningReward: 10,
        halvingInterval: 210000,
      },
      metadata: {
        timestamp: 1700000000000,
        description: 'Enhanced Node Test Network Genesis Block',
        creator: 'Enhanced Node Test Suite',
        networkType: 'testnet',
      },
    };

    mockConfig = {
      id: 'test-node-1',
      port: 8333,
      host: 'localhost',
      type: 'full',
      enableMining: false, // Disable for testing
      enablePeerManagement: true,
      autoDiscovery: true,
      maxPeers: 50,
      genesisConfig: testGenesisConfig, // Use test genesis config directly
      persistenceConfig: {
        enabled: true,
        dbPath: ':memory:',
        dbType: 'memory',
        autoSave: true,
        batchSize: 100,
        compressionType: 'none',
        utxoSetCacheSize: 1000,
        cryptographicAlgorithm: 'secp256k1',
        compactionStyle: 'size',
      },
      peerManager: {
        discovery: {
          dnsSeeds: ['test-seed.example.com'],
          enablePeerExchange: true,
          enableMdns: false, // Disable for testing
          enableMeshAnnounce: true,
          discoveryInterval: 5000,
          maxDiscoveryPeers: 100,
        },
        connectionPool: {
          maxConnections: 20,
          maxOutbound: 15,
          maxInbound: 5,
          connectionTimeout: 10000,
          reconnectInterval: 30000,
          maxReconnectAttempts: 3,
          preferredPeerTypes: ['full', 'light'],
        },
      },
    };

    node = new EnhancedLorachainNode(mockConfig);
  });

  afterEach(async () => {
    if (node && node.isNodeRunning()) {
      await node.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize with peer management enabled', () => {
      expect(node).toBeDefined();
      expect(node.isPeerManagementEnabled()).toBe(true);
    });

    test('should initialize without peer management', () => {
      const configWithoutPeerMgmt: EnhancedNodeConfig = {
        ...mockConfig,
        enablePeerManagement: false,
      };

      const nodeWithoutPeerMgmt = new EnhancedLorachainNode(
        configWithoutPeerMgmt
      );
      expect(nodeWithoutPeerMgmt.isPeerManagementEnabled()).toBe(false);
    });

    test('should get configuration', () => {
      const config = node.getConfig();
      expect(config.id).toBe('test-node-1');
      expect(config.enablePeerManagement).toBe(true);
    });
  });

  describe('Node Lifecycle', () => {
    test('should start and stop successfully', async () => {
      await expect(node.start()).resolves.not.toThrow();
      expect(node.isNodeRunning()).toBe(true);

      await expect(node.stop()).resolves.not.toThrow();
      expect(node.isNodeRunning()).toBe(false);
    });

    test('should not start multiple times', async () => {
      await node.start();
      expect(node.isNodeRunning()).toBe(true);

      await expect(node.start()).rejects.toThrow('already running');

      await node.stop();
    });
  });

  describe('Peer Management Integration', () => {
    beforeEach(async () => {
      await node.start();
    });

    test('should add peers through enhanced interface', () => {
      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      const added = node.addPeer(mockPeer);
      expect(added).toBe(true);

      const peers = node.getPeers();
      expect(peers.length).toBeGreaterThan(0);
      expect(peers.some(p => p.id === 'test-peer-1')).toBe(true);
    });

    test('should remove peers', () => {
      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      node.addPeer(mockPeer);
      const removed = node.removePeer('test-peer-1');
      expect(removed).toBe(true);

      const peers = node.getPeers();
      expect(peers.some(p => p.id === 'test-peer-1')).toBe(false);
    });

    test('should get connected peers', () => {
      const connectedPeers = node.getConnectedPeers();
      expect(Array.isArray(connectedPeers)).toBe(true);
    });

    test('should get best peers', () => {
      const bestPeers = node.getBestPeers(5);
      expect(Array.isArray(bestPeers)).toBe(true);
      expect(bestPeers.length).toBeLessThanOrEqual(5);
    });

    test('should ban and unban peers', () => {
      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      node.addPeer(mockPeer);
      node.banPeer('test-peer-1', 'Testing ban functionality');

      const peers = node.getPeers();
      const bannedPeer = peers.find(p => p.id === 'test-peer-1');
      expect(bannedPeer?.isBanned).toBe(true);

      const unbanned = node.unbanPeer('test-peer-1');
      expect(unbanned).toBe(true);

      const peersAfterUnban = node.getPeers();
      const unbanedPeer = peersAfterUnban.find(p => p.id === 'test-peer-1');
      expect(unbanedPeer?.isBanned).toBe(false);
    });

    test('should record peer misbehavior', () => {
      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      node.addPeer(mockPeer);
      expect(() => {
        node.recordPeerMisbehavior(
          'test-peer-1',
          'invalid_message',
          'Malformed transaction'
        );
      }).not.toThrow();
    });

    test('should report peer interactions', () => {
      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      node.addPeer(mockPeer);

      expect(() => {
        node.reportPeerSuccess('test-peer-1');
        node.reportPeerFailure('test-peer-1');
        node.reportInvalidMessage('test-peer-1', 'Invalid signature');
      }).not.toThrow();
    });

    test('should get peer statistics', () => {
      const stats = node.getPeerStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats?.totalPeers).toBe('number');
      expect(typeof stats?.connectedPeers).toBe('number');
    });
  });

  describe('Blockchain Integration', () => {
    test('should get blockchain instance', () => {
      const blockchain = node.getBlockchain();
      expect(blockchain).toBeDefined();
    });

    test('should handle transactions', async () => {
      // This would require a valid UTXO transaction, which needs proper setup
      // For now, just test that the method exists and handles invalid input gracefully
      await node.start();

      // Test with null/undefined transaction - should handle gracefully
      try {
        await node.addTransaction(null as any);
      } catch (error) {
        expect(error).toBeDefined();
      }

      await node.stop();
    });

    test('should handle blocks', async () => {
      // This would require a valid block, which needs proper setup
      // For now, just test that the method exists and handles invalid input gracefully
      await node.start();

      // Test with null/undefined block - should handle gracefully
      try {
        await node.addBlock(null as any);
      } catch (error) {
        expect(error).toBeDefined();
      }

      await node.stop();
    });
  });

  describe('Without Peer Management', () => {
    let nodeWithoutPeerMgmt: EnhancedLorachainNode;

    beforeEach(() => {
      const configWithoutPeerMgmt: EnhancedNodeConfig = {
        ...mockConfig,
        enablePeerManagement: false,
      };

      nodeWithoutPeerMgmt = new EnhancedLorachainNode(configWithoutPeerMgmt);
    });

    afterEach(async () => {
      if (nodeWithoutPeerMgmt && nodeWithoutPeerMgmt.isNodeRunning()) {
        await nodeWithoutPeerMgmt.stop();
      }
    });

    test('should handle peer operations gracefully without peer management', async () => {
      await nodeWithoutPeerMgmt.start();

      const mockPeer = {
        id: 'test-peer-1',
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      // These should return false or do nothing without throwing
      expect(nodeWithoutPeerMgmt.addPeer(mockPeer)).toBe(false);
      expect(nodeWithoutPeerMgmt.removePeer('test-peer-1')).toBe(false);
      expect(nodeWithoutPeerMgmt.getPeers()).toEqual([]);
      expect(nodeWithoutPeerMgmt.getConnectedPeers()).toEqual([]);
      expect(nodeWithoutPeerMgmt.getBestPeers(5)).toEqual([]);
      expect(nodeWithoutPeerMgmt.getPeerStatistics()).toBeNull();

      await nodeWithoutPeerMgmt.stop();
    });
  });

  describe('Legacy Peer Compatibility', () => {
    beforeEach(async () => {
      await node.start();
    });

    test('should handle legacy NetworkNode format', () => {
      const legacyPeer = {
        id: 'legacy-peer',
        address: '192.168.1.200',
        port: 8333,
        type: 'light' as const,
        isOnline: true,
        lastSeen: Date.now(),
      };

      const added = node.addPeer(legacyPeer);
      expect(added).toBe(true);

      const peers = node.getPeers();
      const addedPeer = peers.find(p => p.id === 'legacy-peer');
      expect(addedPeer).toBeDefined();
      expect(addedPeer?.discoveryMethod).toBe('manual');
    });
  });

  describe('Configuration Validation', () => {
    test('should handle missing optional configuration', () => {
      const minimalConfig: EnhancedNodeConfig = {
        id: 'minimal-node',
        port: 8333,
        host: 'localhost',
        type: 'light',
        enableMining: false,
        enablePeerManagement: true,
        autoDiscovery: false,
      };

      expect(() => {
        new EnhancedLorachainNode(minimalConfig);
      }).not.toThrow();
    });

    test('should merge partial peer manager configuration', () => {
      const partialConfig: EnhancedNodeConfig = {
        id: 'partial-config-node',
        port: 8333,
        host: 'localhost',
        type: 'full',
        enableMining: false,
        enablePeerManagement: true,
        autoDiscovery: true,
        peerManager: {
          connectionPool: {
            maxConnections: 100,
            maxOutbound: 80,
            maxInbound: 20,
            connectionTimeout: 15000,
            reconnectInterval: 60000,
            maxReconnectAttempts: 5,
            preferredPeerTypes: ['full', 'light'],
          },
        },
      };

      expect(() => {
        new EnhancedLorachainNode(partialConfig);
      }).not.toThrow();
    });
  });
});
