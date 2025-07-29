import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileWallet } from './wallet.js';
import { TransactionManager } from '@lorachain/core';

describe('MobileWallet', () => {
  let wallet: MobileWallet;

  describe('constructor', () => {
    it('should generate new wallet when no private key provided', () => {
      wallet = new MobileWallet();

      expect(wallet.getAddress()).toBeDefined();
      expect(wallet.getPublicKey()).toBeDefined();
      expect(wallet.getBalance()).toBe(0);
      // Bitcoin-style addresses are ~34 characters
      expect(wallet.getAddress().length).toBeGreaterThan(25);
      expect(wallet.getAddress().length).toBeLessThan(40);
      // Compressed secp256k1 public keys are 33 bytes (66 hex characters)
      expect(wallet.getPublicKey()).toHaveLength(33);
      expect(wallet.getPublicKeyHex()).toHaveLength(66);
    });

    it('should load wallet from private key', () => {
      const privateKey = 'test-private-key';
      wallet = new MobileWallet(privateKey);

      expect(wallet.getAddress()).toBeDefined();
      expect(wallet.getPublicKey()).toBeDefined();
      // Private key is derived from the input string and exported as hex
      expect(wallet.exportPrivateKey()).toHaveLength(64);
      expect(wallet.exportPrivateKey()).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('should generate consistent address from same private key', () => {
      const privateKey = 'test-private-key';
      const wallet1 = new MobileWallet(privateKey);
      const wallet2 = new MobileWallet(privateKey);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
      expect(wallet1.getPublicKeyHex()).toBe(wallet2.getPublicKeyHex());
    });

    it('should generate different addresses for different private keys', () => {
      const wallet1 = new MobileWallet('private-key-1');
      const wallet2 = new MobileWallet('private-key-2');

      expect(wallet1.getAddress()).not.toBe(wallet2.getAddress());
      expect(wallet1.getPublicKeyHex()).not.toBe(wallet2.getPublicKeyHex());
    });
  });

  describe('getAddress', () => {
    it('should return wallet address', () => {
      wallet = new MobileWallet();
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(20); // Bitcoin addresses are typically 25-34 characters
    });
  });

  describe('getPublicKey', () => {
    it('should return wallet public key', () => {
      wallet = new MobileWallet();
      const publicKey = wallet.getPublicKeyHex();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(60); // secp256k1 public keys are 33 or 65 bytes -> 66 or 130 hex chars
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
      const consoleSpy = vi.spyOn(console, 'log');

      wallet.createTransaction('to-address', 100);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[INFO] SecureMobileWallet: Creating secure transaction'
        ),
        expect.objectContaining({
          from: wallet.getAddress(),
          to: 'to-address',
          amount: 100,
        })
      );

      consoleSpy.mockRestore();
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
      expect(transaction.signature.length).toBeGreaterThan(60); // ECDSA signatures vary in length
    });
  });

  describe('signMessage', () => {
    it('should sign message with private key', () => {
      wallet = new MobileWallet();
      const message = 'test message';

      const signature = wallet.signMessage(message);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(60); // ECDSA signatures vary in length
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
        publicKey: wallet.getPublicKeyHex(),
        algorithm: wallet.getAlgorithm(),
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

      expect(exported).toHaveLength(64);
      expect(exported).toMatch(/^[0-9a-f]{64}$/i);
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
      expect(wallet1.getPublicKeyHex()).not.toBe(wallet2.getPublicKeyHex());
      expect(wallet1.exportPrivateKey()).not.toBe(wallet2.exportPrivateKey());
    });

    it('should derive public key from private key consistently', () => {
      const privateKey = 'test-private-key';
      const wallet1 = new MobileWallet(privateKey);
      const wallet2 = new MobileWallet(privateKey);

      expect(wallet1.getPublicKeyHex()).toBe(wallet2.getPublicKeyHex());
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
