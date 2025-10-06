/**
 * Unit tests for UTXOTransactionMessageHandler
 *
 * Tests transaction broadcast and request handling, validation,
 * deduplication, and flooding protocol.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UTXOTransactionMessageHandler } from '../../src/utxo-transaction-message-handler.js';
import { BlockchainMessageType } from '../../src/blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
} from '../../src/blockchain-message-interfaces.js';
import type { UTXOTransaction, UTXO } from '../../src/types.js';

describe('UTXOTransactionMessageHandler', () => {
  let handler: UTXOTransactionMessageHandler;
  let mockCryptoService: any;
  let mockContext: BlockchainMessageContext;
  let mockTransaction: UTXOTransaction;

  beforeEach(() => {
    // Mock cryptographic service
    mockCryptoService = {
      verifySignature: vi.fn().mockResolvedValue(true),
    };

    // Create handler
    handler = new UTXOTransactionMessageHandler(mockCryptoService, 15);

    // Mock transaction
    mockTransaction = {
      id: 'tx1',
      inputs: [
        {
          previousTxId: 'prev1',
          outputIndex: 0,
          unlockingScript: 'sig1 key1', // Contains signature and public key
          sequence: 0xffffffff,
        },
      ],
      outputs: [
        {
          value: 100,
          lockingScript: 'addr1',
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    };

    // Mock context
    mockContext = {
      blockchain: {
        getPendingTransactions: vi.fn().mockReturnValue([]),
        addTransaction: vi.fn().mockResolvedValue(undefined),
        getBlocks: vi.fn().mockReturnValue([]),
      },
      utxoManager: {
        getUTXO: vi.fn().mockReturnValue({
          txId: 'prev1',
          outputIndex: 0,
          value: 100,
          lockingScript: 'addr1',
          isSpent: false,
          blockHeight: 1,
        } as UTXO),
      },
      peers: {} as any,
      protocol: {} as any,
      syncManager: {} as any,
    };
  });

  afterEach(() => {
    // Cleanup interval
    handler.stopPropagationCleanup();
  });

  describe('canHandle', () => {
    it('should handle UTXO_TRANSACTION_BROADCAST messages', () => {
      expect(
        handler.canHandle(BlockchainMessageType.UTXO_TRANSACTION_BROADCAST)
      ).toBe(true);
    });

    it('should handle UTXO_TRANSACTION_REQUEST messages', () => {
      expect(
        handler.canHandle(BlockchainMessageType.UTXO_TRANSACTION_REQUEST)
      ).toBe(true);
    });

    it('should not handle BLOCK_ANNOUNCEMENT messages', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_ANNOUNCEMENT)).toBe(
        false
      );
    });

    it('should not handle other message types', () => {
      expect(handler.canHandle(BlockchainMessageType.BLOCK_REQUEST)).toBe(
        false
      );
    });
  });

  describe('getHandlerPriority', () => {
    it('should return correct priority', () => {
      expect(handler.getHandlerPriority()).toBe(15);
    });

    it('should allow custom priority', () => {
      const customHandler = new UTXOTransactionMessageHandler(
        mockCryptoService,
        20
      );
      expect(customHandler.getHandlerPriority()).toBe(20);
      customHandler.stopPropagationCleanup();
    });
  });

  describe('handleTransactionBroadcast', () => {
    it('should add valid transaction to mempool', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.blockchain.addTransaction).toHaveBeenCalledWith(
        mockTransaction
      );
      expect(result.forwardToPeers).toBe(true);
    });

    it('should reject duplicate propagation', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      // First broadcast
      await handler.handle(message, mockContext);

      // Duplicate broadcast
      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.blockchain.addTransaction).toHaveBeenCalledTimes(1);
      expect(result.forwardToPeers).toBeUndefined();
    });

    it('should reject transaction with missing ID', async () => {
      const invalidTx = { ...mockTransaction, id: '' };
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: invalidTx,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction ID is required');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject transaction with no inputs', async () => {
      const invalidTx = { ...mockTransaction, inputs: [] };
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: invalidTx,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one input');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject transaction with no outputs', async () => {
      const invalidTx = { ...mockTransaction, outputs: [] };
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: invalidTx,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one output');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });


    it('should reject transaction with missing unlockingScript', async () => {
      const invalidTx = {
        ...mockTransaction,
        inputs: [{ ...mockTransaction.inputs[0], unlockingScript: '' }],
      };

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: invalidTx,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject transaction with non-existent UTXO', async () => {
      mockContext.utxoManager.getUTXO = vi.fn().mockReturnValue(null);

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid UTXO inputs');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject transaction with spent UTXO', async () => {
      mockContext.utxoManager.getUTXO = vi.fn().mockReturnValue({
        txId: 'prev1',
        outputIndex: 0,
        value: 100,
        lockingScript: 'addr1',
        isSpent: true, // Already spent
        blockHeight: 1,
      } as UTXO);

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid UTXO inputs');
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should skip adding transaction if already in mempool', async () => {
      mockContext.blockchain.getPendingTransactions = vi
        .fn()
        .mockReturnValue([mockTransaction]);

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.blockchain.addTransaction).not.toHaveBeenCalled();
    });

    it('should reject message with missing metadata', async () => {
      const message = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction: mockTransaction,
            propagationId: 'prop1',
            timestamp: Date.now(),
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: undefined,
      } as any;

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('metadata is required');
    });
  });

  describe('handleTransactionRequest', () => {
    it('should return transaction from mempool', async () => {
      mockContext.blockchain.getPendingTransactions = vi
        .fn()
        .mockReturnValue([mockTransaction]);

      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_REQUEST,
        payload: {
          data: {
            transactionId: 'tx1',
            requestId: 'req1',
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(true);
      expect(result.responseMessage).toBeDefined();
      expect(result.responseMessage?.type).toBe(
        BlockchainMessageType.UTXO_TRANSACTION_BROADCAST
      );
    });


    it('should return error if transaction not found', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_REQUEST,
        payload: {
          data: {
            transactionId: 'nonexistent',
            requestId: 'req1',
          },
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });
  });

  describe('unsupported message types', () => {
    it('should reject unsupported message type', async () => {
      const message: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
        payload: {
          data: {},
          version: '1.0.0',
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: 'peer1',
          hopCount: 1,
          signature: 'sig',
          nonce: 'nonce1',
        },
      };

      const result = await handler.handle(message, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported message type');
    });
  });
});
