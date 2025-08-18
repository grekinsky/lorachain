/**
 * Enhanced Peer Management Types for Lorachain Network
 *
 * This module defines comprehensive types and interfaces for peer management,
 * extending the basic NetworkNode interface with advanced features for
 * reputation scoring, connection management, and misbehavior detection.
 *
 * Integrates with existing UTXO-only blockchain model and LoRa mesh constraints.
 */

import { NetworkNode } from './types.js';
import { SyncPeer as _SyncPeer } from './sync-types.js';

// =============================================================================
// Enhanced Peer Interface
// =============================================================================

/**
 * Enhanced network node extending the basic NetworkNode interface
 * with comprehensive peer management capabilities.
 *
 * Integrates features from SyncPeer and adds advanced peer management
 * functionality for reputation, scoring, and connection management.
 */
export interface EnhancedNetworkNode extends NetworkNode {
  // Basic connection info (inherited from NetworkNode)
  // id: string;
  // address: string;
  // port: number;
  // type: 'light' | 'full';
  // isOnline: boolean;
  // lastSeen: number;

  // Connection details
  connectionId?: string;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed';
  connectionAttempts: number;
  lastConnectionAttempt: number;

  // Quality metrics
  latency: number;
  packetLoss: number;
  signalStrength?: number; // For LoRa mesh peers
  hopCount?: number; // For mesh routing

  // Reputation and scoring
  reputation: number;
  score: number;
  reliability: number;

  // Behavior tracking
  messagesReceived: number;
  messagesSent: number;
  blocksPropagated: number;
  transactionsPropagated: number;
  invalidMessages: number;

  // Ban information
  isBanned: boolean;
  banReason?: string;
  banExpiry?: number;

  // Discovery metadata
  discoveryMethod:
    | 'dns'
    | 'peer_exchange'
    | 'mdns'
    | 'mesh_announce'
    | 'manual';
  discoveredAt: number;
  referredBy?: string;

  // Sync capabilities (from SyncPeer)
  publicKey?: string;
  syncType?: 'internet' | 'mesh' | 'gateway';
  capabilities?: string[];
  protocolVersion?: string;
  syncHeight?: number;
}

// =============================================================================
// Connection Management Types
// =============================================================================

/**
 * Represents an active connection to a peer
 */
export interface PeerConnection {
  peerId: string;
  connectionId: string;
  socket?: any; // WebSocket, TCP socket, or mesh connection
  state: 'connecting' | 'connected' | 'disconnecting' | 'failed';
  connectedAt: number;
  lastActivity: number;
  bytesSent: number;
  bytesReceived: number;
  messagesQueued: number;
}

/**
 * Multi-factor peer scoring breakdown
 */
