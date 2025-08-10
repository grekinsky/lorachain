# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lorachain is a lightweight blockchain network designed for cryptocurrency transactions in communities with limited internet connectivity using LoRa mesh networking technology. It operates on a hybrid architecture with light clients (mobile wallets) and synchronized nodes (full nodes).

The blockchain uses a **UTXO (Unspent Transaction Output) model** for transaction management and supports **cryptographic signing** with both ECDSA (secp256k1) and Ed25519 algorithms.

**Current Development Status**: ~40-45% complete toward MVP goal with Milestone 1 (Core Blockchain) fully implemented and Milestone 2 (LoRa/Mesh Protocol) significantly enhanced with compression, prioritization, advanced routing, duty cycle management, and regional compliance. See `specs/ROADMAP.md` for detailed progress tracking.

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

- `pnpm test` - Run full test suite for all packages (unit + integration)
- `pnpm test:unit` - Run unit tests for all packages
- `pnpm test:integration` - Run integration tests for all packages (core package only has integration tests)
- Package-specific testing:
  - `cd packages/core && pnpm test` - Run full test suite for package
  - `cd packages/core && pnpm test:unit` - Run unit tests only
  - `cd packages/core && pnpm test:unit:watch` - Unit tests in watch mode
  - `cd packages/core && pnpm test:integration` - Run integration tests only (core package only)
  - `cd packages/core && pnpm test:integration:watch` - Integration tests in watch mode (core package only)
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
- **Vitest** for testing framework with comprehensive coverage (660+ tests: 594 unit, 66 integration)
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
- **`CryptographicService`** (core) - Key generation, signing, and verification (ECDSA/Ed25519) - Note: `generateKeyPair()` is a static method
- **`SecureTransactionManager`** (core) - Cryptographically secure transaction creation
- **`BlockManager`** (core) - Block creation, mining, validation, and merkle proof generation
- **`GenesisConfigManager`** (core) - Genesis block configuration and UTXO-based initial allocations
- **`SecureMobileWallet`** (mobile-wallet) - Cryptographically secure wallet with key pairs
- **`LorachainNode`** (node) - Full node with mining and peer management
- **`EnhancedMeshProtocol`** (mesh-protocol) - Advanced LoRa mesh communication with UTXO-aware routing and duty cycle compliance
- **`UTXORouteManager`** (mesh-protocol) - UTXO-optimized routing with blockchain awareness and cryptographic security
- **`DutyCycleManager`** (mesh-protocol) - Regional compliance for EU/US/Japan/Australia with transmission scheduling
- **`RegionalComplianceValidator`** (mesh-protocol) - Regulatory compliance validation and enforcement
- **`UTXOPriorityMeshProtocol`** (core) - Priority-based message handling with QoS and emergency mode
- **`UTXOPriorityQueue`** (core) - Message queue management with priority levels and memory limits
- **`UTXOPriorityCalculator`** (core) - Fee-based priority calculation with multiple factors
- **`UTXOQoSManager`** (core) - Quality of Service management with duty cycle integration
- **`CompressionFactory`** (core) - Factory for creating compression engines (gzip, zlib, brotli, lz4)
- **`UTXOCompressionManager`** (core) - UTXO-specific compression with engine selection
- **`Logger`** (shared) - Centralized logging with levels

### Technical Constraints

- **LoRa mesh networking**: Extremely limited bandwidth and 256-byte packet size
- **Battery optimization**: Designed for low-power, resource-constrained devices
- **Hybrid connectivity**: Must work offline with occasional internet synchronization
- **Proof-of-Work consensus** with adaptive difficulty based on network conditions

## Testing Requirements

### Pre-Testing Checklist

**IMPORTANT**: Before running unit tests in any app or package, ensure all dependent packages are built:

```bash
# Always build shared packages first (dependency order)
pnpm --filter "@lorachain/shared" build
pnpm --filter "@lorachain/core" build

# Then build other packages if needed
pnpm --filter "@lorachain/mesh-protocol" build
pnpm --filter "@lorachain/mobile-wallet" build
pnpm --filter "@lorachain/node" build

# Then run tests
pnpm --filter "@lorachain/mobile-wallet" test
pnpm --filter "wallet-app" test
pnpm --filter "node-server" test
```

### Why This Matters

