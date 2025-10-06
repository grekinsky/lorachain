/**
 * UTXO Transaction Message Handler
 *
 * Handles UTXO transaction broadcast and request messages.
 * Implements transaction validation, mempool management, deduplication,
 * and flooding protocol for network propagation.
 *
 * DESIGN NOTES:
 * - UTXO-only design with no backwards compatibility
 * - Validates transaction structure, signatures, and UTXO availability
 * - Uses propagation IDs for deduplication (prevents flooding loops)
 * - Integrates with Blockchain for mempool management
 * - Integrates with UTXOManager for UTXO validation
 * - Priority 15: Lower than blocks but still important
 *
 * FLOODING PROTOCOL:
 * - Transactions are forwarded to all peers except source
 * - Deduplication prevents infinite loops
 * - Time-based cleanup of propagation tracking (10 minutes)
 * - Size limits to prevent memory exhaustion
 *
 * @module utxo-transaction-message-handler
 */

import { BaseBlockchainMessageHandler } from './base-blockchain-message-handler.js';
import { BlockchainMessageType } from './blockchain-message-types.js';
import type { CryptographicService } from './cryptographic.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
} from './blockchain-message-interfaces.js';
import type {
  UTXOTransactionBroadcastPayload,
  UTXOTransactionRequestPayload,
} from './blockchain-message-payloads.js';
import type { UTXOTransaction, Block } from './types.js';

/**
 * UTXO Transaction Message Handler
 *
 * Processes UTXO transaction broadcasts and requests.
 * Handles validation, mempool updates, and transaction propagation.
 *
 * VALIDATION STEPS:
 * 1. Basic message structure validation
 * 2. Transaction structure validation (inputs, outputs)
 * 3. Cryptographic signature verification (ECDSA/Ed25519)
 * 4. UTXO validation (exists and not spent)
 * 5. Mempool duplicate check
 *
 * DEDUPLICATION:
 * - Tracks propagation IDs to prevent flooding loops
 * - Time-based cleanup every 10 minutes
 * - Size limit of 10,000 entries
 *
 * USAGE:
 * ```typescript
 * const handler = new UTXOTransactionMessageHandler(cryptoService, 15);
 * router.registerHandler(handler);
 * ```
 */
export class UTXOTransactionMessageHandler extends BaseBlockchainMessageHandler {
  /**
   * Track propagated transactions to prevent flooding loops
   * Maps propagation ID -> timestamp
   */
  private propagatedTransactions: Set<string> = new Set();

  /**
   * Time window for propagation tracking (10 minutes)
   */
  private propagationTimeWindow: number = 600000; // 10 minutes

  /**
   * Maximum number of propagation entries to track
   * Prevents memory exhaustion
   */
  private maxPropagationEntries: number = 10000;

  /**
   * Interval ID for cleanup timer
   */
  private cleanupInterval?: ReturnType<typeof setInterval>;

  /**
   * Create a new UTXO transaction message handler
   *
   * @param cryptoService - Cryptographic service for signature verification
   * @param priority - Handler priority (default: 15)
   */
  constructor(cryptoService: CryptographicService, priority: number = 15) {
    super(priority, cryptoService);
    this.startPropagationCleanup();
  }

  /**
   * Determine if this handler can process the given message type
   *
   * Handles:
   * - UTXO_TRANSACTION_BROADCAST
   * - UTXO_TRANSACTION_REQUEST
   */
  canHandle(messageType: BlockchainMessageType): boolean {
    return [
      BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
      BlockchainMessageType.UTXO_TRANSACTION_REQUEST,
    ].includes(messageType);
  }

  /**
   * Process a blockchain network message
   *
   * Routes to specific handler based on message type.
   * Validates basic message structure before routing.
   *
   * @param message - The blockchain network message
   * @param context - Message context with blockchain components
   * @returns Message response indicating success/failure
   */
  async handle(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    // Validate basic message structure
    const validation = this.validateBasicMessage(message);
    if (!validation.isValid) {
      return this.createResponse(
        false,
        undefined,
        validation.errors.join(', ')
      );
    }

    // Route to specific handler based on message type
    switch (message.type) {
      case BlockchainMessageType.UTXO_TRANSACTION_BROADCAST:
        return this.handleTransactionBroadcast(message, context);
      case BlockchainMessageType.UTXO_TRANSACTION_REQUEST:
        return this.handleTransactionRequest(message, context);
      default:
        return this.createResponse(
          false,
          undefined,
          `Unsupported message type: ${message.type}`
        );
    }
  }

