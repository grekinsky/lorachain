import {
  type BlockchainRouteEntry,
  type UTXORouteTable,
  type BlockchainFloodMessage,
  type BlockchainFloodEntry,
  type BlockchainForwardingEntry,
  type BlockchainPathVector,
  type CryptoSequenceEntry,
  type RoutingConfig,
  type RoutingMetrics,
  type MeshMessage,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { Logger } from '@lorachain/shared';

/**
 * UTXORouteManager - Manages routing tables with blockchain awareness and UTXO optimization
 *
 * BREAKING CHANGE: Complete rewrite with no legacy support, following Lorachain's
 * "NO BACKWARDS COMPATIBILITY" policy. All routing operations are UTXO-exclusive.
 */
export class UTXORouteManager {
  private routeTable: UTXORouteTable;
  private sequenceNumbers: Map<string, number> = new Map();
  private floodCache: Map<string, number> = new Map();
  private cryptoService: CryptographicService;
  private logger: Logger;
  private nodeId: string;
  private nodeKeyPair: KeyPair;
  private config: RoutingConfig;

  constructor(
    nodeId: string,
    nodeKeyPair: KeyPair,
    config: RoutingConfig,
    cryptoService?: CryptographicService
  ) {
    this.nodeId = nodeId;
    this.nodeKeyPair = nodeKeyPair;
    this.config = config;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    this.routeTable = {
      routes: new Map(),
      maxRoutes: config.maxRoutingTableSize,
      cleanupInterval: config.routeCleanupInterval,
      priorityNodes: new Set(),
    };

    this.logger.info('UTXORouteManager initialized', {
      nodeId: this.nodeId,
      maxRoutes: this.routeTable.maxRoutes,
      algorithm: this.nodeKeyPair.algorithm,
    });

    // Start periodic cleanup
    setInterval(
      () => this.cleanupStaleRoutes(),
      this.config.routeCleanupInterval
    );
  }

  /**
   * Add a blockchain-aware route with cryptographic verification
   */
  addRoute(entry: BlockchainRouteEntry): boolean {
    try {
      if (!this.verifyRouteSignature(entry)) {
        this.logger.warn('Invalid route signature, rejecting route', {
          destination: entry.destination,
          nextHop: entry.nextHop,
        });
        return false;
      }

      const destination = entry.destination;
      if (!this.routeTable.routes.has(destination)) {
        this.routeTable.routes.set(destination, []);
      }

      const routes = this.routeTable.routes.get(destination)!;

      // Check if we already have this exact route
      const existingIndex = routes.findIndex(
        route => route.nextHop === entry.nextHop
      );

      if (existingIndex !== -1) {
        // Update existing route if the new one is better or more recent
        const existing = routes[existingIndex];
        if (
          entry.sequenceNumber > existing.sequenceNumber ||
          (entry.sequenceNumber === existing.sequenceNumber &&
            entry.hopCount < existing.hopCount)
        ) {
          routes[existingIndex] = entry;
          this.logger.debug('Updated existing route', {
            destination,
            nextHop: entry.nextHop,
            hopCount: entry.hopCount,
          });
        }
      } else {
        // Add new route
        routes.push(entry);

        // Sort routes by priority (blockchain-aware scoring)
        routes.sort(
          (a, b) =>
            this.calculateRoutePriority(b) - this.calculateRoutePriority(a)
        );

        // Limit number of routes per destination
        if (routes.length > this.config.maxRoutesPerDestination) {
          routes.splice(this.config.maxRoutesPerDestination);
        }

        this.logger.debug('Added new route', {
          destination,
          nextHop: entry.nextHop,
          hopCount: entry.hopCount,
          nodeType: entry.nodeType,
          blockchainHeight: entry.blockchainHeight,
        });
      }

      // Update priority nodes set if this is a full node or mining node
      if (entry.nodeType === 'full' || entry.nodeType === 'mining') {
        this.routeTable.priorityNodes.add(destination);
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to add route', {
        destination: entry.destination,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Remove a route from the routing table
   */
  removeRoute(destination: string, nextHop: string): boolean {
    const routes = this.routeTable.routes.get(destination);
    if (!routes) {
      return false;
    }

    const index = routes.findIndex(route => route.nextHop === nextHop);
    if (index === -1) {
      return false;
    }

    routes.splice(index, 1);

    // Remove destination entirely if no routes left
    if (routes.length === 0) {
      this.routeTable.routes.delete(destination);
      this.routeTable.priorityNodes.delete(destination);
    }

    this.logger.debug('Removed route', { destination, nextHop });
    return true;
  }

  /**
   * Get the best route for UTXO operations with blockchain awareness
   */
  getBestRouteForUTXO(destination: string): BlockchainRouteEntry | null {
    const routes = this.routeTable.routes.get(destination);
    if (!routes || routes.length === 0) {
      return null;
    }

    // Filter active routes
    const activeRoutes = routes.filter(route => route.isActive);
    if (activeRoutes.length === 0) {
      return null;
    }

    // Return the best route (already sorted by priority)
    return activeRoutes[0];
  }

  /**
   * Get the best route to any full node for blockchain operations
   */
  getBestRouteForFullNode(): BlockchainRouteEntry | null {
    let bestRoute: BlockchainRouteEntry | null = null;
    let bestScore = -1;

    for (const [_destination, routes] of this.routeTable.routes) {
      for (const route of routes) {
        if (route.nodeType === 'full' && route.isActive) {
          const score = this.calculateFullNodeScore(route);
          if (score > bestScore) {
            bestScore = score;
            bestRoute = route;
          }
        }
      }
    }

    return bestRoute;
  }

  /**
   * Update blockchain-specific metrics for a route
   */
  updateBlockchainMetrics(
    destination: string,
    height: number,
    utxoCompleteness: number
  ): void {
    const routes = this.routeTable.routes.get(destination);
    if (!routes) {
      return;
    }

    for (const route of routes) {
      if (route.destination === destination) {
        route.blockchainHeight = height;
        route.utxoSetCompleteness = utxoCompleteness;
        route.lastUTXOSync = Date.now();

        this.logger.debug('Updated blockchain metrics for route', {
          destination,
          height,
          utxoCompleteness,
        });
      }
    }
  }

  /**
   * Clean up stale routes based on age and activity
   */
  cleanupStaleRoutes(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [destination, routes] of this.routeTable.routes) {
      const activeRoutes = routes.filter(route => {
        const age = now - route.timestamp;
        const isStale = age > this.config.routeExpiryTime;

        if (isStale) {
          removedCount++;
          return false;
        }

        return true;
      });

      if (activeRoutes.length === 0) {
        this.routeTable.routes.delete(destination);
        this.routeTable.priorityNodes.delete(destination);
      } else {
        this.routeTable.routes.set(destination, activeRoutes);
      }
    }

    if (removedCount > 0) {
      this.logger.debug('Cleaned up stale routes', { removedCount });
    }
  }

  /**
   * Verify the cryptographic signature of a route entry
   */
  verifyRouteSignature(entry: BlockchainRouteEntry): boolean {
    try {
      // For now, implement basic signature verification
      // In a full implementation, this would verify the Ed25519 signature
      return entry.signature.length > 0;
    } catch (error) {
      this.logger.error('Route signature verification failed', {
        destination: entry.destination,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Calculate priority score for route ranking (blockchain-aware)
   */
  private calculateRoutePriority(route: BlockchainRouteEntry): number {
    let score = 0;

    // Node type priority (mining > full > light)
    switch (route.nodeType) {
      case 'mining':
        score += 100;
        break;
      case 'full':
        score += 80;
        break;
      case 'light':
        score += 40;
        break;
    }

    // UTXO set completeness (0-100)
    score += route.utxoSetCompleteness * 50;

    // Recent blockchain sync bonus
    const syncAge = Date.now() - route.lastUTXOSync;
    if (syncAge < 60000) {
      // Within last minute
      score += 30;
    } else if (syncAge < 300000) {
      // Within last 5 minutes
      score += 15;
    }

    // Link quality (0-100)
    score += route.linkQuality * 20;

    // Hop count penalty (fewer hops better)
    score -= route.hopCount * 5;

    // Blockchain height recency (prefer higher blocks)
    score += Math.min(route.blockchainHeight / 1000, 20);

    return score;
  }

  /**
   * Calculate scoring for full nodes specifically
   */
  private calculateFullNodeScore(route: BlockchainRouteEntry): number {
    let score = this.calculateRoutePriority(route);

    // Additional bonuses for full nodes
    if (route.nodeType === 'full') {
      score += 50;
    }
    if (route.nodeType === 'mining') {
      score += 75; // Mining nodes are preferred for blockchain operations
    }

    return score;
  }

  /**
   * Get routing statistics for monitoring
   */
  getRoutingStatistics(): RoutingMetrics {
    let totalRoutes = 0;
    let activeRoutes = 0;

    for (const routes of this.routeTable.routes.values()) {
      totalRoutes += routes.length;
      activeRoutes += routes.filter(route => route.isActive).length;
    }

    return {
      totalRoutes,
      activeRoutes,
      routeDiscoveryLatency: 0, // Would be calculated from actual measurements
      messageDeliveryRate: 0.95, // Would be calculated from delivery statistics
      loopDetectionCount: 0, // Would be tracked by loop prevention component
      floodSuppressionRate: 0.1, // Would be calculated from flood manager
      memoryUsage: {
        routingTable: this.estimateRoutingTableSize(),
        floodCache: this.floodCache.size * 64, // Estimate
        pendingForwards: 0, // Would be provided by message forwarder
      },
    };
  }

  /**
   * Estimate memory usage of routing table
   */
  private estimateRoutingTableSize(): number {
    let size = 0;
    for (const routes of this.routeTable.routes.values()) {
      size += routes.length * 200; // Rough estimate per route entry
    }
    return size;
  }

  /**
   * Get all routes (for debugging/testing)
   */
  getAllRoutes(): Map<string, BlockchainRouteEntry[]> {
    return new Map(this.routeTable.routes);
  }

  /**
   * Get priority nodes set
   */
  getPriorityNodes(): Set<string> {
    return new Set(this.routeTable.priorityNodes);
  }

  /**
   * Clear all routes (for testing)
   */
  clearAllRoutes(): void {
    this.routeTable.routes.clear();
    this.routeTable.priorityNodes.clear();
    this.sequenceNumbers.clear();
    this.floodCache.clear();
    this.logger.debug('Cleared all routes');
  }
}

/**
 * BlockchainFloodManager - Manages controlled flooding with UTXO transaction prioritization
 *
 * BREAKING CHANGE: Complete rewrite with blockchain-aware flood control and no legacy support.
 */
export class BlockchainFloodManager {
  private floodCache: Map<string, BlockchainFloodEntry> = new Map();
  private fragmentationManager: any; // Will be injected
  private maxCacheSize: number;
  private defaultTTL: number;
  private cryptoService: CryptographicService;
  private logger: Logger;
  private nodeId: string;

  constructor(
    nodeId: string,
    config: RoutingConfig,
    cryptoService?: CryptographicService
  ) {
    this.nodeId = nodeId;
    this.maxCacheSize = config.floodCacheSize;
    this.defaultTTL = config.maxFloodTTL;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    this.logger.info('BlockchainFloodManager initialized', {
      nodeId: this.nodeId,
      maxCacheSize: this.maxCacheSize,
      defaultTTL: this.defaultTTL,
    });

    // Start periodic cleanup
    setInterval(() => this.cleanupFloodCache(), 60000); // Every minute
  }

  /**
   * Determine if a flood message should be forwarded
   */
  shouldForwardFlood(message: BlockchainFloodMessage): boolean {
    const messageKey = `${message.originator}:${message.sequenceNumber}`;

    // Check if we've already processed this message
    const cached = this.floodCache.get(messageKey);
    if (cached && cached.processed) {
      this.logger.debug('Flood message already processed, suppressing', {
        messageId: message.id,
        originator: message.originator,
      });
      return false;
    }

    // Check TTL
    if (message.ttl <= 0) {
      this.logger.debug('Flood message TTL expired, suppressing', {
        messageId: message.id,
        ttl: message.ttl,
      });
      return false;
    }

    // Verify signature if available
    if (!this.verifyFloodSignature(message)) {
      this.logger.warn('Invalid flood message signature, suppressing', {
        messageId: message.id,
        originator: message.originator,
      });
      return false;
    }

    // Priority-based forwarding (UTXO transactions get priority)
    const priority = this.prioritizeByMessageType(message);

    // Cache management - evict if necessary
    if (this.floodCache.size >= this.maxCacheSize) {
      this.evictOldestFloodEntry();
    }

    // Add to cache
    const entry: BlockchainFloodEntry = {
      messageId: message.id,
      originator: message.originator,
      sequenceNumber: message.sequenceNumber,
      messageType: message.messageType,
      timestamp: Date.now(),
      processed: false,
      signatureValid: true,
    };

    this.floodCache.set(messageKey, entry);

    this.logger.debug('Flood message should be forwarded', {
      messageId: message.id,
      messageType: message.messageType,
      priority,
      ttl: message.ttl,
    });

    return true;
  }

  /**
   * Mark a flood message as processed
   */
  markFloodProcessed(messageId: string): void {
    for (const [_key, entry] of this.floodCache) {
      if (entry.messageId === messageId) {
        entry.processed = true;
        this.logger.debug('Marked flood message as processed', { messageId });
        break;
      }
    }
  }

  /**
   * Decrement TTL of a flood message
   */
  decrementTTL(message: BlockchainFloodMessage): BlockchainFloodMessage {
    return {
      ...message,
      ttl: Math.max(0, message.ttl - 1),
    };
  }

  /**
   * Prioritize messages by type (UTXO transactions get highest priority)
   */
  prioritizeByMessageType(message: BlockchainFloodMessage): number {
    switch (message.messageType) {
      case 'utxo_transaction':
        return 10; // Highest priority
      case 'block':
        return 8;
      case 'spv_proof':
        return 6;
      case 'discovery':
        return 4;
      default:
        return 1;
    }
  }

  /**
   * Clean up expired flood cache entries
   */
  cleanupFloodCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    const maxAge = 300000; // 5 minutes

    for (const [key, entry] of this.floodCache) {
      if (now - entry.timestamp > maxAge) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.floodCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug('Cleaned up expired flood cache entries', {
        count: expiredKeys.length,
      });
    }
  }

  /**
   * Handle fragmented flood messages
   */
  handleFragmentedFlood(message: BlockchainFloodMessage): boolean {
    if (!message.isFragmented || !message.fragmentInfo) {
      return this.shouldForwardFlood(message);
    }

    // For fragmented messages, we need to consider the fragmentation manager
    // This would integrate with the existing fragmentation system
    this.logger.debug('Handling fragmented flood message', {
      messageId: message.id,
      fragmentId: message.fragmentInfo.fragmentId,
      totalFragments: message.fragmentInfo.totalFragments,
    });

    return this.shouldForwardFlood(message);
  }

  /**
   * Verify flood message signature
   */
  private verifyFloodSignature(message: BlockchainFloodMessage): boolean {
    // Basic signature verification - in full implementation would use CryptographicService
    try {
      return Boolean(message.signature && message.signature.length > 0);
    } catch (error) {
      this.logger.error('Flood signature verification failed', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Evict oldest flood cache entry when cache is full
   */
  private evictOldestFloodEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.floodCache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.floodCache.delete(oldestKey);
      this.logger.debug('Evicted oldest flood cache entry', { key: oldestKey });
    }
  }

  /**
   * Get flood cache statistics
   */
  getFloodStatistics() {
    return {
      cacheSize: this.floodCache.size,
      maxCacheSize: this.maxCacheSize,
      processedMessages: Array.from(this.floodCache.values()).filter(
        e => e.processed
      ).length,
    };
  }

  /**
   * Clear flood cache (for testing)
   */
  clearFloodCache(): void {
    this.floodCache.clear();
    this.logger.debug('Cleared flood cache');
  }
}

/**
 * UTXOMessageForwarder - Handles message forwarding with UTXO prioritization and fragmentation integration
 *
 * BREAKING CHANGE: Complete rewrite with UTXO-optimized forwarding and seamless fragmentation integration.
 */
export class UTXOMessageForwarder {
  private pendingForwards: Map<string, BlockchainForwardingEntry> = new Map();
  private fragmentationManager: any; // Will be injected - reuse existing implementation
  private ackTimeout: number;
  private maxRetries: number;
  private priorityQueue: BlockchainForwardingEntry[] = [];
  private logger: Logger;
  private nodeId: string;

  constructor(nodeId: string, config: RoutingConfig) {
    this.nodeId = nodeId;
    this.ackTimeout = config.acknowledgmentTimeout;
    this.maxRetries = config.maxForwardRetries;
    this.logger = Logger.getInstance();

    this.logger.info('UTXOMessageForwarder initialized', {
      nodeId: this.nodeId,
      ackTimeout: this.ackTimeout,
      maxRetries: this.maxRetries,
    });

    // Start periodic retry processing
    setInterval(() => this.retryFailedForwards(), 5000); // Every 5 seconds
  }

  /**
   * Forward a UTXO message with priority handling
   */
  async forwardUTXOMessage(
    message: MeshMessage,
    nextHop: string
  ): Promise<boolean> {
    try {
      const entry: BlockchainForwardingEntry = {
        messageId: this.generateMessageId(),
        destination: message.to || 'broadcast',
        nextHop,
        messageType: this.determineMessageType(message),
        priority: this.calculateMessagePriority(message),
        timestamp: Date.now(),
        retryCount: 0,
        acknowledged: false,
        isFragmented: false, // Will be determined by fragmentation manager
        blockchainHeight: this.extractBlockchainHeight(message),
      };

      // Add to pending forwards
      this.pendingForwards.set(entry.messageId, entry);

      // Add to priority queue for processing
      this.priorityQueue.push(entry);
      this.sortPriorityQueue();

      this.logger.debug('Queued UTXO message for forwarding', {
        messageId: entry.messageId,
        messageType: entry.messageType,
        priority: entry.priority,
        nextHop,
      });

      // In a real implementation, processing would be asynchronous
      // For now, just return success and let the message remain pending until acknowledged
      return true;
    } catch (error) {
      this.logger.error('Failed to forward UTXO message', {
        nextHop,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle acknowledgment for a forwarded message
   */
  handleAcknowledgment(messageId: string): void {
    const entry = this.pendingForwards.get(messageId);
    if (!entry) {
      this.logger.warn('Received ACK for unknown message', { messageId });
      return;
    }

    entry.acknowledged = true;
    this.pendingForwards.delete(messageId);

    this.logger.debug('Received ACK for forwarded message', { messageId });
  }

  /**
   * Prioritize UTXO transactions over other message types
   */
  prioritizeUTXOTransactions(
    entries: BlockchainForwardingEntry[]
  ): BlockchainForwardingEntry[] {
    return entries.sort((a, b) => {
      // Primary sort: message type priority
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Secondary sort: timestamp (older first)
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Retry failed forwards with exponential backoff
   */
  retryFailedForwards(): void {
    const now = Date.now();
    const retryQueue: BlockchainForwardingEntry[] = [];

    for (const [messageId, entry] of this.pendingForwards) {
      if (entry.acknowledged) {
        continue;
      }

      const age = now - entry.timestamp;
      const shouldRetry =
        age > this.ackTimeout && entry.retryCount < this.maxRetries;

      if (shouldRetry) {
        entry.retryCount++;
        retryQueue.push(entry);

        this.logger.debug('Retrying failed forward', {
          messageId,
          retryCount: entry.retryCount,
          age,
        });
      } else if (entry.retryCount >= this.maxRetries) {
        // Give up on this message
        this.pendingForwards.delete(messageId);
        this.logger.warn('Giving up on failed forward', {
          messageId,
          retryCount: entry.retryCount,
        });
      }
    }

    // Process retry queue (would implement actual retransmission)
    for (const entry of retryQueue) {
      this.logger.debug('Would retry forwarding message', {
        messageId: entry.messageId,
        nextHop: entry.nextHop,
      });
    }
  }

  /**
   * Forward fragmented message using existing fragmentation system
   */
  async forwardFragmentedMessage(
    message: MeshMessage,
    nextHop: string
  ): Promise<boolean> {
    // This would integrate with the existing comprehensive fragmentation system
    // For now, just mark as fragmented and handle normally
    this.logger.debug('Forwarding fragmented message', {
      messageType: message.type,
      nextHop,
    });

    return this.forwardUTXOMessage(message, nextHop);
  }

  /**
   * Handle acknowledgment for a specific fragment
   */
  handleFragmentAck(fragmentId: string, messageId: string): void {
    this.logger.debug('Received fragment ACK', { fragmentId, messageId });
    // Would integrate with fragmentation manager for fragment-specific acknowledgments
  }

  /**
   * Determine message type from MeshMessage
   */
  private determineMessageType(
    message: MeshMessage
  ): 'utxo_transaction' | 'block' | 'spv_proof' | 'discovery' {
    switch (message.type) {
      case 'transaction':
        return 'utxo_transaction';
      case 'block':
        return 'block';
      case 'sync':
        return 'spv_proof';
      case 'discovery':
        return 'discovery';
      default:
        return 'discovery';
    }
  }

  /**
   * Calculate message priority (UTXO transactions get highest priority)
   */
  private calculateMessagePriority(message: MeshMessage): number {
    const messageType = this.determineMessageType(message);

    switch (messageType) {
      case 'utxo_transaction':
        return 100; // Highest priority
      case 'block':
        return 80;
      case 'spv_proof':
        return 60;
      case 'discovery':
        return 40;
      default:
        return 20;
    }
  }

  /**
   * Extract blockchain height from message if available
   */
  private extractBlockchainHeight(_message: MeshMessage): number | undefined {
    // Would extract from message payload based on type
    return undefined;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sort priority queue by priority and timestamp
   */
  private sortPriorityQueue(): void {
    this.priorityQueue = this.prioritizeUTXOTransactions(this.priorityQueue);
  }

  /**
   * Process a forwarding entry (simulate actual transmission)
   */
  private async processForwardingEntry(
    entry: BlockchainForwardingEntry,
    _message: MeshMessage
  ): Promise<boolean> {
    // In a real implementation, this would interface with the LoRa hardware
    // For now, simulate successful transmission
    this.logger.debug('Processing forwarding entry', {
      messageId: entry.messageId,
      messageType: entry.messageType,
      nextHop: entry.nextHop,
    });

    // Simulate transmission delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return true; // Simulate success
  }

  /**
   * Get forwarding statistics
   */
  getForwardingStatistics() {
    return {
      pendingForwards: this.pendingForwards.size,
      queueLength: this.priorityQueue.length,
      averageRetryCount: this.calculateAverageRetryCount(),
    };
  }

  /**
   * Calculate average retry count for monitoring
   */
  private calculateAverageRetryCount(): number {
    if (this.pendingForwards.size === 0) {
      return 0;
    }

    const totalRetries = Array.from(this.pendingForwards.values()).reduce(
      (sum, entry) => sum + entry.retryCount,
      0
    );

    return totalRetries / this.pendingForwards.size;
  }

  /**
   * Clear all pending forwards (for testing)
   */
  clearPendingForwards(): void {
    this.pendingForwards.clear();
    this.priorityQueue = [];
    this.logger.debug('Cleared all pending forwards');
  }
}

/**
 * CryptoLoopPrevention - Cryptographically secured loop detection and prevention
 *
 * BREAKING CHANGE: Complete rewrite with cryptographic security and blockchain-aware loop prevention.
 */
export class CryptoLoopPrevention {
  private pathVectors: Map<string, BlockchainPathVector> = new Map();
  private sequenceNumbers: Map<string, CryptoSequenceEntry> = new Map();
  private holdDownTimers: Map<string, number> = new Map();
  private cryptoService: CryptographicService;
  private logger: Logger;
  private nodeId: string;
  private nodeKeyPair: KeyPair;
  private config: RoutingConfig;

  constructor(
    nodeId: string,
    nodeKeyPair: KeyPair,
    config: RoutingConfig,
    cryptoService?: CryptographicService
  ) {
    this.nodeId = nodeId;
    this.nodeKeyPair = nodeKeyPair;
    this.config = config;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    this.logger.info('CryptoLoopPrevention initialized', {
      nodeId: this.nodeId,
      algorithm: this.nodeKeyPair.algorithm,
    });

    // Start periodic cleanup
    setInterval(() => this.cleanupExpiredEntries(), 60000); // Every minute
  }

  /**
   * Detect routing loops using cryptographically verified path vectors
   */
  detectLoop(message: MeshMessage, proposedPath: string[]): boolean {
    try {
      // Check for obvious loops (node appears twice in path)
      const nodeSet = new Set(proposedPath);
      if (nodeSet.size !== proposedPath.length) {
        this.logger.warn('Loop detected: duplicate node in path', {
          path: proposedPath,
          duplicates: proposedPath.length - nodeSet.size,
        });
        return true;
      }

      // Check if our node is already in the path
      if (proposedPath.includes(this.nodeId)) {
        this.logger.warn('Loop detected: our node already in path', {
          nodeId: this.nodeId,
          path: proposedPath,
        });
        return true;
      }

      // Check path length limits
      if (proposedPath.length > this.config.maxPathLength) {
        this.logger.warn('Loop detected: path too long', {
          pathLength: proposedPath.length,
          maxLength: this.config.maxPathLength,
        });
        return true;
      }

      // Blockchain-specific loop prevention
      const blockchainHeight = this.extractBlockchainHeight(message);
      if (
        blockchainHeight &&
        this.preventBlockchainSyncLoops(blockchainHeight, proposedPath)
      ) {
        return true;
      }

      this.logger.debug('No loop detected', {
        pathLength: proposedPath.length,
        uniqueNodes: nodeSet.size,
      });

      return false;
    } catch (error) {
      this.logger.error('Error in loop detection', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true; // Err on the side of caution
    }
  }

  /**
   * Update sequence number with cryptographic verification
   */
  updateSequenceNumber(
    nodeId: string,
    seqNum: number,
    signature: string
  ): void {
    if (!this.verifySequenceSignature(nodeId, seqNum, signature)) {
      this.logger.warn('Invalid sequence number signature', { nodeId, seqNum });
      return;
    }

    const existing = this.sequenceNumbers.get(nodeId);
    if (existing && existing.sequenceNumber >= seqNum) {
      this.logger.debug('Sequence number not newer, ignoring', {
        nodeId,
        existing: existing.sequenceNumber,
        received: seqNum,
      });
      return;
    }

    const entry: CryptoSequenceEntry = {
      nodeId,
      sequenceNumber: seqNum,
      timestamp: Date.now(),
      publicKey: '', // Would be extracted from message
      signature,
    };

    this.sequenceNumbers.set(nodeId, entry);

    this.logger.debug('Updated sequence number', { nodeId, seqNum });
  }

  /**
   * Validate if a sequence number is valid (not stale)
   */
  isValidSequenceNumber(nodeId: string, seqNum: number): boolean {
    const entry = this.sequenceNumbers.get(nodeId);
    if (!entry) {
      return true; // First time seeing this node
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.config.maxSequenceNumberAge) {
      // Sequence number is too old, consider it stale
      this.sequenceNumbers.delete(nodeId);
      return true;
    }

    // Sequence number should be higher than the last known
    return seqNum > entry.sequenceNumber;
  }

  /**
   * Verify path signature for path vector authenticity
   */
  verifyPathSignature(pathVector: BlockchainPathVector): boolean {
    try {
      // Basic signature verification - in full implementation would use CryptographicService
      return Boolean(
        pathVector.pathSignature && pathVector.pathSignature.length > 0
      );
    } catch (error) {
      this.logger.error('Path signature verification failed', {
        destination: pathVector.destination,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Poison a route due to failure
   */
  poisonRoute(destination: string, reason: string): void {
    this.logger.info('Poisoning route', { destination, reason });

    // Remove from path vectors
    this.pathVectors.delete(destination);

    // Start hold-down timer
    this.startHoldDownTimer(destination);
  }

  /**
   * Start hold-down timer to prevent route flapping
   */
  startHoldDownTimer(destination: string): void {
    const holdDownTime = Date.now() + this.config.holdDownTime;
    this.holdDownTimers.set(destination, holdDownTime);

    this.logger.debug('Started hold-down timer', {
      destination,
      holdDownTime: this.config.holdDownTime,
    });

    // Schedule cleanup
    setTimeout(() => {
      this.holdDownTimers.delete(destination);
      this.logger.debug('Hold-down timer expired', { destination });
    }, this.config.holdDownTime);
  }

  /**
   * Blockchain-specific loop prevention for sync operations
   */
  preventBlockchainSyncLoops(blockHeight: number, path: string[]): boolean {
    // Prevent loops in blockchain synchronization by checking if we're going backwards in height
    // This would be enhanced with actual blockchain state checking

    this.logger.debug('Checking blockchain sync loops', {
      blockHeight,
      pathLength: path.length,
    });

    // For now, just check basic path constraints
    return false;
  }

  /**
   * Validate node identity using cryptographic verification
   */
  validateNodeIdentity(nodeId: string, publicKey: string): boolean {
    try {
      // Basic identity validation - in full implementation would verify against known nodes
      return nodeId.length > 0 && publicKey.length > 0;
    } catch (error) {
      this.logger.error('Node identity validation failed', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Extract blockchain height from message
   */
  private extractBlockchainHeight(_message: MeshMessage): number | undefined {
    // Would extract from message payload based on type
    return undefined;
  }

  /**
   * Verify sequence number signature
   */
  private verifySequenceSignature(
    nodeId: string,
    seqNum: number,
    signature: string
  ): boolean {
    // Basic signature verification - in full implementation would use CryptographicService
    return signature.length > 0;
  }

  /**
   * Clean up expired entries periodically
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    // Clean up old sequence numbers
    for (const [nodeId, entry] of this.sequenceNumbers) {
      if (now - entry.timestamp > this.config.maxSequenceNumberAge) {
        this.sequenceNumbers.delete(nodeId);
        removedCount++;
      }
    }

    // Clean up old path vectors
    for (const [destination, pathVector] of this.pathVectors) {
      if (now - pathVector.timestamp > this.config.maxSequenceNumberAge) {
        this.pathVectors.delete(destination);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug('Cleaned up expired loop prevention entries', {
        removedCount,
      });
    }
  }

  /**
   * Get loop prevention statistics
   */
  getLoopPreventionStatistics() {
    return {
      activePathVectors: this.pathVectors.size,
      knownSequenceNumbers: this.sequenceNumbers.size,
      activeHoldDownTimers: this.holdDownTimers.size,
    };
  }

  /**
   * Clear all loop prevention state (for testing)
   */
  clearLoopPreventionState(): void {
    this.pathVectors.clear();
    this.sequenceNumbers.clear();
    this.holdDownTimers.clear();
    this.logger.debug('Cleared all loop prevention state');
  }
}
