/**
 * GatewayManager - Gateway node registration and management
 *
 * This module manages gateway nodes that bridge mesh and internet networks.
 * It handles gateway registration, authentication, health monitoring, and
 * basic status management for the hybrid routing system.
 *
 * Part 4 of 8 in the hybrid routing system implementation.
 */

import { EventEmitter } from 'events';
import { Logger } from '@lorachain/shared';
import { CryptographicService } from './cryptographic';
import { NetworkBridge } from './network-bridge';
import { UTXOCompressionManager } from './utxo-compression-manager';
import type { PeerManager } from './peer-manager';

/**
 * Gateway node interface representing a bridge node between networks
 */
export interface GatewayNode {
  /** Unique gateway identifier */
  id: string;
  /** Network address of the gateway */
  address: string;
  /** Gateway capabilities and supported features */
  capabilities: {
    /** Whether gateway is connected to mesh network */
    meshConnected: boolean;
    /** Whether gateway is connected to internet */
    internetConnected: boolean;
    /** Maximum message throughput */
    maxThroughput: number;
    /** List of supported protocol types */
    supportedProtocols: string[];
  };
  /** Current gateway status */
  status: {
    /** Whether gateway is active and available */
    isActive: boolean;
    /** Timestamp of last heartbeat (milliseconds) */
    lastHeartbeat: number;
    /** Current load factor (0-1 scale) */
    currentLoad: number;
    /** Number of messages in queue */
    queueSize: number;
  };
  /** Gateway performance metrics */
  metrics: {
    /** Total messages processed by gateway */
    messagesProcessed: number;
    /** Average message latency in milliseconds */
    averageLatency: number;
    /** Error rate (0-1 scale) */
    errorRate: number;
    /** Uptime in milliseconds */
    uptime: number;
  };
}

/**
 * Gateway capabilities interface
 */
export interface GatewayCapabilities {
  /** Whether gateway is connected to mesh network */
  meshConnected: boolean;
  /** Whether gateway is connected to internet */
  internetConnected: boolean;
  /** Maximum message throughput */
  maxThroughput: number;
  /** List of supported protocol types */
  supportedProtocols: string[];
}

/**
 * Gateway registration request interface
 */
export interface GatewayRegistration {
  /** Unique node identifier */
  nodeId: string;
  /** Network endpoints for the gateway */
  networkEndpoints: {
    /** Mesh network endpoint (optional) */
    meshEndpoint?: string;
    /** Internet endpoint (required) */
    internetEndpoint: string;
  };
  /** Gateway capabilities */
  capabilities: GatewayCapabilities;
  /** Authentication credentials */
  authentication: {
    /** Public key for signature verification */
    publicKey: string;
    /** Cryptographic signature for authentication */
    signature: string;
  };
}

/**
 * Gateway selection criteria interface
 */
export interface GatewaySelectionCriteria {
  /** Prefer full node gateways over light nodes */
  preferFullNodes?: boolean;
  /** Minimum gateway score threshold (0-100) */
  minScore?: number;
  /** Maximum acceptable load (0-1 scale) */
  maxLoad?: number;
  /** Required protocol support list */
  requiredProtocols?: string[];
  /** Preferred maximum latency in milliseconds */
  preferredLatency?: number;
}

/**
 * Bridge message interface for cross-network communication
 */
export interface BridgeMessage {
  /** Message type identifier */
  type: string;
  /** Message payload data */
  payload?: Uint8Array;
  /** Additional message properties */
  [key: string]: unknown;
}

/**
 * GatewayManager - Manages gateway node registration and lifecycle
 *
 * Provides gateway registration with cryptographic authentication,
 * health monitoring, and basic status management for hybrid routing.
 *
 * @fires gateway-manager:started - Emitted when manager starts
 * @fires gateway-manager:stopped - Emitted when manager stops
 * @fires gateway:registered - Emitted when gateway is registered
 * @fires gateway:unregistered - Emitted when gateway is unregistered
 * @fires gateway:auth-failed - Emitted when authentication fails
 * @fires gateway:status-updated - Emitted when gateway status changes
 * @fires gateway:unhealthy - Emitted when gateway becomes unhealthy
 * @fires gateway:failed - Emitted when gateway fails
 * @fires gateway:reactivated - Emitted when inactive gateway reactivates
 */
