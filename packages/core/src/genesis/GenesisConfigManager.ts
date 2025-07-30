import { createHash } from 'crypto';
import type {
  GenesisConfig,
  InitialAllocation,
  NetworkParameters,
  ValidationResult,
  Block,
  UTXOTransaction,
  UTXO,
  TransactionOutput,
} from '../types.js';
import type { UTXOPersistenceManager } from '../persistence.js';
import type { DifficultyConfig } from '../difficulty.js';
import { SubLevels, KeyPrefixes } from '../database.js';

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

export class GenesisConfigManager {
  private persistence: UTXOPersistenceManager;
  private logger = new SimpleLogger('GenesisConfigManager');

  constructor(persistence: UTXOPersistenceManager) {
    this.persistence = persistence;
  }

  /**
   * Load genesis configuration from database or file
   */
  async loadConfig(configPath?: string): Promise<GenesisConfig> {
    try {
      // First try to load from database if no configPath specified
      if (!configPath) {
        const configs = await this.getStoredConfigs();
        if (configs.length > 0) {
          this.logger.debug(
            `Loaded genesis config from database: ${configs[0].chainId}`
          );
          return configs[0];
        }
      }

      // No configuration found - throw error (NO BACKWARDS COMPATIBILITY)
      throw new Error('No genesis configuration found in database. Genesis configuration is required.');
    } catch (error) {
      this.logger.error(`Failed to load genesis config: ${error}`);
      throw error;
    }
  }

  /**
   * Load genesis configuration from database by chain ID
   */
  async loadConfigFromDatabase(chainId: string): Promise<GenesisConfig | null> {
    try {
      const configKey = this.createConfigKey(chainId);
      const config = await this.persistence['db'].get<GenesisConfig>(
        configKey,
        SubLevels.CONFIG
      );

      if (config) {
        this.logger.debug(`Loaded genesis config from database: ${chainId}`);
      }
      return config;
    } catch (error) {
      this.logger.error(`Failed to load config from database: ${error}`);
      return null;
    }
  }

