/**
 * HybridRouter - Core infrastructure for hybrid mesh/internet routing
 *
 * This module provides the foundational routing infrastructure that enables
 * seamless communication between LoRa mesh nodes and internet-connected nodes.
 * It manages routing decisions, network failover, and traffic optimization
 * across heterogeneous network topologies.
 *
 * Part 1 of 8 in the hybrid routing system implementation.
 */

import { EventEmitter } from 'events';
import { Logger } from '@lorachain/shared';
import { PeerManager } from './peer-manager';
import { UTXOCompressionManager } from './utxo-compression-manager';

/**
 * Route decision containing network selection and performance estimates
 */
export interface RouteDecision {
  /** Target network type for message delivery */
  targetNetwork: 'mesh' | 'internet' | 'hybrid';
  /** Gateway node ID for hybrid routing (optional) */
  gatewayNode?: string;
  /** Message priority level */
  priority: 'high' | 'medium' | 'low';
  /** Estimated delivery delay in milliseconds */
  estimatedDelay: number;
  /** Routing cost (battery/bandwidth usage) */
  cost: number;
  /** Estimated reliability (0-1) */
  reliability: number;
}

/**
 * Configuration for HybridRouter behavior
 */
export interface HybridRouterConfig {
  /** Enable automatic route optimization */
  enableAutoOptimization: boolean;
  /** Optimization interval in milliseconds */
  optimizationInterval: number;
  /** Maximum concurrent bridge operations */
  maxConcurrentBridgeOperations: number;
  /** Cross-network operation timeout in milliseconds */
  crossNetworkTimeout: number;
  /** Preferred network type for routing decisions */
  preferredNetwork: 'mesh' | 'internet' | 'adaptive';
}

/**
 * Performance metrics for route evaluation
 */
export interface RoutePerformance {
  /** Actual delivery delay in milliseconds */
  actualDelay: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Packet loss rate (0-1) */
  packetLoss: number;
}

/**
 * Hybrid routing mesh message structure
 *
 * This is a separate interface from the core MeshMessage type (defined in types.ts)
 * to accommodate hybrid routing requirements:
 *
 * **Differences from core MeshMessage:**
 * - Uses `Uint8Array` payload (instead of `unknown`) for compression compatibility
 * - Makes `from` and `to` fields optional (instead of required)
 * - Optimized for cross-network routing with gateway nodes
 *
 * **Rationale:**
 * - The core MeshMessage uses `unknown` payload for flexibility across different message types
 * - Hybrid routing requires `Uint8Array` for UTXO compression and fragmentation
 * - Gateway routing may not always have source/destination in traditional peer-to-peer sense
 *
 * **Future Consideration:**
 * - Part 8 integration may unify message types using discriminated unions
 * - Consider extending core MeshMessage with proper type narrowing in future refactoring
 *
 * @see MeshMessage in types.ts for the core mesh protocol message structure
 */
export interface HybridRoutingMessage {
  /** Message type identifier */
  type: string;
  /** Message payload as byte array */
  payload: Uint8Array;
  /** Message timestamp */
  timestamp: number;
  /** Cryptographic signature */
  signature: string;
  /** Source node identifier (optional) */
  from?: string;
  /** Destination node identifier (optional) */
  to?: string;
}

/**
 * HybridRouter - Core routing infrastructure for mesh/internet hybrid networks
 *
 * Manages routing decisions, network failover, and traffic optimization across
 * LoRa mesh and internet networks. This is the foundational class that will be
 * extended with network monitoring, gateway management, and traffic optimization
 * in subsequent implementation phases.
 *
 * @fires router:started - Emitted when router starts
 * @fires router:stopped - Emitted when router stops
 * @fires route:cached - Emitted when route is cached
 * @fires route:invalidated - Emitted when cached route is invalidated
 */
export class HybridRouter extends EventEmitter {
  private config: HybridRouterConfig;
  private routingTable: Map<string, RouteDecision>;
  private peerManager: PeerManager;
  private compressionManager: UTXOCompressionManager;
  private logger: Logger;
  private isRunning = false;

  /**
   * Create a new HybridRouter instance
   *
   * @param config - Router configuration
   * @param peerManager - Peer management service
   * @param compressionManager - Compression management service
   */
  constructor(
    config: HybridRouterConfig,
    peerManager: PeerManager,
    compressionManager: UTXOCompressionManager
  ) {
    super();
    this.config = config;
    this.peerManager = peerManager;
    this.compressionManager = compressionManager;
    this.logger = Logger.getInstance();
    this.routingTable = new Map();
  }

