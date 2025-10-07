/**
 * UTXO Synchronization Strategies
 *
 * Different synchronization strategies optimized for network types:
 * - Internet: High bandwidth, parallel operations
 * - Mesh: Constrained bandwidth, fragmented operations
 * - Hybrid: Adaptive strategy combining both
 */

import { EventEmitter } from 'events';
import { UTXOCompressionManager } from './utxo-compression-manager.js';
import { UTXOEnhancedMeshProtocol } from './enhanced-mesh-protocol.js';
import { DutyCycleManager } from './duty-cycle.js';
import { NodeDiscoveryProtocol } from './node-discovery-protocol.js';
import { UTXOReliableDeliveryManager } from './utxo-reliable-delivery-manager.js';
import { CryptographicService } from './cryptographic.js';
import { Logger } from '@lorachain/shared';

import type { Block, UTXO, UTXOTransaction } from './types.js';
import type { MessagePriority } from './types.js';
import type { CompressionAlgorithm } from './compression-types.js';
import {
  UTXOSetSnapshot,
  UTXOSyncMessage,
  UTXOSyncMessageType,
  SyncPeer,
  FragmentInfo,
  CompressedPayload,
  UTXOBlockHeader,
  LightClientSyncConfig,
  LightClientSyncResult,
  SyncHeaderResponse,
  SyncBlockResponse,
  SyncMerkleProofResponse,
  SyncBloomFilterCheckResponse,
  SyncStatusResponse,
  SPVManagerVerifiable,
} from './sync-types.js';
import { BloomFilter } from './bloom-filter.js';
import { SPVManager } from './merkle/SPVManager.js';

/**
 * Connection pool for parallel downloads
 */
class ConnectionPool {
  private maxConnections: number;
  private activeConnections = 0;
  private queue: Array<() => Promise<any>> = [];
  private logger: Logger;

  constructor(maxConnections: number) {
    this.maxConnections = maxConnections;
    this.logger = Logger.getInstance();
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          this.activeConnections++;
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeConnections--;
          this.processQueue();
        }
      };

      if (this.activeConnections < this.maxConnections) {
        wrappedTask();
      } else {
        this.queue.push(wrappedTask);
      }
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeConnections < this.maxConnections) {
      const task = this.queue.shift();
      if (task) {
        task();
      }
    }
  }
}

/**
 * Internet synchronization strategy for high-bandwidth nodes
 */
export class InternetSyncStrategy extends EventEmitter {
  private compressionManager: UTXOCompressionManager;
  private cryptoService: CryptographicService;
  private logger: Logger;
  private connectionPool: ConnectionPool;

  constructor(
    compressionManager: UTXOCompressionManager,
    cryptoService: CryptographicService,
    maxConnections: number = 10
  ) {
    super();

    this.compressionManager = compressionManager;
    this.cryptoService = cryptoService;
    this.logger = Logger.getInstance();
    this.connectionPool = new ConnectionPool(maxConnections);
  }

  /**
   * Parallel block download with connection pooling
   */
  async parallelBlockDownload(
    hashes: string[],
    peers: SyncPeer[]
  ): Promise<Block[]> {
    this.logger.info(`Starting parallel download of ${hashes.length} blocks`);

    const downloads = hashes.map(hash =>
      this.connectionPool.execute(() => this.downloadBlock(hash, peers))
    );

    const blocks = await Promise.all(downloads);

    this.logger.info(`Downloaded ${blocks.length} blocks successfully`);
    return blocks;
  }

  /**
   * Batch UTXO set synchronization
   */
  async batchUTXOSetSync(
    height: number,
    peers: SyncPeer[]
  ): Promise<UTXOSetSnapshot> {
    this.logger.info(`Starting UTXO set sync for height ${height}`);

    // Download entire UTXO set in compressed batches
    const snapshot = await this.downloadUTXOSnapshot(height, peers);

    // Verify merkle root
    await this.verifyMerkleRoot(snapshot);

    this.logger.info(`UTXO set synced: ${snapshot.utxoCount} UTXOs`);
    return snapshot;
  }

  /**
   * Stream UTXO updates via WebSocket
   */
  streamUTXOUpdates(callback: (utxo: UTXO) => void): void {
    // WebSocket streaming implementation would go here
    this.logger.info('Started UTXO update streaming');

    // Emit events for new UTXOs
    this.on('utxo:created', callback);
    this.on('utxo:spent', callback);
  }

