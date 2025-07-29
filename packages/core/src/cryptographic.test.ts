import { describe, it, expect } from 'vitest';
import {
  CryptographicService,
  SecureTransactionManager,
  SecureMemory,
  type Signature,
} from './cryptographic.js';
import { bytesToHex } from '@noble/hashes/utils';

describe('CryptographicService', () => {
  describe('Key Generation', () => {
    it('should generate valid secp256k1 key pairs', () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');

      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBeGreaterThan(0);
      expect(keyPair.algorithm).toBe('secp256k1');
    });

    it('should generate valid ed25519 key pairs', () => {
      const keyPair = CryptographicService.generateKeyPair('ed25519');

      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.algorithm).toBe('ed25519');
    });

    it('should generate deterministic keys from seed', () => {
      const seed = new TextEncoder().encode('test seed');

      const keyPair1 = CryptographicService.generateKeyPairFromSeed(
        seed,
        'secp256k1'
      );
      const keyPair2 = CryptographicService.generateKeyPairFromSeed(
        seed,
        'secp256k1'
      );

      expect(bytesToHex(keyPair1.privateKey)).toBe(
        bytesToHex(keyPair2.privateKey)
      );
      expect(bytesToHex(keyPair1.publicKey)).toBe(
        bytesToHex(keyPair2.publicKey)
      );
    });

    it('should generate unique keys for different seeds', () => {
      const seed1 = new TextEncoder().encode('seed1');
      const seed2 = new TextEncoder().encode('seed2');

      const keyPair1 = CryptographicService.generateKeyPairFromSeed(
        seed1,
        'secp256k1'
      );
      const keyPair2 = CryptographicService.generateKeyPairFromSeed(
        seed2,
        'secp256k1'
      );

      expect(bytesToHex(keyPair1.privateKey)).not.toBe(
        bytesToHex(keyPair2.privateKey)
      );
      expect(bytesToHex(keyPair1.publicKey)).not.toBe(
        bytesToHex(keyPair2.publicKey)
      );
    });
  });

  describe('Address Generation', () => {
    it('should generate valid addresses from public keys', () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const address = CryptographicService.generateAddress(
        keyPair.publicKey,
        'secp256k1'
      );

      expect(address).toBeTruthy();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(20);
    });

    it('should generate different addresses for different algorithms', () => {
      const privateKey = new Uint8Array(32).fill(1);
      const keyPairSecp = CryptographicService.generateKeyPairFromSeed(
        privateKey,
        'secp256k1'
      );
      const keyPairEd = CryptographicService.generateKeyPairFromSeed(
        privateKey,
        'ed25519'
      );

      const addressSecp = CryptographicService.generateAddress(
        keyPairSecp.publicKey,
        'secp256k1'
      );
      const addressEd = CryptographicService.generateAddress(
        keyPairEd.publicKey,
        'ed25519'
      );

      expect(addressSecp).not.toBe(addressEd);
    });

    it('should validate address checksums', () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const address = CryptographicService.generateAddress(
        keyPair.publicKey,
        'secp256k1'
      );

      expect(CryptographicService.validateAddress(address)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(CryptographicService.validateAddress('invalid')).toBe(false);
      expect(CryptographicService.validateAddress('')).toBe(false);
      expect(CryptographicService.validateAddress('1234567890')).toBe(false);
    });
  });

  describe('Signature Operations', () => {
    it('should create valid signatures', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const message = new TextEncoder().encode('test message');

      const signature = CryptographicService.sign(
        message,
        keyPair.privateKey,
        'secp256k1'
      );

      expect(signature.signature).toBeInstanceOf(Uint8Array);
      expect(signature.signature.length).toBeGreaterThan(0);
      expect(signature.algorithm).toBe('secp256k1');
    });

    it('should verify valid signatures', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const message = new TextEncoder().encode('test message');

      const signature = CryptographicService.sign(
        message,
        keyPair.privateKey,
        'secp256k1'
      );
      const isValid = CryptographicService.verify(
        signature,
        message,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const message = new TextEncoder().encode('test message');
      const wrongMessage = new TextEncoder().encode('wrong message');

      const signature = CryptographicService.sign(
        message,
        keyPair.privateKey,
        'secp256k1'
      );
      const isValid = CryptographicService.verify(
        signature,
        wrongMessage,
        keyPair.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should reject signatures with wrong public key', async () => {
      const keyPair1 = CryptographicService.generateKeyPair('secp256k1');
      const keyPair2 = CryptographicService.generateKeyPair('secp256k1');
      const message = new TextEncoder().encode('test message');

      const signature = CryptographicService.sign(
        message,
        keyPair1.privateKey,
        'secp256k1'
      );
      const isValid = CryptographicService.verify(
        signature,
        message,
        keyPair2.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should handle signature malleability', async () => {
      const keyPair = CryptographicService.generateKeyPair('secp256k1');
      const message = new TextEncoder().encode('test message');

      const signature = CryptographicService.sign(
        message,
        keyPair.privateKey,
        'secp256k1'
      );

      // Modify signature slightly
      const malleableSignature = {
        ...signature,
        signature: new Uint8Array(signature.signature),
      };
      malleableSignature.signature[0] ^= 1;

      const isValid = CryptographicService.verify(
        malleableSignature,
        message,
        keyPair.publicKey
      );
      expect(isValid).toBe(false);
    });

    it('should work with ed25519 signatures', async () => {
      const keyPair = CryptographicService.generateKeyPair('ed25519');
      const message = new TextEncoder().encode('test message');

      const signature = CryptographicService.sign(
        message,
        keyPair.privateKey,
        'ed25519'
      );
      const isValid = CryptographicService.verify(
        signature,
        message,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
      expect(signature.signature.length).toBe(64);
    });
  });

  describe('Message Hashing', () => {
    it('should hash string messages', () => {
      const message = 'test message';
      const hash = CryptographicService.hashMessage(message);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32); // SHA-256 output
    });

    it('should hash byte array messages', () => {
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      const hash = CryptographicService.hashMessage(message);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should produce consistent hashes', () => {
      const message = 'consistent message';
      const hash1 = CryptographicService.hashMessage(message);
      const hash2 = CryptographicService.hashMessage(message);

      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });
  });

  describe('Transaction Hashing', () => {
    it('should hash transactions consistently', () => {
      const transaction = {
        id: 'tx123',
        from: 'addr1',
        to: 'addr2',
        amount: 100,
        fee: 0.1,
        timestamp: 1234567890,
        nonce: 0,
      };

      const hash1 = CryptographicService.hashTransaction(transaction);
      const hash2 = CryptographicService.hashTransaction(transaction);

      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });
  });
});