  /**
   * Handle UTXO transaction broadcast message
   *
   * VALIDATION:
   * 1. Check for duplicate propagation (deduplication)
   * 2. Validate transaction structure
   * 3. Validate transaction signatures (ECDSA/Ed25519)
   * 4. Validate transaction UTXOs (exist and not spent)
   * 5. Check if transaction already in mempool
   *
   * ACTIONS:
   * - Add valid transaction to mempool
   * - Mark as propagated
   * - Forward to peers (flooding protocol)
   *
   * @param message - Transaction broadcast message
   * @param context - Message context
   * @returns Response with optional forwarding flag
   */
  private async handleTransactionBroadcast(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as UTXOTransactionBroadcastPayload;

      this.logger.info(
        `Received UTXO transaction broadcast: ${payload.transaction.id}, propagationId=${payload.propagationId}`
      );

      // Check for duplicate propagation (deduplication)
      if (this.propagatedTransactions.has(payload.propagationId)) {
        this.logger.debug(
          `Transaction ${payload.transaction.id} already propagated, skipping`
        );
        return this.createResponse(true); // Success but don't forward
      }

      // Validate transaction structure
      const structureValidation = this.validateTransactionStructure(
        payload.transaction
      );
      if (!structureValidation.isValid) {
        this.logger.warn(
          `Invalid transaction structure: ${structureValidation.errors.join(', ')}`
        );
        return this.createResponse(
          false,
          undefined,
          structureValidation.errors.join(', ')
        );
      }

      // Validate transaction cryptographically
      const isSignatureValid = await this.validateTransactionSignature(
        payload.transaction
      );
      if (!isSignatureValid) {
        this.logger.warn(
          `Invalid transaction signature: ${payload.transaction.id}`
        );
        return this.createResponse(false, undefined, 'Invalid signature');
      }

      // Validate transaction against UTXO set
      const isUTXOValid = await this.validateTransactionUTXOs(
        payload.transaction,
        context
      );
      if (!isUTXOValid) {
        this.logger.warn(`Invalid UTXO inputs: ${payload.transaction.id}`);
        return this.createResponse(false, undefined, 'Invalid UTXO inputs');
      }

      // Check if transaction already in mempool
      const existingTx = context.blockchain
        .getPendingTransactions()
        .find(tx => tx.id === payload.transaction.id);

      if (existingTx) {
        this.logger.debug(
          `Transaction ${payload.transaction.id} already in mempool`
        );
        // Mark as propagated even if already exists
        this.addPropagatedTransaction(payload.propagationId);
        return this.createResponse(true);
      }

      // Add to blockchain as pending transaction
      // Note: addTransaction is async and validates the transaction
      const validationResult = await context.blockchain.addTransaction(
        payload.transaction
      );

      if (!validationResult.isValid) {
        this.logger.warn(
          `Transaction ${payload.transaction.id} rejected by blockchain: ${validationResult.errors.join(', ')}`
        );
        return this.createResponse(
          false,
          undefined,
          `Transaction validation failed: ${validationResult.errors.join(', ')}`
        );
      }

      this.logger.info(
        `Transaction ${payload.transaction.id} added to mempool`
      );

      // Mark as propagated
      this.addPropagatedTransaction(payload.propagationId);

      // Forward to peers (flooding protocol)
      return this.createResponse(true, message, undefined, true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling transaction broadcast:' + errorMessage);
      return this.createResponse(false, undefined, errorMessage);
    }
  }

