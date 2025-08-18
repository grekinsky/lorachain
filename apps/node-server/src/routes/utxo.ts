import { Router, Request, Response } from 'express';
import { LorachainNode } from '@lorachain/node';
import { Logger } from '@lorachain/shared';
import { UTXO, UTXOTransaction } from '@lorachain/core';
import { UTXOAPIResponse, UTXOErrorCode, UTXOSetResponse } from '../types.js';

export function createUTXORouter(nodeServer: LorachainNode): Router {
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

  // Helper function to find UTXOs for an address
  const findUTXOsForAddress = (address: string): UTXO[] => {
    const blockchain = nodeServer.getBlockchain();
    const blocks = blockchain.getBlocks();
    const utxos: UTXO[] = [];
    const spentOutputs = new Set<string>();

    // First pass: collect all spent outputs
    for (const block of blocks) {
      if (block.transactions) {
        for (const tx of block.transactions) {
          const utxoTx = tx as unknown as UTXOTransaction;
          if (utxoTx.inputs) {
            for (const input of utxoTx.inputs) {
              spentOutputs.add(`${input.previousTxId}:${input.outputIndex}`);
            }
          }
        }
      }
    }

    // Second pass: collect unspent outputs for the address
    for (const block of blocks) {
      if (block.transactions) {
        for (const tx of block.transactions) {
          const utxoTx = tx as unknown as UTXOTransaction;
          if (utxoTx.outputs) {
            utxoTx.outputs.forEach((output, outputIndex) => {
              const utxoId = `${utxoTx.id}:${outputIndex}`;

              // Check if this output belongs to the address and is unspent
              if (
                output.lockingScript === address &&
                !spentOutputs.has(utxoId)
              ) {
                utxos.push({
                  txId: utxoTx.id,
                  outputIndex,
                  value: output.value,
                  lockingScript: output.lockingScript,
                  blockHeight: block.index,
                  isSpent: false,
                });
              }
            });
          }
        }
      }
    }

    return utxos;
  };

  // GET /api/v1/blockchain/address/:address/utxos
  router.get(
    '/blockchain/address/:address/utxos',
    (req: Request, res: Response) => {
      try {
        const address = req.params.address;

        if (!address) {
          return res.status(400).json(
            createResponse(null, {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'Address is required',
            })
          );
        }

        // Find all UTXOs for this address
        const utxos = findUTXOsForAddress(address);

        // Parse query parameters for filtering
        const minValue = parseInt(req.query.minValue as string) || 0;
        const includeSpent = req.query.includeSpent === 'true';
        const limit = Math.min(
          parseInt(req.query.limit as string) || 100,
          1000
        );
        const offset = parseInt(req.query.offset as string) || 0;

        // Filter UTXOs
        const filteredUTXOs = utxos.filter(
          utxo => utxo.value >= minValue && (includeSpent || !utxo.isSpent)
        );

        // Sort by value (descending) for better UX
        filteredUTXOs.sort((a, b) => b.value - a.value);

        // Apply pagination
        const paginatedUTXOs = filteredUTXOs.slice(offset, offset + limit);

        // Calculate balances
        const totalBalance = filteredUTXOs.reduce(
          (sum, utxo) => sum + utxo.value,
          0
        );
        const spendableBalance = filteredUTXOs
          .filter(utxo => !utxo.isSpent)
          .reduce((sum, utxo) => sum + utxo.value, 0);

        // Get current blockchain height for confirmations
        const blockchain = nodeServer.getBlockchain();
        const currentHeight = blockchain.getBlocks().length;

        const response: UTXOSetResponse = {
          address,
          utxos: paginatedUTXOs.map(utxo => ({
            id: `${utxo.txId}:${utxo.outputIndex}`,
            transactionId: utxo.txId,
            outputIndex: utxo.outputIndex,
            amount: utxo.value.toString(),
            scriptPubKey: utxo.lockingScript,
            blockHeight: utxo.blockHeight,
            confirmations: currentHeight - utxo.blockHeight,
          })),
          totalBalance: totalBalance.toString(),
          spendableBalance: spendableBalance.toString(),
        };

        res.json(createResponse(response));
      } catch (error) {
        logger.error('Error getting UTXOs for address', {
          error,
          address: req.params.address,
        });
        res.status(500).json(createResponse(null, error));
      }
    }
  );

  // GET /api/v1/blockchain/utxo/:outputId
  router.get('/blockchain/utxo/:outputId', (req: Request, res: Response) => {
    try {
      const outputId = req.params.outputId;

      // Parse outputId (format: txId:outputIndex)
      const [txId, outputIndexStr] = outputId.split(':');
      const outputIndex = parseInt(outputIndexStr);

      if (!txId || isNaN(outputIndex)) {
        return res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'Invalid UTXO ID format. Expected: txId:outputIndex',
          })
        );
      }

      const blockchain = nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      let foundUTXO = null;
      let blockInfo = null;
      let isSpent = false;
      let spentInTx = null;

      // Find the transaction and output
      for (const block of blocks) {
        if (block.transactions) {
          // Check if this UTXO exists
          const sourceTx = block.transactions.find(tx => tx.id === txId);
          if (sourceTx) {
            const utxoSourceTx = sourceTx as unknown as UTXOTransaction;
            if (utxoSourceTx.outputs && utxoSourceTx.outputs[outputIndex]) {
              const output = utxoSourceTx.outputs[outputIndex];
              blockInfo = {
                blockIndex: block.index,
                blockHash: block.hash,
                confirmations: blocks.length - block.index,
              };

              foundUTXO = {
                txId,
                outputIndex,
                value: output.value,
                lockingScript: output.lockingScript,
                blockHeight: block.index,
                isSpent: false,
              };
            }
          }

          // Check if this UTXO has been spent
          for (const tx of block.transactions) {
            const utxoTx = tx as unknown as UTXOTransaction;
            if (utxoTx.inputs) {
              const spendingInput = utxoTx.inputs.find(
                input =>
                  input.previousTxId === txId &&
                  input.outputIndex === outputIndex
              );
              if (spendingInput) {
                isSpent = true;
                spentInTx = utxoTx.id;
                break;
              }
            }
          }

          if (foundUTXO && isSpent) break;
        }
      }

      if (!foundUTXO) {
        return res.status(404).json(
          createResponse(null, {
            code: UTXOErrorCode.UTXO_NOT_FOUND,
            message: 'UTXO not found',
          })
        );
      }

      foundUTXO.isSpent = isSpent;

      const utxoData = {
        id: outputId,
        transactionId: foundUTXO.txId,
        outputIndex: foundUTXO.outputIndex,
        value: foundUTXO.value,
        lockingScript: foundUTXO.lockingScript,
        blockHeight: foundUTXO.blockHeight,
        blockInfo,
        isSpent,
        spentInTransaction: spentInTx,
        status: isSpent ? 'spent' : 'unspent',
      };

      res.json(createResponse(utxoData));
    } catch (error) {
      logger.error('Error getting UTXO', {
        error,
        outputId: req.params.outputId,
      });
      res.status(500).json(createResponse(null, error));
    }
  });

  // POST /api/v1/utxo-transactions/build
  router.post('/utxo-transactions/build', (req: Request, res: Response) => {
    try {
      const { fromAddress, toAddress, amount, feeRate } = req.body;

      if (!fromAddress || !toAddress || !amount) {
        return res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'fromAddress, toAddress, and amount are required',
          })
        );
      }

      const targetAmount = parseInt(amount);
      const targetFeeRate = parseInt(feeRate) || 20; // satoshis per byte

      if (targetAmount <= 0) {
        return res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'Amount must be positive',
          })
        );
      }

      // Get available UTXOs for the from address
      const availableUTXOs = findUTXOsForAddress(fromAddress);

      if (availableUTXOs.length === 0) {
        return res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.UTXO_NOT_FOUND,
            message: 'No UTXOs found for the source address',
          })
        );
      }

      // Sort UTXOs by value (descending) for optimal selection
      availableUTXOs.sort((a, b) => b.value - a.value);

      // Select UTXOs to cover the amount + estimated fee
      const selectedUTXOs = [];
      let totalInputValue = 0;
      const estimatedTxSize = 150 + availableUTXOs.length * 150 + 2 * 34; // Rough estimate
      const estimatedFee = Math.ceil(estimatedTxSize * targetFeeRate);

      for (const utxo of availableUTXOs) {
        selectedUTXOs.push(utxo);
        totalInputValue += utxo.value;

        if (totalInputValue >= targetAmount + estimatedFee) {
          break;
        }
      }

      if (totalInputValue < targetAmount + estimatedFee) {
        return res.status(400).json(
          createResponse(null, {
            code: UTXOErrorCode.INSUFFICIENT_FUNDS,
            message: 'Insufficient funds',
            details: {
              required: targetAmount + estimatedFee,
              available: totalInputValue,
            },
          })
        );
      }

      // Build inputs
      const inputs = selectedUTXOs.map(utxo => ({
        txId: utxo.txId,
        outputIndex: utxo.outputIndex,
        value: utxo.value,
        lockingScript: utxo.lockingScript,
      }));

      // Build outputs
      const outputs = [
        {
          value: targetAmount,
          lockingScript: toAddress,
        },
      ];

      // Add change output if necessary
      const change = totalInputValue - targetAmount - estimatedFee;
      if (change > 546) {
        // Dust threshold
        outputs.push({
          value: change,
          lockingScript: fromAddress,
        });
      }

      const transaction = {
        inputs,
        outputs,
        fee:
          totalInputValue -
          outputs.reduce((sum, output) => sum + output.value, 0),
        estimatedSize: estimatedTxSize,
        note: 'Transaction ready for signing',
      };

      res.json(createResponse(transaction));
    } catch (error) {
      logger.error('Error building transaction', { error });
      res.status(500).json(createResponse(null, error));
    }
  });

  return router;
}
