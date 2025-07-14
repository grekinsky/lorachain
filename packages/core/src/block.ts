import { createHash } from 'crypto';
import type { Block, Transaction, ValidationResult } from './types.js';
import { TransactionManager } from './transaction.js';

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
    let minedBlock = { ...block };

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
}