describe('SecureTransactionManager', () => {
  it('should create transactions with valid signatures', async () => {
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const from = CryptographicService.generateAddress(
      keyPair.publicKey,
      'secp256k1'
    );
    const to = CryptographicService.generateAddress(
      CryptographicService.generateKeyPair('secp256k1').publicKey,
      'secp256k1'
    );

    const transaction = SecureTransactionManager.createTransaction(
      from,
      to,
      100,
      keyPair,
      0
    );

    expect(transaction.id).toBeTruthy();
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(transaction.amount).toBe(100);
    expect(transaction.signature).toBeTruthy();
    expect(transaction.signature.length).toBeGreaterThan(100); // Hex encoded signature
  });

  it('should verify transactions correctly', async () => {
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const from = CryptographicService.generateAddress(
      keyPair.publicKey,
      'secp256k1'
    );
    const to = CryptographicService.generateAddress(
      CryptographicService.generateKeyPair('secp256k1').publicKey,
      'secp256k1'
    );

    const transaction = SecureTransactionManager.createTransaction(
      from,
      to,
      50,
      keyPair,
      0
    );

    const isValid = SecureTransactionManager.verifyTransaction(
      transaction,
      keyPair.publicKey,
      'secp256k1'
    );

    expect(isValid).toBe(true);
  });

  it('should reject transactions with invalid signatures', async () => {
    const keyPair1 = CryptographicService.generateKeyPair('secp256k1');
    const keyPair2 = CryptographicService.generateKeyPair('secp256k1');
    const from = CryptographicService.generateAddress(
      keyPair1.publicKey,
      'secp256k1'
    );
    const to = CryptographicService.generateAddress(
      keyPair2.publicKey,
      'secp256k1'
    );

    const transaction = SecureTransactionManager.createTransaction(
      from,
      to,
      25,
      keyPair1,
      0
    );

    // Try to verify with wrong public key
    const isValid = SecureTransactionManager.verifyTransaction(
      transaction,
      keyPair2.publicKey,
      'secp256k1'
    );

    expect(isValid).toBe(false);
  });

  it('should calculate fees correctly', () => {
    expect(SecureTransactionManager.calculateFee(100)).toBe(0.1);
    expect(SecureTransactionManager.calculateFee(50)).toBe(0.05);
    expect(SecureTransactionManager.calculateFee(0.5)).toBe(0.001); // Minimum fee
  });
});

