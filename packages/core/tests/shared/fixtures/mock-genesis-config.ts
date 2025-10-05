import type {
  GenesisConfig,
  InitialAllocation,
  NetworkParameters,
  GenesisMetadata,
} from '../../../src/types.js';

/**
 * Creates a complete genesis configuration for testing.
 *
 * This factory ensures all required fields are populated according to
 * current validation standards, including:
 * - Complete metadata with creator, description, and timestamps
 * - Network type specification
 * - Proper consensus parameters
 * - Initial allocations (UTXO-based)
 *
 * @param overrides - Partial config to override defaults
 * @returns A complete GenesisConfig object
 */
export function createCompleteGenesisConfig(
  overrides: Partial<GenesisConfig> = {}
): GenesisConfig {
  const now = Date.now();

  const defaultMetadata: GenesisMetadata = {
    timestamp: now,
    description: 'Test network for blockchain unit testing',
    creator: 'test-suite',
    networkType: 'testnet',
  };

  const defaultNetworkParams: NetworkParameters = {
    initialDifficulty: 2,
    targetBlockTime: 60, // 60 seconds
    adjustmentPeriod: 10, // Adjust every 10 blocks
    maxDifficultyRatio: 4, // Max 4x change per adjustment
    maxBlockSize: 1048576, // 1 MB
    miningReward: 50,
    halvingInterval: 210000, // Halve reward every 210k blocks
  };

  const defaultInitialAllocations: InitialAllocation[] = [
    {
      address: 'lora1test000000000000000000000000000000000',
      amount: 1000000,
      description: 'Test allocation',
    },
  ];

  const defaultConfig: GenesisConfig = {
    chainId: 'test-chain-v1',
    networkName: 'Test Network',
    version: '1.0.0',
    initialAllocations: defaultInitialAllocations,
    totalSupply: 21000000,
    networkParams: defaultNetworkParams,
    metadata: defaultMetadata,
  };

  // Deep merge overrides
  return {
    ...defaultConfig,
    ...overrides,
    networkParams: {
      ...defaultNetworkParams,
      ...(overrides.networkParams || {}),
    },
    metadata: {
      ...defaultMetadata,
      ...(overrides.metadata || {}),
    },
    initialAllocations:
      overrides.initialAllocations || defaultInitialAllocations,
  };
}

/**
 * Creates a devnet genesis configuration.
 *
 * Devnet is for local development with:
 * - Lower difficulty for faster mining
 * - Shorter block times
 * - Larger initial allocations for testing
 *
 * @param overrides - Partial config to override defaults
 * @returns A devnet GenesisConfig
 */
export function createDevnetGenesisConfig(
  overrides: Partial<GenesisConfig> = {}
): GenesisConfig {
  return createCompleteGenesisConfig({
    chainId: 'devnet-chain-v1',
    networkName: 'Lorachain Devnet',
    metadata: {
      timestamp: Date.now(),
      description: 'Lorachain development network for local testing',
      creator: 'lorachain-dev',
      networkType: 'devnet',
    },
    networkParams: {
      initialDifficulty: 1, // Very easy mining
      targetBlockTime: 10, // Fast 10-second blocks
      adjustmentPeriod: 5,
      maxDifficultyRatio: 4,
      maxBlockSize: 1048576,
      miningReward: 100, // Higher rewards for testing
      halvingInterval: 1000, // Frequent halving for testing
    },
    initialAllocations: [
      {
        address: 'lora1dev0000000000000000000000000000000000',
        amount: 10000000,
        description: 'Devnet test allocation',
      },
    ],
    totalSupply: 21000000,
    ...overrides,
  });
}

/**
 * Creates a testnet genesis configuration.
 *
 * Testnet is for public testing with:
 * - Moderate difficulty
 * - Standard block times
 * - Realistic parameters
 *
 * @param overrides - Partial config to override defaults
 * @returns A testnet GenesisConfig
 */
export function createTestnetGenesisConfig(
  overrides: Partial<GenesisConfig> = {}
): GenesisConfig {
  return createCompleteGenesisConfig({
    chainId: 'testnet-chain-v1',
    networkName: 'Lorachain Testnet',
    metadata: {
      timestamp: Date.now(),
      description: 'Lorachain public test network',
      creator: 'lorachain-foundation',
      networkType: 'testnet',
    },
    networkParams: {
      initialDifficulty: 4,
      targetBlockTime: 60,
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      maxBlockSize: 1048576,
      miningReward: 50,
      halvingInterval: 210000,
    },
    initialAllocations: [
      {
        address: 'lora1testnet00000000000000000000000000000',
        amount: 5000000,
        description: 'Testnet foundation allocation',
      },
    ],
    totalSupply: 21000000,
    ...overrides,
  });
}

