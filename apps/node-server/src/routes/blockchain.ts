import { Router, Request, Response } from 'express';
import { LorachainNode } from '@lorachain/node';
import { Logger } from '@lorachain/shared';
import { UTXOTransaction } from '@lorachain/core';
import { UTXOAPIResponse, UTXOErrorCode, BlockchainInfo } from '../types.js';

export function createBlockchainRouter(nodeServer: LorachainNode): Router {
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
          }
        : undefined,
      timestamp: Date.now(),
      chainId: 'lorachain-mainnet',
      version: '1.0.0',
    };
  };

  // GET /api/v1/blockchain/info
  router.get('/info', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      const latestBlock = blocks[blocks.length - 1];

      const info: BlockchainInfo = {
        height: blocks.length,
        latestBlockHash: latestBlock?.hash || '',
        difficulty: blockchain.getDifficulty(),
        targetDifficulty: blockchain.getDifficulty(), // TODO: Add getTargetDifficulty when available
        networkHashRate: 0, // TODO: Implement when DifficultyManager is available
        totalUTXOs: 0, // TODO: Implement when UTXOManager is available
        totalSupply: '0', // TODO: Implement supply calculation
        averageBlockTime: 300000, // 5 minutes in milliseconds (default)
        nextDifficultyAdjustment: Math.ceil(blocks.length / 10) * 10, // Next 10-block boundary
      };

      res.json(createResponse(info));
    } catch (error) {
      logger.error('Error getting blockchain info', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/blockchain/blocks
  router.get('/blocks', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      // Get paginated blocks
      const paginatedBlocks = blocks
        .slice()
        .reverse() // Latest first
        .slice(offset, offset + limit)
        .map(block => ({
          index: block.index,
          hash: block.hash,
          previousHash: block.previousHash,
          timestamp: block.timestamp,
          nonce: block.nonce,
          difficulty: block.difficulty,
          transactionCount: block.transactions?.length || 0,
          merkleRoot: block.merkleRoot,
        }));

      res.json(
        createResponse({
          blocks: paginatedBlocks,
          total: blocks.length,
          limit,
          offset,
        })
      );
    } catch (error) {
      logger.error('Error getting blocks', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/blockchain/blocks/:index
  router.get('/blocks/:index', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      const index = parseInt(req.params.index);

      if (isNaN(index) || index < 0 || index >= blocks.length) {
        return res.status(404).json(
          createResponse(null, {
            code: UTXOErrorCode.UTXO_NOT_FOUND,
            message: 'Block not found',
          })
        );
      }

      const block = blocks[index];
      const blockData = {
        index: block.index,
        hash: block.hash,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        nonce: block.nonce,
        difficulty: block.difficulty,
        transactions: block.transactions || [],
        merkleRoot: block.merkleRoot,
        size: JSON.stringify(block).length, // Approximate size
      };

      res.json(createResponse(blockData));
    } catch (error) {
      logger.error('Error getting block by index', {
        error,
        index: req.params.index,
      });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/blockchain/blocks/:index/utxo-transactions
  router.get(
    '/blocks/:index/utxo-transactions',
    (req: Request, res: Response) => {
      try {
        const blockchain = nodeServer.getBlockchain();
        const blocks = blockchain.getBlocks();
        const index = parseInt(req.params.index);

        if (isNaN(index) || index < 0 || index >= blocks.length) {
          return res.status(404).json(
            createResponse(null, {
              code: UTXOErrorCode.UTXO_NOT_FOUND,
              message: 'Block not found',
            })
          );
        }

        const block = blocks[index];
        const transactions = block.transactions || [];

        // Cast to UTXO transactions (all transactions in this system are UTXO)
        const utxoTransactions = transactions.map(tx => {
          const utxoTx = tx as unknown as UTXOTransaction;
          return {
            id: utxoTx.id,
            inputs: utxoTx.inputs || [],
            outputs: utxoTx.outputs || [],
            timestamp: utxoTx.timestamp,
            lockTime: utxoTx.lockTime,
            fee: utxoTx.fee,
            blockIndex: index,
            blockHash: block.hash,
          };
        });

        res.json(
          createResponse({
            transactions: utxoTransactions,
            blockIndex: index,
            blockHash: block.hash,
            count: utxoTransactions.length,
          })
        );
      } catch (error) {
        logger.error('Error getting block transactions', {
          error,
          index: req.params.index,
        });
        res.status(500).json(createResponse(null, error));
      }
    }
  );

  // GET /api/v1/blockchain/stats
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      const pendingTxs = blockchain.getPendingTransactions();

      const stats = {
        blockHeight: blocks.length,
        pendingTransactions: pendingTxs.length,
        totalTransactions: blocks.reduce(
          (total, block) => total + (block.transactions?.length || 0),
          0
        ),
        difficulty: blockchain.getDifficulty(),
        miningReward: blockchain.getMiningReward(),
        averageBlockTime: 300000, // 5 minutes default
        networkHashRate: 0, // TODO: Calculate from difficulty
        mempoolSize: pendingTxs.length,
        lastBlockTime: blocks[blocks.length - 1]?.timestamp || 0,
      };

      res.json(createResponse(stats));
    } catch (error) {
      logger.error('Error getting blockchain stats', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/blockchain/difficulty
  router.get('/difficulty', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      const currentDifficulty = blockchain.getDifficulty();

      const difficultyData = {
        current: currentDifficulty,
        target: currentDifficulty, // TODO: Add getTargetDifficulty when available
        adjustment: {
          nextAdjustmentAt: Math.ceil(blocks.length / 10) * 10,
          blocksUntilAdjustment:
            Math.ceil(blocks.length / 10) * 10 - blocks.length,
          lastAdjustmentAt: Math.floor(blocks.length / 10) * 10,
        },
        history: blocks.slice(-10).map(block => ({
          blockIndex: block.index,
          difficulty: block.difficulty,
          timestamp: block.timestamp,
        })),
      };

      res.json(createResponse(difficultyData));
    } catch (error) {
      logger.error('Error getting difficulty info', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  // GET /api/v1/blockchain/hashrate
  router.get('/hashrate', (req: Request, res: Response) => {
    try {
      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();

      // Calculate estimated network hashrate
      // This is a simplified calculation - in production, use DifficultyManager
      const recentBlocks = blocks.slice(-10);
      let totalHashrate = 0;

      if (recentBlocks.length > 1) {
        for (let i = 1; i < recentBlocks.length; i++) {
          const block = recentBlocks[i];
          const previousBlock = recentBlocks[i - 1];
          const timeDiff = (block.timestamp - previousBlock.timestamp) / 1000; // seconds

          if (timeDiff > 0) {
            // Simplified hashrate calculation: difficulty / time
            totalHashrate += block.difficulty / timeDiff;
          }
        }
      }

      const averageHashrate =
        recentBlocks.length > 1 ? totalHashrate / (recentBlocks.length - 1) : 0;

      const hashrateData = {
        current: averageHashrate,
        unit: 'hashes/second',
        networkDifficulty: blockchain.getDifficulty(),
        estimatedMiners: Math.max(1, Math.floor(averageHashrate / 1000000)), // Rough estimate
        lastUpdated: Date.now(),
        calculationPeriod: recentBlocks.length,
      };

      res.json(createResponse(hashrateData));
    } catch (error) {
      logger.error('Error calculating hashrate', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  return router;
}
