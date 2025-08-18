/**
 * Comprehensive Peer Management System for Lorachain Network
 *
 * This module provides sophisticated peer management capabilities including:
 * - Advanced peer discovery (DNS seeds, peer exchange, mDNS, mesh announcements)
 * - Connection pool management with quality metrics
 * - Multi-factor peer scoring and reputation system
 * - Automatic misbehavior detection and banning
 * - Integration with existing UTXO sync and mesh protocols
 *
 * Designed for hybrid internet/LoRa mesh networks with UTXO-only blockchain model.
 */

import { EventEmitter } from 'events';
import { Logger } from '@lorachain/shared';
import { v4 as _uuidv4 } from 'uuid';

import {
  EnhancedNetworkNode,
  PeerConnection,
  PeerScore,
  BanEntry,
  MisbehaviorType,
  MisbehaviorIncident,
  PeerManagerConfig,
  PeerManagerStatistics,
  PeerMetrics,
  PeerManagerEvents as _PeerManagerEvents,
  IPeerManager,
  IPeerDiscoveryService,
  IConnectionPoolManager,
  IPeerScoringService,
  IBanListManager,
  PeerDiscoveryConfig,
  ConnectionPoolConfig,
  ScoringConfig,
  MisbehaviorConfig,
  DEFAULT_PEER_MANAGER_CONFIG,
} from './peer-management-types.js';

// =============================================================================
// Peer Discovery Service
// =============================================================================

/**
 * Comprehensive peer discovery service supporting multiple discovery mechanisms
 */
