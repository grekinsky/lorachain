import type { Transaction } from '@lorachain/core';
import {
  CryptographicService,
  SecureTransactionManager,
  type KeyPair,
  type CryptographicWallet,
  type SignatureAlgorithm,
} from '@lorachain/core';
import { Logger } from '@lorachain/shared';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface WalletExport {
  address: string;
  publicKey: string;
  algorithm: SignatureAlgorithm;
}

export class SecureMobileWallet {
  private keyPair: KeyPair;
  private wallet: CryptographicWallet;
  private logger = Logger.getInstance();

  constructor(
    privateKey?: Uint8Array | string,
    algorithm: SignatureAlgorithm = 'secp256k1'
  ) {
    if (privateKey) {
      // Handle both Uint8Array and string private keys
      let privateKeyBytes: Uint8Array;
      if (typeof privateKey === 'string') {
        try {
          // Try to parse as hex first
          privateKeyBytes = hexToBytes(privateKey.padStart(64, '0'));
        } catch {
          // If not valid hex, hash the string to create a valid private key
          privateKeyBytes = CryptographicService.hashMessage(privateKey);
        }
      } else {
        privateKeyBytes = privateKey;
      }
      this.keyPair = this.loadKeyPair(privateKeyBytes, algorithm);
    } else {
      this.keyPair = CryptographicService.generateKeyPair(algorithm);
    }

    this.wallet = {
      address: CryptographicService.generateAddress(
        this.keyPair.publicKey,
        algorithm
      ),
      publicKey: this.keyPair.publicKey,
      privateKey: this.keyPair.privateKey,
      algorithm,
      balance: 0,
      nonce: 0,
    };

    this.logger.info('Secure wallet initialized', {
      address: this.wallet.address,
      algorithm: this.wallet.algorithm,
    });
  }

  private loadKeyPair(
    privateKey: Uint8Array,
    algorithm: SignatureAlgorithm
  ): KeyPair {
    const keyPair = CryptographicService.generateKeyPairFromSeed(
      privateKey,
      algorithm
    );
    return keyPair;
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getPublicKey(): Uint8Array {
    return this.wallet.publicKey;
  }

  getPublicKeyHex(): string {
    return bytesToHex(this.wallet.publicKey);
  }

  getAlgorithm(): SignatureAlgorithm {
    return this.wallet.algorithm;
  }

  getBalance(): number {
    return this.wallet.balance;
  }

  getNonce(): number {
    return this.wallet.nonce;
  }

  updateBalance(balance: number): void {
    this.wallet.balance = balance;
  }

  updateNonce(nonce: number): void {
    this.wallet.nonce = nonce;
  }

  signMessage(message: string): string {
    const messageHash = CryptographicService.hashMessage(message);
    const signature = CryptographicService.sign(
      messageHash,
      this.keyPair.privateKey,
      this.keyPair.algorithm
    );
    return bytesToHex(signature.signature);
  }

  createTransaction(to: string, amount: number, nonce?: number): Transaction {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (amount > this.wallet.balance) {
      throw new Error('Insufficient balance');
    }

    const transactionNonce = nonce ?? this.wallet.nonce;

    this.logger.info('Creating secure transaction', {
      from: this.wallet.address,
      to,
      amount,
      nonce: transactionNonce,
    });

    const transaction = SecureTransactionManager.createTransaction(
      this.wallet.address,
      to,
      amount,
      this.keyPair,
      transactionNonce
    );

    // Increment nonce after successful transaction creation (only if using wallet's nonce)
    if (nonce === undefined) {
      this.wallet.nonce++;
    }

    return transaction;
  }

  export(): WalletExport {
    return {
      address: this.wallet.address,
      publicKey: bytesToHex(this.wallet.publicKey),
      algorithm: this.wallet.algorithm,
    };
  }

  exportPrivateKey(): string {
    this.logger.warn('Private key exported - handle with care!');
    return bytesToHex(this.wallet.privateKey);
  }

  exportPrivateKeyBytes(): Uint8Array {
    this.logger.warn('Private key exported - handle with care!');
    return new Uint8Array(this.wallet.privateKey);
  }

  static fromPrivateKeyHex(
    privateKeyHex: string,
    algorithm: SignatureAlgorithm = 'secp256k1'
  ): SecureMobileWallet {
    const privateKey = hexToBytes(privateKeyHex);
    return new SecureMobileWallet(privateKey, algorithm);
  }

  static fromSeed(
    seed: string,
    algorithm: SignatureAlgorithm = 'secp256k1'
  ): SecureMobileWallet {
    const seedHash = CryptographicService.hashMessage(seed);
    return new SecureMobileWallet(seedHash, algorithm);
  }

  static generateRandom(
    algorithm: SignatureAlgorithm = 'secp256k1'
  ): SecureMobileWallet {
    return new SecureMobileWallet(undefined, algorithm);
  }
}
