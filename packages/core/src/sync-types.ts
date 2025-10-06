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

  // Checkpoint Distribution (Task 3)
  CHECKPOINT_ANNOUNCE = 'checkpoint_announce',
  CHECKPOINT_REQUEST = 'checkpoint_request',
  CHECKPOINT_FRAGMENT = 'checkpoint_fragment',
  CHECKPOINT_COMPLETE = 'checkpoint_complete',

  // State Update Subscription (Task 5)
  STATE_UPDATE_SUBSCRIBE = 'state_update_subscribe',
  STATE_UPDATE_UNSUBSCRIBE = 'state_update_unsubscribe',
  STATE_UPDATE_BATCH = 'state_update_batch',

  // Missing Update Recovery (Task 6)
  MISSING_UPDATE_REQUEST = 'missing_update_request',
  MISSING_UPDATE_RESPONSE = 'missing_update_response',
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
  originalSize: number; // Size of uncompressed data for decompression verification
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
 * Compressed UTXO (for incremental state updates)
 */
export interface CompressedUTXO {
  txId: string;
  outputIndex: number;
  value: number;
  address: string;
}

/**
 * UTXO spent proof (for incremental state updates)
 */
export interface UTXOSpentProof {
  txId: string;
  outputIndex: number;
  spentInBlock: number;
  spentInTxId: string;
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

/**
 * Checkpoint announcement payload
 */
export interface CheckpointAnnouncePayload {
  checkpointHash: string;
  height: number;
  utxoCount: number;
  totalSize: number;
  fragmentCount: number;
  merkleRoot: string;
  validatorSignatures: number; // Count of signatures
}

/**
 * Checkpoint request payload
 */
export interface CheckpointRequestPayload {
  checkpointHash: string;
  requestedFragments?: number[]; // Specific fragments, or all if omitted
}

/**
 * Checkpoint fragment payload
 */
export interface CheckpointFragmentPayload {
  checkpointHash: string;
  fragmentIndex: number;
  totalFragments: number;
  fragmentData: Buffer;
  checksum: string;
  compressionAlgorithm: CompressionAlgorithm; // Algorithm used for checkpoint compression
}

/**
 * Checkpoint statistics
 */
export interface CheckpointStats {
  totalCheckpoints: number;
  oldestHeight: number;
  newestHeight: number;
  totalSize: number;
  averageSize: number;
}

/**
 * State update subscription payload
 */
export interface StateUpdateSubscribePayload {
  peerId: string;
  subscriptionType: 'all' | 'address_specific';
  addresses?: string[]; // For address-specific subscriptions
  startSequence?: number; // Resume from specific sequence
  expiresAt?: number; // Optional expiration timestamp
}

/**
 * State update batch payload
 */
export interface StateUpdateBatchPayload {
  updates: StateUpdate[];
  batchSequence: number;
  timestamp: number;
  compressed: boolean;
}

/**
 * State update for incremental sync
 */
export interface StateUpdate {
  sequenceNumber: number;
  blockHeight: number;
  blockHash: string;
  timestamp: number;
  previousUpdateHash: string;
  utxosCreated: CompressedUTXO[];
  utxosSpent: UTXOSpentProof[];
  merkleRootBefore: string;
  merkleRootAfter: string;
  merkleProof: string[];
  signature: string;
  publicKey: string;
  algorithm: 'secp256k1' | 'ed25519';
}

/**
 * Missing update request payload (Task 6)
 */
export interface MissingUpdateRequestPayload {
  requestId: string;
  sequenceNumbers: number[]; // List of missing sequences
  requestedBy: string; // Peer ID making request
  timestamp: number;
}

/**
 * Missing update response payload (Task 6)
 */
export interface MissingUpdateResponsePayload {
  requestId: string;
  updates: StateUpdate[];
  missingSequences: number[]; // Sequences not found
}
