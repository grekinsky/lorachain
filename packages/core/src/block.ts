import { createHash } from 'crypto';
import type {
  Block,
  Transaction,
  UTXOTransaction,
  ValidationResult,
  MerkleProof,
  BlockHeader,
} from './types.js';
import { TransactionManager } from './transaction.js';
import { MerkleTree } from './merkle/index.js';

export class BlockManager {
  static createGenesisBlock(): Block {
    const genesisBlock: Block = {
      index: 0,
      timestamp: Date.now(),
      transactions: [],
      previousHash: '0',
      hash: '',
      nonce: 0,
      merkleRoot: this.calculateMerkleRoot([]),
    };

    genesisBlock.hash = this.calculateHash(genesisBlock);
    return genesisBlock;
  }

  static createBlock(
    index: number,
    transactions: Transaction[],
    previousHash: string,
    validator?: string
  ): Block {
    const block: Block = {
      index,
      timestamp: Date.now(),
      transactions,
      previousHash,
      hash: '',
      nonce: 0,
      merkleRoot: this.calculateMerkleRoot(transactions),
      validator,
    };

    block.hash = this.calculateHash(block);
    return block;
  }

  static calculateHash(block: Omit<Block, 'hash'>): string {
    const blockString = JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      transactions: block.transactions,
      previousHash: block.previousHash,
      nonce: block.nonce,
      merkleRoot: block.merkleRoot,
      validator: block.validator,
    });

    return createHash('sha256').update(blockString).digest('hex');
  }

  static calculateMerkleRoot(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }

    const hashes = transactions.map(tx =>
      createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );

    while (hashes.length > 1) {
      const newHashes: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;
        const combined = createHash('sha256')
          .update(left + right)
          .digest('hex');
        newHashes.push(combined);
      }
      hashes.length = 0;
      hashes.push(...newHashes);
    }

    return hashes[0];
  }

  static mineBlock(block: Block, difficulty: number): Block {
    const target = Array(difficulty + 1).join('0');
    const minedBlock = { ...block };

    while (minedBlock.hash.substring(0, difficulty) !== target) {
      minedBlock.nonce++;
      minedBlock.hash = this.calculateHash(minedBlock);
    }

    return minedBlock;
  }

  static validateBlock(
    block: Block,
    previousBlock: Block | null,
    difficulty: number
  ): ValidationResult {
    const errors: string[] = [];

    if (block.index < 0) {
      errors.push('Block index must be non-negative');
    }

    if (previousBlock && block.index !== previousBlock.index + 1) {
      errors.push('Block index must be sequential');
    }

    if (previousBlock && block.previousHash !== previousBlock.hash) {
      errors.push('Block previous hash does not match');
    }

    if (block.hash !== this.calculateHash(block)) {
      errors.push('Block hash is invalid');
    }

    if (block.merkleRoot !== this.calculateMerkleRoot(block.transactions)) {
      errors.push('Block merkle root is invalid');
    }

    for (const transaction of block.transactions) {
      const txValidation = TransactionManager.validateTransaction(transaction);
      if (!txValidation.isValid) {
        errors.push(
          `Invalid transaction ${transaction.id}: ${txValidation.errors.join(
            ', '
          )}`
        );
      }
    }

    const target = Array(difficulty + 1).join('0');
    if (block.hash.substring(0, difficulty) !== target) {
      errors.push('Block does not meet difficulty requirement');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static getBlockSize(block: Block): number {
    return JSON.stringify(block).length;
  }

  // Enhanced Merkle Tree Methods

  /**
   * Generate merkle proof for a transaction in a block
   * Uses legacy transaction support for current block structure
   */
  static generateMerkleProof(
    block: Block,
    transactionId: string
  ): MerkleProof | null {
    return MerkleTree.generateProofLegacy(block.transactions, transactionId);
  }

  /**
   * Verify transaction inclusion in block using merkle proof
   * Supports both legacy and UTXO transactions
   */
  static verifyTransactionInBlock(
    transaction: Transaction | UTXOTransaction,
    proof: MerkleProof,
    block: Block
  ): boolean {
    // Verify proof against block's merkle root
    const proofValid = MerkleTree.verifyProof(proof, block.merkleRoot);
    if (!proofValid) {
      return false;
    }

    // Verify transaction hash matches proof
    const txHash = createHash('sha256')
      .update(JSON.stringify(transaction))
      .digest('hex');
    if (txHash !== proof.transactionHash) {
      return false;
    }

    // Verify transaction ID matches
    if (transaction.id !== proof.transactionId) {
      return false;
    }

    return true;
  }

  /**
   * Create block header from full block
   * Essential for SPV clients that only need headers
   */
  static createBlockHeader(block: Block): BlockHeader {
    return {
      index: block.index,
      timestamp: block.timestamp,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      hash: block.hash,
      nonce: block.nonce,
      transactionCount: block.transactions.length,
      validator: block.validator,
    };
  }

  /**
   * Create block with UTXO transactions (future state)
   * This method supports the transition to UTXO-only blocks
   */
  static createBlockWithUTXO(
    index: number,
    transactions: UTXOTransaction[],
    previousHash: string,
    validator?: string
  ): Block {
    // For now, we need to convert UTXOTransactions to legacy format
    // to maintain compatibility with existing Block interface
    const legacyTransactions: Transaction[] = transactions.map(utxoTx => ({
      id: utxoTx.id,
      from: utxoTx.inputs[0]?.previousTxId || 'genesis',
      to: utxoTx.outputs[0]?.lockingScript || '',
      amount: utxoTx.outputs.reduce((sum, output) => sum + output.value, 0),
      fee: utxoTx.fee,
      timestamp: utxoTx.timestamp,
      signature: utxoTx.inputs[0]?.unlockingScript || '',
      nonce: 0,
    }));

    const block: Block = {
      index,
      timestamp: Date.now(),
      transactions: legacyTransactions,
      previousHash,
      hash: '',
      nonce: 0,
      merkleRoot: MerkleTree.calculateRoot(transactions),
      validator,
    };

    block.hash = this.calculateHash(block);
    return block;
  }

  /**
   * Generate merkle proof for UTXO transaction (future state)
   * This method will be used when blocks fully support UTXO transactions
   */
  static generateMerkleProofUTXO(
    transactions: UTXOTransaction[],
    transactionId: string
  ): MerkleProof | null {
    return MerkleTree.generateProof(transactions, transactionId);
  }

  /**
   * Verify block's merkle root calculation is correct
   * This method validates that the stored merkle root matches calculated value
   */
  static verifyBlockMerkleRoot(block: Block): boolean {
    const calculatedRoot = this.calculateMerkleRoot(block.transactions);
    return calculatedRoot === block.merkleRoot;
  }

  /**
   * Get transaction by ID from block
   * Helper method for proof generation and verification
   */
  static getTransactionById(
    block: Block,
    transactionId: string
  ): Transaction | null {
    return block.transactions.find(tx => tx.id === transactionId) || null;
  }

  /**
   * Get all transaction IDs from block
   * Useful for generating multiple proofs or analysis
   */
  static getTransactionIds(block: Block): string[] {
    return block.transactions.map(tx => tx.id);
  }

  /**
   * Calculate merkle root for UTXO transactions
   * This provides consistency with the MerkleTree class
   */
  static calculateMerkleRootUTXO(transactions: UTXOTransaction[]): string {
    return MerkleTree.calculateRoot(transactions);
  }
}
