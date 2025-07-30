import { createHash } from 'crypto';
import type {
  Block,
  Transaction,
  UTXOTransaction,
  ValidationResult,
  MerkleProof,
  BlockHeader,
  GenesisConfig,
} from './types.js';
import { TransactionManager } from './transaction.js';
import { MerkleTree } from './merkle/index.js';
import { GenesisConfigManager } from './genesis/index.js';

export class BlockManager {
  /**
   * Create genesis block with optional configuration
   * BREAKING CHANGE: Now supports GenesisConfig parameter
   * @param difficultyOrConfig - Legacy difficulty number or GenesisConfig object
   * @returns Genesis block
   */
  static createGenesisBlock(
    difficultyOrConfig: number | GenesisConfig = 1
  ): Block {
    // Handle legacy difficulty parameter for backward compatibility
    if (typeof difficultyOrConfig === 'number') {
      const difficulty = difficultyOrConfig;
      const genesisBlock: Block = {
        index: 0,
        timestamp: Date.now(),
        transactions: [],
        previousHash: '0',
        hash: '',
        nonce: 0,
        merkleRoot: this.calculateMerkleRoot([]),
        difficulty,
      };

      genesisBlock.hash = this.calculateHash(genesisBlock);
      return genesisBlock;
    }

    // Handle GenesisConfig parameter
    const config = difficultyOrConfig as GenesisConfig;
    return GenesisConfigManager.createGenesisBlock(config);
  }

  static createBlock(
    index: number,
    transactions: Transaction[],
    previousHash: string,
    difficulty: number,
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
      difficulty,
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
      difficulty: block.difficulty,
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

  static mineBlock(block: Block): Block {
    const target = Array(block.difficulty + 1).join('0');
    const minedBlock = { ...block };

    while (minedBlock.hash.substring(0, block.difficulty) !== target) {
      minedBlock.nonce++;
      minedBlock.hash = this.calculateHash(minedBlock);
    }

    return minedBlock;
  }

  static validateBlock(
    block: Block,
    previousBlock: Block | null
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

    // Validate difficulty field exists
    if (block.difficulty === undefined || block.difficulty < 1) {
      errors.push('Block must have a valid difficulty field');
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

    // Validate block meets its own difficulty requirement (only if difficulty is valid and not genesis block)
    if (
      block.difficulty !== undefined &&
      block.difficulty >= 1 &&
      block.index > 0
    ) {
      const target = Array(block.difficulty + 1).join('0');
      if (block.hash.substring(0, block.difficulty) !== target) {
        errors.push('Block does not meet its difficulty requirement');
      }
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
   * Note: This requires the block to contain UTXO transactions
   */
  static generateMerkleProof(
    transactions: UTXOTransaction[],
    transactionId: string
  ): MerkleProof | null {
    return MerkleTree.generateProof(transactions, transactionId);
  }

  /**
   * Verify transaction inclusion using merkle proof
   */
  static verifyTransactionInBlock(
    transaction: UTXOTransaction,
    proof: MerkleProof,
    merkleRoot: string
  ): boolean {
    // Verify proof against merkle root
    const proofValid = MerkleTree.verifyProof(proof, merkleRoot);
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
   * Create UTXO block structure (for future UTXO-only blocks)
   * Note: This creates a structure optimized for UTXO transactions
   */
  static createUTXOBlock(
    index: number,
    transactions: UTXOTransaction[],
    previousHash: string,
    difficulty: number,
    validator?: string
  ): {
    index: number;
    timestamp: number;
    transactions: UTXOTransaction[];
    previousHash: string;
    hash: string;
    nonce: number;
    merkleRoot: string;
    difficulty: number;
    validator?: string;
  } {
    const utxoBlock = {
      index,
      timestamp: Date.now(),
      transactions,
      previousHash,
      hash: '',
      nonce: 0,
      merkleRoot: MerkleTree.calculateRoot(transactions),
      difficulty,
      validator,
    };

    // Calculate hash for UTXO block structure
    const blockString = JSON.stringify({
      index: utxoBlock.index,
      timestamp: utxoBlock.timestamp,
      transactions: utxoBlock.transactions,
      previousHash: utxoBlock.previousHash,
      nonce: utxoBlock.nonce,
      merkleRoot: utxoBlock.merkleRoot,
      difficulty: utxoBlock.difficulty,
      validator: utxoBlock.validator,
    });

    utxoBlock.hash = createHash('sha256').update(blockString).digest('hex');
    return utxoBlock;
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
}
