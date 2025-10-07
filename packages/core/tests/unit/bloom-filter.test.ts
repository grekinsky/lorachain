/**
 * Unit tests for BloomFilter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BloomFilter } from '../../src/bloom-filter.js';

describe('BloomFilter', () => {
  let bloomFilter: BloomFilter;

  beforeEach(() => {
    bloomFilter = new BloomFilter(1024, 0.01); // 1KB filter, 1% FPR
  });

  describe('constructor', () => {
    it('should create a bloom filter with specified size', () => {
      expect(bloomFilter.getSize()).toBe(1024 * 8); // 8192 bits
    });

    it('should calculate appropriate number of hash functions', () => {
      const numHashFunctions = bloomFilter.getNumHashFunctions();
      expect(numHashFunctions).toBeGreaterThan(0);
      expect(numHashFunctions).toBeLessThanOrEqual(10);
    });

    it('should create filter with different false positive rates', () => {
      const filter1 = new BloomFilter(1024, 0.01); // 1%
      const filter2 = new BloomFilter(1024, 0.001); // 0.1%

      // More hash functions for lower FPR
      expect(filter2.getNumHashFunctions()).toBeGreaterThanOrEqual(
        filter1.getNumHashFunctions()
      );
    });
  });

  describe('add', () => {
    it('should add elements to the filter', () => {
      bloomFilter.add('address1');
      bloomFilter.add('address2');
      bloomFilter.add('address3');

      // Should be able to find added elements
      expect(bloomFilter.contains('address1')).toBe(true);
      expect(bloomFilter.contains('address2')).toBe(true);
      expect(bloomFilter.contains('address3')).toBe(true);
    });

    it('should handle duplicate additions', () => {
      bloomFilter.add('address1');
      bloomFilter.add('address1');
      bloomFilter.add('address1');

      expect(bloomFilter.contains('address1')).toBe(true);
    });

    it('should add multiple different addresses', () => {
      const addresses = [
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
      ];

      addresses.forEach(addr => bloomFilter.add(addr));

      addresses.forEach(addr => {
        expect(bloomFilter.contains(addr)).toBe(true);
      });
    });
  });

  describe('contains', () => {
    it('should return true for added elements', () => {
      bloomFilter.add('test-address');
      expect(bloomFilter.contains('test-address')).toBe(true);
    });

    it('should return false for elements not added', () => {
      bloomFilter.add('address1');
      expect(bloomFilter.contains('address2')).toBe(false);
    });

    it('should handle empty filter', () => {
      expect(bloomFilter.contains('anything')).toBe(false);
    });

    it('should have low false positive rate', () => {
      // Add 100 elements
      for (let i = 0; i < 100; i++) {
        bloomFilter.add(`address${i}`);
      }

      // Check 1000 non-existent elements
      let falsePositives = 0;
      for (let i = 1000; i < 2000; i++) {
        if (bloomFilter.contains(`address${i}`)) {
          falsePositives++;
        }
      }

      const actualFPR = falsePositives / 1000;
      // Should be reasonably close to target FPR (allowing some variance)
      expect(actualFPR).toBeLessThan(0.05); // Less than 5%
    });
  });

  describe('toBytes and fromBytes', () => {
    it('should serialize and deserialize correctly', () => {
      bloomFilter.add('address1');
      bloomFilter.add('address2');
      bloomFilter.add('address3');

      const bytes = bloomFilter.toBytes();
      const numHashFunctions = bloomFilter.getNumHashFunctions();

      const restored = BloomFilter.fromBytes(bytes, numHashFunctions);

      expect(restored.contains('address1')).toBe(true);
      expect(restored.contains('address2')).toBe(true);
      expect(restored.contains('address3')).toBe(true);
      expect(restored.contains('address4')).toBe(false);
    });

    it('should produce bytes of correct size', () => {
      const bytes = bloomFilter.toBytes();
      expect(bytes.length).toBe(1024); // Size in bytes
    });
  });

  describe('clear', () => {
    it('should clear all elements', () => {
      bloomFilter.add('address1');
      bloomFilter.add('address2');

      expect(bloomFilter.contains('address1')).toBe(true);

      bloomFilter.clear();

      expect(bloomFilter.contains('address1')).toBe(false);
      expect(bloomFilter.contains('address2')).toBe(false);
    });
  });

  describe('estimateFalsePositiveRate', () => {
    it('should estimate false positive rate', () => {
      const numElements = 50;

      for (let i = 0; i < numElements; i++) {
        bloomFilter.add(`address${i}`);
      }

      const estimated = bloomFilter.estimateFalsePositiveRate(numElements);

      expect(estimated).toBeGreaterThan(0);
      expect(estimated).toBeLessThan(1);
      // Should be in reasonable range
      expect(estimated).toBeLessThan(0.1); // Less than 10%
    });

    it('should increase with more elements', () => {
      const fpr1 = bloomFilter.estimateFalsePositiveRate(10);
      const fpr2 = bloomFilter.estimateFalsePositiveRate(100);

      expect(fpr2).toBeGreaterThan(fpr1);
    });
  });

  describe('special addresses', () => {
    it('should handle Bitcoin addresses', () => {
      const btcAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      ];

      btcAddresses.forEach(addr => bloomFilter.add(addr));

      btcAddresses.forEach(addr => {
        expect(bloomFilter.contains(addr)).toBe(true);
      });
    });

    it('should handle Ethereum-like addresses', () => {
      const ethAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      ];

      ethAddresses.forEach(addr => bloomFilter.add(addr));

      ethAddresses.forEach(addr => {
        expect(bloomFilter.contains(addr)).toBe(true);
      });
    });

    it('should handle empty strings', () => {
      bloomFilter.add('');
      expect(bloomFilter.contains('')).toBe(true);
    });

    it('should handle very long addresses', () => {
      const longAddress = 'a'.repeat(1000);
      bloomFilter.add(longAddress);
      expect(bloomFilter.contains(longAddress)).toBe(true);
    });
  });

  describe('performance', () => {
    it('should handle large number of addresses efficiently', () => {
      const numAddresses = 1000;
      const startTime = Date.now();

      for (let i = 0; i < numAddresses; i++) {
        bloomFilter.add(`address${i}`);
      }

      const addTime = Date.now() - startTime;

      // Should complete in reasonable time (< 100ms for 1000 adds)
      expect(addTime).toBeLessThan(100);
    });

    it('should perform lookups quickly', () => {
      // Add 100 addresses
      for (let i = 0; i < 100; i++) {
        bloomFilter.add(`address${i}`);
      }

      const startTime = Date.now();

      // Perform 1000 lookups
      for (let i = 0; i < 1000; i++) {
        bloomFilter.contains(`lookup${i}`);
      }

      const lookupTime = Date.now() - startTime;

      // Should complete in reasonable time (< 50ms for 1000 lookups)
      expect(lookupTime).toBeLessThan(50);
    });
  });
});