  /**
   * Download a single block from peers
   */
  private async downloadBlock(hash: string, peers: SyncPeer[]): Promise<Block> {
    for (const peer of peers) {
      try {
        // Create block request message
        const request = await this.createBlockRequest(hash, peer);

        // Send request and wait for response
        const response = (await this.sendBlockRequest(request, peer)) as Record<
          string,
          any
        >;

        // Decompress and validate block
        const block = await this.processBlockResponse(response);

        return block;
      } catch (error) {
        this.logger.warn(
          `Failed to download block ${hash} from peer ${peer.id}:`,
          error as Error
        );
        continue;
      }
    }

    throw new Error(`Failed to download block ${hash} from all peers`);
  }

  /**
   * Download UTXO snapshot
   */
  private async downloadUTXOSnapshot(
    height: number,
    peers: SyncPeer[]
  ): Promise<UTXOSetSnapshot> {
    for (const peer of peers) {
      try {
        const request = await this.createSnapshotRequest(height, peer);
        const response = (await this.sendSnapshotRequest(
          request,
          peer
        )) as Record<string, any>;
        const snapshot = await this.processSnapshotResponse(response);

        return snapshot;
      } catch (error) {
        this.logger.warn(
          `Failed to download snapshot from peer ${peer.id}:`,
          error as Error
        );
        continue;
      }
    }

    throw new Error(`Failed to download UTXO snapshot for height ${height}`);
  }

  /**
   * Verify merkle root of UTXO snapshot
   */
  private async verifyMerkleRoot(snapshot: UTXOSetSnapshot): Promise<void> {
    // Implementation would verify the merkle root
    this.logger.debug(`Verifying merkle root: ${snapshot.merkleRoot}`);
  }

  /**
   * Helper methods for message creation and processing
   */
  private async createBlockRequest(
    hash: string,
    _peer: SyncPeer
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      blockHash: hash,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    return this.createSyncMessage(
      UTXOSyncMessageType.UTXO_BLOCK_REQUEST,
      payload
    );
  }

  private async createSnapshotRequest(
    height: number,
    _peer: SyncPeer
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      height,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    return this.createSyncMessage(
      UTXOSyncMessageType.UTXO_SET_REQUEST,
      payload
    );
  }

  private async createSyncMessage(
    type: UTXOSyncMessageType,
    payload: CompressedPayload
  ): Promise<UTXOSyncMessage> {
    const message = {
      version: '2.0.0',
      type,
      timestamp: Date.now(),
      signature: '',
      publicKey: '',
      payload,
      priority: 'high' as unknown as MessagePriority,
    };

    // Sign the message
    const messageData = new TextEncoder().encode(JSON.stringify(message));
    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const signature = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );
    message.signature =
      typeof signature === 'string'
        ? signature
        : new TextDecoder().decode(signature as unknown as Uint8Array);
    message.publicKey =
      typeof keyPair.publicKey === 'string'
        ? keyPair.publicKey
        : new TextDecoder().decode(keyPair.publicKey);

