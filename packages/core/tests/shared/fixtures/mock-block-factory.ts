import { createHash } from 'crypto';
import type { Block, UTXOTransaction } from '../../../src/types.js';
import { MerkleTree } from '../../../src/merkle/MerkleTree.js';
import { BlockManager } from '../../../src/block.js';

/**
 * Options for creating a mock block
 */
export interface MockBlockOptions {
  index: number;
  previousHash: string;
  difficulty?: number;
  timestamp?: number;
  transactions?: UTXOTransaction[];
  validator?: string;
}

/**
 * Creates a valid mock block that meets current validation requirements.
 *
 * This factory ensures:
 * - Proper hash calculation using BlockManager.calculateHash
 * - Valid merkle root from transactions
 * - Nonce that satisfies difficulty requirements
 * - All required fields are populated
 *
 * @param options - Configuration for the mock block
 * @returns A valid Block object
 */
export function createValidMockBlock(options: MockBlockOptions): Block {
  const {
    index,
    previousHash,
    difficulty = 2,
    timestamp = Date.now(),
    transactions = [],
    validator = 'test-validator',
  } = options;

  const merkleRoot =
    transactions.length > 0
      ? MerkleTree.calculateRoot(transactions)
      : createHash('sha256').update('').digest('hex');

  // Calculate a valid nonce for the given difficulty
  const nonce = calculateValidNonce(
    index,
    timestamp,
    merkleRoot,
    previousHash,
    difficulty,
    validator,
    transactions
  );

  // Create block without hash first
  const blockWithoutHash: Omit<Block, 'hash'> = {
    index,
    timestamp,
    transactions,
    previousHash,
    nonce,
    merkleRoot,
    difficulty,
    validator,
  };

  // Calculate proper hash using BlockManager
  const hash = BlockManager.calculateHash(blockWithoutHash);

  return {
    ...blockWithoutHash,
    hash,
  };
}

/**
 * Calculates a valid nonce that satisfies the difficulty requirement.
 *
 * @param index - Block index
 * @param timestamp - Block timestamp
 * @param merkleRoot - Merkle root of transactions
 * @param previousHash - Hash of previous block
 * @param difficulty - Required difficulty level
 * @param validator - Block validator
 * @returns A nonce value that produces a valid hash
 */
function calculateValidNonce(
  index: number,
  timestamp: number,
  merkleRoot: string,
  previousHash: string,
  difficulty: number,
  validator?: string,
  transactions: UTXOTransaction[] = []
): number {
  const targetPrefix = '0'.repeat(difficulty);
  let nonce = 0;

  // Try nonces until we find one that meets difficulty
  // In tests, we limit iterations to avoid infinite loops
  const maxIterations = 1000000;

  for (let i = 0; i < maxIterations; i++) {
    const blockWithoutHash: Omit<Block, 'hash'> = {
      index,
      timestamp,
      transactions,
      previousHash,
      nonce,
      merkleRoot,
      difficulty,
      validator,
    };

    const hash = BlockManager.calculateHash(blockWithoutHash);

    if (hash.startsWith(targetPrefix)) {
      return nonce;
    }

    nonce++;
  }

  // If we can't find a valid nonce in reasonable time, return 0
  // This should rarely happen in tests with low difficulty
  return 0;
}

/**
 * Creates a chain of valid mock blocks with proper hash linking.
 *
 * @param length - Number of blocks to create (including genesis)
 * @param startDifficulty - Initial difficulty level
 * @param genesisHash - Optional custom genesis hash
 * @returns Array of linked blocks forming a valid chain
 */
export function createMockBlockChain(
  length: number,
  startDifficulty: number = 2,
  genesisHash: string = 'genesis-hash'
): Block[] {
  if (length < 1) {
    return [];
  }

  const chain: Block[] = [];

  // Create genesis block
  const genesis = createValidMockBlock({
    index: 0,
    previousHash: '0',
    difficulty: startDifficulty,
    timestamp: Date.now() - length * 60000, // Stagger timestamps
  });

  // Override genesis hash if provided
  if (genesisHash !== 'genesis-hash') {
    genesis.hash = genesisHash;
  }

  chain.push(genesis);

  // Create subsequent blocks
  for (let i = 1; i < length; i++) {
    const previousBlock = chain[i - 1];
    const block = createValidMockBlock({
      index: i,
      previousHash: previousBlock.hash,
      difficulty: startDifficulty,
      timestamp: Date.now() - (length - i - 1) * 60000,
    });
    chain.push(block);
  }

  return chain;
}

/**
 * Creates two forking chains from a common ancestor.
 *
 * This is useful for testing fork detection and chain selection logic.
 *
 * @param commonAncestorIndex - Index where the fork occurs
 * @param branch1Length - Number of blocks in first branch after fork
 * @param branch2Length - Number of blocks in second branch after fork
 * @param difficulty - Difficulty level for all blocks
 * @returns Object containing common chain and two branches
 */
export function createForkingChains(
  commonAncestorIndex: number,
  branch1Length: number,
  branch2Length: number,
  difficulty: number = 2
): {
  common: Block[];
  branch1: Block[];
  branch2: Block[];
} {
  // Create common chain up to fork point
  const common = createMockBlockChain(commonAncestorIndex + 1, difficulty);

  const forkPoint = common[common.length - 1];

  // Create first branch
  const branch1: Block[] = [];
  let previousHash = forkPoint.hash;
  let timestamp = Date.now();

  for (let i = 0; i < branch1Length; i++) {
    const block = createValidMockBlock({
      index: commonAncestorIndex + 1 + i,
      previousHash,
      difficulty,
      timestamp: timestamp + i * 60000,
      validator: 'branch1-validator',
    });
    branch1.push(block);
    previousHash = block.hash;
  }

  // Create second branch
  const branch2: Block[] = [];
  previousHash = forkPoint.hash;
  timestamp = Date.now() + 1000; // Slight time offset to ensure different hashes

  for (let i = 0; i < branch2Length; i++) {
    const block = createValidMockBlock({
      index: commonAncestorIndex + 1 + i,
      previousHash,
      difficulty,
      timestamp: timestamp + i * 60000,
      validator: 'branch2-validator',
    });
    branch2.push(block);
    previousHash = block.hash;
  }

  return { common, branch1, branch2 };
}

/**
 * Creates a mock genesis block with standard configuration.
 *
 * @param difficulty - Difficulty level
 * @returns A valid genesis block
 */
export function createMockGenesisBlock(difficulty: number = 2): Block {
  return createValidMockBlock({
    index: 0,
    previousHash: '0',
    difficulty,
    timestamp: Date.now() - 1000000,
    validator: 'network',
  });
}

/**
 * Creates a mock block with transactions.
 *
 * @param index - Block index
 * @param previousHash - Hash of previous block
 * @param transactions - Array of UTXO transactions
 * @param difficulty - Difficulty level
 * @returns A valid block containing the transactions
 */
export function createMockBlockWithTransactions(
  index: number,
  previousHash: string,
  transactions: UTXOTransaction[],
  difficulty: number = 2
): Block {
  return createValidMockBlock({
    index,
    previousHash,
    transactions,
    difficulty,
  });
}