- **Shared packages** (`@lorachain/shared`, `@lorachain/core`) are consumed by apps as compiled JavaScript
- **Source changes** in these packages don't automatically trigger rebuilds
- **Test failures** may occur if consuming apps use outdated compiled versions
- **UTXO transaction validation** issues are common when `@lorachain/core` is not rebuilt after changes
- **Cryptographic signature verification** may fail if core packages aren't properly compiled

### Testing Commands

```bash
# Build dependencies and run all tests
pnpm --filter "@lorachain/shared" build && pnpm --filter "@lorachain/core" build && pnpm test

# Run specific test suites
pnpm test:unit                                          # Run all unit tests
pnpm test:integration                                   # Run all integration tests

# Individual package testing (after building dependencies)
pnpm --filter "@lorachain/core" test:unit               # Run core unit tests
pnpm --filter "@lorachain/core" test:integration        # Run core integration tests
pnpm --filter "@lorachain/core" test:coverage           # Run core tests with coverage
pnpm --filter "@lorachain/mobile-wallet" test:unit      # Run mobile wallet unit tests
pnpm --filter "@lorachain/mesh-protocol" test:unit      # Run mesh protocol unit tests
pnpm --filter "@lorachain/node" test:unit               # Run node unit tests
pnpm --filter "wallet-app" test:unit                    # Run wallet app unit tests
pnpm --filter "node-server" test:unit                   # Run node server unit tests

# Watch mode testing (after building dependencies)
pnpm --filter "@lorachain/core" test:unit:watch         # Unit tests watch mode
pnpm --filter "@lorachain/core" test:integration:watch  # Integration tests watch mode
pnpm --filter "@lorachain/mobile-wallet" test:unit:watch # Mobile wallet watch mode
```

### IMPORTANT Testing Best Practices

**⚠️ Critical Testing Guidelines:**

1. **ALWAYS check current directory with `pwd` before using `cd`**: This prevents "no such file or directory" errors by ensuring you know your current location before attempting navigation:

   ```bash
   # ✅ CORRECT: Always check where you are first
   pwd  # Check current directory
   # Output: /Users/greco/Documents/lorachain/packages/core
   cd ../..  # Navigate relative to current location

   # ❌ WRONG: Blindly changing directories without checking location
   cd packages/core  # May fail if already in packages/core!
   ```

2. **Always use `test:run` for single-run testing**: The default `test` command runs in watch mode and will wait indefinitely for file changes, causing timeouts in automated environments.

3. **Avoid unnecessary directory changes**: When already in the project root, use filter commands instead of `cd` to avoid "no such file or directory" errors:

   ```bash
   # ❌ WRONG: Don't change to directories that don't exist relative to current location
   cd packages/core && pnpm test

   # ✅ CORRECT: Use filter commands from project root
   pnpm --filter "@lorachain/core" test:run
   ```

4. **Build dependencies before testing**: Always build shared packages first to avoid test failures due to outdated compiled versions.

5. **Use appropriate test commands**:
   - `test` - Run full test suite (unit + integration)
   - `test:unit` - Run unit tests only
   - `test:unit:watch` - Unit tests in watch mode
   - `test:integration` - Run integration tests only (core package)
   - `test:integration:watch` - Integration tests in watch mode (core package)
   - `test:run` - Single test execution (deprecated, use test:unit or test:integration)

### Dependency Build Order

The Lorachain monorepo has the following dependency hierarchy:

1. **`@lorachain/shared`** - Base utilities (no dependencies)
2. **`@lorachain/core`** - Core blockchain logic (depends on shared)
3. **`@lorachain/mesh-protocol`** - LoRa communication (depends on core, shared)
4. **`@lorachain/mobile-wallet`** - Mobile wallet (depends on core, mesh-protocol, shared)
5. **`@lorachain/node`** - Full node (depends on core, mesh-protocol, shared)
6. **Apps** - wallet-app, node-server (depend on all packages)

Always build in dependency order when testing specific packages that depend on others.

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
- **Enhanced mesh protocol**: Tests for advanced LoRa communication with UTXO routing, duty cycle management, and regional compliance
- **Advanced routing**: Tests for flood routing, cryptographic verification, path optimization, and blockchain awareness
- **Duty cycle compliance**: Tests for regional regulations (EU/US/Japan/Australia), transmission scheduling, and compliance validation
- **Fragmentation system**: Tests for enhanced fragmentation with missing fragment detection and retransmission

