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
  private logger: Logger;
  private isRunning = false;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  /**
   * Create a new GatewayManager instance
   *
   * @param peerManager - Peer management service
   * @param cryptoService - Cryptographic service for authentication
   */
  constructor(peerManager: PeerManager, cryptoService: CryptographicService) {
    super();
    this.gateways = new Map();
    this.peerManager = peerManager;
    this.cryptoService = cryptoService;
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
