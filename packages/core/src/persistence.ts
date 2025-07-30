import type {
  IDatabase,
  Block,
  UTXOTransaction,
  UTXO,
  UTXOBlockchainState,
  UTXOPersistenceConfig,
  ValidationResult,
  RepairResult,
  UTXODatabaseStats,
  BatchOperation,
} from './types.js';
import { SubLevels, KeyPrefixes } from './database.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  debug(message: string): void {
    console.log(`[DEBUG] ${this.context}: ${message}`);
  }
  warn(message: string): void {
    console.warn(`[WARN] ${this.context}: ${message}`);
  }
  error(message: string): void {
    console.error(`[ERROR] ${this.context}: ${message}`);
  }
}

export class UTXOPersistenceManager {
  private db: IDatabase;
  private config: UTXOPersistenceConfig;
  private cryptoService: CryptographicService;
  private logger = new SimpleLogger('UTXOPersistenceManager');

  constructor(
    db: IDatabase,
    config: UTXOPersistenceConfig,
    cryptoService: CryptographicService
  ) {
    this.db = db;
    this.config = config;
    this.cryptoService = cryptoService;
  }

  // UTXO-focused core persistence operations
  async saveBlock(block: Block): Promise<void> {
    try {
      const blockKey = this.createBlockKey(block.index);
      await this.db.put(blockKey, block, SubLevels.BLOCKS);

      // Update metadata
      await this.updateLatestBlockIndex(block.index);

      this.logger.debug(
        `Saved block ${block.index} with ${block.transactions.length} transactions`
      );
    } catch (error) {
      this.logger.error(`Failed to save block ${block.index}: ${error}`);
      throw error;
    }
  }

  async getBlock(index: number): Promise<Block | null> {
    try {
      const blockKey = this.createBlockKey(index);
      return await this.db.get<Block>(blockKey, SubLevels.BLOCKS);
    } catch (error) {
      this.logger.error(`Failed to get block ${index}: ${error}`);
      throw error;
    }
  }

  async saveUTXOTransaction(transaction: UTXOTransaction): Promise<void> {
    try {
      const txKey = this.createUTXOTransactionKey(transaction.id);
      await this.db.put(txKey, transaction, SubLevels.UTXO_TRANSACTIONS);

      this.logger.debug(`Saved UTXO transaction ${transaction.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to save UTXO transaction ${transaction.id}: ${error}`
      );
      throw error;
    }
  }

  async getUTXOTransaction(id: string): Promise<UTXOTransaction | null> {
    try {
      const txKey = this.createUTXOTransactionKey(id);
      return await this.db.get<UTXOTransaction>(
        txKey,
        SubLevels.UTXO_TRANSACTIONS
      );
    } catch (error) {
      this.logger.error(`Failed to get UTXO transaction ${id}: ${error}`);
      throw error;
    }
  }

  // UTXO set management
  async saveUTXO(utxo: UTXO): Promise<void> {
    try {
      const utxoKey = this.createUTXOKey(utxo.txId, utxo.outputIndex);
      await this.db.put(utxoKey, utxo, SubLevels.UTXO_SET);

      this.logger.debug(`Saved UTXO ${utxoKey} with value ${utxo.value}`);
    } catch (error) {
      this.logger.error(
        `Failed to save UTXO ${utxo.txId}:${utxo.outputIndex}: ${error}`
      );
      throw error;
    }
  }

  async getUTXO(txId: string, outputIndex: number): Promise<UTXO | null> {
    try {
      const utxoKey = this.createUTXOKey(txId, outputIndex);
      return await this.db.get<UTXO>(utxoKey, SubLevels.UTXO_SET);
    } catch (error) {
      this.logger.error(`Failed to get UTXO ${txId}:${outputIndex}: ${error}`);
      throw error;
    }
  }

  async deleteUTXO(txId: string, outputIndex: number): Promise<void> {
    try {
      const utxoKey = this.createUTXOKey(txId, outputIndex);
      await this.db.del(utxoKey, SubLevels.UTXO_SET);

      this.logger.debug(`Deleted UTXO ${utxoKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete UTXO ${txId}:${outputIndex}: ${error}`
      );
      throw error;
    }
  }

