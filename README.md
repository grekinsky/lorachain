# Lorachain

A lightweight blockchain network designed to enable cryptocurrency transactions in communities with limited internet connectivity using LoRa mesh networking technology.

## Overview

Lorachain leverages LoRa mesh networking through Meshtastic devices to create a resilient, low-power communication infrastructure for financial transactions. The system is designed for rural communities and environments where traditional internet connectivity is unreliable or unavailable.

## Architecture

### Network Topology

The Lorachain network operates on a hybrid architecture with two distinct client types:

- **Light Clients (Mobile Wallets)**: Smartphone applications that operate without direct internet connectivity
- **Synchronized Nodes (Full Nodes)**: Internet-connected nodes that participate in block validation and network synchronization

### Key Features

- **UTXO Model**: Full Unspent Transaction Output (UTXO) model for enhanced security and transaction verification
- **Merkle Tree Verification**: Advanced merkle proof generation and SPV support for light clients
- **Cryptographic Security**: ECDSA (secp256k1) and Ed25519 signature algorithms for transaction signing
- **LoRa Optimization**: Proof compression and fragmentation optimized for 256-byte message constraints
- **Low Resource Consumption**: Optimized for battery-powered devices and minimal data transfer
- **Mesh Network Resilience**: Multi-hop communication through LoRa mesh with automatic route discovery
- **Hybrid Connectivity**: Combines offline resilience with online synchronization capabilities

## Project Structure

This is a monorepo organized with PNPM workspaces:

```
lorachain/
├── packages/                    # Core packages
│   ├── core/                   # Blockchain core logic
│   ├── mobile-wallet/          # Light client mobile app
│   ├── node/                   # Synchronized node implementation
│   ├── mesh-protocol/          # LoRa/Meshtastic communication layer
│   └── shared/                 # Common utilities and types
├── apps/                       # Applications
│   ├── wallet-app/             # Mobile wallet application
│   └── node-server/            # Business node server
├── specs/                      # Project specifications
└── ai_docs/                    # AI-generated documentation
```

## Prerequisites

- Node.js >= 18.0.0
- PNPM >= 8.0.0

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd lorachain
```

2. Install dependencies:

```bash
pnpm install
```

3. Build all packages:

```bash
pnpm build
```

## Development

### Available Scripts

- `pnpm build` - Build all packages
- `pnpm dev` - Start development mode for all packages
- `pnpm test` - Run full test suite (unit + integration tests)
- `pnpm test:unit` - Run unit tests for all packages
- `pnpm test:integration` - Run integration tests for all packages
- `pnpm lint` - Run ESLint for all packages
- `pnpm lint:fix` - Run ESLint with auto-fix for all packages
- `pnpm format` - Format code with Prettier
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm clean` - Clean build artifacts

### Package-specific Development

Navigate to any package directory and run commands specific to that package:

```bash
cd packages/core
pnpm dev                  # Watch mode for core package
pnpm test                 # Run full test suite for package
pnpm test:unit            # Run unit tests only
pnpm test:unit:watch      # Unit tests in watch mode
pnpm test:integration     # Run integration tests only (core package only)
pnpm test:integration:watch # Integration tests in watch mode (core package only)
pnpm test:run             # Run tests once (no watch mode)
```

## Packages

### @lorachain/core

Core blockchain functionality including:

- **UTXO-based transaction management and validation**
- **Comprehensive persistence layer with LevelDB and memory database support**
- **Blockchain state persistence with atomic operations and integrity validation**
- **UTXO set persistence with address-based queries and balance calculation**
- **Cryptographic key storage with secp256k1 and Ed25519 algorithm support**
- **Merkle tree verification with proof generation and SPV support**
- **Cryptographic services (ECDSA/Ed25519 key generation and signing)**
- **Block creation and mining with persistent state management**
- **Database corruption recovery and validation capabilities**
- **Dynamic difficulty adjustment with Bitcoin-style algorithms optimized for LoRa networks**
- **Network hashrate calculation and monitoring**
- **Proof-of-Work consensus mechanism with adaptive difficulty**
- **Genesis configuration system with UTXO-based initial allocations and network parameter management**
- **UTXO compression system with multiple compression engines (gzip, zlib, brotli, lz4)**
- **Message prioritization system with fee-based priority calculation**
- **Complete backwards compatibility removal with modern, clean implementations**

### @lorachain/shared

Shared utilities and types used across the project:

- Logging utilities
- Common helper functions
- Type definitions

### @lorachain/mobile-wallet

Mobile wallet implementation for light clients:

- Secure wallet creation with cryptographic key pairs
- UTXO-based transaction creation and signing
- Balance tracking via UTXO set
- Support for both ECDSA and Ed25519 signatures

### @lorachain/node

Full node implementation for synchronized nodes:

- Blockchain synchronization
- Transaction and block validation
- Mining capabilities
- Peer-to-peer networking

### @lorachain/mesh-protocol

Advanced LoRa/Meshtastic communication layer:

