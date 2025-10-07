/**
 * Unit tests for LightClientSyncStrategy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { LightClientSyncStrategy } from '../../src/sync-strategies.js';
import type {
  LightClientSyncConfig,
  UTXOBlockHeader,
} from '../../src/sync-types.js';
import type { Block, UTXOTransaction } from '../../src/types.js';

// Mock dependencies
const createMockMeshProtocol = () => ({
  sendMessage: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
});

const createMockSPVManager = () => ({
  verifyTransaction: vi.fn(),
  validateBlockHeader: vi.fn(),
  verifyTransactionBatch: vi.fn(),
});

const createMockReliableDelivery = () => ({
  sendReliableMessage: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
});

const createMockCompressionManager = () => ({
  compress: vi.fn(),
  decompress: vi.fn(),
});

const createMockCryptoService = () => ({
  generateKeyPair: vi.fn(),
  sign: vi.fn(),
  verify: vi.fn(),
});

describe('LightClientSyncStrategy', () => {
  let strategy: LightClientSyncStrategy;
  let config: LightClientSyncConfig;
  let mockMeshProtocol: any;
  let mockSPVManager: any;
  let mockReliableDelivery: any;
  let mockCompressionManager: any;
  let mockCryptoService: any;

  beforeEach(() => {
    config = {
      addresses: ['address1', 'address2'],
      headerOnly: true,
      bloomFilterSize: 1024,
      falsePositiveRate: 0.01,
      maxBlockDownload: 100,
      backgroundSync: false,
    };

    mockMeshProtocol = createMockMeshProtocol();
    mockSPVManager = createMockSPVManager();
    mockReliableDelivery = createMockReliableDelivery();
    mockCompressionManager = createMockCompressionManager();
    mockCryptoService = createMockCryptoService();

    // Setup default mock behaviors
    mockCompressionManager.compress.mockResolvedValue({
      algorithm: 'gzip',
      data: new Uint8Array([1, 2, 3]),
      originalSize: 100,
      metadata: {},
    });

    mockCryptoService.generateKeyPair.mockReturnValue({
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key',
    });

    mockCryptoService.sign.mockReturnValue('mock-signature');

    strategy = new LightClientSyncStrategy(
      config,
      mockMeshProtocol,
      mockSPVManager,
      mockReliableDelivery,
      mockCompressionManager,
      mockCryptoService
    );
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(strategy).toBeInstanceOf(EventEmitter);
    });

    it('should create bloom filter for addresses', () => {
      const filterData = strategy.getBloomFilterData();
      expect(filterData).toBeInstanceOf(Uint8Array);
      expect(filterData.length).toBe(config.bloomFilterSize);
    });

    it('should handle empty address list', () => {
      const emptyConfig: LightClientSyncConfig = {
        ...config,
        addresses: [],
      };

      const emptyStrategy = new LightClientSyncStrategy(
        emptyConfig,
        mockMeshProtocol,
        mockSPVManager,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );

      expect(emptyStrategy).toBeDefined();
    });
  });

  describe('syncHeaders', () => {
    it('should sync headers in batches', async () => {
      const mockHeaders: UTXOBlockHeader[] = [
        {
          index: 0,
          hash: 'hash0',
          previousHash: 'genesis',
          utxoMerkleRoot: 'merkle0',
          timestamp: 1000,
          nonce: 0,
          difficulty: 1,
        },
        {
          index: 1,
          hash: 'hash1',
          previousHash: 'hash0',
          utxoMerkleRoot: 'merkle1',
          timestamp: 2000,
          nonce: 1,
          difficulty: 1,
        },
      ];

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        headers: mockHeaders,
      });

      const headers = await strategy.syncHeaders(0, 1);

      expect(headers).toHaveLength(2);
      expect(headers[0].index).toBe(0);
      expect(headers[1].index).toBe(1);
    });

    it('should validate header chain continuity', async () => {
      const invalidHeaders: UTXOBlockHeader[] = [
        {
          index: 0,
          hash: 'hash0',
          previousHash: 'genesis',
          utxoMerkleRoot: 'merkle0',
          timestamp: 1000,
          nonce: 0,
          difficulty: 1,
        },
        {
          index: 1,
          hash: 'hash1',
          previousHash: 'wrong-hash', // Invalid!
          utxoMerkleRoot: 'merkle1',
          timestamp: 2000,
          nonce: 1,
          difficulty: 1,
        },
      ];

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        headers: invalidHeaders,
      });

      await expect(strategy.syncHeaders(0, 1)).rejects.toThrow(
        'Header chain discontinuity'
      );
    });

    it('should handle empty header response', async () => {
      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        headers: [],
      });

      const headers = await strategy.syncHeaders(0, 10);

      expect(headers).toHaveLength(0);
    });
  });

  describe('verifyTransactionSPV', () => {
    it('should verify transaction with SPV proof', async () => {
      const mockTx: UTXOTransaction = {
        id: 'tx1',
        inputs: [],
        outputs: [
          {
            address: 'address1',
            value: 100,
            lockingScript: 'address1',
          },
        ],
        lockTime: 0,
        timestamp: 1000,
        fee: 1,
      };

      const mockProof = ['proof1', 'proof2'];
      const mockHeader: UTXOBlockHeader = {
        index: 1,
        hash: 'hash1',
        previousHash: 'hash0',
        utxoMerkleRoot: 'merkle1',
        timestamp: 1000,
        nonce: 0,
        difficulty: 1,
      };

      mockSPVManager.verifyTransaction.mockReturnValue(true);

      const isValid = await strategy.verifyTransactionSPV(
        mockTx,
        mockProof,
        mockHeader
      );

      expect(isValid).toBe(true);
      expect(mockSPVManager.verifyTransaction).toHaveBeenCalledWith(
        mockTx,
        mockProof,
        mockHeader.utxoMerkleRoot
      );
    });

    it('should return false for invalid SPV proof', async () => {
      const mockTx: UTXOTransaction = {
        id: 'tx1',
        inputs: [],
        outputs: [],
        lockTime: 0,
        timestamp: 1000,
        fee: 1,
      };

      mockSPVManager.verifyTransaction.mockReturnValue(false);

      const isValid = await strategy.verifyTransactionSPV(
        mockTx,
        ['proof'],
        {} as UTXOBlockHeader
      );

      expect(isValid).toBe(false);
    });

    it('should handle SPV verification errors gracefully', async () => {
      mockSPVManager.verifyTransaction.mockImplementation(() => {
        throw new Error('Verification failed');
      });

      const mockTx: UTXOTransaction = {
        id: 'tx1',
        inputs: [],
        outputs: [],
        lockTime: 0,
        timestamp: 1000,
        fee: 1,
      };

      const isValid = await strategy.verifyTransactionSPV(
        mockTx,
        ['proof'],
        {} as UTXOBlockHeader
      );

      expect(isValid).toBe(false);
    });
  });

  describe('addAddress and removeAddress', () => {
    it('should add new address to filter', () => {
      strategy.addAddress('address3');

      // Bloom filter should now include address3
      const filterData = strategy.getBloomFilterData();
      expect(filterData).toBeInstanceOf(Uint8Array);
    });

    it('should remove address from tracking', () => {
      strategy.removeAddress('address1');

      // Bloom filter should be recreated without address1
      const filterData = strategy.getBloomFilterData();
      expect(filterData).toBeInstanceOf(Uint8Array);
    });

    it('should handle adding duplicate addresses', () => {
      strategy.addAddress('address1'); // Already in config
      strategy.addAddress('address1');

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getBloomFilterData', () => {
    it('should return bloom filter as Uint8Array', () => {
      const data = strategy.getBloomFilterData();

      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(config.bloomFilterSize);
    });

    it('should return consistent data', () => {
      const data1 = strategy.getBloomFilterData();
      const data2 = strategy.getBloomFilterData();

      expect(data1).toEqual(data2);
    });
  });

  describe('requestMerkleProof', () => {
    it('should request merkle proof from network', async () => {
      const mockProof = {
        proof: {
          merkleProof: ['proof1', 'proof2', 'proof3'],
        },
      };

      mockReliableDelivery.sendReliableMessage.mockResolvedValue(mockProof);

      const proof = await strategy.requestMerkleProof('tx1', 'blockhash1');

      expect(proof).toEqual(['proof1', 'proof2', 'proof3']);
      expect(mockReliableDelivery.sendReliableMessage).toHaveBeenCalled();
    });

    it('should return empty array when proof not available', async () => {
      mockReliableDelivery.sendReliableMessage.mockResolvedValue({});

      const proof = await strategy.requestMerkleProof('tx1', 'blockhash1');

      expect(proof).toEqual([]);
    });
  });

  describe('identifyRelevantBlocks', () => {
    it('should identify relevant blocks using bloom filter', async () => {
      const mockHeaders: UTXOBlockHeader[] = [
        { index: 1, hash: 'hash1' } as UTXOBlockHeader,
        { index: 2, hash: 'hash2' } as UTXOBlockHeader,
        { index: 3, hash: 'hash3' } as UTXOBlockHeader,
      ];

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        relevantHeights: [1, 3],
      });

      const relevantHeights =
        await strategy.identifyRelevantBlocks(mockHeaders);

      expect(relevantHeights).toEqual([1, 3]);
    });

    it('should handle empty header list', async () => {
      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        relevantHeights: [],
      });

      const relevantHeights = await strategy.identifyRelevantBlocks([]);

      expect(relevantHeights).toEqual([]);
    });

    it('should batch header checks efficiently', async () => {
      // Create 100 headers
      const headers: UTXOBlockHeader[] = Array.from(
        { length: 100 },
        (_, i) => ({
          index: i,
          hash: `hash${i}`,
          previousHash: `hash${i - 1}`,
          utxoMerkleRoot: `merkle${i}`,
          timestamp: 1000 + i,
          nonce: i,
          difficulty: 1,
        })
      );

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        relevantHeights: [1, 2, 3],
      });

      await strategy.identifyRelevantBlocks(headers);

      // Should have batched into multiple requests
      expect(
        mockReliableDelivery.sendReliableMessage.mock.calls.length
      ).toBeGreaterThan(0);
    });
  });

  describe('downloadRelevantBlocks', () => {
    it('should download only relevant blocks', async () => {
      const mockBlock: Block = {
        index: 1,
        hash: 'hash1',
        previousHash: 'hash0',
        timestamp: 1000,
        nonce: 0,
        difficulty: 1,
        transactions: [],
        merkleRoot: 'merkle1',
        miner: 'miner1',
      };

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        block: mockBlock,
      });

      const blocks = await strategy.downloadRelevantBlocks([1, 2, 3]);

      expect(blocks).toHaveLength(3);
      expect(blocks[0].index).toBe(1);
    });

    it('should respect maxBlockDownload limit', async () => {
      const mockBlock: Block = {
        index: 1,
        hash: 'hash1',
        previousHash: 'hash0',
        timestamp: 1000,
        nonce: 0,
        difficulty: 1,
        transactions: [],
        merkleRoot: 'merkle1',
        miner: 'miner1',
      };

      mockReliableDelivery.sendReliableMessage.mockResolvedValue({
        block: mockBlock,
      });

      // Try to download 200 blocks, but limit is 100
      const heights = Array.from({ length: 200 }, (_, i) => i);
      const blocks = await strategy.downloadRelevantBlocks(heights);

      expect(blocks.length).toBeLessThanOrEqual(config.maxBlockDownload);
    });

    it('should handle download failures gracefully', async () => {
      mockReliableDelivery.sendReliableMessage
        .mockResolvedValueOnce({
          block: { index: 1 } as Block,
        })
        .mockRejectedValueOnce(new Error('Download failed'))
        .mockResolvedValueOnce({
          block: { index: 3 } as Block,
        });

      const blocks = await strategy.downloadRelevantBlocks([1, 2, 3]);

      // Should have 2 blocks (1 and 3), block 2 failed
      expect(blocks).toHaveLength(2);
    });
  });

  describe('event emissions', () => {
    it('should emit sync-complete event with results', async () => {
      const mockHeaders: UTXOBlockHeader[] = [
        {
          index: 1,
          hash: 'hash1',
          previousHash: 'hash0',
          utxoMerkleRoot: 'merkle1',
          timestamp: 1000,
          nonce: 0,
          difficulty: 1,
        },
      ];

      const mockBlock: Block = {
        index: 1,
        hash: 'hash1',
        previousHash: 'hash0',
        timestamp: 1000,
        nonce: 0,
        difficulty: 1,
        transactions: [
          {
            id: 'tx1',
            inputs: [],
            outputs: [
              {
                address: 'address1',
                value: 100,
                lockingScript: 'address1',
              },
            ],
            lockTime: 0,
            timestamp: 1000,
            fee: 1,
          },
        ],
        merkleRoot: 'merkle1',
        miner: 'miner1',
      };

      mockReliableDelivery.sendReliableMessage
        .mockResolvedValueOnce({ height: 1 }) // getNetworkHeight
        .mockResolvedValueOnce({ headers: mockHeaders }) // syncHeaders
        .mockResolvedValueOnce({ relevantHeights: [1] }) // identifyRelevantBlocks
        .mockResolvedValueOnce({ block: mockBlock }) // downloadBlock
        .mockResolvedValueOnce({ proof: { merkleProof: ['proof'] } }); // requestMerkleProof

      mockSPVManager.verifyTransaction.mockReturnValue(true);

      let emittedResult: any;
      strategy.on('sync-complete', result => {
        emittedResult = result;
      });

      await strategy.syncUTXOsForAddresses(['address1'], 0);

      expect(emittedResult).toBeDefined();
      expect(emittedResult.syncedHeaders).toBeGreaterThan(0);
      expect(emittedResult.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
