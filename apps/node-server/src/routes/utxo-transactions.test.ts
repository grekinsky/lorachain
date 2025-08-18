import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUTXOTransactionRouter } from './utxo-transactions.js';
import { LorachainNode } from '@lorachain/node';

describe('UTXO Transaction Router', () => {
  let app: express.Application;
  let mockNode: LorachainNode;

  beforeEach(() => {
    const mockTransactions = [
      {
        id: 'tx-1',
        inputs: [
          {
            previousTxId: 'prev-tx-1',
            outputIndex: 0,
            unlockingScript: 'signature-1',
            sequence: 0,
          },
        ],
        outputs: [
          {
            value: 10000,
            lockingScript: 'address-1',
          },
        ],
        timestamp: 1640995500000,
        lockTime: 0,
        fee: 1000,
      },
    ];

    // Create mock node
    mockNode = {
      getBlockchain: vi.fn().mockReturnValue({
        getBlocks: vi.fn().mockReturnValue([]),
        getPendingTransactions: vi.fn().mockReturnValue(mockTransactions),
        addTransaction: vi.fn(),
      }),
    } as any;

    // Create Express app with router
    app = express();
    app.use(express.json());
    app.use('/api/v1/utxo-transactions', createUTXOTransactionRouter(mockNode));
  });

  describe('POST /submit', () => {
    it('should submit valid UTXO transaction', async () => {
      const transaction = {
        inputs: [
          {
            previousTxId: 'prev-tx-id',
            outputIndex: 0,
            unlockingScript: 'signature',
            sequence: 0,
            value: 10000,
          },
        ],
        outputs: [
          {
            value: 9000,
            lockingScript: 'recipient-address',
          },
        ],
        signature: 'transaction-signature',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/submit')
        .send(transaction)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactionId: expect.any(String),
          status: 'pending',
          inputCount: 1,
          outputCount: 1,
          fee: 1000,
          timestamp: expect.any(Number),
        },
        timestamp: expect.any(Number),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });

      expect(mockNode.getBlockchain().addTransaction).toHaveBeenCalled();
    });

    it('should reject transaction with no inputs', async () => {
      const transaction = {
        inputs: [],
        outputs: [
          {
            value: 9000,
            lockingScript: 'recipient-address',
          },
        ],
        signature: 'transaction-signature',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/submit')
        .send(transaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
      expect(response.body.error.message).toContain('at least one input');
    });

    it('should reject transaction with no outputs', async () => {
      const transaction = {
        inputs: [
          {
            previousTxId: 'prev-tx-id',
            outputIndex: 0,
            unlockingScript: 'signature',
            sequence: 0,
            value: 10000,
          },
        ],
        outputs: [],
        signature: 'transaction-signature',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/submit')
        .send(transaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_OUTPUT');
      expect(response.body.error.message).toContain('at least one output');
    });

    it('should reject malformed transaction data', async () => {
      const response = await request(app)
        .post('/api/v1/utxo-transactions/submit')
        .send({
          inputs: 'not-an-array',
          outputs: 'not-an-array',
          signature: 'signature',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
    });
  });

  describe('GET /pending', () => {
    it('should return pending transactions', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/pending')
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
              fee: expect.any(Number),
              size: expect.any(Number),
            }),
          ]),
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
    });

    it('should respect pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/pending?limit=1&offset=0')
        .expect(200);

      expect(response.body.data.limit).toBe(1);
      expect(response.body.data.offset).toBe(0);
      expect(response.body.data.transactions).toHaveLength(1);
    });

    it('should enforce maximum limit', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/pending?limit=1000')
        .expect(200);

      expect(response.body.data.limit).toBe(200); // Max enforced
    });
  });

  describe('GET /mempool/stats', () => {
    it('should return mempool statistics', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/mempool/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactionCount: 1,
          totalSize: expect.any(Number),
          totalFees: 1000,
          averageFee: 1000,
          feeDistribution: {
            low: expect.any(Number),
            medium: expect.any(Number),
            high: expect.any(Number),
          },
          oldestTransaction: 1640995500000,
          newestTransaction: 1640995500000,
          estimatedClearTime: expect.any(Number),
        },
      });
    });

    it('should handle empty mempool', async () => {
      mockNode.getBlockchain().getPendingTransactions.mockReturnValue([]);

      const response = await request(app)
        .get('/api/v1/utxo-transactions/mempool/stats')
        .expect(200);

      expect(response.body.data.transactionCount).toBe(0);
      expect(response.body.data.totalFees).toBe(0);
      expect(response.body.data.averageFee).toBe(0);
      expect(response.body.data.oldestTransaction).toBeNull();
      expect(response.body.data.newestTransaction).toBeNull();
    });
  });

  describe('POST /validate', () => {
    it('should validate correct transaction structure', async () => {
      const transaction = {
        inputs: [
          {
            txId: 'prev-tx-id',
            outputIndex: 0,
            value: 10000,
          },
        ],
        outputs: [
          {
            value: 8000,
            lockingScript: 'recipient-address',
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/validate')
        .send(transaction)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isValid: true,
          errors: [],
          warnings: expect.any(Array),
          transactionId: expect.any(String),
          fee: 2000,
          size: expect.any(Number),
          inputCount: 1,
          outputCount: 1,
        },
      });
    });

    it('should detect invalid transaction structure', async () => {
      const transaction = {
        inputs: [
          {
            // Missing txId
            outputIndex: 0,
            value: 10000,
          },
        ],
        outputs: [
          {
            value: 0, // Invalid value
            lockingScript: '', // Missing locking script
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/validate')
        .send(transaction)
        .expect(200);

      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
      expect(response.body.data.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('txId is required'),
          expect.stringContaining('value must be positive'),
          expect.stringContaining('lockingScript is required'),
        ])
      );
    });

    it('should detect overspending', async () => {
      const transaction = {
        inputs: [
          {
            txId: 'prev-tx-id',
            outputIndex: 0,
            value: 5000,
          },
        ],
        outputs: [
          {
            value: 6000, // More than input
            lockingScript: 'recipient-address',
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/validate')
        .send(transaction)
        .expect(200);

      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Total output value exceeds input value'),
        ])
      );
    });

    it('should warn about low fees', async () => {
      const transaction = {
        inputs: [
          {
            txId: 'prev-tx-id',
            outputIndex: 0,
            value: 10000,
          },
        ],
        outputs: [
          {
            value: 9999, // Very small fee
            lockingScript: 'recipient-address',
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/validate')
        .send(transaction)
        .expect(200);

      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Transaction fee is very low'),
        ])
      );
    });
  });

  describe('GET /fee-estimate', () => {
    it('should return fee estimates', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/fee-estimate')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          estimates: {
            slow: expect.objectContaining({
              satoshisPerByte: expect.any(Number),
              estimatedBlocks: expect.any(Number),
              estimatedMinutes: expect.any(Number),
            }),
            medium: expect.objectContaining({
              satoshisPerByte: expect.any(Number),
              estimatedBlocks: expect.any(Number),
              estimatedMinutes: expect.any(Number),
            }),
            fast: expect.objectContaining({
              satoshisPerByte: expect.any(Number),
              estimatedBlocks: expect.any(Number),
              estimatedMinutes: expect.any(Number),
            }),
          },
          feeEstimates: {
            slow: expect.any(Number),
            medium: expect.any(Number),
            fast: expect.any(Number),
          },
          estimatedTransactionSize: expect.any(Number),
          mempoolSize: expect.any(Number),
          lastUpdated: expect.any(Number),
        },
      });
    });

    it('should accept custom transaction size parameters', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/fee-estimate?inputs=2&outputs=3')
        .expect(200);

      expect(response.body.data.estimatedTransactionSize).toBeGreaterThan(0);
    });
  });

  describe('GET /:id', () => {
    it('should return transaction details for pending transaction', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/tx-1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'tx-1',
          inputs: expect.any(Array),
          outputs: expect.any(Array),
          timestamp: expect.any(Number),
          fee: expect.any(Number),
          size: expect.any(Number),
          status: 'pending',
          blockInfo: null,
        },
      });
    });

    it('should return transaction details for confirmed transaction', async () => {
      const mockBlocks = [
        {
          index: 1,
          hash: 'block-hash',
          transactions: [
            {
              id: 'confirmed-tx',
              inputs: [],
              outputs: [{ value: 5000, lockingScript: 'address' }],
              timestamp: 1640995500000,
              lockTime: 0,
              fee: 0,
            },
          ],
        },
      ];

      mockNode.getBlockchain().getBlocks.mockReturnValue(mockBlocks);
      mockNode.getBlockchain().getPendingTransactions.mockReturnValue([]);

      const response = await request(app)
        .get('/api/v1/utxo-transactions/confirmed-tx')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'confirmed-tx',
          status: 'confirmed',
          blockInfo: {
            blockIndex: 1,
            blockHash: 'block-hash',
            confirmations: 0,
          },
        },
      });
    });

    it('should return 404 for non-existent transaction', async () => {
      mockNode.getBlockchain().getPendingTransactions.mockReturnValue([]);

      const response = await request(app)
        .get('/api/v1/utxo-transactions/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });
  });
});