export class GatewayManager extends EventEmitter {
  private gateways: Map<string, GatewayNode>;
  private peerManager: PeerManager;
  private cryptoService: CryptographicService;
  private networkBridge: NetworkBridge;
  private logger: Logger;
  private isRunning = false;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  /**
   * Create a new GatewayManager instance
   *
   * @param peerManager - Peer management service
   * @param cryptoService - Cryptographic service for authentication
   * @param compressionManager - UTXO compression manager for message optimization
   */
  constructor(
    peerManager: PeerManager,
    cryptoService: CryptographicService,
    compressionManager: UTXOCompressionManager
  ) {
    super();
    this.gateways = new Map();
    this.peerManager = peerManager;
    this.cryptoService = cryptoService;
    this.networkBridge = new NetworkBridge(compressionManager, cryptoService);
    this.logger = Logger.getInstance();
  }

  /**
   * Start the gateway manager
   *
   * Initializes health monitoring and begins tracking gateway nodes.
   * Emits 'gateway-manager:started' event on successful start.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('GatewayManager already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting gateway manager');

    this.startHealthMonitoring();

    this.emit('gateway-manager:started', { timestamp: Date.now() });
  }

  /**
   * Stop the gateway manager
   *
   * Stops health monitoring and clears all registered gateways.
   * Emits 'gateway-manager:stopped' event on successful stop.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('GatewayManager not running');
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping gateway manager');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Clear all gateways
    this.gateways.clear();

    this.emit('gateway-manager:stopped', { timestamp: Date.now() });
  }

  /**
   * Register a new gateway node
   *
   * Validates cryptographic authentication and creates gateway entry.
   * Emits 'gateway:registered' on success or 'gateway:auth-failed' on failure.
   *
   * @param registration - Gateway registration request
   * @returns Promise resolving to true if registration successful
   */
  async registerGateway(registration: GatewayRegistration): Promise<boolean> {
    // Verify authentication
    const isValid = await this.verifyGatewayAuthentication(registration);
    if (!isValid) {
      this.logger.warn('Gateway authentication failed', {
        nodeId: registration.nodeId,
      });
      this.emit('gateway:auth-failed', {
        nodeId: registration.nodeId,
        timestamp: Date.now(),
      });
      return false;
    }

    const gateway: GatewayNode = {
      id: registration.nodeId,
      address: registration.networkEndpoints.internetEndpoint,
      capabilities: registration.capabilities,
      status: {
        isActive: true,
        lastHeartbeat: Date.now(),
        currentLoad: 0,
        queueSize: 0,
      },
      metrics: {
        messagesProcessed: 0,
        averageLatency: 0,
        errorRate: 0,
        uptime: 0,
      },
    };

    this.gateways.set(registration.nodeId, gateway);

    this.logger.info('Gateway registered', {
      nodeId: registration.nodeId,
      capabilities: registration.capabilities,
    });

    this.emit('gateway:registered', {
      gateway,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Unregister a gateway node
   *
   * Removes gateway from management and emits 'gateway:unregistered' event.
   *
   * @param gatewayId - Gateway identifier to unregister
   */
  async unregisterGateway(gatewayId: string): Promise<void> {
    const gateway = this.gateways.get(gatewayId);

    if (gateway) {
      this.gateways.delete(gatewayId);

      this.logger.info('Gateway unregistered', { gatewayId });

      this.emit('gateway:unregistered', {
        gatewayId,
        timestamp: Date.now(),
      });
    } else {
      this.logger.warn('Attempted to unregister unknown gateway', {
        gatewayId,
      });
    }
  }

  /**
   * Update gateway status
   *
   * Updates partial status fields for a gateway.
   * Emits 'gateway:status-updated' event.
   *
   * @param gatewayId - Gateway identifier
   * @param status - Partial status update
   */
  updateGatewayStatus(
    gatewayId: string,
    status: Partial<GatewayNode['status']>
  ): void {
    const gateway = this.gateways.get(gatewayId);

    if (gateway) {
      gateway.status = { ...gateway.status, ...status };
      this.gateways.set(gatewayId, gateway);

      this.logger.debug('Gateway status updated', { gatewayId, status });

      this.emit('gateway:status-updated', {
        gatewayId,
        status: gateway.status,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Update gateway metrics
   *
   * Updates partial metrics fields for a gateway.
   *
   * @param gatewayId - Gateway identifier
   * @param metrics - Partial metrics update
   */
  updateGatewayMetrics(
    gatewayId: string,
    metrics: Partial<GatewayNode['metrics']>
  ): void {
    const gateway = this.gateways.get(gatewayId);

    if (gateway) {
      gateway.metrics = { ...gateway.metrics, ...metrics };
      this.gateways.set(gatewayId, gateway);

      this.logger.debug('Gateway metrics updated', { gatewayId, metrics });
    }
  }

  /**
   * Get a specific gateway by ID
   *
   * @param gatewayId - Gateway identifier
   * @returns Gateway node or null if not found
   */
  getGateway(gatewayId: string): GatewayNode | null {
    return this.gateways.get(gatewayId) || null;
  }

  /**
   * Get all available gateways
   *
   * Returns gateways that are:
   * - Active (isActive = true)
   * - Connected to both mesh and internet
   *
   * @returns Array of available gateway nodes
   */
  getAvailableGateways(): GatewayNode[] {
    return Array.from(this.gateways.values()).filter(
      gateway =>
        gateway.status.isActive &&
        gateway.capabilities.meshConnected &&
        gateway.capabilities.internetConnected
    );
  }

  /**
   * Get all gateways regardless of status
   *
   * @returns Array of all registered gateway nodes
   */
  getAllGateways(): GatewayNode[] {
    return Array.from(this.gateways.values());
  }

  /**
   * Check gateway health based on heartbeat
   *
   * Marks gateway as unhealthy if heartbeat is older than 60 seconds.
   * Emits 'gateway:unhealthy' event if gateway becomes unhealthy.
   *
   * @param gatewayId - Gateway identifier
   * @returns Promise resolving to true if gateway is healthy
   */
  async checkGatewayHealth(gatewayId: string): Promise<boolean> {
    const gateway = this.gateways.get(gatewayId);
    if (!gateway) return false;

    const timeSinceHeartbeat = Date.now() - gateway.status.lastHeartbeat;
    const isHealthy = timeSinceHeartbeat < 60000; // 1 minute timeout

    if (!isHealthy && gateway.status.isActive) {
      gateway.status.isActive = false;

      this.logger.warn('Gateway unhealthy', {
        gatewayId,
        timeSinceHeartbeat,
      });

      this.emit('gateway:unhealthy', {
        gatewayId,
        timeSinceHeartbeat,
        timestamp: Date.now(),
      });
    }

    return isHealthy;
  }

  /**
   * Handle gateway failure
   *
   * Marks gateway as inactive and emits 'gateway:failed' event.
   *
   * @param gatewayId - Gateway identifier
   */
  handleGatewayFailure(gatewayId: string): void {
    const gateway = this.gateways.get(gatewayId);

    if (gateway) {
      gateway.status.isActive = false;

      this.logger.error('Gateway failure detected', { gatewayId });

      this.emit('gateway:failed', {
        gatewayId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Record heartbeat for a gateway
   *
   * Updates last heartbeat timestamp and reactivates gateway if inactive.
   * Emits 'gateway:reactivated' event if gateway was previously inactive.
   *
   * @param gatewayId - Gateway identifier
   */
  recordHeartbeat(gatewayId: string): void {
    const gateway = this.gateways.get(gatewayId);

    if (gateway) {
      gateway.status.lastHeartbeat = Date.now();

      // Reactivate if previously inactive
      if (!gateway.status.isActive) {
        gateway.status.isActive = true;

        this.logger.info('Gateway reactivated', { gatewayId });

        this.emit('gateway:reactivated', {
          gatewayId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Verify gateway authentication
   *
   * Uses CryptographicService to verify signature against public key.
   *
   * @param registration - Gateway registration request
   * @returns Promise resolving to true if authentication valid
   */

  /**
   * Select optimal gateway based on criteria
   *
   * Evaluates available gateways using a scoring algorithm that considers:
   * - Current load (30% weight)
   * - Error rate (30% weight)
   * - Latency (20% weight)
   * - Queue size (20% weight)
   *
   * Emits 'gateway:selected' event with gateway ID and score.
   *
   * @param criteria - Selection criteria to filter and score gateways
   * @returns Selected gateway node or null if none available
   * @throws Error if criteria parameters are invalid
   */
  selectOptimalGateway(
    criteria: GatewaySelectionCriteria = {}
  ): GatewayNode | null {
    // Validate criteria
    if (
      criteria.minScore !== undefined &&
      (criteria.minScore < 0 || criteria.minScore > 100)
    ) {
      throw new Error('minScore must be between 0 and 100');
    }
    if (
      criteria.maxLoad !== undefined &&
      (criteria.maxLoad < 0 || criteria.maxLoad > 1)
    ) {
      throw new Error('maxLoad must be between 0 and 1');
    }
    if (
      criteria.preferredLatency !== undefined &&
      criteria.preferredLatency < 0
    ) {
      throw new Error('preferredLatency must be non-negative');
    }

    const available = this.getAvailableGateways();

    if (available.length === 0) {
      this.logger.warn('No available gateways for selection');
      return null;
    }

    // Calculate scores once and cache them
    const gatewaysWithScores = available.map(gateway => ({
      gateway,
      score: this.calculateGatewayScore(gateway),
    }));

    // Filter by criteria
    const filtered = gatewaysWithScores.filter(({ gateway, score }) => {
      // Check minimum score
      if (criteria.minScore && score < criteria.minScore) {
        return false;
      }

      // Check maximum load
      if (criteria.maxLoad && gateway.status.currentLoad > criteria.maxLoad) {
        return false;
      }

      // Check required protocols
      if (criteria.requiredProtocols) {
        const hasAll = criteria.requiredProtocols.every(proto =>
          gateway.capabilities.supportedProtocols.includes(proto)
        );
        if (!hasAll) return false;
      }

      // Check preferred latency
      if (
        criteria.preferredLatency &&
        gateway.metrics.averageLatency > criteria.preferredLatency
      ) {
        return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      this.logger.warn('No gateways match selection criteria, using fallback');
      // Fallback to first available if no matches
      return available[0];
    }

    // Select gateway with best score (already cached)
    const selected = filtered.reduce((best, current) =>
      current.score > best.score ? current : best
    ).gateway;

    const selectedScore = this.calculateGatewayScore(selected);

    this.logger.debug('Selected optimal gateway', {
      gatewayId: selected.id,
      score: selectedScore,
      load: selected.status.currentLoad,
    });

    this.emit('gateway:selected', {
      gatewayId: selected.id,
      score: selectedScore,
      timestamp: Date.now(),
    });

    return selected;
  }

  /**
   * Distribute load across available gateways
   *
   * Calculates average load and identifies overloaded/underloaded gateways.
   * Emits 'load:distributed' event with load statistics.
   * Emits 'load:imbalanced' event if significant imbalance detected.
   */
  distributeLoad(): void {
    const gateways = this.getAvailableGateways();

    if (gateways.length === 0) {
      this.logger.warn('No gateways available for load distribution');
      return;
    }

    const totalLoad = gateways.reduce(
      (sum, g) => sum + g.status.currentLoad,
      0
    );
    const avgLoad = totalLoad / gateways.length;

    this.logger.debug('Distributing gateway load', {
      totalLoad,
      avgLoad,
      gatewayCount: gateways.length,
    });

    // Identify overloaded and underloaded gateways
    const overloaded = gateways.filter(
      g => g.status.currentLoad > avgLoad * 1.5
    );
    const underloaded = gateways.filter(
      g => g.status.currentLoad < avgLoad * 0.5
    );

    if (overloaded.length > 0 && underloaded.length > 0) {
      this.emit('load:imbalanced', {
        overloaded: overloaded.map(g => g.id),
        underloaded: underloaded.map(g => g.id),
        avgLoad,
        timestamp: Date.now(),
      });
    }

    this.emit('load:distributed', {
      totalLoad,
      avgLoad,
      gatewayCount: gateways.length,
      timestamp: Date.now(),
    });
  }

  /**
   * Rebalance traffic across gateways
   *
   * Triggers load distribution and emits 'traffic:rebalanced' event.
   */
  rebalanceTraffic(): void {
    this.logger.info('Rebalancing traffic across gateways');

    this.distributeLoad();

    this.emit('traffic:rebalanced', {
      timestamp: Date.now(),
    });
  }

  /**
   * Bridge message through gateway
   *
   * Tracks gateway usage, updates metrics, and handles message bridging.
   * This is a placeholder implementation that will be completed in Part 6.
   *
   * Emits 'message:bridged' on success or 'message:bridge-failed' on error.
   *
   * @param message - Message to bridge
   * @param gateway - Gateway node to use
   * @param destination - Destination node identifier
   * @returns Promise resolving to true if bridging successful
   * @throws Error if message or destination is invalid
   */
  async bridgeMessage(
    message: BridgeMessage,
    gateway: GatewayNode,
    destination: string
  ): Promise<boolean> {
    // Validate inputs
    if (!message || !message.type) {
      throw new Error('Invalid message: type is required');
    }
    if (!destination || destination.trim() === '') {
      throw new Error('Invalid destination: must be non-empty string');
    }

    // Track gateway usage
    gateway.status.queueSize++;
    gateway.status.currentLoad =
      gateway.capabilities.maxThroughput > 0
        ? gateway.status.queueSize / gateway.capabilities.maxThroughput
        : 1.0; // Treat as fully loaded if maxThroughput is 0

    try {
      // Determine target network based on destination
      const peer = this.peerManager.getPeer(destination);
      const targetNetwork: 'mesh' | 'internet' = peer?.address.includes(
        '.mesh.'
      )
        ? 'mesh'
        : 'internet';

      // Bridge the message using NetworkBridge
      const bridged = await this.networkBridge.bridgeMessage(
        message,
        targetNetwork
      );

      if (!bridged) {
        this.logger.error('Network bridge failed', { destination });
        throw new Error('Network bridge failed');
      }

      this.logger.debug('Bridging message via gateway', {
        gatewayId: gateway.id,
        destination,
        messageType: message.type,
        targetNetwork,
      });

      // Update metrics
      gateway.metrics.messagesProcessed++;

      this.emit('message:bridged', {
        gatewayId: gateway.id,
        destination,
        messageType: message.type,
        targetNetwork,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to bridge message', {
        error,
        gatewayId: gateway.id,
      });

      // Update error rate correctly
      gateway.metrics.messagesProcessed++;
      gateway.metrics.errorRate =
        (gateway.metrics.errorRate * (gateway.metrics.messagesProcessed - 1) +
          1) /
        gateway.metrics.messagesProcessed;

      this.emit('message:bridge-failed', {
        gatewayId: gateway.id,
        destination,
        error,
        timestamp: Date.now(),
      });

      return false;
    } finally {
      // Always decrement queue size
      gateway.status.queueSize = Math.max(0, gateway.status.queueSize - 1);
      gateway.status.currentLoad =
        gateway.capabilities.maxThroughput > 0
          ? gateway.status.queueSize / gateway.capabilities.maxThroughput
          : 1.0;
    }
  }

  /**
   * Calculate gateway score based on performance metrics
   *
   * Scoring algorithm:
   * - Load score (30%): Lower load = higher score
   * - Error score (30%): Lower error rate = higher score
   * - Latency score (20%): Lower latency = higher score
   *   - Latency of 0ms = 100 points, 1000ms = 0 points, >1000ms = 0 points
   * - Queue score (20%): Smaller queue = higher score
   *
   * @param gateway - Gateway node to score
   * @returns Score from 0-100 (higher is better)
   */
  private calculateGatewayScore(gateway: GatewayNode): number {
    // Score based on load (0-100, higher is better)
    const loadScore = (1 - gateway.status.currentLoad) * 100;

    // Score based on error rate (0-100, higher is better)
    const errorScore = (1 - gateway.metrics.errorRate) * 100;

    // Score based on latency (0-100, higher is better)
    // Latency of 0ms = 100 points, 1000ms = 0 points, >1000ms = 0 points
    const latencyScore = Math.max(0, 100 - gateway.metrics.averageLatency / 10);

    // Score based on queue size (0-100, higher is better)
    // Handle division by zero when maxThroughput is 0
    const queueScore =
      gateway.capabilities.maxThroughput > 0
        ? (1 - gateway.status.queueSize / gateway.capabilities.maxThroughput) *
          100
        : 0;

    // Weighted average
    const weights = {
      load: 0.3,
      error: 0.3,
      latency: 0.2,
      queue: 0.2,
    };

    const totalScore =
      loadScore * weights.load +
      errorScore * weights.error +
      latencyScore * weights.latency +
      queueScore * weights.queue;

    return Math.max(0, Math.min(100, totalScore));
  }

  private async verifyGatewayAuthentication(
    registration: GatewayRegistration
  ): Promise<boolean> {
    try {
      const message = new TextEncoder().encode(registration.nodeId);
      const publicKey = new TextEncoder().encode(
        registration.authentication.publicKey
      );
      const signatureBytes = new TextEncoder().encode(
        registration.authentication.signature
      );

      const signature = {
        signature: signatureBytes,
        algorithm: 'secp256k1' as const,
      };

      return CryptographicService.verify(signature, message, publicKey);
    } catch (error) {
      this.logger.error('Gateway authentication verification failed', {
        error,
      });
      return false;
    }
  }

  /**
   * Start health monitoring
   *
   * Checks all gateway health every 30 seconds.
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;

      for (const [gatewayId] of this.gateways) {
        await this.checkGatewayHealth(gatewayId);
      }
    }, 30000); // Check every 30 seconds
  }
}