- **Enhanced Mesh Protocol**: UTXO-aware routing with blockchain optimization
- **Comprehensive Duty Cycle Management**: Regional compliance for EU, US, Japan, Australia
- **Advanced Routing**: Flood routing, cryptographic loop prevention, and path optimization
- **Message fragmentation and reassembly** with missing fragment detection
- **Priority-based message handling**: QoS levels, emergency mode, fee-based prioritization
- **Reliable delivery system**: ACK/NACK processing, retry logic with exponential backoff, circuit breakers
- **UTXO compression integration**: Optimized compression for LoRa 256-byte constraints
- **Regulatory Compliance**: Automatic duty cycle enforcement and transmission scheduling
- **Network Topology Management**: Dynamic routing table updates and neighbor discovery
- **Node Discovery Protocol**: Comprehensive periodic beacons, neighbor management, and network topology mapping

## Applications

### Wallet App

Mobile wallet application for end users:

```bash
cd apps/wallet-app
pnpm start
```

Features:

- Create and manage wallets
- Send transactions via mesh network
- View transaction history
- Connect to mesh nodes

### Node Server

Full node server for businesses and network infrastructure:

```bash
cd apps/node-server
pnpm start
```

Features:

- Full blockchain validation
- Transaction mining
- Network synchronization
- Mesh network bridge

## Technical Specifications

### Blockchain Features

- **Transaction Model**: UTXO (Unspent Transaction Output) for enhanced security and verification
- **Persistence Layer**: Comprehensive blockchain state persistence with LevelDB and memory database support
- **Database Features**: Atomic batch operations, compression, integrity validation, corruption recovery
- **UTXO Persistence**: Efficient UTXO set storage with address-based queries and balance calculation
- **Cryptographic Storage**: Secure key pair persistence supporting secp256k1 and Ed25519 algorithms
- **Merkle Tree System**: Merkle proof generation, verification, and compression for SPV support
- **Light Client Support**: Simplified Payment Verification (SPV) for mobile wallets
- **Consensus**: Proof-of-Work with adaptive difficulty adjustment
- **Difficulty Adjustment**: Bitcoin-style algorithm with 10-block adjustment periods and 4x max change bounds
- **Block Time**: 5-minute target optimized for LoRa network propagation delays
- **Network Monitoring**: Real-time hashrate calculation and difficulty state tracking
- **Transaction Fees**: Calculated based on transaction size and UTXO inputs/outputs
- **Security**: SHA-256 hashing with ECDSA (secp256k1) or Ed25519 digital signatures
- **UTXO Management**: Efficient UTXO set tracking, selection algorithms, and balance calculation

### Merkle Tree and SPV Features

- **UTXO-Only Design**: Merkle trees built exclusively from UTXO transactions (no legacy support)
- **Proof Generation**: Generate merkle proofs for any transaction in a block
- **Proof Verification**: Verify transaction inclusion without full block data
- **SPV Support**: Simplified Payment Verification for light clients and mobile wallets
- **Proof Compression**: ~50% size reduction using bit manipulation techniques
- **LoRa Optimization**: Proofs compressed to fit within 256-byte message constraints
- **Batch Verification**: Efficient verification of multiple transactions simultaneously
- **Block Header Validation**: Chain continuity and proof-of-work validation for SPV clients

### LoRa Network Constraints & Compliance

- **Bandwidth**: Extremely limited data transmission rates with optimization for blockchain data
- **Message Size**: 256 bytes maximum per packet with advanced fragmentation support
- **Regional Duty Cycle Compliance**:
  - **EU (ETSI)**: Sub-band duty cycles (0.1%, 1%, 10%) with frequency-specific limits
  - **US/CA/MX (FCC)**: Frequency hopping with dwell time restrictions
  - **Japan (ARIB)**: 10% duty cycle limits with power restrictions
  - **Australia/NZ (ACMA)**: Power limits with flexible duty cycle management
- **Advanced Scheduling**: Intelligent transmission scheduling with regulatory compliance
- **Range**: Balance between power consumption and communication distance with topology optimization

## Testing

The project includes comprehensive unit and integration tests for all packages using Vitest. Tests are separated into unit tests (fast, isolated) and integration tests (comprehensive, system-level).

Run the full test suite:

```bash
pnpm test                # Run all tests (unit + integration)
pnpm test:unit           # Run only unit tests
pnpm test:integration    # Run only integration tests
```

Run tests in watch mode for development:

```bash
# For specific package
cd packages/core && pnpm test:unit:watch        # Unit tests in watch mode
cd packages/core && pnpm test:integration:watch # Integration tests in watch mode
```

Run tests once (no watch mode):

```bash
pnpm test:run            # Run all tests once
pnpm test:unit           # Run unit tests once
pnpm test:integration    # Run integration tests once
```

**Test Coverage**: 803+ tests across all packages

- 721 unit tests for fast feedback during development
- 82 integration tests for comprehensive system validation
- 100% pass rate with separated test configurations

## Code Quality

