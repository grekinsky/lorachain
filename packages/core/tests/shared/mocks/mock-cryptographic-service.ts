import type { CryptoKeyPair, AlgorithmType } from '../../../src/types.js';

/**
 * Mock cryptographic service for unit testing
 * Provides predictable key generation and signing without real cryptography
 */
export class MockCryptographicService {
  private keyCounter = 0;
  private signatureCounter = 0;

  async generateKeyPair(
    algorithm: AlgorithmType = 'secp256k1'
  ): Promise<CryptoKeyPair> {
    this.keyCounter++;
    return {
      publicKey: `mock-public-key-${algorithm}-${this.keyCounter}`,
      privateKey: `mock-private-key-${algorithm}-${this.keyCounter}`,
      algorithm,
    };
  }

  async signData(data: string, privateKey: string): Promise<string> {
    this.signatureCounter++;
    return `mock-signature-${this.signatureCounter}-${data.slice(0, 10)}`;
  }

  async verifySignature(
    data: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    // Mock verification - always returns true for mock signatures
    return signature.startsWith('mock-signature-');
  }

  async hashData(data: string): Promise<string> {
    // Return a predictable hash for testing
    return `mock-hash-${data.slice(0, 20)}`.padEnd(64, '0');
  }

  generateAddress(publicKey: string): string {
    // Generate a predictable address from public key
    return `mock-address-${publicKey.slice(-10)}`;
  }

  // Helper methods for testing
  getKeyCounter(): number {
    return this.keyCounter;
  }

  getSignatureCounter(): number {
    return this.signatureCounter;
  }

  resetCounters(): void {
    this.keyCounter = 0;
    this.signatureCounter = 0;
  }
}
