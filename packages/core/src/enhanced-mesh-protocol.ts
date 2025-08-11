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
  type DutyCycleConfig,
  type IDutyCycleManager,
  type IDatabase,
  type DutyCycleWarning,
  type DutyCycleViolation,
  type TransmissionRecord,
  MessagePriority,
  type ReliableMessage,
  type AckMessage,
  type ReliableDeliveryConfig,
  type DeliveryStatus,
  type DeliveryMetrics,
  type IReliableDeliveryManager,
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
import { DutyCycleManager } from './duty-cycle.js';
import { DutyCycleConfigFactory } from './duty-cycle-config.js';
import { UTXOReliableDeliveryManager } from './utxo-reliable-delivery-manager.js';
import { Logger } from '@lorachain/shared';
import { EventEmitter } from 'events';

/**
 * Enhanced MeshProtocol with UTXO-aware routing capabilities and duty cycle management
 *
 * BREAKING CHANGE: Complete enhancement of MeshProtocol with routing support and duty cycle compliance.
 * Integrates with existing fragmentation system while adding blockchain-optimized routing and
 * regional regulatory compliance for LoRa mesh networking.
 *
 * NEW FEATURES:
 * - Duty cycle management with multi-regional compliance (EU, US, JP, AU, etc.)
 * - Priority-based message queuing with UTXO transaction fee prioritization
 * - Adaptive transmission scheduling to optimize throughput within regulatory limits
 * - Persistent transmission history tracking for compliance auditing
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

  // BREAKING CHANGE: Added duty cycle management
  private dutyCycleManager: IDutyCycleManager;
  private dutyCycleConfig: DutyCycleConfig;

  // BREAKING CHANGE: Added reliable delivery management
  private reliableDeliveryManager: IReliableDeliveryManager;
  private reliableDeliveryConfig: ReliableDeliveryConfig;

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
    dutyCycleConfig: DutyCycleConfig,
    reliableDeliveryConfig?: ReliableDeliveryConfig,
    database?: IDatabase,
    cryptoService?: CryptographicService
  ) {
    super();

    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.nodeKeyPair = nodeKeyPair;
    this.routingConfig = routingConfig;
    this.fragmentationConfig = fragmentationConfig;
    this.dutyCycleConfig = dutyCycleConfig;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    // BREAKING CHANGE: Initialize duty cycle manager
    this.dutyCycleManager = new DutyCycleManager(
      this.dutyCycleConfig,
      database
    );

    this.logger.info('Duty cycle management initialized', {
      region: this.dutyCycleConfig.region,
      frequencyBand: this.dutyCycleConfig.activeFrequencyBand,
      maxDutyCycle: this.dutyCycleConfig.maxDutyCyclePercent
        ? `${(this.dutyCycleConfig.maxDutyCyclePercent * 100).toFixed(1)}%`
        : 'none',
    });

    // BREAKING CHANGE: Initialize reliable delivery manager
    this.reliableDeliveryConfig = reliableDeliveryConfig || {
      defaultRetryPolicy: {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 1.5,
        jitterMaxMs: 500,
        maxAttempts: 3,
      },
      maxPendingMessages: 1000,
      ackTimeoutMs: 5000,
      enablePersistence: false,
      deadLetterThreshold: 10,
      enableCompression: true,
      enableDutyCycleIntegration: true,
      enablePriorityCalculation: true,
    };

    this.reliableDeliveryManager = new UTXOReliableDeliveryManager(
      nodeId,
      nodeKeyPair,
      this.reliableDeliveryConfig,
      undefined, // ACK handler will be created internally
      this.cryptoService
    );

    this.logger.info('Reliable delivery management initialized', {
      maxPendingMessages: this.reliableDeliveryConfig.maxPendingMessages,
      ackTimeoutMs: this.reliableDeliveryConfig.ackTimeoutMs,
      enableCompression: this.reliableDeliveryConfig.enableCompression,
      enableDutyCycleIntegration:
        this.reliableDeliveryConfig.enableDutyCycleIntegration,
    });

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

    // BREAKING CHANGE: Start duty cycle manager
    this.dutyCycleManager.start();

    // BREAKING CHANGE: Set up reliable delivery integration
    this.setupReliableDeliveryIntegration();

    // Set up duty cycle event handlers
    this.setupDutyCycleEventHandlers();

    // Set up reliable delivery event handlers
    this.setupReliableDeliveryEventHandlers();
  }

  // ==========================================
  // Core Mesh Protocol Interface (IEnhancedMeshProtocol)
  // ==========================================

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

  // BREAKING CHANGE: Updated to use duty cycle management
  async sendUTXOTransaction(tx: UTXOTransaction): Promise<boolean> {
    try {
      // Create message
      const message: MeshMessage = {
        type: 'transaction',
        payload: tx,
        timestamp: tx.timestamp,
        from: this.nodeId,
        signature: this.signMessage('transaction'),
      };

      // Calculate priority based on UTXO transaction fee
      const priority = this.calculateUTXOPriority(tx);

      this.logger.debug(
        'Queueing UTXO transaction with duty cycle management',
        {
          txId: tx.id,
          priority: MessagePriority[priority],
          fee: tx.fee,
          inputCount: tx.inputs.length,
          outputCount: tx.outputs.length,
        }
      );

      // Queue message with duty cycle manager instead of direct transmission
      const queued = await this.dutyCycleManager.enqueueMessage(
        message,
        priority
      );

      if (queued) {
        // Message was successfully queued for duty cycle compliant transmission
        return true;
      } else {
        this.logger.error('Failed to queue UTXO transaction - queue full', {
          txId: tx.id,
        });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send UTXO transaction', {
        txId: tx.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Calculate message priority based on UTXO transaction fee
  private calculateUTXOPriority(utxoTx: UTXOTransaction): MessagePriority {
    const messageSize = JSON.stringify(utxoTx).length;
    const feePerByte = utxoTx.fee / messageSize;

    // Fee-based priority thresholds (in satoshis per byte equivalent)
    const HIGH_FEE_THRESHOLD = 10;
    const NORMAL_FEE_THRESHOLD = 1;

    if (feePerByte >= HIGH_FEE_THRESHOLD) return MessagePriority.HIGH;
    if (feePerByte >= NORMAL_FEE_THRESHOLD) return MessagePriority.NORMAL;
    return MessagePriority.LOW;
  }

  // BREAKING CHANGE: Updated to use duty cycle management
  async sendBlock(block: Block): Promise<boolean> {
    try {
      const message: MeshMessage = {
        type: 'block',
        payload: block,
        timestamp: block.timestamp,
        from: this.nodeId,
        signature: this.signMessage('block'),
      };

      // Blocks get CRITICAL priority for consensus propagation
      const priority = MessagePriority.CRITICAL;

      this.logger.debug('Queueing block with duty cycle management', {
        blockIndex: block.index,
        blockHash: block.hash,
        priority: MessagePriority[priority],
        transactionCount: block.transactions.length,
      });

      // Queue message with duty cycle manager instead of direct broadcast
      const queued = await this.dutyCycleManager.enqueueMessage(
        message,
        priority
      );

      if (queued) {
        // Block was successfully queued for duty cycle compliant transmission
        return true;
      } else {
        this.logger.error('Failed to queue block - queue full', {
          blockIndex: block.index,
        });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send block', {
        blockIndex: block.index,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // BREAKING CHANGE: Updated to use duty cycle management
  async sendMerkleProof(proof: CompressedMerkleProof): Promise<boolean> {
    try {
      const message: MeshMessage = {
        type: 'sync',
        payload: proof,
        timestamp: Date.now(),
        from: this.nodeId,
        signature: this.signMessage('sync'),
      };

      // Merkle proofs get HIGH priority for SPV verification
      const priority = MessagePriority.HIGH;

      this.logger.debug('Queueing merkle proof with duty cycle management', {
        txId: proof.txId,
        priority: MessagePriority[priority],
        proofIndex: proof.index,
      });

      // Queue message with duty cycle manager instead of direct broadcast
      const queued = await this.dutyCycleManager.enqueueMessage(
        message,
        priority
      );

      if (queued) {
        // Merkle proof was successfully queued for duty cycle compliant transmission
        return true;
      } else {
        this.logger.error('Failed to queue merkle proof - queue full', {
          txId: proof.txId,
        });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send merkle proof', {
        txId: proof.txId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ==========================================
  // BREAKING CHANGE: Duty Cycle Management API
  // ==========================================

  /**
   * Get current duty cycle statistics
   */
  getDutyCycleStats() {
    return this.dutyCycleManager.getDutyCycleStats();
  }

  /**
   * Get message queue status
   */
  getQueueStatus() {
    return this.dutyCycleManager.getQueueStatus();
  }

  /**
   * Check if a transmission can be made immediately
   */
  canTransmitNow(
    estimatedTimeMs?: number,
    priority?: MessagePriority
  ): boolean {
    return this.dutyCycleManager.canTransmit(estimatedTimeMs || 1000, priority);
  }

  /**
   * Get the duty cycle configuration
   */
  getDutyCycleConfig(): DutyCycleConfig {
    return this.dutyCycleManager.getConfig();
  }

  /**
   * Update duty cycle configuration
   */
  updateDutyCycleConfig(config: Partial<DutyCycleConfig>): void {
    this.dutyCycleManager.updateConfig(config);
  }

  /**
   * Get transmission history for compliance auditing
   */
  getTransmissionHistory(hours?: number) {
    return this.dutyCycleManager.getTransmissionHistory(hours);
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

  // BREAKING CHANGE: Added duty cycle event handlers
  private setupDutyCycleEventHandlers(): void {
    this.dutyCycleManager.on(
      'dutyCycleWarning',
      (warning: DutyCycleWarning) => {
        this.logger.warn('Duty cycle approaching limit', {
          currentDutyCycle: `${(warning.currentDutyCycle * 100).toFixed(2)}%`,
          threshold: `${(warning.threshold * 100).toFixed(1)}%`,
          timeToReset: `${Math.ceil(warning.timeToReset / 1000)}s`,
          affectedMessages: warning.affectedMessages,
        });
        this.emit('duty_cycle_warning', warning);
      }
    );

    this.dutyCycleManager.on(
      'dutyCycleViolation',
      (violation: DutyCycleViolation) => {
        this.logger.error('Duty cycle violation detected', {
          region: violation.region,
          frequencyBand: violation.frequencyBand,
          attemptedDutyCycle: `${(violation.attemptedDutyCycle * 100).toFixed(2)}%`,
          maxAllowed: `${(violation.maxAllowedDutyCycle * 100).toFixed(1)}%`,
          severity: violation.severity,
        });
        this.emit('duty_cycle_violation', violation);
      }
    );

    this.dutyCycleManager.on('queueOverflow', (droppedMessage: any) => {
      this.logger.warn('Message queue overflow, dropping message', {
        messageType: this.getMessageType(droppedMessage),
        priority: droppedMessage.priority,
      });
      this.emit('message_dropped', droppedMessage);
    });

    this.dutyCycleManager.on(
      'transmissionComplete',
      (record: TransmissionRecord) => {
        this.logger.debug('Transmission completed with duty cycle tracking', {
          messageType: record.messageType,
          duration: `${record.durationMs}ms`,
          frequencyMHz: record.frequencyMHz,
          powerLevel: `${record.powerLevel_dBm}dBm`,
        });
        this.fragmentationStats.totalMessagesSent++;
      }
    );
  }

  // BREAKING CHANGE: Added reliable delivery integration methods
  private setupReliableDeliveryIntegration(): void {
    // Set up reliable delivery manager with mesh protocol reference
    this.reliableDeliveryManager.setMeshProtocol(this);

    // Integrate with duty cycle manager if enabled
    if (this.reliableDeliveryConfig.enableDutyCycleIntegration) {
      this.reliableDeliveryManager.setDutyCycleManager(this.dutyCycleManager);
    }

    // TODO: Integrate with compression manager when available
    // if (this.reliableDeliveryConfig.enableCompression && this.compressionManager) {
    //   this.reliableDeliveryManager.setCompressionManager(this.compressionManager);
    // }

    // TODO: Integrate with priority calculator when available
    // if (this.reliableDeliveryConfig.enablePriorityCalculation && this.priorityCalculator) {
    //   this.reliableDeliveryManager.setPriorityCalculator(this.priorityCalculator);
    // }

    this.logger.info('Reliable delivery integration configured', {
      dutyCycleIntegration:
        this.reliableDeliveryConfig.enableDutyCycleIntegration,
      compressionEnabled: this.reliableDeliveryConfig.enableCompression,
      priorityCalculationEnabled:
        this.reliableDeliveryConfig.enablePriorityCalculation,
    });
  }

  private setupReliableDeliveryEventHandlers(): void {
    this.reliableDeliveryManager.on('delivered', (event: any) => {
      this.logger.debug('Message delivery confirmed', {
        messageId: event.messageId,
        deliveryTime: event.deliveryTime,
      });
      this.emit('message_delivered', event);
    });

    this.reliableDeliveryManager.on('failed', (event: any) => {
      this.logger.warn('Message delivery failed', {
        messageId: event.messageId,
        reason: event.reason,
      });
      this.emit('message_delivery_failed', event);
    });

    this.reliableDeliveryManager.on('retry', (event: any) => {
      this.logger.debug('Message retry attempted', {
        messageId: event.messageId,
        attemptCount: event.attemptCount,
      });
      this.emit('message_retry', event);
    });
  }

  // Helper method to determine message type from message content
  private getMessageType(
    message: any
  ): 'UTXO_TRANSACTION' | 'BLOCK' | 'ROUTING' | 'DISCOVERY' {
    if (message.type === 'transaction' || message.type === 'utxo_transaction')
      return 'UTXO_TRANSACTION';
    if (message.type === 'block') return 'BLOCK';
    if (message.type === 'discovery' || message.type === 'hello')
      return 'DISCOVERY';
    return 'ROUTING';
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

  // ==========================================
  // BREAKING CHANGE: Reliable Delivery API
  // ==========================================

  /**
   * Send a reliable message with delivery confirmation
   * Integrates with existing UTXO compression and duty cycle systems
   */
  async sendReliableMessage(
    message: MeshMessage,
    reliability: 'best-effort' | 'confirmed' | 'guaranteed' = 'confirmed',
    targetNodeId?: string
  ): Promise<string> {
    const reliableMessage: ReliableMessage = {
      ...message,
      id: message.signature || this.generateMessageId(),
      reliability,
      maxRetries:
        reliability === 'guaranteed' ? 5 : reliability === 'confirmed' ? 3 : 1,
      timeoutMs: this.reliableDeliveryConfig.ackTimeoutMs,
      priority: this.calculateMessagePriority(message),
    };

    return await this.reliableDeliveryManager.sendReliableMessage(
      reliableMessage,
      targetNodeId
    );
  }

  /**
   * Send reliable UTXO transaction with guaranteed delivery
   * Optimized for UTXO blockchain operations
   */
  async sendReliableUTXOTransaction(
    tx: UTXOTransaction,
    reliability: 'confirmed' | 'guaranteed' = 'confirmed'
  ): Promise<string> {
    const message: MeshMessage = {
      type: 'transaction',
      payload: tx,
      timestamp: tx.timestamp,
      from: this.nodeId,
      signature: this.signMessage('transaction'),
    };

    return await this.sendReliableMessage(message, reliability);
  }

  /**
   * Send reliable block with critical delivery priority
   * Essential for consensus propagation
   */
  async sendReliableBlock(
    block: Block,
    reliability: 'guaranteed' = 'guaranteed'
  ): Promise<string> {
    const message: MeshMessage = {
      type: 'block',
      payload: block,
      timestamp: block.timestamp,
      from: this.nodeId,
      signature: this.signMessage('block'),
    };

    return await this.sendReliableMessage(message, reliability);
  }

  /**
   * Send reliable merkle proof for SPV clients
   */
  async sendReliableMerkleProof(
    proof: CompressedMerkleProof,
    reliability: 'confirmed' = 'confirmed'
  ): Promise<string> {
    const message: MeshMessage = {
      type: 'sync',
      payload: proof,
      timestamp: Date.now(),
      from: this.nodeId,
      signature: this.signMessage('sync'),
    };

    return await this.sendReliableMessage(message, reliability);
  }

  /**
   * Get delivery status for a reliable message
   */
  getReliableMessageStatus(messageId: string): DeliveryStatus | null {
    return this.reliableDeliveryManager.getDeliveryStatus(messageId);
  }

  /**
   * Get reliable delivery performance metrics
   */
  getReliableDeliveryMetrics(): DeliveryMetrics {
    return this.reliableDeliveryManager.getDeliveryMetrics();
  }

  /**
   * Get reliable delivery manager instance for advanced operations
   */
  getReliableDeliveryManager(): IReliableDeliveryManager {
    return this.reliableDeliveryManager;
  }

  /**
   * Handle incoming acknowledgment message
   * Automatically processes ACKs from the mesh network
   */
  async handleIncomingAcknowledgment(ack: AckMessage): Promise<void> {
    await this.reliableDeliveryManager.handleAcknowledgment(ack);
  }

  /**
   * Enhanced sendMessage with reliable delivery integration
   */
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

  /**
   * Internal message sending implementation
   * Preserves existing mesh protocol functionality
   */
  private async sendMessageInternal(message: MeshMessage): Promise<boolean> {
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

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateMessagePriority(message: MeshMessage): number {
    // Simple priority calculation - could be enhanced with priority calculator
    switch (message.type) {
      case 'block':
        return 0; // Critical priority
      case 'transaction':
        return 1; // High priority
      case 'sync':
        return 2; // Normal priority
      case 'discovery':
      default:
        return 3; // Low priority
    }
  }

  // Enhanced disconnect to include reliable delivery cleanup
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.logger.info('Disconnecting from UTXO-enhanced mesh network', {
      nodeId: this.nodeId,
    });

    // Shutdown reliable delivery manager
    await this.reliableDeliveryManager.shutdown();

    this.isConnected = false;
    this.neighbors.clear();
    this.emit('disconnected');
  }
}
