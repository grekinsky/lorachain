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

- **Low Resource Consumption**: Optimized for battery-powered devices and minimal data transfer
- **High Security**: Cryptographic transaction validation and decentralized consensus mechanisms
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

- Transaction management and validation
- Block creation and mining
- Blockchain state management
- Consensus mechanisms

### @lorachain/shared

Shared utilities and types used across the project:

- Logging utilities
- Common helper functions
- Type definitions

### @lorachain/mobile-wallet

Mobile wallet implementation for light clients:

- Wallet creation and management
- Transaction creation and signing
- Balance tracking

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

- **Consensus**: Proof-of-Work with adaptive difficulty
- **Block Time**: Dynamic based on network conditions
- **Transaction Fees**: Minimal fees optimized for micro-transactions
- **Security**: SHA-256 hashing and digital signatures

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

**Note**: This project is in active development. The current implementation provides a foundation for the Lorachain network with basic blockchain functionality, comprehensive unit tests, and mesh networking capabilities. The codebase includes:

- Complete monorepo structure with all core packages
- TypeScript configuration with strict type checking
- Vitest-based testing framework with comprehensive test coverage
- ESLint and Prettier for code quality
- Basic implementations of blockchain, wallet, and mesh protocol components

Additional features and optimizations will be added in future releases.
