import { describe, it, expect, beforeEach } from 'vitest';
import { BlockManager } from './block.js';
import { TransactionManager } from './transaction.js';
import type { Block, Transaction, GenesisConfig } from './types.js';

describe('BlockManager', () => {
  let mockTransaction: Transaction;
  let mockTransactions: Transaction[];

  const testGenesisConfig: GenesisConfig = {
    chainId: 'block-test-v1',
    networkName: 'Block Test Network',
    version: '1.0.0',
    initialAllocations: [
      {
        address: 'lora1test000000000000000000000000000000000',
        amount: 1000000,
        description: 'Test allocation',
      },
    ],
    totalSupply: 21000000,
    networkParams: {
      initialDifficulty: 1,
      targetBlockTime: 180,
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      maxBlockSize: 1024 * 1024,
      miningReward: 10,
      halvingInterval: 210000,
    },
    metadata: {
      timestamp: 1700000000000,
      description: 'Block Test Genesis Block',
      creator: 'Test Suite',
      networkType: 'testnet',
    },
  };

  beforeEach(() => {
    mockTransaction = TransactionManager.createTransaction(
      'from-address',
      'to-address',
      100,
      'private-key'
    );
    mockTransactions = [mockTransaction];
  });

  describe('createGenesisBlock', () => {
    it('should create genesis block with configuration', () => {
      const genesisBlock = BlockManager.createGenesisBlock(testGenesisConfig);

      expect(genesisBlock).toMatchObject({
        index: 0,
        transactions: [], // Empty - UTXO allocations handled separately
        previousHash: '0',
        nonce: 0,
        difficulty: 1, // From testGenesisConfig
      });
      expect(genesisBlock.timestamp).toBe(testGenesisConfig.metadata.timestamp);
      expect(genesisBlock.hash).toBeDefined();
      expect(genesisBlock.merkleRoot).toBeDefined();
    });

    it('should create consistent blocks with same configuration', () => {
      const block1 = BlockManager.createGenesisBlock(testGenesisConfig);
      const block2 = BlockManager.createGenesisBlock(testGenesisConfig);

      // Should be identical since timestamp is fixed in config
      expect(block1.hash).toBe(block2.hash);
      expect(block1.timestamp).toBe(block2.timestamp);
      expect(block1.difficulty).toBe(block2.difficulty);
    });
  });

  describe('createBlock', () => {
    it('should create block with transactions', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2 // difficulty
      );

      expect(block).toMatchObject({
        index: 1,
        transactions: mockTransactions,
        previousHash: 'previous-hash',
        nonce: 0,
      });
      expect(block.timestamp).toBeDefined();
      expect(block.hash).toBeDefined();
      expect(block.merkleRoot).toBeDefined();
    });

    it('should create block with validator', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2, // difficulty
        'validator-address'
      );

      expect(block.validator).toBe('validator-address');
    });

    it('should create block without validator', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2 // difficulty
      );

      expect(block.validator).toBeUndefined();
    });
  });

  describe('calculateHash', () => {
    it('should calculate consistent hash', () => {
      const block: Omit<Block, 'hash'> = {
        index: 1,
        timestamp: 1234567890,
        transactions: mockTransactions,
        previousHash: 'previous-hash',
        nonce: 0,
        merkleRoot: 'merkle-root',
      };

      const hash1 = BlockManager.calculateHash(block);
      const hash2 = BlockManager.calculateHash(block);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different blocks', () => {
      const block1: Omit<Block, 'hash'> = {
        index: 1,
        timestamp: 1234567890,
        transactions: mockTransactions,
        previousHash: 'previous-hash',
        nonce: 0,
        merkleRoot: 'merkle-root',
      };

      const block2: Omit<Block, 'hash'> = {
        ...block1,
        index: 2,
      };

      const hash1 = BlockManager.calculateHash(block1);
      const hash2 = BlockManager.calculateHash(block2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('calculateMerkleRoot', () => {
    it('should calculate merkle root for empty transactions', () => {
      const merkleRoot = BlockManager.calculateMerkleRoot([]);
      expect(merkleRoot).toHaveLength(64);
    });

    it('should calculate merkle root for single transaction', () => {
      const merkleRoot = BlockManager.calculateMerkleRoot([mockTransaction]);
      expect(merkleRoot).toHaveLength(64);
    });

    it('should calculate merkle root for multiple transactions', () => {
      const transaction2 = TransactionManager.createTransaction(
        'from-address-2',
        'to-address-2',
        200,
        'private-key-2'
      );
      const transactions = [mockTransaction, transaction2];

      const merkleRoot = BlockManager.calculateMerkleRoot(transactions);
      expect(merkleRoot).toHaveLength(64);
    });

    it('should calculate merkle root for odd number of transactions', () => {
      const transaction2 = TransactionManager.createTransaction(
        'from-address-2',
        'to-address-2',
        200,
        'private-key-2'
      );
      const transaction3 = TransactionManager.createTransaction(
        'from-address-3',
        'to-address-3',
        300,
        'private-key-3'
      );
      const transactions = [mockTransaction, transaction2, transaction3];

      const merkleRoot = BlockManager.calculateMerkleRoot(transactions);
      expect(merkleRoot).toHaveLength(64);
    });

    it('should produce consistent merkle root', () => {
      const merkleRoot1 = BlockManager.calculateMerkleRoot(mockTransactions);
      const merkleRoot2 = BlockManager.calculateMerkleRoot(mockTransactions);

      expect(merkleRoot1).toBe(merkleRoot2);
    });
  });

  describe('mineBlock', () => {
    it('should mine block with difficulty 1', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        1 // difficulty
      );

      const minedBlock = BlockManager.mineBlock(block);

      expect(minedBlock.hash.startsWith('0')).toBe(true);
      expect(minedBlock.nonce).toBeGreaterThanOrEqual(0);
    });

    it('should mine block with difficulty 2', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2 // difficulty
      );

      const minedBlock = BlockManager.mineBlock(block);

      expect(minedBlock.hash.startsWith('00')).toBe(true);
      expect(minedBlock.nonce).toBeGreaterThan(0);
    });

    it('should preserve block data during mining', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        1 // difficulty
      );

      const minedBlock = BlockManager.mineBlock(block);

      expect(minedBlock.index).toBe(block.index);
      expect(minedBlock.timestamp).toBe(block.timestamp);
      expect(minedBlock.transactions).toBe(block.transactions);
      expect(minedBlock.previousHash).toBe(block.previousHash);
      expect(minedBlock.merkleRoot).toBe(block.merkleRoot);
    });
  });

  describe('validateBlock', () => {
    let validBlock: Block;
    let previousBlock: Block;

    beforeEach(() => {
      previousBlock = BlockManager.createGenesisBlock(testGenesisConfig);
      validBlock = BlockManager.createBlock(
        1,
        mockTransactions,
        previousBlock.hash,
        1 // difficulty
      );
      validBlock = BlockManager.mineBlock(validBlock);
    });

    it('should validate correct block', () => {
      const result = BlockManager.validateBlock(validBlock, previousBlock);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject block with negative index', () => {
      const block = { ...validBlock, index: -1 };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block index must be non-negative');
    });

    it('should reject block with non-sequential index', () => {
      const block = { ...validBlock, index: 3 };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block index must be sequential');
    });

    it('should reject block with incorrect previous hash', () => {
      const block = { ...validBlock, previousHash: 'wrong-hash' };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block previous hash does not match');
    });

    it('should reject block with invalid hash', () => {
      const block = { ...validBlock, hash: 'invalid-hash' };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block hash is invalid');
    });

    it('should reject block with invalid merkle root', () => {
      const block = { ...validBlock, merkleRoot: 'invalid-merkle-root' };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block merkle root is invalid');
    });

    it('should reject block that does not meet difficulty', () => {
      // Create an unmined block with difficulty 2 (requires 2 leading zeros)
      const unmined = BlockManager.createBlock(
        1,
        mockTransactions,
        previousBlock.hash,
        2 // difficulty (requires '00' prefix)
      );

      // The createBlock method calculates a hash that likely doesn't start with '00'
      // So this block should fail the difficulty requirement
      const result = BlockManager.validateBlock(unmined, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Block does not meet its difficulty requirement'
      );
    });

    it('should reject block with invalid transaction', () => {
      const invalidTransaction = { ...mockTransaction, amount: -100 };
      const invalidBlock = BlockManager.createBlock(
        1,
        [invalidTransaction],
        previousBlock.hash,
        1 // difficulty
      );
      const minedInvalidBlock = BlockManager.mineBlock(invalidBlock);

      const result = BlockManager.validateBlock(
        minedInvalidBlock,
        previousBlock
      );

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(error => error.includes('Invalid transaction'))
      ).toBe(true);
    });

    it('should validate genesis block without previous block', () => {
      const genesisBlock = BlockManager.createGenesisBlock(testGenesisConfig);
      const result = BlockManager.validateBlock(genesisBlock, null);

      expect(result.isValid).toBe(true);
    });

    it('should collect multiple errors', () => {
      const block = {
        ...validBlock,
        index: -1,
        previousHash: 'wrong-hash',
        hash: 'invalid-hash',
      };
      const result = BlockManager.validateBlock(block, previousBlock);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('getBlockSize', () => {
    it('should calculate block size', () => {
      const block = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2 // difficulty
      );

      const size = BlockManager.getBlockSize(block);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should calculate different sizes for different blocks', () => {
      const block1 = BlockManager.createBlock(1, [], 'previous-hash', 2);

      const block2 = BlockManager.createBlock(
        1,
        mockTransactions,
        'previous-hash',
        2 // difficulty
      );

      const size1 = BlockManager.getBlockSize(block1);
      const size2 = BlockManager.getBlockSize(block2);

      expect(size2).toBeGreaterThan(size1);
    });
  });
});
