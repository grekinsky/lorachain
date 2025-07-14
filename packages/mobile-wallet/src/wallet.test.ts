import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileWallet } from './wallet.js';
import { TransactionManager } from '@lorachain/core';
import { Logger } from '@lorachain/shared';

// Mock the logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('MobileWallet', () => {
  let wallet: MobileWallet;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    (Logger.getInstance as any).mockReturnValue(mockLogger);
  });

  describe('constructor', () => {
    it('should generate new wallet when no private key provided', () => {
      wallet = new MobileWallet();

      expect(wallet.getAddress()).toBeDefined();
      expect(wallet.getPublicKey()).toBeDefined();
      expect(wallet.getBalance()).toBe(0);
      expect(wallet.getAddress()).toHaveLength(64);
      expect(wallet.getPublicKey()).toHaveLength(64);
    });

    it('should load wallet from private key', () => {
      const privateKey = 'test-private-key';
      wallet = new MobileWallet(privateKey);

      expect(wallet.getAddress()).toBeDefined();
      expect(wallet.getPublicKey()).toBeDefined();
      expect(wallet.exportPrivateKey()).toBe(privateKey);
    });

    it('should generate consistent address from same private key', () => {
      const privateKey = 'test-private-key';
      const wallet1 = new MobileWallet(privateKey);
      const wallet2 = new MobileWallet(privateKey);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
      expect(wallet1.getPublicKey()).toBe(wallet2.getPublicKey());
    });

    it('should generate different addresses for different private keys', () => {
      const wallet1 = new MobileWallet('private-key-1');
      const wallet2 = new MobileWallet('private-key-2');

      expect(wallet1.getAddress()).not.toBe(wallet2.getAddress());
      expect(wallet1.getPublicKey()).not.toBe(wallet2.getPublicKey());
    });
  });

  describe('getAddress', () => {
    it('should return wallet address', () => {
      wallet = new MobileWallet();
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address).toHaveLength(64);
    });
  });

  describe('getPublicKey', () => {
    it('should return wallet public key', () => {
      wallet = new MobileWallet();
      const publicKey = wallet.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey).toHaveLength(64);
    });
  });

  describe('getBalance', () => {
    it('should return initial balance of 0', () => {
      wallet = new MobileWallet();
      expect(wallet.getBalance()).toBe(0);
    });

    it('should return updated balance', () => {
      wallet = new MobileWallet();
      wallet.updateBalance(100);
      expect(wallet.getBalance()).toBe(100);
    });
  });

  describe('updateBalance', () => {
    it('should update wallet balance', () => {
      wallet = new MobileWallet();

      wallet.updateBalance(50);
      expect(wallet.getBalance()).toBe(50);

      wallet.updateBalance(100);
      expect(wallet.getBalance()).toBe(100);
    });

    it('should allow negative balance', () => {
      wallet = new MobileWallet();
      wallet.updateBalance(-10);
      expect(wallet.getBalance()).toBe(-10);
    });

    it('should allow zero balance', () => {
      wallet = new MobileWallet();
      wallet.updateBalance(100);
      wallet.updateBalance(0);
      expect(wallet.getBalance()).toBe(0);
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      wallet = new MobileWallet();
      wallet.updateBalance(1000);
    });

    it('should create valid transaction', () => {
      const transaction = wallet.createTransaction('to-address', 100);

      expect(transaction).toMatchObject({
        from: wallet.getAddress(),
        to: 'to-address',
        amount: 100,
        fee: 0.1,
        nonce: 0,
      });
      expect(transaction.id).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
      expect(transaction.signature).toBeDefined();
    });

    it('should create transaction with custom nonce', () => {
      const transaction = wallet.createTransaction('to-address', 100, 5);

      expect(transaction.nonce).toBe(5);
    });

    it('should log transaction creation', () => {
      wallet.createTransaction('to-address', 100);

      expect(mockLogger.info).toHaveBeenCalledWith('Creating transaction', {
        from: wallet.getAddress(),
        to: 'to-address',
        amount: 100,
      });
    });

    it('should throw for zero amount', () => {
      expect(() => wallet.createTransaction('to-address', 0)).toThrow(
        'Amount must be greater than 0'
      );
    });

    it('should throw for negative amount', () => {
      expect(() => wallet.createTransaction('to-address', -10)).toThrow(
        'Amount must be greater than 0'
      );
    });

    it('should throw for insufficient balance', () => {
      wallet.updateBalance(50);

      expect(() => wallet.createTransaction('to-address', 100)).toThrow(
        'Insufficient balance'
      );
    });

    it('should allow transaction equal to balance', () => {
      wallet.updateBalance(100);

      expect(() => wallet.createTransaction('to-address', 100)).not.toThrow();
    });

    it('should create transaction with valid signature', () => {
      const transaction = wallet.createTransaction('to-address', 100);

      // Verify signature is created correctly
      expect(transaction.signature).toBeDefined();
      expect(transaction.signature).toHaveLength(64);
    });
  });

  describe('signMessage', () => {
    it('should sign message with private key', () => {
      wallet = new MobileWallet();
      const message = 'test message';

      const signature = wallet.signMessage(message);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64);
    });

    it('should produce consistent signatures', () => {
      wallet = new MobileWallet();
      const message = 'test message';

      const signature1 = wallet.signMessage(message);
      const signature2 = wallet.signMessage(message);

      expect(signature1).toBe(signature2);
    });

    it('should produce different signatures for different messages', () => {
      wallet = new MobileWallet();

      const signature1 = wallet.signMessage('message 1');
      const signature2 = wallet.signMessage('message 2');

      expect(signature1).not.toBe(signature2);
    });

    it('should produce different signatures for different wallets', () => {
      const wallet1 = new MobileWallet();
      const wallet2 = new MobileWallet();
      const message = 'test message';

      const signature1 = wallet1.signMessage(message);
      const signature2 = wallet2.signMessage(message);

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('export', () => {
    it('should export public wallet information', () => {
      wallet = new MobileWallet();

      const exported = wallet.export();

      expect(exported).toEqual({
        address: wallet.getAddress(),
        publicKey: wallet.getPublicKey(),
      });
    });

    it('should not include private key in export', () => {
      wallet = new MobileWallet();

      const exported = wallet.export();

      expect(exported).not.toHaveProperty('privateKey');
      expect(exported).not.toHaveProperty('balance');
    });
  });

  describe('exportPrivateKey', () => {
    it('should export private key', () => {
      const privateKey = 'test-private-key';
      wallet = new MobileWallet(privateKey);

      const exported = wallet.exportPrivateKey();

      expect(exported).toBe(privateKey);
    });

    it('should export generated private key', () => {
      wallet = new MobileWallet();

      const exported = wallet.exportPrivateKey();

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
    });
  });

  describe('wallet generation determinism', () => {
    it('should generate different wallets each time', () => {
      const wallet1 = new MobileWallet();
      const wallet2 = new MobileWallet();

      expect(wallet1.getAddress()).not.toBe(wallet2.getAddress());
      expect(wallet1.getPublicKey()).not.toBe(wallet2.getPublicKey());
      expect(wallet1.exportPrivateKey()).not.toBe(wallet2.exportPrivateKey());
    });

    it('should derive public key from private key consistently', () => {
      const privateKey = 'test-private-key';
      const wallet1 = new MobileWallet(privateKey);
      const wallet2 = new MobileWallet(privateKey);

      expect(wallet1.getPublicKey()).toBe(wallet2.getPublicKey());
    });

    it('should derive address from public key consistently', () => {
      const privateKey = 'test-private-key';
      const wallet1 = new MobileWallet(privateKey);
      const wallet2 = new MobileWallet(privateKey);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
    });
  });

  describe('integration with TransactionManager', () => {
    it('should create transactions compatible with TransactionManager', () => {
      wallet = new MobileWallet();
      wallet.updateBalance(1000);

      const transaction = wallet.createTransaction('to-address', 100);

      // Verify transaction passes TransactionManager validation
      const validation = TransactionManager.validateTransaction(transaction);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should create transactions with correct fee calculation', () => {
      wallet = new MobileWallet();
      wallet.updateBalance(1000);

      const transaction = wallet.createTransaction('to-address', 100);
      const expectedFee = TransactionManager.calculateFee(100);

      expect(transaction.fee).toBe(expectedFee);
    });
  });
});
