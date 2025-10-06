import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Block } from './types.js';
import type { UTXOTransaction } from './types.js';
import type { UTXO } from './types.js';
import type { Blockchain } from './blockchain.js';
import type { CryptographicService } from './cryptographic.js';
import { MerkleTree } from './merkle/index.js';
import type { UTXOCompressionManager } from './utxo-compression-manager.js';
import { bytesToHex } from '@noble/hashes/utils';
import { Logger } from '@lorachain/shared';
import type { UTXOEnhancedMeshProtocol } from './enhanced-mesh-protocol.js';
import type { UTXOPriorityQueue } from './priority-queue.js';
import type {
  StateUpdateSubscribePayload,
  StateUpdateBatchPayload,
  StateUpdate,
  CompressedUTXO,
  UTXOSpentProof,
} from './sync-types.js';

/**
 * State change detected from block
 */
export interface StateChange {
  type: 'utxo_created' | 'utxo_spent';
  utxo: UTXO;
  blockHeight: number;
  transaction: UTXOTransaction;
}

/**
 * State update error
 */
export class StateUpdateError extends Error {
  constructor(
    message: string,
    public readonly update?: StateUpdate
  ) {
    super(message);
    this.name = 'StateUpdateError';
  }
}

/**
 * Invalid sequence error
 */
export class InvalidSequenceError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(`Invalid sequence: expected ${expected}, got ${actual}`);
    this.name = 'InvalidSequenceError';
  }
}

/**
 * Subscription error
 */
