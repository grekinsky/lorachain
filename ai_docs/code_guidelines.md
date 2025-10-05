# Code Guidelines and Best Practices

This document provides comprehensive guidelines for maintaining code quality, consistency, and best practices in the Lorachain project. It serves as a reference for all developers contributing to the codebase.

**Version**: 1.0.0
**Last Updated**: 2025-10-04

---

## Table of Contents

1. [Code Formatting](#1-code-formatting)
2. [TypeScript Standards](#2-typescript-standards)
3. [Naming Conventions](#3-naming-conventions)
4. [Code Organization](#4-code-organization)
5. [Testing Standards](#5-testing-standards)
6. [Error Handling](#6-error-handling)
7. [Documentation](#7-documentation)
8. [Git and Commit Guidelines](#8-git-and-commit-guidelines)
9. [Performance Best Practices](#9-performance-best-practices)
10. [Security Guidelines](#10-security-guidelines)

---

## 1. Code Formatting

### 1.1 Prettier Configuration

All code must follow the project's Prettier configuration:

```json
{
  "semi": true, // Always use semicolons
  "trailingComma": "es5", // ES5 trailing commas
  "singleQuote": true, // Single quotes for strings
  "printWidth": 80, // 80 character line limit
  "tabWidth": 2, // 2 spaces for indentation
  "useTabs": false, // Spaces, not tabs
  "bracketSpacing": true, // Spaces inside brackets
  "arrowParens": "avoid", // Omit parens for single params
  "endOfLine": "lf" // Unix line endings
}
```

**Commands**:

```bash
# Format all files
pnpm format

# Check formatting
pnpm lint
```

### 1.2 Line Length and Wrapping

- **Maximum line length**: 80 characters
- Break long lines at logical points (operators, parameters)
- Indent wrapped lines by 2 spaces

**Examples**:

```typescript
// ✅ Good - properly wrapped
const result = someVeryLongFunctionName(parameter1, parameter2, parameter3);

// ❌ Bad - exceeds 80 characters
const result = someVeryLongFunctionName(
  parameter1,
  parameter2,
  parameter3,
  parameter4
);
```

---

## 2. TypeScript Standards

### 2.1 Type Safety

- **Strict mode**: Always enabled
- **No `any` types**: Use `unknown` or specific types
- **Explicit return types**: Required for all functions (warning level)

```typescript
// ✅ Good - explicit return type
function calculateFee(amount: number): number {
  return amount * 0.01;
}

// ⚠️ Warning - missing return type
function calculateFee(amount: number) {
  return amount * 0.01;
}

// ❌ Bad - using any
function processData(data: any): any {
  return data;
}

// ✅ Good - specific types
function processData(data: UTXOTransaction): ProcessedData {
  return {
    /* ... */
  };
}
```

### 2.2 Type Definitions

- Define interfaces for data structures
- Use type aliases for unions and complex types
- Export types from centralized locations (e.g., `types.ts`)

```typescript
// ✅ Good - clear type definitions
export interface UTXOTransaction {
  id: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  lockTime: number;
  timestamp: number;
  fee: number;
}

export type NetworkMode = 'mainnet' | 'testnet' | 'devnet';
```

### 2.3 Variable Declarations

```typescript
// ✅ Always use const for immutable values
const BLOCK_TIME = 600;
const config = { timeout: 5000 };

// ✅ Use let for mutable values
let currentIndex = 0;

// ❌ Never use var
var oldStyle = 'bad';
```

### 2.4 Unused Variables

Prefix unused variables with underscore:

```typescript
// ✅ Good - indicates intentionally unused
function process(_unusedParam: string, data: Data): void {
  // Only use data
}

// In destructuring
const { value, _timestamp, ...rest } = transaction;
```

---

## 3. Naming Conventions

### 3.1 Files and Directories

- **Files**: `kebab-case` (e.g., `utxo-transaction.ts`)
- **Test files**: `*.test.ts` or `*.spec.ts`
- **Type definitions**: `*.types.ts` or `types.ts`
- **Directories**: `kebab-case`

```
packages/core/src/
├── utxo-manager.ts           ✅ Good
├── utxoManager.ts            ❌ Bad
├── UTXO_Manager.ts           ❌ Bad
└── tests/
    └── utxo-manager.test.ts  ✅ Good
```

### 3.2 Classes and Interfaces

- **Classes**: `PascalCase`
- **Interfaces**: `PascalCase` (no `I` prefix)
- **Type aliases**: `PascalCase`
- **Enums**: `PascalCase`

```typescript
// ✅ Good
class UTXOManager {}
interface TransactionInput {}
type NetworkStatus = 'online' | 'offline';
enum BlockStatus {
  PENDING,
  CONFIRMED,
}

// ❌ Bad
class utxoManager {} // Wrong case
interface ITransactionInput {} // Unnecessary prefix
```

### 3.3 Functions and Methods

- **Functions/Methods**: `camelCase`
- **Start with verbs** for actions
- **Use descriptive names**

```typescript
// ✅ Good - verb prefixes
async function validateTransaction(tx: UTXOTransaction): Promise<boolean> {}
function calculateTotalFee(inputs: Input[]): number {}
function getBlockByHash(hash: string): Block | null {}

// ❌ Bad - unclear or non-verb
function transaction() {}
function fee() {}
```

### 3.4 Variables and Properties

- **Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE` (for true constants)
- **Private properties**: Consider `_prefixing` or `#private` fields

```typescript
// ✅ Good
const MAX_BLOCK_SIZE = 1024 * 1024;
let currentHeight = 0;
const blockchainState = {
  /* ... */
};

// Private properties
class Blockchain {
  private _chain: Block[];
  #privateData: Data;
}
```

### 3.5 Boolean Variables

Prefix with `is`, `has`, `should`, `can`:

```typescript
// ✅ Good
const isValid = true;
const hasUTXOs = utxos.length > 0;
const shouldSync = networkMode === 'online';
const canMine = difficulty <= threshold;
```

---

## 4. Code Organization

### 4.1 File Structure

Organize imports in this order:

1. Node.js built-in modules
2. External dependencies
3. Internal packages (`@lorachain/*`)
4. Relative imports

```typescript
// ✅ Good import order
import { readFileSync } from 'fs'; // Node.js
import { createHash } from 'crypto';

import msgpack from 'msgpack-lite'; // External

import { Logger } from '@lorachain/shared'; // Internal packages
import { UTXOManager } from '@lorachain/core';

import { validateInput } from './validation'; // Relative
import type { Config } from './types';
```

### 4.2 Class Structure

Organize class members consistently:

```typescript
class ExampleService {
  // 1. Static properties
  static readonly VERSION = '1.0.0';

  // 2. Instance properties
  private readonly config: Config;
  private state: State;

  // 3. Constructor
  constructor(config: Config) {
    this.config = config;
    this.state = this.initializeState();
  }

  // 4. Public methods
  public async execute(): Promise<Result> {
    // Implementation
  }

  // 5. Protected methods
  protected validate(): boolean {
    // Implementation
  }

  // 6. Private methods
  private initializeState(): State {
    // Implementation
  }
}
```

### 4.3 Module Exports

- Prefer **named exports** over default exports
- Use index files to re-export from modules

```typescript
// ✅ Good - named exports
export class UTXOManager {}
export interface UTXO {}
export function createTransaction() {}

// index.ts
export * from './utxo-manager';
export * from './types';

// ❌ Avoid default exports
export default class UTXOManager {}
```

### 4.4 Function Length

- Keep functions **focused and small** (ideally < 50 lines)
- Extract complex logic into helper functions
- One responsibility per function

```typescript
// ✅ Good - focused functions
function validateTransactionInputs(inputs: Input[]): boolean {
  return inputs.every(input => validateInput(input));
}

function validateInput(input: Input): boolean {
  return input.previousTxId && input.outputIndex >= 0;
}

// ❌ Bad - doing too much
function validateAndProcessTransaction(tx: Transaction): Result {
  // 100 lines of mixed validation and processing
}
```

---

## 5. Testing Standards

### 5.1 Test Organization

- **Unit tests**: `packages/*/tests/unit/*.test.ts`
- **Integration tests**: `packages/*/tests/integration/*.test.ts`
- **Test utilities**: `packages/*/tests/shared/`

### 5.2 Test Structure

Use **Arrange-Act-Assert** pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('UTXOManager', () => {
  let utxoManager: UTXOManager;

  beforeEach(() => {
    // Arrange - setup
    utxoManager = new UTXOManager();
  });

  it('should add UTXO to the set', () => {
    // Arrange
    const utxo = createMockUTXO();

    // Act
    utxoManager.addUTXO(utxo);

    // Assert
    expect(utxoManager.getUTXO(utxo.txId, utxo.outputIndex)).toEqual(utxo);
  });
});
```

### 5.3 Test Naming

- **Descriptive test names**: Use `should` or `when/then` patterns
- **Group related tests**: Use nested `describe` blocks

```typescript
// ✅ Good - descriptive names
describe('UTXOManager', () => {
  describe('addUTXO', () => {
    it('should add valid UTXO to the set', () => {});
    it('should throw error for duplicate UTXO', () => {});
  });

  describe('when UTXO is spent', () => {
    it('then should mark UTXO as spent', () => {});
  });
});
```

### 5.4 Mocking

- Mock external dependencies
- Use test utilities for common mocks
- Clear mocks between tests

```typescript
import { vi } from 'vitest';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});
```

### 5.5 Coverage Requirements

Maintain minimum coverage thresholds:

- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

---

## 6. Error Handling

### 6.1 Error Types

Define custom error classes for different scenarios:

```typescript
// ✅ Good - custom error classes
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class InsufficientFundsError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient funds: required ${required}, available ${available}`);
    this.name = 'InsufficientFundsError';
  }
}
```

### 6.2 Error Handling Patterns

```typescript
// ✅ Good - descriptive error messages with context
function validateUTXO(utxo: UTXO): void {
  if (!utxo.txId) {
    throw new ValidationError('UTXO must have a transaction ID');
  }

  if (utxo.value <= 0) {
    throw new ValidationError(`UTXO value must be positive, got ${utxo.value}`);
  }
}

// ✅ Good - async error handling
async function processTransaction(tx: UTXOTransaction): Promise<void> {
  try {
    await validateTransaction(tx);
    await broadcastTransaction(tx);
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Transaction validation failed:', error.message);
      throw error;
    }
    logger.error('Unexpected error processing transaction:', error);
    throw new Error('Transaction processing failed');
  }
}
```

### 6.3 Fail Fast

Validate inputs early:

```typescript
// ✅ Good - validate early
function transfer(from: string, to: string, amount: number): void {
  if (!from || !to) {
    throw new ValidationError('Sender and recipient required');
  }
  if (amount <= 0) {
    throw new ValidationError('Amount must be positive');
  }

  // Continue with business logic
}
```

---

## 7. Documentation

### 7.1 Code Comments

- Write **self-documenting code** with clear names
- Add comments for **complex logic** only
- Explain **why**, not **what**

```typescript
// ❌ Bad - obvious comment
// Increment counter
counter++;

// ✅ Good - explains reasoning
// Use exponential backoff to avoid overwhelming the network
// during high traffic periods
const delay = baseDelay * Math.pow(2, retryCount);
```

### 7.2 JSDoc Comments

Document public APIs with JSDoc:

````typescript
/**
 * Validates a UTXO transaction and its inputs/outputs.
 *
 * @param transaction - The UTXO transaction to validate
 * @param utxoSet - Current set of unspent transaction outputs
 * @returns True if transaction is valid, false otherwise
 * @throws {ValidationError} If transaction structure is invalid
 *
 * @example
 * ```typescript
 * const isValid = await validateTransaction(tx, utxoSet);
 * if (!isValid) {
 *   throw new Error('Invalid transaction');
 * }
 * ```
 */
async function validateTransaction(
  transaction: UTXOTransaction,
  utxoSet: Map<string, UTXO>
): Promise<boolean> {
  // Implementation
}
````

### 7.3 README Files

Each package should have a README with:

- Purpose and overview
- Installation instructions
- Usage examples
- API documentation links

---

## 8. Git and Commit Guidelines

### 8.1 Commit Messages

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:

```bash
# ✅ Good
feat(utxo): implement chain selection algorithm
fix(sync): resolve race condition in mesh sync
docs(readme): update installation instructions

# ❌ Bad
updated stuff
fixes
WIP
```

### 8.2 Branch Naming

```
<type>/<descriptive-name>

# Examples
feature/implement-chain-selection
fix/resolve-sync-deadlock
refactor/optimize-utxo-manager
docs/update-api-documentation
```

### 8.3 Pull Requests

- **Clear title**: Summarize changes
- **Description**: Explain what, why, and how
- **Reference issues**: Link related issues
- **Tests**: Ensure all tests pass
- **Linting**: Run `pnpm lint:fix` before committing

---

## 9. Performance Best Practices

### 9.1 Async Operations

```typescript
// ✅ Good - parallel operations
const [blocks, utxos, peers] = await Promise.all([
  fetchBlocks(),
  fetchUTXOs(),
  fetchPeers(),
]);

// ❌ Bad - sequential when parallel is possible
const blocks = await fetchBlocks();
const utxos = await fetchUTXOs();
const peers = await fetchPeers();
```

### 9.2 Memory Management

- Clean up resources in `finally` blocks
- Avoid unnecessary object creation in loops
- Use streaming for large datasets

```typescript
// ✅ Good - resource cleanup
async function processLargeFile(path: string): Promise<void> {
  const stream = createReadStream(path);
  try {
    // Process stream
  } finally {
    stream.destroy();
  }
}
```

### 9.3 Algorithm Complexity

- Document time/space complexity for critical algorithms
- Choose appropriate data structures (Map vs Object, Set vs Array)

```typescript
// ✅ Good - O(1) lookup with Map
const utxoMap = new Map<string, UTXO>();

// ❌ Bad - O(n) lookup with Array
const utxoArray: UTXO[] = [];
utxoArray.find(u => u.txId === id); // Slow for large arrays
```

---

## 10. Security Guidelines

### 10.1 Input Validation

Always validate and sanitize inputs:

```typescript
// ✅ Good - thorough validation
function processAmount(amount: unknown): number {
  if (typeof amount !== 'number') {
    throw new ValidationError('Amount must be a number');
  }
  if (!Number.isFinite(amount)) {
    throw new ValidationError('Amount must be finite');
  }
  if (amount <= 0) {
    throw new ValidationError('Amount must be positive');
  }
  return amount;
}
```

### 10.2 Cryptographic Operations

- Use approved cryptographic libraries
- Never implement custom crypto
- Verify all signatures

```typescript
// ✅ Good - use CryptographicService
const isValid = await CryptographicService.verifySignature(
  message,
  signature,
  publicKey,
  'secp256k1'
);

// ❌ Bad - custom crypto implementation
function myCustomHashFunction(data: string): string {
  // Never do this
}
```

### 10.3 Sensitive Data

- Never log sensitive data (private keys, passwords)
- Use environment variables for secrets
- Clear sensitive data from memory when done

```typescript
// ✅ Good - mask sensitive data
logger.info('Processing transaction', {
  txId: transaction.id,
  amount: transaction.outputs[0].value,
  // Don't log private keys or signatures
});
```

---

## Appendix: Quick Reference

### Pre-Commit Checklist

Before committing code, ensure:

- [ ] Code is formatted with Prettier (`pnpm format`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] All tests pass (`pnpm test`)
- [ ] Test coverage meets thresholds
- [ ] Documentation is updated
- [ ] Commit message follows conventions

### Common Commands

```bash
# Code quality
pnpm format              # Format code
pnpm lint               # Check linting
pnpm lint:fix           # Auto-fix linting issues
pnpm typecheck          # Type checking

# Testing
pnpm test               # Run all tests
pnpm test:unit          # Run unit tests only
pnpm test:integration   # Run integration tests only
pnpm test:coverage      # Generate coverage report

# Build
pnpm build              # Build all packages
pnpm clean              # Clean build artifacts
```

---

**Note**: This is a living document. Guidelines will be updated as the project evolves and new patterns emerge. If you have suggestions for improvements, please open a discussion or pull request.