  async getUTXOsForAddress(address: string): Promise<UTXO[]> {
    try {
      const utxos: UTXO[] = [];

      // Iterate through all UTXOs and filter by address
      for await (const { key, value } of this.db.iterator({
        sublevel: SubLevels.UTXO_SET,
        start: KeyPrefixes.UTXO,
        end: KeyPrefixes.UTXO + '\xff',
      })) {
        const utxo = value as UTXO;
        if (utxo.lockingScript === address && !utxo.isSpent) {
          utxos.push(utxo);
        }
      }

      this.logger.debug(`Found ${utxos.length} UTXOs for address ${address}`);
      return utxos.sort((a, b) => b.value - a.value); // Sort by value descending
    } catch (error) {
      this.logger.error(`Failed to get UTXOs for address ${address}: ${error}`);
      throw error;
    }
  }

  // Cryptographic key persistence
  async saveKeyPair(address: string, keyPair: KeyPair): Promise<void> {
    try {
      const keyPairKey = this.createKeyPairKey(address);
      await this.db.put(keyPairKey, keyPair, SubLevels.CRYPTOGRAPHIC_KEYS);

      this.logger.debug(`Saved key pair for address ${address}`);
    } catch (error) {
      this.logger.error(
        `Failed to save key pair for address ${address}: ${error}`
      );
      throw error;
    }
  }

  async getKeyPair(address: string): Promise<KeyPair | null> {
    try {
      const keyPairKey = this.createKeyPairKey(address);
      return await this.db.get<KeyPair>(
        keyPairKey,
        SubLevels.CRYPTOGRAPHIC_KEYS
      );
    } catch (error) {
      this.logger.error(
        `Failed to get key pair for address ${address}: ${error}`
      );
      throw error;
    }
  }

  // UTXO-based state management
  async saveBlockchainState(state: UTXOBlockchainState): Promise<void> {
    try {
      const operations: BatchOperation[] = [];

      // Save blocks
      for (const block of state.blocks) {
        const blockKey = this.createBlockKey(block.index);
        operations.push({
          type: 'put',
          key: blockKey,
          value: block,
          sublevel: SubLevels.BLOCKS,
        });
      }

      // Save UTXO set
      for (const [utxoKey, utxo] of state.utxoSet) {
        operations.push({
          type: 'put',
          key: utxoKey,
          value: utxo,
          sublevel: SubLevels.UTXO_SET,
        });
      }

      // Save pending UTXO transactions
      for (const transaction of state.pendingUTXOTransactions) {
        const pendingKey = this.createPendingTransactionKey(transaction.id);
        operations.push({
          type: 'put',
          key: pendingKey,
          value: transaction,
          sublevel: SubLevels.PENDING_UTXO_TX,
        });
      }

      // Save metadata
      operations.push({
        type: 'put',
        key: 'latest_block',
        value: state.latestBlockIndex,
        sublevel: SubLevels.METADATA,
      });

      operations.push({
        type: 'put',
        key: 'difficulty',
        value: state.difficulty,
        sublevel: SubLevels.CONFIG,
      });

      operations.push({
        type: 'put',
        key: 'mining_reward',
        value: state.miningReward,
        sublevel: SubLevels.CONFIG,
      });

      operations.push({
        type: 'put',
        key: 'utxo_root_hash',
        value: state.utxoRootHash,
        sublevel: SubLevels.METADATA,
      });

      // Execute batch operation
      await this.db.batch(operations);

      this.logger.debug(
        `Saved blockchain state with ${state.blocks.length} blocks and ${state.utxoSet.size} UTXOs`
      );
    } catch (error) {
      this.logger.error(`Failed to save blockchain state: ${error}`);
      throw error;
    }
  }

