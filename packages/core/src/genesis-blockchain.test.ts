import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Blockchain } from './blockchain.js';
import { UTXOManager } from './utxo.js';
import { UTXOPersistenceManager } from './persistence.js';
import { CryptographicService } from './cryptographic.js';
import { DatabaseFactory } from './database.js';
import { GenesisConfigManager } from './genesis/index.js';
import type {
  GenesisConfig,
  UTXOPersistenceConfig,
  InitialAllocation,
} from './types.js';

describe('Blockchain with Genesis Configuration (NO BACKWARDS COMPATIBILITY)', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let utxoManager: UTXOManager;
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
      maxDifficultyRatio: 4,
      maxBlockSize: 1048576,
      miningReward: 25,
      halvingInterval: 100000,
    },
    metadata: {
      timestamp: 1700000000000,
      description: 'Test Genesis Block with custom allocations',
      creator: 'Test Suite',
      networkType: 'testnet',
    },
  };

  beforeEach(async () => {
    const database = DatabaseFactory.create(testConfig);
    cryptoService = new CryptographicService();
    persistence = new UTXOPersistenceManager(database, {
      compressionType: 'none',
      cryptographicAlgorithm: 'secp256k1',
    });
    utxoManager = new UTXOManager();
  });

  afterEach(async () => {
    if (blockchain) {
      await blockchain.close();
    }
    if (persistence) {
      await persistence.close();
    }
  });

  describe('Required Genesis Configuration', () => {
    it('should initialize blockchain with genesis configuration object', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        customGenesisConfig
      );

      await blockchain.waitForInitialization();

      expect(blockchain.getBlocks()).toHaveLength(1);
      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
      expect(blockchain.getDifficulty()).toBe(3);
      expect(blockchain.getMiningReward()).toBe(25);
      expect(blockchain.getTargetBlockTime()).toBe(180);

      // Check UTXO allocations
      const balance1 = blockchain.getBalance(
        'lora1genesis00000000000000000000000000000'
      );
      const balance2 = blockchain.getBalance(
        'lora1genesis11111111111111111111111111111'
      );
      expect(balance1).toBe(5000000);
      expect(balance2).toBe(3000000);
    });

    it('should initialize blockchain by loading configuration from database', async () => {
      // First save a configuration
      const genesisManager = new GenesisConfigManager(persistence);
      await genesisManager.saveConfigToDatabase(customGenesisConfig);

      // Then create blockchain by chain ID
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        'test-blockchain-genesis'
      );

      await blockchain.waitForInitialization();

      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
      expect(blockchain.getDifficulty()).toBe(3);

      // Check UTXO allocations were loaded
      const balance1 = blockchain.getBalance(
        'lora1genesis00000000000000000000000000000'
      );
      expect(balance1).toBe(5000000);
    });

    it('should throw error when chain ID not found in database', async () => {
      expect(() => {
        blockchain = new Blockchain(
          persistence,
          utxoManager,
          { targetBlockTime: 300 },
          'non-existent-chain-id'
        );
      }).not.toThrow(); // Constructor doesn't throw, but initialization will fail

      await expect(blockchain.waitForInitialization()).rejects.toThrow(
        'Genesis configuration not found for chain ID: non-existent-chain-id'
      );
    });

    it('should apply network parameters from genesis config', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 }, // This should be overridden by genesis config
        customGenesisConfig
      );

      await blockchain.waitForInitialization();

      expect(blockchain.getTargetBlockTime()).toBe(180); // From genesis config, not difficultyConfig
      expect(blockchain.getDifficulty()).toBe(3);
      expect(blockchain.getMiningReward()).toBe(25);
    });

    it('should save genesis configuration to database when provided as object', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        customGenesisConfig
      );

      await blockchain.waitForInitialization();

      // Verify configuration was saved
      const genesisManager = new GenesisConfigManager(persistence);
      const savedConfig = await genesisManager.loadConfigFromDatabase(
        'test-blockchain-genesis'
      );

      expect(savedConfig).not.toBeNull();
      expect(savedConfig!.chainId).toBe('test-blockchain-genesis');
      expect(savedConfig!.initialAllocations).toHaveLength(2);
    });

    it('should create proper UTXO set from genesis allocations', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        customGenesisConfig
      );

      await blockchain.waitForInitialization();

      const utxos1 = await blockchain.getUTXOsForAddress(
        'lora1genesis00000000000000000000000000000'
      );
      const utxos2 = await blockchain.getUTXOsForAddress(
        'lora1genesis11111111111111111111111111111'
      );

      expect(utxos1).toHaveLength(1);
      expect(utxos2).toHaveLength(1);
      expect(utxos1[0].value).toBe(5000000);
      expect(utxos2[0].value).toBe(3000000);
      expect(utxos1[0].blockHeight).toBe(0); // Genesis block
      expect(utxos1[0].isSpent).toBe(false);
    });
  });

  describe('Genesis Configuration Requirements', () => {
    it('should require all constructor parameters (NO OPTIONAL PARAMETERS)', () => {
      // All parameters are now required - this should work
      expect(() => {
        blockchain = new Blockchain(
          persistence,
          utxoManager,
          { targetBlockTime: 300 },
          customGenesisConfig
        );
      }).not.toThrow();

      // This should fail at TypeScript level, but we can't test that in runtime
      // The point is that all parameters are now required
    });

    it('should validate genesis configuration before initialization', async () => {
      const invalidConfig: GenesisConfig = {
        ...customGenesisConfig,
        chainId: '', // Invalid - too short
      };

      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        invalidConfig
      );

      await expect(blockchain.waitForInitialization()).rejects.toThrow(
        'Chain ID must be at least 3 characters long'
      );
    });

    it('should handle async initialization properly', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        customGenesisConfig
      );

      // Should not be initialized immediately
      expect(blockchain.getBlocks()).toHaveLength(0);

      // After waiting for initialization
      await blockchain.waitForInitialization();
      expect(blockchain.getBlocks()).toHaveLength(1);
      expect(blockchain.getChainId()).toBe('test-blockchain-genesis');
    });
  });

  describe('Configuration Persistence', () => {
    it('should persist and load genesis configurations', async () => {
      const genesisManager = new GenesisConfigManager(persistence);

      // Save configuration
      await genesisManager.saveConfigToDatabase(customGenesisConfig);

      // Load configuration
      const loadedConfig = await genesisManager.loadConfigFromDatabase(
        'test-blockchain-genesis'
      );

      expect(loadedConfig).not.toBeNull();
      expect(loadedConfig!.chainId).toBe('test-blockchain-genesis');
      expect(loadedConfig!.initialAllocations).toHaveLength(2);
      expect(loadedConfig!.totalSupply).toBe(21000000);
    });

    it('should create and persist genesis blocks', async () => {
      const genesisManager = new GenesisConfigManager(persistence);

      const genesisBlock =
        await genesisManager.createAndPersistGenesisBlock(customGenesisConfig);

      expect(genesisBlock.index).toBe(0);
      expect(genesisBlock.difficulty).toBe(3);
      expect(genesisBlock.transactions).toHaveLength(0); // NO BACKWARDS COMPATIBILITY - UTXO only
      expect(genesisBlock.timestamp).toBe(
        customGenesisConfig.metadata.timestamp
      );
    });
  });

  describe('Network Configuration Loading', () => {
    it('should load configuration files from configs directory', async () => {
      const genesisManager = new GenesisConfigManager(persistence);

      // Load mainnet config
      const mainnetConfig = await genesisManager.loadConfigFromFile('mainnet');
      expect(mainnetConfig.chainId).toBe('lorachain-mainnet-v1');
      expect(mainnetConfig.networkName).toBe('Lorachain Mainnet');

      // Load testnet config
      const testnetConfig = await genesisManager.loadConfigFromFile('testnet');
      expect(testnetConfig.chainId).toBe('lorachain-testnet-v1');
      expect(testnetConfig.networkName).toBe('Lorachain Testnet');

      // Load devnet config
      const devnetConfig = await genesisManager.loadConfigFromFile('devnet');
      expect(devnetConfig.chainId).toBe('lorachain-devnet-v1');
      expect(devnetConfig.networkName).toBe('Lorachain Development Network');
    });

    it('should initialize blockchain with network config files', async () => {
      blockchain = new Blockchain(
        persistence,
        utxoManager,
        { targetBlockTime: 300 },
        'mainnet' // Load from mainnet.json
      );

      await blockchain.waitForInitialization();

      expect(blockchain.getChainId()).toBe('lorachain-mainnet-v1');
      expect(blockchain.getDifficulty()).toBe(4); // Mainnet difficulty
      expect(blockchain.getTargetBlockTime()).toBe(300); // Mainnet target block time
      expect(blockchain.getMiningReward()).toBe(50); // Mainnet mining reward
    });
  });
});