export class PeerDiscoveryService
  extends EventEmitter
  implements IPeerDiscoveryService
{
  private config: PeerDiscoveryConfig;
  private logger = Logger.getInstance();
  private discoveredPeers: Map<string, EnhancedNetworkNode> = new Map();
  private isRunning = false;
  private discoveryTimer?: ReturnType<typeof setTimeout>;

  constructor(config: PeerDiscoveryConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Starting peer discovery service', {
      dnsSeeds: this.config.dnsSeeds.length,
      peerExchange: this.config.enablePeerExchange,
      mdns: this.config.enableMdns,
      meshAnnounce: this.config.enableMeshAnnounce,
    });

    // Start initial discovery
    await this.performDiscovery();

    // Start periodic discovery
    this.startPeriodicDiscovery();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }

    this.logger.info('Stopping peer discovery service');
  }

  getDiscoveredPeers(): EnhancedNetworkNode[] {
    return Array.from(this.discoveredPeers.values());
  }

  async forceDiscovery(): Promise<void> {
    await this.performDiscovery();
  }

  private async performDiscovery(): Promise<void> {
    if (!this.isRunning) return;

    const discoveryPromises: Promise<void>[] = [];

    // DNS seed discovery
    if (this.config.dnsSeeds.length > 0) {
      discoveryPromises.push(this.performDnsDiscovery());
    }

    // mDNS discovery
    if (this.config.enableMdns) {
      discoveryPromises.push(this.performMdnsDiscovery());
    }

    // Mesh announcement discovery
    if (this.config.enableMeshAnnounce) {
      discoveryPromises.push(this.performMeshDiscovery());
    }

    // Peer exchange discovery
    if (this.config.enablePeerExchange) {
      discoveryPromises.push(this.performPeerExchange());
    }

    // Execute all discovery methods concurrently
    await Promise.allSettled(discoveryPromises);
  }

  private async performDnsDiscovery(): Promise<void> {
    for (const seed of this.config.dnsSeeds) {
      try {
        const peers = await this.queryDnsSeed(seed);
        let addedCount = 0;

        for (const peer of peers) {
          if (this.addDiscoveredPeer(peer, 'dns', seed)) {
            addedCount++;
          }
        }

        if (addedCount > 0) {
          this.logger.info(
            `Discovered ${addedCount} peers from DNS seed: ${seed}`
          );
        }
      } catch (error) {
        this.logger.warn(`Failed to query DNS seed: ${seed}`, {
          error: (error as Error).message,
        });
      }
    }
  }

  private async queryDnsSeed(
    seed: string
  ): Promise<Partial<EnhancedNetworkNode>[]> {
    // Placeholder implementation for DNS seed queries
    // In production, this would use actual DNS queries to resolve peer addresses
    this.logger.debug(`Querying DNS seed: ${seed}`);

    // Simulate DNS discovery with some test peers
    // TODO: Implement actual DNS seed server queries
    return [
      {
        id: `dns-peer-${Date.now()}-1`,
        address: '192.168.1.100',
        port: 8333,
        type: 'full' as const,
        isOnline: true,
        lastSeen: Date.now(),
        discoveryMethod: 'dns' as const,
        discoveredAt: Date.now(),
      },
      {
        id: `dns-peer-${Date.now()}-2`,
        address: '192.168.1.101',
        port: 8333,
        type: 'light' as const,
        isOnline: true,
        lastSeen: Date.now(),
        discoveryMethod: 'dns' as const,
        discoveredAt: Date.now(),
      },
    ];
  }

  private async performMdnsDiscovery(): Promise<void> {
    try {
      // Placeholder implementation for mDNS/Bonjour discovery
      // TODO: Implement actual mDNS discovery using bonjour library
      this.logger.debug('Performing mDNS peer discovery');

      // Simulate local network discovery
      const localPeers = await this.discoverLocalPeers();
      let addedCount = 0;

      for (const peer of localPeers) {
        if (this.addDiscoveredPeer(peer, 'mdns')) {
          addedCount++;
        }
      }

      if (addedCount > 0) {
        this.logger.info(`Discovered ${addedCount} peers via mDNS`);
      }
    } catch (error) {
      this.logger.warn('mDNS discovery failed', {
        error: (error as Error).message,
      });
    }
  }

  private async discoverLocalPeers(): Promise<Partial<EnhancedNetworkNode>[]> {
    // Placeholder for local network peer discovery
    // TODO: Implement actual mDNS/Bonjour service discovery
    return [];
  }

  private async performMeshDiscovery(): Promise<void> {
    try {
      // Placeholder implementation for mesh network announcements
      // This would integrate with the existing EnhancedMeshProtocol
      // TODO: Integrate with mesh protocol for peer announcements
      this.logger.debug('Performing mesh network peer discovery');

      // Simulate mesh peer discovery
      const meshPeers = await this.discoverMeshPeers();
      let addedCount = 0;

      for (const peer of meshPeers) {
        if (this.addDiscoveredPeer(peer, 'mesh_announce')) {
          addedCount++;
        }
      }

      if (addedCount > 0) {
        this.logger.info(
          `Discovered ${addedCount} peers via mesh announcements`
        );
      }
    } catch (error) {
      this.logger.warn('Mesh discovery failed', {
        error: (error as Error).message,
      });
    }
  }

  private async discoverMeshPeers(): Promise<Partial<EnhancedNetworkNode>[]> {
    // Placeholder for mesh network peer discovery
    // TODO: Implement actual mesh peer announcement listening
    return [];
  }

  private async performPeerExchange(): Promise<void> {
    try {
      // Placeholder implementation for peer exchange with connected peers
      // This would request peer lists from currently connected peers
      // TODO: Implement peer exchange protocol
      this.logger.debug('Performing peer exchange with connected peers');

      // For now, this is a placeholder
      const exchangedPeers = await this.exchangePeersWithConnected();
      let addedCount = 0;

      for (const peer of exchangedPeers) {
        if (this.addDiscoveredPeer(peer, 'peer_exchange')) {
          addedCount++;
        }
      }

      if (addedCount > 0) {
        this.logger.info(`Discovered ${addedCount} peers via peer exchange`);
      }
    } catch (error) {
      this.logger.warn('Peer exchange failed', {
        error: (error as Error).message,
      });
    }
  }

  private async exchangePeersWithConnected(): Promise<
    Partial<EnhancedNetworkNode>[]
  > {
    // Placeholder for peer exchange implementation
    // TODO: Request and process peer lists from connected peers
    return [];
  }

  private addDiscoveredPeer(
    peerData: Partial<EnhancedNetworkNode>,
    method: EnhancedNetworkNode['discoveryMethod'],
    referredBy?: string
  ): boolean {
    // Validate required fields
    if (!peerData.id || !peerData.address || !peerData.port) {
      this.logger.warn('Invalid peer data received', { peerData });
      return false;
    }

    // Check if we've reached the discovery limit
    if (this.discoveredPeers.size >= this.config.maxDiscoveryPeers) {
      this.logger.debug('Discovery peer limit reached, skipping new peer');
      return false;
    }

    // Check if peer already discovered
    if (this.discoveredPeers.has(peerData.id)) {
      // Update last seen time
      const existingPeer = this.discoveredPeers.get(peerData.id)!;
      existingPeer.lastSeen = Date.now();
      return false;
    }

    // Create enhanced peer with defaults
    const enhancedPeer: EnhancedNetworkNode = {
      // Required fields
      id: peerData.id,
      address: peerData.address,
      port: peerData.port,
      type: peerData.type || 'light',
      isOnline: peerData.isOnline ?? false,
      lastSeen: peerData.lastSeen || Date.now(),

      // Connection details
      connectionState: 'disconnected',
      connectionAttempts: 0,
      lastConnectionAttempt: 0,

      // Quality metrics
      latency: 0,
      packetLoss: 0,
      signalStrength: peerData.signalStrength,
      hopCount: peerData.hopCount,

      // Reputation and scoring (initialize with neutral values)
      reputation: 50,
      score: 50,
      reliability: 50,

      // Behavior tracking
      messagesReceived: 0,
      messagesSent: 0,
      blocksPropagated: 0,
      transactionsPropagated: 0,
      invalidMessages: 0,

      // Ban information
      isBanned: false,

      // Discovery metadata
      discoveryMethod: method,
      discoveredAt: Date.now(),
      referredBy,

      // Optional sync capabilities
      publicKey: peerData.publicKey,
      syncType: peerData.syncType,
      capabilities: peerData.capabilities,
      protocolVersion: peerData.protocolVersion,
      syncHeight: peerData.syncHeight,
    };

    this.discoveredPeers.set(peerData.id, enhancedPeer);
    this.emit('peer:discovered', enhancedPeer);

    this.logger.debug(`New peer discovered via ${method}`, {
      peerId: peerData.id,
      address: peerData.address,
      type: peerData.type,
      referredBy,
    });

    return true;
  }

  private startPeriodicDiscovery(): void {
    if (!this.isRunning) return;

    const runDiscovery = async (): Promise<void> => {
      if (!this.isRunning) return;

      try {
        await this.performDiscovery();
      } catch (error) {
        this.logger.warn('Periodic discovery failed', {
          error: (error as Error).message,
        });
      }

      if (this.isRunning) {
        this.discoveryTimer = setTimeout(
          runDiscovery,
          this.config.discoveryInterval
        );
      }
    };

    this.discoveryTimer = setTimeout(
      runDiscovery,
      this.config.discoveryInterval
    );
  }
}

// =============================================================================
// Peer Scoring Service
// =============================================================================

/**
 * Multi-factor peer scoring service for reputation management
 */
