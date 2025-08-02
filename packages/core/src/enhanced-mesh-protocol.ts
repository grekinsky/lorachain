import {
  type MeshMessage,
  type IEnhancedMeshProtocol,
  type BlockchainRouteEntry,
  type NetworkTopology,
  type UTXOTransaction,
  type Block,
  type CompressedMerkleProof,
  type RoutingConfig,
  type RoutingMetrics,
  type UTXORouteRequest,
  type UTXORouteReply,
  type BlockchainRouteError,
  type BlockchainHelloMessage,
  type FragmentationConfig,
  type FragmentationStats,
  type NetworkNode,
} from './types.js';
import {
  UTXORouteManager,
  BlockchainFloodManager,
  UTXOMessageForwarder,
  CryptoLoopPrevention,
} from './routing.js';
import {
  RoutingMessageFactory,
  RoutingMessageHandler,
  RoutingMessageOptimizer,
} from './routing-messages.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { Logger } from '@lorachain/shared';
import { EventEmitter } from 'events';

/**
 * Enhanced MeshProtocol with UTXO-aware routing capabilities
 *
 * BREAKING CHANGE: Complete enhancement of MeshProtocol with routing support.
 * Integrates with existing fragmentation system while adding blockchain-optimized routing.
 */
export class UTXOEnhancedMeshProtocol
  extends EventEmitter
  implements IEnhancedMeshProtocol
{
  private utxoRouteManager: UTXORouteManager;
  private blockchainFloodManager: BlockchainFloodManager;
  private utxoMessageForwarder: UTXOMessageForwarder;
  private cryptoLoopPrevention: CryptoLoopPrevention;
  private routingMessageFactory: RoutingMessageFactory;
  private routingMessageHandler: RoutingMessageHandler;
  private routingMessageOptimizer: RoutingMessageOptimizer;

  private cryptoService: CryptographicService;
  private logger: Logger;
  private nodeId: string;
  private nodeKeyPair: KeyPair;
  private nodeType: 'full' | 'light' | 'mining';
  private routingConfig: RoutingConfig;
  private fragmentationConfig: FragmentationConfig;

  // Network state
  private isConnected = false;
  private neighbors: Map<string, any> = new Map(); // Would use proper neighbor type
  private currentBlockchainHeight = 0;
  private utxoSetCompleteness = 0.0;
  private lastUTXOSync = 0;
  private availableServices: string[] = [];

  // Statistics
  private routingStats: RoutingMetrics;
  private fragmentationStats: FragmentationStats;

  constructor(
    nodeId: string,
    nodeType: 'full' | 'light' | 'mining',
    nodeKeyPair: KeyPair,
    routingConfig: RoutingConfig,
    fragmentationConfig: FragmentationConfig,
    cryptoService?: CryptographicService
  ) {
    super();

    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.nodeKeyPair = nodeKeyPair;
    this.routingConfig = routingConfig;
    this.fragmentationConfig = fragmentationConfig;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    // Initialize routing components
    this.utxoRouteManager = new UTXORouteManager(
      nodeId,
      nodeKeyPair,
      routingConfig,
      this.cryptoService
    );

    this.blockchainFloodManager = new BlockchainFloodManager(
      nodeId,
      routingConfig,
      this.cryptoService
    );

    this.utxoMessageForwarder = new UTXOMessageForwarder(nodeId, routingConfig);

    this.cryptoLoopPrevention = new CryptoLoopPrevention(
      nodeId,
      nodeKeyPair,
      routingConfig,
      this.cryptoService
    );

    this.routingMessageFactory = new RoutingMessageFactory(
      nodeId,
      nodeKeyPair,
      this.cryptoService
    );

    this.routingMessageHandler = new RoutingMessageHandler(
      nodeId,
      this.routingMessageFactory
    );

    this.routingMessageOptimizer = new RoutingMessageOptimizer();

    // Initialize statistics
    this.routingStats = {
      totalRoutes: 0,
      activeRoutes: 0,
      routeDiscoveryLatency: 0,
      messageDeliveryRate: 0.95,
      loopDetectionCount: 0,
      floodSuppressionRate: 0.1,
      memoryUsage: {
        routingTable: 0,
        floodCache: 0,
        pendingForwards: 0,
      },
    };

    this.fragmentationStats = {
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      totalFragmentsSent: 0,
      totalFragmentsReceived: 0,
      averageFragmentsPerMessage: 0,
      retransmissionRate: 0,
      reassemblySuccessRate: 0.95,
      averageDeliveryTime: 0,
    };

    // Set up routing message handlers
    this.setupRoutingMessageHandlers();

    this.logger.info('UTXOEnhancedMeshProtocol initialized', {
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      algorithm: this.nodeKeyPair.algorithm,
    });

    // Start periodic operations
    this.startPeriodicOperations();
  }

  // ==========================================
  // Core Mesh Protocol Interface (IEnhancedMeshProtocol)
  // ==========================================

  async sendMessage(message: MeshMessage): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Cannot send message: not connected to mesh network');
      return false;
    }

    try {
      // Check if this is a routing message
      const routingMessage =
        this.routingMessageFactory.fromMeshMessage(message);
      if (routingMessage) {
        return this.handleOutgoingRoutingMessage(message);
      }

      // For non-routing messages, use routing if destination is specified
      if (message.to) {
        return this.sendRoutedMessage(message, message.to);
      } else {
        return this.broadcastMessage(message);
      }
    } catch (error) {
      this.logger.error('Failed to send message', {
        messageType: message.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  receiveMessage(data: Uint8Array): MeshMessage | null {
    try {
      // First, try to parse as a complete message
      const message = this.parseMessage(data);
      if (!message) {
        return null;
      }

      this.logger.debug('Received mesh message', {
        type: message.type,
        from: message.from,
        to: message.to,
      });

      // Handle routing messages
      const routingMessage =
        this.routingMessageFactory.fromMeshMessage(message);
      if (routingMessage) {
        this.handleIncomingRoutingMessage(message);
        return message; // Return for potential further processing
      }

      // Handle regular messages
      this.fragmentationStats.totalMessagesReceived++;
      return message;
    } catch (error) {
      this.logger.error('Failed to receive message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ==========================================
  // Routing-Aware Messaging
  // ==========================================

  async sendRoutedMessage(
    message: MeshMessage,
    destination: string
  ): Promise<boolean> {
    try {
      // Find route to destination
      const route = await this.getRouteToDestination(destination);
      if (!route) {
        this.logger.warn('No route to destination, attempting discovery', {
          destination,
        });

        // Attempt route discovery
        const discoveredRoute = await this.discoverRoute(destination);
        if (!discoveredRoute) {
          this.logger.error('Route discovery failed', { destination });
          return false;
        }
      }

      const finalRoute =
        route || (await this.getRouteToDestination(destination));
      if (!finalRoute) {
        return false;
      }

      // Forward message using UTXO message forwarder
      const success = await this.utxoMessageForwarder.forwardUTXOMessage(
        message,
        finalRoute.nextHop
      );

      if (success) {
        this.fragmentationStats.totalMessagesSent++;
        this.emit('message_sent', { destination, route: finalRoute });
      }

      return success;
    } catch (error) {
      this.logger.error('Failed to send routed message', {
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async broadcastMessage(
    message: MeshMessage,
    excludeNodes?: string[]
  ): Promise<boolean> {
    try {
      let successCount = 0;
      const neighborIds = Array.from(this.neighbors.keys()).filter(
        nodeId => !excludeNodes?.includes(nodeId)
      );

      this.logger.debug('Broadcasting message to neighbors', {
        messageType: message.type,
        neighborCount: neighborIds.length,
      });

      // Send to all neighbors
      const sendPromises = neighborIds.map(async neighborId => {
        try {
          const success = await this.utxoMessageForwarder.forwardUTXOMessage(
            message,
            neighborId
          );
          if (success) {
            successCount++;
          }
          return success;
        } catch (error) {
          this.logger.error('Failed to broadcast to neighbor', {
            neighborId,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      });

      await Promise.all(sendPromises);

      const broadcastSuccess = successCount > 0;
      if (broadcastSuccess) {
        this.fragmentationStats.totalMessagesSent++;
        this.emit('message_broadcast', {
          successCount,
          totalNeighbors: neighborIds.length,
        });
      }

      return broadcastSuccess;
    } catch (error) {
      this.logger.error('Failed to broadcast message', {
        messageType: message.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ==========================================
  // Route Management
  // ==========================================

  async discoverRoute(
    destination: string
  ): Promise<BlockchainRouteEntry | null> {
    try {
      this.logger.info('Starting route discovery', { destination });

      // Create route request
      const routeRequest = this.routingMessageFactory.createUTXORouteRequest(
        destination,
        'any', // Accept any node type for discovery
        0, // Minimum UTXO completeness
        0 // Minimum blockchain height
      );

      // Broadcast route request
      const requestMessage =
        this.routingMessageFactory.toMeshMessage(routeRequest);
      const broadcastSuccess = await this.broadcastMessage(requestMessage);

      if (!broadcastSuccess) {
        this.logger.warn(
          'Failed to broadcast route request, but continuing with timeout',
          { destination }
        );
        // Continue to wait for timeout even if broadcast failed
      }

      // Wait for route reply (simplified - in real implementation would be event-driven)
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          this.logger.warn('Route discovery timeout', { destination });
          resolve(null);
        }, this.routingConfig.routeDiscoveryTimeout);

        // Listen for route discovery completion
        const onRouteDiscovered = (route: BlockchainRouteEntry) => {
          if (route.destination === destination) {
            clearTimeout(timeout);
            this.removeListener('route_discovered', onRouteDiscovered);
            resolve(route);
          }
        };

        this.on('route_discovered', onRouteDiscovered);
      });
    } catch (error) {
      this.logger.error('Route discovery failed', {
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  getRouteToDestination(destination: string): BlockchainRouteEntry | null {
    return this.utxoRouteManager.getBestRouteForUTXO(destination);
  }

  invalidateRoute(destination: string, nextHop: string): void {
    const removed = this.utxoRouteManager.removeRoute(destination, nextHop);
    if (removed) {
      this.logger.info('Invalidated route', { destination, nextHop });
      this.emit('route_lost', destination);
    }
  }

  // ==========================================
  // UTXO-Specific Blockchain Methods
  // ==========================================

  async sendUTXOTransaction(tx: UTXOTransaction): Promise<boolean> {
    try {
      // Find best route to a full node for transaction processing
      const fullNodeRoute = this.utxoRouteManager.getBestRouteForFullNode();
      if (!fullNodeRoute) {
        this.logger.warn('No full node available for UTXO transaction');
        // Broadcast to all neighbors as fallback
        const message: MeshMessage = {
          type: 'transaction',
          payload: tx,
          timestamp: tx.timestamp,
          from: this.nodeId,
          signature: this.signMessage('transaction'),
        };
        return this.broadcastMessage(message);
      }

      const message: MeshMessage = {
        type: 'transaction',
        payload: tx,
        timestamp: tx.timestamp,
        from: this.nodeId,
        to: fullNodeRoute.destination,
        signature: this.signMessage('transaction'),
      };

      return this.sendRoutedMessage(message, fullNodeRoute.destination);
    } catch (error) {
      this.logger.error('Failed to send UTXO transaction', {
        txId: tx.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async sendBlock(block: Block): Promise<boolean> {
    try {
      const message: MeshMessage = {
        type: 'block',
        payload: block,
        timestamp: block.timestamp,
        from: this.nodeId,
        signature: this.signMessage('block'),
      };

      // Broadcast blocks to all neighbors for propagation
      return this.broadcastMessage(message);
    } catch (error) {
      this.logger.error('Failed to send block', {
        blockIndex: block.index,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async sendMerkleProof(proof: CompressedMerkleProof): Promise<boolean> {
    try {
      const message: MeshMessage = {
        type: 'sync',
        payload: proof,
        timestamp: Date.now(),
        from: this.nodeId,
        signature: this.signMessage('sync'),
      };

      // Send merkle proofs to requesting node (would need destination from context)
      return this.broadcastMessage(message);
    } catch (error) {
      this.logger.error('Failed to send merkle proof', {
        txId: proof.txId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ==========================================
  // Network Topology
  // ==========================================

  getNetworkTopology(): NetworkTopology {
    const nodes = new Map<string, NetworkNode>();
    const links = new Map<string, Set<string>>();

    // Add our node
    nodes.set(this.nodeId, {
      id: this.nodeId,
      address: this.nodeId,
      port: 0,
      type: this.nodeType === 'full' ? 'full' : 'light',
      isOnline: this.isConnected,
      lastSeen: Date.now(),
    });

    // Add neighbors
    for (const [neighborId, neighbor] of this.neighbors) {
      nodes.set(neighborId, {
        id: neighborId,
        address: neighborId,
        port: 0,
        type: 'light', // Would be determined from hello messages
        isOnline: true,
        lastSeen: Date.now(),
      });

      // Add bidirectional link
      if (!links.has(this.nodeId)) {
        links.set(this.nodeId, new Set());
      }
      if (!links.has(neighborId)) {
        links.set(neighborId, new Set());
      }
      links.get(this.nodeId)!.add(neighborId);
      links.get(neighborId)!.add(this.nodeId);
    }

    return {
      nodes,
      links,
      lastUpdated: Date.now(),
    };
  }

  getNeighbors(): any[] {
    return Array.from(this.neighbors.values());
  }

  getReachableNodes(): string[] {
    const routes = this.utxoRouteManager.getAllRoutes();
    return Array.from(routes.keys());
  }

  // ==========================================
  // Fragmentation Interface Compatibility
  // ==========================================

  setFragmentationConfig(config: FragmentationConfig): void {
    this.fragmentationConfig = { ...config };
    this.logger.info('Updated fragmentation configuration', config);
  }

  getFragmentationStats(): FragmentationStats {
    return { ...this.fragmentationStats };
  }

  clearReassemblyBuffers(): void {
    this.logger.debug('Cleared reassembly buffers');
    // Would clear fragmentation manager buffers
  }

  async retransmitMissingFragments(messageId: string): Promise<void> {
    this.logger.debug('Retransmitting missing fragments', { messageId });
    // Would trigger retransmission in fragmentation manager
  }

  // ==========================================
  // Connection Management
  // ==========================================

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.logger.info('Connecting to UTXO-enhanced mesh network', {
      nodeId: this.nodeId,
      nodeType: this.nodeType,
    });

    this.isConnected = true;
    this.startPeriodicHello();
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.logger.info('Disconnecting from UTXO-enhanced mesh network', {
      nodeId: this.nodeId,
    });

    this.isConnected = false;
    this.neighbors.clear();
    this.emit('disconnected');
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private setupRoutingMessageHandlers(): void {
    // Handle route requests
    this.routingMessageHandler.setRouteRequestHandler(async request => {
      if (request.destination === this.nodeId) {
        // This request is for us, generate reply
        return this.routingMessageFactory.createUTXORouteReply(
          request,
          this.nodeType,
          this.utxoSetCompleteness,
          this.currentBlockchainHeight,
          this.lastUTXOSync,
          this.availableServices
        );
      }
      return null;
    });

    // Handle route replies
    this.routingMessageHandler.setRouteReplyHandler(async reply => {
      // Add route to routing table
      const route: BlockchainRouteEntry = {
        destination: reply.destination,
        nextHop: reply.path[reply.path.length - 2] || reply.destination,
        hopCount: reply.hopCount,
        sequenceNumber: reply.sequenceNumber,
        timestamp: Date.now(),
        linkQuality: 0.8, // Would be measured
        nodeType: reply.nodeType,
        utxoSetCompleteness: reply.utxoSetCompleteness,
        blockchainHeight: reply.currentBlockchainHeight,
        isActive: true,
        lastUTXOSync: reply.lastUTXOSync,
        signature: reply.signature,
      };

      if (this.utxoRouteManager.addRoute(route)) {
        this.emit('route_discovered', route);
      }
    });

    // Handle route errors
    this.routingMessageHandler.setRouteErrorHandler(async error => {
      // Remove broken routes
      for (const destination of error.affectedDestinations) {
        this.invalidateRoute(destination, error.brokenLink.to);
      }
    });

    // Handle hello messages
    this.routingMessageHandler.setHelloMessageHandler(async hello => {
      // Update neighbor information
      this.neighbors.set(hello.nodeId, {
        nodeId: hello.nodeId,
        nodeType: hello.nodeType,
        blockchainHeight: hello.currentBlockchainHeight,
        utxoSetCompleteness: hello.utxoSetCompleteness,
        lastSeen: Date.now(),
      });

      // Update blockchain metrics if this is a better source
      if (hello.currentBlockchainHeight > this.currentBlockchainHeight) {
        this.updateBlockchainMetrics(
          hello.currentBlockchainHeight,
          hello.utxoSetCompleteness
        );
      }
    });
  }

  private async handleOutgoingRoutingMessage(
    message: MeshMessage
  ): Promise<boolean> {
    // Optimize message size for LoRa constraints
    const routingMessage = this.routingMessageFactory.fromMeshMessage(message);
    if (!routingMessage) {
      return false;
    }

    if (!this.routingMessageOptimizer.fitsLoRaConstraints(routingMessage)) {
      this.logger.warn('Routing message too large for LoRa transmission', {
        type: routingMessage.type,
        size: this.routingMessageOptimizer.estimateCompressedSize(
          routingMessage
        ),
      });
      // Would need fragmentation for large routing messages
    }

    return this.broadcastMessage(message);
  }

  private async handleIncomingRoutingMessage(
    message: MeshMessage
  ): Promise<void> {
    try {
      const responseMessage =
        await this.routingMessageHandler.processRoutingMessage(message);
      if (responseMessage) {
        // Send response back to originator
        await this.sendRoutedMessage(responseMessage, message.from);
      }
    } catch (error) {
      this.logger.error('Failed to handle incoming routing message', {
        from: message.from,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private parseMessage(data: Uint8Array): MeshMessage | null {
    try {
      // Basic message parsing - in real implementation would handle fragmentation
      const jsonString = new TextDecoder().decode(data);
      return JSON.parse(jsonString) as MeshMessage;
    } catch (error) {
      this.logger.error('Failed to parse message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private signMessage(content: string): string {
    return `signature_${content}_${this.nodeId}`;
  }

  private startPeriodicOperations(): void {
    // Update routing statistics periodically
    setInterval(() => {
      this.routingStats = this.utxoRouteManager.getRoutingStatistics();
    }, 60000); // Every minute
  }

  private startPeriodicHello(): void {
    const sendHello = () => {
      if (!this.isConnected) {
        return;
      }

      const hello = this.routingMessageFactory.createBlockchainHelloMessage(
        this.nodeType,
        this.currentBlockchainHeight,
        this.utxoSetCompleteness,
        this.lastUTXOSync,
        this.availableServices,
        Array.from(this.neighbors.values()).map(neighbor => ({
          nodeId: neighbor.nodeId,
          linkQuality: 0.8, // Would be measured
          nodeType: neighbor.nodeType,
          blockchainHeight: neighbor.blockchainHeight,
        }))
      );

      const helloMessage = this.routingMessageFactory.toMeshMessage(hello);
      this.broadcastMessage(helloMessage);
    };

    // Send hello immediately and then periodically
    sendHello();
    setInterval(sendHello, 30000); // Every 30 seconds
  }

  private updateBlockchainMetrics(
    height: number,
    utxoCompleteness: number
  ): void {
    this.currentBlockchainHeight = height;
    this.utxoSetCompleteness = utxoCompleteness;
    this.lastUTXOSync = Date.now();

    this.logger.debug('Updated blockchain metrics', {
      height,
      utxoCompleteness,
    });
  }

  // ==========================================
  // Public Getters for Monitoring
  // ==========================================

  getRoutingStatistics(): RoutingMetrics {
    return { ...this.routingStats };
  }

  isConnectedToMesh(): boolean {
    return this.isConnected;
  }

  getNodeType(): 'full' | 'light' | 'mining' {
    return this.nodeType;
  }

  getCurrentBlockchainHeight(): number {
    return this.currentBlockchainHeight;
  }

  getUTXOSetCompleteness(): number {
    return this.utxoSetCompleteness;
  }
}