  /**
   * Save genesis configuration to database
   */
  async saveConfigToDatabase(config: GenesisConfig): Promise<void> {
    try {
      const validation = GenesisConfigManager.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid genesis config: ${validation.errors.join(', ')}`
        );
      }

      const configKey = this.createConfigKey(config.chainId);
      await this.persistence['db'].put(configKey, config, SubLevels.CONFIG);

      // Also save metadata separately for quick access
      const metadataKey = `${KeyPrefixes.GENESIS_METADATA}${config.chainId}`;
      await this.persistence['db'].put(
        metadataKey,
        config.metadata,
        SubLevels.METADATA
      );

      this.logger.debug(`Saved genesis config for chain: ${config.chainId}`);
    } catch (error) {
      this.logger.error(`Failed to save config to database: ${error}`);
      throw error;
    }
  }


  /**
   * Validate genesis configuration
   */
  static validateConfig(config: GenesisConfig): ValidationResult {
    const errors: string[] = [];

    // Validate chain ID
    if (!config.chainId || config.chainId.length < 3) {
      errors.push('Chain ID must be at least 3 characters long');
    }

    // Validate network name
    if (!config.networkName || config.networkName.length < 3) {
      errors.push('Network name must be at least 3 characters long');
    }

    // Validate version
    if (!config.version || !config.version.match(/^\d+\.\d+\.\d+$/)) {
      errors.push('Version must be in semantic versioning format (x.y.z)');
    }

    // Validate initial allocations
    const allocationValidation = this.validateAllocations(
      config.initialAllocations
    );
    if (!allocationValidation.isValid) {
      errors.push(...allocationValidation.errors);
    }

    // Validate total supply
    if (config.totalSupply <= 0 || !Number.isFinite(config.totalSupply)) {
      errors.push('Total supply must be a positive finite number');
    }

    // Validate allocation sum doesn't exceed total supply
    const totalAllocated = config.initialAllocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );
    if (totalAllocated > config.totalSupply) {
      errors.push('Total allocated amount exceeds total supply');
    }

    // Validate network parameters
    if (config.networkParams.initialDifficulty < 1) {
      errors.push('Initial difficulty must be at least 1');
    }

    if (
      config.networkParams.targetBlockTime < 60 ||
      config.networkParams.targetBlockTime > 1800
    ) {
      errors.push('Target block time must be between 60 and 1800 seconds');
    }

    if (
      config.networkParams.adjustmentPeriod < 1 ||
      config.networkParams.adjustmentPeriod > 100
    ) {
      errors.push('Adjustment period must be between 1 and 100 blocks');
    }

    if (
      config.networkParams.maxDifficultyRatio < 2 ||
      config.networkParams.maxDifficultyRatio > 10
    ) {
      errors.push('Max difficulty ratio must be between 2 and 10');
    }

    if (
      config.networkParams.maxBlockSize < 1024 ||
      config.networkParams.maxBlockSize > 32 * 1024 * 1024
    ) {
      errors.push('Max block size must be between 1KB and 32MB');
    }

    if (config.networkParams.miningReward <= 0) {
      errors.push('Mining reward must be positive');
    }

    // Validate metadata
    if (
      !config.metadata.description ||
      config.metadata.description.length < 10
    ) {
      errors.push('Description must be at least 10 characters long');
    }

    if (!config.metadata.creator || config.metadata.creator.length < 3) {
      errors.push('Creator must be at least 3 characters long');
    }

    if (
      !['mainnet', 'testnet', 'devnet', 'private'].includes(
        config.metadata.networkType
      )
    ) {
      errors.push(
        'Network type must be one of: mainnet, testnet, devnet, private'
      );
    }

    if (
      config.metadata.timestamp <= 0 ||
      config.metadata.timestamp > Date.now()
    ) {
      errors.push('Timestamp must be positive and not in the future');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate initial allocations
   */
  static validateAllocations(
    allocations: InitialAllocation[]
  ): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(allocations)) {
      errors.push('Initial allocations must be an array');
      return { isValid: false, errors };
    }

    if (allocations.length === 0) {
      errors.push('At least one initial allocation is required');
    }

    const addressSet = new Set<string>();
    for (let i = 0; i < allocations.length; i++) {
      const allocation = allocations[i];

      // Validate address
      if (!allocation.address || allocation.address.length < 10) {
        errors.push(
          `Allocation ${i}: Address must be at least 10 characters long`
        );
      }

      // Check for duplicate addresses
      if (addressSet.has(allocation.address)) {
        errors.push(`Allocation ${i}: Duplicate address ${allocation.address}`);
      }
      addressSet.add(allocation.address);

      // Validate amount
      if (allocation.amount <= 0 || !Number.isFinite(allocation.amount)) {
        errors.push(`Allocation ${i}: Amount must be a positive finite number`);
      }

      // Validate description if provided
      if (allocation.description && allocation.description.length > 100) {
        errors.push(
          `Allocation ${i}: Description must be 100 characters or less`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create and persist genesis block with configuration
   */
  async createAndPersistGenesisBlock(config: GenesisConfig): Promise<Block> {
    try {
      const validation = GenesisConfigManager.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid genesis config: ${validation.errors.join(', ')}`
        );
      }

      // Create genesis block
      const genesisBlock = GenesisConfigManager.createGenesisBlock(config);

      // Persist the block
      await this.persistence.saveBlock(genesisBlock);

      // Create and persist genesis UTXOs
      const genesisUTXOs = await this.createAndStoreInitialUTXOSet(
        config.initialAllocations
      );

      this.logger.debug(
        `Created and persisted genesis block for ${config.chainId} with ${genesisUTXOs.length} initial UTXOs`
      );

