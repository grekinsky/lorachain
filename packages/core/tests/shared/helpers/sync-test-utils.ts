/**
 * State Synchronization Test Utilities
 *
 * Helper functions for testing state synchronization features
 */

import { Blockchain } from '../../../src/blockchain.js';
import { UTXOManager } from '../../../src/utxo.js';
import { UTXOPersistenceManager } from '../../../src/persistence.js';
import { MemoryDatabase } from '../../../src/database.js';
import { CryptographicService } from '../../../src/cryptographic.js';
import { createTestnetGenesisConfig } from '../fixtures/mock-genesis-config.js';
import type { Block, UTXOTransaction } from '../../../src/types.js';

/**
 * Sync performance metrics
 */
export interface SyncMetrics {
  duration: number; // Time in milliseconds
  blocksDownloaded: number; // Number of blocks synced
  bytesTransferred: number; // Total bytes sent/received
  memoryUsed: number; // Memory consumption in bytes
  blocksPerSecond: number; // Sync speed
  bandwidthMBps: number; // Bandwidth utilization
}

/**
 * Network simulation options
 */
export interface NetworkSimulationOptions {
  latency?: number; // Latency in milliseconds
  packetLoss?: number; // Packet loss percentage (0-100)
  bandwidth?: number; // Bandwidth limit in bytes/sec
}

/**
 * Create a test blockchain with N blocks
 *
 * @param blocks - Number of blocks to create
 * @param options - Optional blockchain configuration
 * @returns Promise resolving to configured blockchain
 *
 * @example
 * ```typescript
 * const blockchain = await createTestBlockchain(100);
 * expect(blockchain.getBlocks().length).toBe(101); // genesis + 100
 * ```
 */
export async function createTestBlockchain(
  blocks: number,
  options?: { targetBlockTime?: number }
): Promise<Blockchain> {
  // Create in-memory database
  const db = new MemoryDatabase({
    dbPath: ':memory:',
    compressionType: 'gzip',
  });

  // Create crypto service
  const cryptoService = new CryptographicService();

  // Create persistence manager
  const persistence = new UTXOPersistenceManager(
    db,
    {
      dbPath: ':memory:',
      compressionType: 'gzip',
    },
    cryptoService
  );

  // Create UTXO manager
  const utxoManager = new UTXOManager();

  // Create genesis config
  const genesisConfig = createTestnetGenesisConfig();

  // Create blockchain
  const blockchain = new Blockchain(
    persistence,
    utxoManager,
    { targetBlockTime: options?.targetBlockTime ?? 180 },
    genesisConfig
  );

  // Wait for initialization
  await blockchain.waitForInitialization();

  // Mine the specified number of blocks
  if (blocks > 0) {
    const keyPair = CryptographicService.generateKeyPair('secp256k1');

    for (let i = 0; i < blocks; i++) {
      await blockchain.minePendingUTXOTransactions(keyPair.publicKey);
    }
  }

  return blockchain;
}

/**
 * Simulate network interruption
 *
 * @param duration - Duration of interruption in milliseconds
 * @returns Promise that resolves after the interruption period
 *
 * @example
 * ```typescript
 * // Simulate 2 second network outage
 * await simulateNetworkInterruption(2000);
 * ```
 */
export async function simulateNetworkInterruption(
  duration: number
): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, duration);
  });
}

/**
 * Measure sync performance
 *
 * @param syncFn - The sync function to measure
 * @returns Promise resolving to performance metrics
 *
 * @example
 * ```typescript
 * const metrics = await measureSyncPerformance(async () => {
 *   await syncManager.startSync();
 * });
 *
 * console.log(`Sync took ${metrics.duration}ms`);
 * console.log(`Speed: ${metrics.blocksPerSecond} blocks/sec`);
 * ```
 */
export async function measureSyncPerformance(
  syncFn: () => Promise<void>
): Promise<SyncMetrics> {
  // Record initial state
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // Execute sync function
  await syncFn();

  // Record final state
  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  const duration = endTime - startTime;
  const memoryUsed = endMemory - startMemory;

  // Calculate metrics (defaults if no data available)
  const blocksDownloaded = 0; // Would be tracked by sync function
  const bytesTransferred = 0; // Would be tracked by sync function

  const blocksPerSecond =
    duration > 0 ? (blocksDownloaded / duration) * 1000 : 0;
  const bandwidthMBps =
    duration > 0 ? (bytesTransferred / duration / 1024 / 1024) * 1000 : 0;

  return {
    duration,
    blocksDownloaded,
    bytesTransferred,
    memoryUsed,
    blocksPerSecond,
    bandwidthMBps,
  };
}

/**
 * Create mock network with simulated conditions
 *
 * @param options - Network simulation parameters
 * @returns Network simulator object
 *
 * @example
 * ```typescript
 * const network = createMockNetwork({
 *   latency: 100,      // 100ms latency
 *   packetLoss: 5,     // 5% packet loss
 *   bandwidth: 128000  // 128 KB/s bandwidth
 * });
 *
 * // Use network simulator
 * await network.sendData(data);
 * ```
 */
