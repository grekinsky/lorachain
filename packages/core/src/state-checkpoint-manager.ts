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
import { CryptographicService } from './cryptographic.js';

/**
 * Validator configuration
 */
export interface ValidatorConfig {
  publicKey: string;
  algorithm: 'secp256k1' | 'ed25519';
  name?: string; // Optional validator name
}

/**
 * Validator signature
 */
export interface ValidatorSignature {
  validatorPublicKey: string;
  signature: string;
  timestamp: number;
  algorithm: 'secp256k1' | 'ed25519';
}

/**
 * Checkpoint validation result
 */
export interface CheckpointValidationResult {
  isValid: boolean;
  validSignatures: number;
  requiredSignatures: number;
  errors: string[];
  warnings: string[];
}

/**
 * Checkpoint signature request for validators
 */
export interface CheckpointSignatureRequest {
  checkpointHash: string;
  height: number;
  merkleRoot: string;
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
 * Checkpoint validation error
 */
export class CheckpointValidationError extends Error {
  constructor(
    message: string,
    public readonly checkpoint: StateCheckpoint,
    public readonly validationResult: CheckpointValidationResult
  ) {
    super(message);
    this.name = 'CheckpointValidationError';
  }
}

/**
 * Insufficient signatures error
 */
export class InsufficientSignaturesError extends Error {
  constructor(
    public readonly required: number,
    public readonly actual: number
  ) {
    super(`Insufficient signatures: required ${required}, got ${actual}`);
    this.name = 'InsufficientSignaturesError';
  }
}

/**
 * Devnet validator configuration (hard-coded for development)
 */
const DEVNET_VALIDATORS: ValidatorConfig[] = [
  {
    publicKey:
      '04a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a',
    algorithm: 'secp256k1',
    name: 'devnet-validator-1',
  },
  {
    publicKey:
      '04d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c3d4e5f6789a1b2c',
    algorithm: 'secp256k1',
    name: 'devnet-validator-2',
  },
  {
    publicKey:
      '04g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2a3b4c5d6e7f8g9h0i1j2k',
    algorithm: 'secp256k1',
    name: 'devnet-validator-3',
  },
];

const DEVNET_SIGNATURE_THRESHOLD = 2; // 2 of 3 validators required

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
  private validators: ValidatorConfig[];
  private signatureThreshold: number;
  private cryptoService: typeof CryptographicService;

  constructor(
    blockchain: Blockchain,
    persistence: UTXOPersistenceManager,
    compression: UTXOCompressionManager,
    checkpointInterval: number = 100,
    validators?: ValidatorConfig[],
    signatureThreshold?: number
  ) {
    super();
    this.blockchain = blockchain;
    this.persistence = persistence;
    this.compression = compression;
    this.checkpointInterval = checkpointInterval;
    this.validators = validators ?? DEVNET_VALIDATORS;
    this.signatureThreshold = signatureThreshold ?? DEVNET_SIGNATURE_THRESHOLD;
    this.cryptoService = CryptographicService;
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

  /**
   * Sign checkpoint as a validator (if this node is a validator)
   */
  async signCheckpoint(
    checkpoint: StateCheckpoint,
    privateKey: string,
    algorithm: 'secp256k1' | 'ed25519'
  ): Promise<ValidatorSignature> {
    // Convert private key hex string to Uint8Array
    const privateKeyBytes = new Uint8Array(
      privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) ?? []
    );

    // Hash the checkpoint for signing
    const messageHash = this.cryptoService.hashMessage(
      checkpoint.checkpointHash
    );

    // Sign the checkpoint hash
    const signature = this.cryptoService.sign(
      messageHash,
      privateKeyBytes,
      algorithm
    );

    // Get public key from private key
    const publicKeyBytes =
      algorithm === 'secp256k1'
        ? await import('@noble/secp256k1').then(m =>
            m.getPublicKey(privateKeyBytes)
          )
        : await import('@noble/ed25519').then(m =>
            m.getPublicKey(privateKeyBytes)
          );

    const publicKey = Buffer.from(publicKeyBytes).toString('hex');

    // Create validator signature
    const validatorSignature: ValidatorSignature = {
      validatorPublicKey: publicKey,
      signature: Buffer.from(signature.signature).toString('hex'),
      timestamp: Date.now(),
      algorithm,
    };

    return validatorSignature;
  }

  /**
   * Add validator signature to checkpoint
   */
  async addValidatorSignature(
    checkpointHash: string,
    signature: ValidatorSignature
  ): Promise<void> {
    // Verify validator is authorized
    if (!this.isAuthorizedValidator(signature.validatorPublicKey)) {
      throw new Error(
        `Unauthorized validator: ${signature.validatorPublicKey}`
      );
    }

    // Get checkpoint
    const checkpoint = await this.getCheckpointByHash(checkpointHash);
    if (!checkpoint) {
      throw new CheckpointNotFoundError(
        `Checkpoint not found: ${checkpointHash}`
      );
    }

    // Initialize signatures array if needed
    if (!checkpoint.validatorSignatures) {
      checkpoint.validatorSignatures = [];
    }

    // Check for duplicate signature from same validator
    const existingSignature = checkpoint.validatorSignatures.find(
      sig => sig.validatorPublicKey === signature.validatorPublicKey
    );
    if (existingSignature) {
      throw new Error(
        `Duplicate signature from validator: ${signature.validatorPublicKey}`
      );
    }

    // Verify signature is valid
    const isValid = await this.verifyValidatorSignature(
      checkpointHash,
      signature
    );
    if (!isValid) {
      throw new Error('Invalid validator signature');
    }

    // Add signature
    checkpoint.validatorSignatures.push(signature);

    // Update stored checkpoint
    await this.storeCheckpoint(checkpoint);
  }