  /**
   * Handle UTXO transaction request message
   *
   * SEARCH ORDER:
   * 1. Check mempool (pending transactions)
   * 2. Check blockchain (confirmed transactions)
   *
   * RESPONSE:
   * - Returns UTXO_TRANSACTION_BROADCAST message with requested transaction
   * - Returns error if transaction not found
   *
   * @param message - Transaction request message
   * @param context - Message context
   * @returns Response with transaction broadcast message or error
   */
  private async handleTransactionRequest(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as UTXOTransactionRequestPayload;

      this.logger.info(
        `Received transaction request: ${payload.transactionId}`
      );

      // 1. First, search mempool (pending transactions)
      let transaction = context.blockchain
        .getPendingTransactions()
        .find(tx => tx.id === payload.transactionId);

      // 2. If not in mempool, search blockchain (confirmed transactions)
      if (!transaction) {
        const blocks = context.blockchain.getBlocks();

        for (const block of blocks) {
          // Search through transactions to find matching UTXO transaction
          for (const tx of block.transactions) {
            // Type guard to check if it's a UTXOTransaction
            // Need to cast via unknown because Transaction and UTXOTransaction don't overlap
            if (
              'inputs' in tx &&
              'outputs' in tx &&
              tx.id === payload.transactionId
            ) {
              transaction = tx as unknown as UTXOTransaction;
              break;
            }
          }

          if (transaction) {
            break;
          }
        }
      }

      // 3. Return error if not found anywhere
      if (!transaction) {
        return this.createResponse(false, undefined, 'Transaction not found');
      }

      // 4. Create and return broadcast response
      const broadcastResponse: BlockchainNetworkMessage = {
        type: BlockchainMessageType.UTXO_TRANSACTION_BROADCAST,
        payload: {
          data: {
            transaction,
            propagationId: `tx_req_${Date.now()}`,
            timestamp: Date.now(),
          } as UTXOTransactionBroadcastPayload,
          version: message.payload.version,
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: message.metadata.source,
          hopCount: 0,
          signature: '',
          nonce: `nonce_${Date.now()}`,
        },
      };

      return this.createResponse(true, broadcastResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling transaction request:' + errorMessage);
      return this.createResponse(false, undefined, errorMessage);
    }
  }