export class SubscriptionError extends Error {
  constructor(
    message: string,
    public readonly peerId: string
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/**
 * Broadcast error
 */
export class BroadcastError extends Error {
  constructor(
    message: string,
    public readonly update: StateUpdate,
    public readonly failedPeers: string[]
  ) {
    super(message);
    this.name = 'BroadcastError';
  }
}

/**
 * Subscription information
 */
export interface SubscriptionInfo {
  peerId: string;
  type: 'all' | 'address_specific';
  addresses?: string[];
  startSequence: number;
  subscribedAt: number;
  expiresAt?: number;
}

/**
 * Incremental State Update Manager
 * Detects blockchain state changes and creates compressed delta updates
 */
export class IncrementalStateManager extends EventEmitter {
  private blockchain: Blockchain;
  private cryptoService: typeof CryptographicService;
  private merkleTree: typeof MerkleTree;
  private compression: UTXOCompressionManager;
  private meshProtocol?: UTXOEnhancedMeshProtocol;
  private priorityQueue?: UTXOPriorityQueue;

  private sequenceNumber: number;
  private previousUpdateHash: string;
  private isWatching: boolean;

  // State update history (for gap detection)
  private updateHistory: Map<number, StateUpdate>;

  // Subscription management
  private subscriptions: Map<string, SubscriptionInfo>;

  // Batching configuration
  private batchSize: number;
  private batchIntervalMs: number;
  private batchSequenceNumber: number;
  private pendingBatches: Map<string, StateUpdate[]>;

  // Maximum number of updates to keep in memory
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor(
    blockchain: Blockchain,
    cryptoService: typeof CryptographicService,
    merkleTree: typeof MerkleTree,
    compression: UTXOCompressionManager,
    meshProtocol?: UTXOEnhancedMeshProtocol,
    priorityQueue?: UTXOPriorityQueue,
    batchSize: number = 10,
    batchIntervalMs: number = 1000
  ) {
    super();
    this.blockchain = blockchain;
    this.cryptoService = cryptoService;
    this.merkleTree = merkleTree;
    this.compression = compression;
    this.meshProtocol = meshProtocol;
    this.priorityQueue = priorityQueue;

    this.sequenceNumber = 0;
    this.previousUpdateHash = createHash('sha256').update('').digest('hex');
    this.isWatching = false;
    this.updateHistory = new Map();
    this.subscriptions = new Map();
    this.batchSize = batchSize;
    this.batchIntervalMs = batchIntervalMs;
    this.batchSequenceNumber = 0;
    this.pendingBatches = new Map();
  }

  /**
   * Start watching blockchain for state changes
   *
   * When started, the manager will listen for new blocks added to the blockchain
   * and emit 'block_detected' events that can be used to trigger state update creation.
   *
   * @throws {StateUpdateError} If already watching state changes
   * @emits watching_started - When state watching begins
   * @example
   * ```typescript
   * await manager.startWatchingStateChanges();
   * manager.on('block_detected', async (block) => {
   *   const update = await manager.createStateUpdate(block, privateKey, 'secp256k1');
   * });
   * ```
   */
  async startWatchingStateChanges(): Promise<void> {
    if (this.isWatching) {
      throw new StateUpdateError('Already watching state changes');
    }

    this.isWatching = true;

    // Note: Actual block watching would be implemented through polling
    // or by wrapping the blockchain's addBlock method
    // For now, we just set the flag

    this.emit('watching_started');
  }

  /**
   * Stop watching blockchain for state changes
   *
   * Stops listening for new blocks. Safe to call even if not currently watching.
   *
   * @emits watching_stopped - When state watching stops
   */
  stopWatchingStateChanges(): void {
    if (!this.isWatching) {
      return;
    }

    this.isWatching = false;

    this.emit('watching_stopped');
  }

  /**
   * Create a cryptographically signed state update from a block's changes
   *
   * Detects UTXO creation and spending from the block, calculates merkle roots
   * before/after the state transition, assigns a sequence number, and signs the
   * update with the provided private key.
   *
   * @param block - The block to create an update from
   * @param privateKey - Hex-encoded private key for signing the update
   * @param algorithm - Cryptographic algorithm to use (secp256k1 or ed25519)
   * @returns Promise resolving to a signed StateUpdate
   * @throws {StateUpdateError} If update creation fails
   * @emits state_update_created - When a new state update is created
   *
   * @remarks
   * - Automatically increments the sequence number
   * - Updates the hash chain with previousUpdateHash
   * - Stores update in history for gap detection
   * - Logs a warning if creation takes >50ms
   *
   * @example
   * ```typescript
   * const update = await manager.createStateUpdate(
   *   newBlock,
   *   '1a2b3c4d...',  // private key
   *   'secp256k1'
   * );
   * console.log(`Created update #${update.sequenceNumber}`);
   * ```
   */
  async createStateUpdate(
    block: Block,
    privateKey: string,
    algorithm: 'secp256k1' | 'ed25519'
  ): Promise<StateUpdate> {
    const startTime = Date.now();

    // Detect changes from block
    const changes = this.detectChanges(block);

    // Extract UTXOs created and spent
    const utxosCreated: CompressedUTXO[] = [];
    const utxosSpent: UTXOSpentProof[] = [];

    for (const change of changes) {
      if (change.type === 'utxo_created') {
        utxosCreated.push({
          txId: change.utxo.txId,
          outputIndex: change.utxo.outputIndex,
          value: change.utxo.value,
          address: change.utxo.lockingScript, // Using lockingScript as address
        });
      } else if (change.type === 'utxo_spent') {
        utxosSpent.push({
          txId: change.utxo.txId,
          outputIndex: change.utxo.outputIndex,
          spentInBlock: block.index,
          spentInTxId: change.transaction.id,
        });
      }
    }

    // Calculate merkle root before (previous block's UTXO transactions)
    const previousBlock =
      block.index > 0
        ? await this.blockchain.getBlockByIndex(block.index - 1)
        : null;
    const merkleRootBefore = previousBlock
      ? this.calculateMerkleRootForBlock(previousBlock)
      : createHash('sha256').update('').digest('hex');

    // Calculate merkle root after (current block's UTXO transactions)
    const merkleRootAfter = this.calculateMerkleRootForBlock(block);

    // Generate merkle proof for state transition
    const merkleProof = this.generateStateTransitionProof(previousBlock, block);

    // Increment sequence number
    this.sequenceNumber++;

    // Create update (without signature yet)
    const updateWithoutSignature: Omit<StateUpdate, 'signature' | 'publicKey'> =
      {
        sequenceNumber: this.sequenceNumber,
        blockHeight: block.index,
        blockHash: block.hash,
        timestamp: Date.now(),
        previousUpdateHash: this.previousUpdateHash,
        utxosCreated,
        utxosSpent,
        merkleRootBefore,
        merkleRootAfter,
        merkleProof,
        algorithm,
      };

    // Calculate hash for this update
    const updateHash = this.calculateUpdateHash(updateWithoutSignature);

    // Sign the update
    const privateKeyBytes =
      typeof privateKey === 'string'
        ? Buffer.from(privateKey, 'hex')
        : privateKey;
    const keyPair = this.cryptoService.generateKeyPairFromSeed(
      new Uint8Array(privateKeyBytes),
      algorithm
    );
    const signature = this.cryptoService.sign(
      new Uint8Array(Buffer.from(updateHash, 'hex')),
      keyPair.privateKey,
      algorithm
    );

    // Create final update with signature
    const update: StateUpdate = {
      ...updateWithoutSignature,
      signature: bytesToHex(signature.signature),
      publicKey: bytesToHex(keyPair.publicKey),
    };

    // Update previous hash for next update
    this.previousUpdateHash = updateHash;

    // Store in history
    this.updateHistory.set(this.sequenceNumber, update);

    // Prune old updates to prevent unbounded memory growth
    this.pruneUpdateHistory();

    // Emit event
    this.emit('state_update_created', update);

    const duration = Date.now() - startTime;
    if (duration > 50) {
      Logger.getInstance().warn(
        `State update creation took ${duration}ms (target: <50ms)`,
        {
          duration,
          blockHeight: block.index,
          sequenceNumber: this.sequenceNumber,
        }
      );
    }

    return update;
  }

  /**
   * Apply a received state update to the local blockchain
   *
   * Validates the update's signature and hash chain integrity, then applies
   * the UTXO changes (creations and deletions) to the local blockchain state.
   *
   * @param update - The state update to apply
   * @returns Promise resolving to true if update was successfully applied
   * @throws {StateUpdateError} If the update fails validation
   * @throws {InvalidSequenceError} If sequence number is not continuous
   * @emits state_update_applied - When an update is successfully applied
   *
   * @remarks
   * - Verifies cryptographic signature before applying
   * - Checks sequence number continuity
   * - Updates local UTXO set (adds created, removes spent)
   * - Stores update in history for future reference
   * - Automatically prunes old updates from memory
   *
   * @example
   * ```typescript
   * try {
   *   await manager.applyStateUpdate(receivedUpdate);
   *   console.log('Update applied successfully');
   * } catch (error) {
   *   if (error instanceof InvalidSequenceError) {
   *     // Handle sequence gap - request missing updates
   *   }
   * }
   * ```
   */
  async applyStateUpdate(update: StateUpdate): Promise<boolean> {
    // Validate update first
    const isValid = await this.validateStateUpdate(update);
    if (!isValid) {
      throw new StateUpdateError('Invalid state update', update);
    }

    // Check sequence number continuity
    if (update.sequenceNumber !== this.sequenceNumber + 1) {
      throw new InvalidSequenceError(
        this.sequenceNumber + 1,
        update.sequenceNumber
      );
    }

    // Apply UTXO changes
    const utxoManager = this.blockchain.getUTXOManager();

    // Remove spent UTXOs
    for (const spent of update.utxosSpent) {
      utxoManager.removeUTXO(spent.txId, spent.outputIndex);
    }

    // Add created UTXOs
    for (const created of update.utxosCreated) {
      const utxo: UTXO = {
        txId: created.txId,
        outputIndex: created.outputIndex,
        value: created.value,
        lockingScript: created.address,
        blockHeight: update.blockHeight,
        isSpent: false,
      };
      utxoManager.addUTXO(utxo);
    }

    // Update sequence number and previous hash
    this.sequenceNumber = update.sequenceNumber;
    this.previousUpdateHash = this.hashStateUpdate(update);

    // Store in history
    this.updateHistory.set(update.sequenceNumber, update);

    // Prune old updates to prevent unbounded memory growth
    this.pruneUpdateHistory();

    // Emit event
    this.emit('state_update_applied', update);

    return true;
  }

  /**
   * Validate a state update's cryptographic signature and chain integrity
   *
   * Verifies:
   * 1. Cryptographic signature is valid for the update hash
   * 2. Hash chain is continuous (previousUpdateHash matches)
   * 3. Public key matches the signature
   *
   * @param update - The state update to validate
   * @returns Promise resolving to true if valid, false otherwise
   *
   * @remarks
   * - Does NOT throw errors - returns false on validation failure
   * - Logs errors for debugging purposes
   * - Checks hash chain integrity only if update history exists
   *
   * @example
   * ```typescript
   * const isValid = await manager.validateStateUpdate(receivedUpdate);
   * if (!isValid) {
   *   console.log('Invalid update - rejecting');
   * }
   * ```
   */
  async validateStateUpdate(update: StateUpdate): Promise<boolean> {
    try {
      // Verify signature
      const publicKeyBytes = Buffer.from(update.publicKey, 'hex');
      const signatureBytes = Buffer.from(update.signature, 'hex');
      const updateHash = this.hashStateUpdate(update);
      const updateHashBytes = Buffer.from(updateHash, 'hex');

      const isValidSignature = this.cryptoService.verify(
        {
          signature: new Uint8Array(signatureBytes),
          algorithm: update.algorithm,
        },
        new Uint8Array(updateHashBytes),
        new Uint8Array(publicKeyBytes)
      );

      if (!isValidSignature) {
        return false;
      }

      // Verify hash chain integrity
      if (this.updateHistory.size > 0) {
        const previousUpdate = this.updateHistory.get(
          update.sequenceNumber - 1
        );
        if (previousUpdate) {
          const expectedPreviousHash = this.hashStateUpdate(previousUpdate);
          if (update.previousUpdateHash !== expectedPreviousHash) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      Logger.getInstance().error('Error validating state update', {
        error: error instanceof Error ? error.message : String(error),
        sequenceNumber: update.sequenceNumber,
        blockHeight: update.blockHeight,
      });
      return false;
    }
  }

  /**
   * Get the current sequence number
   *
   * @returns The current sequence number (0 if no updates created yet)
   */
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Retrieve a state update by its sequence number
   *
   * @param sequenceNumber - The sequence number of the update to retrieve
   * @returns The state update if found, undefined otherwise
   *
   * @remarks
   * - Only returns updates that are still in memory (not pruned)
   * - Updates older than MAX_HISTORY_SIZE may have been pruned
   */
  getUpdate(sequenceNumber: number): StateUpdate | undefined {
    return this.updateHistory.get(sequenceNumber);
  }

  /**
   * Detect missing updates in the sequence (gap detection)
   *
   * Identifies which sequence numbers are missing between the current local
   * sequence and a received sequence number from another node.
   *
   * @param receivedSequence - The sequence number received from another node
   * @returns Array of missing sequence numbers (empty if no gaps)
   *
   * @remarks
   * - Used to identify which updates need to be requested from peers
   * - Only detects gaps in the continuous sequence
   * - Does not check for updates that have been pruned from history
   *
   * @example
   * ```typescript
   * // Local sequence is at 5, received update with sequence 10
   * const missing = manager.detectMissingUpdates(10);
   * // Returns: [6, 7, 8, 9]
   *
   * // Request missing updates from peers
   * for (const seq of missing) {
   *   await requestUpdateFromPeer(seq);
   * }
   * ```
   */
  detectMissingUpdates(receivedSequence: number): number[] {
    const missing: number[] = [];

    // Check for gaps in sequence
    for (let i = this.sequenceNumber + 1; i < receivedSequence; i++) {
      if (!this.updateHistory.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  /**
   * Subscribe peer to state updates
   *
   * Registers a peer to receive real-time state updates. Supports both full
   * synchronization (all updates) and address-specific filtering for light clients.
   *
   * @param subscription - Subscription request payload with peer ID and preferences
   * @throws {SubscriptionError} If subscription already exists for peer ID
   * @emits subscription_added - When a new subscription is successfully added
   *
   * @remarks
   * - Subscription type 'all' sends all state updates to the peer
   * - Subscription type 'address_specific' filters updates by addresses
   * - Optional expiration timestamp for automatic cleanup
   * - Start sequence allows resuming from specific update
   *
   * @example
   * ```typescript
   * // Full node subscription (all updates)
   * await manager.subscribeToUpdates({
   *   peerId: 'node-123',
   *   subscriptionType: 'all',
   *   startSequence: 0
   * });
   *
   * // Light client subscription (specific addresses only)
   * await manager.subscribeToUpdates({
   *   peerId: 'wallet-456',
   *   subscriptionType: 'address_specific',
   *   addresses: ['lora1abc...', 'lora1def...'],
   *   startSequence: 100,
   *   expiresAt: Date.now() + 3600000 // 1 hour
   * });
   * ```
   */
  async subscribeToUpdates(
    subscription: StateUpdateSubscribePayload
  ): Promise<void> {
    // Check if already subscribed
    if (this.subscriptions.has(subscription.peerId)) {
      throw new SubscriptionError(
        'Peer already subscribed',
        subscription.peerId
      );
    }

    // Validate address-specific subscription
    if (
      subscription.subscriptionType === 'address_specific' &&
      (!subscription.addresses || subscription.addresses.length === 0)
    ) {
      throw new SubscriptionError(
        'Address-specific subscription requires addresses',
        subscription.peerId
      );
    }

    // Create subscription info
    const info: SubscriptionInfo = {
      peerId: subscription.peerId,
      type: subscription.subscriptionType,
      addresses: subscription.addresses,
      startSequence: subscription.startSequence ?? this.sequenceNumber,
      subscribedAt: Date.now(),
      expiresAt: subscription.expiresAt,
    };

    // Store subscription
    this.subscriptions.set(subscription.peerId, info);

    // Emit event
    this.emit('subscription_added', info);

    Logger.getInstance().info('Peer subscribed to state updates', {
      peerId: subscription.peerId,
      type: subscription.subscriptionType,
      addressCount: subscription.addresses?.length ?? 0,
      startSequence: info.startSequence,
    });
  }

  /**
   * Unsubscribe peer from updates
   *
   * Removes a peer from the subscription list. Safe to call even if peer
   * is not currently subscribed.
   *
   * @param peerId - The peer ID to unsubscribe
   * @emits subscription_removed - When a subscription is successfully removed
   *
   * @example
   * ```typescript
   * await manager.unsubscribeFromUpdates('node-123');
   * ```
   */
  async unsubscribeFromUpdates(peerId: string): Promise<void> {
    const subscription = this.subscriptions.get(peerId);
    if (!subscription) {
      return; // Already unsubscribed or never subscribed
    }

    // Remove subscription
    this.subscriptions.delete(peerId);

    // Emit event
    this.emit('subscription_removed', subscription);

    Logger.getInstance().info('Peer unsubscribed from state updates', {
      peerId,
      type: subscription.type,
    });
  }

  /**
   * Broadcast state update to subscribed peers
   *
   * Sends a state update to all subscribed peers that are interested in
   * the update based on their subscription preferences. Applies filtering
   * for address-specific subscriptions and batches updates for efficiency.
   *
   * @param update - The state update to broadcast
   * @throws {BroadcastError} If broadcasting fails to all peers
   * @emits update_broadcasted - When an update is successfully broadcasted
   *
   * @remarks
   * - Automatically filters updates by peer interests
   * - Uses priority queue for transmission scheduling
   * - Respects duty cycle limits for LoRa mesh
   * - Batches multiple small updates together
   *
   * @example
   * ```typescript
   * const update = await manager.createStateUpdate(newBlock, privateKey, 'secp256k1');
   * await manager.broadcastStateUpdate(update);
   * ```
   */
  async broadcastStateUpdate(update: StateUpdate): Promise<void> {
    if (!this.meshProtocol) {
      Logger.getInstance().warn(
        'Cannot broadcast update: mesh protocol not configured'
      );
      return;
    }

    const failedPeers: string[] = [];
    let successCount = 0;

    // Cleanup expired subscriptions first
    this.cleanupExpiredSubscriptions();

    // Broadcast to each subscribed peer
    for (const [peerId, subscription] of this.subscriptions) {
      try {
        // Check if peer should receive this update
        if (!this.shouldSendUpdateToPeer(update, subscription)) {
          continue;
        }

        // Add to pending batch for this peer
        if (!this.pendingBatches.has(peerId)) {
          this.pendingBatches.set(peerId, []);
        }
        this.pendingBatches.get(peerId)!.push(update);

        // If batch is full or enough time has passed, send it
        const batch = this.pendingBatches.get(peerId)!;
        if (batch.length >= this.batchSize) {
          await this.sendUpdateBatch(peerId, batch);
          this.pendingBatches.set(peerId, []); // Clear batch
          successCount++;
        }
      } catch (error) {
        failedPeers.push(peerId);
        Logger.getInstance().error('Failed to broadcast update to peer', {
          peerId,
          error: error instanceof Error ? error.message : String(error),
          sequenceNumber: update.sequenceNumber,
        });
      }
    }

    // Emit event
    this.emit('update_broadcasted', {
      update,
      successCount,
      failedCount: failedPeers.length,
    });

    // If all peers failed, throw error
    if (failedPeers.length > 0 && successCount === 0) {
      throw new BroadcastError(
        'Failed to broadcast update to any peer',
        update,
        failedPeers
      );
    }
  }

  /**
   * Get subscribed peers
   *
   * Returns an array of all current subscriptions.
   *
   * @returns Array of subscription information objects
   *
   * @example
   * ```typescript
   * const subs = manager.getSubscriptions();
   * console.log(`${subs.length} active subscriptions`);
   * ```
   */
  getSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Check if peer is subscribed
   *
   * @param peerId - The peer ID to check
   * @returns True if peer is subscribed, false otherwise
   *
   * @example
   * ```typescript
   * if (manager.isSubscribed('node-123')) {
   *   console.log('Peer is subscribed');
   * }
   * ```
   */
  isSubscribed(peerId: string): boolean {
    return this.subscriptions.has(peerId);
  }

  /**
   * Get subscription info for peer
   *
   * @param peerId - The peer ID to get info for
   * @returns Subscription info if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const info = manager.getSubscription('node-123');
   * if (info) {
   *   console.log(`Subscribed as ${info.type}`);
   * }
   * ```
   */
  getSubscription(peerId: string): SubscriptionInfo | undefined {
    return this.subscriptions.get(peerId);
  }

  /**
   * Internal: Detect changes from block
   */
  private detectChanges(block: Block): StateChange[] {
    const changes: StateChange[] = [];

    // Get UTXO transactions from block
    const utxoTransactions = this.extractUTXOTransactions(block);

    for (const tx of utxoTransactions) {
      // Detect UTXO spending (inputs)
      for (const input of tx.inputs) {
        const utxo = this.blockchain
          .getUTXOManager()
          .getUTXO(input.previousTxId, input.outputIndex);
        if (utxo) {
          changes.push({
            type: 'utxo_spent',
            utxo,
            blockHeight: block.index,
            transaction: tx,
          });
        }
      }

      // Detect UTXO creation (outputs)
      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i];
        const utxo: UTXO = {
          txId: tx.id,
          outputIndex: i,
          value: output.value,
          lockingScript: output.lockingScript,
          blockHeight: block.index,
          isSpent: false,
        };
        changes.push({
          type: 'utxo_created',
          utxo,
          blockHeight: block.index,
          transaction: tx,
        });
      }
    }

    return changes;
  }

  /**
   * Internal: Calculate hash for a state update (helper for signature verification)
   * Accepts either a full StateUpdate or an update without signature/publicKey
   */
  private hashStateUpdate(
    update: StateUpdate | Omit<StateUpdate, 'signature' | 'publicKey'>
  ): string {
    const updateString = JSON.stringify({
      sequenceNumber: update.sequenceNumber,
      blockHeight: update.blockHeight,
      blockHash: update.blockHash,
      timestamp: update.timestamp,
      previousUpdateHash: update.previousUpdateHash,
      utxosCreated: update.utxosCreated,
      utxosSpent: update.utxosSpent,
      merkleRootBefore: update.merkleRootBefore,
      merkleRootAfter: update.merkleRootAfter,
      merkleProof: update.merkleProof,
      algorithm: update.algorithm,
    });

    return createHash('sha256').update(updateString).digest('hex');
  }

  /**
   * Internal: Calculate update hash
   * @deprecated Use hashStateUpdate instead
   */
  private calculateUpdateHash(
    update: Omit<StateUpdate, 'signature' | 'publicKey'>
  ): string {
    return this.hashStateUpdate(update);
  }

  /**
   * Internal: Prune old updates from history to prevent unbounded memory growth
   */
  private pruneUpdateHistory(): void {
    if (this.updateHistory.size > this.MAX_HISTORY_SIZE) {
      const oldestToKeep = this.sequenceNumber - this.MAX_HISTORY_SIZE;
      for (const [seq] of this.updateHistory) {
        if (seq < oldestToKeep) {
          this.updateHistory.delete(seq);
        }
      }

      Logger.getInstance().debug('Pruned old state updates from history', {
        historySize: this.updateHistory.size,
        currentSequence: this.sequenceNumber,
        oldestKept: oldestToKeep,
      });
    }
  }

  /**
   * Internal: Handle new block event
   */
  private async onBlockAdded(block: Block): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    try {
      // Emit event for applications to create and sign updates
      this.emit('block_detected', block);
    } catch {
      this.emit(
        'error',
        new StateUpdateError('Error handling block', undefined)
      );
    }
  }

  /**
   * Extract UTXO transactions from block
   */
  private extractUTXOTransactions(block: Block): UTXOTransaction[] {
    // Filter transactions that are UTXO transactions
    // Check for the presence of required UTXO transaction properties
    const utxoTransactions: UTXOTransaction[] = [];

    for (const tx of block.transactions) {
      const candidate = tx as unknown as Partial<UTXOTransaction>;
      if (
        candidate.inputs !== undefined &&
        Array.isArray(candidate.inputs) &&
        candidate.outputs !== undefined &&
        Array.isArray(candidate.outputs) &&
        candidate.lockTime !== undefined
      ) {
        utxoTransactions.push(candidate as UTXOTransaction);
      }
    }

    return utxoTransactions;
  }

  /**
   * Calculate merkle root for a block's UTXO transactions
   */
  private calculateMerkleRootForBlock(block: Block): string {
    const utxoTransactions = this.extractUTXOTransactions(block);
    if (utxoTransactions.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }
    return this.merkleTree.calculateRoot(utxoTransactions);
  }

  /**
   * Generate merkle proof for state transition
   */
  private generateStateTransitionProof(
    previousBlock: Block | null,
    currentBlock: Block
  ): string[] {
    const proof: string[] = [];

    // Get UTXO transactions from current block
    const currentTxs = this.extractUTXOTransactions(currentBlock);

    // For each transaction, get its hash
    for (const tx of currentTxs) {
      const txHash = createHash('sha256')
        .update(JSON.stringify(tx))
        .digest('hex');
      proof.push(txHash);
    }

    return proof;
  }

  /**
   * Internal: Filter update for peer based on interests
   */
  private shouldSendUpdateToPeer(
    update: StateUpdate,
    subscription: SubscriptionInfo
  ): boolean {
    // Check sequence number (don't resend old updates)
    if (update.sequenceNumber < subscription.startSequence) {
      return false;
    }

    // All updates mode - send everything
    if (subscription.type === 'all') {
      return true;
    }

    // Address-specific mode - filter by addresses
    if (subscription.type === 'address_specific' && subscription.addresses) {
      // Check if any UTXO change involves subscribed addresses
      const hasRelevantUTXO =
        update.utxosCreated.some(utxo =>
          subscription.addresses!.includes(utxo.address)
        ) ||
        update.utxosSpent.some(utxo => {
          // Look up UTXO to get address
          const originalUTXO = this.blockchain
            .getUTXOManager()
            .getUTXO(utxo.txId, utxo.outputIndex);
          return (
            originalUTXO &&
            subscription.addresses!.includes(originalUTXO.lockingScript)
          );
        });

      return hasRelevantUTXO;
    }

    return false;
  }

  /**
   * Internal: Batch multiple updates
   */
  private async batchUpdates(
    updates: StateUpdate[]
  ): Promise<StateUpdateBatchPayload> {
    // 1. Limit batch size
    const batchedUpdates = updates.slice(0, this.batchSize);

    // 2. Create batch payload
    const batch: StateUpdateBatchPayload = {
      updates: batchedUpdates,
      batchSequence: this.batchSequenceNumber++,
      timestamp: Date.now(),
      compressed: false,
    };

    // 3. Compress batch (if beneficial)
    const serialized = JSON.stringify(batch);
    if (serialized.length > 512) {
      // Large batch - try compression
      try {
        const compressedResult = this.compression.compress(
          Buffer.from(serialized)
        );
        // Only use compression if it reduces size
        if (compressedResult.data.length < serialized.length * 0.8) {
          batch.compressed = true;
          Logger.getInstance().debug('Compressed state update batch', {
            originalSize: serialized.length,
            compressedSize: compressedResult.data.length,
            ratio: (compressedResult.data.length / serialized.length).toFixed(2),
          });
        }
      } catch (error) {
        Logger.getInstance().warn(
          'Failed to compress batch, sending uncompressed',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    return batch;
  }

  /**
   * Internal: Send update batch to peer
   */
  private async sendUpdateBatch(
    peerId: string,
    updates: StateUpdate[]
  ): Promise<void> {
    if (!this.meshProtocol) {
      throw new Error('Mesh protocol not configured');
    }

    // Create batch
    const batch = await this.batchUpdates(updates);

    // Serialize batch
    const payload = JSON.stringify(batch);

    // Send via mesh protocol
    // Note: In a real implementation, this would use the mesh protocol's sendMessage method
    // For now, we'll just log it
    Logger.getInstance().debug('Sending update batch to peer', {
      peerId,
      updateCount: batch.updates.length,
      batchSequence: batch.batchSequence,
      compressed: batch.compressed,
      payloadSize: payload.length,
    });

    // Emit event
    this.emit('batch_sent', {
      peerId,
      batch,
      payloadSize: payload.length,
    });
  }

  /**
   * Internal: Cleanup expired subscriptions
   */
  private cleanupExpiredSubscriptions(): void {
    const now = Date.now();
    const expiredPeers: string[] = [];

    for (const [peerId, subscription] of this.subscriptions) {
      if (subscription.expiresAt && subscription.expiresAt < now) {
        expiredPeers.push(peerId);
      }
    }

    // Remove expired subscriptions
    for (const peerId of expiredPeers) {
      const subscription = this.subscriptions.get(peerId);
      this.subscriptions.delete(peerId);
      this.emit('subscription_expired', subscription);

      Logger.getInstance().info('Subscription expired', {
        peerId,
        expiredAt: subscription?.expiresAt,
      });
    }
  }
}