  async loadBlockchainState(): Promise<UTXOBlockchainState | null> {
    try {
      // Load metadata first
      const latestBlockIndex = await this.db.get<number>(
        'latest_block',
        SubLevels.METADATA
      );
      if (latestBlockIndex === null) {
        this.logger.debug('No blockchain state found');
        return null;
      }

      const difficulty =
        (await this.db.get<number>('difficulty', SubLevels.CONFIG)) || 2;
      const miningReward =
        (await this.db.get<number>('mining_reward', SubLevels.CONFIG)) || 10;
      const utxoRootHash =
        (await this.db.get<string>('utxo_root_hash', SubLevels.METADATA)) || '';

      // Load blocks
      const blocks: Block[] = [];
      for (let i = 0; i <= latestBlockIndex; i++) {
        const block = await this.getBlock(i);
        if (block) {
          blocks.push(block);
        }
      }

      // Load UTXO set
      const utxoSet = new Map<string, UTXO>();
      for await (const { key, value } of this.db.iterator({
        sublevel: SubLevels.UTXO_SET,
        start: KeyPrefixes.UTXO,
        end: KeyPrefixes.UTXO + '\xff',
      })) {
        const utxo = value as UTXO;
        utxoSet.set(key, utxo);
      }

      // Load pending UTXO transactions
      const pendingUTXOTransactions: UTXOTransaction[] = [];
      for await (const { key, value } of this.db.iterator({
        sublevel: SubLevels.PENDING_UTXO_TX,
        start: KeyPrefixes.PENDING_TX,
        end: KeyPrefixes.PENDING_TX + '\xff',
      })) {
        const transaction = value as UTXOTransaction;
        pendingUTXOTransactions.push(transaction);
      }

      // Load cryptographic keys
      const cryptographicKeys = new Map<string, unknown>();
      for await (const { key, value } of this.db.iterator({
        sublevel: SubLevels.CRYPTOGRAPHIC_KEYS,
        start: KeyPrefixes.KEYPAIR,
        end: KeyPrefixes.KEYPAIR + '\xff',
      })) {
        cryptographicKeys.set(key, value);
      }

      const state: UTXOBlockchainState = {
        blocks,
        utxoSet,
        pendingUTXOTransactions,
        difficulty,
        miningReward,
        latestBlockIndex,
        utxoRootHash,
        cryptographicKeys,
      };

      this.logger.debug(
        `Loaded blockchain state with ${blocks.length} blocks and ${utxoSet.size} UTXOs`
      );
      return state;
    } catch (error) {
      this.logger.error(`Failed to load blockchain state: ${error}`);
      throw error;
    }
  }

  // Recovery operations
  async validateIntegrity(): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      this.logger.debug('Starting integrity validation');

      // Validate block chain continuity
      const latestBlockIndex = await this.db.get<number>(
        'latest_block',
        SubLevels.METADATA
      );
      if (latestBlockIndex === null) {
        return { isValid: true, errors: [] }; // Empty blockchain is valid
      }

      let previousBlock: Block | null = null;
      for (let i = 0; i <= latestBlockIndex; i++) {
        const block = await this.getBlock(i);
        if (!block) {
          errors.push(`Missing block at index ${i}`);
          continue;
        }

        if (previousBlock && block.previousHash !== previousBlock.hash) {
          errors.push(`Block ${i} has invalid previous hash`);
        }

        previousBlock = block;
      }

      // Validate UTXO set consistency
      const utxoCount = await this.getUTXOCount();
      if (utxoCount === 0 && latestBlockIndex > 0) {
        errors.push('UTXO set is empty but blockchain contains blocks');
      }

      // Validate configuration
      const difficulty = await this.db.get<number>(
        'difficulty',
        SubLevels.CONFIG
      );
      if (difficulty === null || difficulty < 1) {
        errors.push('Invalid difficulty configuration');
      }