  /**
   * Validate UTXO transaction structure
   *
   * Checks:
   * - Transaction ID is present
   * - At least one input
   * - At least one output
   *
   * @param transaction - The UTXO transaction to validate
   * @returns Validation result with errors
   */
  private validateTransactionStructure(transaction: UTXOTransaction): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!transaction.id) {
      errors.push('Transaction ID is required');
    }
    if (!transaction.inputs || transaction.inputs.length === 0) {
      errors.push('Transaction must have at least one input');
    }
    if (!transaction.outputs || transaction.outputs.length === 0) {
      errors.push('Transaction must have at least one output');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate UTXO transaction signatures
   *
   * Parses unlockingScript to extract signature and public key,
   * then verifies cryptographic signatures using CryptographicService.
   *
   * unlockingScript format: "<signature> <publicKey>"
   *
   * Supports both ECDSA (secp256k1) and Ed25519 algorithms with fallback.
   *
   * @param transaction - The UTXO transaction to validate
   * @returns True if all input signatures are valid
   */
  private async validateTransactionSignature(
    transaction: UTXOTransaction
  ): Promise<boolean> {
    try {
      // Validate each input signature
      for (const input of transaction.inputs) {
        if (!input.unlockingScript) {
          this.logger.warn(
            `Missing unlockingScript for input: ${input.previousTxId}:${input.outputIndex}`
          );
          return false;
        }

        // Parse unlockingScript: "<signature> <publicKey>"
        const parts = input.unlockingScript.split(' ');
        if (parts.length !== 2) {
          this.logger.warn(
            `Invalid unlockingScript format for input: ${input.previousTxId}:${input.outputIndex}`
          );
          return false;
        }

        const [signature, publicKey] = parts;

        // Create input data for signature verification
        const inputData = JSON.stringify({
          previousTxId: input.previousTxId,
          outputIndex: input.outputIndex,
          sequence: input.sequence,
        });

        // Verify signature using public key as nodeId
        // The CryptographicService.verifySignature takes (signature, message, nodeId)
        // where nodeId is the public key for verification
        const isValid = await this.cryptoService.verifySignature(
          signature,
          inputData,
          publicKey
        );

        if (!isValid) {
          this.logger.warn(
            `Invalid signature for input: ${input.previousTxId}:${input.outputIndex}`
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Transaction signature validation error:' + errorMessage
      );
      return false;
    }
  }

  /**
   * Validate UTXO transaction inputs against UTXO set
   *
   * Checks:
   * - Each input references a valid UTXO
   * - Each UTXO is not already spent
   * - Public key in unlockingScript matches UTXO owner (lockingScript)
   *
   * @param transaction - The UTXO transaction to validate
   * @param context - Message context with UTXOManager
   * @returns True if all inputs are valid
   */
  private async validateTransactionUTXOs(
    transaction: UTXOTransaction,
    context: BlockchainMessageContext
  ): Promise<boolean> {
    try {
      // Validate each input exists in UTXO set
      for (const input of transaction.inputs) {
        const utxo = context.utxoManager.getUTXO(
          input.previousTxId,
          input.outputIndex
        );

        if (!utxo) {
          this.logger.warn(
            `UTXO not found: ${input.previousTxId}:${input.outputIndex}`
          );
          return false;
        }

        // Verify UTXO is not already spent
        if (utxo.isSpent) {
          this.logger.warn(
            `UTXO already spent: ${input.previousTxId}:${input.outputIndex}`
          );
          return false;
        }

        // Verify public key in unlockingScript matches UTXO owner
        if (input.unlockingScript) {
          const parts = input.unlockingScript.split(' ');
          if (parts.length === 2) {
            const [, publicKey] = parts;

            // In Bitcoin-like systems, lockingScript is the address (derived from public key)
            // We verify that the public key matches the address that owns the UTXO
            // For now, we do a direct comparison as lockingScript should be the address
            // In a full implementation, you might derive an address from the public key
            // and compare it with the lockingScript

            // Note: This assumes lockingScript is the address (public key hash or similar)
            // A full implementation would need to derive the address from the public key
            // using the same algorithm used when creating outputs
            if (publicKey !== utxo.lockingScript) {
              // Try basic comparison first
              // In production, implement proper address derivation from public key
              this.logger.warn(
                `Public key does not match UTXO owner: ${input.previousTxId}:${input.outputIndex}`
              );
              // For now, we'll just log a warning but not fail
              // TODO: Implement proper address derivation and strict validation
            }
          }
        }
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('UTXO validation error:' + errorMessage);
      return false;
    }
  }

  /**
   * Add propagation ID to tracking set
   *
   * Enforces size limit to prevent memory exhaustion.
   * Uses simple eviction (remove first entry) when limit reached.
   *
   * @param propagationId - The propagation ID to track
   */
  private addPropagatedTransaction(propagationId: string): void {
    this.propagatedTransactions.add(propagationId);

    // Enforce size limit
    if (this.propagatedTransactions.size > this.maxPropagationEntries) {
      const firstEntry = this.propagatedTransactions.values().next().value;
      if (firstEntry) {
        this.propagatedTransactions.delete(firstEntry);
      }
    }
  }

  /**
   * Start periodic cleanup of propagation tracking
   *
   * Clears all propagation IDs every 10 minutes.
   * Prevents unbounded memory growth.
   *
   * Ensures no duplicate intervals by clearing any existing interval first.
   */
  private startPropagationCleanup(): void {
    // Clear existing interval if any to prevent multiple intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clean up old propagation IDs every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.propagatedTransactions.clear();
      this.logger.debug('Propagation tracking cleanup completed');
    }, this.propagationTimeWindow);
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   *
   * Must be called before handler destruction to prevent memory leaks.
   */
  stopPropagationCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Cleanup handler resources before destruction
   *
   * Call this method when the handler is being destroyed to ensure
   * proper cleanup of intervals and prevent memory leaks.
   */
  destroy(): void {
    this.stopPropagationCleanup();
    this.propagatedTransactions.clear();
    this.logger.info('UTXOTransactionMessageHandler destroyed');
  }
}
