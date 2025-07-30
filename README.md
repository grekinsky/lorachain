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
- `pnpm test` - Run tests for all packages (uses vitest)
- `pnpm lint` - Run ESLint for all packages
- `pnpm lint:fix` - Run ESLint with auto-fix for all packages
- `pnpm format` - Format code with Prettier
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm clean` - Clean build artifacts

### Package-specific Development

Navigate to any package directory and run commands specific to that package:

```bash
cd packages/core
pnpm dev          # Watch mode for core package
pnpm test         # Run tests for specific package
pnpm test:watch   # Watch mode for tests
pnpm test:run     # Run tests once (no watch mode)
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
- **Proof-of-Work consensus mechanism**

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

LoRa/Meshtastic communication layer:

- Mesh network communication
- Message serialization and validation
- Node discovery and routing

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
- **Consensus**: Proof-of-Work with adaptive difficulty
- **Block Time**: Dynamic based on network conditions
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

### LoRa Network Constraints

- **Bandwidth**: Extremely limited data transmission rates
- **Message Size**: 256 bytes maximum per packet
- **Duty Cycle**: Regulatory restrictions on transmission frequency
- **Range**: Balance between power consumption and communication distance

## Testing

The project includes comprehensive unit tests for all packages using Vitest.

Run the test suite:

```bash
pnpm test
```

Run tests in watch mode for development:

```bash
# For all packages
pnpm test:watch

# For specific package
cd packages/core && pnpm test:watch
```

Run tests once (no watch mode):

```bash
pnpm test:run
```

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

### Recently Implemented Features

- **Comprehensive Persistence Layer**: Production-ready blockchain state persistence with LevelDB integration
- **Database Infrastructure**: Dual database support (LevelDB for production, Memory for testing) with sublevel organization
- **UTXO Persistence**: Complete UTXO set storage with address-based queries, balance calculation, and efficient retrieval
- **Cryptographic Key Storage**: Secure key pair persistence supporting both secp256k1 and Ed25519 algorithms
- **Data Integrity**: Blockchain state validation, corruption detection, and automatic repair capabilities
- **Atomic Operations**: Batch database operations ensuring data consistency and performance optimization
- **Comprehensive Testing**: 78+ persistence tests covering database operations, state management, and error scenarios
- **UTXO Transaction Model**: Complete implementation replacing the account-based model
- **Merkle Tree Verification**: Advanced merkle proof generation and SPV support for light clients
- **Cryptographic Security**: Full ECDSA (secp256k1) and Ed25519 signature support
- **Secure Wallets**: Cryptographically secure wallet implementation with key pair generation
- **UTXO Management**: Efficient UTXO set tracking, selection algorithms, and balance calculation
- **Enhanced Security**: All transactions now use proper cryptographic signatures
- **LoRa Optimization**: Proof compression techniques optimized for 256-byte message constraints

### Foundation Features

- Complete monorepo structure with all core packages
- TypeScript configuration with strict type checking
- Vitest-based testing framework with comprehensive test coverage
- ESLint and Prettier for code quality
- Production-ready blockchain, wallet, and mesh protocol components

Additional features and optimizations will be added in future releases.
