/**
 * UTXO Synchronization Protocol Types
 *
 * UTXO-only sync protocol with no backwards compatibility.
 * Designed for hybrid LoRa mesh and internet network topology.
 */

import type { MessagePriority } from './types.js';
import type { CompressionAlgorithm } from './compression-types.js';

// Protocol version - breaking changes allowed
export const SYNC_PROTOCOL_VERSION = '2.0.0';
export const SUPPORTED_VERSIONS = ['2.0.0']; // No backwards compatibility

/**
 * Synchronization state machine states
 */
export enum UTXOSyncState {
  DISCOVERING = 'discovering', // Node discovery via beacons
  NEGOTIATING = 'negotiating', // Capability and version negotiation
  HEADER_SYNC = 'header_sync', // UTXO block header synchronization
  UTXO_SET_SYNC = 'utxo_set_sync', // Full UTXO set synchronization
  BLOCK_SYNC = 'block_sync', // Individual block downloading
  MEMPOOL_SYNC = 'mempool_sync', // Pending UTXO transactions
  SYNCHRONIZED = 'synchronized', // Fully synchronized
  REORG_HANDLING = 'reorg_handling', // Chain reorganization in progress
}

/**
 * Synchronization context
 */
export interface UTXOSyncContext {
  state: UTXOSyncState;
  startTime: number;
  syncHeight: number;
  targetHeight: number;
  utxoSetSize: number;
  compressionRatio: number;
  meshLatency: number;
  dutyCycleRemaining: number;
}

/**
 * UTXO sync message types
 */
export enum UTXOSyncMessageType {
  // Discovery & Negotiation
  BEACON = 'beacon',
  CAPABILITY_ANNOUNCE = 'capability_announce',
  VERSION_NEGOTIATE = 'version_negotiate',

  // Header Synchronization
  UTXO_HEADER_REQUEST = 'utxo_header_request',
  UTXO_HEADER_BATCH = 'utxo_header_batch',
  UTXO_MERKLE_PROOF = 'utxo_merkle_proof',

  // UTXO Set Synchronization
  UTXO_SET_REQUEST = 'utxo_set_request',
  UTXO_SET_SNAPSHOT = 'utxo_set_snapshot',
  UTXO_SET_DELTA = 'utxo_set_delta',
  UTXO_PROOF_REQUEST = 'utxo_proof_request',

  // Block Synchronization
  UTXO_BLOCK_REQUEST = 'utxo_block_request',
  UTXO_BLOCK_RESPONSE = 'utxo_block_response',
  UTXO_BLOCK_FRAGMENT = 'utxo_block_fragment',

  // Transaction Pool
  UTXO_TX_ANNOUNCE = 'utxo_tx_announce',
  UTXO_TX_REQUEST = 'utxo_tx_request',
  UTXO_TX_BATCH = 'utxo_tx_batch',

  // Control Messages
  SYNC_STATUS = 'sync_status',
  COMPRESSION_NEGOTIATE = 'compression_negotiate',
  DUTY_CYCLE_STATUS = 'duty_cycle_status',
  PRIORITY_OVERRIDE = 'priority_override',
}

/**
 * Compressed payload structure
 */
export interface CompressedPayload {
  algorithm: CompressionAlgorithm;
  originalSize: number;
  compressedSize: number;
  data: Uint8Array; // Compressed binary data
  dictionary?: Uint8Array; // Optional compression dictionary
}

/**
 * Fragment information for large messages
 */
export interface FragmentInfo {
  messageId: string;
  fragmentIndex: number;
  totalFragments: number;
  checksum: string;
}

/**
 * Duty cycle information for mesh nodes
 */
export interface DutyCycleInfo {
  region:
    | 'EU'
    | 'US'
    | 'CA'
    | 'MX'
    | 'AU'
    | 'NZ'
    | 'JP'
    | 'IN'
    | 'CN'
    | 'KR'
    | 'BR'
    | 'AR'
    | 'RU'
    | 'ZA'
    | 'CUSTOM';
  dutyCycleUsed: number; // Percentage used
  timeToReset: number; // Milliseconds
  canTransmit: boolean;
}

/**
 * UTXO sync message structure
 */
export interface UTXOSyncMessage {
  version: string; // Protocol version (2.0.0)
  type: UTXOSyncMessageType;
  timestamp: number;
  signature: string; // ECDSA or Ed25519 signature
  publicKey: string; // Sender's public key
  payload: CompressedPayload;
  priority: MessagePriority;
  fragmentInfo?: FragmentInfo;
  dutyCycleInfo?: DutyCycleInfo;
}