      this.logger.debug(
        `Integrity validation completed with ${errors.length} errors`
      );

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error(`Integrity validation failed: ${error}`);
      return {
        isValid: false,
        errors: [`Validation error: ${error}`],
      };
    }
  }

  async repairCorruption(): Promise<RepairResult> {
    const errors: string[] = [];
    let utxoSetRebuilt = false;
    const corruptedBlocks: number[] = [];

    try {
      this.logger.debug('Starting corruption repair');

      // Validate and repair block chain
      const latestBlockIndex = await this.db.get<number>(
        'latest_block',
        SubLevels.METADATA
      );
      if (latestBlockIndex === null) {
        return {
          repaired: true,
          errors: [],
          utxoSetRebuilt: false,
          corruptedBlocks: [],
        };
      }

      // Check each block and remove corrupted ones
      for (let i = 0; i <= latestBlockIndex; i++) {
        try {
          const block = await this.getBlock(i);
          if (!block) {
            corruptedBlocks.push(i);
          }
        } catch (error) {
          corruptedBlocks.push(i);
          errors.push(`Corrupted block ${i}: ${error}`);
        }
      }

      // Rebuild UTXO set if necessary
      if (corruptedBlocks.length > 0) {
        await this.rebuildUTXOSet();
        utxoSetRebuilt = true;
      }

      this.logger.debug(
        `Corruption repair completed: ${corruptedBlocks.length} corrupted blocks found`
      );

      return {
        repaired: corruptedBlocks.length === 0,
        errors,
        utxoSetRebuilt,
        corruptedBlocks,
      };
    } catch (error) {
      this.logger.error(`Corruption repair failed: ${error}`);
      return {
        repaired: false,
        errors: [`Repair error: ${error}`],
        utxoSetRebuilt: false,
        corruptedBlocks: [],
      };
    }
  }

  async rebuildUTXOSet(): Promise<void> {
    try {
      this.logger.debug('Starting UTXO set rebuild');

      // Clear existing UTXO set
      for await (const { key } of this.db.iterator({
        sublevel: SubLevels.UTXO_SET,
        start: KeyPrefixes.UTXO,
        end: KeyPrefixes.UTXO + '\xff',
      })) {
        await this.db.del(key, SubLevels.UTXO_SET);
      }

      // Rebuild from blocks
      const latestBlockIndex = await this.db.get<number>(
        'latest_block',
        SubLevels.METADATA
      );
      if (latestBlockIndex === null) {
        return;
      }

      for (let i = 0; i <= latestBlockIndex; i++) {
        const block = await this.getBlock(i);
        if (!block) continue;

        // Process block transactions to rebuild UTXO set
        for (const transaction of block.transactions) {
          // Create UTXO for transaction output
          const utxo: UTXO = {
            txId: transaction.id,
            outputIndex: 0,
            value: transaction.amount,
            lockingScript: transaction.to,
            blockHeight: block.index,
            isSpent: false,
          };
          await this.saveUTXO(utxo);
        }
      }

      this.logger.debug('UTXO set rebuild completed');
    } catch (error) {
      this.logger.error(`UTXO set rebuild failed: ${error}`);
      throw error;
    }
  }

  // Statistics and utility methods
  async getUTXOCount(): Promise<number> {
    let count = 0;
    for await (const {} of this.db.iterator({
      sublevel: SubLevels.UTXO_SET,
      start: KeyPrefixes.UTXO,
      end: KeyPrefixes.UTXO + '\xff',
    })) {
      count++;
    }
    return count;
  }

  async getDatabaseStats(): Promise<UTXODatabaseStats> {
    try {
      const totalUTXOs = await this.getUTXOCount();

      let totalValue = 0;
      for await (const { value } of this.db.iterator({
        sublevel: SubLevels.UTXO_SET,
        start: KeyPrefixes.UTXO,
        end: KeyPrefixes.UTXO + '\xff',
      })) {
        const utxo = value as UTXO;
        if (!utxo.isSpent) {
          totalValue += utxo.value;
        }
      }

      let totalBlocks = 0;
      for await (const {} of this.db.iterator({
        sublevel: SubLevels.BLOCKS,
        start: KeyPrefixes.BLOCK,
        end: KeyPrefixes.BLOCK + '\xff',
      })) {
        totalBlocks++;
      }

      let totalTransactions = 0;
      for await (const {} of this.db.iterator({
        sublevel: SubLevels.UTXO_TRANSACTIONS,
        start: KeyPrefixes.UTXO_TX,
        end: KeyPrefixes.UTXO_TX + '\xff',
      })) {
        totalTransactions++;
      }

      return {
        totalUTXOs,
        totalValue,
        totalBlocks,
        totalTransactions,
        databaseSizeBytes: 0, // TODO: Implement size calculation
        lastCompactionTime: Date.now(), // TODO: Track actual compaction time
      };
    } catch (error) {
      this.logger.error(`Failed to get database stats: ${error}`);
      throw error;
    }
  }

  // Private utility methods
  private createBlockKey(index: number): string {
    return `${KeyPrefixes.BLOCK}${index.toString().padStart(10, '0')}`;
  }

  private createUTXOTransactionKey(id: string): string {
    return `${KeyPrefixes.UTXO_TX}${id}`;
  }

  private createUTXOKey(txId: string, outputIndex: number): string {
    return `${KeyPrefixes.UTXO}${txId}:${outputIndex}`;
  }

  private createPendingTransactionKey(id: string): string {
    return `${KeyPrefixes.PENDING_TX}${id}`;
  }

  private createKeyPairKey(address: string): string {
    return `${KeyPrefixes.KEYPAIR}${address}`;
  }

  private async updateLatestBlockIndex(index: number): Promise<void> {
    await this.db.put('latest_block', index, SubLevels.METADATA);
  }

  // Cleanup methods
  async close(): Promise<void> {
    try {
      await this.db.close();
      this.logger.debug('Persistence manager closed');
    } catch (error) {
      this.logger.error(`Failed to close persistence manager: ${error}`);
      throw error;
    }
  }
}
