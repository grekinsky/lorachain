import type {
  Block,
  UTXOTransaction,
  GenesisConfig,
} from '../../../src/types.js';
import { BlockManager } from '../../../src/block.js';

/**
 * Validates that a mock block meets current validation requirements.
 *
 * This helper ensures test mocks are properly constructed before use.
 * It checks:
 * - Valid difficulty (positive number)
 * - Proper hash chain (hash matches calculated hash)
 * - Valid timestamp (positive number)
 * - Merkle root exists
 * - Valid nonce
 *
 * @param block - Block to validate
 * @throws Error if block is invalid
 */
export function validateMockBlock(block: Block): void {
  // Validate difficulty
  if (typeof block.difficulty !== 'number' || block.difficulty < 0) {
    throw new Error(
      `Invalid mock block difficulty: ${block.difficulty}. Must be a non-negative number.`
    );
  }

  // Validate timestamp
  if (typeof block.timestamp !== 'number' || block.timestamp <= 0) {
    throw new Error(
      `Invalid mock block timestamp: ${block.timestamp}. Must be a positive number.`
    );
  }

  // Validate merkle root exists
  if (!block.merkleRoot || block.merkleRoot.length === 0) {
    throw new Error('Missing merkle root in mock block');
  }

  // Validate nonce is a number
  if (typeof block.nonce !== 'number') {
    throw new Error(
      `Invalid mock block nonce: ${block.nonce}. Must be a number.`
    );
  }

  // Validate index
  if (typeof block.index !== 'number' || block.index < 0) {
    throw new Error(
      `Invalid mock block index: ${block.index}. Must be a non-negative number.`
    );
  }

  // Validate previousHash exists (can be '0' for genesis)
  if (
    typeof block.previousHash !== 'string' ||
    block.previousHash.length === 0
  ) {
    throw new Error('Invalid mock block previousHash');
  }

  // Validate hash exists and matches calculated hash
  if (!block.hash || block.hash.length === 0) {
    throw new Error('Missing hash in mock block');
  }

  // Verify hash matches calculated hash
  const calculatedHash = BlockManager.calculateHash(block);
  if (block.hash !== calculatedHash) {
    throw new Error(
      `Invalid mock block hash chain. Expected: ${calculatedHash}, Got: ${block.hash}`
    );
  }

  // Validate hash meets difficulty requirement
  const targetPrefix = '0'.repeat(block.difficulty);
  if (!block.hash.startsWith(targetPrefix)) {
    throw new Error(
      `Mock block hash does not meet difficulty requirement. ` +
        `Expected ${block.difficulty} leading zeros, got hash: ${block.hash}`
    );
  }

  // Validate transactions array exists
  if (!Array.isArray(block.transactions)) {
    throw new Error('Mock block transactions must be an array');
  }
}

/**
 * Validates that a mock UTXO transaction meets current validation requirements.
 *
 * This helper ensures test transaction mocks are properly constructed.
 * It checks:
 * - Valid transaction ID
 * - At least one input or output (or both)
 * - Proper signature if present
 * - Valid fee
 * - Valid timestamp
 *
 * @param tx - Transaction to validate
 * @throws Error if transaction is invalid
 */