export function createMockNetwork(options: NetworkSimulationOptions = {}) {
  const latency = options.latency ?? 0;
  const packetLoss = options.packetLoss ?? 0;
  const bandwidth = options.bandwidth ?? Infinity;

  return {
    /**
     * Send data with simulated network conditions
     */
    async sendData(data: Buffer): Promise<boolean> {
      // Simulate latency
      if (latency > 0) {
        await new Promise(resolve => setTimeout(resolve, latency));
      }

      // Simulate packet loss
      if (packetLoss > 0) {
        const random = Math.random() * 100;
        if (random < packetLoss) {
          return false; // Packet lost
        }
      }

      // Simulate bandwidth limit
      if (bandwidth < Infinity) {
        const transferTime = (data.length / bandwidth) * 1000; // ms
        await new Promise(resolve => setTimeout(resolve, transferTime));
      }

      return true; // Packet delivered
    },

    /**
     * Receive data with simulated network conditions
     */
    async receiveData(data: Buffer): Promise<Buffer | null> {
      const delivered = await this.sendData(data);
      return delivered ? data : null;
    },

    /**
     * Get current network statistics
     */
    getStats() {
      return {
        latency,
        packetLoss,
        bandwidth,
        bandwidthMBps: bandwidth / 1024 / 1024,
      };
    },
  };
}

/**
 * Create test peer with specific capabilities
 *
 * @param options - Peer configuration
 * @returns Mock peer object
 *
 * @example
 * ```typescript
 * const peer = createTestPeer({
 *   id: 'peer-1',
 *   hasInternet: true,
 *   hasMesh: false,
 *   reliability: 0.95
 * });
 * ```
 */
export function createTestPeer(options: {
  id: string;
  hasInternet?: boolean;
  hasMesh?: boolean;
  reliability?: number;
  latency?: number;
}) {
  return {
    id: options.id,
    hasInternet: options.hasInternet ?? true,
    hasMesh: options.hasMesh ?? false,
    reliability: options.reliability ?? 1.0,
    latency: options.latency ?? 50,
    lastSeen: Date.now(),
    version: '1.0.0',
    capabilities: {
      internet: options.hasInternet ?? true,
      mesh: options.hasMesh ?? false,
      checkpoint: true,
      incremental: true,
    },
  };
}

/**
 * Wait for condition to be met
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Check interval in milliseconds
 * @returns Promise that resolves when condition is met or rejects on timeout
 *
 * @example
 * ```typescript
 * await waitForCondition(
 *   () => blockchain.getBlocks().length > 10,
 *   5000,  // 5 second timeout
 *   100    // check every 100ms
 * );
 * ```
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Generate random UTXO transactions for testing
 *
 * @param count - Number of transactions to generate
 * @returns Array of UTXO transactions
 *
 * @example
 * ```typescript
 * const transactions = generateRandomTransactions(10);
 * expect(transactions.length).toBe(10);
 * ```
 */
export function generateRandomTransactions(count: number): UTXOTransaction[] {
  const transactions: UTXOTransaction[] = [];
  const keyPair = CryptographicService.generateKeyPair('secp256k1');

  for (let i = 0; i < count; i++) {
    transactions.push({
      id: `tx-${i}`,
      inputs: [],
      outputs: [
        {
          value: Math.floor(Math.random() * 1000) + 1,
          lockingScript: Buffer.from(keyPair.publicKey).toString('hex'),
          outputIndex: 0,
        },
      ],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1,
    });
  }

  return transactions;
}

/**
 * Compare blockchain states
 *
 * @param blockchain1 - First blockchain
 * @param blockchain2 - Second blockchain
 * @returns Comparison result
 *
 * @example
 * ```typescript
 * const result = compareBlockchainStates(chain1, chain2);
 * expect(result.identical).toBe(true);
 * ```
 */
export function compareBlockchainStates(
  blockchain1: Blockchain,
  blockchain2: Blockchain
) {
  const blocks1 = blockchain1.getBlocks();
  const blocks2 = blockchain2.getBlocks();

  const utxos1 = blockchain1.getUTXOManager().getUTXOSetSnapshot();
  const utxos2 = blockchain2.getUTXOManager().getUTXOSetSnapshot();

  return {
    identical: blocks1.length === blocks2.length && utxos1.size === utxos2.size,
    blockCountDiff: blocks1.length - blocks2.length,
    utxoCountDiff: utxos1.size - utxos2.size,
    details: {
      blockchain1: {
        blocks: blocks1.length,
        utxos: utxos1.size,
        height: blocks1.length - 1,
      },
      blockchain2: {
        blocks: blocks2.length,
        utxos: utxos2.size,
        height: blocks2.length - 1,
      },
    },
  };
}

/**
 * Calculate compression ratio
 *
 * @param originalSize - Original data size in bytes
 * @param compressedSize - Compressed data size in bytes
 * @returns Compression ratio as percentage (0-100)
 *
 * @example
 * ```typescript
 * const ratio = calculateCompressionRatio(1000, 400);
 * expect(ratio).toBe(60); // 60% compression
 * ```
 */
export function calculateCompressionRatio(
  originalSize: number,
  compressedSize: number
): number {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
}

/**
 * Format bytes to human readable string
 *
 * @param bytes - Number of bytes
 * @returns Human readable string (e.g., "1.5 MB")
 *
 * @example
 * ```typescript
 * formatBytes(1536000) // "1.46 MB"
 * formatBytes(1024) // "1.00 KB"
 * ```
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format duration to human readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Human readable string (e.g., "2m 30s")
 *
 * @example
 * ```typescript
 * formatDuration(150000) // "2m 30s"
 * formatDuration(5000) // "5s"
 * ```
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
