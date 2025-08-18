import type { IDatabase, BatchOperation } from '../../../src/types.js';

/**
 * Mock database for unit testing
 * Provides in-memory storage without real database dependencies
 */
export class MockDatabase implements IDatabase {
  private data = new Map<string, any>();
  private isOpen = true;

  async get(key: string): Promise<any> {
    if (!this.isOpen) throw new Error('Database is closed');
    const value = this.data.get(key);
    if (value === undefined) {
      throw new Error(`Key not found: ${key}`);
    }
    return value;
  }

  async put(key: string, value: any): Promise<void> {
    if (!this.isOpen) throw new Error('Database is closed');
    this.data.set(key, value);
  }

  async del(key: string): Promise<void> {
    if (!this.isOpen) throw new Error('Database is closed');
    this.data.delete(key);
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    if (!this.isOpen) throw new Error('Database is closed');
    for (const op of operations) {
      if (op.type === 'put') {
        this.data.set(op.key, op.value);
      } else if (op.type === 'del') {
        this.data.delete(op.key);
      }
    }
  }

  async clear(): Promise<void> {
    if (!this.isOpen) throw new Error('Database is closed');
    this.data.clear();
  }

  async close(): Promise<void> {
    this.isOpen = false;
    this.data.clear();
  }

  sublevel(name: string): IDatabase {
    // Return a new mock database with prefixed keys
    return new MockSublevelDatabase(this, name);
  }

  async *iterator(_options?: any): AsyncIterableIterator<[string, any]> {
    if (!this.isOpen) throw new Error('Database is closed');
    const entries = Array.from(this.data.entries());
    for (const [key, value] of entries) {
      yield [key, value];
    }
  }

  // No open() method needed for mock - always ready
  async open(): Promise<void> {
    this.isOpen = true;
  }

  // Helper methods for testing
  getAllData(): Map<string, any> {
    return new Map(this.data);
  }

  hasKey(key: string): boolean {
    return this.data.has(key);
  }

  size(): number {
    return this.data.size;
  }
}

/**
 * Mock sublevel database for unit testing
 */
class MockSublevelDatabase implements IDatabase {
  constructor(
    private parent: MockDatabase,
    private prefix: string
  ) {}

  private prefixKey(key: string): string {
    return `${this.prefix}!${key}`;
  }

  async get(key: string): Promise<any> {
    return this.parent.get(this.prefixKey(key));
  }

  async put(key: string, value: any): Promise<void> {
    return this.parent.put(this.prefixKey(key), value);
  }

  async del(key: string): Promise<void> {
    return this.parent.del(this.prefixKey(key));
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    const prefixedOps = operations.map(op => ({
      ...op,
      key: this.prefixKey(op.key),
    }));
    return this.parent.batch(prefixedOps);
  }

  async clear(): Promise<void> {
    const allData = this.parent.getAllData();
    const keysToDelete: string[] = [];
    for (const key of allData.keys()) {
      if (key.startsWith(`${this.prefix}!`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      await this.parent.del(key);
    }
  }

  async close(): Promise<void> {
    // Sublevel doesn't close parent
  }

  sublevel(name: string): IDatabase {
    return new MockSublevelDatabase(this.parent, `${this.prefix}!${name}`);
  }

  async *iterator(_options?: any): AsyncIterableIterator<[string, any]> {
    const allData = this.parent.getAllData();
    for (const [key, value] of allData.entries()) {
      if (key.startsWith(`${this.prefix}!`)) {
        const unprefixedKey = key.slice(`${this.prefix}!`.length);
        yield [unprefixedKey, value];
      }
    }
  }

  async open(): Promise<void> {
    // Sublevel uses parent's open state
  }
}
