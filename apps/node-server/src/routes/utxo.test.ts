import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUTXORouter } from './utxo.js';
import { LorachainNode } from '@lorachain/node';

describe('UTXO Router', () => {
  let app: express.Application;
  let mockNode: LorachainNode;

  beforeEach(() => {
    const mockBlocks = [
      {
        index: 0,
        hash: 'genesis-hash',
        transactions: [
          {
            id: 'genesis-tx',
            inputs: [],
            outputs: [
              {
                value: 5000000000,
                lockingScript: 'miner-address',
              },
            ],
            timestamp: 1640995200000,
            lockTime: 0,
            fee: 0,
          },
        ],
      },
      {
        index: 1,
        hash: 'block-1-hash',
        transactions: [
          {
            id: 'tx-1',
            inputs: [
              {
                previousTxId: 'genesis-tx',
                outputIndex: 0,
                unlockingScript: 'signature',
                sequence: 0,
              },
            ],
            outputs: [
              {
                value: 1000000,
                lockingScript: 'alice-address',
              },
              {
                value: 4999000000,
                lockingScript: 'miner-address',
              },
            ],
            timestamp: 1640995500000,
            lockTime: 0,
            fee: 1000000,
          },
          {
            id: 'tx-2',
            inputs: [
              {
                previousTxId: 'tx-1',
                outputIndex: 0,
                unlockingScript: 'alice-signature',
                sequence: 0,
              },
            ],
            outputs: [
              {
                value: 500000,
                lockingScript: 'bob-address',
              },
              {
                value: 499000,
                lockingScript: 'alice-address',
              },
            ],
            timestamp: 1640995800000,
            lockTime: 0,
            fee: 1000,
          },
        ],
      },
    ];

    // Create mock node
    mockNode = {
      getBlockchain: vi.fn().mockReturnValue({
        getBlocks: vi.fn().mockReturnValue(mockBlocks),
      }),
    } as any;

    // Create Express app with router
    app = express();
    app.use(express.json());
    app.use('/api/v1', createUTXORouter(mockNode));
  });

  describe('GET /blockchain/address/:address/utxos', () => {
    it('should return UTXOs for an address', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          address: 'alice-address',
          utxos: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              transactionId: expect.any(String),
              outputIndex: expect.any(Number),
              amount: expect.any(String),
              scriptPubKey: 'alice-address',
              blockHeight: expect.any(Number),
              confirmations: expect.any(Number),
            }),
          ]),
          totalBalance: expect.any(String),
          spendableBalance: expect.any(String),
        },
      });
    });

    it('should return only unspent UTXOs for alice', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos')
        .expect(200);

      // Alice should have one unspent UTXO (499000 from tx-2)
      expect(response.body.data.utxos).toHaveLength(1);
      expect(response.body.data.utxos[0].amount).toBe('499000');
      expect(response.body.data.totalBalance).toBe('499000');
      expect(response.body.data.spendableBalance).toBe('499000');
    });

    it('should return empty UTXOs for non-existent address', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/non-existent-address/utxos')
        .expect(200);

      expect(response.body.data.utxos).toHaveLength(0);
      expect(response.body.data.totalBalance).toBe('0');
      expect(response.body.data.spendableBalance).toBe('0');
    });

    it('should respect minValue filter', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos?minValue=1000000')
        .expect(200);

      // Alice's remaining UTXO (499000) is less than minValue
      expect(response.body.data.utxos).toHaveLength(0);
    });

    it('should include spent UTXOs when requested', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos?includeSpent=true')
        .expect(200);

      // Should include both spent and unspent UTXOs
      expect(response.body.data.utxos.length).toBeGreaterThan(0);
    });

    it('should respect pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos?limit=1&offset=0')
        .expect(200);

      expect(response.body.data.utxos.length).toBeLessThanOrEqual(1);
    });

    it('should enforce maximum limit', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/alice-address/utxos?limit=2000')
        .expect(200);

      // Limit should be capped at 1000
      expect(response.body.data.utxos.length).toBeLessThanOrEqual(1000);
    });

    it('should sort UTXOs by value descending', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/address/miner-address/utxos')
        .expect(200);

      if (response.body.data.utxos.length > 1) {
        const amounts = response.body.data.utxos.map(utxo =>
          parseInt(utxo.amount)
        );
        for (let i = 0; i < amounts.length - 1; i++) {
          expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i + 1]);
        }
      }
    });

    it('should require address parameter', async () => {
      await request(app).get('/api/v1/blockchain/address//utxos').expect(404); // Express will return 404 for empty parameter
    });
  });

  describe('GET /blockchain/utxo/:outputId', () => {
    it('should return UTXO details for valid output ID', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/tx-2:1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'tx-2:1',
          transactionId: 'tx-2',
          outputIndex: 1,
          value: 499000,
          lockingScript: 'alice-address',
          blockHeight: 1,
          blockInfo: {
            blockIndex: 1,
            blockHash: 'block-1-hash',
            confirmations: expect.any(Number),
          },
          isSpent: false,
          spentInTransaction: null,
          status: 'unspent',
        },
      });
    });

    it('should return spent UTXO details', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/tx-1:0')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'tx-1:0',
          transactionId: 'tx-1',
          outputIndex: 0,
          isSpent: true,
          spentInTransaction: 'tx-2',
          status: 'spent',
        },
      });
    });

    it('should return 404 for non-existent UTXO', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/non-existent:0')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });

    it('should return 400 for invalid output ID format', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/invalid-format')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
      expect(response.body.error.message).toContain('Invalid UTXO ID format');
    });

    it('should return 400 for invalid output index', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/tx-1:invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
    });

    it('should return 404 for valid format but non-existent transaction', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/non-existent-tx:0')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });

    it('should return 404 for valid transaction but invalid output index', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/utxo/tx-1:999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
    });
  });

  describe('POST /utxo-transactions/build', () => {
    it('should build transaction for sufficient balance', async () => {
      const transaction = {
        fromAddress: 'miner-address',
        toAddress: 'recipient-address',
        amount: '1000000',
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          inputs: expect.arrayContaining([
            expect.objectContaining({
              txId: expect.any(String),
              outputIndex: expect.any(Number),
              value: expect.any(Number),
              lockingScript: expect.any(String),
            }),
          ]),
          outputs: expect.arrayContaining([
            expect.objectContaining({
              value: 1000000,
              lockingScript: 'recipient-address',
            }),
          ]),
          fee: expect.any(Number),
          estimatedSize: expect.any(Number),
          note: 'Transaction ready for signing',
        },
      });
    });

    it('should include change output when necessary', async () => {
      const transaction = {
        fromAddress: 'miner-address',
        toAddress: 'recipient-address',
        amount: '1000000', // Much less than miner's balance
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(200);

      // Should have two outputs: one to recipient, one change back to miner
      expect(response.body.data.outputs).toHaveLength(2);
      expect(response.body.data.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lockingScript: 'miner-address', // Change output
          }),
        ])
      );
    });

    it('should return 400 for insufficient funds', async () => {
      const transaction = {
        fromAddress: 'alice-address',
        toAddress: 'recipient-address',
        amount: '1000000', // More than Alice has
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INSUFFICIENT_FUNDS');
      expect(response.body.error.details).toMatchObject({
        required: expect.any(Number),
        available: expect.any(Number),
      });
    });

    it('should return 400 for address with no UTXOs', async () => {
      const transaction = {
        fromAddress: 'empty-address',
        toAddress: 'recipient-address',
        amount: '1000',
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_NOT_FOUND');
      expect(response.body.error.message).toContain('No UTXOs found');
    });

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send({
          fromAddress: 'test-address',
          // Missing toAddress and amount
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
      expect(response.body.error.message).toContain('required');
    });

    it('should validate positive amount', async () => {
      const transaction = {
        fromAddress: 'test-address',
        toAddress: 'recipient-address',
        amount: '0',
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
      expect(response.body.error.message).toContain('Amount must be positive');
    });

    it('should use default fee rate when not provided', async () => {
      const transaction = {
        fromAddress: 'miner-address',
        toAddress: 'recipient-address',
        amount: '1000000',
        // No feeRate provided
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(200);

      expect(response.body.data.fee).toBeGreaterThan(0);
    });

    it('should optimize UTXO selection', async () => {
      const transaction = {
        fromAddress: 'miner-address',
        toAddress: 'recipient-address',
        amount: '1000000',
        feeRate: '20',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/build')
        .send(transaction)
        .expect(200);

      // Should select UTXOs efficiently (largest first)
      expect(response.body.data.inputs.length).toBeGreaterThan(0);
      const inputValues = response.body.data.inputs.map(input => input.value);
      for (let i = 0; i < inputValues.length - 1; i++) {
        expect(inputValues[i]).toBeGreaterThanOrEqual(inputValues[i + 1]);
      }
    });
  });
});