export function validateMockUTXOTransaction(tx: UTXOTransaction): void {
  // Validate transaction ID
  if (!tx.id || tx.id.length === 0) {
    throw new Error('Invalid transaction ID: must be a non-empty string');
  }

  // Validate inputs array
  if (!Array.isArray(tx.inputs)) {
    throw new Error('Transaction inputs must be an array');
  }

  // Validate outputs array
  if (!Array.isArray(tx.outputs)) {
    throw new Error('Transaction outputs must be an array');
  }

  // For non-coinbase transactions, require at least one input
  if (tx.inputs.length === 0 && tx.outputs.length === 0) {
    throw new Error(
      'Transaction must have at least one input or output (coinbase has only outputs)'
    );
  }

  // Validate each input
  for (const input of tx.inputs) {
    if (!input.txId || input.txId.length === 0) {
      throw new Error('Transaction input must have a valid txId');
    }
    if (typeof input.outputIndex !== 'number' || input.outputIndex < 0) {
      throw new Error('Transaction input must have a valid outputIndex');
    }
  }

  // Validate each output
  for (const output of tx.outputs) {
    if (typeof output.value !== 'number' || output.value < 0) {
      throw new Error('Transaction output must have a valid value');
    }
    if (!output.lockingScript || output.lockingScript.length === 0) {
      throw new Error('Transaction output must have a lockingScript');
    }
    if (typeof output.outputIndex !== 'number' || output.outputIndex < 0) {
      throw new Error('Transaction output must have a valid outputIndex');
    }
  }

  // Validate fee
  if (typeof tx.fee !== 'number' || tx.fee < 0) {
    throw new Error(
      `Invalid transaction fee: ${tx.fee}. Must be non-negative.`
    );
  }

  // Validate timestamp
  if (typeof tx.timestamp !== 'number' || tx.timestamp <= 0) {
    throw new Error(
      `Invalid transaction timestamp: ${tx.timestamp}. Must be positive.`
    );
  }

  // Validate lock time
  if (typeof tx.lockTime !== 'number' || tx.lockTime < 0) {
    throw new Error(
      `Invalid transaction lockTime: ${tx.lockTime}. Must be non-negative.`
    );
  }

  // If signature exists, validate it's not empty
  if (tx.signature !== undefined && tx.signature.length === 0) {
    throw new Error('Transaction signature cannot be empty if present');
  }
}

/**
 * Validates that a chain of blocks is properly linked.
 *
 * This helper ensures mock block chains have:
 * - Proper hash linking (each block's previousHash matches previous block's hash)
 * - Sequential indices
 * - Valid individual blocks
 *
 * @param blocks - Array of blocks forming a chain
 * @throws Error if chain is invalid
 */
export function validateMockChain(blocks: Block[]): void {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('Chain must be a non-empty array of blocks');
  }

  // Validate first block (genesis)
  const genesis = blocks[0];
  validateMockBlock(genesis);

  if (genesis.index !== 0) {
    throw new Error(`Genesis block must have index 0, got ${genesis.index}`);
  }

  // Validate chain continuity
  for (let i = 1; i < blocks.length; i++) {
    const currentBlock = blocks[i];
    const previousBlock = blocks[i - 1];

    // Validate current block
    validateMockBlock(currentBlock);

    // Check hash chain
    if (currentBlock.previousHash !== previousBlock.hash) {
      throw new Error(
        `Chain break at index ${i}: ` +
          `block.previousHash (${currentBlock.previousHash}) !== ` +
          `previous.hash (${previousBlock.hash})`
      );
    }

    // Check sequential indices
    if (currentBlock.index !== previousBlock.index + 1) {
      throw new Error(
        `Non-sequential indices at position ${i}: ` +
          `expected ${previousBlock.index + 1}, got ${currentBlock.index}`
      );
    }

    // Check timestamp ordering (should be increasing)
    if (currentBlock.timestamp < previousBlock.timestamp) {
      throw new Error(
        `Timestamp decreases at index ${i}: ` +
          `${currentBlock.timestamp} < ${previousBlock.timestamp}`
      );
    }
  }
}

