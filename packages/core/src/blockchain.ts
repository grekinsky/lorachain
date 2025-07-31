import type {
  Block,
  Transaction,
  UTXOTransaction,
  UTXO,
  BlockchainState,
  ValidationResult,
  UTXOBlockchainState,
  UTXOPersistenceConfig,
  GenesisConfig,
  NetworkParameters,
  InitialAllocation,
} from './types.js';
import { BlockManager } from './block.js';
import { UTXOManager } from './utxo.js';
import { UTXOTransactionManager } from './utxo-transaction.js';
import { UTXOPersistenceManager } from './persistence.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import {
  DifficultyManager,
  type DifficultyConfig,
  type DifficultyState,
} from './difficulty.js';
import { GenesisConfigManager } from './genesis/index.js';

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
  private difficultyManager: DifficultyManager = new DifficultyManager();
  private targetBlockTime: number = 300; // 5 minutes
  private adjustmentPeriod: number = 10; // 10 blocks
  private maxDifficultyRatio: number = 4; // 4x max change
  private genesisConfigManager?: GenesisConfigManager;
  private genesisConfig?: GenesisConfig;
  private chainId?: string;
  private initializationPromise?: Promise<void>;

  constructor(
    persistence: UTXOPersistenceManager,
    utxoManager: UTXOManager,
    difficultyConfig: Partial<DifficultyConfig>,
    genesisConfig: GenesisConfig | string // REQUIRED - config object or chain ID
  ) {
    this.persistence = persistence;
    this.utxoManager = utxoManager;
    this.utxoTransactionManager = new UTXOTransactionManager();

    // Initialize GenesisConfigManager - now required
    this.genesisConfigManager = new GenesisConfigManager(this.persistence);

    // Initialize blockchain with genesis configuration - NO FALLBACKS
    this.initializationPromise = this.initializeWithGenesisConfig(
      genesisConfig,
      difficultyConfig
    );
  }

  private async initializeWithGenesisConfig(
    genesisConfigParam: GenesisConfig | string,
    difficultyConfig: Partial<DifficultyConfig>
  ): Promise<void> {
    // Load or create genesis configuration
    let config: GenesisConfig;

    if (typeof genesisConfigParam === 'string') {
      // Try to load from database first, then from config file
      let loadedConfig =
        await this.genesisConfigManager!.loadConfigFromDatabase(
          genesisConfigParam
        );

      if (!loadedConfig) {
        // Try to load from config file (e.g., mainnet.json)
        try {
          loadedConfig =
            await this.genesisConfigManager!.loadConfigFromFile(
              genesisConfigParam
            );
        } catch (fileError) {
          throw new Error(
            `Genesis configuration not found for chain ID: ${genesisConfigParam}. Neither in database nor config file.`
          );
        }
      }

      config = loadedConfig;
    } else {
      // Use provided config
      config = genesisConfigParam;
      // Save to database
      await this.genesisConfigManager!.saveConfigToDatabase(config);
    }

    this.genesisConfig = config;
    this.chainId = config.chainId;

    // Apply network parameters from genesis config
    this.applyNetworkParameters(config.networkParams, difficultyConfig);

    // Initialize blockchain state with persistence (required)
    await this.initializeBlockchainWithPersistence(config);

    this.logger.debug(
      `Blockchain initialized with genesis config for chain: ${config.chainId}`
    );
  }

  private applyNetworkParameters(
    networkParams: NetworkParameters,
    difficultyConfigParam?: Partial<DifficultyConfig>
  ): void {
    // Apply network parameters from genesis config (genesis config takes precedence)
    this.difficulty = networkParams.initialDifficulty;
    this.miningReward = networkParams.miningReward;
    this.maxBlockSize = networkParams.maxBlockSize;
    this.targetBlockTime = networkParams.targetBlockTime;
    this.adjustmentPeriod = networkParams.adjustmentPeriod;
    this.maxDifficultyRatio = networkParams.maxDifficultyRatio;

    // Initialize difficulty manager with combined config
    const difficultyConfig: DifficultyConfig = {
      targetBlockTime: this.targetBlockTime,
      adjustmentPeriod: this.adjustmentPeriod,
      maxDifficultyRatio: this.maxDifficultyRatio,
      minDifficulty: difficultyConfigParam?.minDifficulty || 1,
      maxDifficulty: difficultyConfigParam?.maxDifficulty || 4,
    };

    this.difficultyManager = new DifficultyManager(difficultyConfig);
  }

  private async initializeBlockchainWithPersistence(
    config: GenesisConfig
  ): Promise<void> {
    try {
      // Try to load existing blockchain state
      const loadedState = await this.persistence!.loadBlockchainState();
      if (loadedState && loadedState.blocks.length > 0) {
        // Validate that the loaded state matches the genesis config
        const existingGenesisBlock = loadedState.blocks[0];
        const expectedGenesisBlock = BlockManager.createGenesisBlock(config);

        if (existingGenesisBlock.hash === expectedGenesisBlock.hash) {
          // Compatible blockchain state found, load it
          this.blocks = loadedState.blocks;
          this.difficulty = loadedState.difficulty;
          this.miningReward = loadedState.miningReward;
          this.pendingUTXOTransactions = loadedState.pendingUTXOTransactions;

          // Rebuild UTXO manager from loaded state
          this.utxoManager = new UTXOManager();
          for (const [, utxo] of loadedState.utxoSet) {
            this.utxoManager.addUTXO(utxo);
          }

          this.logger.debug(
            `Loaded compatible blockchain state with ${this.blocks.length} blocks`
          );
          return;
        } else {
          this.logger.warn(
            'Existing blockchain state incompatible with genesis config, creating new chain'
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load blockchain state: ${error}, creating new genesis`
      );
    }

    // Create new blockchain with genesis configuration
    await this.createGenesisBlockchainState(config);
  }

  private initializeBlockchainWithoutPersistence(config: GenesisConfig): void {
    // Create genesis block from configuration
    const genesisBlock = BlockManager.createGenesisBlock(config);
    this.blocks = [genesisBlock];
    this.initializeUTXOFromGenesisConfig(genesisBlock, config);
  }

  private async createGenesisBlockchainState(
    config: GenesisConfig
  ): Promise<void> {
    // Create and persist genesis block with configuration
    const genesisBlock =
      await this.genesisConfigManager!.createAndPersistGenesisBlock(config);
    this.blocks = [genesisBlock];

    // Initialize UTXO set from genesis allocations
    this.initializeUTXOFromGenesisConfig(genesisBlock, config);

    // Save initial blockchain state
    if (this.autoSave) {
      await this.save();
    }
  }

  private initializeUTXOFromGenesisConfig(
    genesisBlock: Block,
    config: GenesisConfig
  ): void {
    // Create UTXOs from genesis configuration allocations
    const genesisTransactions =
      GenesisConfigManager.createGenesisUTXOTransactions(
        config.initialAllocations
      );

    for (const utxoTx of genesisTransactions) {
      for (const output of utxoTx.outputs) {
        const utxo: UTXO = {
          txId: utxoTx.id,
          outputIndex: output.outputIndex,
          value: output.value,
          lockingScript: output.lockingScript,
          blockHeight: 0, // Genesis block
          isSpent: false,
        };
        this.utxoManager.addUTXO(utxo);
      }
    }

    this.logger.debug(
      `Initialized UTXO set from genesis config: ${config.initialAllocations.length} allocations, ` +
        `total supply: ${config.totalSupply}`
    );
  }

  /**
   * Wait for blockchain initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  getLatestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  async addTransaction(
    transaction: UTXOTransaction
  ): Promise<ValidationResult> {
    return await this.addUTXOTransaction(transaction);
  }

  async addUTXOTransaction(
    transaction: UTXOTransaction
  ): Promise<ValidationResult> {
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
    return this.minePendingUTXOTransactions(minerAddress);
  }

  minePendingUTXOTransactions(minerAddress: string): Block | null {
    this.logger.debug(`Starting to mine block for ${minerAddress}`);

    // Check if difficulty should be adjusted
    const nextBlockIndex = this.getLatestBlock().index + 1;
    this.logger.debug(
      `Next block index: ${nextBlockIndex}, should adjust: ${this.shouldAdjustDifficulty()}`
    );

    if (this.shouldAdjustDifficulty()) {
      this.logger.debug(`Calculating next difficulty...`);
      const newDifficulty = this.calculateNextDifficulty();
      this.logger.debug(
        `Adjusting difficulty from ${this.difficulty} to ${newDifficulty} at block ${nextBlockIndex}`
      );
      this.difficulty = newDifficulty;
    }

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
      nextBlockIndex,
      legacyTransactions,
      this.getLatestBlock().hash,
      this.difficulty,
      minerAddress
    );

    const minedBlock = BlockManager.mineBlock(newBlock);
    this.blocks.push(minedBlock);

    this.logger.debug(
      `Mining block ${minedBlock.index} with ${minedBlock.transactions.length} transactions at difficulty ${minedBlock.difficulty}`
    );

    // Process UTXO updates with the original UTXO transactions
    this.processBlockUTXOs(minedBlock, originalUTXOTransactions);

    // Clear pending transactions after processing
    this.pendingUTXOTransactions = [];

    return minedBlock;
  }

  async addBlock(block: Block): Promise<ValidationResult> {
    const previousBlock = this.getLatestBlock();
    const validation = BlockManager.validateBlock(block, previousBlock);

    // Additional validation for difficulty
    if (validation.isValid && block.difficulty !== this.difficulty) {
      // Allow difficulty changes only at adjustment intervals
      if (this.difficultyManager.shouldAdjustDifficulty(block.index)) {
        const expectedDifficulty = this.calculateNextDifficulty();
        if (block.difficulty !== expectedDifficulty) {
          validation.errors.push(
            `Invalid difficulty adjustment: expected ${expectedDifficulty}, got ${block.difficulty}`
          );
          validation.isValid = false;
        }
      } else {
        validation.errors.push(
          `Difficulty cannot change at block ${block.index}: expected ${this.difficulty}, got ${block.difficulty}`
        );
        validation.isValid = false;
      }
    }

    if (!validation.isValid) {
      return validation;
    }

    this.blocks.push(block);

    // Update difficulty if this was an adjustment block
    if (this.difficultyManager.shouldAdjustDifficulty(block.index)) {
      this.difficulty = block.difficulty;
      this.logger.debug(
        `Difficulty adjusted to ${this.difficulty} at block ${block.index}`
      );
    }

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
        previousBlock
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

    try {
      // Load existing blockchain state
      const loadedState = await this.persistence.loadBlockchainState();
      if (loadedState && loadedState.blocks.length > 0) {
        // Load the blockchain state
        this.blocks = loadedState.blocks;
        this.difficulty = loadedState.difficulty;
        this.miningReward = loadedState.miningReward;
        this.pendingUTXOTransactions = loadedState.pendingUTXOTransactions;

        // Rebuild UTXO manager from loaded state
        this.utxoManager = new UTXOManager();
        for (const [, utxo] of loadedState.utxoSet) {
          this.utxoManager.addUTXO(utxo);
        }

        this.logger.debug(
          `Loaded blockchain state with ${this.blocks.length} blocks`
        );
      } else {
        this.logger.warn('No blockchain state found to load');
      }
    } catch (error) {
      this.logger.error(`Failed to load blockchain state: ${error}`);
      throw error;
    }
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

  async getUTXOFromStorage(
    txId: string,
    outputIndex: number
  ): Promise<UTXO | null> {
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
    this.logger.debug(
      `Database compaction completed for sublevel: ${sublevel || 'all'}`
    );
  }

  async backup(path: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Persistence not enabled, cannot create backup');
    }

    // For now, this is a placeholder - would need to implement actual backup functionality
    this.logger.warn(
      `Backup functionality not yet implemented for path: ${path}`
    );
  }

  async restore(path: string): Promise<void> {
    if (!this.persistence) {
      throw new Error('Persistence not enabled, cannot restore from backup');
    }

    // For now, this is a placeholder - would need to implement actual restore functionality
    this.logger.warn(
      `Restore functionality not yet implemented for path: ${path}`
    );
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

  // Difficulty adjustment methods

  /**
   * Calculate the next difficulty based on recent block times
   */
  calculateNextDifficulty(): number {
    return this.difficultyManager.calculateNextDifficulty(
      this.difficulty,
      this.blocks
    );
  }

  /**
   * Get estimated network hashrate
   */
  getNetworkHashrate(sampleSize?: number): number {
    return DifficultyManager.calculateNetworkHashrate(this.blocks, sampleSize);
  }

  /**
   * Check if difficulty should be adjusted
   */
  shouldAdjustDifficulty(): boolean {
    const nextBlockHeight = this.getLatestBlock().index + 1;
    return this.difficultyManager.shouldAdjustDifficulty(nextBlockHeight);
  }

  /**
   * Get current difficulty state
   */
  getDifficultyState(): DifficultyState {
    return this.difficultyManager.getDifficultyState(
      this.blocks,
      this.difficulty
    );
  }

  /**
   * Get current difficulty
   */
  getCurrentDifficulty(): number {
    return this.difficulty;
  }

  /**
   * Get next difficulty (what it would be if adjusted now)
   */
  getNextDifficulty(): number {
    if (this.shouldAdjustDifficulty()) {
      return this.calculateNextDifficulty();
    }
    return this.difficulty;
  }

  /**
   * Set target block time
   */
  setTargetBlockTime(seconds: number): void {
    if (seconds < 60 || seconds > 1800) {
      throw new Error('Target block time must be between 60 and 1800 seconds');
    }
    this.targetBlockTime = seconds;
    // Recreate difficulty manager with new config
    this.difficultyManager = new DifficultyManager({
      targetBlockTime: seconds,
      adjustmentPeriod: this.adjustmentPeriod,
      maxDifficultyRatio: this.maxDifficultyRatio,
      minDifficulty: 1,
      maxDifficulty: Math.pow(2, 32),
    });
  }

  /**
   * Get target block time
   */
  getTargetBlockTime(): number {
    return this.targetBlockTime;
  }

  /**
   * Set adjustment period
   */
  setAdjustmentPeriod(blocks: number): void {
    if (blocks < 1 || blocks > 100) {
      throw new Error('Adjustment period must be between 1 and 100 blocks');
    }
    this.adjustmentPeriod = blocks;
    // Recreate difficulty manager with new config
    this.difficultyManager = new DifficultyManager({
      targetBlockTime: this.targetBlockTime,
      adjustmentPeriod: blocks,
      maxDifficultyRatio: this.maxDifficultyRatio,
      minDifficulty: 1,
      maxDifficulty: Math.pow(2, 32),
    });
  }

  /**
   * Get adjustment period
   */
  getAdjustmentPeriod(): number {
    return this.adjustmentPeriod;
  }

  /**
   * Get average block time for recent blocks
   */
  getAverageBlockTime(sampleSize: number = 10): number {
    if (this.blocks.length < 2) {
      return 0;
    }

    const sampleBlocks = this.blocks.slice(
      -Math.min(sampleSize, this.blocks.length)
    );
    if (sampleBlocks.length < 2) {
      return 0;
    }

    const firstBlock = sampleBlocks[0];
    const lastBlock = sampleBlocks[sampleBlocks.length - 1];
    const totalTime = (lastBlock.timestamp - firstBlock.timestamp) / 1000; // seconds
    const averageBlockTime = totalTime / (sampleBlocks.length - 1);

    return averageBlockTime;
  }

  // Genesis Configuration Methods

  /**
   * Get the chain ID for this blockchain
   */
  getChainId(): string {
    return this.chainId || 'unknown';
  }

  /**
   * Get network parameters from genesis configuration
   */
  getNetworkParameters(): NetworkParameters | null {
    return this.genesisConfig?.networkParams || null;
  }

  /**
   * Get the genesis configuration for this blockchain
   */
  async getGenesisConfig(): Promise<GenesisConfig | null> {
    if (this.genesisConfig) {
      return this.genesisConfig;
    }

    if (this.genesisConfigManager && this.chainId) {
      return await this.genesisConfigManager.loadConfigFromDatabase(
        this.chainId
      );
    }

    return null;
  }

  /**
   * Save genesis configuration to database
   */
  async saveGenesisConfig(config: GenesisConfig): Promise<void> {
    if (!this.genesisConfigManager) {
      throw new Error(
        'Genesis configuration manager not available (persistence required)'
      );
    }

    await this.genesisConfigManager.saveConfigToDatabase(config);
    this.genesisConfig = config;
    this.chainId = config.chainId;

    this.logger.debug(
      `Saved genesis configuration for chain: ${config.chainId}`
    );
  }

  /**
   * Check if this blockchain has genesis configuration enabled
   */
  hasGenesisConfig(): boolean {
    return this.genesisConfig !== undefined;
  }

  /**
   * Get all stored genesis configurations
   */
  async getStoredGenesisConfigs(): Promise<GenesisConfig[]> {
    if (!this.genesisConfigManager) {
      return [];
    }

    return await this.genesisConfigManager.getStoredConfigs();
  }

  /**
   * Validate genesis configuration integrity
   */
  async validateGenesisConfig(): Promise<ValidationResult> {
    if (!this.genesisConfig) {
      return {
        isValid: false,
        errors: ['No genesis configuration available'],
      };
    }

    return GenesisConfigManager.validateConfig(this.genesisConfig);
  }

  /**
   * Get total supply from genesis configuration
   */
  getTotalSupply(): number {
    return this.genesisConfig?.totalSupply || 0;
  }

  /**
   * Get initial allocations from genesis configuration
   */
  getInitialAllocations(): InitialAllocation[] {
    return this.genesisConfig?.initialAllocations || [];
  }

  /**
   * Check if an address has an initial allocation
   */
  hasInitialAllocation(address: string): boolean {
    return this.getInitialAllocations().some(
      allocation => allocation.address === address
    );
  }

  /**
   * Get initial allocation amount for an address
   */
  getInitialAllocationAmount(address: string): number {
    const allocation = this.getInitialAllocations().find(
      alloc => alloc.address === address
    );
    return allocation?.amount || 0;
  }
}
