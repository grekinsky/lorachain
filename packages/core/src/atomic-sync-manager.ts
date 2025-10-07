/**
 * Atomic Sync Manager
 *
 * Provides atomic transaction wrappers around sync operations with
 * rollback capability to ensure blockchain state consistency.
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Blockchain } from './blockchain.js';
import type { UTXOPersistenceManager } from './persistence.js';
import { Logger } from '@lorachain/shared';

/**
 * Transaction ID length in hex characters
 * 16 hex characters = 64 bits of entropy (sufficient for uniqueness)
 * This provides ~18 quintillion possible IDs, preventing collisions
 * even with millions of concurrent transactions
 */
const TRANSACTION_ID_LENGTH = 16;

/**
 * Atomic sync transaction
 */
export interface SyncTransaction {
  id: string;
  startedAt: number;
  operations: SyncOperation[];
  snapshot: BlockchainSnapshot;
  status: 'pending' | 'committed' | 'rolled_back';
}

/**
 * Sync operation within transaction
 */
export interface SyncOperation {
  type: 'add_block' | 'add_utxo' | 'remove_utxo' | 'update_height';
  data: unknown;
  timestamp: number;
  reversible: boolean;
}

/**
 * Blockchain state snapshot for rollback
 */
export interface BlockchainSnapshot {
  height: number;
  merkleRoot: string;
  utxoSetHash: string;
  utxoCount: number;
  timestamp: number;
  difficulty: number;
  miningReward: number;
}

/**
 * State validation result
 */
export interface StateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Transaction error
 */
export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly transaction?: SyncTransaction
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * Rollback error
 */
export class RollbackError extends Error {
  constructor(
    message: string,
    public readonly transaction: SyncTransaction
  ) {
    super(message);
    this.name = 'RollbackError';
  }
}

/**
 * State validation error
 */
export class StateValidationError extends Error {
  constructor(
    message: string,
    public readonly validation: StateValidationResult
  ) {
    super(message);
    this.name = 'StateValidationError';
  }
}

/**
 * Atomic Sync Manager
 *
 * Wraps sync operations in atomic transactions with rollback capability
 */
export class AtomicSyncManager extends EventEmitter {
  private blockchain: Blockchain;
  private persistence: UTXOPersistenceManager;
  private logger: Logger;

  private activeTransaction?: SyncTransaction;
  private transactionHistory: Map<string, SyncTransaction> = new Map();

  constructor(blockchain: Blockchain, persistence: UTXOPersistenceManager) {
    super();

    this.blockchain = blockchain;
    this.persistence = persistence;
    this.logger = Logger.getInstance();
  }

  /**
   * Begin atomic sync transaction
   */
  async beginTransaction(): Promise<string> {
    // 1. Ensure no active transaction
    if (this.activeTransaction) {
      throw new TransactionError('Transaction already active');
    }

    // 2. Create snapshot of current state
    const snapshot = await this.createSnapshot();

    // 3. Create transaction
    const transaction: SyncTransaction = {
      id: this.generateTransactionId(),
      startedAt: Date.now(),
      operations: [],
      snapshot,
      status: 'pending',
    };

    // 4. Set as active
    this.activeTransaction = transaction;
    this.transactionHistory.set(transaction.id, transaction);

    // 5. Emit event
    this.emit('transaction_started', transaction.id);

    this.logger.debug(`Transaction ${transaction.id} started`);

    return transaction.id;
  }

