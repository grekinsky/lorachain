/**
 * Enhanced Lorachain Node with Comprehensive Peer Management
 *
 * This module provides an enhanced version of LorachainNode that integrates
 * the sophisticated peer management system, replacing the basic peer array
 * with comprehensive peer discovery, connection management, scoring, and
 * misbehavior detection capabilities.
 *
 * Designed for UTXO-only blockchain with LoRa mesh networking constraints.
 */

import { Logger } from '@lorachain/shared';
import {
  Blockchain,
  UTXOTransaction,
  Block,
  DatabaseFactory,
  CryptographicService,
  UTXOPersistenceManager,
  UTXOManager,
  GenesisConfig,
  UTXOPersistenceConfig,
  NetworkNode,
  PeerManager,
  PeerManagerConfig,
  EnhancedNetworkNode,
  MisbehaviorType,
  PeerManagerStatistics,
  DEFAULT_PEER_MANAGER_CONFIG,
} from '@lorachain/core';

// Enhanced node configuration that includes peer management
export interface EnhancedNodeConfig {
  id: string;
  port: number;
  host: string;
  type: 'light' | 'full';
  enableMining: boolean;
  minerAddress?: string;
  genesisConfig?: GenesisConfig | string;
  persistenceConfig?: UTXOPersistenceConfig;

  // Peer management configuration
  peerManager?: Partial<PeerManagerConfig>;

  // Integration options
  enablePeerManagement: boolean;
  autoDiscovery: boolean;
  maxPeers?: number;
}

/**
 * Enhanced Lorachain Node with sophisticated peer management capabilities
 *
 * Replaces the basic peer array with comprehensive peer management including:
 * - Multi-source peer discovery (DNS seeds, peer exchange, mDNS, mesh announcements)
 * - Connection pool management with quality-based prioritization
 * - Multi-factor peer scoring and reputation system
 * - Automatic misbehavior detection and banning
 * - Integration with UTXO sync and mesh protocols
 */
export class EnhancedLorachainNode {
  private blockchain: Blockchain;
  private config: EnhancedNodeConfig;
  private peerManager?: PeerManager;
  private logger = Logger.getInstance();
  private isRunning = false;

  constructor(config: EnhancedNodeConfig) {
    this.config = config;

    // Initialize blockchain with required parameters (NO BACKWARDS COMPATIBILITY)
    this.blockchain = this.initializeBlockchain(config);

    // Initialize peer management if enabled
    if (config.enablePeerManagement) {
      this.initializePeerManager();
    }

    this.logger.info('Enhanced Lorachain node initialized', {
      nodeId: config.id,
      peerManagement: config.enablePeerManagement,
      autoDiscovery: config.autoDiscovery,
    });
  }

  private initializeBlockchain(config: EnhancedNodeConfig): Blockchain {
    // Default persistence configuration for nodes
    const defaultPersistenceConfig: UTXOPersistenceConfig = {
      enabled: true,
      dbPath: `./node-data/${config.id}`,
      dbType: 'leveldb',
      autoSave: true,
      batchSize: 100,
      compressionType: 'gzip',
      utxoSetCacheSize: 1000,
      cryptographicAlgorithm: 'secp256k1',
      compactionStyle: 'size',
    };

    // Use provided config or default
    const persistenceConfig =
      config.persistenceConfig || defaultPersistenceConfig;

    // Create required blockchain components
    const database = DatabaseFactory.create(persistenceConfig);
    const cryptoService = new CryptographicService();
    const persistence = new UTXOPersistenceManager(
      database,
      persistenceConfig,
      cryptoService
    );
    const utxoManager = new UTXOManager();

    // Default genesis config if none provided
    const genesisConfig = config.genesisConfig || 'mainnet'; // Default to mainnet

    // Default difficulty config
    const difficultyConfig = {
      targetBlockTime: 300, // 5 minutes
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      minDifficulty: 1,
      maxDifficulty: 1000,
    };

    return new Blockchain(
      persistence,
      utxoManager,
      difficultyConfig,
      genesisConfig
    );
  }

  private initializePeerManager(): void {
    // Merge configuration with defaults
    const peerManagerConfig: PeerManagerConfig = {
      ...DEFAULT_PEER_MANAGER_CONFIG,
      ...this.config.peerManager,

      // Apply node-specific overrides
      connectionPool: {
        ...DEFAULT_PEER_MANAGER_CONFIG.connectionPool,
        ...this.config.peerManager?.connectionPool,
        maxConnections:
          this.config.maxPeers ||
          this.config.peerManager?.connectionPool?.maxConnections ||
          DEFAULT_PEER_MANAGER_CONFIG.connectionPool.maxConnections,
      },

      // Configure discovery based on node settings
      discovery: {
        ...DEFAULT_PEER_MANAGER_CONFIG.discovery,
        ...this.config.peerManager?.discovery,
        enablePeerExchange: this.config.autoDiscovery ?? true,
        enableMdns: this.config.autoDiscovery ?? true,
        enableMeshAnnounce: this.config.autoDiscovery ?? true,
      },
    };

    this.peerManager = new PeerManager(peerManagerConfig);

    // Set up peer management event handlers
    this.setupPeerEventHandlers();
  }

