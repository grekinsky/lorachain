import type {
  Block,
  Transaction,
  UTXOTransaction,
  UTXO,
  BlockchainState,
  ValidationResult,
} from './types.js';
import { BlockManager } from './block.js';
import { UTXOManager } from './utxo.js';
import { UTXOTransactionManager } from './utxo-transaction.js';

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  debug(message: string): void {
    console.log(`[DEBUG] ${this.context}: ${message}`);
  }
  warn(message: string): void {
    console.warn(`[WARN] ${this.context}: ${message}`);
  }
  error(message: string): void {
    console.error(`[ERROR] ${this.context}: ${message}`);
  }
}

export class Blockchain {
  private blocks: Block[] = [];
  private utxoManager: UTXOManager;
  private utxoTransactionManager: UTXOTransactionManager;
  private pendingUTXOTransactions: UTXOTransaction[] = [];
  private difficulty: number = 2;
  private miningReward: number = 10;
  private maxBlockSize: number = 1024 * 1024; // 1MB in bytes
  private logger = new SimpleLogger('Blockchain');

  constructor() {
    this.utxoManager = new UTXOManager();
    this.utxoTransactionManager = new UTXOTransactionManager();

    const genesisBlock = BlockManager.createGenesisBlock();
    this.blocks.push(genesisBlock);

    // Initialize UTXO set with genesis block
    this.initializeUTXOFromGenesis(genesisBlock);
  }

  private initializeUTXOFromGenesis(genesisBlock: Block): void {
    // Process genesis block to create initial UTXO set
    for (const transaction of genesisBlock.transactions) {
      // Create UTXO for genesis transaction outputs (simplified for initial implementation)
      const utxo: UTXO = {
        txId: transaction.id,
        outputIndex: 0,
        value: transaction.amount,
        lockingScript: transaction.to,
        blockHeight: 0,
        isSpent: false,
      };
      this.utxoManager.addUTXO(utxo);
    }
    this.logger.debug('Initialized UTXO set from genesis block');
  }

  getLatestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  addTransaction(transaction: UTXOTransaction): ValidationResult {
    return this.addUTXOTransaction(transaction);
  }

  addUTXOTransaction(transaction: UTXOTransaction): ValidationResult {
    const validation = this.utxoTransactionManager.validateTransaction(
      transaction,
      this.utxoManager
    );
    if (!validation.isValid) {
      return validation;
    }

    const existingTransaction = this.pendingUTXOTransactions.find(
      tx => tx.id === transaction.id
    );
    if (existingTransaction) {
      return {
        isValid: false,
        errors: ['UTXO Transaction already exists in pending pool'],
      };
    }

    this.pendingUTXOTransactions.push(transaction);
    this.logger.debug(
      `Added UTXO transaction ${transaction.id} to pending pool`
    );
    return { isValid: true, errors: [] };
  }

