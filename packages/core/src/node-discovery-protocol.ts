import {
  type DiscoveryBeacon,
  type NeighborNode,
  type RouteInfo,
  type EnhancedNetworkTopology,
  type DiscoveryConfig,
  type DiscoveryError,
  type DiscoveryMetrics,
  type INodeDiscoveryProtocol,
  type MeshMessage,
  type IDutyCycleManager,
  type IReliableDeliveryManager,
  type NodeCapabilities,
  type TopologyNode,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { UTXOCompressionManager } from './utxo-compression-manager.js';
import { Logger } from '@lorachain/shared';
import { EventEmitter } from 'events';

/**
 * Node Discovery Protocol implementation
 *
 * BREAKING CHANGE: Complete implementation of node discovery for UTXO-aware mesh networking.
 * Integrates with existing compression, duty cycle, and reliable delivery systems.
 *
 * Features:
 * - Periodic beacon transmission with duty cycle compliance
 * - Neighbor list management with UTXO capabilities
 * - Network topology mapping with compression optimization
 * - Integration with existing mesh protocol systems
 * - Cryptographic security for all discovery messages
 */
export class NodeDiscoveryProtocol
  extends EventEmitter
  implements INodeDiscoveryProtocol
{
  private nodeId: string;
  private nodeKeyPair: KeyPair;
  private nodeType: 'light' | 'full';
  private config: DiscoveryConfig;
  private logger: Logger;
  private cryptoService: CryptographicService;

  // Discovery state
  private isActive = false;
  private beaconSequence = 0;
  private discoveryTimer?: ReturnType<typeof setTimeout>;
  private cleanupTimer?: ReturnType<typeof setTimeout>;

  // Neighbor and topology management
  private neighbors: Map<string, NeighborNode> = new Map();
  private topology: EnhancedNetworkTopology;
  private lastTopologyUpdate = 0;

  // Integration with existing systems
  private dutyCycleManager?: IDutyCycleManager;
  private reliableDeliveryManager?: IReliableDeliveryManager;
  private compressionManager?: UTXOCompressionManager;

  // Performance metrics
  private metrics: DiscoveryMetrics = {
    beaconsProcessed: 0,
    neighborsDiscovered: 0,
    neighborsLost: 0,
    topologyUpdates: 0,
    averageBeaconProcessingTime: 0,
    averageNeighborLookupTime: 0,
    memoryUsageMB: 0,
    discoverySuccessRate: 1.0,
  };

  // Performance tracking
  private processingTimes: number[] = [];
  private lookupTimes: number[] = [];

  constructor(
    nodeId: string,
    nodeKeyPair: KeyPair,
    nodeType: 'light' | 'full',
    config: DiscoveryConfig,
    cryptoService?: CryptographicService
  ) {
    super();

    this.nodeId = nodeId;
    this.nodeKeyPair = nodeKeyPair;
    this.nodeType = nodeType;
    this.config = config;
    this.logger = Logger.getInstance();
    this.cryptoService = cryptoService || new CryptographicService();

    // Initialize topology
    this.topology = {
      nodes: new Map(),
      edges: new Map(),
      links: new Map(),
      version: 0,
      lastUpdated: Date.now(),
    };

    this.logger.info('NodeDiscoveryProtocol initialized', {
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      beaconInterval: this.config.beaconInterval,
      maxNeighbors: this.config.maxNeighbors,
    });
  }

  // ==========================================
  // Discovery Management API
  // ==========================================

  async startNodeDiscovery(config?: DiscoveryConfig): Promise<void> {
    if (this.isActive) {
      this.logger.warn('Node discovery already active');
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.logger.info('Starting node discovery protocol', {
      beaconInterval: this.config.beaconInterval,
      neighborTimeout: this.config.neighborTimeout,
      securityEnabled: this.config.securityConfig.enableBeaconSigning,
    });

    this.isActive = true;

    // Start periodic beacon transmission
    await this.scheduleBeaconTransmission();

    // Start neighbor cleanup task
    this.startNeighborCleanup();

    // Send initial beacon
    await this.sendDiscoveryBeacon();

    this.emit('discoveryStarted');
  }

  async stopNodeDiscovery(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Stopping node discovery protocol');

    this.isActive = false;

    // Clear timers
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.emit('discoveryStopped');
  }

  isDiscoveryActive(): boolean {
    return this.isActive;
  }

  // ==========================================
  // Beacon Management
  // ==========================================

  async sendDiscoveryBeacon(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Check duty cycle compliance before sending beacon
      if (this.dutyCycleManager && !this.dutyCycleManager.canTransmit(1000)) {
        this.logger.debug(
          'Beacon transmission delayed due to duty cycle limits'
        );
        return;
      }

      const beacon = await this.createDiscoveryBeacon();

      // Compress beacon if beneficial and compression manager is available
      let payload: string | Uint8Array = JSON.stringify(beacon);
      if (this.compressionManager) {
        const compressed = await this.compressionManager.compressIfBeneficial(
          payload as string,
          'discovery'
        );
        if (compressed.isCompressed) {
          payload = compressed.data;
        }
      }

      const message: MeshMessage = {
        type: 'discovery',
        payload: beacon,
        timestamp: Date.now(),
        from: this.nodeId,
        signature: await this.cryptoService.signMessage(JSON.stringify(beacon)),
      };

      // Use reliable delivery if available
      if (this.reliableDeliveryManager) {
        await this.reliableDeliveryManager.sendReliableMessage({
          ...message,
          id: `beacon_${this.nodeId}_${this.beaconSequence}`,
          reliability: 'best-effort',
          maxRetries: 1,
          timeoutMs: 5000,
          priority: 3, // Low priority for beacons
        });
      } else {
        // Fallback to direct broadcast
        this.emit('beaconSend', message);
      }

      this.logger.debug('Discovery beacon sent', {
        sequenceNumber: beacon.sequenceNumber,
        neighborCount: this.neighbors.size,
        compressionUsed: this.compressionManager !== undefined,
      });
    } catch (error) {
      this.logger.error('Failed to send discovery beacon', {
        error: error instanceof Error ? error.message : String(error),
      });

      const discoveryError: DiscoveryError = {
        type: 'beacon_invalid',
        message: `Failed to send beacon: ${error instanceof Error ? error.message : String(error)}`,
        nodeId: this.nodeId,
        timestamp: Date.now(),
      };
      this.emit('discoveryError', discoveryError);
    }
  }

  async processDiscoveryBeacon(
    beacon: DiscoveryBeacon,
    from: string
  ): Promise<void> {
    const startTime = performance.now();

    try {
      // Validate beacon signature if security is enabled
      if (this.config.securityConfig.enableBeaconSigning) {
        const isValid = await this.validateBeaconSignature(beacon);
        if (!isValid) {
          this.logger.warn('Invalid beacon signature', {
            nodeId: beacon.nodeId,
            from,
          });
          const error: DiscoveryError = {
            type: 'signature_invalid',
            message: 'Invalid beacon signature',
            nodeId: beacon.nodeId,
            timestamp: Date.now(),
          };
          this.emit('discoveryError', error);
          return;
        }
      }

      // Check for duplicate or old beacons
      const existingNeighbor = this.neighbors.get(beacon.nodeId);
      if (
        existingNeighbor &&
        beacon.sequenceNumber <= existingNeighbor.beaconSequence
      ) {
        this.logger.debug('Ignoring old or duplicate beacon', {
          nodeId: beacon.nodeId,
          sequenceNumber: beacon.sequenceNumber,
          lastSequence: existingNeighbor.beaconSequence,
        });
        return;
      }

      // Process beacon and update neighbor information
      if (existingNeighbor) {
        await this.updateExistingNeighbor(existingNeighbor, beacon);
      } else {
        if (this.neighbors.size >= this.config.maxNeighbors) {
          this.logger.warn('Maximum neighbors reached, ignoring new beacon', {
            nodeId: beacon.nodeId,
            maxNeighbors: this.config.maxNeighbors,
          });
          return;
        }

        const newNeighbor = await this.createNeighborFromBeacon(beacon);
        this.neighbors.set(beacon.nodeId, newNeighbor);
        this.metrics.neighborsDiscovered++;

        this.logger.info('New neighbor discovered', {
          nodeId: beacon.nodeId,
          nodeType: beacon.nodeType,
          capabilities: beacon.capabilities,
        });

        this.emit('neighborDiscovered', newNeighbor);
      }

      // Update topology map
      await this.updateTopologyMap(beacon);

      this.metrics.beaconsProcessed++;
      this.emit('beaconReceived', beacon, from);
    } catch (error) {
      this.logger.error('Failed to process discovery beacon', {
        nodeId: beacon.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });

      const discoveryError: DiscoveryError = {
        type: 'beacon_invalid',
        message: `Failed to process beacon: ${error instanceof Error ? error.message : String(error)}`,
        nodeId: beacon.nodeId,
        timestamp: Date.now(),
      };
      this.emit('discoveryError', discoveryError);
    } finally {
      // Track processing time
      const processingTime = performance.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      this.updateAverageProcessingTime();
    }
  }

  // ==========================================
  // Neighbor Information API
  // ==========================================

  getNeighbors(): NeighborNode[] {
    return Array.from(this.neighbors.values());
  }

  getNeighbor(nodeId: string): NeighborNode | null {
    const startTime = performance.now();
    const neighbor = this.neighbors.get(nodeId) || null;

    // Track lookup time
    const lookupTime = performance.now() - startTime;
    this.lookupTimes.push(lookupTime);
    if (this.lookupTimes.length > 100) {
      this.lookupTimes.shift();
    }
    this.updateAverageLookupTime();

    return neighbor;
  }

  getNeighborCount(): number {
    return this.neighbors.size;
  }

  // ==========================================
  // Topology Information API
  // ==========================================

  getNetworkTopology(): EnhancedNetworkTopology {
    return {
      ...this.topology,
      nodes: new Map(this.topology.nodes),
      edges: new Map(this.topology.edges),
    };
  }

  findRoute(destination: string): RouteInfo | null {
    const neighbor = this.neighbors.get(destination);
    if (neighbor) {
      // Direct neighbor
      return {
        destination,
        nextHop: destination,
        hopCount: 1,
        quality: this.calculateRouteQuality(neighbor),
        lastUpdated: neighbor.lastSeen,
        compressionSupport: neighbor.compressionCompatibility.supportedEngines,
        estimatedDelay: this.estimateDelay(neighbor),
      };
    }

    // Find route through neighbors
    let bestRoute: RouteInfo | null = null;
    let bestQuality = 0;

    for (const [nodeId, neighbor] of this.neighbors) {
      for (const route of neighbor.routes) {
        if (route.destination === destination) {
          const totalQuality =
            this.calculateRouteQuality(neighbor) * route.quality;
          if (totalQuality > bestQuality) {
            bestQuality = totalQuality;
            bestRoute = {
              destination,
              nextHop: nodeId,
              hopCount: route.hopCount + 1,
              quality: totalQuality,
              lastUpdated: Math.min(neighbor.lastSeen, route.lastUpdated),
              compressionSupport: this.intersectCompressionSupport(
                neighbor.compressionCompatibility.supportedEngines,
                route.compressionSupport
              ),
              estimatedDelay:
                this.estimateDelay(neighbor) + route.estimatedDelay,
            };
          }
        }
      }
    }

    return bestRoute;
  }

  getReachableNodes(): string[] {
    const reachable = new Set<string>();

    // Add direct neighbors
    for (const nodeId of this.neighbors.keys()) {
      reachable.add(nodeId);
    }

    // Add nodes reachable through neighbors
    for (const neighbor of this.neighbors.values()) {
      for (const route of neighbor.routes) {
        reachable.add(route.destination);
      }
    }

    return Array.from(reachable);
  }

  // ==========================================
  // Metrics and Monitoring
  // ==========================================

  getDiscoveryMetrics(): DiscoveryMetrics {
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  // ==========================================
  // Integration Methods
  // ==========================================

  setDutyCycleManager(dutyCycleManager: IDutyCycleManager): void {
    this.dutyCycleManager = dutyCycleManager;
    this.logger.debug('Duty cycle manager integrated with discovery protocol');
  }

  setReliableDeliveryManager(
    reliableDeliveryManager: IReliableDeliveryManager
  ): void {
    this.reliableDeliveryManager = reliableDeliveryManager;
    this.logger.debug(
      'Reliable delivery manager integrated with discovery protocol'
    );
  }

  setCompressionManager(compressionManager: UTXOCompressionManager): void {
    this.compressionManager = compressionManager;
    this.logger.debug('Compression manager integrated with discovery protocol');
  }

  // ==========================================
  // Private Implementation Methods
  // ==========================================

  private async createDiscoveryBeacon(): Promise<DiscoveryBeacon> {
    const capabilities = this.getNodeCapabilities();

    const beacon: DiscoveryBeacon = {
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      capabilities,
      sequenceNumber: ++this.beaconSequence,
      timestamp: Date.now(),
      networkInfo: {
        blockHeight: this.getBlockHeight(),
        peerCount: this.neighbors.size,
        signalStrength: this.getCurrentSignalStrength(),
        utxoSetSize: this.getUTXOSetSize(),
        compressionEngines:
          this.compressionManager?.getSupportedEngines() || [],
        dutyCycleRegion: this.dutyCycleManager?.getConfig().region || 'unknown',
      },
      signature: '', // Will be filled by signBeacon
    };

    beacon.signature = await this.signBeacon(beacon);
    return beacon;
  }

  private getNodeCapabilities(): NodeCapabilities {
    return {
      canMine: this.nodeType === 'full',
      supportsRelay: true,
      batteryLevel: this.getBatteryLevel(),
      maxHopCount: 10,
      supportedCompressionEngines:
        this.compressionManager?.getSupportedEngines() || ['none'],
      dutyCycleCompliance: this.dutyCycleManager
        ? [this.dutyCycleManager.getConfig().region]
        : [],
      maxQueueSize: 1000, // Default max queue size
      supportsUTXORouting: true,
    };
  }

  private async signBeacon(beacon: DiscoveryBeacon): Promise<string> {
    const beaconToSign = { ...beacon, signature: '' };
    return await this.cryptoService.signMessage(JSON.stringify(beaconToSign));
  }

  private async validateBeaconSignature(
    beacon: DiscoveryBeacon
  ): Promise<boolean> {
    try {
      const beaconToVerify = { ...beacon, signature: '' };
      return await this.cryptoService.verifySignature(
        beacon.signature,
        JSON.stringify(beaconToVerify),
        beacon.nodeId
      );
    } catch (error) {
      this.logger.error('Beacon signature validation failed', {
        nodeId: beacon.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async createNeighborFromBeacon(
    beacon: DiscoveryBeacon
  ): Promise<NeighborNode> {
    return {
      id: beacon.nodeId,
      address: beacon.nodeId,
      port: 0,
      type: beacon.nodeType,
      isOnline: true,
      lastSeen: beacon.timestamp,
      nodeType: beacon.nodeType,
      capabilities: beacon.capabilities,
      signalStrength: beacon.networkInfo.signalStrength,
      hopCount: 1,
      firstSeen: beacon.timestamp,
      beaconSequence: beacon.sequenceNumber,
      isStale: false,
      routes: [],
      compressionCompatibility: {
        supportedEngines: beacon.capabilities.supportedCompressionEngines,
        preferredEngine: this.selectOptimalCompressionEngine(
          beacon.capabilities.supportedCompressionEngines
        ),
        compressionRatio: 0,
      },
      dutyCycleStatus: {
        region: beacon.networkInfo.dutyCycleRegion,
        currentUsage: 0,
        availableTime: 0,
        nextAvailableSlot: 0,
      },
      queueStatus: {
        currentSize: 0,
        maxSize: beacon.capabilities.maxQueueSize,
        priorityDistribution: {},
      },
    };
  }

  private async updateExistingNeighbor(
    neighbor: NeighborNode,
    beacon: DiscoveryBeacon
  ): Promise<void> {
    neighbor.lastSeen = beacon.timestamp;
    neighbor.beaconSequence = beacon.sequenceNumber;
    neighbor.signalStrength = beacon.networkInfo.signalStrength;
    neighbor.capabilities = beacon.capabilities;
    neighbor.isStale = false;

    // Update compression compatibility
    neighbor.compressionCompatibility.supportedEngines =
      beacon.capabilities.supportedCompressionEngines;
    neighbor.compressionCompatibility.preferredEngine =
      this.selectOptimalCompressionEngine(
        beacon.capabilities.supportedCompressionEngines
      );

    // Update duty cycle status
    neighbor.dutyCycleStatus.region = beacon.networkInfo.dutyCycleRegion;

    // Update queue status
    neighbor.queueStatus.maxSize = beacon.capabilities.maxQueueSize;

    this.logger.debug('Updated existing neighbor', {
      nodeId: beacon.nodeId,
      signalStrength: beacon.networkInfo.signalStrength,
    });
  }

  private async updateTopologyMap(beacon: DiscoveryBeacon): Promise<void> {
    const topologyNode: TopologyNode = {
      id: beacon.nodeId,
      nodeType: beacon.nodeType,
      capabilities: beacon.capabilities,
      lastSeen: beacon.timestamp,
      directNeighbors: [], // Would be extracted from beacon if available
      hopDistance: 1,
    };

    this.topology.nodes.set(beacon.nodeId, topologyNode);
    this.topology.version++;
    this.topology.lastUpdated = Date.now();
    this.lastTopologyUpdate = Date.now();
    this.metrics.topologyUpdates++;

    this.emit('topologyUpdated', this.getNetworkTopology());
  }

  private selectOptimalCompressionEngine(supportedEngines: string[]): string {
    if (this.compressionManager) {
      const ourEngines = this.compressionManager.getSupportedEngines();
      const intersection = supportedEngines.filter(engine =>
        ourEngines.includes(engine)
      );

      // Prefer compression engines in order of efficiency
      const preferredOrder = ['lz4', 'gzip', 'zlib', 'brotli'];
      for (const engine of preferredOrder) {
        if (intersection.includes(engine)) {
          return engine;
        }
      }
    }

    return supportedEngines[0] || 'none';
  }

  private calculateRouteQuality(neighbor: NeighborNode): number {
    let quality = 0.5; // Base quality

    // Signal strength factor (0.0 to 1.0)
    quality += (neighbor.signalStrength / 100) * 0.3;

    // Node type factor (full nodes preferred)
    if (neighbor.nodeType === 'full') {
      quality += 0.2;
    }

    // Freshness factor
    const age = Date.now() - neighbor.lastSeen;
    const maxAge = this.config.neighborTimeout;
    quality += Math.max(0, 1 - age / maxAge) * 0.2;

    // Capabilities factor
    if (neighbor.capabilities.supportsUTXORouting) {
      quality += 0.1;
    }
    if (neighbor.capabilities.canMine) {
      quality += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, quality));
  }

  private estimateDelay(neighbor: NeighborNode): number {
    // Base delay for one hop (in milliseconds)
    let delay = 1000;

    // Adjust based on signal strength
    delay += (100 - neighbor.signalStrength) * 10;

    // Adjust based on queue status
    const queueLoad =
      neighbor.queueStatus.currentSize / neighbor.queueStatus.maxSize;
    delay += queueLoad * 2000;

    return delay;
  }

  private intersectCompressionSupport(
    engines1: string[],
    engines2: string[]
  ): string[] {
    return engines1.filter(engine => engines2.includes(engine));
  }

  private async scheduleBeaconTransmission(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const interval = this.config.performanceConfig?.enableAdaptiveBeaconInterval
      ? this.calculateAdaptiveBeaconInterval()
      : this.config.beaconInterval;

    this.discoveryTimer = setInterval(async () => {
      if (this.isActive) {
        await this.sendDiscoveryBeacon();
      }
    }, interval);
  }

  private calculateAdaptiveBeaconInterval(): number {
    const baseInterval = this.config.beaconInterval;
    const neighborCount = this.neighbors.size;

    // Reduce beacon frequency as more neighbors are discovered
    const factor = Math.min(
      2.0,
      1.0 + neighborCount / this.config.maxNeighbors
    );
    return Math.floor(baseInterval * factor);
  }

  private startNeighborCleanup(): void {
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupStaleNeighbors();
      },
      Math.min(this.config.neighborTimeout / 4, 30000)
    );
  }

  private cleanupStaleNeighbors(): void {
    const now = Date.now();
    const staleNodes: string[] = [];

    for (const [nodeId, neighbor] of this.neighbors) {
      if (now - neighbor.lastSeen > this.config.neighborTimeout) {
        staleNodes.push(nodeId);
      }
    }

    for (const nodeId of staleNodes) {
      const neighbor = this.neighbors.get(nodeId);
      if (neighbor) {
        neighbor.isStale = true;
        this.neighbors.delete(nodeId);
        this.metrics.neighborsLost++;

        this.logger.info('Neighbor lost due to timeout', {
          nodeId,
          lastSeen: new Date(neighbor.lastSeen).toISOString(),
        });

        this.emit('neighborLost', nodeId);
      }
    }

    // Clean up topology nodes that are no longer reachable
    for (const [nodeId, topologyNode] of this.topology.nodes) {
      if (now - topologyNode.lastSeen > this.config.neighborTimeout * 2) {
        this.topology.nodes.delete(nodeId);
        this.topology.edges.delete(nodeId);
        this.topology.version++;
      }
    }
  }

  private updateAverageProcessingTime(): void {
    if (this.processingTimes.length > 0) {
      this.metrics.averageBeaconProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) /
        this.processingTimes.length;
    }
  }

  private updateAverageLookupTime(): void {
    if (this.lookupTimes.length > 0) {
      this.metrics.averageNeighborLookupTime =
        this.lookupTimes.reduce((a, b) => a + b, 0) / this.lookupTimes.length;
    }
  }

  private updateMemoryUsage(): void {
    // Estimate memory usage in MB
    let memoryBytes = 0;

    // Neighbors map
    memoryBytes += this.neighbors.size * 1000; // ~1KB per neighbor estimate

    // Topology
    memoryBytes += this.topology.nodes.size * 500; // ~500 bytes per topology node
    memoryBytes += this.topology.edges.size * 200; // ~200 bytes per edge

    // Performance tracking arrays
    memoryBytes += this.processingTimes.length * 8; // 8 bytes per number
    memoryBytes += this.lookupTimes.length * 8;

    this.metrics.memoryUsageMB = memoryBytes / (1024 * 1024);
  }

  // Placeholder methods for integration points
  private getBlockHeight(): number | undefined {
    // Would integrate with blockchain state
    return undefined;
  }

  private getCurrentSignalStrength(): number {
    // Would integrate with radio hardware
    return 80; // Default good signal strength
  }

  private getUTXOSetSize(): number | undefined {
    // Would integrate with UTXO manager
    return undefined;
  }

  private getBatteryLevel(): number | undefined {
    // Would integrate with power management
    return undefined;
  }
}