  private setupPeerEventHandlers(): void {
    if (!this.peerManager) return;

    this.peerManager.on('peer:discovered', (peer: EnhancedNetworkNode) => {
      this.logger.info('New peer discovered', {
        peerId: peer.id,
        address: peer.address,
        type: peer.type,
        discoveryMethod: peer.discoveryMethod,
      });
    });

    this.peerManager.on('peer:connected', (peerId: string) => {
      this.logger.info('Peer connected', { peerId });
      this.onPeerConnected(peerId);
    });

    this.peerManager.on('peer:disconnected', (peerId: string) => {
      this.logger.info('Peer disconnected', { peerId });
      this.onPeerDisconnected(peerId);
    });

    this.peerManager.on('peer:banned', (peerId: string, reason: string) => {
      this.logger.warn('Peer banned', { peerId, reason });
      this.onPeerBanned(peerId, reason);
    });

    this.peerManager.on('connection:failed', (peerId: string, error: Error) => {
      this.logger.warn('Connection failed', {
        peerId,
        error: error.message,
      });
    });

    this.peerManager.on(
      'peer:score_updated',
      (peerId: string, score: number) => {
        this.logger.debug('Peer score updated', { peerId, score });
      }
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    // Wait for blockchain initialization to complete
    await this.blockchain.waitForInitialization();

    this.isRunning = true;
    this.logger.info('Starting Enhanced Lorachain node', {
      nodeId: this.config.id,
      port: this.config.port,
      type: this.config.type,
      peerManagement: !!this.peerManager,
    });

    // Start peer management if enabled
    if (this.peerManager) {
      await this.peerManager.start();
    }

    if (this.config.type === 'full' && this.config.enableMining) {
      this.startMining();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping Enhanced Lorachain node', {
      nodeId: this.config.id,
    });

    // Stop peer management
    if (this.peerManager) {
      await this.peerManager.stop();
    }

    // Close blockchain and persistence layer
    await this.blockchain.close();
  }

  private startMining(): void {
    const mineBlock = (): void => {
      if (!this.isRunning) {
        return;
      }

      if (!this.config.minerAddress) {
        this.logger.warn('Mining enabled but no miner address configured');
        return;
      }

      const pendingTransactions = this.blockchain.getPendingTransactions();
      if (pendingTransactions.length === 0) {
        setTimeout(mineBlock, 5000);
        return;
      }

      this.logger.info('Mining new block', {
        pendingTransactions: pendingTransactions.length,
      });

      const newBlock = this.blockchain.minePendingTransactions(
        this.config.minerAddress
      );

      if (newBlock) {
        this.logger.info('Block mined successfully', {
          blockIndex: newBlock.index,
          transactionCount: newBlock.transactions.length,
        });

        this.broadcastBlock(newBlock);
      }

      setTimeout(mineBlock, 1000);
    };

    setTimeout(mineBlock, 1000);
  }

  async addTransaction(transaction: UTXOTransaction): Promise<boolean> {
    const result = await this.blockchain.addTransaction(transaction);

    if (result.isValid) {
      this.logger.info('Transaction added to pending pool', {
        transactionId: transaction.id,
      });
      this.broadcastTransaction(transaction);
      return true;
    } else {
      this.logger.warn('Invalid transaction rejected', {
        transactionId: transaction.id,
        errors: result.errors,
      });
      return false;
    }
  }

  async addBlock(block: Block): Promise<boolean> {
    const result = await this.blockchain.addBlock(block);

    if (result.isValid) {
      this.logger.info('Block added to blockchain', {
        blockIndex: block.index,
      });
      return true;
    } else {
      this.logger.warn('Invalid block rejected', {
        blockIndex: block.index,
        errors: result.errors,
      });
      return false;
    }
  }

  private broadcastTransaction(transaction: UTXOTransaction): void {
    const peerCount = this.peerManager
      ? this.peerManager.getConnectedPeers().length
      : 0;

    this.logger.debug('Broadcasting transaction to peers', {
      transactionId: transaction.id,
      peerCount,
    });

    // TODO: Integrate with mesh protocol for actual transaction broadcasting
    // This would use the existing UTXOEnhancedMeshProtocol for LoRa transmission
    // and HTTP/WebSocket connections for internet peers
  }

  private broadcastBlock(block: Block): void {
    const peerCount = this.peerManager
      ? this.peerManager.getConnectedPeers().length
      : 0;

    this.logger.debug('Broadcasting block to peers', {
      blockIndex: block.index,
      peerCount,
    });

    // TODO: Integrate with mesh protocol for actual block broadcasting
    // This would use the existing UTXOEnhancedMeshProtocol for LoRa transmission
    // and HTTP/WebSocket connections for internet peers
  }

  // Enhanced peer management methods (replace basic addPeer/removePeer)