export interface PeerScore {
  overall: number;
  reliability: number;
  performance: number;
  behavior: number;
  lastUpdated: number;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for peer discovery mechanisms
 */
export interface PeerDiscoveryConfig {
  dnsSeeds: string[];
  enablePeerExchange: boolean;
  enableMdns: boolean;
  enableMeshAnnounce: boolean;
  discoveryInterval: number;
  maxDiscoveryPeers: number;
}

/**
 * Configuration for connection pool management
 */
export interface ConnectionPoolConfig {
  maxConnections: number;
  maxOutbound: number;
  maxInbound: number;
  connectionTimeout: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  preferredPeerTypes: ('light' | 'full')[];
}

/**
 * Configuration for peer scoring algorithm
 */
export interface ScoringConfig {
  reliabilityWeight: number;
  performanceWeight: number;
  behaviorWeight: number;
  reputationDecayRate: number;
  minScore: number;
  maxScore: number;
  scoringInterval: number;
}

/**
 * Configuration for misbehavior detection and banning
 */
export interface MisbehaviorConfig {
  invalidMessageThreshold: number;
  invalidMessageTimeWindow: number;
  connectionFailureThreshold: number;
  connectionFailureTimeWindow: number;
  tempBanDuration: number;
  maxTempBans: number;
  autoUnbanEnabled: boolean;
}

/**
 * Main peer manager configuration combining all sub-configurations
 */
export interface PeerManagerConfig {
  discovery: PeerDiscoveryConfig;
  connectionPool: ConnectionPoolConfig;
  scoring: ScoringConfig;
  misbehavior: MisbehaviorConfig;
  enableAutoOptimization: boolean;
  optimizationInterval: number;
}

// =============================================================================
// Ban Management Types
// =============================================================================

/**
 * Represents a banned peer entry with evidence and expiration
 */
export interface BanEntry {
  peerId: string;
  address: string;
  reason: string;
  bannedAt: number;
  expiresAt?: number; // undefined for permanent bans
  attempts: number;
  evidence: string[];
}

/**
 * Types of peer misbehavior that can trigger bans
 */
export type MisbehaviorType =
  | 'invalid_message'
  | 'connection_failure'
  | 'protocol_violation'
  | 'spam'
  | 'malicious_content';

/**
 * Misbehavior incident record
 */
export interface MisbehaviorIncident {
  type: MisbehaviorType;
  timestamp: number;
  evidence: string;
}

// =============================================================================
// Statistics and Metrics Types
// =============================================================================

/**
 * Peer manager statistics for monitoring and debugging
 */
export interface PeerManagerStatistics {
  totalPeers: number;
  connectedPeers: number;
  bannedPeers: number;
  averageScore: number;
  peersByType: { light: number; full: number };
  peersByDiscovery: Record<string, number>;
  connectionStats: {
    successful: number;
    failed: number;
    timeouts: number;
  };
  bandwidthStats: {
    bytesSent: number;
    bytesReceived: number;
    messagesPerSecond: number;
  };
}

/**
 * Detailed peer metrics for analysis
 */
export interface PeerMetrics {
  peerId: string;
  score: PeerScore;
  connectionHistory: Array<{
    timestamp: number;
    success: boolean;
    latency?: number;
    error?: string;
  }>;
  messageStats: {
    sent: number;
    received: number;
    invalid: number;
    lastActivity: number;
  };
  reputationHistory: Array<{
    timestamp: number;
    score: number;
    reason: string;
  }>;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Events emitted by the peer management system
 */
export interface PeerManagerEvents {
  'peer:discovered': (peer: EnhancedNetworkNode) => void;
  'peer:connected': (peerId: string) => void;
  'peer:disconnected': (peerId: string) => void;
  'peer:banned': (peerId: string, reason: string) => void;
  'peer:unbanned': (peerId: string) => void;
  'peer:score_updated': (peerId: string, score: number) => void;
  'connection:failed': (peerId: string, error: Error) => void;
  'discovery:new_peers': (count: number) => void;
  'ban:misbehavior_detected': (peerId: string, type: MisbehaviorType) => void;
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Interface for peer discovery service implementations
 */
export interface IPeerDiscoveryService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getDiscoveredPeers(): EnhancedNetworkNode[];
  forceDiscovery(): Promise<void>;
}

/**
 * Interface for connection pool management
 */
export interface IConnectionPoolManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  connectToPeer(peer: EnhancedNetworkNode): Promise<boolean>;
  disconnectFromPeer(peerId: string): Promise<void>;
  getConnections(): PeerConnection[];
  getConnectionCount(): number;
  isConnectedToPeer(peerId: string): boolean;
}

/**
 * Interface for peer scoring service
 */
export interface IPeerScoringService {
  start(): Promise<void>;
  stop(): Promise<void>;
  calculatePeerScore(peer: EnhancedNetworkNode): number;
  getPeerScore(peerId: string): number;
  getPeerScoreDetails(peerId: string): PeerScore | null;
  getAllScores(): Map<string, PeerScore>;
}

/**
 * Interface for ban list management
 */
export interface IBanListManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  recordMisbehavior(
    peerId: string,
    address: string,
    type: MisbehaviorType,
    evidence: string
  ): void;
  banPeer(
    peerId: string,
    address: string,
    reason: string,
    evidence: string,
    duration?: number
  ): void;
  unbanPeer(peerId: string): boolean;
  isPeerBanned(peerId: string): boolean;
  isAddressBanned(address: string): boolean;
  getBannedPeers(): BanEntry[];
  getBanEntry(peerId: string): BanEntry | null;
  getMisbehaviorHistory(peerId: string): MisbehaviorIncident[];
}

