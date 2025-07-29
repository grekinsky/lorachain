import * as secp256k1 from '@noble/secp256k1';
import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { Transaction } from './types.js';

export type SignatureAlgorithm = 'secp256k1' | 'ed25519';

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  algorithm: SignatureAlgorithm;
}

export interface Signature {
  signature: Uint8Array;
  recovery?: number;
  algorithm: SignatureAlgorithm;
}

export interface CryptographicWallet {
  address: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  algorithm: SignatureAlgorithm;
  balance: number;
  nonce: number;
}

export class CryptographicService {
  static generateKeyPair(algorithm: SignatureAlgorithm = 'secp256k1'): KeyPair {
    const privateKey = this.generateSecureRandom(32);

    if (algorithm === 'secp256k1') {
      const publicKey = secp256k1.getPublicKey(privateKey);
      return {
        privateKey,
        publicKey,
        algorithm,
      };
    } else {
      const publicKey = ed25519.getPublicKey(privateKey);
      return {
        privateKey,
        publicKey,
        algorithm,
      };
    }
  }

  static generateKeyPairFromSeed(
    seed: Uint8Array,
    algorithm: SignatureAlgorithm
  ): KeyPair {
    const privateKey = sha256(seed);

    if (algorithm === 'secp256k1') {
      const publicKey = secp256k1.getPublicKey(privateKey);
      return {
        privateKey,
        publicKey,
        algorithm,
      };
    } else {
      const publicKey = ed25519.getPublicKey(privateKey);
      return {
        privateKey,
        publicKey,
        algorithm,
      };
    }
  }

  static generateAddress(
    publicKey: Uint8Array,
    algorithm: SignatureAlgorithm
  ): string {
    // Bitcoin-style address generation
    const publicKeyHash = ripemd160(sha256(publicKey));
    const version = algorithm === 'secp256k1' ? 0x00 : 0x01;
    const payload = new Uint8Array([version, ...publicKeyHash]);
    const checksum = sha256(sha256(payload)).slice(0, 4);
    const address = new Uint8Array([...payload, ...checksum]);
    return this.base58Encode(address);
  }

  static validateAddress(address: string): boolean {
    try {
      const decoded = this.base58Decode(address);
      if (decoded.length !== 25) return false;
      
      const payload = decoded.slice(0, -4);
      const checksum = decoded.slice(-4);
      const expectedChecksum = sha256(sha256(payload)).slice(0, 4);
      
      return this.uint8ArrayEquals(checksum, expectedChecksum);
    } catch {
      return false;
    }
  }

  static async sign(
    message: Uint8Array,
    privateKey: Uint8Array,
    algorithm: SignatureAlgorithm
  ): Promise<Signature> {
    if (algorithm === 'secp256k1') {
      const signature = await secp256k1.sign(message, privateKey);
      return {
        signature: signature.toCompactHex ? hexToBytes(signature.toCompactHex()) : new Uint8Array(signature),
        recovery: signature.recovery,
        algorithm,
      };
    } else {
      const signature = await ed25519.sign(message, privateKey);
      return {
        signature,
        algorithm,
      };
    }
  }

  static async verify(
    signature: Signature,
    message: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    try {
      if (signature.algorithm === 'secp256k1') {
        return secp256k1.verify(signature.signature, message, publicKey);
      } else {
        return await ed25519.verify(signature.signature, message, publicKey);
      }
    } catch {
      return false;
    }
  }

  static hashMessage(data: string | Uint8Array): Uint8Array {
    if (typeof data === 'string') {
      return sha256(new TextEncoder().encode(data));
    }
    return sha256(data);
  }

  static hashTransaction(transaction: Omit<Transaction, 'signature'>): Uint8Array {
    const transactionData = JSON.stringify({
      id: transaction.id,
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount,
      fee: transaction.fee,
      timestamp: transaction.timestamp,
      nonce: transaction.nonce,
    });
    return this.hashMessage(transactionData);
  }

  private static generateSecureRandom(length: number): Uint8Array {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint8Array(length));
    } else if (typeof require !== 'undefined') {
      const { randomBytes } = require('crypto');
      return new Uint8Array(randomBytes(length));
    }
    throw new Error('No secure random number generator available');
  }

  private static uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private static base58Encode(data: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);
    let num = BigInt('0x' + bytesToHex(data));
    let encoded = '';

    while (num > 0n) {
      const remainder = num % base;
      num = num / base;
      encoded = alphabet[Number(remainder)] + encoded;
    }

    // Handle leading zeros
    for (const byte of data) {
      if (byte === 0) {
        encoded = alphabet[0] + encoded;
      } else {
        break;
      }
    }

    return encoded;
  }

  private static base58Decode(encoded: string): Uint8Array {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);
    let num = 0n;

    for (const char of encoded) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error('Invalid base58 character');
      }
      num = num * base + BigInt(index);
    }

    const hex = num.toString(16);
    const bytes = hexToBytes(hex.padStart(hex.length + (hex.length % 2), '0'));

    // Handle leading zeros
    let leadingZeros = 0;
    for (const char of encoded) {
      if (char === alphabet[0]) {
        leadingZeros++;
      } else {
        break;
      }
    }

    return new Uint8Array([...new Uint8Array(leadingZeros), ...bytes]);
  }
}

export class SecureTransactionManager {
  static generateId(): string {
    const random = CryptographicService['generateSecureRandom'](32);
    return bytesToHex(random);
  }

  static async createTransaction(
    from: string,
    to: string,
    amount: number,
    keyPair: KeyPair,
    nonce: number = 0
  ): Promise<Transaction> {
    const transaction: Omit<Transaction, 'signature'> = {
      id: this.generateId(),
      from,
      to,
      amount,
      fee: this.calculateFee(amount),
      timestamp: Date.now(),
      nonce,
    };

    const messageHash = CryptographicService.hashTransaction(transaction);
    const signature = await CryptographicService.sign(
      messageHash,
      keyPair.privateKey,
      keyPair.algorithm
    );

    return {
      ...transaction,
      signature: bytesToHex(signature.signature),
    };
  }

  static calculateFee(amount: number): number {
    return Math.max(0.001, amount * 0.001);
  }

  static async verifyTransaction(
    transaction: Transaction,
    publicKey: Uint8Array,
    algorithm: SignatureAlgorithm = 'secp256k1'
  ): Promise<boolean> {
    const { signature, ...transactionWithoutSig } = transaction;
    const messageHash = CryptographicService.hashTransaction(transactionWithoutSig);
    const signatureBytes = hexToBytes(signature);

    return CryptographicService.verify(
      { signature: signatureBytes, algorithm },
      messageHash,
      publicKey
    );
  }
}

export class SecureMemory {
  static clearSensitiveData(data: Uint8Array): void {
    data.fill(0);
  }

  static withSecureBuffer<T>(size: number, fn: (buffer: Uint8Array) => T): T {
    const buffer = new Uint8Array(size);
    try {
      return fn(buffer);
    } finally {
      this.clearSensitiveData(buffer);
    }
  }
}