/**
 * Creates a mainnet genesis configuration.
 *
 * Mainnet is for production with:
 * - High difficulty
 * - Standard Bitcoin-like parameters
 * - Conservative settings
 *
 * @param overrides - Partial config to override defaults
 * @returns A mainnet GenesisConfig
 */
export function createMainnetGenesisConfig(
  overrides: Partial<GenesisConfig> = {}
): GenesisConfig {
  return createCompleteGenesisConfig({
    chainId: 'mainnet-chain-v1',
    networkName: 'Lorachain Mainnet',
    metadata: {
      timestamp: Date.now(),
      description: 'Lorachain production network',
      creator: 'lorachain-foundation',
      networkType: 'mainnet',
    },
    networkParams: {
      initialDifficulty: 8,
      targetBlockTime: 600, // 10 minutes
      adjustmentPeriod: 2016, // ~2 weeks
      maxDifficultyRatio: 4,
      maxBlockSize: 1048576,
      miningReward: 50,
      halvingInterval: 210000,
    },
    initialAllocations: [
      {
        address: 'lora1mainnet0000000000000000000000000000',
        amount: 21000000,
        description: 'Genesis allocation',
      },
    ],
    totalSupply: 21000000,
    ...overrides,
  });
}

/**
 * Creates a private network genesis configuration.
 *
 * Private networks are for enterprise/custom deployments with:
 * - Configurable parameters
 * - Custom initial allocations
 * - Flexible settings
 *
 * @param overrides - Partial config to override defaults
 * @returns A private network GenesisConfig
 */
export function createPrivateGenesisConfig(
  overrides: Partial<GenesisConfig> = {}
): GenesisConfig {
  return createCompleteGenesisConfig({
    chainId: 'private-chain-v1',
    networkName: 'Private Lorachain Network',
    metadata: {
      timestamp: Date.now(),
      description: 'Private blockchain network',
      creator: 'private-operator',
      networkType: 'private',
    },
    networkParams: {
      initialDifficulty: 2,
      targetBlockTime: 30,
      adjustmentPeriod: 20,
      maxDifficultyRatio: 4,
      maxBlockSize: 2097152, // 2 MB for private networks
      miningReward: 100,
      halvingInterval: 100000,
    },
    initialAllocations: [],
    totalSupply: 100000000,
    ...overrides,
  });
}

/**
 * Creates a minimal genesis configuration for testing.
 *
 * This is the bare minimum required for tests to pass validation.
 *
 * @returns A minimal but valid GenesisConfig
 */
export function createMinimalGenesisConfig(): GenesisConfig {
  return {
    chainId: 'test',
    networkName: 'Test',
    version: '1.0.0',
    initialAllocations: [],
    totalSupply: 0,
    networkParams: {
      initialDifficulty: 2,
      targetBlockTime: 60,
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      maxBlockSize: 1048576,
      miningReward: 50,
    },
    metadata: {
      timestamp: Date.now(),
      description: 'Minimal test config',
      creator: 'test',
      networkType: 'testnet',
    },
  };
}

/**
 * Creates a genesis config with custom initial allocations.
 *
 * @param allocations - Array of initial allocations
 * @param networkType - Network type
 * @returns A GenesisConfig with the specified allocations
 */
export function createGenesisConfigWithAllocations(
  allocations: InitialAllocation[],
  networkType: 'mainnet' | 'testnet' | 'devnet' | 'private' = 'testnet'
): GenesisConfig {
  const totalSupply = allocations.reduce((sum, a) => sum + a.amount, 0);

  return createCompleteGenesisConfig({
    initialAllocations: allocations,
    totalSupply,
    metadata: {
      timestamp: Date.now(),
      description: `${networkType} with custom allocations`,
      creator: 'test-suite',
      networkType,
    },
  });
}

/**
 * Pre-defined genesis configs for quick testing.
 */
export const TEST_GENESIS_CONFIGS = {
  minimal: createMinimalGenesisConfig(),
  devnet: createDevnetGenesisConfig(),
  testnet: createTestnetGenesisConfig(),
  mainnet: createMainnetGenesisConfig(),
  private: createPrivateGenesisConfig(),
};