export class PeerScoringService
  extends EventEmitter
  implements IPeerScoringService
{
  private config: ScoringConfig;
  private logger = Logger.getInstance();
  private peerScores: Map<string, PeerScore> = new Map();
  private isRunning = false;
  private scoringTimer?: ReturnType<typeof setTimeout>;

  constructor(config: ScoringConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Starting peer scoring service', {
      reliabilityWeight: this.config.reliabilityWeight,
      performanceWeight: this.config.performanceWeight,
      behaviorWeight: this.config.behaviorWeight,
      scoringInterval: this.config.scoringInterval,
    });

    this.startPeriodicScoring();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.scoringTimer) {
      clearTimeout(this.scoringTimer);
      this.scoringTimer = undefined;
    }

    this.logger.info('Stopping peer scoring service');
  }

  calculatePeerScore(peer: EnhancedNetworkNode): number {
    const reliability = this.calculateReliabilityScore(peer);
    const performance = this.calculatePerformanceScore(peer);
    const behavior = this.calculateBehaviorScore(peer);

    const weightSum =
      this.config.reliabilityWeight +
      this.config.performanceWeight +
      this.config.behaviorWeight;
    const overall =
      (reliability * this.config.reliabilityWeight +
        performance * this.config.performanceWeight +
        behavior * this.config.behaviorWeight) /
      weightSum;

    const score: PeerScore = {
      overall: Math.max(
        this.config.minScore,
        Math.min(this.config.maxScore, overall)
      ),
      reliability,
      performance,
      behavior,
      lastUpdated: Date.now(),
    };

    this.peerScores.set(peer.id, score);
    return score.overall;
  }

  getPeerScore(peerId: string): number {
    const score = this.peerScores.get(peerId);
    return score?.overall || this.config.minScore;
  }

  getPeerScoreDetails(peerId: string): PeerScore | null {
    return this.peerScores.get(peerId) || null;
  }

  getAllScores(): Map<string, PeerScore> {
    return new Map(this.peerScores);
  }

  private calculateReliabilityScore(peer: EnhancedNetworkNode): number {
    const uptime = this.calculateUptime(peer);
    const connectionSuccess = this.calculateConnectionSuccessRate(peer);
    const messageDelivery = this.calculateMessageDeliveryRate(peer);

    return (
      (uptime * 0.4 + connectionSuccess * 0.3 + messageDelivery * 0.3) * 100
    );
  }

  private calculatePerformanceScore(peer: EnhancedNetworkNode): number {
    const latencyScore = this.calculateLatencyScore(peer.latency);
    const throughputScore = this.calculateThroughputScore(peer);
    const signalQuality = this.calculateSignalQualityScore(peer);

    return (
      (latencyScore * 0.4 + throughputScore * 0.3 + signalQuality * 0.3) * 100
    );
  }

  private calculateBehaviorScore(peer: EnhancedNetworkNode): number {
    const validMessageRatio =
      peer.messagesReceived > 0
        ? (peer.messagesReceived - peer.invalidMessages) / peer.messagesReceived
        : 1.0;

    const propagationScore = this.calculatePropagationScore(peer);
    const complianceScore = this.calculateComplianceScore(peer);

    return (
      (validMessageRatio * 0.4 +
        propagationScore * 0.3 +
        complianceScore * 0.3) *
      100
    );
  }

  private calculateUptime(peer: EnhancedNetworkNode): number {
    const totalTime = Date.now() - peer.discoveredAt;
    const onlineTime = totalTime - this.calculateDowntime(peer);
    return totalTime > 0 ? onlineTime / totalTime : 0;
  }

  private calculateDowntime(_peer: EnhancedNetworkNode): number {
    // TODO: Implement downtime calculation based on connection history
    return 0;
  }

  private calculateConnectionSuccessRate(peer: EnhancedNetworkNode): number {
    const totalAttempts = peer.connectionAttempts;
    if (totalAttempts === 0) return 1.0;

    // Assume 80% success rate for now
    // TODO: Implement actual success rate tracking
    return 0.8;
  }

  private calculateMessageDeliveryRate(_peer: EnhancedNetworkNode): number {
    // TODO: Implement actual message delivery tracking
    return 0.95;
  }

  private calculateLatencyScore(latency: number): number {
    // Convert latency to score (lower latency = higher score)
    if (latency <= 50) return 1.0;
    if (latency <= 100) return 0.8;
    if (latency <= 200) return 0.6;
    if (latency <= 500) return 0.4;
    if (latency <= 1000) return 0.2;
    return 0.1;
  }

  private calculateThroughputScore(_peer: EnhancedNetworkNode): number {
    // TODO: Implement throughput score based on data transfer rates
    return 0.8;
  }

  private calculateSignalQualityScore(peer: EnhancedNetworkNode): number {
    if (!peer.signalStrength) return 1.0; // Non-mesh peers get full score

    // Convert signal strength to score
    const rssi = peer.signalStrength;
    if (rssi >= -60) return 1.0;
    if (rssi >= -70) return 0.8;
    if (rssi >= -80) return 0.6;
    if (rssi >= -90) return 0.4;
    if (rssi >= -100) return 0.2;
    return 0.1;
  }

  private calculatePropagationScore(peer: EnhancedNetworkNode): number {
    const totalPropagated = peer.blocksPropagated + peer.transactionsPropagated;
    const expectedPropagation = this.getExpectedPropagation(peer);

    return expectedPropagation > 0
      ? Math.min(1.0, totalPropagated / expectedPropagation)
      : 1.0;
  }

  private getExpectedPropagation(peer: EnhancedNetworkNode): number {
    // Calculate expected propagation based on peer type and network activity
    return peer.type === 'full' ? 100 : 20;
  }

  private calculateComplianceScore(_peer: EnhancedNetworkNode): number {
    // TODO: Check compliance with network protocols (duty cycle, message format, etc.)
    return 0.95;
  }

  private startPeriodicScoring(): void {
    if (!this.isRunning) return;

    const updateScores = (): void => {
      if (!this.isRunning) return;

      this.applyReputationDecay();

      if (this.isRunning) {
        this.scoringTimer = setTimeout(
          updateScores,
          this.config.scoringInterval
        );
      }
    };

    this.scoringTimer = setTimeout(updateScores, this.config.scoringInterval);
  }

  private applyReputationDecay(): void {
    const now = Date.now();

    for (const [_peerId, score] of this.peerScores) {
      const timeSinceUpdate = now - score.lastUpdated;
      const decayFactor = Math.exp(
        (-this.config.reputationDecayRate * timeSinceUpdate) /
          (24 * 60 * 60 * 1000)
      );

      score.overall = Math.max(
        this.config.minScore,
        score.overall * decayFactor
      );
      score.reliability = Math.max(0, score.reliability * decayFactor);
      score.performance = Math.max(0, score.performance * decayFactor);
      score.behavior = Math.max(0, score.behavior * decayFactor);
      score.lastUpdated = now;
    }
  }
}

// =============================================================================
// Ban List Manager
// =============================================================================

/**
 * Sophisticated ban list manager with automatic misbehavior detection
 */
export class BanListManager extends EventEmitter implements IBanListManager {
  private config: MisbehaviorConfig;
  private logger = Logger.getInstance();
  private bannedPeers: Map<string, BanEntry> = new Map();
  private bannedAddresses: Map<string, BanEntry> = new Map();
  private misbehaviorHistory: Map<string, MisbehaviorIncident[]> = new Map();
  private isRunning = false;
  private monitoringTimer?: ReturnType<typeof setTimeout>;

