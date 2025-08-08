import { createHash } from 'crypto';
import type {
  UTXOTransaction,
  MerkleProof,
  BlockHeader,
  ValidationResult,
  SPVValidationResult,
  IUTXOManager,
  UTXO,
} from '../types.js';
import { MerkleTree } from './MerkleTree.js';

export class SPVManager {
  /**
   * Verify transaction using Simplified Payment Verification
   * This allows light clients to verify transactions without full block data
   */
  static verifyTransaction(
    tx: UTXOTransaction,
    proof: MerkleProof,
    blockHeader: BlockHeader
  ): SPVValidationResult {
    const errors: string[] = [];
    let transactionVerified = false;
    let proofValid = false;
    let blockHeaderValid = false;

    // Verify the merkle proof
    proofValid = MerkleTree.verifyProof(proof, blockHeader.merkleRoot);
    if (!proofValid) {
      errors.push('Merkle proof verification failed');
    }

    // Verify transaction hash matches proof
    const txHash = createHash('sha256')
      .update(JSON.stringify(tx))
      .digest('hex');
    if (txHash !== proof.transactionHash) {
      errors.push('Transaction hash does not match proof');
      transactionVerified = false;
    } else {
      transactionVerified = true;
    }

    // Verify transaction ID matches
    if (tx.id !== proof.transactionId) {
      errors.push('Transaction ID does not match proof');
      transactionVerified = false;
    }

    // Basic block header validation (will be enhanced when previous header is available)
    blockHeaderValid = this.validateBasicBlockHeader(blockHeader);
    if (!blockHeaderValid) {
      errors.push('Block header validation failed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      transactionVerified,
      proofValid,
      blockHeaderValid,
    };
  }

  /**
   * Get transaction history for an address using merkle proofs
   * This allows light clients to maintain transaction history without full blockchain
   */
  static getTransactionHistory(
    _address: string,

    _proofs: MerkleProof[]
  ): UTXOTransaction[] {
    // Note: In a real implementation, this would require additional data
    // about which transactions belong to the address. For now, we return
    // an empty array as this method needs the actual transactions,
    // not just proofs.

    // This method should be called with validated proofs and their corresponding transactions
    return [];
  }

  /**
   * Calculate balance using SPV methods with UTXO manager
   * This leverages the existing UTXO system for accurate balance calculation
   */
  static calculateBalance(address: string, utxoManager: IUTXOManager): number {
    // Use existing UTXO manager for balance calculation
    return utxoManager.calculateBalance(address);
  }

  /**
   * Validate block header with previous header (chain validation)
   */
  static validateBlockHeader(
    header: BlockHeader,
    previousHeader: BlockHeader | null
  ): ValidationResult {
    const errors: string[] = [];

    // Basic header validation
    if (!this.validateBasicBlockHeader(header)) {
      errors.push('Basic block header validation failed');
    }

    // Chain continuity validation
    if (previousHeader) {
      if (header.index !== previousHeader.index + 1) {
        errors.push('Block index is not sequential');
      }

      if (header.previousHash !== previousHeader.hash) {
        errors.push('Previous hash does not match');
      }

      if (header.timestamp <= previousHeader.timestamp) {
        errors.push('Block timestamp must be greater than previous block');
      }
    }

    // Validate proof of work (if difficulty is specified)
    if (header.difficulty !== undefined) {
      const target = Array(header.difficulty + 1).join('0');
      if (!header.hash.startsWith(target)) {
        errors.push('Block does not meet difficulty requirement');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Verify multiple transactions in batch for efficiency
   * Optimized for LoRa network constraints
   */
  static verifyTransactionBatch(
    transactions: UTXOTransaction[],
    proofs: MerkleProof[],
    blockHeaders: BlockHeader[]
  ): SPVValidationResult[] {
    if (
      transactions.length !== proofs.length ||
      proofs.length !== blockHeaders.length
    ) {
      throw new Error(
        'Transactions, proofs, and block headers arrays must have the same length'
      );
    }

    const results: SPVValidationResult[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const result = this.verifyTransaction(
        transactions[i],
        proofs[i],
        blockHeaders[i]
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Check if a transaction has sufficient confirmations for SPV security
   */
  static hassufficientConfirmations(
    blockIndex: number,
    currentBlockHeight: number,
    requiredConfirmations: number = 6
  ): boolean {
    const confirmations = currentBlockHeight - blockIndex;
    return confirmations >= requiredConfirmations;
  }

  /**
   * Validate UTXO ownership using SPV methods
   * This can be used by light clients to verify they own specific UTXOs
   */
  static validateUTXOOwnership(
    utxo: UTXO,
    proof: MerkleProof,
    blockHeader: BlockHeader,
    publicKey: string
  ): boolean {
    // Verify the merkle proof against the block header
    const proofValid = MerkleTree.verifyProof(proof, blockHeader.merkleRoot);
    if (!proofValid) {
      return false;
    }

    // Verify transaction ID matches
    if (utxo.txId !== proof.transactionId) {
      return false;
    }

    // Check if the locking script matches the public key (simplified)
    // In a real implementation, this would involve proper script evaluation
    return utxo.lockingScript === publicKey;
  }

  /**
   * Create block header from essential block data
   * This is used to convert full blocks to headers for SPV clients
   */
  static createBlockHeader(
    index: number,
    timestamp: number,
    previousHash: string,
    merkleRoot: string,
    hash: string,
    nonce: number,
    transactionCount: number,
    difficulty?: number,
    validator?: string
  ): BlockHeader {
    return {
      index,
      timestamp,
      previousHash,
      merkleRoot,
      hash,
      nonce,
      transactionCount,
      difficulty,
      validator,
    };
  }

  // Private helper methods

  /**
   * Basic block header validation
   */
  private static validateBasicBlockHeader(header: BlockHeader): boolean {
    try {
      // Check required fields exist
      if (
        typeof header.index !== 'number' ||
        typeof header.timestamp !== 'number' ||
        typeof header.previousHash !== 'string' ||
        typeof header.merkleRoot !== 'string' ||
        typeof header.hash !== 'string' ||
        typeof header.nonce !== 'number' ||
        typeof header.transactionCount !== 'number'
      ) {
        return false;
      }

      // Check field constraints
      if (header.index < 0) return false;
      if (header.timestamp <= 0) return false;
      if (header.transactionCount < 0) return false;
      // Allow nonce to be 0 or positive
      if (header.nonce < 0) return false;

      // Check hash lengths (SHA-256 hashes are 64 hex characters)
      if (header.hash.length !== 64) return false;
      if (header.merkleRoot.length !== 64) return false;
      if (header.previousHash !== '0' && header.previousHash.length !== 64)
        return false;

      // Check hash format (must be hex) - be more lenient with case
      const hexRegex = /^[0-9a-fA-F]+$/;
      if (!hexRegex.test(header.hash)) return false;
      if (!hexRegex.test(header.merkleRoot)) return false;
      if (header.previousHash !== '0' && !hexRegex.test(header.previousHash))
        return false;

      return true;
    } catch {
      // If any error occurs during validation, return false
      return false;
    }
  }

  /**
   * Estimate proof size for LoRa transmission planning
   */
  static estimateProofSize(proof: MerkleProof): number {
    const baseSize = 128; // Transaction ID, hash, merkle root, leaf index
    const proofElementSize = 65; // Hash (64) + direction (1)
    return baseSize + proof.proof.length * proofElementSize;
  }

  /**
   * Check if proof fits within LoRa message size constraints
   */
  static fitsLoRaConstraints(proof: MerkleProof): boolean {
    const LORA_MAX_MESSAGE_SIZE = 256; // bytes
    const estimatedSize = this.estimateProofSize(proof);
    return estimatedSize <= LORA_MAX_MESSAGE_SIZE;
  }

  /**
   * Fragment large proofs for LoRa transmission
   * This splits proofs that are too large for single LoRa messages
   */
  static fragmentProof(proof: MerkleProof): MerkleProof[] {
    if (this.fitsLoRaConstraints(proof)) {
      return [proof]; // No fragmentation needed
    }

    // For now, return original proof as fragmentation requires
    // a more complex protocol for reassembly
    // In a real implementation, this would split the proof elements
    return [proof];
  }
}
