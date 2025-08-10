import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GenesisConfigManager } from '../../src/genesis/GenesisConfigManager.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { CryptographicService } from '../../src/cryptographic.js';
import { DatabaseFactory } from '../../src/database.js';
import type {
  InitialAllocation,
  NetworkParameters,
  UTXOPersistenceConfig,
  GenesisConfig,
} from '../../src/genesis/types.js';

describe('GenesisConfigManager', () => {
  let genesisConfigManager: GenesisConfigManager;
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

  // Helper function to properly clone config (spread doesn't work with nested objects)
  const createValidTestConfig = (): GenesisConfig => ({
    chainId: 'lorachain-test-v1',
    networkName: 'Lorachain Test Network',
    version: '1.0.0',
    initialAllocations: [
      {
        address: 'lora1test000000000000000000000000000000000',
        amount: 1000000,
        description: 'Test allocation 1',
      },
      {
        address: 'lora1test111111111111111111111111111111111',
        amount: 500000,
        description: 'Test allocation 2',
      },
    ],
    totalSupply: 21000000,
    networkParams: {
      initialDifficulty: 2,
      targetBlockTime: 180, // 3 minutes (must be between 60-1800)
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      maxBlockSize: 1024 * 1024, // 1MB (valid range)
      miningReward: 10,
      halvingInterval: 210000,
    },
    metadata: {
      timestamp: 1700000000000, // Fixed timestamp to avoid validation issues
      description: 'Lorachain Test Network Genesis Block',
      creator: 'Test Suite',
      networkType: 'testnet',
    },
  });

  // Test genesis configuration - NO DEFAULT CONFIG
  const testGenesisConfig: GenesisConfig = createValidTestConfig();

  beforeEach(async () => {
    const database = DatabaseFactory.create(testConfig);
    cryptoService = new CryptographicService();
    persistence = new UTXOPersistenceManager(
      database,
      testConfig,
      cryptoService
    );
    genesisConfigManager = new GenesisConfigManager(persistence);
  });

  afterEach(async () => {
    if (persistence) {
      await persistence.close();
    }
  });

  describe('Configuration Creation and Validation', () => {
    it('should validate valid test configuration', () => {
      const validation = GenesisConfigManager.validateConfig(testGenesisConfig);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject configuration with invalid chain ID', () => {
      const config = createValidTestConfig();
      config.chainId = 'ab'; // Too short

      const validation = GenesisConfigManager.validateConfig(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Chain ID must be at least 3 characters long'
      );
    });

    it('should reject configuration with invalid version', () => {
      const config = createValidTestConfig();
      config.version = 'invalid-version';

      const validation = GenesisConfigManager.validateConfig(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Version must be in semantic versioning format (x.y.z)'
      );
    });

    it('should reject configuration with total allocations exceeding supply', () => {
      const config = createValidTestConfig();
      config.totalSupply = 100; // Less than total allocations

      const validation = GenesisConfigManager.validateConfig(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Total allocated amount exceeds total supply'
      );
    });

    it('should reject configuration with invalid network parameters', () => {
      const config = createValidTestConfig();
      config.networkParams.initialDifficulty = 0; // Invalid
      config.networkParams.targetBlockTime = 30; // Too low
      config.networkParams.maxBlockSize = 100; // Too small

      const validation = GenesisConfigManager.validateConfig(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Initial difficulty must be at least 1'
      );
      expect(validation.errors).toContain(
        'Target block time must be between 60 and 1800 seconds'
      );
      expect(validation.errors).toContain(
        'Max block size must be between 1KB and 32MB'
      );
    });
  });

  describe('Initial Allocations Validation', () => {
    it('should validate valid allocations', () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: 1000,
          description: 'Test allocation',
        },
        {
          address: 'lora1test111111111111111111111111111111111',
          amount: 2000,
        },
      ];

      const validation = GenesisConfigManager.validateAllocations(allocations);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject empty allocations', () => {
      const validation = GenesisConfigManager.validateAllocations([]);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'At least one initial allocation is required'
      );
    });

    it('should reject allocation with short address', () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'short',
          amount: 1000,
        },
      ];

      const validation = GenesisConfigManager.validateAllocations(allocations);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Allocation 0: Address must be at least 10 characters long'
      );
    });

    it('should reject allocation with invalid amount', () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: -100,
        },
      ];

      const validation = GenesisConfigManager.validateAllocations(allocations);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Allocation 0: Amount must be a positive finite number'
      );
    });

    it('should reject duplicate addresses', () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: 1000,
        },
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: 2000,
        },
      ];

      const validation = GenesisConfigManager.validateAllocations(allocations);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Allocation 1: Duplicate address lora1test000000000000000000000000000000000'
      );
    });
  });

  describe('Configuration Persistence', () => {
    it('should save and load configuration from database', async () => {
      const config = createValidTestConfig();
      config.chainId = 'test-chain-persistence';

      await genesisConfigManager.saveConfigToDatabase(config);
      const loadedConfig = await genesisConfigManager.loadConfigFromDatabase(
        'test-chain-persistence'
      );

      expect(loadedConfig).not.toBeNull();
      expect(loadedConfig!.chainId).toBe('test-chain-persistence');
      expect(loadedConfig!.networkName).toBe(config.networkName);
      expect(loadedConfig!.initialAllocations).toHaveLength(
        config.initialAllocations.length
      );
    });

    it('should return null for non-existent configuration', async () => {
      const loadedConfig =
        await genesisConfigManager.loadConfigFromDatabase('non-existent-chain');

      expect(loadedConfig).toBeNull();
    });

    it('should get all stored configurations', async () => {
      const config1 = createValidTestConfig();
      config1.chainId = 'test-chain-1';

      const config2 = createValidTestConfig();
      config2.chainId = 'test-chain-2';

      await genesisConfigManager.saveConfigToDatabase(config1);
      await genesisConfigManager.saveConfigToDatabase(config2);

      const storedConfigs = await genesisConfigManager.getStoredConfigs();

      expect(storedConfigs).toHaveLength(2);
      expect(storedConfigs.some(c => c.chainId === 'test-chain-1')).toBe(true);
      expect(storedConfigs.some(c => c.chainId === 'test-chain-2')).toBe(true);
    });

    it('should reject invalid configuration on save', async () => {
      const config = createValidTestConfig();
      config.chainId = ''; // Invalid

      await expect(
        genesisConfigManager.saveConfigToDatabase(config)
      ).rejects.toThrow();
    });
  });

  describe('Genesis Block Creation', () => {
    it('should create genesis block from configuration', () => {
      const config = createValidTestConfig();
      const genesisBlock = GenesisConfigManager.createGenesisBlock(config);

      expect(genesisBlock.index).toBe(0);
      expect(genesisBlock.previousHash).toBe('0');
      expect(genesisBlock.transactions).toHaveLength(0); // NO BACKWARDS COMPATIBILITY - Empty transactions
      expect(genesisBlock.difficulty).toBe(
        config.networkParams.initialDifficulty
      );
      expect(genesisBlock.timestamp).toBe(config.metadata.timestamp);
    });

    it('should create genesis UTXO transactions from allocations', () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: 1000,
          description: 'Test allocation 1',
        },
        {
          address: 'lora1test111111111111111111111111111111111',
          amount: 2000,
          description: 'Test allocation 2',
        },
      ];

      const transactions =
        GenesisConfigManager.createGenesisUTXOTransactions(allocations);

      expect(transactions).toHaveLength(2);
      expect(transactions[0].inputs).toHaveLength(0); // Genesis transactions have no inputs
      expect(transactions[0].outputs).toHaveLength(1);
      expect(transactions[0].outputs[0].value).toBe(1000);
      expect(transactions[0].outputs[0].lockingScript).toBe(
        'lora1test000000000000000000000000000000000'
      );

      expect(transactions[1].outputs[0].value).toBe(2000);
      expect(transactions[1].outputs[0].lockingScript).toBe(
        'lora1test111111111111111111111111111111111'
      );
    });

    it('should create and persist genesis block with UTXOs', async () => {
      const config = createValidTestConfig();
      config.chainId = 'test-genesis-creation';

      const genesisBlock =
        await genesisConfigManager.createAndPersistGenesisBlock(config);

      expect(genesisBlock.index).toBe(0);
      expect(genesisBlock.transactions).toHaveLength(0); // NO BACKWARDS COMPATIBILITY - Empty transactions

      // Verify block was persisted
      const loadedBlock = await persistence.getBlock(0);
      expect(loadedBlock).not.toBeNull();
      expect(loadedBlock!.hash).toBe(genesisBlock.hash);
    });
  });

  describe('Utility Methods', () => {
    it('should convert network parameters to difficulty config', () => {
      const networkParams: NetworkParameters = {
        initialDifficulty: 4,
        targetBlockTime: 300,
        adjustmentPeriod: 10,
        maxDifficultyRatio: 4,
        maxBlockSize: 1048576,
        miningReward: 50,
        halvingInterval: 210000,
      };

      const difficultyConfig =
        GenesisConfigManager.toDifficultyConfig(networkParams);

      expect(difficultyConfig.targetBlockTime).toBe(300);
      expect(difficultyConfig.adjustmentPeriod).toBe(10);
      expect(difficultyConfig.maxDifficultyRatio).toBe(4);
      expect(difficultyConfig.minDifficulty).toBe(1);
      expect(difficultyConfig.maxDifficulty).toBe(Math.pow(2, 32));
    });

    it('should calculate configuration hash', async () => {
      const config = createValidTestConfig();
      const hash1 = await genesisConfigManager.calculateConfigHash(config);

      expect(hash1).toHaveLength(64); // SHA-256 hex string

      // Same config should produce same hash
      const hash2 = await genesisConfigManager.calculateConfigHash(config);
      expect(hash1).toBe(hash2);

      // Different config should produce different hash
      config.chainId = 'different-chain';
      const hash3 = await genesisConfigManager.calculateConfigHash(config);
      expect(hash1).not.toBe(hash3);
    });

    it('should create and store initial UTXO set', async () => {
      const allocations: InitialAllocation[] = [
        {
          address: 'lora1test000000000000000000000000000000000',
          amount: 1000,
        },
        {
          address: 'lora1test111111111111111111111111111111111',
          amount: 2000,
        },
      ];

      const utxos =
        await genesisConfigManager.createAndStoreInitialUTXOSet(allocations);

      expect(utxos).toHaveLength(2);
      expect(utxos[0].value).toBe(1000);
      expect(utxos[0].lockingScript).toBe(
        'lora1test000000000000000000000000000000000'
      );
      expect(utxos[0].blockHeight).toBe(0);
      expect(utxos[0].isSpent).toBe(false);

      // Verify UTXOs were persisted
      const persistedUtxo = await persistence.getUTXO(
        utxos[0].txId,
        utxos[0].outputIndex
      );
      expect(persistedUtxo).not.toBeNull();
      expect(persistedUtxo!.value).toBe(1000);
    });
  });

  describe('Load Configuration', () => {
    it('should throw error when no stored configs exist (NO BACKWARDS COMPATIBILITY)', async () => {
      await expect(genesisConfigManager.loadConfig()).rejects.toThrow(
        'No genesis configuration found in database. Genesis configuration is required.'
      );
    });

    it('should load stored config when available', async () => {
      const customConfig = createValidTestConfig();
      customConfig.chainId = 'stored-test-chain';
      customConfig.networkName = 'Stored Test Network';

      await genesisConfigManager.saveConfigToDatabase(customConfig);

      const loadedConfig = await genesisConfigManager.loadConfig();

      expect(loadedConfig.chainId).toBe('stored-test-chain');
      expect(loadedConfig.networkName).toBe('Stored Test Network');
    });
  });
});
