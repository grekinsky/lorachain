# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lorachain is a lightweight blockchain network designed for cryptocurrency transactions in communities with limited internet connectivity using LoRa mesh networking technology. It operates on a hybrid architecture with light clients (mobile wallets) and synchronized nodes (full nodes).

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
- **Vitest** for testing framework
- **ESLint + Prettier** for code quality
- **LoRa constraints**: 256-byte message limit, duty cycle restrictions

### Core Classes and Responsibilities

- **`Blockchain`** (core) - Main blockchain state and operations
- **`TransactionManager`** (core) - Transaction validation and creation
- **`BlockManager`** (core) - Block creation, mining, and validation
- **`MobileWallet`** (mobile-wallet) - Lightweight wallet operations
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

- **Core package**: Tests for blockchain, transaction, and block functionality
- **Shared package**: Tests for logger and utility functions
- **Mobile wallet**: Tests for wallet operations
- **Node package**: Tests for full node functionality
- **Mesh protocol**: Tests for LoRa communication protocol

Run package-specific tests with `cd packages/<name> && pnpm test` or use watch mode for development with `pnpm test:watch`.
