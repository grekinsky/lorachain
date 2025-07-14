import { createHash, randomBytes } from 'crypto';
import type { Transaction, Wallet } from '@lorachain/core';
import { TransactionManager } from '@lorachain/core';
import { Logger } from '@lorachain/shared';

export class MobileWallet {
  private wallet: Wallet;
  private logger = Logger.getInstance();

  constructor(privateKey?: string) {
    if (privateKey) {
      this.wallet = this.loadWallet(privateKey);
    } else {
      this.wallet = this.generateWallet();
    }
  }

  private generateWallet(): Wallet {
    const privateKey = randomBytes(32).toString('hex');
    const publicKey = createHash('sha256').update(privateKey).digest('hex');
    const address = createHash('sha256').update(publicKey).digest('hex');

    return {
      address,
      privateKey,
      publicKey,
      balance: 0,
    };
  }

  private loadWallet(privateKey: string): Wallet {
    const publicKey = createHash('sha256').update(privateKey).digest('hex');
    const address = createHash('sha256').update(publicKey).digest('hex');

    return {
      address,
      privateKey,
      publicKey,
      balance: 0,
    };
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getPublicKey(): string {
    return this.wallet.publicKey;
  }

  getBalance(): number {
    return this.wallet.balance;
  }

  updateBalance(balance: number): void {
    this.wallet.balance = balance;
  }

  createTransaction(
    to: string,
    amount: number,
    nonce: number = 0
  ): Transaction {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (amount > this.wallet.balance) {
      throw new Error('Insufficient balance');
    }

    this.logger.info('Creating transaction', {
      from: this.wallet.address,
      to,
      amount,
    });

    return TransactionManager.createTransaction(
      this.wallet.address,
      to,
      amount,
      this.wallet.privateKey,
      nonce
    );
  }

  signMessage(message: string): string {
    const hash = createHash('sha256')
      .update(message + this.wallet.privateKey)
      .digest('hex');
    return hash;
  }

  export(): { address: string; publicKey: string } {
    return {
      address: this.wallet.address,
      publicKey: this.wallet.publicKey,
    };
  }

  exportPrivateKey(): string {
    return this.wallet.privateKey;
  }
}
