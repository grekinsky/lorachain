import type { Block, Transaction } from '../../../src/types.js';

/**
 * Test fixtures for blocks
 */
export const createMockBlock = (
  index: number,
  previousHash: string,
  transactions: Transaction[] = []
): Block => ({
  index,
  timestamp: Date.now(),
  transactions,
  previousHash,
  hash: `mock-hash-${index}`,
  nonce: 0,
  merkleRoot: 'mock-merkle-root',
  difficulty: 2,
  miner: 'mock-miner',
});

export const createMockGenesisBlock = (): Block => ({
  index: 0,
  timestamp: Date.now(),
  transactions: [],
  previousHash: '0',
  hash: 'genesis-hash',
  nonce: 0,
  merkleRoot: 'genesis-merkle-root',
  difficulty: 2,
  miner: 'network',
});

export const createMockMinedBlock = (
  index: number,
  previousHash: string,
  transactions: Transaction[],
  difficulty: number
): Block => {
  const block = createMockBlock(index, previousHash, transactions);
  block.difficulty = difficulty;

  // Simulate mining by setting a hash that meets difficulty
  const targetPrefix = '0'.repeat(difficulty);
  block.hash = targetPrefix + 'mined-hash'.padEnd(64 - difficulty, 'a');
  block.nonce = 12345; // Mock nonce value

  return block;
};

// Pre-defined test blocks for consistent testing
export const TEST_BLOCKS = {
  genesis: createMockGenesisBlock(),

  first: createMockBlock(1, 'genesis-hash', []),

  withTransactions: createMockBlock(2, 'block-1-hash', [
    {
      id: 'tx-1',
      from: 'alice',
      to: 'bob',
      amount: 100,
      fee: 1,
      timestamp: Date.now(),
      signature: 'sig-1',
      nonce: 0,
    },
    {
      id: 'tx-2',
      from: 'bob',
      to: 'charlie',
      amount: 50,
      fee: 1,
      timestamp: Date.now(),
      signature: 'sig-2',
      nonce: 0,
    },
  ]),

  mined: createMockMinedBlock(3, 'block-2-hash', [], 4),
};
