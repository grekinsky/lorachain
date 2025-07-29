import { createHash, randomBytes } from 'crypto';
import type { Transaction, ValidationResult } from './types.js';
import {
  CryptographicService,
  SecureTransactionManager,
  type KeyPair,
  type SignatureAlgorithm,
} from './cryptographic.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Legacy transaction manager for backward compatibility
export class TransactionManager {
  static generateId(): string {
    return randomBytes(32).toString('hex');
  }

  static createTransaction(
    from: string,
    to: string,
    amount: number,
    privateKey: string,
    nonce: number = 0
  ): Transaction {
    const fee = this.calculateFee(amount);
    const timestamp = Date.now();
    const id = this.generateId();

    const transaction: Omit<Transaction, 'signature'> = {
      id,
      from,
      to,
      amount,
      fee,
      timestamp,
      nonce,
    };

    const signature = this.signTransaction(transaction, privateKey);

    return {
      ...transaction,
      signature,
    };
  }

  static calculateFee(amount: number): number {
    return Math.max(0.001, amount * 0.001);
  }

  static signTransaction(
    transaction: Omit<Transaction, 'signature'>,
    privateKey: string
  ): string {
    // Legacy signing method - deprecated, use SecureTransactionManager instead
    console.warn(
      'TransactionManager.signTransaction is deprecated. Use SecureTransactionManager for cryptographic signing.'
    );
    const transactionString = JSON.stringify(transaction);
    const hash = createHash('sha256')
      .update(transactionString + privateKey)
      .digest('hex');
    return hash;
  }

  static validateTransaction(transaction: Transaction): ValidationResult {
    const errors: string[] = [];

    if (!transaction.id) {
      errors.push('Transaction ID is required');
    }

    if (!transaction.from) {
      errors.push('From address is required');
    }

    if (!transaction.to) {
      errors.push('To address is required');
    }

    if (transaction.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (transaction.fee < 0) {
      errors.push('Fee cannot be negative');
    }

    if (!transaction.signature) {
      errors.push('Transaction signature is required');
    }

    if (transaction.timestamp <= 0) {
      errors.push('Invalid timestamp');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static verifySignature(transaction: Transaction, publicKey: string): boolean {
    // Check if this is a legacy signature (64 hex chars from sha256)
    if (transaction.signature.length === 64 && /^[0-9a-f]{64}$/i.test(transaction.signature)) {
      // Legacy verification
      console.warn(
        'Legacy signature detected. Consider migrating to SecureTransactionManager.'
      );
      const transactionWithoutSignature: Omit<Transaction, 'signature'> = {
        id: transaction.id,
        from: transaction.from,
        to: transaction.to,
        amount: transaction.amount,
        fee: transaction.fee,
        timestamp: transaction.timestamp,
        nonce: transaction.nonce,
      };

      const transactionString = JSON.stringify(transactionWithoutSignature);
      const expectedHash = createHash('sha256')
        .update(transactionString + publicKey)
        .digest('hex');

      return expectedHash === transaction.signature;
    }

    // For new signatures, delegate to SecureTransactionManager
    try {
      const publicKeyBytes = hexToBytes(publicKey);
      return SecureTransactionManager.verifyTransaction(
        transaction,
        publicKeyBytes
      ).then(result => result).catch(() => false);
    } catch {
      return false;
    }
  }

  // Helper method to detect signature type
  static isLegacySignature(signature: string): boolean {
    return signature.length === 64 && /^[0-9a-f]{64}$/i.test(signature);
  }
}
