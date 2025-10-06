/**
 * State Checkpoint Manager
 *
 * Creates periodic blockchain state checkpoints with UTXO set snapshots
 * and merkle roots for fast blockchain bootstrapping.
 *
 * NO BACKWARDS COMPATIBILITY - UTXO-only implementation
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Blockchain } from './blockchain.js';
import type { UTXOPersistenceManager } from './persistence.js';
import type { UTXOCompressionManager } from './utxo-compression-manager.js';
import type { UTXOSetSnapshot, CompressedUTXOBatch } from './sync-types.js';
import type { UTXO, UTXOTransaction } from './types.js';
import { MerkleTree } from './merkle/MerkleTree.js';

/**
 * Validator signature (placeholder for Task 2)
 */
export interface ValidatorSignature {
  validatorPublicKey: string;
  signature: string;
  timestamp: number;
}

/**
 * Enhanced checkpoint structure extending UTXOSetSnapshot
 */
export interface StateCheckpoint extends UTXOSetSnapshot {
  // Inherited from UTXOSetSnapshot:
  // height: number;
  // timestamp: number;
  // merkleRoot: string;
  // utxoCount: number;
  // totalValue: bigint;
  // compressedUTXOs: CompressedUTXOBatch[];
  // proofs: UTXOMerkleProof[];
  // signature: string;

  // NEW FIELDS:
  checkpointHash: string; // SHA-256 of checkpoint content
  checkpointInterval: number; // Block interval (e.g., 100)
  previousCheckpointHash?: string; // Chain of checkpoints

  // Placeholder for Task 2:
  validatorSignatures?: ValidatorSignature[];
  expiresAt?: number;
}

/**
 * Checkpoint creation options
 */
export interface CheckpointCreationOptions {
  height?: number; // Specific height, or current if omitted
  compressionLevel?: number; // 1-9, default 6
  includeMetadata?: boolean; // Include extra metadata
}

/**
 * Checkpoint creation error
 */
export class CheckpointCreationError extends Error {
  constructor(
    message: string,
    public readonly height?: number
  ) {
    super(message);
    this.name = 'CheckpointCreationError';
  }
}

/**
 * Checkpoint not found error
 */
export class CheckpointNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointNotFoundError';
  }
}

/**
 * State Checkpoint Manager
 *
 * Manages periodic blockchain state checkpoints with UTXO snapshots
 */
export class StateCheckpointManager extends EventEmitter {
  private blockchain: Blockchain;
  private persistence: UTXOPersistenceManager;
  private compression: UTXOCompressionManager;
  private checkpointInterval: number;
  private isCreatingCheckpoint: boolean = false;

  constructor(
    blockchain: Blockchain,
    persistence: UTXOPersistenceManager,
    compression: UTXOCompressionManager,
    checkpointInterval: number = 100
  ) {
    super();
    this.blockchain = blockchain;
    this.persistence = persistence;
    this.compression = compression;
    this.checkpointInterval = checkpointInterval;
  }