  constructor(config: MisbehaviorConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Starting ban list manager', {
      invalidMessageThreshold: this.config.invalidMessageThreshold,
      connectionFailureThreshold: this.config.connectionFailureThreshold,
      tempBanDuration: this.config.tempBanDuration,
      autoUnbanEnabled: this.config.autoUnbanEnabled,
    });

    this.startMisbehaviorMonitoring();
    await this.loadPersistedBans();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    await this.persistBanList();
    this.logger.info('Stopping ban list manager');
  }

  recordMisbehavior(
    peerId: string,
    address: string,
    type: MisbehaviorType,
    evidence: string
  ): void {
    if (!this.misbehaviorHistory.has(peerId)) {
      this.misbehaviorHistory.set(peerId, []);
    }

    const history = this.misbehaviorHistory.get(peerId)!;
    const incident: MisbehaviorIncident = {
      type,
      timestamp: Date.now(),
      evidence,
    };

    history.push(incident);

    // Keep only recent history
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const recentHistory = history.filter(h => h.timestamp > cutoff);
    this.misbehaviorHistory.set(peerId, recentHistory);

    this.logger.warn('Misbehavior recorded', { peerId, type, evidence });
    this.emit('ban:misbehavior_detected', peerId, type);

    // Check if ban is warranted
    this.evaluateForBan(peerId, address, type, evidence);
  }

  banPeer(
    peerId: string,
    address: string,
    reason: string,
    evidence: string,
    duration?: number
  ): void {
    const existingBan = this.bannedPeers.get(peerId);
    let attempts = 1;

    if (existingBan) {
      attempts = existingBan.attempts + 1;

      // Escalate ban duration for repeat offenders
      if (duration && attempts > this.config.maxTempBans) {
        duration = undefined; // Make it permanent
        reason += ` (repeat offender: ${attempts} bans)`;
      }
    }

    const banEntry: BanEntry = {
      peerId,
      address,
      reason,
      bannedAt: Date.now(),
      expiresAt: duration ? Date.now() + duration : undefined,
      attempts,
      evidence: existingBan ? [...existingBan.evidence, evidence] : [evidence],
    };

    this.bannedPeers.set(peerId, banEntry);
    this.bannedAddresses.set(address, banEntry);

    const banType = banEntry.expiresAt ? 'temporary' : 'permanent';
    this.logger.warn(`Peer banned (${banType})`, {
      peerId,
      address,
      reason,
      duration: duration ? `${duration / 1000}s` : 'permanent',
      attempts,
    });

    this.emit('peer:banned', peerId, reason);
    this.persistBanList();
  }

  unbanPeer(peerId: string): boolean {
    const banEntry = this.bannedPeers.get(peerId);
    if (!banEntry) return false;

    this.bannedPeers.delete(peerId);
    this.bannedAddresses.delete(banEntry.address);
    this.misbehaviorHistory.delete(peerId);

    this.logger.info('Peer unbanned', { peerId, address: banEntry.address });
    this.emit('peer:unbanned', peerId);
    this.persistBanList();
    return true;
  }

  isPeerBanned(peerId: string): boolean {
    const banEntry = this.bannedPeers.get(peerId);
    if (!banEntry) return false;

    // Check if temporary ban has expired
    if (banEntry.expiresAt && Date.now() > banEntry.expiresAt) {
      this.unbanPeer(peerId);
      return false;
    }

    return true;
  }

  isAddressBanned(address: string): boolean {
    const banEntry = this.bannedAddresses.get(address);
    if (!banEntry) return false;

    // Check if temporary ban has expired
    if (banEntry.expiresAt && Date.now() > banEntry.expiresAt) {
      this.unbanPeer(banEntry.peerId);
      return false;
    }

    return true;
  }

  getBannedPeers(): BanEntry[] {
    return Array.from(this.bannedPeers.values());
  }

  getBanEntry(peerId: string): BanEntry | null {
    return this.bannedPeers.get(peerId) || null;
  }

  getMisbehaviorHistory(peerId: string): MisbehaviorIncident[] {
    return this.misbehaviorHistory.get(peerId) || [];
  }

  private evaluateForBan(
    peerId: string,
    address: string,
    type: MisbehaviorType,
    evidence: string
  ): void {
    const history = this.misbehaviorHistory.get(peerId) || [];
    const recentHistory = history.filter(
      h => h.timestamp > Date.now() - this.getTimeWindowForType(type)
    );

    let shouldBan = false;
    let banReason = '';
    let banDuration: number | undefined;

    switch (type) {
      case 'invalid_message': {
        const invalidMessageCount = recentHistory.filter(
          h => h.type === 'invalid_message'
        ).length;
        if (invalidMessageCount >= this.config.invalidMessageThreshold) {
          shouldBan = true;
          banReason = `Too many invalid messages: ${invalidMessageCount} in time window`;
          banDuration = this.config.tempBanDuration;
        }
        break;
      }

      case 'connection_failure': {
        const connectionFailureCount = recentHistory.filter(
          h => h.type === 'connection_failure'
        ).length;
        if (connectionFailureCount >= this.config.connectionFailureThreshold) {
          shouldBan = true;
          banReason = `Too many connection failures: ${connectionFailureCount} in time window`;
          banDuration = this.config.tempBanDuration;
        }
        break;
      }

      case 'protocol_violation':
      case 'malicious_content':
        shouldBan = true;
        banReason = `Serious protocol violation: ${type}`;
        // Permanent ban for serious violations
        break;

      case 'spam': {
        const spamCount = recentHistory.filter(h => h.type === 'spam').length;
        if (spamCount >= 5) {
          shouldBan = true;
          banReason = `Spam behavior detected: ${spamCount} incidents`;
          banDuration = this.config.tempBanDuration * 2;
        }
        break;
      }
    }

    if (shouldBan) {
      this.banPeer(peerId, address, banReason, evidence, banDuration);
    }
  }

  private getTimeWindowForType(type: MisbehaviorType): number {
    switch (type) {
      case 'invalid_message':
        return this.config.invalidMessageTimeWindow;
      case 'connection_failure':
        return this.config.connectionFailureTimeWindow;
      default:
        return 60 * 60 * 1000; // 1 hour
    }
  }

  private startMisbehaviorMonitoring(): void {
    if (!this.isRunning) return;

    const monitor = (): void => {
      if (!this.isRunning) return;

      this.checkExpiredBans();
      this.cleanupOldHistory();

      if (this.isRunning) {
        this.monitoringTimer = setTimeout(monitor, 60000); // Check every minute
      }
    };

    this.monitoringTimer = setTimeout(monitor, 60000);
  }

  private checkExpiredBans(): void {
    if (!this.config.autoUnbanEnabled) return;

    const now = Date.now();
    const expiredBans: string[] = [];

    for (const [peerId, banEntry] of this.bannedPeers) {
      if (banEntry.expiresAt && now > banEntry.expiresAt) {
        expiredBans.push(peerId);
      }
    }

    expiredBans.forEach(peerId => this.unbanPeer(peerId));

    if (expiredBans.length > 0) {
      this.logger.info(`Automatically unbanned ${expiredBans.length} peers`);
    }
  }

  private cleanupOldHistory(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [peerId, history] of this.misbehaviorHistory) {
      const recentHistory = history.filter(h => h.timestamp > cutoff);

      if (recentHistory.length === 0) {
        this.misbehaviorHistory.delete(peerId);
      } else if (recentHistory.length < history.length) {
        this.misbehaviorHistory.set(peerId, recentHistory);
      }
    }
  }

  private async persistBanList(): Promise<void> {
    // TODO: Implement persistence to database
    this.logger.debug('Persisting ban list to storage');
  }

  private async loadPersistedBans(): Promise<void> {
    // TODO: Implement loading from database
    this.logger.debug('Loading persisted ban list');
  }
}

