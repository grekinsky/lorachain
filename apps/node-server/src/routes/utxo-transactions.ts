import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { LorachainNode } from '@lorachain/node';
import { Logger } from '@lorachain/shared';
import { UTXOTransaction } from '@lorachain/core';
import { UTXOAPIResponse, UTXOErrorCode } from '../types.js';

export function createUTXOTransactionRouter(nodeServer: LorachainNode): Router {
  const router = Router();
  const logger = Logger.getInstance();

  // Helper function to create standardized API responses
  const createResponse = <T>(data?: T, error?: any): UTXOAPIResponse<T> => {
    return {
      success: !error,
      data,
      error: error
        ? {
            code: error.code || UTXOErrorCode.INTERNAL_ERROR,
            message: error.message || 'Internal error',
            details: error.details,
          }
        : undefined,
      timestamp: Date.now(),
      chainId: 'lorachain-mainnet',
      version: '1.0.0',
    };
  };

  // POST /api/v1/utxo-transactions/submit
  router.post(
    '/submit',
    [
      body('inputs').isArray().withMessage('Inputs must be an array'),
      body('outputs').isArray().withMessage('Outputs must be an array'),
      body('signature').notEmpty().withMessage('Signature is required'),
    ],
    (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(
            createResponse(null, {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'Validation failed',
              details: errors.array(),
            })
          );
        }

        const { inputs, outputs } = req.body;

        // Basic validation
        if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
          return res.status(400).json(
            createResponse(null, {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'Transaction must have at least one input',
            })
          );
        }

        if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
          return res.status(400).json(
            createResponse(null, {
              code: UTXOErrorCode.INVALID_OUTPUT,
              message: 'Transaction must have at least one output',
            })
          );
        }

        // Create UTXO transaction object
        const transaction: UTXOTransaction = {
          id: `tx_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          inputs,
          outputs,
          lockTime: 0,
          timestamp: Date.now(),
          fee:
            inputs.reduce((sum, input) => sum + (input.value || 0), 0) -
            outputs.reduce((sum, output) => sum + output.value, 0),
        };

        // Add transaction to blockchain (this will validate and add to mempool)
        const blockchain = nodeServer.getBlockchain();
        blockchain.addTransaction(transaction);

        logger.info('UTXO transaction submitted', {
          txId: transaction.id,
          inputCount: inputs.length,
          outputCount: outputs.length,
        });

        res.json(
          createResponse({
            transactionId: transaction.id,
            status: 'pending',
            inputCount: inputs.length,
            outputCount: outputs.length,
            fee: transaction.fee,
            timestamp: transaction.timestamp,
          })
        );
      } catch (error) {
        logger.error('Error submitting UTXO transaction', { error });

        // Map specific blockchain errors to UTXO error codes
        let errorCode = UTXOErrorCode.INTERNAL_ERROR;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('double spend')) {
          errorCode = UTXOErrorCode.DOUBLE_SPEND;
        } else if (errorMessage.includes('insufficient')) {
          errorCode = UTXOErrorCode.INSUFFICIENT_FUNDS;
        } else if (errorMessage.includes('signature')) {
          errorCode = UTXOErrorCode.INVALID_SIGNATURE;
        }

        res.status(400).json(
          createResponse(null, {
            code: errorCode,
            message: errorMessage,
          })
        );
      }
    }
  );

  // GET /api/v1/utxo-transactions/pending
  router.get('/pending', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const pendingTxs = blockchain.getPendingTransactions();

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      // Get paginated pending transactions
      const paginatedTxs = pendingTxs.slice(offset, offset + limit).map(tx => ({
        id: tx.id,
        inputs: tx.inputs,
        outputs: tx.outputs,
        timestamp: tx.timestamp,
        fee: tx.fee,
        size: JSON.stringify(tx).length,
      }));

      res.json(
        createResponse({
          transactions: paginatedTxs,
          total: pendingTxs.length,
          limit,
          offset,
        })
      );
    } catch (error) {
      logger.error('Error getting pending transactions', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/utxo-transactions/mempool/stats
  router.get('/mempool/stats', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const pendingTxs = blockchain.getPendingTransactions();

      // Calculate mempool statistics
      const totalSize = pendingTxs.reduce(
        (size, tx) => size + JSON.stringify(tx).length,
        0
      );

      const totalFees = pendingTxs.reduce(
        (fees, tx) => fees + (tx.fee || 0),
        0
      );

      const averageFee =
        pendingTxs.length > 0 ? totalFees / pendingTxs.length : 0;

      // Fee distribution
      const feeRanges = {
        low: pendingTxs.filter(tx => (tx.fee || 0) < 1000).length,
        medium: pendingTxs.filter(
          tx => (tx.fee || 0) >= 1000 && (tx.fee || 0) < 5000
        ).length,
        high: pendingTxs.filter(tx => (tx.fee || 0) >= 5000).length,
      };

      const stats = {
        transactionCount: pendingTxs.length,
        totalSize,
        totalFees,
        averageFee,
        feeDistribution: feeRanges,
        oldestTransaction:
          pendingTxs.length > 0
            ? Math.min(...pendingTxs.map(tx => tx.timestamp))
            : null,
        newestTransaction:
          pendingTxs.length > 0
            ? Math.max(...pendingTxs.map(tx => tx.timestamp))
            : null,
        estimatedClearTime: Math.ceil(pendingTxs.length / 10) * 5, // Rough estimate in minutes
      };

      res.json(createResponse(stats));
    } catch (error) {
      logger.error('Error getting mempool stats', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // POST /api/v1/utxo-transactions/validate
  router.post(
    '/validate',
    [
      body('inputs').isArray().withMessage('Inputs must be an array'),
      body('outputs').isArray().withMessage('Outputs must be an array'),
    ],
    (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(
            createResponse(null, {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'Validation failed',
              details: errors.array(),
            })
          );
        }

        const { inputs, outputs } = req.body;

        // Create temporary transaction for validation
        const tempTx: UTXOTransaction = {
          id: `temp_${Date.now()}`,
          inputs,
          outputs,
          lockTime: 0,
          timestamp: Date.now(),
          fee: 0,
        };

        // Validate transaction structure
        const validationResults = {
          isValid: true,
          errors: [] as string[],
          warnings: [] as string[],
        };

        // Basic structure validation
        if (!inputs || inputs.length === 0) {
          validationResults.isValid = false;
          validationResults.errors.push(
            'Transaction must have at least one input'
          );
        }

        if (!outputs || outputs.length === 0) {
          validationResults.isValid = false;
          validationResults.errors.push(
            'Transaction must have at least one output'
          );
        }

        // Input validation
        inputs.forEach((input: any, index: number) => {
          if (!input.txId) {
            validationResults.errors.push(`Input ${index}: txId is required`);
            validationResults.isValid = false;
          }
          if (typeof input.outputIndex !== 'number') {
            validationResults.errors.push(
              `Input ${index}: outputIndex must be a number`
            );
            validationResults.isValid = false;
          }
        });

        // Output validation
        outputs.forEach((output: any, index: number) => {
          if (!output.value || output.value <= 0) {
            validationResults.errors.push(
              `Output ${index}: value must be positive`
            );
            validationResults.isValid = false;
          }
          if (!output.lockingScript) {
            validationResults.errors.push(
              `Output ${index}: lockingScript is required`
            );
            validationResults.isValid = false;
          }
        });

        // Calculate transaction metrics
        const totalInputValue = inputs.reduce(
          (sum: number, input: any) => sum + (input.value || 0),
          0
        );
        const totalOutputValue = outputs.reduce(
          (sum: number, output: any) => sum + (output.value || 0),
          0
        );
        const calculatedFee = totalInputValue - totalOutputValue;

        if (calculatedFee < 0) {
          validationResults.errors.push(
            'Total output value exceeds input value'
          );
          validationResults.isValid = false;
        }

        if (calculatedFee < 1000) {
          // Minimum fee of 1000 satoshis
          validationResults.warnings.push(
            'Transaction fee is very low, may not be processed quickly'
          );
        }

        res.json(
          createResponse({
            ...validationResults,
            transactionId: tempTx.id,
            fee: calculatedFee,
            size: JSON.stringify(tempTx).length,
            inputCount: inputs.length,
            outputCount: outputs.length,
          })
        );
      } catch (error) {
        logger.error('Error validating transaction', { error });
        res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.INVALID_INPUT,
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
  );

  // GET /api/v1/utxo-transactions/fee-estimate
  router.get('/fee-estimate', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const pendingTxs = blockchain.getPendingTransactions();

      // Calculate fee estimates based on mempool and recent blocks
      const recentBlocks = blockchain.getBlocks().slice(-10);
      const recentTxs = recentBlocks.flatMap(block => block.transactions || []);

      // Calculate fee rates (satoshis per byte)
      const feeRates = [...pendingTxs, ...recentTxs]
        .filter(tx => tx.fee && tx.fee > 0)
        .map(tx => {
          const size = JSON.stringify(tx).length;
          return (tx.fee || 0) / size;
        })
        .sort((a, b) => a - b);

      const estimates = {
        slow: {
          satoshisPerByte: feeRates[Math.floor(feeRates.length * 0.1)] || 10,
          estimatedBlocks: 10,
          estimatedMinutes: 50,
        },
        medium: {
          satoshisPerByte: feeRates[Math.floor(feeRates.length * 0.5)] || 20,
          estimatedBlocks: 5,
          estimatedMinutes: 25,
        },
        fast: {
          satoshisPerByte: feeRates[Math.floor(feeRates.length * 0.9)] || 50,
          estimatedBlocks: 1,
          estimatedMinutes: 5,
        },
      };

      // Add transaction size estimates
      const inputSize = req.query.inputs
        ? parseInt(req.query.inputs as string) * 150
        : 150;
      const outputSize = req.query.outputs
        ? parseInt(req.query.outputs as string) * 34
        : 68;
      const estimatedSize = inputSize + outputSize + 10; // Base transaction size

      const feeEstimates = {
        slow: Math.ceil(estimates.slow.satoshisPerByte * estimatedSize),
        medium: Math.ceil(estimates.medium.satoshisPerByte * estimatedSize),
        fast: Math.ceil(estimates.fast.satoshisPerByte * estimatedSize),
      };

      res.json(
        createResponse({
          estimates,
          feeEstimates,
          estimatedTransactionSize: estimatedSize,
          mempoolSize: pendingTxs.length,
          lastUpdated: Date.now(),
        })
      );
    } catch (error) {
      logger.error('Error calculating fee estimates', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/utxo-transactions/:id
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const transactionId = req.params.id;
      const blockchain = nodeServer.getBlockchain();

      // Search in pending transactions first
      const pendingTxs = blockchain.getPendingTransactions();
      let transaction = pendingTxs.find(tx => tx.id === transactionId);
      let blockInfo = null;

      // If not found in pending, search in blocks
      if (!transaction) {
        const blocks = blockchain.getBlocks();
        for (const block of blocks) {
          const found = block.transactions?.find(tx => tx.id === transactionId);
          if (found) {
            transaction = found as unknown as UTXOTransaction;
            blockInfo = {
              blockIndex: block.index,
              blockHash: block.hash,
              confirmations: blocks.length - block.index,
            };
            break;
          }
        }
      }

      if (!transaction) {
        return res.status(404).json(
          createResponse(null, {
            code: UTXOErrorCode.UTXO_NOT_FOUND,
            message: 'Transaction not found',
          })
        );
      }

      const txData = {
        id: transaction.id,
        inputs: transaction.inputs,
        outputs: transaction.outputs,
        timestamp: transaction.timestamp,
        fee: transaction.fee,
        // signature: included in input unlockingScripts,
        size: JSON.stringify(transaction).length,
        status: blockInfo ? 'confirmed' : 'pending',
        blockInfo,
      };

      res.json(createResponse(txData));
    } catch (error) {
      logger.error('Error getting transaction', { error, txId: req.params.id });
      res.status(500).json(createResponse(null, error));
    }
  });

  return router;
}
