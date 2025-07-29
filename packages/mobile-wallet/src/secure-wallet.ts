import type {
  Transaction,
  UTXO,
  UTXOTransaction,
  IUTXOManager,
} from '@lorachain/core';
import {
  CryptographicService,
  SecureTransactionManager,
  UTXOTransactionManager,
  type KeyPair,
  type CryptographicWallet,
  type SignatureAlgorithm,
} from '@lorachain/core';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  info(message: string, data?: unknown): void {
    console.log(`[INFO] ${this.context}: ${message}`, data || '');
  }
  warn(message: string, data?: unknown): void {
    console.warn(`[WARN] ${this.context}: ${message}`, data || '');
  }
  error(message: string, data?: unknown): void {
    console.error(`[ERROR] ${this.context}: ${message}`, data || '');
  }
  static getInstance(): SimpleLogger {
    return new SimpleLogger('SecureMobileWallet');
  }
}

export interface WalletExport {
  address: string;
  publicKey: string;
  algorithm: SignatureAlgorithm;
}

export class SecureMobileWallet {
  private keyPair: KeyPair;
  private wallet: CryptographicWallet;
  private logger = SimpleLogger.getInstance();
  private utxoTransactionManager: UTXOTransactionManager;

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

    // Initialize UTXO transaction manager
    this.utxoTransactionManager = new UTXOTransactionManager();

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

  // UTXO-based methods
  getUTXOBalance(utxoManager: IUTXOManager): number {
    return utxoManager.calculateBalance(this.wallet.address);
  }

  getOwnedUTXOs(utxoManager: IUTXOManager): UTXO[] {
    return utxoManager.getUTXOsForAddress(this.wallet.address);
  }

  createUTXOTransaction(
    to: string,
    amount: number,
    utxoManager: IUTXOManager
  ): UTXOTransaction {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const availableUTXOs = this.getOwnedUTXOs(utxoManager);
    const currentBalance = this.getUTXOBalance(utxoManager);

    if (amount > currentBalance) {
      throw new Error(
        `Insufficient UTXO balance: need ${amount}, have ${currentBalance}`
      );
    }

    this.logger.info('Creating UTXO transaction', {
      from: this.wallet.address,
      to,
      amount,
      availableUTXOs: availableUTXOs.length,
    });

    const transaction = this.utxoTransactionManager.createTransaction(
      this.wallet.address,
      to,
      amount,
      bytesToHex(this.keyPair.privateKey),
      availableUTXOs
    );

    this.logger.info('UTXO transaction created', {
      txId: transaction.id,
      inputs: transaction.inputs.length,
      outputs: transaction.outputs.length,
      fee: transaction.fee,
    });

    return transaction;
  }

  canAffordUTXOTransaction(amount: number, utxoManager: IUTXOManager): boolean {
    const availableUTXOs = this.getOwnedUTXOs(utxoManager);
    const selection = this.utxoTransactionManager.selectUTXOs(
      availableUTXOs,
      amount
    );
    return selection.totalValue >= amount;
  }

  getUTXOTransactionHistory(
    transactions: UTXOTransaction[],
    utxoManager: IUTXOManager
  ): UTXOTransaction[] {
    return transactions
      .filter(tx => {
        // Check if this wallet is involved in the transaction
        const inputAddresses =
          this.utxoTransactionManager.getTransactionInputAddresses(
            tx,
            utxoManager
          );
        const outputAddresses =
          this.utxoTransactionManager.getTransactionOutputAddresses(tx);

        return (
          inputAddresses.includes(this.wallet.address) ||
          outputAddresses.includes(this.wallet.address)
        );
      })
      .sort((a, b) => b.timestamp - a.timestamp);
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