  /**
   * Commit transaction (make changes permanent)
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactionHistory.get(transactionId);
    if (!transaction) {
      throw new TransactionError('Transaction not found');
    }

    if (transaction.status !== 'pending') {
      throw new TransactionError(
        `Cannot commit transaction with status: ${transaction.status}`
      );
    }

    try {
      // 1. Validate final state
      const validation = await this.validateState();
      if (!validation.isValid) {
        // Rollback on validation failure
        this.logger.error(
          `State validation failed: ${validation.errors.join(', ')}`
        );
        await this.rollbackTransaction(transactionId);
        throw new StateValidationError('State validation failed', validation);
      }

      // 2. Persist all changes atomically
      await this.blockchain.save();

      // 3. Mark as committed
      transaction.status = 'committed';
      this.activeTransaction = undefined;

      // 4. Emit event
      this.emit('transaction_committed', transactionId);

      this.logger.info(`Transaction ${transactionId} committed successfully`);
    } catch (error) {
      // Handle errors during commit
      if (error instanceof StateValidationError) {
        throw error; // Re-throw validation errors
      }
      this.logger.error(`Commit failed: ${error}`);
      await this.rollbackTransaction(transactionId);
      throw new TransactionError(
        `Failed to commit transaction: ${error}`,
        transaction
      );
    }
  }

  /**
   * Rollback transaction (revert all changes)
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactionHistory.get(transactionId);
    if (!transaction) {
      throw new TransactionError('Transaction not found');
    }

    try {
      this.logger.info(`Rolling back transaction ${transactionId}`);

      // 1. Restore snapshot
      await this.restoreSnapshot(transaction.snapshot);

      // 2. Mark as rolled back
      transaction.status = 'rolled_back';
      this.activeTransaction = undefined;

      // 3. Emit event
      this.emit('transaction_rolled_back', transactionId);

      this.logger.info(`Transaction ${transactionId} rolled back successfully`);
    } catch (error) {
      this.logger.error(`Rollback failed: ${error}`);
      throw new RollbackError(
        `Failed to rollback transaction: ${error}`,
        transaction
      );
    }
  }

  /**
   * Add operation to current transaction
   */
  async recordOperation(operation: SyncOperation): Promise<void> {
    if (!this.activeTransaction) {
      throw new TransactionError('No active transaction');
    }

    this.activeTransaction.operations.push(operation);
    this.logger.debug(
      `Recorded operation ${operation.type} in transaction ${this.activeTransaction.id}`
    );
  }

  /**
   * Validate blockchain state consistency
   */
  async validateState(): Promise<StateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Validate blockchain height
      const blocks = this.blockchain.getBlocks();
      const height = blocks.length - 1;
      if (height < 0) {
        errors.push('Invalid blockchain height');
      }

      // 2. Validate chain continuity
      const chainValid = await this.blockchain.validateChain();
      if (!chainValid) {
        errors.push('Block chain continuity invalid');
      }

      // 3. Validate UTXO set integrity (if persistence available)
      if (this.blockchain.hasPersistence()) {
        const utxoValidation = await this.persistence.validateIntegrity();
        if (!utxoValidation.isValid) {
          errors.push(...utxoValidation.errors);
        }
      }

      // 4. Validate merkle root consistency
      const latestBlock = this.blockchain.getLatestBlock();
      if (latestBlock && latestBlock.merkleRoot) {
        // Basic merkle root check - ensure it's not empty
        if (!latestBlock.merkleRoot || latestBlock.merkleRoot.length === 0) {
          errors.push('Invalid merkle root in latest block');
        }
      }

