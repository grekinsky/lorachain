import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree } from '../../src/merkle/MerkleTree.js';
import { UTXOTransactionManager } from '../../src/utxo-transaction.js';
import { UTXOManager } from '../../src/utxo.js';
import type { UTXOTransaction, UTXO } from '../../src/types.js';

describe('MerkleTree', () => {
  let mockUTXOTransaction: UTXOTransaction;
  let mockUTXOTransactions: UTXOTransaction[];
  let utxoManager: UTXOManager;

  beforeEach(() => {
    // Create mock UTXO manager and transactions
    utxoManager = new UTXOManager();
    const utxoTransactionManager = new UTXOTransactionManager();

    // Add some UTXOs for transaction creation
    const mockUTXO: UTXO = {
      txId: 'previous-tx-id',
      outputIndex: 0,
      value: 1000,
      lockingScript: 'from-address',
      blockHeight: 1,
      isSpent: false,
    };
    utxoManager.addUTXO(mockUTXO);

    // Create UTXO transactions
    mockUTXOTransaction = utxoTransactionManager.createTransaction(
      'from-address',
      'to-address',
      100,
      'private-key',
      [mockUTXO]
    );

    const mockUTXO2: UTXO = {
      txId: 'previous-tx-id-2',
      outputIndex: 0,
      value: 2000,
      lockingScript: 'from-address-2',
      blockHeight: 1,
      isSpent: false,
    };
    utxoManager.addUTXO(mockUTXO2);

    const mockUTXOTransaction2 = utxoTransactionManager.createTransaction(
      'from-address-2',
      'to-address-2',
      200,
      'private-key-2',
      [mockUTXO2]
    );

    mockUTXOTransactions = [mockUTXOTransaction, mockUTXOTransaction2];
  });

  describe('buildTree', () => {
    it('should build tree for empty transactions', () => {
      const tree = MerkleTree.buildTree([]);

      expect(tree).toHaveLength(1);
      expect(tree[0].isLeaf).toBe(true);
      expect(tree[0].hash).toHaveLength(64);
    });

    it('should build tree for single transaction', () => {
      const tree = MerkleTree.buildTree([mockUTXOTransaction]);

      expect(tree).toHaveLength(1);
      expect(tree[0].isLeaf).toBe(true);
      expect(tree[0].transactionId).toBe(mockUTXOTransaction.id);
      expect(tree[0].hash).toHaveLength(64);
    });

    it('should build tree for multiple transactions', () => {
      const tree = MerkleTree.buildTree(mockUTXOTransactions);

      expect(tree.length).toBeGreaterThan(mockUTXOTransactions.length);

      // Check leaf nodes
      const leafNodes = tree.filter(node => node.isLeaf);
      expect(leafNodes).toHaveLength(mockUTXOTransactions.length);

      // Check root node exists
      const rootNodes = tree.filter(
        node =>
          !node.isLeaf && !tree.some(n => n.left === node || n.right === node)
      );
      expect(rootNodes).toHaveLength(1);
    });

    it('should build tree for odd number of transactions', () => {
      const threeTransactions = [
        ...mockUTXOTransactions,
        {
          ...mockUTXOTransaction,
          id: 'third-transaction',
        },
      ];

      const tree = MerkleTree.buildTree(threeTransactions);

      const leafNodes = tree.filter(node => node.isLeaf);
      expect(leafNodes).toHaveLength(3);
    });
  });

  describe('calculateRoot', () => {
    it('should calculate root for empty transactions', () => {
      const root = MerkleTree.calculateRoot([]);
      expect(root).toHaveLength(64);
    });

    it('should calculate root for single transaction', () => {
      const root = MerkleTree.calculateRoot([mockUTXOTransaction]);
      expect(root).toHaveLength(64);
    });

    it('should calculate root for multiple transactions', () => {
      const root = MerkleTree.calculateRoot(mockUTXOTransactions);
      expect(root).toHaveLength(64);
    });

    it('should produce consistent root calculation', () => {
      const root1 = MerkleTree.calculateRoot(mockUTXOTransactions);
      const root2 = MerkleTree.calculateRoot(mockUTXOTransactions);
      expect(root1).toBe(root2);
    });

    it('should produce different roots for different transactions', () => {
      const root1 = MerkleTree.calculateRoot([mockUTXOTransactions[0]]);
      const root2 = MerkleTree.calculateRoot(mockUTXOTransactions);
      expect(root1).not.toBe(root2);
    });
  });

  describe('generateProof', () => {
    it('should generate proof for existing transaction', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      expect(proof!.transactionId).toBe(mockUTXOTransaction.id);
      expect(proof!.transactionHash).toHaveLength(64);
      expect(proof!.merkleRoot).toHaveLength(64);
      expect(proof!.leafIndex).toBe(0);
      expect(Array.isArray(proof!.proof)).toBe(true);
    });

    it('should return null for non-existing transaction', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        'non-existing-id'
      );
      expect(proof).toBeNull();
    });

    it('should generate proof with correct structure', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      for (const element of proof!.proof) {
        expect(element.hash).toHaveLength(64);
        expect(['left', 'right']).toContain(element.direction);
      }
    });

    it('should generate proof for single transaction (empty proof)', () => {
      const proof = MerkleTree.generateProof(
        [mockUTXOTransaction],
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      expect(proof!.proof).toHaveLength(0); // Single transaction needs no proof elements
    });
  });

  describe('verifyProof', () => {
    it('should verify valid transaction proof', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const isValid = MerkleTree.verifyProof(proof!, proof!.merkleRoot);
      expect(isValid).toBe(true);
    });

    it('should reject proof with wrong merkle root', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const isValid = MerkleTree.verifyProof(
        proof!,
        'wrong-merkle-root'.padEnd(64, '0')
      );
      expect(isValid).toBe(false);
    });

    it('should reject proof with tampered proof elements', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      if (proof!.proof.length > 0) {
        proof!.proof[0].hash = 'tampered-hash'.padEnd(64, '0');
        const isValid = MerkleTree.verifyProof(proof!, proof!.merkleRoot);
        expect(isValid).toBe(false);
      }
    });

    it('should verify empty proof for single transaction', () => {
      const proof = MerkleTree.generateProof(
        [mockUTXOTransaction],
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      expect(proof!.proof).toHaveLength(0);
      const isValid = MerkleTree.verifyProof(proof!, proof!.merkleRoot);
      expect(isValid).toBe(true);
    });
  });

  describe('compressProof', () => {
    it('should compress and decompress proof correctly', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const compressed = MerkleTree.compressProof(proof!);
      const decompressed = MerkleTree.decompressProof(compressed);

      expect(decompressed.transactionId).toBe(proof!.transactionId);
      expect(decompressed.transactionHash).toBe(proof!.transactionHash);
      expect(decompressed.merkleRoot).toBe(proof!.merkleRoot);
      expect(decompressed.leafIndex).toBe(proof!.leafIndex);
      expect(decompressed.proof).toEqual(proof!.proof);
    });

    it('should create smaller compressed proof', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const compressed = MerkleTree.compressProof(proof!);

      const originalSize = JSON.stringify(proof).length;
      const compressedSize = JSON.stringify(compressed).length;

      // Compressed should be smaller (though not necessarily by much for small proofs)
      expect(compressedSize).toBeLessThanOrEqual(originalSize);
    });

    it('should compress proof with correct structure', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const compressed = MerkleTree.compressProof(proof!);

      expect(compressed.txId).toBe(proof!.transactionId);
      expect(compressed.txHash).toBe(proof!.transactionHash);
      expect(compressed.root).toBe(proof!.merkleRoot);
      expect(compressed.index).toBe(proof!.leafIndex);
      expect(typeof compressed.path).toBe('string');
      expect(compressed.path).toContain('|'); // Should have separator
    });
  });

  describe('decompressProof', () => {
    it('should maintain proof validity after compression/decompression', () => {
      const proof = MerkleTree.generateProof(
        mockUTXOTransactions,
        mockUTXOTransaction.id
      );

      expect(proof).not.toBeNull();
      const compressed = MerkleTree.compressProof(proof!);
      const decompressed = MerkleTree.decompressProof(compressed);

      const isValid = MerkleTree.verifyProof(
        decompressed,
        decompressed.merkleRoot
      );
      expect(isValid).toBe(true);
    });
  });

  describe('Large transaction sets', () => {
    it('should handle large number of transactions efficiently', () => {
      const largeTransactionSet: UTXOTransaction[] = [];

      // Create 100 mock transactions
      for (let i = 0; i < 100; i++) {
        const mockUTXO: UTXO = {
          txId: `previous-tx-${i}`,
          outputIndex: 0,
          value: 1000 + i,
          lockingScript: `address-${i}`,
          blockHeight: 1,
          isSpent: false,
        };
        utxoManager.addUTXO(mockUTXO);

        const utxoTransactionManager = new UTXOTransactionManager();
        const tx = utxoTransactionManager.createTransaction(
          `address-${i}`,
          `to-address-${i}`,
          100 + i,
          `private-key-${i}`,
          [mockUTXO]
        );
        tx.id = `tx-${i}`; // Override ID for predictability
        largeTransactionSet.push(tx);
      }

      const startTime = Date.now();
      const root = MerkleTree.calculateRoot(largeTransactionSet);
      const endTime = Date.now();

      expect(root).toHaveLength(64);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should generate and verify proofs for large transaction sets', () => {
      const largeTransactionSet: UTXOTransaction[] = [];

      // Create 50 mock transactions for faster testing
      for (let i = 0; i < 50; i++) {
        const mockUTXO: UTXO = {
          txId: `previous-tx-${i}`,
          outputIndex: 0,
          value: 1000 + i,
          lockingScript: `address-${i}`,
          blockHeight: 1,
          isSpent: false,
        };
        utxoManager.addUTXO(mockUTXO);

        const utxoTransactionManager = new UTXOTransactionManager();
        const tx = utxoTransactionManager.createTransaction(
          `address-${i}`,
          `to-address-${i}`,
          100 + i,
          `private-key-${i}`,
          [mockUTXO]
        );
        tx.id = `tx-${i}`;
        largeTransactionSet.push(tx);
      }

      // Test proof generation and verification for middle transaction
      const targetTxId = 'tx-25';
      const proof = MerkleTree.generateProof(largeTransactionSet, targetTxId);

      expect(proof).not.toBeNull();
      const isValid = MerkleTree.verifyProof(proof!, proof!.merkleRoot);
      expect(isValid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transaction array', () => {
      const root = MerkleTree.calculateRoot([]);
      const tree = MerkleTree.buildTree([]);
      const proof = MerkleTree.generateProof([], 'any-id');

      expect(root).toHaveLength(64);
      expect(tree).toHaveLength(1);
      expect(proof).toBeNull();
    });

    it('should handle transaction with same hash collision (theoretical)', () => {
      // Create two transactions that would theoretically have the same hash
      const tx1 = { ...mockUTXOTransaction, id: 'tx-1' };
      const tx2 = { ...mockUTXOTransaction, id: 'tx-2' };

      const transactions = [tx1, tx2];
      const root = MerkleTree.calculateRoot(transactions);

      expect(root).toHaveLength(64);
    });
  });
});
