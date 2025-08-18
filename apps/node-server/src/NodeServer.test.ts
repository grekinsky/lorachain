import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeServer } from './NodeServer';

// Mock all external dependencies
const mockNode = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  isNodeRunning: vi.fn().mockReturnValue(true),
  getBlockchain: vi.fn().mockReturnValue({
    getBlocks: vi
      .fn()
      .mockReturnValue([{ hash: 'block1' }, { hash: 'block2' }]),
    getPendingTransactions: vi
      .fn()
      .mockReturnValue([{ id: 'tx1' }, { id: 'tx2' }]),
    getDifficulty: vi.fn().mockReturnValue(4),
    getMiningReward: vi.fn().mockReturnValue(50),
  }),
};

const mockMeshProtocol = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getConnectedNodes: vi
    .fn()
    .mockReturnValue([{ id: 'node1' }, { id: 'node2' }]),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock('@lorachain/node', () => ({
  LorachainNode: vi.fn(() => mockNode),
}));

vi.mock('@lorachain/mesh-protocol', () => ({
  MeshProtocol: vi.fn(() => mockMeshProtocol),
}));

vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: vi.fn(() => mockLogger),
  },
}));

vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: vi.fn(() => 'test-node-id'),
  })),
}));

describe('NodeServer', () => {
  let server: NodeServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new NodeServer();
  });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      expect(server).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Node server initialized', {
        nodeId: 'test-node-id',
      });
    });
  });

  describe('start', () => {
    it('should start node and mesh protocol successfully', async () => {
      await server.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting node server');
      expect(mockNode.start).toHaveBeenCalled();
      expect(mockMeshProtocol.connect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Node server started successfully'
      );
    });

    it('should handle start failure gracefully', async () => {
      const error = new Error('Start failed');
      mockNode.start.mockRejectedValue(error);

      await expect(server.start()).rejects.toThrow('Start failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start node server',
        { error }
      );
    });
  });

  describe('stop', () => {
    it('should stop node and mesh protocol successfully', async () => {
      await server.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping node server');
      expect(mockNode.stop).toHaveBeenCalled();
      expect(mockMeshProtocol.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Node server stopped successfully'
      );
    });

    it('should handle stop failure gracefully', async () => {
      const error = new Error('Stop failed');
      mockNode.stop.mockRejectedValue(error);

      await server.stop();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during node server shutdown',
        { error }
      );
    });
  });

  describe('getNodeInfo', () => {
    it('should return correct node information', () => {
      const nodeInfo = server.getNodeInfo();

      expect(nodeInfo).toEqual({
        nodeId: 'test-node-id',
        isRunning: true,
        connectedMeshNodes: 2,
        blockchainHeight: 2,
        pendingTransactions: 2,
        httpServerRunning: false,
      });
    });
  });

  describe('getBlockchainStats', () => {
    it('should return correct blockchain statistics', () => {
      const stats = server.getBlockchainStats();

      expect(stats).toEqual({
        height: 2,
        latestBlockHash: 'block2',
        pendingTransactions: 2,
        difficulty: 4,
        miningReward: 50,
      });
    });

    it('should handle empty blockchain', () => {
      mockNode.getBlockchain.mockReturnValue({
        getBlocks: vi.fn().mockReturnValue([]),
        getPendingTransactions: vi.fn().mockReturnValue([]),
        getDifficulty: vi.fn().mockReturnValue(1),
        getMiningReward: vi.fn().mockReturnValue(50),
      });

      const stats = server.getBlockchainStats();

      expect(stats.height).toBe(0);
      expect(stats.latestBlockHash).toBe('N/A');
      expect(stats.pendingTransactions).toBe(0);
    });
  });
});