  /**
   * Start the hybrid router
   *
   * Initializes routing infrastructure and begins monitoring network conditions.
   * Emits 'router:started' event on successful start.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('HybridRouter already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting hybrid router', {
      preferredNetwork: this.config.preferredNetwork,
      autoOptimization: this.config.enableAutoOptimization,
    });

    // Emit start event
    this.emit('router:started', { timestamp: Date.now() });
  }

  /**
   * Stop the hybrid router
   *
   * Cleans up resources and stops all routing operations.
   * Emits 'router:stopped' event on successful stop.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('HybridRouter not running');
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping hybrid router');

    // Clear routing table
    this.routingTable.clear();

    // Emit stop event
    this.emit('router:stopped', { timestamp: Date.now() });
  }

  /**
   * Route a message to its destination
   *
   * Determines optimal routing path and delivers message through appropriate network.
   * This is a placeholder implementation that will be enhanced in Part 3.
   *
   * @param message - UTXO message to route
   * @param destination - Destination node identifier
   * @returns Promise resolving to true if routing successful
   */
  async routeMessage(
    message: HybridRoutingMessage,
    destination: string
  ): Promise<boolean> {
    if (!this.isRunning) {
      this.logger.error('Cannot route message - router not running');
      return false;
    }

    this.logger.debug('Routing message', {
      destination,
      messageType: message.type,
      payloadSize: message.payload.length,
    });

    // Placeholder - actual routing logic will be implemented in Part 3
    return true;
  }

  /**
   * Determine optimal routing path for a destination
   *
   * Checks routing table cache and returns existing route if valid,
   * otherwise creates a default route based on configuration.
   * Full route calculation logic will be implemented in Part 3.
   *
   * @param destination - Destination node identifier
   * @param messageType - Type of message being routed
   * @returns Route decision with network selection and performance estimates
   */
  determineOptimalPath(
    destination: string,
    messageType: string
  ): RouteDecision {
    // Check cached routing decision
    const cached = this.routingTable.get(destination);
    if (cached && this.isRouteValid(cached)) {
      this.logger.debug('Using cached route', { destination });
      return cached;
    }

    // Create default route (full logic in Part 3)
    const defaultRoute = this.createDefaultRoute();
    this.logger.debug('Created default route', {
      destination,
      messageType,
      targetNetwork: defaultRoute.targetNetwork,
    });

    // Cache the route for future use
    this.routingTable.set(destination, defaultRoute);
    this.emit('route:cached', { destination, route: defaultRoute });

    return defaultRoute;
  }

  /**
   * Update routing metrics based on actual performance
   *
   * Updates cached route with real performance data to improve future
   * routing decisions.
   *
   * @param destination - Destination node identifier
   * @param performance - Actual performance metrics
   */
  updateRoutingMetrics(
    destination: string,
    performance: RoutePerformance
  ): void {
    const route = this.routingTable.get(destination);
    if (route) {
      // Update route with actual performance data
      route.estimatedDelay = performance.actualDelay;
      route.reliability = performance.successRate;
      this.routingTable.set(destination, route);

      this.logger.debug('Updated routing metrics', {
        destination,
        actualDelay: performance.actualDelay,
        successRate: performance.successRate,
        packetLoss: performance.packetLoss,
      });

      this.emit('route:updated', { destination, performance });
    } else {
      this.logger.warn('Cannot update metrics - no cached route found', {
        destination,
      });
    }
  }

  /**
   * Check if router is currently running
   *
   * @returns True if router is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current routing configuration
   *
   * @returns Router configuration
   */
  getConfig(): HybridRouterConfig {
    return { ...this.config };
  }

  /**
   * Get routing table size
   *
   * @returns Number of cached routes
   */
  getRoutingTableSize(): number {
    return this.routingTable.size;
  }

  /**
   * Create a default route based on configuration
   *
   * @returns Default route decision
   */
  private createDefaultRoute(): RouteDecision {
    const targetNetwork =
      this.config.preferredNetwork === 'adaptive'
        ? 'internet'
        : this.config.preferredNetwork;

    return {
      targetNetwork,
      priority: 'medium',
      estimatedDelay: 1000,
      cost: 1.0,
      reliability: 0.8,
    };
  }

  /**
   * Check if a cached route is still valid
   *
   * Routes are considered valid for 5 minutes (simplified logic).
   * Full validation logic will be implemented in Part 2.
   *
   * @param route - Route decision to validate
   * @returns True if route is still valid
   */
  private isRouteValid(_route: RouteDecision): boolean {
    // TODO (Part 2): Implement comprehensive route validation based on:
    //   - Time-based expiration (routes valid for 5 minutes)
    //   - Network condition changes (mesh/internet connectivity status)
    //   - Peer connectivity status (from PeerManager)
    //   - Gateway availability (if using hybrid routing)
    //   - Performance degradation thresholds (reliability < 0.5, delay > 5000ms)
    //   - Route staleness detection for network topology changes
    return true;
  }
}