  addPeer(peerData: Partial<EnhancedNetworkNode> | NetworkNode): boolean {
    if (!this.peerManager) {
      this.logger.warn('Peer management not enabled, ignoring addPeer call');
      return false;
    }

    // Convert legacy NetworkNode to EnhancedNetworkNode format if needed
    const enhancedPeerData = this.convertToEnhancedPeer(peerData);

    return this.peerManager.addPeer(enhancedPeerData);
  }

  removePeer(peerId: string): boolean {
    if (!this.peerManager) {
      this.logger.warn('Peer management not enabled, ignoring removePeer call');
      return false;
    }

    return this.peerManager.removePeer(peerId);
  }

  async connectToPeer(peerId: string): Promise<boolean> {
    if (!this.peerManager) {
      this.logger.warn('Peer management not enabled, cannot connect to peer');
      return false;
    }

    return this.peerManager.connectToPeer(peerId);
  }

  async disconnectFromPeer(peerId: string): Promise<void> {
    if (!this.peerManager) {
      this.logger.warn(
        'Peer management not enabled, cannot disconnect from peer'
      );
      return;
    }

    return this.peerManager.disconnectFromPeer(peerId);
  }

  banPeer(peerId: string, reason: string): void {
    if (!this.peerManager) {
      this.logger.warn('Peer management not enabled, cannot ban peer');
      return;
    }

    this.peerManager.banPeer(peerId, reason);
  }

  unbanPeer(peerId: string): boolean {
    if (!this.peerManager) {
      this.logger.warn('Peer management not enabled, cannot unban peer');
      return false;
    }

    return this.peerManager.unbanPeer(peerId);
  }

  recordPeerMisbehavior(
    peerId: string,
    type: MisbehaviorType,
    evidence: string
  ): void {
    if (!this.peerManager) {
      this.logger.warn(
        'Peer management not enabled, cannot record misbehavior'
      );
      return;
    }

    this.peerManager.recordMisbehavior(peerId, type, evidence);
  }

  // Getters for node information

  getBlockchain(): Blockchain {
    return this.blockchain;
  }

  getPeers(): EnhancedNetworkNode[] {
    if (!this.peerManager) {
      return [];
    }
    return this.peerManager.getAllPeers();
  }

  getConnectedPeers(): EnhancedNetworkNode[] {
    if (!this.peerManager) {
      return [];
    }
    return this.peerManager.getConnectedPeers();
  }

  getBestPeers(count: number = 10): EnhancedNetworkNode[] {
    if (!this.peerManager) {
      return [];
    }
    return this.peerManager.getBestPeers(count);
  }

  getPeerStatistics(): PeerManagerStatistics | null {
    if (!this.peerManager) {
      return null;
    }
    return this.peerManager.getStatistics();
  }

  getConfig(): EnhancedNodeConfig {
    return { ...this.config };
  }

  isNodeRunning(): boolean {
    return this.isRunning;
  }

  isPeerManagementEnabled(): boolean {
    return !!this.peerManager;
  }

  // Internal event handlers

  private onPeerConnected(peerId: string): void {
    // Handle new peer connection
    // This could trigger sync operations, announce ourselves, etc.
    this.logger.debug('Handling new peer connection', { peerId });
  }

  private onPeerDisconnected(peerId: string): void {
    // Handle peer disconnection
    // This could trigger cleanup, find replacement peers, etc.
    this.logger.debug('Handling peer disconnection', { peerId });
  }

  private onPeerBanned(peerId: string, reason: string): void {
    // Handle peer banning
    // This could trigger security alerts, update network policies, etc.
    this.logger.debug('Handling peer ban', { peerId, reason });
  }

  // Utility methods

  private convertToEnhancedPeer(
    peerData: Partial<EnhancedNetworkNode> | NetworkNode
  ): Partial<EnhancedNetworkNode> {
    // Check if it's already an EnhancedNetworkNode
    if ('discoveryMethod' in peerData || 'connectionState' in peerData) {
      return peerData as Partial<EnhancedNetworkNode>;
    }

    // Convert from basic NetworkNode
    const basicPeer = peerData as NetworkNode;
    return {
      id: basicPeer.id,
      address: basicPeer.address,
      port: basicPeer.port,
      type: basicPeer.type,
      isOnline: basicPeer.isOnline,
      lastSeen: basicPeer.lastSeen,
      discoveryMethod: 'manual' as const,
      discoveredAt: Date.now(),
    };
  }

  // Integration methods for external components

  /**
   * Get a connection pool for use by UTXOSyncManager or other components
   */
  getPeerManager(): PeerManager | null {
    return this.peerManager || null;
  }

  /**
   * Report invalid message from a peer
   */
  reportInvalidMessage(peerId: string, reason: string): void {
    if (this.peerManager) {
      this.peerManager.recordInvalidMessage(peerId, reason);
    }
  }

  /**
   * Report successful interaction with a peer
   */
  reportPeerSuccess(peerId: string): void {
    if (this.peerManager) {
      this.peerManager.recordConnectionSuccess(peerId);
    }
  }

  /**
   * Report failed interaction with a peer
   */
  reportPeerFailure(peerId: string): void {
    if (this.peerManager) {
      this.peerManager.recordConnectionFailure(peerId);
    }
  }
}
