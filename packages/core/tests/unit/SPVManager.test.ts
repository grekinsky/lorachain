import { describe, it, expect, beforeEach } from 'vitest';
import { SPVManager } from '../../src/merkle/SPVManager.js';
import { MerkleTree } from '../../src/merkle/MerkleTree.js';
import { UTXOTransactionManager } from '../../src/utxo-transaction.js';
import { UTXOManager } from '../../src/utxo.js';
import type {
  UTXOTransaction,
  UTXO,
  MerkleProof,
  BlockHeader,
} from '../../src/types.js';

describe('SPVManager', () => {
  let mockUTXOTransaction: UTXOTransaction;
  let mockUTXOTransactions: UTXOTransaction[];
  let mockBlockHeader: BlockHeader;
  let mockProof: MerkleProof;
  let utxoManager: UTXOManager;

  beforeEach(() => {
    // Create mock UTXO manager and transactions
    utxoManager = new UTXOManager();
    const utxoTransactionManager = new UTXOTransactionManager();

    // Add UTXOs for transaction creation
    const mockUTXO1: UTXO = {
      txId: 'previous-tx-id-1',
      outputIndex: 0,
      value: 1000,
      lockingScript: 'from-address',
      blockHeight: 1,
      isSpent: false,
    };
    const mockUTXO2: UTXO = {
      txId: 'previous-tx-id-2',
      outputIndex: 0,
      value: 2000,
      lockingScript: 'from-address-2',
      blockHeight: 1,
      isSpent: false,
    };
    utxoManager.addUTXO(mockUTXO1);
    utxoManager.addUTXO(mockUTXO2);

    // Create UTXO transactions
    mockUTXOTransaction = utxoTransactionManager.createTransaction(
      'from-address',
      'to-address',
      100,
      'private-key',
      [mockUTXO1]
    );

    const mockUTXOTransaction2 = utxoTransactionManager.createTransaction(
      'from-address-2',
      'to-address-2',
      200,
      'private-key-2',
      [mockUTXO2]
    );

    mockUTXOTransactions = [mockUTXOTransaction, mockUTXOTransaction2];

    // Create mock block header
    mockBlockHeader = {
      index: 1,
      timestamp: Date.now(),
      previousHash: 'a'.repeat(64),
      merkleRoot: MerkleTree.calculateRoot(mockUTXOTransactions),
      hash: 'b'.repeat(64),
      nonce: 0,
      transactionCount: mockUTXOTransactions.length,
    };

    // Generate mock proof
    mockProof = MerkleTree.generateProof(
      mockUTXOTransactions,
      mockUTXOTransaction.id
    )!;
  });

  describe('verifyTransaction', () => {
    it('should verify valid transaction', () => {
      const utxoProof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      )!;
      const utxoRoot = MerkleTree.calculateRoot(mockUTXOTransactions);
      const utxoBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: utxoRoot,
        transactionCount: mockUTXOTransactions.length,
      };

      const result = SPVManager.verifyTransaction(
        mockUTXOTransaction,
        utxoProof,
        utxoBlockHeader
      );

      expect(result.isValid).toBe(true);
      expect(result.transactionVerified).toBe(true);
      expect(result.proofValid).toBe(true);
      expect(result.blockHeaderValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject transaction with invalid proof', () => {
      const utxoProof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      )!;
      const invalidBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: 'invalid-merkle-root'.padEnd(64, '0'),
      };

      const result = SPVManager.verifyTransaction(
        mockUTXOTransaction,
        utxoProof,
        invalidBlockHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.proofValid).toBe(false);
      expect(result.errors).toContain('Merkle proof verification failed');
    });

    it('should reject transaction with mismatched transaction hash', () => {
      const utxoProof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      )!;
      const utxoRoot = MerkleTree.calculateRoot(mockUTXOTransactions);
      const utxoBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: utxoRoot,
      };

      // Tamper with transaction
      const tamperedTransaction = { ...mockUTXOTransaction, fee: 999 };

      const result = SPVManager.verifyTransaction(
        tamperedTransaction,
        utxoProof,
        utxoBlockHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.transactionVerified).toBe(false);
      expect(result.errors).toContain('Transaction hash does not match proof');
    });

    it('should reject transaction with mismatched transaction ID', () => {
      const utxoProof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      )!;
      const utxoRoot = MerkleTree.calculateRoot(mockUTXOTransactions);
      const utxoBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: utxoRoot,
      };

      // Tamper with transaction ID
      const tamperedTransaction = { ...mockUTXOTransaction, id: 'wrong-id' };

      const result = SPVManager.verifyTransaction(
        tamperedTransaction,
        utxoProof,
        utxoBlockHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.transactionVerified).toBe(false);
      expect(result.errors).toContain('Transaction ID does not match proof');
    });
  });

  describe('validateBlockHeader', () => {
    it('should validate correct block header without previous header', () => {
      const result = SPVManager.validateBlockHeader(mockBlockHeader, null);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct block header with previous header', () => {
      const previousHeader: BlockHeader = {
        ...mockBlockHeader,
        index: 0,
        hash: mockBlockHeader.previousHash,
        timestamp: mockBlockHeader.timestamp - 1000,
        previousHash: '0',
      };

      const result = SPVManager.validateBlockHeader(
        mockBlockHeader,
        previousHeader
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject block header with non-sequential index', () => {
      const previousHeader: BlockHeader = {
        ...mockBlockHeader,
        index: 0,
        hash: mockBlockHeader.previousHash,
        previousHash: '0',
      };

      const invalidHeader: BlockHeader = {
        ...mockBlockHeader,
        index: 5, // Should be 1
      };

      const result = SPVManager.validateBlockHeader(
        invalidHeader,
        previousHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block index is not sequential');
    });

    it('should reject block header with wrong previous hash', () => {
      const correctPreviousHash = 'b'.repeat(64);
      const previousHeader: BlockHeader = {
        ...mockBlockHeader,
        index: 0,
        hash: correctPreviousHash,
        previousHash: '0',
      };

      const wrongPreviousHash = 'c'.repeat(64);
      const invalidHeader: BlockHeader = {
        ...mockBlockHeader,
        previousHash: wrongPreviousHash,
      };

      const result = SPVManager.validateBlockHeader(
        invalidHeader,
        previousHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Previous hash does not match');
    });

    it('should reject block header with invalid timestamp', () => {
      const previousHeader: BlockHeader = {
        ...mockBlockHeader,
        index: 0,
        hash: mockBlockHeader.previousHash,
        timestamp: mockBlockHeader.timestamp + 1000, // Future timestamp
        previousHash: '0',
      };

      const result = SPVManager.validateBlockHeader(
        mockBlockHeader,
        previousHeader
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Block timestamp must be greater than previous block'
      );
    });

    it('should validate difficulty requirement', () => {
      const headerWithDifficulty: BlockHeader = {
        ...mockBlockHeader,
        difficulty: 2,
        hash: '00' + 'a'.repeat(62), // Meets difficulty 2
      };

      const result = SPVManager.validateBlockHeader(headerWithDifficulty, null);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject block header not meeting difficulty', () => {
      const headerWithDifficulty: BlockHeader = {
        ...mockBlockHeader,
        difficulty: 3,
        hash: '00' + 'a'.repeat(62), // Only meets difficulty 2, not 3
      };

      const result = SPVManager.validateBlockHeader(headerWithDifficulty, null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Block does not meet difficulty requirement'
      );
    });
  });

  describe('calculateBalance', () => {
    it('should calculate balance using UTXO manager', () => {
      const balance = SPVManager.calculateBalance('from-address', utxoManager);

      expect(typeof balance).toBe('number');
      expect(balance).toBe(1000); // Value of mockUTXO1
    });

    it('should return 0 for address with no UTXOs', () => {
      const balance = SPVManager.calculateBalance(
        'non-existing-address',
        utxoManager
      );

      expect(balance).toBe(0);
    });
  });

  describe('verifyTransactionBatch', () => {
    it('should verify batch of transactions', () => {
      const utxoProof1 = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      )!;
      const utxoProof2 = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransactions[1].id
      )!;
      const utxoRoot = MerkleTree.calculateRoot(mockUTXOTransactions);

      const utxoBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: utxoRoot,
        transactionCount: mockUTXOTransactions.length,
      };

      const results = SPVManager.verifyTransactionBatch(
        mockUTXOTransactions,
        [utxoProof1, utxoProof2],
        [utxoBlockHeader, utxoBlockHeader]
      );

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should throw error for mismatched array lengths', () => {
      expect(() => {
        SPVManager.verifyTransactionBatch(
          mockUTXOTransactions,
          [mockProof], // Only one proof for two transactions
          [mockBlockHeader, mockBlockHeader]
        );
      }).toThrow(
        'Transactions, proofs, and block headers arrays must have the same length'
      );
    });
  });

  describe('hassufficientConfirmations', () => {
    it('should return true for sufficient confirmations', () => {
      const hasSufficient = SPVManager.hassufficientConfirmations(100, 110, 6);
      expect(hasSufficient).toBe(true);
    });

    it('should return false for insufficient confirmations', () => {
      const hasSufficient = SPVManager.hassufficientConfirmations(100, 105, 6);
      expect(hasSufficient).toBe(false);
    });

    it('should use default confirmation requirement', () => {
      const hasSufficient = SPVManager.hassufficientConfirmations(100, 106);
      expect(hasSufficient).toBe(true); // Default is 6 confirmations
    });
  });

  describe('validateUTXOOwnership', () => {
    it('should validate UTXO ownership with valid proof', () => {
      const mockUTXO: UTXO = {
        txId: mockUTXOTransaction.id,
        outputIndex: 0,
        value: 100,
        lockingScript: 'to-address',
        blockHeight: 1,
        isSpent: false,
      };

      const isOwner = SPVManager.validateUTXOOwnership(
        mockUTXO,
        mockProof,
        mockBlockHeader,
        'to-address'
      );

      expect(isOwner).toBe(true);
    });

    it('should reject UTXO ownership with wrong public key', () => {
      const mockUTXO: UTXO = {
        txId: mockUTXOTransaction.id,
        outputIndex: 0,
        value: 100,
        lockingScript: 'to-address',
        blockHeight: 1,
        isSpent: false,
      };

      const isOwner = SPVManager.validateUTXOOwnership(
        mockUTXO,
        mockProof,
        mockBlockHeader,
        'wrong-public-key'
      );

      expect(isOwner).toBe(false);
    });

    it('should reject UTXO ownership with invalid proof', () => {
      const mockUTXO: UTXO = {
        txId: mockUTXOTransaction.id,
        outputIndex: 0,
        value: 100,
        lockingScript: 'to-address',
        blockHeight: 1,
        isSpent: false,
      };

      const invalidBlockHeader: BlockHeader = {
        ...mockBlockHeader,
        merkleRoot: 'd'.repeat(64), // Invalid merkle root
      };

      const isOwner = SPVManager.validateUTXOOwnership(
        mockUTXO,
        mockProof,
        invalidBlockHeader,
        'to-address'
      );

      expect(isOwner).toBe(false);
    });
  });

  describe('createBlockHeader', () => {
    it('should create block header with all fields', () => {
      const header = SPVManager.createBlockHeader(
        1,
        Date.now(),
        'previous-hash',
        'merkle-root',
        'hash',
        123,
        5,
        2,
        'validator'
      );

      expect(header.index).toBe(1);
      expect(header.previousHash).toBe('previous-hash');
      expect(header.merkleRoot).toBe('merkle-root');
      expect(header.hash).toBe('hash');
      expect(header.nonce).toBe(123);
      expect(header.transactionCount).toBe(5);
      expect(header.difficulty).toBe(2);
      expect(header.validator).toBe('validator');
    });

    it('should create block header without optional fields', () => {
      const header = SPVManager.createBlockHeader(
        1,
        Date.now(),
        'previous-hash',
        'merkle-root',
        'hash',
        123,
        5
      );

      expect(header.difficulty).toBeUndefined();
      expect(header.validator).toBeUndefined();
    });
  });

  describe('estimateProofSize', () => {
    it('should estimate proof size correctly', () => {
      const size = SPVManager.estimateProofSize(mockProof);

      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);

      const expectedSize = 128 + mockProof.proof.length * 65;
      expect(size).toBe(expectedSize);
    });
  });

  describe('fitsLoRaConstraints', () => {
    it('should return true for small proofs', () => {
      const fits = SPVManager.fitsLoRaConstraints(mockProof);

      // With only 2 transactions, proof should be small enough
      expect(fits).toBe(true);
    });

    it('should return false for large proofs', () => {
      // Create large proof by mocking proof elements
      const largeProof: MerkleProof = {
        ...mockProof,
        proof: new Array(10).fill({
          hash: 'a'.repeat(64),
          direction: 'left' as const,
        }),
      };

      const fits = SPVManager.fitsLoRaConstraints(largeProof);
      expect(fits).toBe(false);
    });
  });

  describe('fragmentProof', () => {
    it('should return single proof for small proofs', () => {
      const fragments = SPVManager.fragmentProof(mockProof);

      expect(fragments).toHaveLength(1);
      expect(fragments[0]).toBe(mockProof);
    });

    it('should handle large proofs (placeholder implementation)', () => {
      const largeProof: MerkleProof = {
        ...mockProof,
        proof: new Array(10).fill({
          hash: 'a'.repeat(64),
          direction: 'left' as const,
        }),
      };

      const fragments = SPVManager.fragmentProof(largeProof);

      // Current implementation returns original proof
      expect(fragments).toHaveLength(1);
      expect(fragments[0]).toBe(largeProof);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return empty array (placeholder implementation)', () => {
      const history = SPVManager.getTransactionHistory('address', [mockProof]);

      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0);
    });
  });

  describe('Private method validateBasicBlockHeader', () => {
    it('should validate block header with valid fields', () => {
      // Test through public method
      const result = SPVManager.validateBlockHeader(mockBlockHeader, null);
      expect(result.isValid).toBe(true);
    });

    it('should reject block header with invalid hash length', () => {
      const invalidHeader: BlockHeader = {
        ...mockBlockHeader,
        hash: 'short-hash',
      };

      const result = SPVManager.validateBlockHeader(invalidHeader, null);
      expect(result.isValid).toBe(false);
    });

    it('should reject block header with negative values', () => {
      const invalidHeader: BlockHeader = {
        ...mockBlockHeader,
        index: -1,
      };

      const result = SPVManager.validateBlockHeader(invalidHeader, null);
      expect(result.isValid).toBe(false);
    });

    it('should reject block header with non-hex hash', () => {
      const invalidHeader: BlockHeader = {
        ...mockBlockHeader,
        hash: 'not-hex-hash'.padEnd(64, 'g'), // 'g' is not hex
      };

      const result = SPVManager.validateBlockHeader(invalidHeader, null);
      expect(result.isValid).toBe(false);
    });
  });
});
