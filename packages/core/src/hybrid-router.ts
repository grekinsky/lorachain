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
 * Default network latency constants (milliseconds)
 */
const DEFAULT_MESH_LATENCY_MS = 200;
const DEFAULT_INTERNET_LATENCY_MS = 50;
const GATEWAY_OVERHEAD_MS = 50;
const DEFAULT_CROSS_NETWORK_LATENCY_MS = 300;

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
 * Network conditions monitoring data
 *
 * Tracks current state of mesh and internet connectivity,
 * performance metrics, and available gateways for hybrid routing.
 */
export interface NetworkConditions {
  /** Mesh network connectivity status */
  meshConnectivity: boolean;
  /** Internet connectivity status */
  internetConnectivity: boolean;
  /** Available gateway node IDs */
  availableGateways: string[];
  /** Network latency measurements in milliseconds */
  networkLatency: {
    mesh: number;
    internet: number;
    crossNetwork: number;
  };
  /** Bandwidth measurements in bytes */
  bandwidth: {
    mesh: number;
    internet: number;
  };
  /** Congestion levels (0-1 scale) */
  congestion: {
    mesh: number;
    internet: number;
  };
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
 * @fires network:conditions-updated - Emitted when network conditions are refreshed
 * @fires network:failover - Emitted when network failover occurs
 * @fires routes:cleared - Emitted when routes are cleared due to network failure
 */
export class HybridRouter extends EventEmitter {
  private config: HybridRouterConfig;
  private routingTable: Map<string, RouteDecision>;
  private peerManager: PeerManager;
  private compressionManager: UTXOCompressionManager;
  private logger: Logger;
  private isRunning = false;
  private networkConditions: NetworkConditions;
  private conditionUpdateInterval?: ReturnType<typeof setInterval>;

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
    this.networkConditions = this.initializeNetworkConditions();
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

    // Update network conditions on start
    await this.updateNetworkConditions();

    // Start periodic condition updates if auto-optimization enabled
    if (this.config.enableAutoOptimization) {
      this.startPeriodicConditionUpdates();
    }

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

    // Stop periodic condition updates
    if (this.conditionUpdateInterval) {
      clearInterval(this.conditionUpdateInterval);
      this.conditionUpdateInterval = undefined;
    }

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
   * Get current network conditions
   *
   * Returns a snapshot of current network conditions including
   * connectivity status, latency, bandwidth, and congestion metrics.
   *
   * @returns Current network conditions
   */
  getNetworkConditions(): NetworkConditions {
    return { ...this.networkConditions };
  }