/**
 * UTXO block header for sync
 */
export interface UTXOBlockHeader {
  index: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  utxoMerkleRoot: string;
  difficulty: number;
  nonce: number;
}

/**
 * UTXO set snapshot for fast sync
 */
export interface UTXOSetSnapshot {
  height: number;
  timestamp: number;
  merkleRoot: string;
  utxoCount: number;
  totalValue: bigint;
  compressedUTXOs: CompressedUTXOBatch[];
  proofs: UTXOMerkleProof[];
  signature: string;
}

/**
 * Compressed UTXO batch
 */
export interface CompressedUTXOBatch {
  startIndex: number;
  endIndex: number;
  algorithm: CompressionAlgorithm;
  data: Uint8Array;
  checksum: string;
}

/**
 * UTXO merkle proof
 */
export interface UTXOMerkleProof {
  txId: string;
  proof: string[];
  position: number;
}

/**
 * UTXO set delta for incremental sync
 */
export interface UTXOSetDelta {
  fromHeight: number;
  toHeight: number;
  created: CompressedUTXO[]; // New UTXOs
  spent: UTXOSpentProof[]; // Spent UTXOs with proofs
  merkleUpdate: MerkleTreeUpdate;
}

/**
 * Compressed UTXO
 */
export interface CompressedUTXO {
  id: string;
  data: Uint8Array;
}

/**
 * UTXO spent proof
 */
export interface UTXOSpentProof {
  utxoId: string;
  spentInBlock: number;
  spentByTx: string;
  signature: string; // Proof of spend
}

/**
 * Merkle tree update
 */
export interface MerkleTreeUpdate {
  oldRoot: string;
  newRoot: string;
  updatedNodes: MerkleNodeUpdate[];
}

/**
 * Merkle node update
 */
export interface MerkleNodeUpdate {
  path: string;
  oldHash: string;
  newHash: string;
}

/**
 * Sync peer information
 */
export interface SyncPeer {
  id: string;
  publicKey: string;
  type: 'internet' | 'mesh' | 'gateway';
  capabilities: SyncCapability[];
  protocolVersion: string;
  syncHeight: number;
  latency: number;
  reliability: number;
  lastSeen: number;
}

/**
 * Sync capabilities
 */
export enum SyncCapability {
  HEADER_SYNC = 'header_sync',
  BLOCK_SYNC = 'block_sync',
  TX_POOL_SYNC = 'tx_pool_sync',
  STATE_SYNC = 'state_sync',
  FRAGMENTATION = 'fragmentation',
  UTXO_SYNC = 'utxo_sync',
}

/**
 * Sync progress information
 */
export interface SyncProgress {
  state: UTXOSyncState;
  currentHeight: number;
  targetHeight: number;
  headersDownloaded: number;
  blocksDownloaded: number;
  utxosSynced: number;
  bytesDownloaded: number;
  bytesUploaded: number;
  peersConnected: number;
  estimatedTimeRemaining: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  success: boolean;
  invalidAt?: number;
  error?: string;
}

/**
 * Reorganization information
 */
export interface ReorgInfo {
  oldTip: string;
  newTip: string;
  commonAncestor: string;
  orphanedBlocks: string[];
  newBlocks: string[];
}

/**
 * UTXO sync metrics
 */
export interface UTXOSyncMetrics {
  // Sync performance
  headersPerSecond: number;
  blocksPerSecond: number;
  utxosPerSecond: number;
  compressionRatio: number;

  // Network metrics
  meshLatency: number;
  internetBandwidth: number;
  dutyCycleUtilization: number;
  fragmentSuccessRate: number;

  // Peer metrics
  activePeers: number;
  syncingPeers: number;
  peerReliability: Map<string, number>;

  // Data metrics
  totalUTXOs: number;
  syncedHeight: number;
  targetHeight: number;
  mempoolSize: number;
}

/**
 * Sync configuration
 */
export interface UTXOSyncConfig {
  maxPeers: number;
  maxParallelDownloads: number;
  headerBatchSize: number;
  blockBatchSize: number;
  utxoBatchSize: number;
  fragmentSize: number;
  syncTimeout: number;
  retryAttempts: number;
  minStakeForAuth: number;
  compressionThreshold: number;
}
