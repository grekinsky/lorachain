import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureMobileWallet } from './secure-wallet.js';
import { CryptographicService } from '@lorachain/core';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

describe('SecureMobileWallet', () => {
  let wallet: SecureMobileWallet;

  beforeEach(() => {
    wallet = SecureMobileWallet.generateRandom('secp256k1');
  });

  describe('Wallet Creation', () => {
    it('should create a wallet with random key pair', () => {
      const randomWallet = SecureMobileWallet.generateRandom('secp256k1');
      
      expect(randomWallet.getAddress()).toBeTruthy();
      expect(randomWallet.getPublicKey()).toBeInstanceOf(Uint8Array);
      expect(randomWallet.getAlgorithm()).toBe('secp256k1');
      expect(randomWallet.getBalance()).toBe(0);
      expect(randomWallet.getNonce()).toBe(0);
    });

    it('should create a wallet from private key hex', () => {
      const privateKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const walletFromHex = SecureMobileWallet.fromPrivateKeyHex(privateKeyHex, 'secp256k1');
      
      expect(walletFromHex.getAddress()).toBeTruthy();
      expect(walletFromHex.exportPrivateKey()).toBe(privateKeyHex);
    });

    it('should create a wallet from seed', () => {
      const seed = 'my secure seed phrase';
      const wallet1 = SecureMobileWallet.fromSeed(seed, 'secp256k1');
      const wallet2 = SecureMobileWallet.fromSeed(seed, 'secp256k1');
      
      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
      expect(bytesToHex(wallet1.getPublicKey())).toBe(bytesToHex(wallet2.getPublicKey()));
    });

    it('should support ed25519 algorithm', () => {
      const edWallet = SecureMobileWallet.generateRandom('ed25519');
      
      expect(edWallet.getAlgorithm()).toBe('ed25519');
      expect(edWallet.getPublicKey().length).toBe(32);
    });
  });

  describe('Wallet Properties', () => {
    it('should return correct address', () => {
      const address = wallet.getAddress();
      expect(address).toBeTruthy();
      expect(typeof address).toBe('string');
      expect(CryptographicService.validateAddress(address)).toBe(true);
    });

    it('should return public key in different formats', () => {
      const publicKey = wallet.getPublicKey();
      const publicKeyHex = wallet.getPublicKeyHex();
      
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKeyHex).toBe(bytesToHex(publicKey));
    });

    it('should manage balance correctly', () => {
      expect(wallet.getBalance()).toBe(0);
      
      wallet.updateBalance(100);
      expect(wallet.getBalance()).toBe(100);
      
      wallet.updateBalance(50);
      expect(wallet.getBalance()).toBe(50);
    });

    it('should manage nonce correctly', () => {
      expect(wallet.getNonce()).toBe(0);
      
      wallet.updateNonce(5);
      expect(wallet.getNonce()).toBe(5);
    });
  });

  describe('Message Signing', () => {
    it('should sign messages', async () => {
      const message = 'Hello, Lorachain!';
      const signature =  wallet.signMessage(message);
      
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(100); // Hex encoded signature
    });

    it('should produce verifiable signatures', async () => {
      const message = 'Test message';
      const signature =  wallet.signMessage(message);
      
      const messageHash = CryptographicService.hashMessage(message);
      const isValid =  CryptographicService.verify(
        {
          signature: hexToBytes(signature),
          algorithm: wallet.getAlgorithm(),
        },
        messageHash,
        wallet.getPublicKey()
      );
      
      expect(isValid).toBe(true);
    });

    it('should produce different signatures for different messages', async () => {
      const message1 = 'Message 1';
      const message2 = 'Message 2';
      
      const signature1 =  wallet.signMessage(message1);
      const signature2 =  wallet.signMessage(message2);
      
      expect(signature1).not.toBe(signature2);
    });
  });

  describe('Transaction Creation', () => {
    beforeEach(() => {
      wallet.updateBalance(1000);
    });

    it('should create valid transactions', async () => {
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('secp256k1').publicKey,
        'secp256k1'
      );
      
      const transaction =  wallet.createTransaction(to, 100);
      
      expect(transaction.from).toBe(wallet.getAddress());
      expect(transaction.to).toBe(to);
      expect(transaction.amount).toBe(100);
      expect(transaction.fee).toBeGreaterThan(0);
      expect(transaction.signature).toBeTruthy();
      expect(transaction.nonce).toBe(0);
    });

    it('should increment nonce after transaction', async () => {
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('secp256k1').publicKey,
        'secp256k1'
      );
      
      expect(wallet.getNonce()).toBe(0);
      
       wallet.createTransaction(to, 50);
      expect(wallet.getNonce()).toBe(1);
      
       wallet.createTransaction(to, 50);
      expect(wallet.getNonce()).toBe(2);
    });

    it('should reject transactions with invalid amounts', async () => {
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('secp256k1').publicKey,
        'secp256k1'
      );
      
       expect(wallet.createTransaction(to, 0)).rejects.toThrow('Amount must be greater than 0');
       expect(wallet.createTransaction(to, -10)).rejects.toThrow('Amount must be greater than 0');
    });

    it('should reject transactions with insufficient balance', async () => {
      wallet.updateBalance(100);
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('secp256k1').publicKey,
        'secp256k1'
      );
      
       expect(wallet.createTransaction(to, 150)).rejects.toThrow('Insufficient balance');
    });

    it('should create verifiable transactions', async () => {
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('secp256k1').publicKey,
        'secp256k1'
      );
      
      const transaction =  wallet.createTransaction(to, 75);
      
      const { SecureTransactionManager } =  import('@lorachain/core');
      const isValid =  SecureTransactionManager.verifyTransaction(
        transaction,
        wallet.getPublicKey(),
        wallet.getAlgorithm()
      );
      
      expect(isValid).toBe(true);
    });
  });

  describe('Wallet Export/Import', () => {
    it('should export wallet data', () => {
      const exported = wallet.export();
      
      expect(exported.address).toBe(wallet.getAddress());
      expect(exported.publicKey).toBe(wallet.getPublicKeyHex());
      expect(exported.algorithm).toBe(wallet.getAlgorithm());
    });

    it('should export private key with warning', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      
      const privateKeyHex = wallet.exportPrivateKey();
      
      expect(privateKeyHex).toBeTruthy();
      expect(privateKeyHex.length).toBe(64); // 32 bytes in hex
      expect(consoleWarnSpy).toHaveBeenCalledWith('Private key exported - handle with care!');
      
      consoleWarnSpy.mockRestore();
    });

    it('should export private key bytes with warning', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      
      const privateKeyBytes = wallet.exportPrivateKeyBytes();
      
      expect(privateKeyBytes).toBeInstanceOf(Uint8Array);
      expect(privateKeyBytes.length).toBe(32);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Private key exported - handle with care!');
      
      consoleWarnSpy.mockRestore();
    });

    it('should recreate wallet from exported private key', () => {
      const privateKeyHex = wallet.exportPrivateKey();
      const recreatedWallet = SecureMobileWallet.fromPrivateKeyHex(privateKeyHex, wallet.getAlgorithm());
      
      expect(recreatedWallet.getAddress()).toBe(wallet.getAddress());
      expect(bytesToHex(recreatedWallet.getPublicKey())).toBe(bytesToHex(wallet.getPublicKey()));
    });
  });

  describe('Ed25519 Support', () => {
    let edWallet: SecureMobileWallet;

    beforeEach(() => {
      edWallet = SecureMobileWallet.generateRandom('ed25519');
      edWallet.updateBalance(1000);
    });

    it('should sign messages with ed25519', async () => {
      const message = 'Ed25519 test message';
      const signature =  edWallet.signMessage(message);
      
      expect(signature).toBeTruthy();
      expect(signature.length).toBe(128); // 64 bytes in hex
    });

    it('should create transactions with ed25519', async () => {
      const to = CryptographicService.generateAddress(
        CryptographicService.generateKeyPair('ed25519').publicKey,
        'ed25519'
      );
      
      const transaction =  edWallet.createTransaction(to, 100);
      
      expect(transaction.from).toBe(edWallet.getAddress());
      expect(transaction.signature).toBeTruthy();
      
      const { SecureTransactionManager } =  import('@lorachain/core');
      const isValid =  SecureTransactionManager.verifyTransaction(
        transaction,
        edWallet.getPublicKey(),
        'ed25519'
      );
      
      expect(isValid).toBe(true);
    });
  });
});