/**
 * Validates that a genesis configuration meets current validation requirements.
 *
 * This helper ensures genesis configs have:
 * - All required metadata fields
 * - Valid network parameters
 * - Proper creator name (minimum 3 characters)
 * - Valid network type
 *
 * @param config - Genesis configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateMockGenesisConfig(config: GenesisConfig): void {
  // Validate chainId
  if (!config.chainId || config.chainId.length === 0) {
    throw new Error('Genesis config must have a chainId');
  }

  // Validate networkName
  if (!config.networkName || config.networkName.length === 0) {
    throw new Error('Genesis config must have a networkName');
  }

  // Validate version
  if (!config.version || config.version.length === 0) {
    throw new Error('Genesis config must have a version');
  }

  // Validate metadata
  if (!config.metadata) {
    throw new Error('Genesis config must have metadata');
  }

  // Validate metadata.creator (minimum 3 characters)
  if (!config.metadata.creator || config.metadata.creator.length < 3) {
    throw new Error(
      'Genesis config metadata.creator must be at least 3 characters'
    );
  }

  // Validate metadata.description
  if (
    !config.metadata.description ||
    config.metadata.description.length === 0
  ) {
    throw new Error('Genesis config must have metadata.description');
  }

  // Validate metadata.networkType
  const validNetworkTypes = ['mainnet', 'testnet', 'devnet', 'private'];
  if (!validNetworkTypes.includes(config.metadata.networkType)) {
    throw new Error(
      `Invalid networkType: ${config.metadata.networkType}. ` +
        `Must be one of: ${validNetworkTypes.join(', ')}`
    );
  }

  // Validate metadata.timestamp
  if (
    typeof config.metadata.timestamp !== 'number' ||
    config.metadata.timestamp <= 0
  ) {
    throw new Error(
      'Genesis config metadata.timestamp must be a positive number'
    );
  }

  // Validate networkParams
  if (!config.networkParams) {
    throw new Error('Genesis config must have networkParams');
  }

  // Validate networkParams fields
  const params = config.networkParams;

  if (
    typeof params.initialDifficulty !== 'number' ||
    params.initialDifficulty < 0
  ) {
    throw new Error('networkParams.initialDifficulty must be non-negative');
  }

  if (
    typeof params.targetBlockTime !== 'number' ||
    params.targetBlockTime <= 0
  ) {
    throw new Error('networkParams.targetBlockTime must be positive');
  }

  if (
    typeof params.adjustmentPeriod !== 'number' ||
    params.adjustmentPeriod <= 0
  ) {
    throw new Error('networkParams.adjustmentPeriod must be positive');
  }

  if (
    typeof params.maxDifficultyRatio !== 'number' ||
    params.maxDifficultyRatio <= 0
  ) {
    throw new Error('networkParams.maxDifficultyRatio must be positive');
  }

  if (typeof params.maxBlockSize !== 'number' || params.maxBlockSize <= 0) {
    throw new Error('networkParams.maxBlockSize must be positive');
  }

  if (typeof params.miningReward !== 'number' || params.miningReward < 0) {
    throw new Error('networkParams.miningReward must be non-negative');
  }

  // Validate initialAllocations
  if (!Array.isArray(config.initialAllocations)) {
    throw new Error('Genesis config initialAllocations must be an array');
  }

  for (const allocation of config.initialAllocations) {
    if (!allocation.address || allocation.address.length === 0) {
      throw new Error('Initial allocation must have an address');
    }
    if (typeof allocation.amount !== 'number' || allocation.amount <= 0) {
      throw new Error('Initial allocation amount must be positive');
    }
  }

  // Validate totalSupply
  if (typeof config.totalSupply !== 'number' || config.totalSupply < 0) {
    throw new Error('Genesis config totalSupply must be non-negative');
  }
}

/**
 * Quick validation helper that returns boolean instead of throwing.
 *
 * @param block - Block to validate
 * @returns true if valid, false otherwise
 */
export function isValidMockBlock(block: Block): boolean {
  try {
    validateMockBlock(block);
    return true;
  } catch {
    return false;
  }
}

/**
 * Quick validation helper that returns boolean instead of throwing.
 *
 * @param tx - Transaction to validate
 * @returns true if valid, false otherwise
 */
export function isValidMockUTXOTransaction(tx: UTXOTransaction): boolean {
  try {
    validateMockUTXOTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Quick validation helper that returns boolean instead of throwing.
 *
 * @param blocks - Chain to validate
 * @returns true if valid, false otherwise
 */
export function isValidMockChain(blocks: Block[]): boolean {
  try {
    validateMockChain(blocks);
    return true;
  } catch {
    return false;
  }
}

/**
 * Quick validation helper that returns boolean instead of throwing.
 *
 * @param config - Genesis config to validate
 * @returns true if valid, false otherwise
 */
export function isValidMockGenesisConfig(config: GenesisConfig): boolean {
  try {
    validateMockGenesisConfig(config);
    return true;
  } catch {
    return false;
  }
}
