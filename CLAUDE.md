# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lorachain is a lightweight blockchain network designed for cryptocurrency transactions in communities with limited internet connectivity using LoRa mesh networking technology. It operates on a hybrid architecture with light clients (mobile wallets) and synchronized nodes (full nodes).

The blockchain uses a **UTXO (Unspent Transaction Output) model** for transaction management and supports **cryptographic signing** with both ECDSA (secp256k1) and Ed25519 algorithms.

## Important Development Guidelines

- **NO BACKWARDS COMPATIBILITY**: This project prioritizes clean, modern implementations. Do not maintain backwards compatibility with older versions or deprecated features. When making changes, feel free to break existing APIs and update all dependent code accordingly.
- **UTXO-ONLY**: The blockchain exclusively uses the UTXO model. Account-based transactions are not supported.
- **CRYPTOGRAPHIC SECURITY**: All transactions must be properly signed using the CryptographicService with either secp256k1 or ed25519 algorithms.

## Development Commands

### Build and Development

- `pnpm build` - Build all packages
- `pnpm dev` - Start development mode for all packages (TypeScript watch mode)
- `pnpm clean` - Clean build artifacts

### Testing

- `pnpm test` - Run tests for all packages (uses vitest)
- `pnpm test:watch` - Run tests in watch mode for all packages
- Package-specific testing:
  - `cd packages/core && pnpm test` - Run tests for specific package
  - `cd packages/core && pnpm test:watch` - Watch mode for specific package
  - `cd packages/core && pnpm test:run` - Run tests once (no watch mode)

### Code Quality