// =============================================================================
// Connection Pool Manager
// =============================================================================

/**
 * Sophisticated connection pool manager with quality-based prioritization
 */
export class ConnectionPoolManager
  extends EventEmitter
  implements IConnectionPoolManager
{
  private config: ConnectionPoolConfig;
  private logger = Logger.getInstance();
  private connections: Map<string, PeerConnection> = new Map();
  private peerManager?: IPeerManager;
  private isRunning = false;
  private maintenanceTimer?: ReturnType<typeof setTimeout>;

  constructor(config: ConnectionPoolConfig, peerManager?: IPeerManager) {
    super();
    this.config = config;
    this.peerManager = peerManager;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Starting connection pool manager', {
      maxConnections: this.config.maxConnections,
      maxOutbound: this.config.maxOutbound,
      maxInbound: this.config.maxInbound,
      connectionTimeout: this.config.connectionTimeout,
    });

    this.startConnectionMaintenance();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.maintenanceTimer) {
      clearTimeout(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(peerId =>
      this.disconnectFromPeer(peerId)
    );
    await Promise.allSettled(closePromises);

    this.logger.info('Stopping connection pool manager');
  }

  async connectToPeer(peer: EnhancedNetworkNode): Promise<boolean> {
    if (this.connections.has(peer.id)) {
      this.logger.debug('Already connected to peer', { peerId: peer.id });
      return true;
    }

    if (this.connections.size >= this.config.maxConnections) {
      const lowestPriorityConnection = this.findLowestPriorityConnection();
      if (
        lowestPriorityConnection &&
        this.shouldReplaceConnection(peer.id, lowestPriorityConnection.peerId)
      ) {
        await this.disconnectFromPeer(lowestPriorityConnection.peerId);
      } else {
        this.logger.warn('Connection pool full, cannot connect to peer', {
          peerId: peer.id,
          currentConnections: this.connections.size,
          maxConnections: this.config.maxConnections,
        });
        return false;
      }
    }

    return await this.establishConnection(peer);
  }

  async disconnectFromPeer(peerId: string): Promise<void> {
    const connection = this.connections.get(peerId);
    if (!connection) return;

    connection.state = 'disconnecting';

    try {
      if (connection.socket) {
        // Close the actual socket/connection
        if (typeof connection.socket.close === 'function') {
          connection.socket.close();
        } else if (typeof connection.socket.destroy === 'function') {
          connection.socket.destroy();
        }
      }
    } catch (error) {
      this.logger.warn('Error closing connection', {
        peerId,
        error: (error as Error).message,
      });
    }

    this.connections.delete(peerId);
    this.peerManager?.updatePeerConnectionState(peerId, 'disconnected');

    this.logger.info('Connection closed', { peerId });
    this.emit('peer:disconnected', peerId);
  }

  getConnections(): PeerConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  isConnectedToPeer(peerId: string): boolean {
    const connection = this.connections.get(peerId);
    return connection?.state === 'connected' || false;
  }

  private async establishConnection(
    peer: EnhancedNetworkNode
  ): Promise<boolean> {
    const connectionId = this.generateConnectionId();

    const connection: PeerConnection = {
      peerId: peer.id,
      connectionId,
      state: 'connecting',
      connectedAt: 0,
      lastActivity: Date.now(),
      bytesSent: 0,
      bytesReceived: 0,
      messagesQueued: 0,
    };

    this.connections.set(peer.id, connection);
    this.peerManager?.updatePeerConnectionState(peer.id, 'connecting');

    try {
      // Establish actual connection based on peer type
      const socket = await this.createConnection(peer);

      connection.socket = socket;
      connection.state = 'connected';
      connection.connectedAt = Date.now();

      this.peerManager?.updatePeerConnectionState(peer.id, 'connected');
      this.peerManager?.recordConnectionSuccess(peer.id);

      this.logger.info('Successfully connected to peer', {
        peerId: peer.id,
        address: peer.address,
        port: peer.port,
        type: peer.type,
      });

      this.emit('peer:connected', peer.id);
      return true;
    } catch (error) {
      connection.state = 'failed';
      this.connections.delete(peer.id);
      this.peerManager?.updatePeerConnectionState(peer.id, 'failed');
      this.peerManager?.recordConnectionFailure(peer.id);

      this.logger.warn('Failed to connect to peer', {
        peerId: peer.id,
        error: (error as Error).message,
      });

      this.emit('connection:failed', peer.id, error as Error);
      return false;
    }
  }

  private async createConnection(peer: EnhancedNetworkNode): Promise<any> {
    // Create appropriate connection type based on peer address and capabilities
    if (peer.address.includes('.mesh.')) {
      // LoRa mesh connection
      return this.createMeshConnection(peer);
    } else {
      // TCP/WebSocket connection
      return this.createTcpConnection(peer);
    }
  }

  private async createMeshConnection(peer: EnhancedNetworkNode): Promise<any> {
    // TODO: Implement LoRa mesh connections
    // This would integrate with the existing EnhancedMeshProtocol
    this.logger.debug('Creating mesh connection', { peerId: peer.id });

    // Placeholder: return a mock connection object
    return {
      type: 'mesh',
      peerId: peer.id,
      close: () =>
        this.logger.debug('Mesh connection closed', { peerId: peer.id }),
    };
  }

  private async createTcpConnection(peer: EnhancedNetworkNode): Promise<any> {
    // TODO: Implement TCP/WebSocket connections
    // This would integrate with existing HTTP/WebSocket infrastructure
    this.logger.debug('Creating TCP connection', { peerId: peer.id });

    // Placeholder: return a mock connection object
    return {
      type: 'tcp',
      peerId: peer.id,
      close: () =>
        this.logger.debug('TCP connection closed', { peerId: peer.id }),
    };
  }

  private findLowestPriorityConnection(): PeerConnection | null {
    if (this.connections.size === 0) return null;

    let lowestScore = Infinity;
    let lowestConnection: PeerConnection | null = null;

    for (const connection of this.connections.values()) {
      const score = this.peerManager?.getPeerScore(connection.peerId) || 0;
      if (score < lowestScore) {
        lowestScore = score;
        lowestConnection = connection;
      }
    }

    return lowestConnection;
  }

  private shouldReplaceConnection(
    newPeerId: string,
    existingPeerId: string
  ): boolean {
    const newPeerScore = this.peerManager?.getPeerScore(newPeerId) || 0;
    const existingPeerScore =
      this.peerManager?.getPeerScore(existingPeerId) || 0;

    // Replace if new peer has significantly higher score
    return newPeerScore > existingPeerScore + 10;
  }

  private startConnectionMaintenance(): void {
    if (!this.isRunning) return;

    const maintain = (): void => {
      if (!this.isRunning) return;

      this.maintainConnections();
      this.optimizeConnectionPool();

      if (this.isRunning) {
        this.maintenanceTimer = setTimeout(maintain, 30000); // Maintain every 30 seconds
      }
    };

    this.maintenanceTimer = setTimeout(maintain, 5000); // Initial delay
  }

  private maintainConnections(): void {
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [peerId, connection] of this.connections) {
      const timeSinceActivity = now - connection.lastActivity;

      if (timeSinceActivity > 300000) {
        // 5 minutes inactive
        staleConnections.push(peerId);
      }
    }

    // Close stale connections
    staleConnections.forEach(peerId => {
      this.logger.warn('Connection inactive, closing', { peerId });
      this.disconnectFromPeer(peerId);
    });
  }

  private optimizeConnectionPool(): void {
    // TODO: Implement sophisticated connection optimization
    // - Prioritize high-scoring peers
    // - Balance connection types (full vs light nodes)
    // - Maintain geographic/mesh diversity
    this.logger.debug('Optimizing connection pool', {
      currentConnections: this.connections.size,
      maxConnections: this.config.maxConnections,
    });
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// Main Peer Manager
// =============================================================================

/**
 * Main peer management orchestrator integrating all peer management services
 */
export class PeerManager extends EventEmitter implements IPeerManager {
  private config: PeerManagerConfig;
  private logger = Logger.getInstance();
  private peers: Map<string, EnhancedNetworkNode> = new Map();

  private discoveryService: PeerDiscoveryService;
  private connectionPool: ConnectionPoolManager;
  private scoringService: PeerScoringService;
  private banListManager: BanListManager;

  private isRunning = false;
  private optimizationTimer?: ReturnType<typeof setTimeout>;
  private maintenanceTimer?: ReturnType<typeof setTimeout>;

  constructor(config: Partial<PeerManagerConfig> = {}) {
    super();

    // Merge with defaults
    this.config = {
      ...DEFAULT_PEER_MANAGER_CONFIG,
      ...config,
      discovery: {
        ...DEFAULT_PEER_MANAGER_CONFIG.discovery,
        ...config.discovery,
      },
      connectionPool: {
        ...DEFAULT_PEER_MANAGER_CONFIG.connectionPool,
        ...config.connectionPool,
      },
      scoring: { ...DEFAULT_PEER_MANAGER_CONFIG.scoring, ...config.scoring },
      misbehavior: {
        ...DEFAULT_PEER_MANAGER_CONFIG.misbehavior,
        ...config.misbehavior,
      },
    };

    this.discoveryService = new PeerDiscoveryService(this.config.discovery);
    this.connectionPool = new ConnectionPoolManager(
      this.config.connectionPool,
      this
    );
    this.scoringService = new PeerScoringService(this.config.scoring);
    this.banListManager = new BanListManager(this.config.misbehavior);

    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('Starting peer manager', {
      maxConnections: this.config.connectionPool.maxConnections,
      discoveryInterval: this.config.discovery.discoveryInterval,
      scoringInterval: this.config.scoring.scoringInterval,
      autoOptimization: this.config.enableAutoOptimization,
    });

    await this.discoveryService.start();
    await this.connectionPool.start();
    await this.scoringService.start();
    await this.banListManager.start();

    if (this.config.enableAutoOptimization) {
      this.startAutoOptimization();
    }

    this.startPeerMaintenance();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.optimizationTimer) {
      clearTimeout(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }

    if (this.maintenanceTimer) {
      clearTimeout(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
    }

    this.logger.info('Stopping peer manager');

    await this.discoveryService.stop();
    await this.connectionPool.stop();
    await this.scoringService.stop();
    await this.banListManager.stop();
  }

  addPeer(peerData: Partial<EnhancedNetworkNode>): boolean {
    if (!peerData.id || !peerData.address || peerData.port === undefined) {
      this.logger.warn('Invalid peer data provided', { peerData });
      return false;
    }

    if (
      this.banListManager.isPeerBanned(peerData.id) ||
      this.banListManager.isAddressBanned(peerData.address)
    ) {
      this.logger.warn('Attempted to add banned peer', { peerId: peerData.id });
      return false;
    }

    const enhancedPeer: EnhancedNetworkNode = this.createEnhancedPeer(peerData);
    this.peers.set(enhancedPeer.id, enhancedPeer);

    // Calculate initial score
    const score = this.scoringService.calculatePeerScore(enhancedPeer);
    enhancedPeer.score = score;

    this.logger.info('New peer added', {
      peerId: enhancedPeer.id,
      address: enhancedPeer.address,
      type: enhancedPeer.type,
      score,
    });

    this.emit('peer:discovered', enhancedPeer);

    // Auto-connect if peer meets criteria
    if (this.shouldAutoConnect(enhancedPeer)) {
      this.connectionPool.connectToPeer(enhancedPeer).catch(error => {
        this.logger.warn('Auto-connect failed', {
          peerId: enhancedPeer.id,
          error: error.message,
        });
      });
    }

    return true;
  }

  removePeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;

    // Close connection if exists
    if (this.connectionPool.isConnectedToPeer(peerId)) {
      this.connectionPool.disconnectFromPeer(peerId).catch(error => {
        this.logger.warn('Error disconnecting from peer during removal', {
          peerId,
          error: error.message,
        });
      });
    }

    this.peers.delete(peerId);
    this.logger.info('Peer removed', { peerId });
    return true;
  }

  getPeer(peerId: string): EnhancedNetworkNode | null {
    return this.peers.get(peerId) || null;
  }

  getAllPeers(): EnhancedNetworkNode[] {
    return Array.from(this.peers.values());
  }

  getConnectedPeers(): EnhancedNetworkNode[] {
    return this.getAllPeers().filter(peer =>
      this.connectionPool.isConnectedToPeer(peer.id)
    );
  }

  getBestPeers(count: number): EnhancedNetworkNode[] {
    return this.getAllPeers()
      .filter(peer => !peer.isBanned && peer.isOnline)
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  async connectToPeer(peerId: string): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      this.logger.warn('Cannot connect to unknown peer', { peerId });
      return false;
    }

    return this.connectionPool.connectToPeer(peer);
  }

  async disconnectFromPeer(peerId: string): Promise<void> {
    return this.connectionPool.disconnectFromPeer(peerId);
  }

  banPeer(peerId: string, reason: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.banListManager.banPeer(peerId, peer.address, reason, 'Manual ban');
      peer.isBanned = true;
      peer.banReason = reason;
    }
  }

  unbanPeer(peerId: string): boolean {
    const result = this.banListManager.unbanPeer(peerId);
    const peer = this.peers.get(peerId);
    if (peer && result) {
      peer.isBanned = false;
      peer.banReason = undefined;
      peer.banExpiry = undefined;
    }
    return result;
  }

  recordMisbehavior(
    peerId: string,
    type: MisbehaviorType,
    evidence: string
  ): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    this.banListManager.recordMisbehavior(peerId, peer.address, type, evidence);

    // Update peer statistics
    if (type === 'invalid_message') {
      peer.invalidMessages++;
    }
  }

  getPeerScore(peerId: string): number {
    return this.scoringService.getPeerScore(peerId);
  }

  getStatistics(): PeerManagerStatistics {
    const allPeers = this.getAllPeers();
    const connectedPeers = this.getConnectedPeers();
    const bannedPeers = this.banListManager.getBannedPeers();

    const totalScore = allPeers.reduce((sum, peer) => sum + peer.score, 0);
    const averageScore = allPeers.length > 0 ? totalScore / allPeers.length : 0;

    const peersByType = allPeers.reduce(
      (acc, peer) => {
        acc[peer.type]++;
        return acc;
      },
      { light: 0, full: 0 }
    );

    const peersByDiscovery = allPeers.reduce(
      (acc, peer) => {
        acc[peer.discoveryMethod] = (acc[peer.discoveryMethod] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalPeers: allPeers.length,
      connectedPeers: connectedPeers.length,
      bannedPeers: bannedPeers.length,
      averageScore,
      peersByType,
      peersByDiscovery,
      connectionStats: {
        successful: 0, // TODO: Implement connection stats tracking
        failed: 0,
        timeouts: 0,
      },
      bandwidthStats: {
        bytesSent: 0, // TODO: Implement bandwidth stats tracking
        bytesReceived: 0,
        messagesPerSecond: 0,
      },
    };
  }

  getPeerMetrics(peerId: string): PeerMetrics | null {
    const peer = this.peers.get(peerId);
    if (!peer) return null;

    return {
      peerId,
      score: this.scoringService.getPeerScoreDetails(peerId) || {
        overall: 0,
        reliability: 0,
        performance: 0,
        behavior: 0,
        lastUpdated: Date.now(),
      },
      connectionHistory: [], // TODO: Implement connection history tracking
      messageStats: {
        sent: peer.messagesSent,
        received: peer.messagesReceived,
        invalid: peer.invalidMessages,
        lastActivity: peer.lastSeen,
      },
      reputationHistory: [], // TODO: Implement reputation history tracking
    };
  }

  // Utility methods for integration
  updatePeerConnectionState(peerId: string, state: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connectionState = state as any;
      peer.lastSeen = Date.now();

      if (state === 'connected') {
        peer.isOnline = true;
      } else if (state === 'disconnected' || state === 'failed') {
        peer.isOnline = false;
      }
    }
  }

  recordConnectionSuccess(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.isOnline = true;
      peer.lastSeen = Date.now();
      peer.connectionAttempts++;
    }
  }

  recordConnectionFailure(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connectionAttempts++;
      peer.lastConnectionAttempt = Date.now();
      peer.isOnline = false;

      // Record misbehavior if too many failures
      this.banListManager.recordMisbehavior(
        peerId,
        peer.address,
        'connection_failure',
        `Connection attempt ${peer.connectionAttempts} failed`
      );
    }
  }

  recordInvalidMessage(peerId: string, reason: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.invalidMessages++;

      this.banListManager.recordMisbehavior(
        peerId,
        peer.address,
        'invalid_message',
        reason
      );
    }
  }

  private createEnhancedPeer(
    peerData: Partial<EnhancedNetworkNode>
  ): EnhancedNetworkNode {
    return {
      // Required fields
      id: peerData.id!,
      address: peerData.address!,
      port: peerData.port!,
      type: peerData.type || 'light',
      isOnline: peerData.isOnline ?? false,
      lastSeen: peerData.lastSeen || Date.now(),

      // Connection details
      connectionId: peerData.connectionId,
      connectionState: 'disconnected',
      connectionAttempts: 0,
      lastConnectionAttempt: 0,

      // Quality metrics
      latency: peerData.latency || 0,
      packetLoss: peerData.packetLoss || 0,
      signalStrength: peerData.signalStrength,
      hopCount: peerData.hopCount,

      // Reputation and scoring (initialize with neutral values)
      reputation: peerData.reputation || 50,
      score: peerData.score || 50,
      reliability: peerData.reliability || 50,

      // Behavior tracking
      messagesReceived: peerData.messagesReceived || 0,
      messagesSent: peerData.messagesSent || 0,
      blocksPropagated: peerData.blocksPropagated || 0,
      transactionsPropagated: peerData.transactionsPropagated || 0,
      invalidMessages: peerData.invalidMessages || 0,

      // Ban information
      isBanned: peerData.isBanned || false,
      banReason: peerData.banReason,
      banExpiry: peerData.banExpiry,

      // Discovery metadata
      discoveryMethod: peerData.discoveryMethod || 'manual',
      discoveredAt: peerData.discoveredAt || Date.now(),
      referredBy: peerData.referredBy,

      // Optional sync capabilities
      publicKey: peerData.publicKey,
      syncType: peerData.syncType,
      capabilities: peerData.capabilities,
      protocolVersion: peerData.protocolVersion,
      syncHeight: peerData.syncHeight,
    };
  }

  private shouldAutoConnect(peer: EnhancedNetworkNode): boolean {
    return (
      !peer.isBanned &&
      peer.score >= 30 && // Minimum score threshold
      this.connectionPool.getConnectionCount() <
        this.config.connectionPool.maxOutbound &&
      (peer.type === 'full' || this.needMoreLightPeers())
    );
  }

  private needMoreLightPeers(): boolean {
    const connectedLightPeers = this.getConnectedPeers().filter(
      p => p.type === 'light'
    );
    return connectedLightPeers.length < 5; // Maintain at least 5 light peer connections
  }

  private setupEventHandlers(): void {
    // Forward events from sub-services
    this.discoveryService.on('peer:discovered', peer => {
      this.addPeer(peer);
    });

    this.connectionPool.on('peer:connected', peerId => {
      this.emit('peer:connected', peerId);
    });

    this.connectionPool.on('peer:disconnected', peerId => {
      this.emit('peer:disconnected', peerId);
    });

    this.connectionPool.on('connection:failed', (peerId, error) => {
      this.emit('connection:failed', peerId, error);
    });

    this.banListManager.on('peer:banned', (peerId, reason) => {
      this.emit('peer:banned', peerId, reason);
    });

    this.banListManager.on('peer:unbanned', peerId => {
      this.emit('peer:unbanned', peerId);
    });
  }

  private startAutoOptimization(): void {
    if (!this.isRunning) return;

    const optimize = (): void => {
      if (!this.isRunning) return;

      this.optimizeConnections();
      this.optimizePeerSet();

      if (this.isRunning) {
        this.optimizationTimer = setTimeout(
          optimize,
          this.config.optimizationInterval
        );
      }
    };

    this.optimizationTimer = setTimeout(
      optimize,
      this.config.optimizationInterval
    );
  }

  private optimizeConnections(): void {
    const connectedPeers = this.getConnectedPeers();
    const bestPeers = this.getBestPeers(
      this.config.connectionPool.maxConnections
    );

    // Disconnect from low-scoring peers if we have better alternatives
    for (const connectedPeer of connectedPeers) {
      if (!bestPeers.some(p => p.id === connectedPeer.id)) {
        this.logger.debug(
          'Disconnecting from low-scoring peer for optimization',
          {
            peerId: connectedPeer.id,
            score: connectedPeer.score,
          }
        );

        this.connectionPool
          .disconnectFromPeer(connectedPeer.id)
          .catch(error => {
            this.logger.warn(
              'Error during connection optimization disconnect',
              {
                peerId: connectedPeer.id,
                error: error.message,
              }
            );
          });
      }
    }

    // Connect to high-scoring peers we're not connected to
    for (const bestPeer of bestPeers) {
      if (!this.connectionPool.isConnectedToPeer(bestPeer.id)) {
        this.connectionPool.connectToPeer(bestPeer).catch(error => {
          this.logger.warn('Error during connection optimization connect', {
            peerId: bestPeer.id,
            error: error.message,
          });
        });
      }
    }
  }

  private optimizePeerSet(): void {
    // Remove stale peers
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const stalePeers: string[] = [];

    for (const [peerId, peer] of this.peers) {
      if (!peer.isOnline && Date.now() - peer.lastSeen > staleThreshold) {
        stalePeers.push(peerId);
      }
    }

    stalePeers.forEach(peerId => this.removePeer(peerId));

    if (stalePeers.length > 0) {
      this.logger.info(`Removed ${stalePeers.length} stale peers`);
    }
  }

  private startPeerMaintenance(): void {
    if (!this.isRunning) return;

    const maintain = (): void => {
      if (!this.isRunning) return;

      // Update peer scores
      for (const peer of this.peers.values()) {
        const newScore = this.scoringService.calculatePeerScore(peer);
        if (Math.abs(peer.score - newScore) > 1) {
          // Only update if significant change
          peer.score = newScore;
          this.emit('peer:score_updated', peer.id, newScore);
        }
      }

      // Discover new peers
      const discoveredPeers = this.discoveryService.getDiscoveredPeers();
      for (const discoveredPeer of discoveredPeers) {
        if (!this.peers.has(discoveredPeer.id)) {
          this.addPeer(discoveredPeer);
        }
      }

      if (this.isRunning) {
        this.maintenanceTimer = setTimeout(maintain, 60000); // Maintain every minute
      }
    };

    this.maintenanceTimer = setTimeout(maintain, 10000); // Initial delay
  }
}

// Re-export configuration constants and types for convenience
export { DEFAULT_PEER_MANAGER_CONFIG };
