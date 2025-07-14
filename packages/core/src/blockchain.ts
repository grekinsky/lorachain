import type {
  Block,
  Transaction,
  BlockchainState,
  ValidationResult,
} from './types.js';
import { BlockManager } from './block.js';
import { TransactionManager } from './transaction.js';

export class Blockchain {
  private blocks: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  private difficulty: number = 2;
  private miningReward: number = 10;
  private maxBlockSize: number = 1024 * 1024; // 1MB in bytes

  constructor() {
    this.blocks.push(BlockManager.createGenesisBlock());
  }

  getLatestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  addTransaction(transaction: Transaction): ValidationResult {
    const validation = TransactionManager.validateTransaction(transaction);
    if (!validation.isValid) {
      return validation;
    }

    const existingTransaction = this.pendingTransactions.find(
      tx => tx.id === transaction.id
    );
    if (existingTransaction) {
      return {
        isValid: false,
        errors: ['Transaction already exists in pending pool'],
      };
    }

    this.pendingTransactions.push(transaction);
    return { isValid: true, errors: [] };
  }

  minePendingTransactions(minerAddress: string): Block | null {
    if (this.pendingTransactions.length === 0) {
      return null;
    }

    const rewardTransaction = TransactionManager.createTransaction(
      'network',
      minerAddress,
      this.miningReward,
      'network-private-key'
    );

    const blockTransactions = [...this.pendingTransactions, rewardTransaction];

    const newBlock = BlockManager.createBlock(
      this.getLatestBlock().index + 1,
      blockTransactions,
      this.getLatestBlock().hash,
      minerAddress
    );

    const estimatedSize = BlockManager.getBlockSize(newBlock);
    if (estimatedSize > this.maxBlockSize) {
      const maxTransactions = Math.floor(
        (this.maxBlockSize * blockTransactions.length) / estimatedSize
      );
      const limitedTransactions = blockTransactions.slice(0, maxTransactions);

      const limitedBlock = BlockManager.createBlock(
        this.getLatestBlock().index + 1,
        limitedTransactions,
        this.getLatestBlock().hash,
        minerAddress
      );

      const minedBlock = BlockManager.mineBlock(limitedBlock, this.difficulty);
      this.blocks.push(minedBlock);

      this.pendingTransactions = this.pendingTransactions.slice(
        maxTransactions - 1
      );

      return minedBlock;
    }

    const minedBlock = BlockManager.mineBlock(newBlock, this.difficulty);
    this.blocks.push(minedBlock);
    this.pendingTransactions = [];

    return minedBlock;
  }

  addBlock(block: Block): ValidationResult {
    const previousBlock = this.getLatestBlock();
    const validation = BlockManager.validateBlock(
      block,
      previousBlock,
      this.difficulty
    );

    if (!validation.isValid) {
      return validation;
    }

    this.blocks.push(block);

    block.transactions.forEach(tx => {
      const index = this.pendingTransactions.findIndex(
        pending => pending.id === tx.id
      );
      if (index > -1) {
        this.pendingTransactions.splice(index, 1);
      }
    });

    return { isValid: true, errors: [] };
  }

  getBalance(address: string): number {
    let balance = 0;

    for (const block of this.blocks) {
      for (const transaction of block.transactions) {
        if (transaction.from === address) {
          balance -= transaction.amount + transaction.fee;
        }
        if (transaction.to === address) {
          balance += transaction.amount;
        }
      }
    }

    return balance;
  }

  validateChain(): ValidationResult {
    const errors: string[] = [];

    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const previousBlock = this.blocks[i - 1];

      const blockValidation = BlockManager.validateBlock(
        currentBlock,
        previousBlock,
        this.difficulty
      );

      if (!blockValidation.isValid) {
        errors.push(
          `Block ${i} is invalid: ${blockValidation.errors.join(', ')}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getTransactionHistory(address: string): Transaction[] {
    const transactions: Transaction[] = [];

    for (const block of this.blocks) {
      for (const transaction of block.transactions) {
        if (transaction.from === address || transaction.to === address) {
          transactions.push(transaction);
        }
      }
    }

    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  }

  getPendingTransactions(): Transaction[] {
    return [...this.pendingTransactions];
  }

  getBlocks(): Block[] {
    return [...this.blocks];
  }

  getState(): BlockchainState {
    return {
      blocks: this.getBlocks(),
      pendingTransactions: this.getPendingTransactions(),
      difficulty: this.difficulty,
      miningReward: this.miningReward,
      networkNodes: [],
    };
  }

  setDifficulty(difficulty: number): void {
    this.difficulty = Math.max(1, difficulty);
  }

  getDifficulty(): number {
    return this.difficulty;
  }

  getMiningReward(): number {
    return this.miningReward;
  }
}