  /**
   * Update network conditions
   *
   * Measures current network connectivity, latency, bandwidth, and
   * congestion levels for both mesh and internet networks.
   * Emits 'network:conditions-updated' event after update.
   */
  async updateNetworkConditions(): Promise<void> {
    this.logger.debug('Updating network conditions');

    this.networkConditions = {
      meshConnectivity: await this.checkMeshConnectivity(),
      internetConnectivity: await this.checkInternetConnectivity(),
      availableGateways: [], // Will be populated in Part 4 (Gateway Management)
      networkLatency: await this.measureNetworkLatency(),
      bandwidth: await this.measureBandwidth(),
      congestion: await this.measureCongestion(),
    };

    this.logger.debug('Network conditions updated', this.networkConditions);

    this.emit('network:conditions-updated', {
      conditions: this.networkConditions,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle network failover
   *
   * Responds to network failure by clearing affected routes and
   * updating network conditions. Emits 'network:failover' event.
   *
   * @param failedNetwork - The network that failed ('mesh' or 'internet')
   */
  async handleNetworkFailover(
    failedNetwork: 'mesh' | 'internet'
  ): Promise<void> {
    this.logger.warn('Network failover triggered', { failedNetwork });

    // Clear affected routes
    this.clearAffectedRoutes(failedNetwork);

    // Update network conditions
    await this.updateNetworkConditions();

    // Emit failover event
    this.emit('network:failover', {
      failedNetwork,
      timestamp: Date.now(),
      newConditions: this.networkConditions,
    });
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

  /**
   * Check mesh network connectivity
   *
   * Determines if mesh network is available by checking for active mesh peers.
   * Mesh peers are identified by '.mesh.' in their address.
   *
   * @returns True if mesh network is available
   */
  private async checkMeshConnectivity(): Promise<boolean> {
    try {
      const meshPeers = this.peerManager
        .getAllPeers()
        .filter(peer => peer.address.includes('.mesh.'));

      return meshPeers.length > 0;
    } catch (error) {
      this.logger.error('Failed to check mesh connectivity', { error });
      return false;
    }
  }

  /**
   * Check internet connectivity
   *
   * Determines if internet is available by checking for active non-mesh peers.
   * Internet peers are identified by absence of '.mesh.' in their address.
   *
   * @returns True if internet is available
   */
  private async checkInternetConnectivity(): Promise<boolean> {
    try {
      const internetPeers = this.peerManager
        .getAllPeers()
        .filter(peer => !peer.address.includes('.mesh.'));

      return internetPeers.length > 0;
    } catch (error) {
      this.logger.error('Failed to check internet connectivity', { error });
      return false;
    }
  }

  /**
   * Measure network latency
   *
   * Calculates average latency for mesh and internet networks based on
   * peer latency data. Cross-network latency includes gateway overhead.
   *
   * @returns Network latency measurements in milliseconds
   */
  private async measureNetworkLatency(): Promise<
    NetworkConditions['networkLatency']
  > {
    const measurements = {
      mesh: 0,
      internet: 0,
      crossNetwork: 0,
    };

    try {
      const peers = this.peerManager.getAllPeers();

      // Measure mesh latency from mesh peers
      const meshPeers = peers.filter(peer => peer.address.includes('.mesh.'));
      if (meshPeers.length > 0) {
        const totalLatency = meshPeers.reduce(
          (sum, peer) => sum + peer.latency,
          0
        );
        measurements.mesh = totalLatency / meshPeers.length;
      } else {
        measurements.mesh = DEFAULT_MESH_LATENCY_MS;
      }

      // Measure internet latency from internet peers
      const internetPeers = peers.filter(
        peer => !peer.address.includes('.mesh.')
      );
      if (internetPeers.length > 0) {
        const totalLatency = internetPeers.reduce(
          (sum, peer) => sum + peer.latency,
          0
        );
        measurements.internet = totalLatency / internetPeers.length;
      } else {
        measurements.internet = DEFAULT_INTERNET_LATENCY_MS;
      }

      // Cross-network latency is sum of both + gateway overhead
      measurements.crossNetwork =
        measurements.mesh + measurements.internet + GATEWAY_OVERHEAD_MS;
    } catch (error) {
      this.logger.error('Failed to measure network latency', { error });
      // Return defaults on error
      measurements.mesh = DEFAULT_MESH_LATENCY_MS;
      measurements.internet = DEFAULT_INTERNET_LATENCY_MS;
      measurements.crossNetwork = DEFAULT_CROSS_NETWORK_LATENCY_MS;
    }

    return measurements;
  }

  /**
   * Measure bandwidth
   *
   * Returns bandwidth estimates for mesh and internet networks.
   * Mesh bandwidth is constrained by LoRa 256-byte message limit.
   *
   * NOTE: Current implementation uses static bandwidth values.
   * Future enhancements (Part 7 - Traffic Optimizer):
   * - Implement actual internet bandwidth measurement
   * - Measure throughput from peer transfer rates
   * - Track historical bandwidth performance
   * - Adapt to network conditions dynamically
   *
   * @returns Bandwidth measurements in bytes
   */
  private async measureBandwidth(): Promise<NetworkConditions['bandwidth']> {
    return {
      mesh: 256, // LoRa 256-byte message limit (hard constraint)
      // TODO (Part 7): Implement actual internet bandwidth measurement
      // Current value is conservative estimate for typical mobile/wifi connections
      internet: 1048576, // 1MB baseline (will be measured dynamically)
    };
  }

  /**
   * Measure congestion
   *
   * Estimates network congestion from peer reliability metrics.
   * Higher peer unreliability indicates higher congestion.
   *
   * NOTE: Current implementation uses peer reliability as a proxy for congestion.
   * Future enhancements (Part 7 - Traffic Optimizer):
   * - Queue sizes from peer status
   * - Message delivery delays
   * - Retry rates and timeouts
   * - Duty cycle utilization (for mesh)
   * - Network throughput degradation
   *
   * @returns Congestion levels (0-1 scale)
   */
  private async measureCongestion(): Promise<NetworkConditions['congestion']> {
    try {
      const peers = this.peerManager.getAllPeers();

      const meshPeers = peers.filter(peer => peer.address.includes('.mesh.'));
      const internetPeers = peers.filter(
        peer => !peer.address.includes('.mesh.')
      );

      // Estimate congestion from peer unreliability (1 - reliability/100)
      const meshCongestion =
        meshPeers.length > 0
          ? meshPeers.reduce(
              (sum, peer) => sum + (1 - peer.reliability / 100),
              0
            ) / meshPeers.length
          : 0.0;

      const internetCongestion =
        internetPeers.length > 0
          ? internetPeers.reduce(
              (sum, peer) => sum + (1 - peer.reliability / 100),
              0
            ) / internetPeers.length
          : 0.0;

      return {
        mesh: Math.min(1.0, meshCongestion),
        internet: Math.min(1.0, internetCongestion),
      };
    } catch (error) {
      this.logger.error('Failed to measure congestion', { error });
      return { mesh: 0.0, internet: 0.0 };
    }
  }

  /**
   * Initialize network conditions
   *
   * Creates default network conditions object with zero values.
   *
   * @returns Initialized network conditions
   */
  private initializeNetworkConditions(): NetworkConditions {
    return {
      meshConnectivity: false,
      internetConnectivity: false,
      availableGateways: [],
      networkLatency: { mesh: 0, internet: 0, crossNetwork: 0 },
      bandwidth: { mesh: 0, internet: 0 },
      congestion: { mesh: 0, internet: 0 },
    };
  }

  /**
   * Start periodic condition updates
   *
   * Initiates interval-based network condition monitoring.
   * Updates occur at the configured optimization interval.
   */
  private startPeriodicConditionUpdates(): void {
    this.conditionUpdateInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.updateNetworkConditions();
    }, this.config.optimizationInterval);
  }

  /**
   * Clear affected routes after network failure
   *
   * Removes routes that depend on the failed network from routing table.
   * Emits 'routes:cleared' event if any routes were removed.
   *
   * @param failedNetwork - The network that failed
   */
  private clearAffectedRoutes(failedNetwork: 'mesh' | 'internet'): void {
    const toDelete: string[] = [];

    for (const [destination, route] of this.routingTable) {
      if (route.targetNetwork === failedNetwork) {
        toDelete.push(destination);
      }
    }

    toDelete.forEach(dest => this.routingTable.delete(dest));
    this.logger.info(`Cleared ${toDelete.length} affected routes`);

    if (toDelete.length > 0) {
      this.emit('routes:cleared', {
        count: toDelete.length,
        failedNetwork,
        timestamp: Date.now(),
      });
    }
  }
}
