import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Blockchain } from './blockchain.js';
import { UTXOPersistenceManager } from './persistence.js';
import { CryptographicService } from './cryptographic.js';
import { DatabaseFactory } from './database.js';
import { GenesisConfigManager } from './genesis/index.js';
import type {
  GenesisConfig,
  UTXOPersistenceConfig,
  InitialAllocation,
} from './types.js';

describe('Blockchain with Genesis Configuration', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let cryptoService: CryptographicService;

  const testConfig: UTXOPersistenceConfig = {
    enabled: true,
    dbPath: ':memory:',
    dbType: 'memory',
    autoSave: true,
    batchSize: 100,
    compressionType: 'none',
    utxoSetCacheSize: 1000,
    cryptographicAlgorithm: 'secp256k1',
    compactionStyle: 'size',
  };

  const customGenesisConfig: GenesisConfig = {
    chainId: 'test-blockchain-genesis',
    networkName: 'Test Blockchain Network',
    version: '1.0.0',
    initialAllocations: [
      {
        address: 'lora1genesis00000000000000000000000000000',
        amount: 5000000,
        description: 'Genesis allocation 1',
      },
      {
        address: 'lora1genesis11111111111111111111111111111',
        amount: 3000000,
        description: 'Genesis allocation 2',
      },
    ],
    totalSupply: 21000000,
    networkParams: {
      initialDifficulty: 3,
      targetBlockTime: 180,
      adjustmentPeriod: 8,
      maxDifficultyRatio: 3,
      maxBlockSize: 2048000,
      miningReward: 25,
      halvingInterval: 100000,
    },
    metadata: {
      timestamp: 1700000000000,
      description: 'Test blockchain genesis',
      creator: 'Test Creator',
      networkType: 'private',
    },
  };

  beforeEach(() => {
    const database = DatabaseFactory.create(testConfig);
    cryptoService = new CryptographicService();
    persistence = new UTXOPersistenceManager(
      database,
      testConfig,
      cryptoService
    );
  });

  afterEach(async () => {
    if (blockchain) {
      await blockchain.close();
    }
    if (persistence) {
      await persistence.close();
    }
  });

  describe('Genesis Configuration Integration', () => {
    it('should initialize blockchain with custom genesis configuration', async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
      expect(blockchain.getDifficulty()).toBe(3);
      expect(blockchain.getMiningReward()).toBe(25);
      expect(blockchain.getTotalSupply()).toBe(21000000);

      const networkParams = blockchain.getNetworkParameters();
      expect(networkParams).not.toBeNull();
      expect(networkParams!.targetBlockTime).toBe(180);
      expect(networkParams!.adjustmentPeriod).toBe(8);
    });

    it('should initialize blockchain with chain ID string', async () => {
      // First save a configuration
      const configManager = new GenesisConfigManager(persistence);
      await configManager.saveConfigToDatabase(customGenesisConfig);

      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        'test-blockchain-genesis'
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
      expect(blockchain.getDifficulty()).toBe(3);
    });

    it('should initialize blockchain with default configuration when no genesis config provided', async () => {
      blockchain = new Blockchain(persistence);

      // Wait for async initialization
      await blockchain.waitForInitialization();

      expect(blockchain.getChainId()).toBe('lorachain-devnet-v1');
      expect(blockchain.getDifficulty()).toBe(2);
    });

    it('should fallback to legacy initialization on genesis config error', async () => {
      // Create blockchain with invalid config (will trigger fallback)
      const invalidConfig = { ...customGenesisConfig };
      invalidConfig.chainId = ''; // Invalid

      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        invalidConfig
      );

      // Wait for async initialization and fallback
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should fallback to legacy initialization
      expect(blockchain.getBlocks()).toHaveLength(1);
      expect(blockchain.getBlocks()[0].index).toBe(0);
    });

    it('should maintain backward compatibility with legacy constructor', async () => {
      blockchain = new Blockchain(persistence, undefined, {
        targetBlockTime: 240,
      });

      // Wait for async initialization
      await blockchain.waitForInitialization();

      expect(blockchain.getTargetBlockTime()).toBe(240);
      expect(blockchain.getBlocks()).toHaveLength(1);
      expect(blockchain.getBlocks()[0].index).toBe(0);
    });
  });

  describe('Genesis Block Creation', () => {
    it('should create genesis block with configured allocations', async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      const blocks = blockchain.getBlocks();
      expect(blocks).toHaveLength(1);

      const genesisBlock = blocks[0];
      expect(genesisBlock.index).toBe(0);
      expect(genesisBlock.previousHash).toBe('0');
      expect(genesisBlock.difficulty).toBe(3);
      expect(genesisBlock.transactions).toHaveLength(2); // Two initial allocations
      expect(genesisBlock.timestamp).toBe(1700000000000);
    });

    it('should initialize UTXO set from genesis allocations', async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      const balance1 = blockchain.getBalance(
        'lora1genesis00000000000000000000000000000'
      );
      const balance2 = blockchain.getBalance(
        'lora1genesis11111111111111111111111111111'
      );

      expect(balance1).toBe(5000000);
      expect(balance2).toBe(3000000);

      const utxos1 = await persistence.getUTXOsForAddress(
        'lora1genesis00000000000000000000000000000'
      );
      const utxos2 = await persistence.getUTXOsForAddress(
        'lora1genesis11111111111111111111111111111'
      );

      expect(utxos1).toHaveLength(1);
      expect(utxos2).toHaveLength(1);
      expect(utxos1[0].value).toBe(5000000);
      expect(utxos2[0].value).toBe(3000000);
    });

    it('should persist genesis configuration to database', async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      const configManager = new GenesisConfigManager(persistence);
      const storedConfig = await configManager.loadConfigFromDatabase(
        'test-blockchain-genesis'
      );

      expect(storedConfig).not.toBeNull();
      expect(storedConfig!.chainId).toBe('test-blockchain-genesis');
      expect(storedConfig!.initialAllocations).toHaveLength(2);
    });
  });

  describe('Network Parameters Application', () => {
    it('should apply network parameters from genesis config', async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      expect(blockchain.getDifficulty()).toBe(3);
      expect(blockchain.getMiningReward()).toBe(25);
      expect(blockchain.getTargetBlockTime()).toBe(180);
      expect(blockchain.getAdjustmentPeriod()).toBe(8);

      const difficultyState = blockchain.getDifficultyState();
      expect(difficultyState.currentDifficulty).toBe(3);
      expect(difficultyState.targetBlockTime).toBe(180);
    });

    it('should allow difficulty config override of genesis parameters', async () => {
      const difficultyOverride = {
        targetBlockTime: 120,
        adjustmentPeriod: 5,
      };

      blockchain = new Blockchain(
        persistence,
        undefined,
        difficultyOverride,
        customGenesisConfig
      );

      // Wait for async initialization
      await blockchain.waitForInitialization();

      // Genesis config values
      expect(blockchain.getDifficulty()).toBe(3);
      expect(blockchain.getMiningReward()).toBe(25);

      // Overridden values
      expect(blockchain.getTargetBlockTime()).toBe(120);
      expect(blockchain.getAdjustmentPeriod()).toBe(5);
    });
  });

  describe('Genesis Configuration Methods', () => {
    beforeEach(async () => {
      blockchain = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should return chain ID', () => {
      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
    });

    it('should return network parameters', () => {
      const params = blockchain.getNetworkParameters();
      expect(params).not.toBeNull();
      expect(params!.initialDifficulty).toBe(3);
      expect(params!.targetBlockTime).toBe(180);
      expect(params!.miningReward).toBe(25);
    });

    it('should return genesis configuration', async () => {
      const config = await blockchain.getGenesisConfig();
      expect(config).not.toBeNull();
      expect(config!.chainId).toBe('test-blockchain-genesis');
      expect(config!.networkName).toBe('Test Blockchain Network');
    });

    it('should return total supply', () => {
      expect(blockchain.getTotalSupply()).toBe(21000000);
    });

    it('should return initial allocations', () => {
      const allocations = blockchain.getInitialAllocations();
      expect(allocations).toHaveLength(2);
      expect(allocations[0].address).toBe(
        'lora1genesis00000000000000000000000000000'
      );
      expect(allocations[0].amount).toBe(5000000);
    });

    it('should check if address has initial allocation', () => {
      expect(
        blockchain.hasInitialAllocation(
          'lora1genesis00000000000000000000000000000'
        )
      ).toBe(true);
      expect(
        blockchain.hasInitialAllocation(
          'lora1nonexistent0000000000000000000000'
        )
      ).toBe(false);
    });

    it('should return initial allocation amount', () => {
      expect(
        blockchain.getInitialAllocationAmount(
          'lora1genesis00000000000000000000000000000'
        )
      ).toBe(5000000);
      expect(
        blockchain.getInitialAllocationAmount(
          'lora1nonexistent0000000000000000000000'
        )
      ).toBe(0);
    });

    it('should save new genesis configuration', async () => {
      const newConfig = GenesisConfigManager.getDefaultConfig();
      newConfig.chainId = 'new-test-chain';

      await blockchain.saveGenesisConfig(newConfig);

      expect(blockchain.getChainId()).toBe('new-test-chain');

      const savedConfig = await blockchain.getGenesisConfig();
      expect(savedConfig!.chainId).toBe('new-test-chain');
    });

    it('should validate genesis configuration', async () => {
      const validation = await blockchain.validateGenesisConfig();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should check if has genesis config', () => {
      expect(blockchain.hasGenesisConfig()).toBe(true);
    });
  });

  describe('Blockchain State Compatibility', () => {
    it('should load compatible blockchain state', async () => {
      // Create and save initial blockchain state
      const blockchain1 = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );
      await blockchain1.waitForInitialization();

      // Mine a block to create some state
      const block = blockchain1.minePendingUTXOTransactions(
        'lora1miner00000000000000000000000000000000'
      );
      expect(block).not.toBeNull();

      await blockchain1.save();
      await blockchain1.close();

      // Create new blockchain instance with same config - should load existing state
      const blockchain2 = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );
      await blockchain2.waitForInitialization();

      expect(blockchain2.getBlocks()).toHaveLength(2); // Genesis + mined block
      expect(blockchain2.getChainId()).toBe('test-blockchain-genesis');
    });

    it('should create new chain when genesis config is incompatible', async () => {
      // Create blockchain with one config
      const blockchain1 = new Blockchain(
        persistence,
        undefined,
        undefined,
        customGenesisConfig
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      await blockchain1.save();
      await blockchain1.close();

      // Create blockchain with different config
      const differentConfig = { ...customGenesisConfig };
      differentConfig.chainId = 'different-chain';
      differentConfig.networkParams.initialDifficulty = 5;

      const blockchain2 = new Blockchain(
        persistence,
        undefined,
        undefined,
        differentConfig
      );
      await blockchain2.waitForInitialization();

      expect(blockchain2.getChainId()).toBe('different-chain');
      expect(blockchain2.getDifficulty()).toBe(5);
      expect(blockchain2.getBlocks()).toHaveLength(1); // New genesis block
    });
  });

  describe('Legacy Compatibility', () => {
    it('should work without persistence (legacy mode)', () => {
      blockchain = new Blockchain(
        undefined,
        undefined,
        undefined,
        customGenesisConfig
      );

      expect(blockchain.getBlocks()).toHaveLength(1);
      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
      expect(blockchain.getDifficulty()).toBe(3);
    });

    it('should work with legacy constructor parameters only', () => {
      blockchain = new Blockchain(persistence, undefined, {
        targetBlockTime: 300,
      });

      expect(blockchain.getTargetBlockTime()).toBe(300);
      expect(blockchain.getBlocks()).toHaveLength(1);
    });

    it('should maintain legacy UTXO initialization for non-genesis blocks', () => {
      blockchain = new Blockchain();

      const genesisBlock = blockchain.getBlocks()[0];
      expect(genesisBlock.transactions).toHaveLength(0); // Legacy empty genesis
      expect(blockchain.getBalance('any-address')).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle genesis config manager not available error', async () => {
      blockchain = new Blockchain(); // No persistence

      const config = GenesisConfigManager.getDefaultConfig();

      await expect(blockchain.saveGenesisConfig(config)).rejects.toThrow(
        'Genesis configuration manager not available (persistence required)'
      );
    });

    it('should return empty array for stored configs without persistence', async () => {
      blockchain = new Blockchain(); // No persistence

      const configs = await blockchain.getStoredGenesisConfigs();
      expect(configs).toHaveLength(0);
    });

    it('should return validation error when no genesis config available', async () => {
      blockchain = new Blockchain(); // No genesis config

      const validation = await blockchain.validateGenesisConfig();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No genesis configuration available');
    });
  });
});