      return genesisBlock;
    } catch (error) {
      this.logger.error(`Failed to create and persist genesis block: ${error}`);
      throw error;
    }
  }

  /**
   * Create genesis block from configuration
   */
  static createGenesisBlock(config: GenesisConfig): Block {
    // Create genesis UTXO transactions for initial allocations
    const genesisTransactions = this.createGenesisUTXOTransactions(
      config.initialAllocations
    );

    // Genesis block with empty transactions (UTXO allocations handled separately)
    // NO BACKWARDS COMPATIBILITY - genesis allocations are stored as UTXOs, not legacy transactions
    const genesisBlock: Block = {
      index: 0,
      timestamp: config.metadata.timestamp,
      transactions: [], // Empty - UTXO allocations handled by UTXOManager
      previousHash: '0',
      hash: '',
      nonce: 0,
      merkleRoot: this.calculateMerkleRoot([]),
      difficulty: config.networkParams.initialDifficulty,
    };

    // Calculate hash
    genesisBlock.hash = this.calculateGenesisHash(genesisBlock, config);
    return genesisBlock;
  }

  /**
   * Create genesis UTXO transactions from initial allocations
   */
  static createGenesisUTXOTransactions(
    allocations: InitialAllocation[]
  ): UTXOTransaction[] {
    return allocations.map((allocation, index) => {
      const outputs: TransactionOutput[] = [
        {
          value: allocation.amount,
          lockingScript: allocation.address,
          outputIndex: 0,
        },
      ];

      return {
        id: `genesis-${index}-${createHash('sha256')
          .update(allocation.address + allocation.amount)
          .digest('hex')
          .substring(0, 16)}`,
        inputs: [], // Genesis transactions have no inputs
        outputs,
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0,
      } as UTXOTransaction;
    });
  }

  /**
   * Calculate configuration hash for integrity checking
   */
  async calculateConfigHash(config: GenesisConfig): Promise<string> {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Get all stored configurations from database
   */
  async getStoredConfigs(): Promise<GenesisConfig[]> {
    const configs: GenesisConfig[] = [];

    try {
      for await (const { value } of this.persistence['db'].iterator({
        sublevel: SubLevels.CONFIG,
        start: KeyPrefixes.GENESIS_CONFIG,
        end: KeyPrefixes.GENESIS_CONFIG + '\xff',
      })) {
        const config = value as GenesisConfig;
        configs.push(config);
      }

      this.logger.debug(
        `Found ${configs.length} stored genesis configurations`
      );
      return configs;
    } catch (error) {
      this.logger.error(`Failed to get stored configs: ${error}`);
      return [];
    }
  }


  /**
   * Convert network parameters to difficulty configuration
   */
  static toDifficultyConfig(
    networkParams: NetworkParameters
  ): DifficultyConfig {
    return {
      targetBlockTime: networkParams.targetBlockTime,
      adjustmentPeriod: networkParams.adjustmentPeriod,
      maxDifficultyRatio: networkParams.maxDifficultyRatio,
      minDifficulty: 1,
      maxDifficulty: Math.pow(2, 32),
    };
  }

  /**
   * Create and store initial UTXO set from allocations
   */
  async createAndStoreInitialUTXOSet(
    allocations: InitialAllocation[]
  ): Promise<UTXO[]> {
    const utxos: UTXO[] = [];

    try {
      const genesisTransactions =
        GenesisConfigManager.createGenesisUTXOTransactions(allocations);

      for (const tx of genesisTransactions) {
        for (const output of tx.outputs) {
          const utxo: UTXO = {
            txId: tx.id,
            outputIndex: output.outputIndex,
            value: output.value,
            lockingScript: output.lockingScript,
            blockHeight: 0, // Genesis block
            isSpent: false,
          };

          await this.persistence.saveUTXO(utxo);
          utxos.push(utxo);
        }
      }

      this.logger.debug(`Created and stored ${utxos.length} genesis UTXOs`);
      return utxos;
    } catch (error) {
      this.logger.error(`Failed to create initial UTXO set: ${error}`);
      throw error;
    }
  }

  // Private utility methods
  private createConfigKey(chainId: string): string {
    return `${KeyPrefixes.GENESIS_CONFIG}${chainId}`;
  }

  private async validateConfigIntegrity(
    config: GenesisConfig
  ): Promise<ValidationResult> {
    try {
      // Basic validation
      const basicValidation = GenesisConfigManager.validateConfig(config);
      if (!basicValidation.isValid) {
        return basicValidation;
      }

      // Check for hash integrity if config is already stored
      const storedConfig = await this.loadConfigFromDatabase(config.chainId);
      if (storedConfig) {
        const currentHash = await this.calculateConfigHash(config);
        const storedHash = await this.calculateConfigHash(storedConfig);

        if (currentHash !== storedHash) {
          return {
            isValid: false,
            errors: [
              'Configuration integrity check failed - hashes do not match',
            ],
          };
        }
      }

      return { isValid: true, errors: [] };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Configuration integrity validation failed: ${error}`],
      };
    }
  }

  // Utility methods
  private static calculateMerkleRoot(transactions: unknown[]): string {
    if (transactions.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }

    const hashes = transactions.map(tx =>
      createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );

    while (hashes.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;
        const combined = createHash('sha256')
          .update(left + right)
          .digest('hex');
        nextLevel.push(combined);
      }
      hashes.length = 0;
      hashes.push(...nextLevel);
    }

    return hashes[0];
  }

  private static calculateGenesisHash(
    block: Omit<Block, 'hash'>,
    config: GenesisConfig
  ): string {
    const blockString = JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      transactions: block.transactions,
      previousHash: block.previousHash,
      nonce: block.nonce,
      merkleRoot: block.merkleRoot,
      difficulty: block.difficulty,
      chainId: config.chainId, // Include chain ID in genesis hash
    });

    return createHash('sha256').update(blockString).digest('hex');
  }
}