- `pnpm lint` - Run ESLint for all packages
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm format` - Format code with Prettier

### Package-specific Commands

Navigate to individual packages for targeted development:

```bash
cd packages/core && pnpm dev     # Watch mode for core package
cd packages/core && pnpm test    # Test specific package
```

## Architecture

### Monorepo Structure (PNPM Workspaces)

- **packages/core** - Core blockchain logic (transactions, blocks, mining, consensus)
- **packages/shared** - Common utilities (logging, validation, formatting)
- **packages/mobile-wallet** - Light client implementation for mobile devices
- **packages/node** - Full node implementation with mining and validation
- **packages/mesh-protocol** - LoRa/Meshtastic communication layer
- **apps/wallet-app** - Mobile wallet application
- **apps/node-server** - Business node server application

### Key Dependencies and Patterns

- **TypeScript modules (ESNext)** with strict type checking
- **Path mapping** configured for `@lorachain/*` packages in tsconfig.json
- **LevelDB** for production database persistence with sublevel organization
- **MessagePack** for efficient data serialization with optional gzip compression
- **Vitest** for testing framework with comprehensive coverage (593+ tests)
- **ESLint + Prettier** for code quality
- **LoRa constraints**: 256-byte message limit, duty cycle restrictions

### Core Classes and Responsibilities

- **`Blockchain`** (core) - Main blockchain state and UTXO-based operations with difficulty adjustment
- **`DifficultyManager`** (core) - Bitcoin-style difficulty adjustment algorithms and network hashrate calculation
- **`UTXOManager`** (core) - UTXO set management, balance calculation, and UTXO selection
- **`UTXOTransactionManager`** (core) - UTXO transaction creation, validation, and fee calculation
- **`UTXOPersistenceManager`** (core) - Blockchain state persistence, UTXO storage, and data integrity management
- **`LevelDatabase`** (core) - Production LevelDB wrapper with sublevel organization and batch operations
- **`MemoryDatabase`** (core) - In-memory database implementation for testing and development
- **`DatabaseFactory`** (core) - Factory for creating database instances based on configuration
- **`MerkleTree`** (core) - UTXO merkle tree operations, proof generation, and compression
- **`SPVManager`** (core) - Simplified Payment Verification for light clients
- **`CryptographicService`** (core) - Key generation, signing, and verification (ECDSA/Ed25519)
- **`SecureTransactionManager`** (core) - Cryptographically secure transaction creation
- **`BlockManager`** (core) - Block creation, mining, validation, and merkle proof generation
- **`GenesisConfigManager`** (core) - Genesis block configuration and UTXO-based initial allocations
- **`SecureMobileWallet`** (mobile-wallet) - Cryptographically secure wallet with key pairs
- **`LorachainNode`** (node) - Full node with mining and peer management
- **`MeshProtocol`** (mesh-protocol) - LoRa mesh communication
- **`Logger`** (shared) - Centralized logging with levels

### Technical Constraints

- **LoRa mesh networking**: Extremely limited bandwidth and 256-byte packet size
- **Battery optimization**: Designed for low-power, resource-constrained devices
- **Hybrid connectivity**: Must work offline with occasional internet synchronization
- **Proof-of-Work consensus** with adaptive difficulty based on network conditions

### Testing Strategy

Each package includes comprehensive unit tests using Vitest:

- **Core package**: Tests for blockchain, UTXO management, persistence layer, cryptographic services, merkle trees, difficulty adjustment, and block functionality
  - **Database layer**: 29 tests covering LevelDB wrapper, memory database, and sublevel operations
  - **Persistence manager**: 30 tests covering UTXO storage, blockchain state management, and cryptographic key persistence
  - **Integration tests**: 19 tests covering full persistence workflows, cross-database compatibility, and performance
  - **Difficulty adjustment**: 25 tests covering Bitcoin-style algorithms, hashrate calculation, and edge cases
  - **Blockchain integration**: 15 tests covering end-to-end difficulty adjustment and validation
  - **Genesis configuration**: 35 tests covering configurable genesis blocks, UTXO allocations, and network parameters
  - **UTXO transaction creation and validation**
  - **Merkle tree proof generation, verification, and compression**
  - **SPV transaction verification and block header validation**
  - **Cryptographic key generation and signing (ECDSA/Ed25519)**
  - **UTXO set management and balance calculation**
  - **Database integrity validation and corruption recovery**
- **Shared package**: Tests for logger and utility functions
- **Mobile wallet**: Tests for secure wallet operations with cryptographic key pairs
- **Node package**: Tests for full node functionality
- **Mesh protocol**: Tests for LoRa communication protocol

**Total test coverage**: 593+ tests across all packages with 100% passing rate.

Run package-specific tests with `cd packages/<name> && pnpm test` or use watch mode for development with `pnpm test:watch`.

### Key Implementation Details

- **UTXO Model**: All transactions use inputs/outputs instead of account balances
- **Difficulty Adjustment**: Bitcoin-style algorithm with 10-block adjustment periods and 4x max change bounds
- **Network Monitoring**: Real-time hashrate calculation and difficulty state tracking
- **Block Validation**: Enhanced validation including difficulty requirements and timestamp manipulation protection
- **Persistence Architecture**: Comprehensive blockchain state persistence with LevelDB and memory database support
- **Database Organization**: Sublevel-based data separation (blocks, UTXOs, transactions, keys, metadata, config)
- **UTXO Storage**: Efficient UTXO set persistence with address-based indexing and balance calculation
- **Cryptographic Key Storage**: Secure key pair persistence supporting secp256k1 and Ed25519 algorithms
- **Data Integrity**: Blockchain state validation, corruption detection, and automatic repair capabilities
- **Atomic Operations**: Batch database operations ensuring consistency and performance optimization
- **Merkle Tree System**: UTXO-only merkle tree with proof generation, verification, and compression
- **SPV Support**: Simplified Payment Verification for light clients without full blockchain data
- **Proof Compression**: Optimized for LoRa's 256-byte message constraints using bit manipulation
- **Cryptographic Signatures**: Transactions are signed with either secp256k1 or ed25519
- **Transaction Structure**: UTXOTransaction with inputs (referencing previous outputs) and outputs
- **Balance Calculation**: Derived from unspent transaction outputs (UTXOs) for each address
- **Transaction Validation**: Checks UTXO existence, ownership, and signature validity
- **Genesis Configuration**: Configurable genesis blocks with UTXO-based initial allocations and network parameters
- **Clean Implementation**: No backwards compatibility - modern, clean implementations throughout

### Merkle Tree System (NO LEGACY SUPPORT)

The merkle tree implementation is **UTXO-only** and follows the project's "NO BACKWARDS COMPATIBILITY" policy:

- **`MerkleTree.buildTree()`**: Build merkle tree from UTXO transactions only
- **`MerkleTree.generateProof()`**: Generate merkle proof for UTXO transactions
- **`MerkleTree.verifyProof()`**: Verify merkle proofs against merkle roots
- **`MerkleTree.compressProof()`**: Compress proofs for LoRa transmission (~50% reduction)
- **`MerkleTree.calculateRoot()`**: Calculate merkle root from UTXO transactions
- **`SPVManager.verifyTransaction()`**: SPV verification for UTXO transactions
- **`SPVManager.validateBlockHeader()`**: Block header validation for chain continuity
- **`SPVManager.verifyTransactionBatch()`**: Batch verification for efficiency
- **`BlockManager.generateMerkleProof()`**: Generate proofs from UTXO transaction sets
- **`BlockManager.verifyTransactionInBlock()`**: Verify UTXO transactions in blocks

**Key Constraints:**

- LoRa 256-byte message limit requires proof compression and potential fragmentation
- All merkle operations are UTXO-exclusive (no legacy Transaction type support)
- SPV clients can verify transactions without downloading full blocks
- Proof compression uses bit manipulation to optimize for network constraints

### Persistence Layer Architecture (UTXO-FOCUSED)

The persistence layer is **UTXO-only** and follows the project's "NO BACKWARDS COMPATIBILITY" policy:

#### Database Implementation

- **`LevelDatabase`**: Production LevelDB wrapper with async initialization and sublevel organization
- **`MemoryDatabase`**: In-memory implementation for testing and development
- **`DatabaseFactory`**: Factory pattern for creating database instances based on configuration
- **Sublevel Organization**: Data separated into blocks, utxo_set, utxo_transactions, pending_utxo_tx, metadata, config, nodes, crypto_keys

#### Persistence Manager Operations

- **`UTXOPersistenceManager.saveBlock()`**: Save blocks with automatic latest block index updates
- **`UTXOPersistenceManager.saveUTXO()`**: Store UTXO with address-based indexing
- **`UTXOPersistenceManager.getUTXOsForAddress()`**: Retrieve all UTXOs for an address (sorted by value)
- **`UTXOPersistenceManager.saveKeyPair()`**: Store cryptographic key pairs (secp256k1/Ed25519)
- **`UTXOPersistenceManager.saveBlockchainState()`**: Atomic save of complete blockchain state
- **`UTXOPersistenceManager.loadBlockchainState()`**: Load complete blockchain state with defaults
- **`UTXOPersistenceManager.validateIntegrity()`**: Validate blockchain state integrity
- **`UTXOPersistenceManager.repairCorruption()`**: Detect and repair corrupted data
- **`UTXOPersistenceManager.rebuildUTXOSet()`**: Rebuild UTXO set from blocks

#### Database Features

- **Batch Operations**: Atomic multi-operation transactions grouped by sublevel
- **Compression**: Optional gzip compression for efficient storage
- **Error Handling**: Graceful degradation for corrupted data and network failures
- **Async Initialization**: Proper database opening and cleanup lifecycle management
- **Integrity Validation**: Block chain continuity, UTXO set consistency, configuration validation
- **Performance Optimization**: UTXO selection algorithms and efficient address-based queries

**Key Constraints:**

- All persistence operations are UTXO-exclusive (no legacy Transaction type support)
- Database supports both LevelDB (production) and Memory (testing) backends
- Sublevel organization ensures clean data separation and efficient queries
- Batch operations optimize performance while maintaining atomic consistency

### Genesis Configuration System (UTXO-FOCUSED)

The genesis configuration system provides comprehensive control over blockchain initialization:

#### Genesis Configuration Manager Operations

- **`GenesisConfigManager.loadConfig()`**: Load genesis configuration from JSON files (devnet, testnet, mainnet)
- **`GenesisConfigManager.createGenesisBlock()`**: Generate genesis block with UTXO-based initial allocations
- **`GenesisConfigManager.validateConfig()`**: Validate genesis configuration structure and values
- **`GenesisConfigManager.initializeBlockchain()`**: Initialize blockchain with genesis configuration
- **`GenesisConfigManager.getNetworkParameters()`**: Retrieve network-specific parameters

#### Configuration Features

- **Initial UTXO Allocations**: Configure initial coin distribution with UTXO-based allocations
- **Network Parameters**: Set block time targets, difficulty adjustment parameters, and reward schedules
- **Multi-Network Support**: Separate configurations for devnet, testnet, and mainnet
- **Validation**: Comprehensive validation of all configuration parameters
- **Clean Implementation**: No backwards compatibility - UTXO-exclusive design

**Key Constraints:**

- All genesis operations are UTXO-exclusive (no legacy support)
- Initial allocations create proper UTXO outputs for addresses
- Network parameters are immutable after blockchain initialization
- Configuration files must pass strict validation before use
