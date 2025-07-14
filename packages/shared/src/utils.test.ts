import { describe, it, expect, vi } from 'vitest';
import {
  sleep,
  isValidAddress,
  formatAmount,
  parseAmount,
  getCurrentTimestamp,
  formatTimestamp,
  validateRequired,
  deepClone,
  retryAsync,
  bytesToHex,
  hexToBytes,
} from './utils.js';

describe('Utils', () => {
  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(90);
    });

    it('should resolve immediately for 0ms', async () => {
      const start = Date.now();
      await sleep(0);
      const end = Date.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct 64-character hex address', () => {
      const validAddress = 'a'.repeat(64);
      expect(isValidAddress(validAddress)).toBe(true);
    });

    it('should validate mixed case hex address', () => {
      const validAddress = 'A1B2C3D4E5F6' + 'a'.repeat(52);
      expect(isValidAddress(validAddress)).toBe(true);
    });

    it('should reject short address', () => {
      const shortAddress = 'a'.repeat(32);
      expect(isValidAddress(shortAddress)).toBe(false);
    });

    it('should reject long address', () => {
      const longAddress = 'a'.repeat(128);
      expect(isValidAddress(longAddress)).toBe(false);
    });

    it('should reject non-hex characters', () => {
      const invalidAddress = 'G' + 'a'.repeat(63);
      expect(isValidAddress(invalidAddress)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('formatAmount', () => {
    it('should format with default 8 decimals', () => {
      expect(formatAmount(123.456789123)).toBe('123.45678912');
    });

    it('should format with custom decimals', () => {
      expect(formatAmount(123.456789123, 2)).toBe('123.46');
    });

    it('should format integer values', () => {
      expect(formatAmount(100)).toBe('100.00000000');
      expect(formatAmount(100, 2)).toBe('100.00');
    });

    it('should format small values', () => {
      expect(formatAmount(0.00000001)).toBe('0.00000001');
      expect(formatAmount(0.00000001, 10)).toBe('0.0000000100');
    });

    it('should format zero', () => {
      expect(formatAmount(0)).toBe('0.00000000');
    });
  });

  describe('parseAmount', () => {
    it('should parse valid number strings', () => {
      expect(parseAmount('123.45')).toBe(123.45);
      expect(parseAmount('0.00000001')).toBe(0.00000001);
      expect(parseAmount('100')).toBe(100);
    });

    it('should parse zero', () => {
      expect(parseAmount('0')).toBe(0);
      expect(parseAmount('0.0')).toBe(0);
    });

    it('should throw for invalid formats', () => {
      expect(() => parseAmount('abc')).toThrow('Invalid amount format');
      expect(() => parseAmount('')).toThrow('Invalid amount format');
      expect(() => parseAmount('not-a-number')).toThrow(
        'Invalid amount format'
      );
    });

    it('should throw for negative amounts', () => {
      expect(() => parseAmount('-100')).toThrow('Invalid amount format');
      expect(() => parseAmount('-0.01')).toThrow('Invalid amount format');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current timestamp', () => {
      const before = Date.now();
      const timestamp = getCurrentTimestamp();
      const after = Date.now();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp to ISO string', () => {
      const timestamp = 1234567890000;
      const formatted = formatTimestamp(timestamp);

      expect(formatted).toBe('2009-02-13T23:31:30.000Z');
    });

    it('should format current timestamp', () => {
      const timestamp = getCurrentTimestamp();
      const formatted = formatTimestamp(timestamp);

      expect(formatted).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('validateRequired', () => {
    it('should return value if not null/undefined', () => {
      expect(validateRequired('test', 'field')).toBe('test');
      expect(validateRequired(123, 'field')).toBe(123);
      expect(validateRequired(false, 'field')).toBe(false);
      expect(validateRequired(0, 'field')).toBe(0);
      expect(validateRequired('', 'field')).toBe('');
    });

    it('should throw for null', () => {
      expect(() => validateRequired(null, 'field')).toThrow(
        'field is required'
      );
    });

    it('should throw for undefined', () => {
      expect(() => validateRequired(undefined, 'field')).toThrow(
        'field is required'
      );
    });

    it('should include field name in error', () => {
      expect(() => validateRequired(null, 'customField')).toThrow(
        'customField is required'
      );
    });
  });

  describe('deepClone', () => {
    it('should clone simple objects', () => {
      const original = { a: 1, b: 'test' };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });

    it('should clone nested objects', () => {
      const original = { a: { b: { c: 'nested' } } };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned.a).not.toBe(original.a);
      expect(cloned.a.b).not.toBe(original.a.b);
    });

    it('should clone arrays', () => {
      const original = [1, 2, { a: 'test' }];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[2]).not.toBe(original[2]);
    });

    it('should clone primitives', () => {
      expect(deepClone('string')).toBe('string');
      expect(deepClone(123)).toBe(123);
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });
  });

  describe('retryAsync', () => {
    it('should resolve on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryAsync(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retryAsync(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryAsync(fn, 2, 10)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use default values', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryAsync(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should wait between retries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retryAsync(fn, 3, 100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(90);
    });
  });

  describe('bytesToHex', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([0, 15, 255, 171]);
      expect(bytesToHex(bytes)).toBe('000fffab');
    });

    it('should handle empty array', () => {
      const bytes = new Uint8Array([]);
      expect(bytesToHex(bytes)).toBe('');
    });

    it('should handle single byte', () => {
      const bytes = new Uint8Array([255]);
      expect(bytesToHex(bytes)).toBe('ff');
    });

    it('should pad single digit hex', () => {
      const bytes = new Uint8Array([5]);
      expect(bytesToHex(bytes)).toBe('05');
    });
  });

  describe('hexToBytes', () => {
    it('should convert hex string to bytes', () => {
      const hex = '000fffab';
      const bytes = hexToBytes(hex);

      expect(bytes).toEqual(new Uint8Array([0, 15, 255, 171]));
    });

    it('should handle empty string', () => {
      const hex = '';
      const bytes = hexToBytes(hex);

      expect(bytes).toEqual(new Uint8Array([]));
    });

    it('should handle uppercase hex', () => {
      const hex = 'ABCDEF';
      const bytes = hexToBytes(hex);

      expect(bytes).toEqual(new Uint8Array([171, 205, 239]));
    });

    it('should handle mixed case hex', () => {
      const hex = 'aBcDeF';
      const bytes = hexToBytes(hex);

      expect(bytes).toEqual(new Uint8Array([171, 205, 239]));
    });
  });

  describe('bytesToHex and hexToBytes round trip', () => {
    it('should maintain data integrity', () => {
      const originalBytes = new Uint8Array([0, 15, 255, 171, 85, 170]);
      const hex = bytesToHex(originalBytes);
      const convertedBytes = hexToBytes(hex);

      expect(convertedBytes).toEqual(originalBytes);
    });

    it('should work with random data', () => {
      const originalBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        originalBytes[i] = Math.floor(Math.random() * 256);
      }

      const hex = bytesToHex(originalBytes);
      const convertedBytes = hexToBytes(hex);

      expect(convertedBytes).toEqual(originalBytes);
    });
  });
});
