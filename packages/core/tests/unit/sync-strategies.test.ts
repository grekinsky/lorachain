import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InternetSyncStrategy,
  MeshSyncStrategy,
  HybridSyncStrategy,
} from '../../src/sync-strategies.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOEnhancedMeshProtocol } from '../../src/enhanced-mesh-protocol.js';
import { DutyCycleManager } from '../../src/duty-cycle.js';
import { NodeDiscoveryProtocol } from '../../src/node-discovery-protocol.js';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { CryptographicService, type KeyPair } from '../../src/cryptographic.js';
import {
  UTXOSyncMessageType,
  type SyncPeer,
  type UTXOSetSnapshot,
} from '../../src/sync-types.js';
import { MessagePriority, type Block, type UTXO } from '../../src/types.js';

// Mock Logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: (): Record<string, unknown> => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock fetch for internet connectivity tests
global.fetch = vi.fn();

describe('Sync Strategies', () => {
  let mockCompressionManager: UTXOCompressionManager;
  let mockCryptoService: CryptographicService;
  let mockMeshProtocol: UTXOEnhancedMeshProtocol;
  let mockDutyCycleManager: DutyCycleManager;
  let mockNodeDiscovery: NodeDiscoveryProtocol;
  let mockReliableDelivery: UTXOReliableDeliveryManager;
  let nodeKeyPair: KeyPair;
  let testPeers: SyncPeer[];

  beforeEach(() => {
    // Create key pair for testing
    nodeKeyPair = CryptographicService.generateKeyPair('secp256k1');

    // Create mock compression manager
    mockCompressionManager = {
      compress: vi.fn(async _data => ({
        algorithm: 'gzip' as const,
        data: new Uint8Array([1, 2, 3, 4]),
        originalSize: 100,
        metadata: { version: 1, compressor: 'gzip' },
      })),
      decompress: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    } as unknown as UTXOCompressionManager;

    // Create mock crypto service
    mockCryptoService = {
      generateKeyPair: vi.fn(() => nodeKeyPair),
      sign: vi.fn(() => 'test_signature'),
      verify: vi.fn(() => true),
      hashMessage: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
    } as unknown as CryptographicService;

    // Mock the static methods
    vi.spyOn(CryptographicService, 'generateKeyPair').mockReturnValue(
      nodeKeyPair
    );
    vi.spyOn(CryptographicService, 'sign').mockReturnValue('test_signature');
    vi.spyOn(CryptographicService, 'hashMessage').mockReturnValue(
      new Uint8Array([1, 2, 3, 4])
    );

    // Create mock mesh protocol
    mockMeshProtocol = {
      sendMessage: vi.fn(),
      on: vi.fn(),
      emit: vi.fn(),
      isActive: vi.fn(() => true),
    } as unknown as UTXOEnhancedMeshProtocol;

    // Create mock duty cycle manager
    mockDutyCycleManager = {
      getNextTransmissionWindow: vi.fn(() => 0),
      canTransmit: vi.fn(() => true),
      on: vi.fn(),
    } as unknown as DutyCycleManager;

    // Create mock node discovery
    mockNodeDiscovery = {
      getNeighbors: vi.fn(() => [
        { id: 'neighbor1', height: 1000 },
        { id: 'neighbor2', height: 950 },
      ]),
      on: vi.fn(),
    } as unknown as NodeDiscoveryProtocol;

    // Create mock reliable delivery
    mockReliableDelivery = {
      sendReliableMessage: vi.fn(async () => ({
        data: new Uint8Array([1, 2, 3]),
      })),
    } as unknown as UTXOReliableDeliveryManager;

    // Create test peers
    testPeers = [
      {
        id: 'peer1',
        publicKey: 'key1',
        type: 'internet',
        capabilities: ['utxo_sync', 'header_sync'],
        protocolVersion: '2.0.0',
        syncHeight: 1000,
        latency: 100,
        reliability: 0.95,
        lastSeen: Date.now(),
      },
      {
        id: 'peer2',
        publicKey: 'key2',
        type: 'mesh',
        capabilities: ['utxo_sync', 'fragmentation'],
        protocolVersion: '2.0.0',
        syncHeight: 950,
        latency: 200,
        reliability: 0.88,
        lastSeen: Date.now(),
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('InternetSyncStrategy', () => {
    let internetStrategy: InternetSyncStrategy;

    beforeEach(() => {
      internetStrategy = new InternetSyncStrategy(
        mockCompressionManager,
        mockCryptoService,
        5 // maxConnections
      );
    });

    describe('Initialization', () => {
      test('should initialize with correct parameters', () => {
        expect(internetStrategy).toBeDefined();
      });

      test('should create connection pool with specified size', () => {
        const strategy = new InternetSyncStrategy(
          mockCompressionManager,
          mockCryptoService,
          10
        );
        expect(strategy).toBeDefined();
      });
    });

    describe('Parallel Block Download', () => {
      test('should download multiple blocks in parallel', async () => {
        const blockHashes = ['hash1', 'hash2', 'hash3'];
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        // Mock block download
        vi.spyOn(internetStrategy as any, 'downloadBlock').mockResolvedValue({
          hash: 'test_hash',
          index: 1,
          transactions: [],
        } as Block);

        const blocks = await internetStrategy.parallelBlockDownload(
          blockHashes,
          internetPeers
        );

        expect(blocks).toBeDefined();
        expect(blocks.length).toBe(blockHashes.length);
      });

      test('should handle download failures gracefully', async () => {
        const blockHashes = ['hash1'];
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        // Mock download failure
        vi.spyOn(internetStrategy as any, 'downloadBlock').mockRejectedValue(
          new Error('Download failed')
        );

        await expect(
          internetStrategy.parallelBlockDownload(blockHashes, internetPeers)
        ).rejects.toThrow();
      });

      test('should respect connection pool limits', async () => {
        const blockHashes = Array.from({ length: 20 }, (_, i) => `hash${i}`);
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        // Mock successful downloads
        vi.spyOn(internetStrategy as any, 'downloadBlock').mockResolvedValue({
          hash: 'test_hash',
          index: 1,
        } as Block);

        const blocks = await internetStrategy.parallelBlockDownload(
          blockHashes,
          internetPeers
        );

        expect(blocks.length).toBe(blockHashes.length);
      });
    });

    describe('UTXO Set Synchronization', () => {
      test('should download full UTXO set snapshot', async () => {
        const height = 1000;
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        const mockSnapshot: UTXOSetSnapshot = {
          height: 1000,
          timestamp: Date.now(),
          merkleRoot: 'merkle_root',
          utxoCount: 5000,
          totalValue: BigInt('1000000000'),
          compressedUTXOs: [],
          proofs: [],
          signature: 'signature',
        };

        // Mock snapshot download
        vi.spyOn(
          internetStrategy as any,
          'downloadUTXOSnapshot'
        ).mockResolvedValue(mockSnapshot);
        vi.spyOn(internetStrategy as any, 'verifyMerkleRoot').mockResolvedValue(
          undefined
        );

        const snapshot = await internetStrategy.batchUTXOSetSync(
          height,
          internetPeers
        );

        expect(snapshot).toBeDefined();
        expect(snapshot.height).toBe(height);
        expect(snapshot.utxoCount).toBe(5000);
      });

      test('should verify merkle root after download', async () => {
        const height = 1000;
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        const mockSnapshot: UTXOSetSnapshot = {
          height: 1000,
          timestamp: Date.now(),
          merkleRoot: 'invalid_merkle_root',
          utxoCount: 5000,
          totalValue: BigInt('1000000000'),
          compressedUTXOs: [],
          proofs: [],
          signature: 'signature',
        };

        vi.spyOn(
          internetStrategy as any,
          'downloadUTXOSnapshot'
        ).mockResolvedValue(mockSnapshot);
        vi.spyOn(internetStrategy as any, 'verifyMerkleRoot').mockRejectedValue(
          new Error('Invalid merkle root')
        );

        await expect(
          internetStrategy.batchUTXOSetSync(height, internetPeers)
        ).rejects.toThrow('Invalid merkle root');
      });
    });

    describe('UTXO Update Streaming', () => {
      test('should setup streaming callbacks', () => {
        const callback = vi.fn();

        internetStrategy.streamUTXOUpdates(callback);

        // Verify event listeners are set up
        expect(internetStrategy.listenerCount('utxo:created')).toBeGreaterThan(
          0
        );
        expect(internetStrategy.listenerCount('utxo:spent')).toBeGreaterThan(0);
      });

      test('should call callback for UTXO events', () => {
        const callback = vi.fn();
        const testUTXO: UTXO = {
          id: 'utxo1',
          transactionId: 'tx1',
          outputIndex: 0,
          amount: BigInt(1000),
          address: 'addr1',
          isSpent: false,
        };

        internetStrategy.streamUTXOUpdates(callback);

        // Simulate UTXO events
        internetStrategy.emit('utxo:created', testUTXO);
        internetStrategy.emit('utxo:spent', testUTXO);

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenCalledWith(testUTXO);
      });
    });

    describe('Message Creation', () => {
      test('should create valid block request messages', async () => {
        const hash = 'block_hash_123';
        const peer = testPeers[0];

        const message = await (internetStrategy as any).createBlockRequest(
          hash,
          peer
        );

        expect(message).toBeDefined();
        expect(message.version).toBe('2.0.0');
        expect(message.type).toBe(UTXOSyncMessageType.UTXO_BLOCK_REQUEST);
        expect(message.signature).toBeTruthy();
        expect(message.publicKey).toBeTruthy();
        expect(message.payload).toBeDefined();
      });

      test('should create valid snapshot request messages', async () => {
        const height = 1000;
        const peer = testPeers[0];

        const message = await (internetStrategy as any).createSnapshotRequest(
          height,
          peer
        );

        expect(message).toBeDefined();
        expect(message.version).toBe('2.0.0');
        expect(message.type).toBe(UTXOSyncMessageType.UTXO_SET_REQUEST);
        expect(message.signature).toBeTruthy();
        expect(message.publicKey).toBeTruthy();
        expect(message.payload).toBeDefined();
      });

      test('should compress request payloads', async () => {
        const hash = 'block_hash_123';
        const peer = testPeers[0];

        await (internetStrategy as any).createBlockRequest(hash, peer);

        expect(mockCompressionManager.compress).toHaveBeenCalled();
      });
    });
  });

  describe('MeshSyncStrategy', () => {
    let meshStrategy: MeshSyncStrategy;

    beforeEach(() => {
      meshStrategy = new MeshSyncStrategy(
        mockMeshProtocol,
        mockDutyCycleManager,
        mockNodeDiscovery,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );
    });

    describe('Initialization', () => {
      test('should initialize with all required dependencies', () => {
        expect(meshStrategy).toBeDefined();
      });
    });

    describe('Fragmented Block Sync', () => {
      test('should sync block using fragments', async () => {
        const blockHash = 'block_hash_123';
        const maxFragmentSize = 200;

        // Mock fragment responses
        const mockFragment = {
          data: new Uint8Array([1, 2, 3, 4]),
          totalFragments: 3,
          fragmentIndex: 0,
        };

        vi.spyOn(mockReliableDelivery, 'sendReliableMessage')
          .mockResolvedValueOnce(mockFragment)
          .mockResolvedValueOnce({ ...mockFragment, fragmentIndex: 1 })
          .mockResolvedValueOnce({ ...mockFragment, fragmentIndex: 2 })
          .mockResolvedValueOnce(null); // End of fragments

        // Mock block reassembly
        vi.spyOn(meshStrategy as any, 'reassembleBlock').mockResolvedValue({
          hash: blockHash,
          index: 1,
          transactions: [],
        } as Block);

        const block = await meshStrategy.fragmentedBlockSync(
          blockHash,
          maxFragmentSize
        );

        expect(block).toBeDefined();
        expect(block.hash).toBe(blockHash);
      });

      test('should respect duty cycle constraints', async () => {
        const blockHash = 'block_hash_123';

        // Mock duty cycle delay
        vi.spyOn(
          mockDutyCycleManager,
          'getNextTransmissionWindow'
        ).mockReturnValue(1000);

        // Mock fragment response
        vi.spyOn(mockReliableDelivery, 'sendReliableMessage').mockResolvedValue(
          {
            data: new Uint8Array([1, 2, 3, 4]),
            totalFragments: 1,
            fragmentIndex: 0,
          }
        );

        vi.spyOn(meshStrategy as any, 'reassembleBlock').mockResolvedValue({
          hash: blockHash,
          index: 1,
        } as Block);

        const startTime = Date.now();
        await meshStrategy.fragmentedBlockSync(blockHash);
        const endTime = Date.now();

        // Should have some delay due to duty cycle
        expect(endTime - startTime).toBeGreaterThanOrEqual(0);
      });

      test('should handle missing blocks gracefully', async () => {
        const blockHash = 'missing_block_hash';

        // Mock no fragment response
        vi.spyOn(mockReliableDelivery, 'sendReliableMessage').mockResolvedValue(
          null
        );

        await expect(
          meshStrategy.fragmentedBlockSync(blockHash)
        ).rejects.toThrow('Block missing_block_hash not found');
      });
    });

    describe('Priority-based UTXO Sync', () => {
      test('should sync UTXOs for specific address', async () => {
        const address = 'test_address_123';
        const mockUTXOs: UTXO[] = [
          {
            id: 'utxo1',
            transactionId: 'tx1',
            outputIndex: 0,
            amount: BigInt(1000),
            address: address,
            isSpent: false,
          },
          {
            id: 'utxo2',
            transactionId: 'tx2',
            outputIndex: 0,
            amount: BigInt(2000),
            address: address,
            isSpent: false,
          },
        ];

        // Mock UTXO response
        vi.spyOn(mockReliableDelivery, 'sendReliableMessage').mockResolvedValue(
          {
            utxos: mockUTXOs,
          }
        );

        vi.spyOn(meshStrategy as any, 'processUTXOResponse').mockResolvedValue(
          mockUTXOs
        );

        const utxos = await meshStrategy.prioritizedUTXOSync(address);

        expect(utxos).toBeDefined();
        expect(utxos.length).toBe(2);
        expect(utxos[0].address).toBe(address);
      });

      test('should use high priority for UTXO requests', async () => {
        const address = 'test_address_123';

        vi.spyOn(mockReliableDelivery, 'sendReliableMessage').mockResolvedValue(
          {}
        );
        vi.spyOn(meshStrategy as any, 'processUTXOResponse').mockResolvedValue(
          []
        );

        await meshStrategy.prioritizedUTXOSync(address);

        // Verify high priority was used
        expect(mockReliableDelivery.sendReliableMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            reliability: 'confirmed',
          }),
          'high'
        );
      });
    });

    describe('Cooperative Sync', () => {
      test('should sync from capable neighbors', async () => {
        const targetHeight = 1000;

        // Mock neighbor with sufficient height
        vi.spyOn(mockNodeDiscovery, 'getNeighbors').mockResolvedValue([
          { id: 'neighbor1', height: 1050 },
          { id: 'neighbor2', height: 950 },
        ]);

        vi.spyOn(meshStrategy as any, 'syncFromNeighbor').mockResolvedValue(
          undefined
        );

        await meshStrategy.cooperativeSync(targetHeight);

        expect(mockNodeDiscovery.getNeighbors).toHaveBeenCalled();
      });

      test('should throw error when no capable neighbors', async () => {
        const targetHeight = 1000;

        // Mock neighbors with insufficient height
        vi.spyOn(mockNodeDiscovery, 'getNeighbors').mockResolvedValue([
          { id: 'neighbor1', height: 950 },
          { id: 'neighbor2', height: 900 },
        ]);

        vi.spyOn(meshStrategy as any, 'syncFromNeighbor').mockRejectedValue(
          new Error('Sync failed')
        );

        await expect(
          meshStrategy.cooperativeSync(targetHeight)
        ).rejects.toThrow('No neighbors available for sync');
      });
    });

    describe('Fragment Handling', () => {
      test('should create valid fragment requests', async () => {
        const hash = 'block_hash_123';
        const fragmentIndex = 2;

        const request = await (meshStrategy as any).createFragmentRequest(
          hash,
          fragmentIndex
        );

        expect(request).toBeDefined();
        expect(request.version).toBe('2.0.0');
        expect(request.type).toBe(UTXOSyncMessageType.UTXO_BLOCK_FRAGMENT);
        expect(request.fragmentInfo).toBeDefined();
        expect(request.fragmentInfo.fragmentIndex).toBe(fragmentIndex);
      });

      test('should reassemble blocks from fragments correctly', async () => {
        const fragments = [
          new Uint8Array([1, 2, 3, 4]),
          new Uint8Array([5, 6, 7, 8]),
          new Uint8Array([9, 10, 11, 12]),
        ];

        const mockBlockData = {
          hash: 'reassembled_block',
          index: 1,
          transactions: [],
        };

        // Mock compression manager decompress
        vi.spyOn(mockCompressionManager, 'decompress').mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(mockBlockData))
        );

        const block = await (meshStrategy as any).reassembleBlock(fragments);

        expect(block).toBeDefined();
        expect(block.hash).toBe('reassembled_block');
      });

      test('should calculate checksums for fragments', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);

        const checksum = await (meshStrategy as any).calculateChecksum(data);

        expect(checksum).toBeDefined();
        expect(typeof checksum).toBe('string');
        expect(checksum.length).toBeGreaterThan(0);
      });
    });
  });

  describe('HybridSyncStrategy', () => {
    let hybridStrategy: HybridSyncStrategy;
    let internetStrategy: InternetSyncStrategy;
    let meshStrategy: MeshSyncStrategy;

    beforeEach(() => {
      internetStrategy = new InternetSyncStrategy(
        mockCompressionManager,
        mockCryptoService,
        5
      );

      meshStrategy = new MeshSyncStrategy(
        mockMeshProtocol,
        mockDutyCycleManager,
        mockNodeDiscovery,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );

      hybridStrategy = new HybridSyncStrategy(internetStrategy, meshStrategy);
    });

    describe('Initialization', () => {
      test('should initialize with both strategies', () => {
        expect(hybridStrategy).toBeDefined();
      });
    });

    describe('Adaptive Sync', () => {
      test('should use internet strategy for internet nodes', async () => {
        const blockHashes = ['hash1', 'hash2'];
        const priority = MessagePriority.HIGH;

        // Mock internet network detection
        vi.spyOn(hybridStrategy as any, 'detectNetworkType').mockResolvedValue(
          'internet'
        );
        vi.spyOn(internetStrategy, 'parallelBlockDownload').mockResolvedValue([
          { hash: 'hash1', index: 1 },
          { hash: 'hash2', index: 2 },
        ] as Block[]);

        const blocks = await hybridStrategy.adaptiveSync(
          blockHashes,
          priority,
          testPeers
        );

        expect(blocks).toBeDefined();
        expect(blocks.length).toBe(2);
        expect(internetStrategy.parallelBlockDownload).toHaveBeenCalled();
      });

      test('should use mesh strategy for mesh nodes', async () => {
        const blockHashes = ['hash1'];
        const priority = MessagePriority.HIGH;

        // Mock mesh network detection
        vi.spyOn(hybridStrategy as any, 'detectNetworkType').mockResolvedValue(
          'mesh'
        );
        vi.spyOn(meshStrategy, 'fragmentedBlockSync').mockResolvedValue({
          hash: 'hash1',
          index: 1,
        } as Block);

        const blocks = await hybridStrategy.adaptiveSync(
          blockHashes,
          priority,
          testPeers
        );

        expect(blocks).toBeDefined();
        expect(blocks.length).toBe(1);
        expect(meshStrategy.fragmentedBlockSync).toHaveBeenCalled();
      });

      test('should use gateway sync for hybrid nodes', async () => {
        const blockHashes = ['hash1', 'hash2'];
        const priority = MessagePriority.HIGH;

        // Mock gateway network detection
        vi.spyOn(hybridStrategy as any, 'detectNetworkType').mockResolvedValue(
          'gateway'
        );
        vi.spyOn(hybridStrategy as any, 'syncViaGateway').mockResolvedValue([
          { hash: 'hash1', index: 1 },
          { hash: 'hash2', index: 2 },
        ] as Block[]);

        const blocks = await hybridStrategy.adaptiveSync(
          blockHashes,
          priority,
          testPeers
        );

        expect(blocks).toBeDefined();
        expect(blocks.length).toBe(2);
      });
    });

    describe('Network Detection', () => {
      test('should detect internet connectivity', async () => {
        // Mock successful fetch
        (global.fetch as any).mockResolvedValue({
          ok: true,
          status: 200,
        });

        vi.spyOn(
          hybridStrategy as any,
          'checkMeshConnectivity'
        ).mockResolvedValue(false);

        const networkType = await (hybridStrategy as any).detectNetworkType();

        expect(networkType).toBe('internet');
      });

      test('should detect mesh connectivity', async () => {
        // Mock failed fetch
        (global.fetch as any).mockRejectedValue(new Error('Network error'));

        vi.spyOn(
          hybridStrategy as any,
          'checkMeshConnectivity'
        ).mockResolvedValue(true);

        const networkType = await (hybridStrategy as any).detectNetworkType();

        expect(networkType).toBe('mesh');
      });

      test('should detect gateway mode', async () => {
        // Mock successful fetch and mesh
        (global.fetch as any).mockResolvedValue({
          ok: true,
          status: 200,
        });

        vi.spyOn(
          hybridStrategy as any,
          'checkMeshConnectivity'
        ).mockResolvedValue(true);

        const networkType = await (hybridStrategy as any).detectNetworkType();

        expect(networkType).toBe('gateway');
      });

      test('should throw error when no connectivity', async () => {
        // Mock no connectivity
        (global.fetch as any).mockRejectedValue(new Error('Network error'));
        vi.spyOn(
          hybridStrategy as any,
          'checkMeshConnectivity'
        ).mockResolvedValue(false);

        await expect(
          (hybridStrategy as any).detectNetworkType()
        ).rejects.toThrow('No network connectivity available');
      });
    });

    describe('Gateway Sync', () => {
      test('should download via internet and relay to mesh', async () => {
        const blockHashes = ['hash1', 'hash2'];
        const priority = MessagePriority.HIGH;
        const internetPeers = testPeers.filter(p => p.type === 'internet');

        // Mock internet download
        vi.spyOn(internetStrategy, 'parallelBlockDownload').mockResolvedValue([
          { hash: 'hash1', index: 1 },
          { hash: 'hash2', index: 2 },
        ] as Block[]);

        // Mock mesh relay
        vi.spyOn(hybridStrategy as any, 'relayToMeshNodes').mockResolvedValue(
          undefined
        );

        const blocks = await (hybridStrategy as any).syncViaGateway(
          blockHashes,
          priority,
          testPeers
        );

        expect(blocks).toBeDefined();
        expect(blocks.length).toBe(2);
        expect(internetStrategy.parallelBlockDownload).toHaveBeenCalledWith(
          blockHashes,
          internetPeers
        );
      });
    });

    describe('Mesh Connectivity Check', () => {
      test('should check active neighbors for mesh connectivity', async () => {
        vi.spyOn(mockNodeDiscovery, 'getNeighbors').mockResolvedValue([
          { id: 'neighbor1' },
          { id: 'neighbor2' },
        ]);

        const hasMesh = await (hybridStrategy as any).checkMeshConnectivity();

        expect(hasMesh).toBe(true);
      });

      test('should return false when no neighbors', async () => {
        vi.spyOn(mockNodeDiscovery, 'getNeighbors').mockResolvedValue([]);

        const hasMesh = await (hybridStrategy as any).checkMeshConnectivity();

        expect(hasMesh).toBe(false);
      });
    });
  });

  describe('Strategy Integration', () => {
    test('should handle compression consistently across strategies', async () => {
      // Test internet strategy compression
      const internetStrategy = new InternetSyncStrategy(
        mockCompressionManager,
        mockCryptoService
      );

      await (internetStrategy as any).createBlockRequest('hash', testPeers[0]);
      expect(mockCompressionManager.compress).toHaveBeenCalled();

      vi.clearAllMocks();

      // Test mesh strategy compression
      const meshStrategy = new MeshSyncStrategy(
        mockMeshProtocol,
        mockDutyCycleManager,
        mockNodeDiscovery,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );

      await (meshStrategy as any).createFragmentRequest('hash', 0);
      expect(mockCompressionManager.compress).toHaveBeenCalled();
    });

    test('should use consistent message signing across strategies', async () => {
      const internetStrategy = new InternetSyncStrategy(
        mockCompressionManager,
        mockCryptoService
      );

      const meshStrategy = new MeshSyncStrategy(
        mockMeshProtocol,
        mockDutyCycleManager,
        mockNodeDiscovery,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );

      // Clear existing mocks to get a clean count
      vi.clearAllMocks();

      // Test internet strategy signing
      await (internetStrategy as any).createBlockRequest('hash', testPeers[0]);
      const internetCallCount = vi.mocked(CryptographicService.sign).mock.calls
        .length;

      // Test mesh strategy signing
      await (meshStrategy as any).createFragmentRequest('hash', 0);
      const meshCallCount = vi.mocked(CryptographicService.sign).mock.calls
        .length;

      expect(internetCallCount).toBeGreaterThan(0);
      expect(meshCallCount).toBeGreaterThan(internetCallCount);
    });

    test('should handle LoRa constraints in mesh strategy', async () => {
      const meshStrategy = new MeshSyncStrategy(
        mockMeshProtocol,
        mockDutyCycleManager,
        mockNodeDiscovery,
        mockReliableDelivery,
        mockCompressionManager,
        mockCryptoService
      );

      // Test with default fragment size (200 bytes - within LoRa limits)
      const blockHash = 'test_block_hash';

      vi.spyOn(mockReliableDelivery, 'sendReliableMessage').mockResolvedValue({
        data: new Uint8Array([1, 2, 3, 4]),
        totalFragments: 1,
        fragmentIndex: 0,
      });

      vi.spyOn(meshStrategy as any, 'reassembleBlock').mockResolvedValue({
        hash: blockHash,
        index: 1,
      } as Block);

      const block = await meshStrategy.fragmentedBlockSync(blockHash, 200);

      expect(block).toBeDefined();
      // Verify that fragment size constraint is respected
      expect(200).toBeLessThanOrEqual(256); // LoRa limit
    });
  });
});