describe('SecureMemory', () => {
  it('should clear sensitive data', () => {
    const sensitiveData = new Uint8Array([1, 2, 3, 4, 5]);
    SecureMemory.clearSensitiveData(sensitiveData);

    expect(sensitiveData.every(byte => byte === 0)).toBe(true);
  });

  it('should execute function with secure buffer', () => {
    const result = SecureMemory.withSecureBuffer(32, buffer => {
      buffer.fill(42);
      return buffer[0];
    });

    expect(result).toBe(42);
  });

  it('should clear buffer after use', () => {
    let bufferRef: Uint8Array | null = null;

    SecureMemory.withSecureBuffer(32, buffer => {
      bufferRef = buffer;
      buffer.fill(42);
      return null;
    });

    // Buffer should be cleared after function execution
    expect(bufferRef).not.toBeNull();
    expect(bufferRef!.every(byte => byte === 0)).toBe(true);
  });
});

describe('Security Validation', () => {
  it('should prevent private key leakage', async () => {
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const message = new TextEncoder().encode('test');

    const signature = CryptographicService.sign(
      message,
      keyPair.privateKey,
      'secp256k1'
    );

    // Signature should not contain private key information
    const privateKeyHex = bytesToHex(keyPair.privateKey);
    const signatureHex = bytesToHex(signature.signature);

    expect(signatureHex).not.toContain(privateKeyHex);
  });

  it('should resist signature forgery attempts', async () => {
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const message = new TextEncoder().encode('original message');

    const validSignature = CryptographicService.sign(
      message,
      keyPair.privateKey,
      'secp256k1'
    );

    // Create a fake signature
    const fakeSignature: Signature = {
      signature: new Uint8Array(64).fill(0),
      algorithm: 'secp256k1',
    };

    const isValidReal = CryptographicService.verify(
      validSignature,
      message,
      keyPair.publicKey
    );
    const isValidFake = CryptographicService.verify(
      fakeSignature,
      message,
      keyPair.publicKey
    );

    expect(isValidReal).toBe(true);
    expect(isValidFake).toBe(false);
  });

  it('should validate signature algorithms', async () => {
    const keyPairSecp = CryptographicService.generateKeyPair('secp256k1');
    const keyPairEd = CryptographicService.generateKeyPair('ed25519');
    const message = new TextEncoder().encode('test');

    const signatureSecp = CryptographicService.sign(
      message,
      keyPairSecp.privateKey,
      'secp256k1'
    );
    const signatureEd = CryptographicService.sign(
      message,
      keyPairEd.privateKey,
      'ed25519'
    );

    // Signatures should be algorithm-specific
    expect(signatureSecp.algorithm).toBe('secp256k1');
    expect(signatureEd.algorithm).toBe('ed25519');

    // Cross-algorithm verification should fail gracefully
    const crossVerify = CryptographicService.verify(
      { ...signatureSecp, algorithm: 'ed25519' },
      message,
      keyPairEd.publicKey
    );
    expect(crossVerify).toBe(false);
  });

  it('should handle edge cases securely', () => {
    // Minimal message (secp256k1 requires exactly 32 bytes)
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const minimalMessage = new Uint8Array([1]);
    const hashedMinimalMessage =
      CryptographicService.hashMessage(minimalMessage);

    const signature = CryptographicService.sign(
      hashedMinimalMessage,
      keyPair.privateKey,
      'secp256k1'
    );
    const isValid = CryptographicService.verify(
      signature,
      hashedMinimalMessage,
      keyPair.publicKey
    );

    expect(isValid).toBe(true);

    // Very large message - must be hashed first
    const largeMessage = new Uint8Array(10000).fill(1);
    const hashedLargeMessage = CryptographicService.hashMessage(largeMessage);
    const largeSig = CryptographicService.sign(
      hashedLargeMessage,
      keyPair.privateKey,
      'secp256k1'
    );
    const isLargeValid = CryptographicService.verify(
      largeSig,
      hashedLargeMessage,
      keyPair.publicKey
    );

    expect(isLargeValid).toBe(true);
  });
});