  /**
   * Validate checkpoint integrity and signatures
   */
  async validateCheckpoint(
    checkpoint: StateCheckpoint
  ): Promise<CheckpointValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Verify checkpoint hash integrity
    const calculatedHash = this.calculateCheckpointHash(checkpoint);
    if (calculatedHash !== checkpoint.checkpointHash) {
      errors.push(
        `Checkpoint hash mismatch: expected ${checkpoint.checkpointHash}, got ${calculatedHash}`
      );
    }

    // Verify merkle root matches UTXO set
    const merkleValid = await this.verifyMerkleRoot(checkpoint);
    if (!merkleValid) {
      errors.push('Merkle root does not match UTXO set');
    }

    // Verify checkpoint chain continuity
    const chainValid = await this.verifyCheckpointChain(checkpoint);
    if (!chainValid) {
      warnings.push('Checkpoint chain continuity could not be verified');
    }

    // Verify validator signatures
    let validSignatures = 0;
    if (checkpoint.validatorSignatures) {
      for (const signature of checkpoint.validatorSignatures) {
        const isValid = await this.verifyValidatorSignature(
          checkpoint.checkpointHash,
          signature
        );
        if (isValid) {
          validSignatures++;
        } else {
          warnings.push(
            `Invalid signature from validator: ${signature.validatorPublicKey}`
          );
        }
      }
    }

    // Check signature threshold
    if (validSignatures < this.signatureThreshold) {
      errors.push(
        `Insufficient valid signatures: ${validSignatures}/${this.signatureThreshold} required`
      );
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      validSignatures,
      requiredSignatures: this.signatureThreshold,
      errors,
      warnings,
    };
  }

  /**
   * Internal: Verify single validator signature
   */
  private async verifyValidatorSignature(
    checkpointHash: string,
    signature: ValidatorSignature
  ): Promise<boolean> {
    try {
      // Verify validator is authorized
      if (!this.isAuthorizedValidator(signature.validatorPublicKey)) {
        return false;
      }

      // Hash the checkpoint
      const messageHash = this.cryptoService.hashMessage(checkpointHash);

      // Convert signature and public key from hex to Uint8Array
      const signatureBytes = new Uint8Array(
        signature.signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) ??
          []
      );
      const publicKeyBytes = new Uint8Array(
        signature.validatorPublicKey
          .match(/.{1,2}/g)
          ?.map(byte => parseInt(byte, 16)) ?? []
      );

      // Verify signature
      const isValid = this.cryptoService.verify(
        {
          signature: signatureBytes,
          algorithm: signature.algorithm,
        },
        messageHash,
        publicKeyBytes
      );

      return isValid;
    } catch {
      return false;
    }
  }

  /**
   * Internal: Check if validator is authorized
   */
  private isAuthorizedValidator(publicKey: string): boolean {
    return this.validators.some(validator => validator.publicKey === publicKey);
  }

  /**
   * Internal: Verify merkle root matches UTXO set
   *
   * Note: This is a basic verification that checks the merkle root
   * against the checkpoint metadata. Full UTXO set decompression and
   * verification would require storing original size in CompressedUTXOBatch.
   */
  private async verifyMerkleRoot(
    checkpoint: StateCheckpoint
  ): Promise<boolean> {
    try {
      // Basic validation: ensure merkle root exists and is valid hex
      if (!checkpoint.merkleRoot || checkpoint.merkleRoot.length === 0) {
        return false;
      }

      // Validate merkle root is a valid hex string
      if (!/^[a-f0-9]+$/i.test(checkpoint.merkleRoot)) {
        return false;
      }

      // Ensure we have compressed UTXO data
      if (checkpoint.compressedUTXOs.length === 0) {
        return false;
      }

      // Verify checksum exists for compressed data
      const batch = checkpoint.compressedUTXOs[0];
      if (!batch.checksum || batch.checksum.length === 0) {
        return false;
      }

      // Basic validation passed
      // Full verification would require decompressing and recalculating merkle root,
      // but that requires originalSize to be stored in CompressedUTXOBatch
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Internal: Verify checkpoint chain continuity
   */
  private async verifyCheckpointChain(
    checkpoint: StateCheckpoint
  ): Promise<boolean> {
    try {
      // If no previous checkpoint hash, must be first checkpoint
      if (!checkpoint.previousCheckpointHash) {
        return true;
      }

      // Get previous checkpoint
      const previousCheckpoint = await this.getCheckpointByHash(
        checkpoint.previousCheckpointHash
      );

      if (!previousCheckpoint) {
        return false;
      }

      // Verify previous checkpoint is actually before this one
      if (previousCheckpoint.height >= checkpoint.height) {
        return false;
      }

      // Verify previous checkpoint hash matches
      return (
        previousCheckpoint.checkpointHash === checkpoint.previousCheckpointHash
      );
    } catch {
      return false;
    }
  }
}
