/**
 * Simple Bloom Filter implementation for light client address filtering
 *
 * A Bloom filter is a space-efficient probabilistic data structure used to
 * test whether an element is a member of a set. It may return false positives
 * but never false negatives.
 */

import { createHash } from 'crypto';

/**
 * Bloom Filter for efficient address membership testing
 */
export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number; // Size in bits
  private numHashFunctions: number;

  /**
   * Create a new Bloom Filter
   *
   * @param size - Size in bytes (will be converted to bits)
   * @param falsePositiveRate - Target false positive rate (0.0 to 1.0)
   */
  constructor(size: number, falsePositiveRate: number = 0.01) {
    // Convert bytes to bits
    this.size = size * 8;
    this.bitArray = new Uint8Array(size);

    // Calculate optimal number of hash functions
    // k = (m/n) * ln(2)
    // For simplicity, we use a fixed number based on false positive rate
    this.numHashFunctions = Math.ceil(-Math.log2(falsePositiveRate));

    // Limit to reasonable range
    this.numHashFunctions = Math.max(1, Math.min(this.numHashFunctions, 10));
  }

  /**
   * Add an element to the bloom filter
   *
   * @param element - Element to add (typically an address)
   */
  add(element: string): void {
    const hashes = this.getHashes(element);

    for (const hash of hashes) {
      const bitIndex = hash % this.size;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;

      this.bitArray[byteIndex] |= 1 << bitOffset;
    }
  }

  /**
   * Test if an element might be in the set
   *
   * @param element - Element to test
   * @returns true if element might be in set (or false positive),
   *          false if element is definitely not in set
   */
  contains(element: string): boolean {
    const hashes = this.getHashes(element);

    for (const hash of hashes) {
      const bitIndex = hash % this.size;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;

      const isSet = (this.bitArray[byteIndex] & (1 << bitOffset)) !== 0;

      if (!isSet) {
        return false; // Definitely not in set
      }
    }

    return true; // Might be in set (or false positive)
  }

  /**
   * Get the serialized bloom filter data
   *
   * @returns Bloom filter as Uint8Array
   */
  toBytes(): Uint8Array {
    return this.bitArray;
  }

  /**
   * Create bloom filter from serialized data
   *
   * @param data - Serialized bloom filter data
   * @param numHashFunctions - Number of hash functions used
   * @returns BloomFilter instance
   */
  static fromBytes(data: Uint8Array, numHashFunctions: number): BloomFilter {
    const filter = new BloomFilter(data.length, 0.01);
    filter.bitArray = new Uint8Array(data);
    filter.numHashFunctions = numHashFunctions;
    return filter;
  }

  /**
   * Calculate the current false positive probability
   *
   * @param numElements - Estimated number of elements added
   * @returns Estimated false positive probability
   */
  estimateFalsePositiveRate(numElements: number): number {
    // FPR = (1 - e^(-kn/m))^k
    // where k = numHashFunctions, n = numElements, m = size in bits
    const exponent = (-this.numHashFunctions * numElements) / this.size;
    const base = 1 - Math.exp(exponent);
    return Math.pow(base, this.numHashFunctions);
  }

  /**
   * Get the number of hash functions
   */
  getNumHashFunctions(): number {
    return this.numHashFunctions;
  }

  /**
   * Get the size in bits
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Clear all bits in the filter
   */
  clear(): void {
    this.bitArray.fill(0);
  }

  /**
   * Generate hash values for an element
   *
   * @param element - Element to hash
   * @returns Array of hash values
   */
  private getHashes(element: string): number[] {
    const hashes: number[] = [];

    // Use multiple hash functions by combining two hash algorithms
    const hash1 = this.hash(element, 'sha256');
    const hash2 = this.hash(element, 'md5');

    // Generate k hash values using double hashing technique
    // h_i(x) = h1(x) + i * h2(x)
    for (let i = 0; i < this.numHashFunctions; i++) {
      const combinedHash = (hash1 + i * hash2) >>> 0; // Unsigned 32-bit
      hashes.push(combinedHash);
    }

    return hashes;
  }

  /**
   * Hash a string using specified algorithm
   *
   * @param data - Data to hash
   * @param algorithm - Hash algorithm
   * @returns 32-bit hash value
   */
  private hash(data: string, algorithm: string): number {
    const hash = createHash(algorithm);
    hash.update(data);
    const digest = hash.digest();

    // Convert first 4 bytes to 32-bit unsigned integer
    return (digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3];
  }
}