/**
 * Main peer manager interface
 */
export interface IPeerManager {
  start(): Promise<void>;
  stop(): Promise<void>;

  // Peer management
  addPeer(peer: Partial<EnhancedNetworkNode>): boolean;
  removePeer(peerId: string): boolean;
  getPeer(peerId: string): EnhancedNetworkNode | null;
  getAllPeers(): EnhancedNetworkNode[];
  getConnectedPeers(): EnhancedNetworkNode[];
  getBestPeers(count: number): EnhancedNetworkNode[];

  // Connection management
  connectToPeer(peerId: string): Promise<boolean>;
  disconnectFromPeer(peerId: string): Promise<void>;

  // Reputation and banning
  banPeer(peerId: string, reason: string): void;
  unbanPeer(peerId: string): boolean;
  recordMisbehavior(
    peerId: string,
    type: MisbehaviorType,
    evidence: string
  ): void;
  getPeerScore(peerId: string): number;

  // Statistics
  getStatistics(): PeerManagerStatistics;
  getPeerMetrics(peerId: string): PeerMetrics | null;

  // Utility methods for integration
  updatePeerConnectionState(peerId: string, state: string): void;
  recordConnectionSuccess(peerId: string): void;
  recordConnectionFailure(peerId: string): void;
  recordInvalidMessage(peerId: string, reason: string): void;
}

// =============================================================================
// Default Configurations
// =============================================================================

/**
 * Default peer discovery configuration
 */
export const DEFAULT_DISCOVERY_CONFIG: PeerDiscoveryConfig = {
  dnsSeeds: [
    'seed1.lorachain.network',
    'seed2.lorachain.network',
    'seed3.lorachain.network',
  ],
  enablePeerExchange: true,
  enableMdns: true,
  enableMeshAnnounce: true,
  discoveryInterval: 30000, // 30 seconds
  maxDiscoveryPeers: 1000,
};

/**
 * Default connection pool configuration
 */
export const DEFAULT_CONNECTION_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 50,
  maxOutbound: 30,
  maxInbound: 20,
  connectionTimeout: 15000, // 15 seconds
  reconnectInterval: 60000, // 1 minute
  maxReconnectAttempts: 5,
  preferredPeerTypes: ['full', 'light'],
};

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  reliabilityWeight: 0.4,
  performanceWeight: 0.3,
  behaviorWeight: 0.3,
  reputationDecayRate: 0.01, // 1% decay per day
  minScore: 0,
  maxScore: 100,
  scoringInterval: 300000, // 5 minutes
};

/**
 * Default misbehavior detection configuration
 */
export const DEFAULT_MISBEHAVIOR_CONFIG: MisbehaviorConfig = {
  invalidMessageThreshold: 5,
  invalidMessageTimeWindow: 300000, // 5 minutes
  connectionFailureThreshold: 10,
  connectionFailureTimeWindow: 600000, // 10 minutes
  tempBanDuration: 3600000, // 1 hour
  maxTempBans: 3,
  autoUnbanEnabled: true,
};

/**
 * Default peer manager configuration combining all defaults
 */
export const DEFAULT_PEER_MANAGER_CONFIG: PeerManagerConfig = {
  discovery: DEFAULT_DISCOVERY_CONFIG,
  connectionPool: DEFAULT_CONNECTION_POOL_CONFIG,
  scoring: DEFAULT_SCORING_CONFIG,
  misbehavior: DEFAULT_MISBEHAVIOR_CONFIG,
  enableAutoOptimization: true,
  optimizationInterval: 120000, // 2 minutes
};
