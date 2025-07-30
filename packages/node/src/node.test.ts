import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LorachainNode } from './node.js';
import { Blockchain, BlockManager } from '@lorachain/core';
import { Logger } from '@lorachain/shared';
import type { NodeConfig } from './node.js';
import type { NetworkNode } from '@lorachain/core';

// Mock the logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('LorachainNode', () => {
  let node: LorachainNode;
  let mockLogger: any;
  let nodeConfig: NodeConfig;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    (Logger.getInstance as any).mockReturnValue(mockLogger);

    nodeConfig = {
      id: 'test-node-1',
      port: 8080,
      host: 'localhost',
      type: 'full',
      enableMining: false,
      minerAddress: 'miner-address',
    };
  });

  describe('constructor', () => {
    it('should initialize node with config', () => {
      node = new LorachainNode(nodeConfig);

      expect(node.getConfig()).toEqual(nodeConfig);
      expect(node.isNodeRunning()).toBe(false);
      expect(node.getPeers()).toHaveLength(0);
    });

    it('should initialize blockchain', () => {
      node = new LorachainNode(nodeConfig);

      const blockchain = node.getBlockchain();
      expect(blockchain).toBeInstanceOf(Blockchain);
      expect(blockchain.getBlocks()).toHaveLength(1); // Genesis block
    });

    it('should log initialization', () => {
      node = new LorachainNode(nodeConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Lorachain node initialized',
        { nodeId: 'test-node-1' }
      );
    });
  });

  describe('start', () => {
    beforeEach(() => {
      node = new LorachainNode(nodeConfig);
    });

    it('should start node successfully', async () => {
      await node.start();

      expect(node.isNodeRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting Lorachain node', {
        nodeId: 'test-node-1',
        port: 8080,
        type: 'full',
      });
    });

    it('should throw if node is already running', async () => {
      await node.start();

      await expect(node.start()).rejects.toThrow('Node is already running');
    });

    it('should start mining for full node with mining enabled', async () => {
      const miningConfig = { ...nodeConfig, enableMining: true };
      const miningNode = new LorachainNode(miningConfig);

      await miningNode.start();

      expect(miningNode.isNodeRunning()).toBe(true);
      // Mining should be started (tested separately)
    });

    it('should not start mining for light node', async () => {
      const lightConfig = { ...nodeConfig, type: 'light' as const };
      const lightNode = new LorachainNode(lightConfig);

      await lightNode.start();

      expect(lightNode.isNodeRunning()).toBe(true);
      // No mining should be started
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      node = new LorachainNode(nodeConfig);
    });

    it('should stop running node', async () => {
      await node.start();
      expect(node.isNodeRunning()).toBe(true);

      await node.stop();
      expect(node.isNodeRunning()).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Lorachain node', {
        nodeId: 'test-node-1',
      });
    });

    it('should handle stopping non-running node', async () => {
      await node.stop();

      expect(node.isNodeRunning()).toBe(false);
      // Should not throw error
    });
  });

  describe('addTransaction', () => {
    let transaction: any;

    beforeEach(() => {
      node = new LorachainNode(nodeConfig);
      transaction = {
        id: `test-tx-${Date.now()}`,
        inputs: [],
        outputs: [
          {
            value: 100,
            lockingScript: 'to-address',
            outputIndex: 0,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0,
      };
    });

    it('should add valid transaction', async () => {
      const result = await node.addTransaction(transaction);

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction added to pending pool',
        { transactionId: transaction.id }
      );
    });

    it('should reject invalid transaction', async () => {
      const invalidTransaction = {
        ...transaction,
        outputs: [
          {
            value: -100, // Invalid negative value
            lockingScript: 'to-address',
            outputIndex: 0,
          },
        ],
      };
      const result = await node.addTransaction(invalidTransaction);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid transaction rejected',
        {
          transactionId: invalidTransaction.id,
          errors: expect.any(Array),
        }
      );
    });

    it('should add transaction to blockchain', async () => {
      await node.addTransaction(transaction);

      const blockchain = node.getBlockchain();
      const pendingTransactions = blockchain.getPendingTransactions();

      expect(pendingTransactions).toHaveLength(1);
      expect(pendingTransactions[0].id).toBe(transaction.id);
    });
  });

  describe('addBlock', () => {
    let validBlock: any;

    beforeEach(() => {
      node = new LorachainNode(nodeConfig);

      // Create a valid block manually using BlockManager
      const transaction = {
        id: `block-test-tx-${Date.now()}`,
        from: 'from-address',
        to: 'to-address',
        amount: 100,
        fee: 1,
        timestamp: Date.now(),
        signature: 'test-signature',
        nonce: 0,
      };

      const blockchain = node.getBlockchain();
      const latestBlock = blockchain.getLatestBlock();

      // Create a valid block using BlockManager
      validBlock = BlockManager.createBlock(
        latestBlock.index + 1,
        [transaction],
        latestBlock.hash,
        blockchain.getDifficulty(),
        'miner-address'
      );
      validBlock = BlockManager.mineBlock(validBlock);
    });

    it('should add valid block', async () => {
      const result = await node.addBlock(validBlock);

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Block added to blockchain',
        { blockIndex: validBlock.index }
      );
    });

    it('should reject invalid block', async () => {
      const invalidBlock = { ...validBlock, hash: 'invalid-hash' };
      const result = await node.addBlock(invalidBlock);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid block rejected', {
        blockIndex: invalidBlock.index,
        errors: expect.any(Array),
      });
    });

    it('should add block to blockchain', async () => {
      await node.addBlock(validBlock);

      const blockchain = node.getBlockchain();
      const blocks = blockchain.getBlocks();

      expect(blocks).toHaveLength(2); // Genesis + added block
      expect(blocks[1].index).toBe(validBlock.index);
    });
  });

  describe('peer management', () => {
    let peer: NetworkNode;

    beforeEach(() => {
      node = new LorachainNode(nodeConfig);
      peer = {
        id: 'peer-1',
        address: '192.168.1.100',
        port: 8081,
        type: 'full',
        isOnline: true,
        lastSeen: Date.now(),
      };
    });

    describe('addPeer', () => {
      it('should add new peer', () => {
        node.addPeer(peer);

        const peers = node.getPeers();
        expect(peers).toHaveLength(1);
        expect(peers[0]).toEqual(peer);

        expect(mockLogger.info).toHaveBeenCalledWith('New peer added', {
          peerId: 'peer-1',
        });
      });

      it('should not add duplicate peer', () => {
        node.addPeer(peer);
        node.addPeer(peer);

        const peers = node.getPeers();
        expect(peers).toHaveLength(1);
      });

      it('should not log duplicate peer addition', () => {
        node.addPeer(peer);
        mockLogger.info.mockClear();

        node.addPeer(peer);

        expect(mockLogger.info).not.toHaveBeenCalledWith('New peer added', {
          peerId: 'peer-1',
        });
      });
    });

    describe('removePeer', () => {
      it('should remove existing peer', () => {
        node.addPeer(peer);
        expect(node.getPeers()).toHaveLength(1);

        node.removePeer('peer-1');
        expect(node.getPeers()).toHaveLength(0);

        expect(mockLogger.info).toHaveBeenCalledWith('Peer removed', {
          peerId: 'peer-1',
        });
      });

      it('should handle removing non-existent peer', () => {
        node.removePeer('non-existent');

        expect(node.getPeers()).toHaveLength(0);
        expect(mockLogger.info).not.toHaveBeenCalledWith('Peer removed', {
          peerId: 'non-existent',
        });
      });
    });

    describe('getPeers', () => {
      it('should return copy of peers array', () => {
        node.addPeer(peer);

        const peers1 = node.getPeers();
        const peers2 = node.getPeers();

        expect(peers1).not.toBe(peers2);
        expect(peers1).toEqual(peers2);
      });
    });
  });

  describe('mining', () => {
    let miningNode: LorachainNode;

    beforeEach(() => {
      const miningConfig = {
        ...nodeConfig,
        enableMining: true,
        minerAddress: 'miner-address',
      };
      miningNode = new LorachainNode(miningConfig);
    });

    it('should warn when mining without miner address', async () => {
      const configWithoutMiner = {
        ...nodeConfig,
        enableMining: true,
        minerAddress: undefined,
      };
      const nodeWithoutMiner = new LorachainNode(configWithoutMiner);

      await nodeWithoutMiner.start();

      // Wait a bit for mining to attempt (mining starts after 1 second)
      await new Promise(resolve => setTimeout(resolve, 1200));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Mining enabled but no miner address configured'
      );
    });

    it('should not mine when no pending transactions', async () => {
      await miningNode.start();

      // Wait a bit for mining to attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      const blockchain = miningNode.getBlockchain();
      const blocks = blockchain.getBlocks();

      expect(blocks).toHaveLength(1); // Only genesis block
    });

    it('should mine blocks when transactions are available', async () => {
      const transaction = {
        id: `mining-test-tx-${Date.now()}`,
        inputs: [],
        outputs: [
          {
            value: 100,
            lockingScript: 'to-address',
            outputIndex: 0,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0,
      };

      miningNode.addTransaction(transaction);
      await miningNode.start();

      // Wait for mining to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const blockchain = miningNode.getBlockchain();
      const blocks = blockchain.getBlocks();

      expect(blocks.length).toBeGreaterThan(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Mining new block', {
        pendingTransactions: 1,
      });
    });
  });

  describe('getConfig', () => {
    it('should return copy of config', () => {
      node = new LorachainNode(nodeConfig);

      const config1 = node.getConfig();
      const config2 = node.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
      expect(config1).toEqual(nodeConfig);
    });
  });

  describe('getBlockchain', () => {
    it('should return blockchain instance', () => {
      node = new LorachainNode(nodeConfig);

      const blockchain = node.getBlockchain();

      expect(blockchain).toBeInstanceOf(Blockchain);
    });

    it('should return same blockchain instance', () => {
      node = new LorachainNode(nodeConfig);

      const blockchain1 = node.getBlockchain();
      const blockchain2 = node.getBlockchain();

      expect(blockchain1).toBe(blockchain2);
    });
  });

  describe('node types', () => {
    it('should handle light node configuration', () => {
      const lightConfig = { ...nodeConfig, type: 'light' as const };
      const lightNode = new LorachainNode(lightConfig);

      expect(lightNode.getConfig().type).toBe('light');
    });

    it('should handle full node configuration', () => {
      const fullConfig = { ...nodeConfig, type: 'full' as const };
      const fullNode = new LorachainNode(fullConfig);

      expect(fullNode.getConfig().type).toBe('full');
    });
  });

  describe('broadcasting', () => {
    beforeEach(() => {
      node = new LorachainNode(nodeConfig);

      // Add some peers
      node.addPeer({
        id: 'peer-1',
        address: '192.168.1.100',
        port: 8081,
        type: 'full',
        isOnline: true,
        lastSeen: Date.now(),
      });

      node.addPeer({
        id: 'peer-2',
        address: '192.168.1.101',
        port: 8082,
        type: 'light',
        isOnline: true,
        lastSeen: Date.now(),
      });
    });

    it('should log transaction broadcast', async () => {
      const transaction = {
        id: `broadcast-test-tx-${Date.now()}`,
        inputs: [],
        outputs: [
          {
            value: 100,
            lockingScript: 'to-address',
            outputIndex: 0,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0,
      };

      await node.addTransaction(transaction);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Broadcasting transaction to peers',
        {
          transactionId: transaction.id,
          peerCount: 2,
        }
      );
    });
  });
});