  minePendingTransactions(minerAddress: string): Block | null {
    // Always create a mining reward transaction, even if no pending transactions

    // Create mining reward as UTXO transaction
    const availableUTXOs = this.utxoManager.getUTXOsForAddress('network');
    let rewardTransaction: UTXOTransaction;

    if (availableUTXOs.length === 0) {
      // Genesis-style reward transaction
      rewardTransaction = {
        id: `reward-${Date.now()}-${Math.random()}`,
        inputs: [],
        outputs: [
          {
            value: this.miningReward,
            lockingScript: minerAddress,
            outputIndex: 0,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0,
      };
    } else {
      rewardTransaction = this.utxoTransactionManager.createTransaction(
        'network',
        minerAddress,
        this.miningReward,
        'network-private-key',
        availableUTXOs
      );
    }

    const blockTransactions = [
      ...this.pendingUTXOTransactions,
      rewardTransaction,
    ];

    // Save the UTXO transactions for processing (before legacy conversion)
    const originalUTXOTransactions = [...blockTransactions];

    // Convert UTXOTransactions to legacy Transaction format for block creation
    const legacyTransactions = blockTransactions.map(utxoTx => ({
      id: utxoTx.id,
      from: utxoTx.inputs.length > 0 ? 'utxo-based' : 'network',
      to: utxoTx.outputs[0]?.lockingScript || 'unknown',
      amount: utxoTx.outputs.reduce((sum, output) => sum + output.value, 0),
      fee: utxoTx.fee,
      timestamp: utxoTx.timestamp,
      signature: 'utxo-signed',
      nonce: 0,
    }));

    const newBlock = BlockManager.createBlock(
      this.getLatestBlock().index + 1,
      legacyTransactions,
      this.getLatestBlock().hash,
      minerAddress
    );

    const minedBlock = BlockManager.mineBlock(newBlock, this.difficulty);
    this.blocks.push(minedBlock);

    this.logger.debug(
      `Mining block ${minedBlock.index} with ${minedBlock.transactions.length} transactions`
    );

    // Process UTXO updates with the original UTXO transactions
    this.processBlockUTXOs(minedBlock, originalUTXOTransactions);

    // Clear pending transactions after processing
    this.pendingUTXOTransactions = [];

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

    // Process UTXO transactions
    block.transactions.forEach(tx => {
      const index = this.pendingUTXOTransactions.findIndex(
        pending => pending.id === tx.id
      );
      if (index > -1) {
        this.pendingUTXOTransactions.splice(index, 1);
      }
    });

    // Process and update UTXO set for block transactions
    this.processBlockUTXOs(block);

    this.logger.debug(
      `Added block ${block.index} with ${block.transactions.length} transactions`
    );
    return { isValid: true, errors: [] };
  }

  private processBlockUTXOs(
    block: Block,
    originalUTXOTransactions?: UTXOTransaction[]
  ): void {
    const utxosToAdd: UTXO[] = [];
    const utxosToRemove: Array<{ txId: string; outputIndex: number }> = [];

    // Process UTXO transactions properly by reconstructing original UTXO structure
    for (const tx of block.transactions) {
      // Try to find the original UTXO transaction from the provided list or pending
      const originalUTXOTx =
        originalUTXOTransactions?.find(utxoTx => utxoTx.id === tx.id) ||
        this.pendingUTXOTransactions.find(utxoTx => utxoTx.id === tx.id);

      if (originalUTXOTx) {
        // Process each output from the original UTXO transaction
        for (const output of originalUTXOTx.outputs) {
          const newUTXO: UTXO = {
            txId: tx.id,
            outputIndex: output.outputIndex,
            value: output.value,
            lockingScript: output.lockingScript,
            blockHeight: block.index,
            isSpent: false,
          };
          this.logger.debug(
            `Creating UTXO for tx ${tx.id}[${output.outputIndex}]: value=${output.value}, lockingScript=${output.lockingScript}`
          );
          utxosToAdd.push(newUTXO);
        }

        // Remove spent UTXOs for inputs
        for (const input of originalUTXOTx.inputs) {
          utxosToRemove.push({
            txId: input.previousTxId,
            outputIndex: input.outputIndex,
          });
        }
      } else {
        // Fallback for genesis/reward transactions - create single UTXO
        const newUTXO: UTXO = {
          txId: tx.id,
          outputIndex: 0,
          value: tx.amount,
          lockingScript: tx.to,
          blockHeight: block.index,
          isSpent: false,
        };
        this.logger.debug(
          `Creating genesis UTXO for tx ${tx.id}: value=${tx.amount}, lockingScript=${tx.to}`
        );
        utxosToAdd.push(newUTXO);
      }
    }

    // Process any UTXO transactions that might be in the block
    // (This would be expanded when blocks can contain UTXOTransactions)

    // Apply all UTXO updates atomically
    if (utxosToAdd.length > 0 || utxosToRemove.length > 0) {
      this.utxoManager.applyUTXOUpdates(utxosToAdd, utxosToRemove);
      this.logger.debug(
        `Processed ${utxosToAdd.length} UTXO additions and ${utxosToRemove.length} removals for block ${block.index}`
      );
    }
  }

  getBalance(address: string): number {
    return this.utxoManager.calculateBalance(address);
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

  getPendingTransactions(): UTXOTransaction[] {
    return [...this.pendingUTXOTransactions];
  }

  getPendingUTXOTransactions(): UTXOTransaction[] {
    return [...this.pendingUTXOTransactions];
  }

  getUTXOsForAddress(address: string): UTXO[] {
    return this.utxoManager.getUTXOsForAddress(address);
  }

  getUTXOManager(): UTXOManager {
    return this.utxoManager;
  }

  createUTXOTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string
  ): UTXOTransaction {
    const availableUTXOs = this.utxoManager.getUTXOsForAddress(fromAddress);
    return this.utxoTransactionManager.createTransaction(
      fromAddress,
      toAddress,
      amount,
      privateKey,
      availableUTXOs
    );
  }

  getBlocks(): Block[] {
    return [...this.blocks];
  }

  getState(): BlockchainState {
    return {
      blocks: this.getBlocks(),
      pendingTransactions: [], // Legacy field - now empty
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