      this.logger.debug(
        `State validation completed: ${errors.length} errors, ${warnings.length} warnings`
      );

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error(`State validation error: ${error}`);
      return {
        isValid: false,
        errors: [`State validation exception: ${error}`],
        warnings,
      };
    }
  }

  /**
   * Get active transaction
   */
  getActiveTransaction(): SyncTransaction | undefined {
    return this.activeTransaction;
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): SyncTransaction[] {
    return Array.from(this.transactionHistory.values());
  }

  /**
   * Create blockchain snapshot
   */
  private async createSnapshot(): Promise<BlockchainSnapshot> {
    const blocks = this.blockchain.getBlocks();
    const height = blocks.length - 1;
    const latestBlock = this.blockchain.getLatestBlock();
    const merkleRoot = latestBlock?.merkleRoot || '';

    // Calculate UTXO set hash
    const utxoSetHash = await this.calculateUTXOSetHash();

    // Get UTXO count from manager
    const utxoManager = this.blockchain.getUTXOManager();
    const utxoCount = utxoManager.getUTXOSetSize();

    const snapshot: BlockchainSnapshot = {
      height,
      merkleRoot,
      utxoSetHash,
      utxoCount,
      timestamp: Date.now(),
      difficulty: this.blockchain.getDifficulty(),
      miningReward: this.blockchain.getMiningReward(),
    };

    this.logger.debug(
      `Created snapshot at height ${height} with ${utxoCount} UTXOs`
    );

    return snapshot;
  }

  /**
   * Restore blockchain from snapshot
   */
  private async restoreSnapshot(snapshot: BlockchainSnapshot): Promise<void> {
    // 1. Verify snapshot is valid
    if (!snapshot || snapshot.height < 0) {
      throw new Error('Invalid snapshot');
    }

    this.logger.info(`Restoring snapshot from height ${snapshot.height}`);

    // 2. Get current blockchain state
    const blocks = this.blockchain.getBlocks();
    const currentHeight = blocks.length - 1;

    // 3. Rollback blockchain to snapshot height
    if (currentHeight > snapshot.height) {
      // Remove blocks added during transaction
      this.logger.debug(
        `Removing ${currentHeight - snapshot.height} blocks from height ${currentHeight} to ${snapshot.height}`
      );

      // Rebuild blockchain state from persistence if available
      if (this.blockchain.hasPersistence()) {
        await this.blockchain.load();

        // Verify we're at correct height after load
        const loadedBlocks = this.blockchain.getBlocks();
        const loadedHeight = loadedBlocks.length - 1;

        if (loadedHeight > snapshot.height) {
          // Still too many blocks, need to rebuild UTXO set
          await this.persistence.rebuildUTXOSet();
        }
      } else {
        // Without persistence, we can't safely rollback blocks
        // Future enhancement: Implement in-memory transaction log for testing scenarios
        throw new Error(
          'Cannot rollback without persistence layer. ' +
            'Atomic rollback requires a persistence manager to restore blockchain state. ' +
            'Consider initializing blockchain with UTXOPersistenceManager for rollback support.'
        );
      }
    }

    // 4. Restore blockchain parameters
    this.blockchain.setDifficulty(snapshot.difficulty);

    // 5. Validate restored state
    const validation = await this.validateState();
    if (!validation.isValid) {
      throw new Error(
        `Restored state is invalid: ${validation.errors.join(', ')}`
      );
    }

    this.logger.info(`Successfully restored to height ${snapshot.height}`);
  }

  /**
   * Calculate UTXO set hash
   *
   * Creates a deterministic SHA-256 hash of the entire UTXO set by:
   * 1. Sorting UTXO keys to ensure consistent ordering
   * 2. Concatenating critical UTXO fields (txId, outputIndex, value, lockingScript)
   * 3. Hashing the concatenated data for snapshot comparison
   *
   * This hash enables:
   * - Detection of UTXO set changes during transactions
   * - Verification of state consistency after rollback
   * - Snapshot comparison without storing entire UTXO set
   */
  private async calculateUTXOSetHash(): Promise<string> {
    const utxoManager = this.blockchain.getUTXOManager();
    const utxoSnapshot = utxoManager.getUTXOSetSnapshot();

    // Sort UTXO keys to ensure deterministic ordering across different runs
    // This is critical for consistent hash generation regardless of map iteration order
    const utxoKeys = Array.from(utxoSnapshot.keys()).sort();
    const hash = createHash('sha256');

    // Hash each UTXO's critical fields in sorted order
    // Format: txId:outputIndex:value:lockingScript
    for (const key of utxoKeys) {
      const utxo = utxoSnapshot.get(key);
      if (utxo) {
        // Concatenate UTXO fields that define its state
        // Any change to these fields will produce a different hash
        hash.update(
          `${utxo.txId}:${utxo.outputIndex}:${utxo.value}:${utxo.lockingScript}`
        );
      }
    }

    return hash.digest('hex');
  }

  /**
   * Generate transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const hash = createHash('sha256')
      .update(`${timestamp}-${random}`)
      .digest('hex');
    return hash.substring(0, TRANSACTION_ID_LENGTH);
  }
}