  /**
   * Create a checkpoint at the specified or current block height
   */
  async createCheckpoint(
    options: CheckpointCreationOptions = {}
  ): Promise<StateCheckpoint> {
    // Prevent concurrent checkpoint creation
    if (this.isCreatingCheckpoint) {
      throw new CheckpointCreationError(
        'Checkpoint creation already in progress'
      );
    }

    this.isCreatingCheckpoint = true;

    try {
      const startTime = Date.now();

      // Determine height from blocks
      const blocks = this.blockchain.getBlocks();
      const currentHeight = blocks.length - 1;
      const height = options.height ?? currentHeight;

      // Validate height
      if (height < 0) {
        throw new CheckpointCreationError(
          'Invalid height: must be >= 0',
          height
        );
      }

      if (height > currentHeight) {
        throw new CheckpointCreationError(
          `Cannot create checkpoint at height ${height}: current height is ${currentHeight}`,
          height
        );
      }

      this.emit('checkpoint:creating', { height });

      // Get UTXO set from UTXOManager
      const utxoManager = this.blockchain.getUTXOManager();
      const utxoSet = utxoManager.getUTXOSetSnapshot();
      const utxos = Array.from(utxoSet.values());

      if (utxos.length === 0) {
        throw new CheckpointCreationError(
          'Cannot create checkpoint: UTXO set is empty',
          height
        );
      }

      // Calculate total value
      const totalValue = utxos.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        BigInt(0)
      );

      // Build merkle tree from UTXOs
      const utxoTransactions = this.convertUTXOsToTransactions(utxos);
      const merkleRoot = MerkleTree.calculateRoot(utxoTransactions);

      // Compress UTXO set
      const compressionLevel = options.compressionLevel ?? 6;
      const compressedUTXOs = await this.compressUTXOSet(
        utxos,
        compressionLevel
      );

      // Get previous checkpoint hash for chain continuity
      const previousCheckpointHash =
        await this.getPreviousCheckpointHash(height);

      // Create checkpoint structure (without hash yet)
      const checkpointData: Omit<StateCheckpoint, 'checkpointHash'> = {
        height,
        timestamp: Date.now(),
        merkleRoot,
        utxoCount: utxos.length,
        totalValue,
        compressedUTXOs,
        proofs: [], // Merkle proofs can be generated on demand
        signature: '', // Placeholder signature
        checkpointInterval: this.checkpointInterval,
        previousCheckpointHash,
      };

      // Calculate checkpoint hash
      const checkpointHash = this.calculateCheckpointHash(checkpointData);

      // Complete checkpoint
      const checkpoint: StateCheckpoint = {
        ...checkpointData,
        checkpointHash,
      };

      // Store checkpoint
      await this.storeCheckpoint(checkpoint);

      const duration = Date.now() - startTime;
      this.emit('checkpoint:created', { checkpoint, duration });

      return checkpoint;
    } catch (error) {
      this.emit('checkpoint:error', { error });
      throw error;
    } finally {
      this.isCreatingCheckpoint = false;
    }
  }

  /**
   * Retrieve checkpoint by height
   */
  async getCheckpointByHeight(height: number): Promise<StateCheckpoint | null> {
    try {
      const key = `height:${height}`;
      const checkpoint = await this.getFromDatabase<StateCheckpoint>(key);
      return checkpoint;
    } catch {
      // Not found
      return null;
    }
  }

  /**
   * Retrieve checkpoint by hash
   */
  async getCheckpointByHash(hash: string): Promise<StateCheckpoint | null> {
    try {
      // Get height from hash index
      const indexKey = `hash:${hash}`;
      const height = await this.getFromDatabase<number>(indexKey);

      if (height === null) {
        return null;
      }

      // Get checkpoint by height
      return await this.getCheckpointByHeight(height);
    } catch {
      return null;
    }
  }

  /**
   * List all available checkpoints (ordered by height descending)
   */
  async getAvailableCheckpoints(): Promise<StateCheckpoint[]> {
    try {
      const checkpoints: StateCheckpoint[] = [];

      // Iterate through checkpoint sublevel using iterator
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iterator = (this.persistence as any).db.iterator({
        sublevel: 'checkpoints',
      });

      for await (const [key, value] of iterator) {
        // Only include actual checkpoints (skip hash indexes)
        if (
          key.startsWith('height:') &&
          value &&
          typeof value === 'object' &&
          'checkpointHash' in value
        ) {
          checkpoints.push(value as StateCheckpoint);
        }
      }

      // Sort by height descending
      checkpoints.sort((a, b) => b.height - a.height);

      return checkpoints;
    } catch {
      return [];
    }
  }

  /**
   * Get the latest checkpoint
   */
  async getLatestCheckpoint(): Promise<StateCheckpoint | null> {
    const checkpoints = await this.getAvailableCheckpoints();
    return checkpoints.length > 0 ? checkpoints[0] : null;
  }

  /**
   * Internal: Calculate checkpoint hash
   */
  private calculateCheckpointHash(
    checkpoint: Omit<StateCheckpoint, 'checkpointHash'>
  ): string {
    // Create deterministic hash from checkpoint content
    const content = JSON.stringify({
      height: checkpoint.height,
      timestamp: checkpoint.timestamp,
      merkleRoot: checkpoint.merkleRoot,
      utxoCount: checkpoint.utxoCount,
      totalValue: checkpoint.totalValue.toString(),
      checkpointInterval: checkpoint.checkpointInterval,
      previousCheckpointHash: checkpoint.previousCheckpointHash,
      compressedDataHashes: checkpoint.compressedUTXOs.map(
        batch => batch.checksum
      ),
    });

    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Internal: Get previous checkpoint hash for chain continuity
   */
  private async getPreviousCheckpointHash(
    currentHeight: number
  ): Promise<string | undefined> {
    // Find the most recent checkpoint before current height
    const checkpoints = await this.getAvailableCheckpoints();

    for (const checkpoint of checkpoints) {
      if (checkpoint.height < currentHeight) {
        return checkpoint.checkpointHash;
      }
    }

    return undefined; // First checkpoint
  }

  /**
   * Internal: Convert UTXOs to transactions for merkle tree
   */
  private convertUTXOsToTransactions(utxos: UTXO[]): UTXOTransaction[] {
    // Create minimal UTXO transactions for merkle tree calculation
    return utxos.map(utxo => ({
      id: `${utxo.txId}:${utxo.outputIndex}`,
      inputs: [],
      outputs: [
        {
          value: utxo.value,
          lockingScript: utxo.lockingScript,
          outputIndex: utxo.outputIndex,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0,
    }));
  }

  /**
   * Internal: Compress UTXO set
   */
  private async compressUTXOSet(
    utxos: UTXO[],
    _compressionLevel: number
  ): Promise<CompressedUTXOBatch[]> {
    // Serialize UTXOs
    const serialized = JSON.stringify(utxos);
    const data = Buffer.from(serialized, 'utf-8');

    // Compress with compression manager
    const compressed = await this.compression.compress(data);

    // Calculate checksum
    const checksum = createHash('sha256').update(compressed.data).digest('hex');

    // Create batch
    const batch: CompressedUTXOBatch = {
      startIndex: 0,
      endIndex: utxos.length - 1,
      algorithm: compressed.algorithm,
      data: compressed.data,
      checksum,
    };

    return [batch];
  }

  /**
   * Internal: Store checkpoint in persistence layer
   */
  private async storeCheckpoint(checkpoint: StateCheckpoint): Promise<void> {
    // Store checkpoint by height
    const heightKey = `height:${checkpoint.height}`;
    await this.putToDatabase(heightKey, checkpoint);

    // Create hash index for fast lookup
    const hashKey = `hash:${checkpoint.checkpointHash}`;
    await this.putToDatabase(hashKey, checkpoint.height);
  }

  /**
   * Internal: Get data from database checkpoints sublevel
   */
  private async getFromDatabase<T>(key: string): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.persistence as any).db;
    return await db.get(key, 'checkpoints');
  }

  /**
   * Internal: Put data to database checkpoints sublevel
   */
  private async putToDatabase<T>(key: string, value: T): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.persistence as any).db;
    await db.put(key, value, 'checkpoints');
  }
}