The project uses ESLint and Prettier for code quality and formatting:

```bash
pnpm lint        # Check for linting errors
pnpm lint:fix    # Auto-fix linting errors
pnpm format      # Format code with Prettier
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `pnpm test`
5. Ensure code quality: `pnpm lint && pnpm typecheck`
6. Commit your changes: `git commit -m 'Add new feature'`
7. Push to the branch: `git push origin feature/new-feature`
8. Submit a pull request

## Use Cases

### Primary Use Case: Remote Community Commerce

- Rural communities with limited internet infrastructure
- Digital payments without constant internet connectivity
- Mesh network enabling cryptocurrency transactions through LoRa communication

### Secondary Use Cases

- Emergency communication networks with payment capabilities
- Temporary event-based economies (festivals, markets)
- Backup payment systems for internet outages

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Check the documentation in the `specs/` directory
- Review the AI-generated documentation in `ai_docs/`

---

**Note**: This project is in active development. The current implementation provides a foundation for the Lorachain network with:

### Development Progress (MVP Roadmap Status)

#### ✅ Milestone 1: Core Blockchain Enhancement (COMPLETED)

- **Genesis Configuration System**: Complete configurable genesis block system with UTXO-based initial coin distribution and network parameter management
- **Cryptographic Security**: Full ECDSA (secp256k1) and Ed25519 signature support with proper transaction signing
- **UTXO Transaction Model**: Complete UTXO implementation with inputs/outputs, double-spend prevention, and validation
- **Merkle Tree Verification**: Advanced merkle proof generation, compression, and SPV support for light clients
- **Comprehensive Persistence Layer**: Production-ready blockchain state persistence with LevelDB integration and atomic operations
- **Dynamic Difficulty Adjustment**: Bitcoin-style difficulty adjustment with 10-block periods and network hashrate monitoring
- **Enhanced Security**: All transactions use proper cryptographic signatures with signature verification

#### ✅ Milestone 2: LoRa/Mesh Protocol Implementation (COMPLETED)

- **✅ Enhanced Message Fragmentation**: Advanced fragmentation with blockchain-aware optimization and fragment tracking
- **✅ Comprehensive Message Reassembly**: Reconstruct fragmented messages with timeout handling and missing fragment detection
- **✅ Advanced Routing Protocol**: UTXO-aware flood routing, blockchain-optimized routing tables, multi-hop forwarding, and cryptographic loop prevention
- **✅ Complete Duty Cycle Management**: Regional compliance validation (EU/US/Japan/Australia), transmission scheduling, and regulatory compliance
- **✅ Enhanced Mesh Protocol**: Comprehensive mesh networking with UTXO routing capabilities and duty cycle compliance
- **✅ Compression**: Multiple compression engines (gzip, zlib, brotli, lz4) with UTXO-specific optimization
- **✅ Message Prioritization**: Priority queues with fee-based calculation, QoS levels, and emergency mode support
- **✅ Reliable Delivery**: Acknowledgment mechanism, retry logic, and delivery confirmation with cryptographic security
- **✅ Node Discovery Protocol**: Periodic beacons, neighbor management, and network topology mapping

#### 🔲 Upcoming Milestones (PENDING)

- **Milestone 3**: Network Layer & P2P (HTTP/WebSocket, sync protocol, peer management)
- **Milestone 4**: Wallet Functionality (HD wallet, transaction building, QR codes)
- **Milestone 5**: Mining & Consensus (optimized mining, pool support, reward distribution)
- **Milestone 6**: Security & Validation (malleability fixes, rate limiting, encryption)
- **Milestone 7**: User Applications (CLI wallet, mobile UI, merchant tools)
- **Milestone 8**: Testing & Documentation (integration tests, API docs, deployment guides)
- **Milestone 9**: MVP Polish (configuration, mainnet/testnet, Docker images)

**Current Progress**: ~50-55% complete toward MVP goal

### Technical Foundation

- **Comprehensive Test Coverage**: 803+ tests across all packages with 100% passing rate (721 unit tests, 82 integration tests)
- **Database Infrastructure**: Dual database support (LevelDB for production, Memory for testing) with sublevel organization
- **UTXO Persistence**: Complete UTXO set storage with address-based queries, balance calculation, and efficient retrieval
- **Cryptographic Key Storage**: Secure key pair persistence supporting both secp256k1 and Ed25519 algorithms
- **Data Integrity**: Blockchain state validation, corruption detection, and automatic repair capabilities
- **Atomic Operations**: Batch database operations ensuring data consistency and performance optimization
- **LoRa Optimization**: Proof compression techniques optimized for 256-byte message constraints
- **Enhanced Block Validation**: Comprehensive difficulty validation and timestamp manipulation protection
- **Production-Ready Components**: Complete monorepo structure with TypeScript, Vitest testing, and code quality tools

**Estimated Timeline**: 7-10 months total for MVP completion (currently 50-55% complete)

For detailed development progress and upcoming features, see `specs/ROADMAP.md`.
