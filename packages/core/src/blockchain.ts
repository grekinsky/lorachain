import type {
  Block,
  Transaction,
  UTXOTransaction,
  UTXO,
  BlockchainState,
  ValidationResult,
  UTXOBlockchainState,
  UTXOPersistenceConfig,
} from './types.js';
import { BlockManager } from './block.js';
import { UTXOManager } from './utxo.js';
import { UTXOTransactionManager } from './utxo-transaction.js';
import { UTXOPersistenceManager } from './persistence.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';

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
  private persistence?: UTXOPersistenceManager;
  private autoSave: boolean = true;
  private logger = new SimpleLogger('Blockchain');

  constructor(persistence?: UTXOPersistenceManager, utxoManager?: UTXOManager) {
    this.persistence = persistence;
    this.utxoManager = utxoManager || new UTXOManager();
    this.utxoTransactionManager = new UTXOTransactionManager();

    // Only initialize genesis if no persistence or if we can't load state
    this.initializeBlockchain();
  }

  private async initializeBlockchain(): Promise<void> {
    if (this.persistence) {
      try {
        const loadedState = await this.persistence.loadBlockchainState();
        if (loadedState) {
          this.blocks = loadedState.blocks;
          this.difficulty = loadedState.difficulty;
          this.miningReward = loadedState.miningReward;
          this.pendingUTXOTransactions = loadedState.pendingUTXOTransactions;
          
          // Rebuild UTXO manager from loaded state
          this.utxoManager = new UTXOManager();
          for (const [, utxo] of loadedState.utxoSet) {
            this.utxoManager.addUTXO(utxo);
          }
          
          this.logger.debug(`Loaded blockchain state with ${this.blocks.length} blocks`);
          return;
        }
      } catch (error) {
        this.logger.warn(`Failed to load blockchain state: ${error}, initializing new blockchain`);
      }
    }

    // Initialize new blockchain with genesis block
    const genesisBlock = BlockManager.createGenesisBlock();
    this.blocks.push(genesisBlock);
    this.initializeUTXOFromGenesis(genesisBlock);
    
    // Save initial state if persistence is enabled
    if (this.persistence && this.autoSave) {
      await this.save();
    }
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

  async addTransaction(transaction: UTXOTransaction): Promise<ValidationResult> {
    return await this.addUTXOTransaction(transaction);
  }

  async addUTXOTransaction(transaction: UTXOTransaction): Promise<ValidationResult> {
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
    
    // Save to persistence if enabled
    if (this.persistence && this.autoSave) {
      await this.persistence.saveUTXOTransaction(transaction);
    }
    
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

  async addBlock(block: Block): Promise<ValidationResult> {
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

    // Save to persistence if enabled
    if (this.persistence && this.autoSave) {
      await this.persistence.saveBlock(block);
    }

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

  // Persistence-aware methods (UTXO-focused)
  async save(): Promise<void> {
    if (!this.persistence) {
      this.logger.warn('Persistence not enabled, cannot save state');
      return;
    }

    try {
      const state: UTXOBlockchainState = {
        blocks: this.blocks,
        utxoSet: this.utxoManager.getUTXOSetSnapshot(),
        pendingUTXOTransactions: this.pendingUTXOTransactions,
        difficulty: this.difficulty,
        miningReward: this.miningReward,
        latestBlockIndex: this.blocks.length - 1,
        utxoRootHash: this.calculateUTXORootHash(),
        cryptographicKeys: new Map(),
      };

      await this.persistence.saveBlockchainState(state);
      this.logger.debug('Blockchain state saved successfully');
    } catch (error) {
      this.logger.error(`Failed to save blockchain state: ${error}`);
      throw error;
    }
  }

  async load(): Promise<void> {
    if (!this.persistence) {
      this.logger.warn('Persistence not enabled, cannot load state');
      return;
    }

    await this.initializeBlockchain();
  }

  // UTXO-focused storage queries
  async getBlockByIndex(index: number): Promise<Block | null> {
    if (this.persistence) {
      return await this.persistence.getBlock(index);
    }
    return this.blocks[index] || null;
  }

  async getBlockByHash(hash: string): Promise<Block | null> {
    // First check in-memory blocks
    for (const block of this.blocks) {
      if (block.hash === hash) {
        return block;
      }
    }

    // If persistence is enabled, we could potentially search the database
    // For now, return null if not found in memory
    return null;
  }

  async getUTXOTransactionById(id: string): Promise<UTXOTransaction | null> {
    // First check pending transactions
    const pendingTx = this.pendingUTXOTransactions.find(tx => tx.id === id);
    if (pendingTx) {
      return pendingTx;
    }

    // Then check persistence
    if (this.persistence) {
      return await this.persistence.getUTXOTransaction(id);
    }

    return null;
  }

  async getUTXOsForAddress(address: string): Promise<UTXO[]> {
    if (this.persistence) {
      return await this.persistence.getUTXOsForAddress(address);
    }
    return this.utxoManager.getUTXOsForAddress(address);
  }

  async getBalanceFromStorage(address: string): Promise<number> {
    const utxos = await this.getUTXOsForAddress(address);
    return utxos.reduce((total, utxo) => total + utxo.value, 0);
  }

  async getUTXOFromStorage(txId: string, outputIndex: number): Promise<UTXO | null> {
    if (this.persistence) {
      return await this.persistence.getUTXO(txId, outputIndex);
    }
    return this.utxoManager.getUTXO(txId, outputIndex);
  }

  // UTXO set maintenance operations
  async validateUTXOSetIntegrity(): Promise<ValidationResult> {
    if (!this.persistence) {
      return { isValid: true, errors: [] };
    }

    return await this.persistence.validateIntegrity();
  }

  async rebuildUTXOSet(): Promise<void> {
    if (!this.persistence) {
      this.logger.warn('Persistence not enabled, cannot rebuild UTXO set');
      return;
    }

    await this.persistence.rebuildUTXOSet();
    
    // Reload the blockchain state to reflect the rebuilt UTXO set
    await this.load();
  }

  async compact(sublevel?: string): Promise<void> {
    if (!this.persistence) {
      this.logger.warn('Persistence not enabled, cannot compact database');
      return;
    }

    await this.persistence['db'].compact(sublevel);
    this.logger.debug(`Database compaction completed for sublevel: ${sublevel || 'all'}`);
  }

  async backup(path: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Persistence not enabled, cannot create backup');
    }

    // For now, this is a placeholder - would need to implement actual backup functionality
    this.logger.warn(`Backup functionality not yet implemented for path: ${path}`);
  }

  async restore(path: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Persistence not enabled, cannot restore from backup');
    }

    // For now, this is a placeholder - would need to implement actual restore functionality
    this.logger.warn(`Restore functionality not yet implemented for path: ${path}`);
  }

  // Utility methods
  private calculateUTXORootHash(): string {
    // Simple hash calculation for UTXO set root
    // In a full implementation, this would be a proper merkle root
    const utxoSet = this.utxoManager.getUTXOSetSnapshot();
    const utxoKeys = Array.from(utxoSet.keys()).sort();
    return CryptographicService.hashMessage(utxoKeys.join('')).toString();
  }

  // Configuration methods
  setAutoSave(enabled: boolean): void {
    this.autoSave = enabled;
    this.logger.debug(`Auto-save ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAutoSaveEnabled(): boolean {
    return this.autoSave;
  }

  hasPersistence(): boolean {
    return this.persistence !== undefined;
  }

  // Cleanup
  async close(): Promise<void> {
    if (this.persistence) {
      await this.persistence.close();
      this.logger.debug('Blockchain persistence closed');
    }
  }
}
