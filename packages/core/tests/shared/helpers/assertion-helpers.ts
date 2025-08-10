import { expect } from 'vitest';
import type { Block, UTXOTransaction, UTXO } from '../../../src/types.js';

/**
 * Custom assertion helpers for testing
 */

/**
 * Assert that a value is a valid hash (64 character hex string)
 */
export function expectValidHash(hash: string): void {
  expect(hash).toMatch(/^[a-f0-9]{64}$/i);
}

/**
 * Assert that a value is a valid address
 */
export function expectValidAddress(address: string): void {
  expect(address).toBeTruthy();
  expect(address.length).toBeGreaterThanOrEqual(20);
}

/**
 * Assert that a block is valid
 */
export function expectValidBlock(block: Block): void {
  expect(block).toBeDefined();
  expect(block.index).toBeGreaterThanOrEqual(0);
  expect(block.timestamp).toBeGreaterThan(0);
  expect(block.transactions).toBeDefined();
  expect(Array.isArray(block.transactions)).toBe(true);
  expectValidHash(block.hash);
  expect(block.previousHash).toBeDefined();
  expect(block.difficulty).toBeGreaterThan(0);
  expect(block.nonce).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that a UTXO transaction is valid
 */
export function expectValidUTXOTransaction(tx: UTXOTransaction): void {
  expect(tx).toBeDefined();
  expect(tx.id).toBeTruthy();
  expect(Array.isArray(tx.inputs)).toBe(true);
  expect(Array.isArray(tx.outputs)).toBe(true);
  expect(tx.outputs.length).toBeGreaterThan(0);
  expect(tx.timestamp).toBeGreaterThan(0);
  expect(tx.fee).toBeGreaterThanOrEqual(0);

  // Check outputs
  for (const output of tx.outputs) {
    expect(output.value).toBeGreaterThan(0);
    expect(output.lockingScript).toBeTruthy();
    expect(output.outputIndex).toBeGreaterThanOrEqual(0);
  }
}

/**
 * Assert that a UTXO is valid
 */
export function expectValidUTXO(utxo: UTXO): void {
  expect(utxo).toBeDefined();
  expect(utxo.txId).toBeTruthy();
  expect(utxo.outputIndex).toBeGreaterThanOrEqual(0);
  expect(utxo.value).toBeGreaterThan(0);
  expect(utxo.lockingScript).toBeTruthy();
  expect(utxo.blockHeight).toBeGreaterThanOrEqual(0);
  expect(typeof utxo.isSpent).toBe('boolean');
}

/**
 * Assert that two blocks are equal
 */
export function expectBlocksEqual(block1: Block, block2: Block): void {
  expect(block1.index).toBe(block2.index);
  expect(block1.hash).toBe(block2.hash);
  expect(block1.previousHash).toBe(block2.previousHash);
  expect(block1.timestamp).toBe(block2.timestamp);
  expect(block1.difficulty).toBe(block2.difficulty);
  expect(block1.nonce).toBe(block2.nonce);
  expect(block1.transactions).toEqual(block2.transactions);
}

/**
 * Assert that a value is within a range
 */
export function expectInRange(value: number, min: number, max: number): void {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

/**
 * Assert that an array contains unique values
 */
export function expectUniqueValues<T>(array: T[]): void {
  const uniqueSet = new Set(array);
  expect(uniqueSet.size).toBe(array.length);
}

/**
 * Assert that a promise rejects with a specific error
 */
export async function expectRejectsWithError(
  promise: Promise<any>,
  errorMessage: string | RegExp
): Promise<void> {
  try {
    await promise;
    expect.fail('Expected promise to reject');
  } catch (error: any) {
    if (typeof errorMessage === 'string') {
      expect(error.message).toContain(errorMessage);
    } else {
      expect(error.message).toMatch(errorMessage);
    }
  }
}

/**
 * Assert that a function throws a specific error
 */
export function expectThrowsError(
  fn: () => void,
  errorMessage: string | RegExp
): void {
  expect(fn).toThrow(errorMessage);
}
