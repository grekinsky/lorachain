import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionManager } from './transaction.js';
import type { Transaction } from './types.js';

describe('TransactionManager', () => {
  const mockPrivateKey = 'test-private-key';
  const mockFrom = 'from-address';
  const mockTo = 'to-address';

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = TransactionManager.generateId();
      const id2 = TransactionManager.generateId();

      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(64);
      expect(id2).toHaveLength(64);
    });
  });

  describe('calculateFee', () => {
    it('should calculate fee correctly', () => {
      expect(TransactionManager.calculateFee(100)).toBe(0.1);
      expect(TransactionManager.calculateFee(1000)).toBe(1);
      expect(TransactionManager.calculateFee(0.5)).toBe(0.001);
    });

    it('should have minimum fee', () => {
      expect(TransactionManager.calculateFee(0.1)).toBe(0.001);
      expect(TransactionManager.calculateFee(0.01)).toBe(0.001);
    });
  });

  describe('createTransaction', () => {
    it('should create a valid transaction', () => {
      const transaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey,
        1
      );

      expect(transaction).toMatchObject({
        from: mockFrom,
        to: mockTo,
        amount: 100,
        fee: 0.1,
        nonce: 1,
      });
      expect(transaction.id).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
      expect(transaction.signature).toBeDefined();
    });

    it('should create transaction with default nonce', () => {
      const transaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey
      );

      expect(transaction.nonce).toBe(0);
    });
  });

  describe('signTransaction', () => {
    it('should create consistent signatures', () => {
      const transaction = {
        id: 'test-id',
        from: mockFrom,
        to: mockTo,
        amount: 100,
        fee: 0.1,
        timestamp: 1234567890,
        nonce: 0,
      };

      const signature1 = TransactionManager.signTransaction(
        transaction,
        mockPrivateKey
      );
      const signature2 = TransactionManager.signTransaction(
        transaction,
        mockPrivateKey
      );

      expect(signature1).toBe(signature2);
      expect(signature1).toHaveLength(128);
    });
  });

  describe('validateTransaction', () => {
    let validTransaction: Transaction;

    beforeEach(() => {
      validTransaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey
      );
    });

    it('should validate correct transaction', () => {
      const result = TransactionManager.validateTransaction(validTransaction);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject transaction without ID', () => {
      const transaction = { ...validTransaction, id: '' };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction ID is required');
    });

    it('should reject transaction without from address', () => {
      const transaction = { ...validTransaction, from: '' };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('From address is required');
    });

    it('should reject transaction without to address', () => {
      const transaction = { ...validTransaction, to: '' };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('To address is required');
    });

    it('should reject transaction with zero amount', () => {
      const transaction = { ...validTransaction, amount: 0 };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount must be greater than 0');
    });

    it('should reject transaction with negative amount', () => {
      const transaction = { ...validTransaction, amount: -10 };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount must be greater than 0');
    });

    it('should reject transaction with negative fee', () => {
      const transaction = { ...validTransaction, fee: -0.01 };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Fee cannot be negative');
    });

    it('should reject transaction without signature', () => {
      const transaction = { ...validTransaction, signature: '' };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction signature is required');
    });

    it('should reject transaction with invalid timestamp', () => {
      const transaction = { ...validTransaction, timestamp: 0 };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid timestamp');
    });

    it('should collect multiple errors', () => {
      const transaction = {
        ...validTransaction,
        amount: -10,
        fee: -0.01,
        signature: '',
      };
      const result = TransactionManager.validateTransaction(transaction);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const transaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey
      );

      const isValid = TransactionManager.verifySignature(
        transaction,
        mockPrivateKey
      );
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const transaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey
      );

      const isValid = TransactionManager.verifySignature(
        transaction,
        'wrong-key'
      );
      expect(isValid).toBe(false);
    });

    it('should reject tampered transaction', () => {
      const transaction = TransactionManager.createTransaction(
        mockFrom,
        mockTo,
        100,
        mockPrivateKey
      );

      const tamperedTransaction = { ...transaction, amount: 200 };
      const isValid = TransactionManager.verifySignature(
        tamperedTransaction,
        mockPrivateKey
      );
      expect(isValid).toBe(false);
    });
  });
});