    return message;
  }

  private async sendBlockRequest(
    _request: UTXOSyncMessage,
    _peer: SyncPeer
  ): Promise<any> {
    // Implementation would send HTTP/WebSocket request
    return {};
  }

  private async sendSnapshotRequest(
    _request: UTXOSyncMessage,
    _peer: SyncPeer
  ): Promise<any> {
    // Implementation would send HTTP/WebSocket request
    return {};
  }

  private async processBlockResponse(_response: any): Promise<Block> {
    // Implementation would process and decompress block response
    return {} as Block;
  }

  private async processSnapshotResponse(
    _response: any
  ): Promise<UTXOSetSnapshot> {
    // Implementation would process and decompress snapshot response
    return {} as UTXOSetSnapshot;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Mesh synchronization strategy for constrained bandwidth nodes
 */
export class MeshSyncStrategy extends EventEmitter {
  private meshProtocol: UTXOEnhancedMeshProtocol;
  private dutyCycleManager: DutyCycleManager;
  private nodeDiscovery: NodeDiscoveryProtocol;
  private reliableDelivery: UTXOReliableDeliveryManager;
  private compressionManager: UTXOCompressionManager;
  private cryptoService: CryptographicService;
  private logger: Logger;

  constructor(
    meshProtocol: UTXOEnhancedMeshProtocol,
    dutyCycleManager: DutyCycleManager,
    nodeDiscovery: NodeDiscoveryProtocol,
    reliableDelivery: UTXOReliableDeliveryManager,
    compressionManager: UTXOCompressionManager,
    cryptoService: CryptographicService
  ) {
    super();

    this.meshProtocol = meshProtocol;
    this.dutyCycleManager = dutyCycleManager;
    this.nodeDiscovery = nodeDiscovery;
    this.reliableDelivery = reliableDelivery;
    this.compressionManager = compressionManager;
    this.cryptoService = cryptoService;
    this.logger = Logger.getInstance();
  }

  /**
   * Fragment-aware block synchronization
   */
  async fragmentedBlockSync(
    hash: string,
    _maxFragmentSize: number = 200 // Leave room for headers
  ): Promise<Block> {
    this.logger.info(`Starting fragmented sync for block ${hash}`);

    const fragments: Uint8Array[] = [];
    let fragmentIndex = 0;
    let totalFragments = 0;

    while (true) {
      // Wait for transmission window
      const waitTime = this.dutyCycleManager.getNextTransmissionWindow();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Request fragment
      const fragmentRequest = await this.createFragmentRequest(
        hash,
        fragmentIndex
      );
      const reliableMessage = {
        id: this.generateRequestId(),
        type: 'sync' as const,
        payload: fragmentRequest.payload,
        timestamp: fragmentRequest.timestamp,
        signature: fragmentRequest.signature,
        reliability: 'confirmed' as const,
        maxRetries: 3,
        timeoutMs: 30000,
        from: 'sync-manager',
        priority: fragmentRequest.priority,
      };
      const fragment = (await this.reliableDelivery.sendReliableMessage(
        reliableMessage,
        'high'
      )) as any;

      if (!fragment) {
        if (fragmentIndex === 0) {
          throw new Error(`Block ${hash} not found`);
        }
        break; // No more fragments
      }

      // Store fragment
      fragments.push(fragment.data);

      if (fragmentIndex === 0) {
        totalFragments = fragment.totalFragments;
      }

      fragmentIndex++;

      // Check if we have all fragments
      if (fragmentIndex >= totalFragments) {
        break;
      }
    }

    // Reassemble block
    const block = await this.reassembleBlock(fragments);

    this.logger.info(
      `Successfully reassembled block ${hash} from ${fragments.length} fragments`
    );
    return block;
  }

  /**
   * Priority-based UTXO synchronization
   */
  async prioritizedUTXOSync(address: string): Promise<UTXO[]> {
    this.logger.info(`Syncing UTXOs for address ${address}`);

    // Only sync UTXOs for specific addresses to minimize data
    const request = await this.createUTXORequest(
      address,
      'high' as unknown as MessagePriority
    );
    const reliableMessage = {
      id: this.generateRequestId(),
      type: 'sync' as const,
      payload: request.payload,
      timestamp: request.timestamp,
      signature: request.signature,
      reliability: 'confirmed' as const,
      maxRetries: 3,
      timeoutMs: 30000,
      from: 'sync-manager',
      priority: request.priority,
    };
    const response = (await this.reliableDelivery.sendReliableMessage(
      reliableMessage,
      'high'
    )) as any;

    // Decompress and validate UTXOs
    const utxos = await this.processUTXOResponse(response);

    this.logger.info(`Synced ${utxos.length} UTXOs for address ${address}`);
    return utxos;
  }

  /**
   * Cooperative sync through neighbors
   */
  async cooperativeSync(targetHeight: number): Promise<void> {
    this.logger.info(`Starting cooperative sync to height ${targetHeight}`);

    const neighbors = await this.nodeDiscovery.getNeighbors();

    for (const neighbor of neighbors) {
      if ((neighbor as any).height >= targetHeight) {
        try {
          await this.syncFromNeighbor(neighbor as any, targetHeight);
          this.logger.info(`Successfully synced from neighbor ${neighbor.id}`);
          return;
        } catch (error) {
          this.logger.warn(
            `Failed to sync from neighbor ${neighbor.id}:`,
            error as Error
          );
          continue;
        }
      }
    }

    throw new Error(
      `No neighbors available for sync to height ${targetHeight}`
    );
  }

  /**
   * Create fragment request
   */
  private async createFragmentRequest(
    hash: string,
    fragmentIndex: number
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      blockHash: hash,
      fragmentIndex,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const fragmentInfo: FragmentInfo = {
      messageId: this.generateRequestId(),
      fragmentIndex,
      totalFragments: 1,
      checksum: await this.calculateChecksum(payload.data),
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(hash);

    const signature = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_BLOCK_FRAGMENT,
      timestamp: Date.now(),
      signature:
        typeof signature === 'string'
          ? signature
          : new TextDecoder().decode(signature as unknown as Uint8Array),
      publicKey:
        typeof keyPair.publicKey === 'string'
          ? keyPair.publicKey
          : new TextDecoder().decode(keyPair.publicKey),
      payload,
      priority: 'high' as unknown as MessagePriority,
      fragmentInfo,
    };
  }

  /**
   * Create UTXO request
   */
  private async createUTXORequest(
    address: string,
    priority: MessagePriority
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      address,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(address);

    const signature = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_SET_REQUEST,
      timestamp: Date.now(),
      signature:
        typeof signature === 'string'
          ? signature
          : new TextDecoder().decode(signature as unknown as Uint8Array),
      publicKey:
        typeof keyPair.publicKey === 'string'
          ? keyPair.publicKey
          : new TextDecoder().decode(keyPair.publicKey),
      payload,
      priority,
    };
  }

  /**
   * Reassemble block from fragments
   */
  private async reassembleBlock(fragments: Uint8Array[]): Promise<Block> {
    // Concatenate all fragments
    const totalLength = fragments.reduce(
      (sum, fragment) => sum + fragment.length,
      0
    );
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const fragment of fragments) {
      combined.set(fragment, offset);
      offset += fragment.length;
    }

    // Decompress the combined data
    const compressedData = {
      algorithm: 'gzip' as CompressionAlgorithm,
      data: combined,
      originalSize: combined.length * 2,
      metadata: { version: 1, compressor: 'gzip' },
    };
    const decompressed =
      await this.compressionManager.decompress(compressedData);

    // Parse block from decompressed data
    const blockData = JSON.parse(new TextDecoder().decode(decompressed));
    return blockData as Block;
  }

  /**
   * Process UTXO response
   */
  private async processUTXOResponse(_response: any): Promise<UTXO[]> {
    // Implementation would decompress and validate UTXO response
    return [];
  }

  /**
   * Sync from a specific neighbor
   */
  private async syncFromNeighbor(
    _neighbor: any,
    _targetHeight: number
  ): Promise<void> {
    // Implementation would sync from neighbor
  }

  /**
   * Calculate checksum for data
   */
  private async calculateChecksum(data: Uint8Array): Promise<string> {
    // Use a simple hash calculation for checksums
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
    }
    return Math.abs(hash).toString(16);
  }

  private generateRequestId(): string {
    return `mesh_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Hybrid synchronization strategy - adaptive approach
 */
export class HybridSyncStrategy extends EventEmitter {
  private internetStrategy: InternetSyncStrategy;
  private meshStrategy: MeshSyncStrategy;
  private logger: Logger;

  constructor(
    internetStrategy: InternetSyncStrategy,
    meshStrategy: MeshSyncStrategy
  ) {
    super();

    this.internetStrategy = internetStrategy;
    this.meshStrategy = meshStrategy;
    this.logger = Logger.getInstance();
  }

  /**
   * Adaptive synchronization based on network conditions
   */
  async adaptiveSync(
    hashes: string[],
    priority: MessagePriority,
    peers: SyncPeer[]
  ): Promise<Block[]> {
    const networkType = await this.detectNetworkType();

    this.logger.info(
      `Using ${networkType} sync strategy for ${hashes.length} blocks`
    );

    if (networkType === 'internet') {
      return await this.internetStrategy.parallelBlockDownload(hashes, peers);
    } else if (networkType === 'mesh') {
      const blocks: Block[] = [];
      for (const hash of hashes) {
        const block = await this.meshStrategy.fragmentedBlockSync(hash);
        blocks.push(block);
      }
      return blocks;
    } else {
      // Gateway node - use both strategies
      return await this.syncViaGateway(hashes, priority, peers);
    }
  }

  /**
   * Gateway sync - download via internet, relay via mesh
   */
  private async syncViaGateway(
    hashes: string[],
    priority: MessagePriority,
    peers: SyncPeer[]
  ): Promise<Block[]> {
    this.logger.info(`Gateway sync: downloading ${hashes.length} blocks`);

    // Download blocks via internet
    const internetPeers = peers.filter(p => p.type === 'internet');
    const blocks = await this.internetStrategy.parallelBlockDownload(
      hashes,
      internetPeers
    );

    // Relay blocks to mesh nodes
    await this.relayToMeshNodes(blocks);

    return blocks;
  }

  /**
   * Relay blocks to mesh nodes
   */
  private async relayToMeshNodes(blocks: Block[]): Promise<void> {
    this.logger.info(`Relaying ${blocks.length} blocks to mesh network`);

    for (const block of blocks) {
      // Fragment and transmit block to mesh
      await this.meshStrategy.fragmentedBlockSync(block.hash);
    }
  }

  /**
   * Detect current network type
   */
  private async detectNetworkType(): Promise<'internet' | 'mesh' | 'gateway'> {
    // Check for internet connectivity
    const hasInternet = await this.checkInternetConnectivity();

    // Check for mesh connectivity
    const hasMesh = await this.checkMeshConnectivity();

    if (hasInternet && hasMesh) {
      return 'gateway';
    } else if (hasInternet) {
      return 'internet';
    } else if (hasMesh) {
      return 'mesh';
    } else {
      throw new Error('No network connectivity available');
    }
  }

  /**
   * Check internet connectivity
   */
  private async checkInternetConnectivity(): Promise<boolean> {
    try {
      // Simple connectivity check
      const response = await fetch('https://httpbin.org/status/200', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check mesh connectivity
   */
  private async checkMeshConnectivity(): Promise<boolean> {
    // Check if mesh protocol is connected and has active neighbors
    const neighbors = await this.meshStrategy['nodeDiscovery'].getNeighbors();
    return neighbors.length > 0;
  }
}

/**
 * Light Client Sync Strategy (Task 9)
 *
 * Optimized synchronization for mobile wallets and resource-constrained devices.
 * Features:
 * - Address-specific UTXO synchronization
 * - Header-only mode with SPV verification
 * - Bloom filter for efficient block filtering
 * - Selective block downloading
 * - Minimal bandwidth and storage usage
 */
export class LightClientSyncStrategy extends EventEmitter {
  private config: LightClientSyncConfig;
  private bloomFilter: BloomFilter;
  private meshProtocol: UTXOEnhancedMeshProtocol;
  private spvManager: SPVManager;
  private logger: Logger;
  private reliableDelivery: UTXOReliableDeliveryManager;
  private compressionManager: UTXOCompressionManager;
  private cryptoService: CryptographicService;
  private addressSet: Set<string>;
  private bestPeer: SyncPeer | null = null;

  constructor(
    config: LightClientSyncConfig,
    meshProtocol: UTXOEnhancedMeshProtocol,
    spvManager: SPVManager,
    reliableDelivery: UTXOReliableDeliveryManager,
    compressionManager: UTXOCompressionManager,
    cryptoService: CryptographicService
  ) {
    super();

    this.config = config;
    this.meshProtocol = meshProtocol;
    this.spvManager = spvManager;
    this.reliableDelivery = reliableDelivery;
    this.compressionManager = compressionManager;
    this.cryptoService = cryptoService;
    this.logger = Logger.getInstance();
    this.addressSet = new Set(config.addresses);

    // Create bloom filter for address filtering
    this.bloomFilter = this.createBloomFilter();

    this.logger.info('LightClientSyncStrategy initialized', {
      addresses: config.addresses.length,
      headerOnly: config.headerOnly,
      bloomFilterSize: config.bloomFilterSize,
    });
  }

  /**
   * Sync headers only (light client mode)
   */
  async syncHeaders(
    startHeight: number,
    endHeight: number
  ): Promise<UTXOBlockHeader[]> {
    this.logger.info(`Syncing headers from ${startHeight} to ${endHeight}`);

    const headers: UTXOBlockHeader[] = [];
    const batchSize = 100; // Headers are small, can batch many

    for (let height = startHeight; height <= endHeight; height += batchSize) {
      const batchEnd = Math.min(height + batchSize - 1, endHeight);

      // Request header batch
      const request = await this.createHeaderRequest(height, batchEnd);
      const reliableMessage = {
        id: this.generateRequestId(),
        type: 'sync' as const,
        payload: request.payload,
        timestamp: request.timestamp,
        signature: request.signature,
        reliability: 'confirmed' as const,
        maxRetries: 3,
        timeoutMs: 30000,
        from: 'light-client-sync',
        priority: request.priority,
      };

      const response = (await this.reliableDelivery.sendReliableMessage(
        reliableMessage,
        'medium'
      )) as SyncHeaderResponse;

      if (response && response.headers) {
        headers.push(...response.headers);

        // Validate header chain continuity
        if (headers.length > 1) {
          await this.validateHeaderChain(headers);
        }
      }
    }

    this.logger.info(`Synced ${headers.length} headers`);
    return headers;
  }

  /**
   * Sync UTXOs for specific addresses
   */
  async syncUTXOsForAddresses(
    addresses: string[],
    startHeight: number = 0
  ): Promise<UTXO[]> {
    this.logger.info(`Syncing UTXOs for ${addresses.length} addresses`);

    const startTime = Date.now();
    let dataDownloaded = 0;
    let spvProofsVerified = 0;

    // Update address filter
    addresses.forEach(addr => {
      this.addressSet.add(addr);
      this.bloomFilter.add(addr);
    });

    // 1. Get network height
    const targetHeight = await this.getNetworkHeight();

    // 2. Download headers
    const headers = await this.syncHeaders(startHeight, targetHeight);

    // 3. Identify relevant blocks using bloom filter
    const relevantBlockHeights = await this.identifyRelevantBlocks(headers);

    this.logger.info(
      `Identified ${relevantBlockHeights.length} relevant blocks out of ${headers.length}`
    );

    // 4. Download only relevant blocks
    const blocks = await this.downloadRelevantBlocks(relevantBlockHeights);

    // 5. Extract UTXOs for tracked addresses
    const utxos: UTXO[] = [];
    for (const block of blocks) {
      // Validate and cast UTXO transactions (light client expects UTXO model)
      const utxoTransactions =
        block.transactions as unknown as UTXOTransaction[];

      for (const tx of utxoTransactions) {
        // Skip if not a valid UTXO transaction
        if (
          !tx.outputs ||
          !Array.isArray(tx.outputs) ||
          tx.outputs.length === 0
        ) {
          continue;
        }

        // Check outputs for our addresses
        for (let i = 0; i < tx.outputs.length; i++) {
          const outputAddress = tx.outputs[i].lockingScript;

          if (this.addressSet.has(outputAddress)) {
            // Verify transaction with SPV proof
            const header = headers.find(h => h.index === block.index);
            if (header) {
              const merkleProof = await this.requestMerkleProof(
                tx.id,
                header.hash
              );
              const isValid = await this.verifyTransactionSPV(
                tx,
                merkleProof,
                header
              );

              if (isValid) {
                utxos.push({
                  txId: tx.id,
                  outputIndex: i,
                  value: tx.outputs[i].value,
                  lockingScript: outputAddress,
                  blockHeight: block.index,
                  isSpent: false,
                });

                spvProofsVerified++;
              } else {
                this.logger.warn(
                  `SPV verification failed for tx ${tx.id} in block ${block.index}`
                );
              }
            }
          }
        }
      }

      // Estimate data downloaded (simplified)
      dataDownloaded += JSON.stringify(block).length;
    }

    const duration = Date.now() - startTime;

    this.emit('sync-complete', {
      syncedHeaders: headers.length,
      relevantBlocks: blocks.length,
      relevantUTXOs: utxos.length,
      dataDownloaded,
      duration,
      spvProofsVerified,
    } as LightClientSyncResult);

    this.logger.info(
      `Synced ${utxos.length} UTXOs in ${duration}ms (${(dataDownloaded / 1024 / 1024).toFixed(2)}MB downloaded)`
    );

    return utxos;
  }

  /**
   * Request merkle proof for transaction
   */
  async requestMerkleProof(txId: string, blockHash: string): Promise<string[]> {
    const request = await this.createMerkleProofRequest(txId, blockHash);
    const reliableMessage = {
      id: this.generateRequestId(),
      type: 'sync' as const,
      payload: request.payload,
      timestamp: request.timestamp,
      signature: request.signature,
      reliability: 'confirmed' as const,
      maxRetries: 3,
      timeoutMs: 30000,
      from: 'light-client-sync',
      priority: request.priority,
    };

    const response = (await this.reliableDelivery.sendReliableMessage(
      reliableMessage,
      'high'
    )) as SyncMerkleProofResponse;

    return response?.proof?.merkleProof || [];
  }

  /**
   * Verify transaction with SPV proof
   */
  async verifyTransactionSPV(
    tx: UTXOTransaction,
    proof: string[],
    blockHeader: UTXOBlockHeader
  ): Promise<boolean> {
    try {
      // Validate that SPV manager has the verifyTransaction method
      if (!('verifyTransaction' in this.spvManager)) {
        throw new Error('SPVManager does not support verifyTransaction method');
      }

      const spvManagerInstance = this
        .spvManager as unknown as SPVManagerVerifiable;
      return spvManagerInstance.verifyTransaction(
        tx,
        proof,
        blockHeader.utxoMerkleRoot
      );
    } catch (error) {
      this.logger.error('SPV verification error:', error as Error);
      return false;
    }
  }

  /**
   * Identify relevant blocks using bloom filter
   */
  async identifyRelevantBlocks(headers: UTXOBlockHeader[]): Promise<number[]> {
    const relevant: number[] = [];

    // For light clients, we need to ask full nodes which blocks match our filter
    // In batches to reduce round trips
    const batchSize = 50;

    for (let i = 0; i < headers.length; i += batchSize) {
      const batch = headers.slice(i, i + batchSize);

      try {
        const batchRelevant = await this.checkBatchRelevance(batch);
        relevant.push(...batchRelevant);
      } catch (error) {
        this.logger.warn(
          `Failed to check batch relevance for headers ${i}-${i + batchSize}:`,
          error as Error
        );
        // Fallback: assume all blocks in batch are relevant to avoid missing transactions
        relevant.push(...batch.map(h => h.index));
      }
    }

    return relevant;
  }

  /**
   * Download only relevant blocks
   */
  async downloadRelevantBlocks(blockHeights: number[]): Promise<Block[]> {
    this.logger.info(`Downloading ${blockHeights.length} relevant blocks`);

    const blocks: Block[] = [];
    const maxBlocks = Math.min(
      blockHeights.length,
      this.config.maxBlockDownload
    );

    for (let i = 0; i < maxBlocks; i++) {
      const height = blockHeights[i];

      try {
        const block = await this.downloadBlock(height);
        blocks.push(block);
      } catch (error) {
        this.logger.warn(
          `Failed to download block at height ${height}:`,
          error as Error
        );
      }
    }

    return blocks;
  }

  /**
   * Add new address to track
   */
  addAddress(address: string): void {
    this.addressSet.add(address);
    this.bloomFilter.add(address);
    this.logger.debug(`Added address to filter: ${address}`);
  }

  /**
   * Remove address from tracking
   */
  removeAddress(address: string): void {
    this.addressSet.delete(address);
    // Note: Cannot remove from bloom filter, need to recreate
    this.bloomFilter = this.createBloomFilter();
    this.logger.debug(`Removed address from filter: ${address}`);
  }

  /**
   * Get bloom filter data for transmission
   */
  getBloomFilterData(): Uint8Array {
    return this.bloomFilter.toBytes();
  }

  /**
   * Create bloom filter for addresses
   */
  private createBloomFilter(): BloomFilter {
    const filter = new BloomFilter(
      this.config.bloomFilterSize,
      this.config.falsePositiveRate
    );

    // Add all wallet addresses to filter
    for (const address of this.config.addresses) {
      filter.add(address);
    }

    this.logger.debug(
      `Created bloom filter with ${this.config.addresses.length} addresses, ` +
        `FPR: ${this.config.falsePositiveRate}, ` +
        `size: ${this.config.bloomFilterSize} bytes`
    );

    return filter;
  }

  /**
   * Check if batch of blocks is relevant
   */
  private async checkBatchRelevance(
    headers: UTXOBlockHeader[]
  ): Promise<number[]> {
    // Send bloom filter to full node and ask which blocks match
    const request = await this.createBloomFilterCheckRequest(headers);
    const reliableMessage = {
      id: this.generateRequestId(),
      type: 'sync' as const,
      payload: request.payload,
      timestamp: request.timestamp,
      signature: request.signature,
      reliability: 'confirmed' as const,
      maxRetries: 3,
      timeoutMs: 30000,
      from: 'light-client-sync',
      priority: request.priority,
    };

    const response = (await this.reliableDelivery.sendReliableMessage(
      reliableMessage,
      'medium'
    )) as SyncBloomFilterCheckResponse;

    return response?.relevantHeights || [];
  }

  /**
   * Download a single block
   */
  private async downloadBlock(height: number): Promise<Block> {
    const request = await this.createBlockRequest(height);
    const reliableMessage = {
      id: this.generateRequestId(),
      type: 'sync' as const,
      payload: request.payload,
      timestamp: request.timestamp,
      signature: request.signature,
      reliability: 'confirmed' as const,
      maxRetries: 3,
      timeoutMs: 30000,
      from: 'light-client-sync',
      priority: request.priority,
    };

    const response = (await this.reliableDelivery.sendReliableMessage(
      reliableMessage,
      'high'
    )) as { block?: Block };

    if (!response || !response.block) {
      throw new Error(
        `Failed to download block at height ${height}: No block in response`
      );
    }

    return response.block;
  }

  /**
   * Get current network height from peers
   */
  private async getNetworkHeight(): Promise<number> {
    // Request network status from best peer
    const request = await this.createStatusRequest();
    const reliableMessage = {
      id: this.generateRequestId(),
      type: 'sync' as const,
      payload: request.payload,
      timestamp: request.timestamp,
      signature: request.signature,
      reliability: 'confirmed' as const,
      maxRetries: 3,
      timeoutMs: 30000,
      from: 'light-client-sync',
      priority: request.priority,
    };

    const response = (await this.reliableDelivery.sendReliableMessage(
      reliableMessage,
      'high'
    )) as SyncStatusResponse;

    return response?.height || 0;
  }

  /**
   * Validate header chain continuity
   */
  private async validateHeaderChain(headers: UTXOBlockHeader[]): Promise<void> {
    for (let i = 1; i < headers.length; i++) {
      const prev = headers[i - 1];
      const curr = headers[i];

      if (curr.previousHash !== prev.hash) {
        throw new Error(
          `Header chain discontinuity at index ${curr.index}: ` +
            `expected previous hash ${prev.hash}, got ${curr.previousHash}`
        );
      }

      if (curr.index !== prev.index + 1) {
        throw new Error(
          `Header index mismatch at ${curr.index}: expected ${prev.index + 1}`
        );
      }
    }
  }

  /**
   * Create header request message
   */
  private async createHeaderRequest(
    startHeight: number,
    endHeight: number
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      startHeight,
      endHeight,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(requestData);
    const signatureResult = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_HEADER_REQUEST,
      timestamp: Date.now(),
      signature: Buffer.from(signatureResult.signature).toString('hex'),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      payload,
      priority: 'medium' as unknown as MessagePriority,
    };
  }

  /**
   * Create merkle proof request message
   */
  private async createMerkleProofRequest(
    txId: string,
    blockHash: string
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      txId,
      blockHash,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(requestData);
    const signatureResult = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_MERKLE_PROOF,
      timestamp: Date.now(),
      signature: Buffer.from(signatureResult.signature).toString('hex'),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      payload,
      priority: 'high' as unknown as MessagePriority,
    };
  }

  /**
   * Create bloom filter check request
   */
  private async createBloomFilterCheckRequest(
    headers: UTXOBlockHeader[]
  ): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      blockHashes: headers.map(h => h.hash),
      bloomFilter: Array.from(this.bloomFilter.toBytes()),
      numHashFunctions: this.bloomFilter.getNumHashFunctions(),
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(requestData);
    const signatureResult = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_BLOCK_REQUEST,
      timestamp: Date.now(),
      signature: Buffer.from(signatureResult.signature).toString('hex'),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      payload,
      priority: 'medium' as unknown as MessagePriority,
    };
  }

  /**
   * Create block request message
   */
  private async createBlockRequest(height: number): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      height,
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(requestData);
    const signatureResult = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.UTXO_BLOCK_REQUEST,
      timestamp: Date.now(),
      signature: Buffer.from(signatureResult.signature).toString('hex'),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      payload,
      priority: 'high' as unknown as MessagePriority,
    };
  }

  /**
   * Create status request message
   */
  private async createStatusRequest(): Promise<UTXOSyncMessage> {
    const requestData = JSON.stringify({
      requestId: this.generateRequestId(),
    });
    const requestBytes = new TextEncoder().encode(requestData);
    const compressed = await this.compressionManager.compress(requestBytes);

    const payload: CompressedPayload = {
      algorithm: compressed.algorithm,
      originalSize: requestBytes.length,
      compressedSize: compressed.data.length,
      data: compressed.data,
    };

    const keyPair = CryptographicService.generateKeyPair('secp256k1');
    const messageData = new TextEncoder().encode(requestData);
    const signatureResult = CryptographicService.sign(
      messageData,
      keyPair.privateKey,
      'secp256k1'
    );

    return {
      version: '2.0.0',
      type: UTXOSyncMessageType.SYNC_STATUS,
      timestamp: Date.now(),
      signature: Buffer.from(signatureResult.signature).toString('hex'),
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      payload,
      priority: 'high' as unknown as MessagePriority,
    };
  }

  private generateRequestId(): string {
    return `light_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
