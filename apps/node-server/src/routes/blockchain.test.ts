import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createBlockchainRouter } from './blockchain.js';
import { LorachainNode } from '@lorachain/node';

describe('Blockchain Router', () => {
  let app: express.Application;
  let mockNode: LorachainNode;

  beforeEach(() => {
    // Create mock blockchain data
    const mockBlocks = [
      {
        index: 0,
        hash: 'genesis-hash',
        previousHash: '0',
        timestamp: 1640995200000,
        nonce: 0,
        difficulty: 1,
        transactions: [],
        merkleRoot: 'genesis-merkle',
      },
      {
        index: 1,
        hash: 'block-1-hash',
        previousHash: 'genesis-hash',
        timestamp: 1640995500000,
        nonce: 12345,
        difficulty: 1,
        transactions: [
          {
            id: 'tx-1',
            inputs: [],
            outputs: [{ value: 5000000000, lockingScript: 'miner-address' }],
            timestamp: 1640995500000,
            lockTime: 0,
            fee: 0,
          },
        ],
        merkleRoot: 'block-1-merkle',
      },
    ];

    // Create mock node
    mockNode = {
      getBlockchain: vi.fn().mockReturnValue({
        getBlocks: vi.fn().mockReturnValue(mockBlocks),
        getDifficulty: vi.fn().mockReturnValue(1),
        getMiningReward: vi.fn().mockReturnValue(5000000000),
        getPendingTransactions: vi.fn().mockReturnValue([]),
      }),
    } as any;

    // Create Express app with router
    app = express();
    app.use(express.json());
    app.use('/api/v1/blockchain', createBlockchainRouter(mockNode));
  });

  describe('GET /info', () => {
    it('should return blockchain information', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/info')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          height: 2,
          latestBlockHash: 'block-1-hash',
          difficulty: 1,
          targetDifficulty: 1,
          networkHashRate: 0,
          totalUTXOs: 0,
          totalSupply: '0',
          averageBlockTime: 300000,
          nextDifficultyAdjustment: 10,
        },
        timestamp: expect.any(Number),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
    });

    it('should handle empty blockchain', async () => {
      mockNode.getBlockchain().getBlocks.mockReturnValue([]);

      const response = await request(app)
        .get('/api/v1/blockchain/info')
        .expect(200);

      expect(response.body.data.height).toBe(0);
      expect(response.body.data.latestBlockHash).toBe('');
    });
  });

  describe('GET /blocks', () => {
    it('should return paginated blocks', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          blocks: expect.arrayContaining([
            expect.objectContaining({
              index: expect.any(Number),
              hash: expect.any(String),
              previousHash: expect.any(String),
              timestamp: expect.any(Number),
              nonce: expect.any(Number),
              difficulty: expect.any(Number),
              transactionCount: expect.any(Number),
              merkleRoot: expect.any(String),
            }),
          ]),
          total: 2,
          limit: 10,
          offset: 0,
        },
      });

      // Should be sorted latest first
      expect(response.body.data.blocks[0].index).toBe(1);
      expect(response.body.data.blocks[1].index).toBe(0);
    });

    it('should respect pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks?limit=1&offset=1')
        .expect(200);

      expect(response.body.data.blocks).toHaveLength(1);
      expect(response.body.data.limit).toBe(1);
      expect(response.body.data.offset).toBe(1);
      expect(response.body.data.blocks[0].index).toBe(0); // Second latest
    });
  });

  describe('GET /blocks/:index', () => {
    it('should return specific block by index', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          index: 1,
          hash: 'block-1-hash',
          previousHash: 'genesis-hash',
          timestamp: 1640995500000,
          nonce: 12345,
          difficulty: 1,
          transactions: expect.any(Array),
          merkleRoot: 'block-1-merkle',
          size: expect.any(Number),
        },
      });
    });

    it('should return 404 for non-existent block', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });

    it('should return 404 for invalid block index', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/invalid')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });
  });

  describe('GET /blocks/:index/utxo-transactions', () => {
    it('should return UTXO transactions for specific block', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/1/utxo-transactions')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactions: expect.arrayContaining([
            expect.objectContaining({
              id: 'tx-1',
              inputs: expect.any(Array),
              outputs: expect.any(Array),
              timestamp: expect.any(Number),
              lockTime: expect.any(Number),
              fee: expect.any(Number),
              blockIndex: 1,
              blockHash: 'block-1-hash',
            }),
          ]),
          blockIndex: 1,
          blockHash: 'block-1-hash',
          count: 1,
        },
      });
    });

    it('should return empty transactions for genesis block', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/0/utxo-transactions')
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });

    it('should return 404 for non-existent block', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/blocks/999/utxo-transactions')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });
  });

  describe('GET /stats', () => {
    it('should return blockchain statistics', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          blockHeight: 2,
          pendingTransactions: 0,
          totalTransactions: 1,
          difficulty: 1,
          miningReward: 5000000000,
          averageBlockTime: 300000,
          networkHashRate: 0,
          mempoolSize: 0,
          lastBlockTime: 1640995500000,
        },
      });
    });
  });

  describe('GET /difficulty', () => {
    it('should return difficulty information', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/difficulty')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          current: 1,
          target: 1,
          adjustment: {
            nextAdjustmentAt: 10,
            blocksUntilAdjustment: 8,
            lastAdjustmentAt: 0,
          },
          history: expect.arrayContaining([
            expect.objectContaining({
              blockIndex: expect.any(Number),
              difficulty: expect.any(Number),
              timestamp: expect.any(Number),
            }),
          ]),
        },
      });
    });
  });

  describe('GET /hashrate', () => {
    it('should return network hashrate estimation', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/hashrate')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          current: expect.any(Number),
          unit: 'hashes/second',
          networkDifficulty: 1,
          estimatedMiners: expect.any(Number),
          lastUpdated: expect.any(Number),
          calculationPeriod: expect.any(Number),
        },
      });
    });

    it('should handle single block scenario', async () => {
      mockNode.getBlockchain().getBlocks.mockReturnValue([
        {
          index: 0,
          hash: 'genesis-hash',
          previousHash: '0',
          timestamp: 1640995200000,
          nonce: 0,
          difficulty: 1,
          transactions: [],
          merkleRoot: 'genesis-merkle',
        },
      ]);

      const response = await request(app)
        .get('/api/v1/blockchain/hashrate')
        .expect(200);

      expect(response.body.data.current).toBe(0);
    });
  });
});
