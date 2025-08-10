import { vi } from 'vitest';

/**
 * Common test utilities
 */

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(interval);
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock async function with vi.fn()
 */
export function createAsyncMock<T = any>(
  returnValue?: T
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(returnValue);
}

/**
 * Create a mock that throws an error
 */
export function createErrorMock(
  error: Error | string
): ReturnType<typeof vi.fn> {
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  return vi.fn().mockRejectedValue(errorObj);
}

/**
 * Run a function multiple times and collect results
 */
export async function runMultipleTimes<T>(
  fn: () => T | Promise<T>,
  times: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < times; i++) {
    results.push(await fn());
  }
  return results;
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; time: number }> {
  const startTime = performance.now();
  const result = await fn();
  const time = performance.now() - startTime;
  return { result, time };
}

/**
 * Create a deferred promise
 */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

/**
 * Retry a function until it succeeds
 */
export async function retry<T>(
  fn: () => T | Promise<T>,
  maxRetries: number = 3,
  delay: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Create a timeout promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    sleep(timeout).then(() => {
      throw new Error(message);
    }),
  ]);
}
