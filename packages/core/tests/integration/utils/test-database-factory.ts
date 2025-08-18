import { MemoryDatabase } from '../../../src/database.js';
import type { IDatabase } from '../../../src/types.js';

/**
 * Factory for creating test databases for integration tests
 */
export class TestDatabaseFactory {
  private static databases: IDatabase[] = [];

  /**
   * Create a memory database for testing
   */
  static async createMemoryDatabase(): Promise<MemoryDatabase> {
    const db = new MemoryDatabase();
    await db.open(); // Proper initialization
    this.databases.push(db);
    return db;
  }

  /**
   * Create a LevelDB database for testing (if needed)
   * Note: For integration tests, we typically use MemoryDatabase
   */
  static async createLevelDatabase(_path: string): Promise<IDatabase> {
    // For now, we'll use MemoryDatabase even for "level" requests
    // This avoids file system dependencies in tests
    const db = new MemoryDatabase();
    await db.open();
    this.databases.push(db);
    return db;
  }

  /**
   * Create a database with pre-populated data
   */
  static async createPopulatedDatabase(
    data: Record<string, any>
  ): Promise<MemoryDatabase> {
    const db = await this.createMemoryDatabase();

    for (const [key, value] of Object.entries(data)) {
      await db.put(key, value);
    }

    return db;
  }

  /**
   * Create a database with sublevel structure
   */
  static async createSublevelDatabase(): Promise<{
    root: MemoryDatabase;
    blocks: IDatabase;
    utxos: IDatabase;
    transactions: IDatabase;
  }> {
    const root = await this.createMemoryDatabase();

    return {
      root,
      blocks: root.sublevel('blocks'),
      utxos: root.sublevel('utxo_set'),
      transactions: root.sublevel('utxo_transactions'),
    };
  }

  /**
   * Clean up all created databases
   */
  static async cleanup(): Promise<void> {
    for (const db of this.databases) {
      try {
        await db.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.databases = [];
  }

  /**
   * Create a database that simulates failures
   */
  static createFailingDatabase(
    failOn: 'get' | 'put' | 'del' | 'batch' = 'put'
  ): IDatabase {
    const db = new MemoryDatabase();

    const originalMethod = db[failOn].bind(db);
    let callCount = 0;

    // @ts-expect-error - Overriding method for testing
    db[failOn] = async (...args: any[]) => {
      callCount++;
      if (callCount > 2) {
        throw new Error(`Simulated ${failOn} failure`);
      }
      return originalMethod(...args);
    };

    this.databases.push(db);
    return db;
  }
}