**Total test coverage**: 660+ tests across all packages with 100% passing rate covering Milestone 1 and significant portions of Milestone 2.
- **594 unit tests**: Fast, isolated tests for individual components
- **66 integration tests**: Comprehensive system-level tests (core package)
- **Separated configurations**: vitest.config.unit.ts and vitest.config.integration.ts for optimized test execution

Run package-specific tests with `cd packages/<name> && pnpm test` or use watch mode for development with `pnpm test:watch`.

**Development Progress**: Currently ~40-45% complete toward MVP goal. Estimated 7-10 months total development time with significant progress on Milestone 2 (LoRa/Mesh Protocol) including compression, prioritization, advanced routing, duty cycle management, and regional compliance.

### Key Implementation Details

#### ✅ Milestone 1 - Core Blockchain (COMPLETED)

- **UTXO Model**: All transactions use inputs/outputs instead of account balances
- **Cryptographic Security**: Full ECDSA (secp256k1) and Ed25519 signature implementation
- **Transaction Validation**: Complete validation including double-spend prevention and signature verification
- **Merkle Tree System**: UTXO-only merkle tree with proof generation, verification, and compression
- **SPV Support**: Simplified Payment Verification for light clients without full blockchain data
- **Persistence Architecture**: Comprehensive blockchain state persistence with LevelDB and memory database support
- **Database Organization**: Sublevel-based data separation (blocks, UTXOs, transactions, keys, metadata, config)
- **UTXO Storage**: Efficient UTXO set persistence with address-based indexing and balance calculation
- **Cryptographic Key Storage**: Secure key pair persistence supporting secp256k1 and Ed25519 algorithms
- **Data Integrity**: Blockchain state validation, corruption detection, and automatic repair capabilities
- **Atomic Operations**: Batch database operations ensuring consistency and performance optimization
- **Difficulty Adjustment**: Bitcoin-style algorithm with 10-block adjustment periods and 4x max change bounds
- **Network Monitoring**: Real-time hashrate calculation and difficulty state tracking
- **Block Validation**: Enhanced validation including difficulty requirements and timestamp manipulation protection
- **Genesis Configuration**: Configurable genesis blocks with UTXO-based initial allocations and network parameters
- **Clean Implementation**: No backwards compatibility - modern, clean implementations throughout

#### 🔄 Milestone 2 - LoRa/Mesh Protocol (SIGNIFICANTLY ENHANCED)

- **✅ Enhanced Message Fragmentation**: Advanced fragmentation with blockchain-aware optimization, fragment sequencing, and tracking
- **✅ Comprehensive Message Reassembly**: Reconstruct fragmented messages with timeout handling, missing fragment detection, and retransmission
- **✅ Advanced Routing Protocol**: UTXO-aware flood routing, blockchain-optimized routing tables, multi-hop forwarding, and cryptographic loop prevention
- **✅ Complete Duty Cycle Management**: Regional compliance validation (EU ETSI, US/CA/MX FCC, Japan ARIB, Australia/NZ ACMA), transmission scheduling, and regulatory enforcement
- **✅ Enhanced Mesh Protocol**: Comprehensive mesh networking with UTXO routing capabilities, duty cycle compliance, and network topology management
- **✅ Compression**: Multiple compression engines (gzip, zlib, brotli, lz4) with UTXO-specific optimization for 256-byte LoRa constraints
- **✅ Message Prioritization**: Priority queues with fee-based calculation, QoS levels, emergency mode, and duty cycle integration
- **🔲 Reliable Delivery**: Acknowledgment mechanism, retry logic, and delivery confirmation (PENDING)
- **🔲 Node Discovery Protocol**: Periodic beacons, neighbor management, and topology mapping (PENDING)

#### 🔲 Remaining Milestones (PENDING)

- **Milestone 3**: Network Layer & P2P (HTTP/WebSocket, sync protocol, peer management)
- **Milestone 4**: Wallet Functionality (HD wallet, transaction building, QR codes)
- **Milestone 5**: Mining & Consensus (optimized mining, pool support)
- **Milestone 6**: Security & Validation (rate limiting, encryption)
- **Milestone 7**: User Applications (CLI wallet, mobile UI)
- **Milestone 8**: Testing & Documentation (integration tests, API docs)
- **Milestone 9**: MVP Polish (configuration, Docker images)

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
