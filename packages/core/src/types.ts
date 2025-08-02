// Legacy Transaction interface - kept for Block compatibility only
export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  timestamp: number;
  signature: string;
  nonce: number;
}

// UTXO Model Types
export interface TransactionInput {
  previousTxId: string;
  outputIndex: number;
  unlockingScript: string; // Signature + public key
  sequence: number;
}

export interface TransactionOutput {
  value: number;
  lockingScript: string; // Public key hash
  outputIndex: number;
}

export interface UTXO {
  txId: string;
  outputIndex: number;
  value: number;
  lockingScript: string;
  blockHeight: number;
  isSpent: boolean;
}

export interface UTXOTransaction {
  id: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  lockTime: number;
  timestamp: number;
  fee: number;
}

export interface Block {
  index: number;
  timestamp: number;
  transactions: Transaction[];
  previousHash: string;
  hash: string;
  nonce: number;
  merkleRoot: string;
  difficulty: number;
  validator?: string;
}

export interface Wallet {
  address: string;
  privateKey: string;
  publicKey: string;
  balance: number;
}

export interface NetworkNode {
  id: string;
  address: string;
  port: number;
  type: 'light' | 'full';
  isOnline: boolean;
  lastSeen: number;
}

export interface BlockchainState {
  blocks: Block[];
  pendingTransactions: Transaction[];
  difficulty: number;
  miningReward: number;
  networkNodes: NetworkNode[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ConsensusAlgorithm {
  validateBlock(block: Block, blockchain: Block[]): ValidationResult;
  selectValidator(nodes: NetworkNode[]): NetworkNode | null;
}

export interface MeshMessage {
  type: 'transaction' | 'block' | 'sync' | 'discovery';
  payload: unknown;
  timestamp: number;
  from: string;
  to?: string;
  signature: string;
}

// UTXO Manager Interfaces
export interface IUTXOManager {
  // UTXO Management
  addUTXO(utxo: UTXO): void;
  removeUTXO(txId: string, outputIndex: number): boolean;
  getUTXO(txId: string, outputIndex: number): UTXO | null;

  // Address Queries
  getUTXOsForAddress(address: string): UTXO[];
  calculateBalance(address: string): number;
  getSpendableUTXOs(address: string, amount: number): UTXO[];

  // Validation
  validateUTXOExists(txId: string, outputIndex: number): boolean;
  validateUTXOOwnership(utxo: UTXO, publicKey: string): boolean;

  // Batch Operations
  applyUTXOUpdates(
    additions: UTXO[],
    removals: Array<{ txId: string; outputIndex: number }>
  ): void;

  // Statistics
  getUTXOSetSize(): number;
  getTotalValue(): number;
}

export interface UTXOSelectionResult {
  selectedUTXOs: UTXO[];
  totalValue: number;
  changeAmount: number;
}

export interface IUTXOTransactionManager {
  createTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    availableUTXOs: UTXO[]
  ): UTXOTransaction;

  validateTransaction(
    transaction: UTXOTransaction,
    utxoManager: IUTXOManager
  ): ValidationResult;

  calculateTransactionFee(
    inputs: TransactionInput[],
    outputs: TransactionOutput[]
  ): number;

  selectUTXOs(
    availableUTXOs: UTXO[],
    targetAmount: number
  ): UTXOSelectionResult;
}

// Merkle Tree Types
export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  transactionId?: string;
}

export interface MerkleProof {
  transactionId: string;
  transactionHash: string;
  merkleRoot: string;
  proof: ProofElement[];
  leafIndex: number;
}

export interface ProofElement {
  hash: string;
  direction: 'left' | 'right';
}

export interface CompressedMerkleProof {
  txId: string;
  txHash: string;
  root: string;
  path: string; // Compressed proof path
  index: number;
}

export interface BlockHeader {
  index: number;
  timestamp: number;
  previousHash: string;
  merkleRoot: string;
  hash: string;
  nonce: number;
  transactionCount: number;
  difficulty?: number;
  validator?: string;
}

export interface SPVValidationResult extends ValidationResult {
  transactionVerified: boolean;
  proofValid: boolean;
  blockHeaderValid: boolean;
}

// Database Persistence Types
export interface BatchOperation {
  type: 'put' | 'del';
  key: string;
  value?: unknown;
  sublevel?: string;
}

export interface KeyValue {
  key: string;
  value: unknown;
}

export interface Snapshot {
  id: string;
  timestamp: number;
}

export interface IteratorOptions {
  start?: string;
  end?: string;
  limit?: number;
  reverse?: boolean;
  sublevel?: string;
  snapshot?: Snapshot;
}

export interface IDatabase {
  get<T>(key: string, sublevel?: string): Promise<T | null>;
  put<T>(key: string, value: T, sublevel?: string): Promise<void>;
  del(key: string, sublevel?: string): Promise<void>;
  batch(operations: BatchOperation[]): Promise<void>;
  iterator(options: IteratorOptions): AsyncIterable<KeyValue>;
  multiGet(
    keys: Array<{ key: string; sublevel?: string }>
  ): Promise<Array<unknown | null>>;
  createSnapshot(): Promise<Snapshot>;
  releaseSnapshot(snapshot: Snapshot): Promise<void>;
  compact(sublevel?: string): Promise<void>;
  close(): Promise<void>;
}

// Persistence Configuration
export interface UTXOPersistenceConfig {
  enabled: boolean;
  dbPath: string;
  dbType: 'leveldb' | 'memory';
  autoSave: boolean;
  batchSize: number;
  compressionType: 'gzip' | 'none';
  maxDatabaseSize?: number;
  pruningEnabled?: boolean;
  backupEnabled?: boolean;
  utxoSetCacheSize: number;
  cryptographicAlgorithm: 'secp256k1' | 'ed25519';
  compactionStyle: 'size' | 'universal';
}

// Persistence State Types
export interface UTXOBlockchainState {
  blocks: Block[];
  utxoSet: Map<string, UTXO>;
  pendingUTXOTransactions: UTXOTransaction[];
  difficulty: number;
  miningReward: number;
  latestBlockIndex: number;
  utxoRootHash: string;
  cryptographicKeys: Map<string, unknown>;
}

// Validation and Repair Results
export interface RepairResult {
  repaired: boolean;
  errors: string[];
  utxoSetRebuilt: boolean;
  corruptedBlocks: number[];
}

// Database Statistics
export interface UTXODatabaseStats {
  totalUTXOs: number;
  totalValue: number;
  totalBlocks: number;
  totalTransactions: number;
  databaseSizeBytes: number;
  lastCompactionTime: number;
}

export interface ColumnFamilyStats {
  totalKeys: number;
  sizeBytes: number;
  compressionRatio: number;
}

// Genesis Block Configuration Types
export interface GenesisConfig {
  // Network identification
  chainId: string;
  networkName: string;
  version: string;

  // Initial coin distribution (UTXO-only)
  initialAllocations: InitialAllocation[];
  totalSupply: number;

  // Network parameters (integrates with existing DifficultyManager)
  networkParams: NetworkParameters;

  // Genesis block metadata
  metadata: GenesisMetadata;
}

export interface InitialAllocation {
  address: string; // Will become UTXOTransaction output lockingScript
  amount: number; // Will become UTXOTransaction output value
  description?: string;
}

export interface NetworkParameters {
  initialDifficulty: number;
  targetBlockTime: number; // in seconds (integrates with existing DifficultyConfig)
  adjustmentPeriod: number; // blocks (integrates with existing DifficultyConfig)
  maxDifficultyRatio: number; // integrates with existing DifficultyConfig
  maxBlockSize: number; // bytes (integrates with existing blockchain.maxBlockSize)
  miningReward: number; // integrates with existing blockchain.miningReward
  halvingInterval?: number; // blocks until reward halving
}

export interface GenesisMetadata {
  timestamp: number;
  description: string;
  creator: string;
  networkType: 'mainnet' | 'testnet' | 'devnet' | 'private';
}

// Message Fragmentation Types

export interface FragmentHeader {
  messageId: Uint8Array; // 16 bytes - Unique message identifier (crypto hash)
  sequenceNumber: number; // 2 bytes - Fragment sequence (0-based)
  totalFragments: number; // 2 bytes - Total number of fragments
  fragmentSize: number; // 2 bytes - Size of this fragment's payload
  flags: number; // 1 byte - Control flags (first, last, ack_required)
  checksum: number; // 4 bytes - Fragment payload checksum (CRC32)
  signature: Uint8Array; // 32 bytes - Ed25519 signature for fragment authenticity
}

export enum FragmentFlags {
  FIRST_FRAGMENT = 0x01, // First fragment of message
  LAST_FRAGMENT = 0x02, // Last fragment of message
  ACK_REQUIRED = 0x04, // Requires acknowledgment
  RETRANSMISSION = 0x08, // This is a retransmitted fragment
  PRIORITY = 0x10, // High priority fragment
  RESERVED = 0xe0, // Reserved for future use
}

export interface Fragment {
  header: FragmentHeader;
  payload: Uint8Array;
}

export interface ReassemblySession {
  messageId: string;
  totalFragments: number;
  receivedFragments: Map<number, Uint8Array>;
  lastActivity: number;
  timeout: number;
  retryCount: number;
  requiredAcks: Set<number>;
}

export enum ReassemblyResult {
  FRAGMENT_ADDED = 'fragment_added',
  MESSAGE_COMPLETE = 'message_complete',
  DUPLICATE_FRAGMENT = 'duplicate_fragment',
  INVALID_FRAGMENT = 'invalid_fragment',
  SESSION_TIMEOUT = 'session_timeout',
}

// Enhanced Reassembly Types for Advanced Message Reassembly

export enum MessagePriority {
  CRITICAL = 0, // Blocks and critical consensus messages
  HIGH = 1, // UTXO transactions
  NORMAL = 2, // Merkle proofs
  LOW = 3, // Other messages
}

export enum SessionState {
  RECEIVING = 'receiving',
  WAITING_RETRANSMISSION = 'waiting_retransmission',
  COMPLETE = 'complete',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

export interface RoutingHint {
  nodeId: string;
  hopCount: number;
  latency: number;
  reliability: number;
}

export interface EnhancedReassemblySession extends ReassemblySession {
  // Existing fields from ReassemblySession
  messageId: string;
  totalFragments: number;
  receivedFragments: Map<number, Uint8Array>;
  lastActivity: number;
  timeout: number;
  retryCount: number;
  requiredAcks: Set<number>;

  // New fields for enhanced reassembly
  priority: MessagePriority;
  messageType: UTXOMessageType;
  fragmentBitmap: Uint8Array; // Bitmap for received fragments
  missingFragments: Set<number>;
  retransmissionAttempts: Map<number, number>; // Per-fragment retry count
  lastRetransmissionRequest: number;
  nextRetransmissionTime: number;
  routingHints: RoutingHint[];
  sessionState: SessionState;
  signature: Uint8Array; // Ed25519 signature of session creator
}

export interface RetransmissionRequest {
  type: 'retransmission_request';
  messageId: Uint8Array;
  missingFragments: number[]; // Array of missing sequence numbers
  compressedBitmap?: Uint8Array; // Optional compressed bitmap for large fragment sets
  requestId: string;
  timestamp: number;
  nodeId: string;
  signature: Uint8Array; // Ed25519 signature
}

export interface FragmentAcknowledgment {
  type: 'fragment_ack' | 'fragment_nack';
  messageId: Uint8Array;
  acknowledgedFragments: number[] | Uint8Array; // Array or bitmap
  nackFragments?: number[]; // For negative acknowledgments
  cumulativeAck?: number; // All fragments up to this number
  timestamp: number;
  nodeId: string;
  signature: Uint8Array; // Ed25519 signature
}

export interface RetransmissionTask {
  messageId: Uint8Array;
  scheduledTime: number;
  priority: MessagePriority;
  missingFragments: number[];
}

export interface AckTracker {
  messageId: string;
  pendingFragments: Set<number>;
  completedFragments: Set<number>;
  lastAckTime: number;
  retransmissionDeadline: number;
}

export interface NetworkMetrics {
  averageLatency: number;
  packetLossRate: number;
  congestionLevel: number;
  throughput: number;
  nodeCount: number;
}

export interface NodeQuota {
  nodeId: string;
  fragmentsPerMinute: number;
  memoryUsage: number;
  activeSessions: number;
  lastReset: number;
}

export interface EnhancedFragmentationConfig extends FragmentationConfig {
  // Existing fields from FragmentationConfig
  maxFragmentSize: number;
  sessionTimeout: number;
  maxConcurrentSessions: number;
  retryAttempts: number;
  ackRequired: boolean;

  // New fields for enhanced functionality
  enableMissingFragmentDetection: boolean;
  enableRetransmissionRequests: boolean;
  enableFragmentAcknowledgments: boolean;
  enablePriorityBasedProcessing: boolean;
  enableNetworkOptimization: boolean;
  maxRetransmissionAttempts: number;
  retransmissionBaseBackoffMs: number;
  retransmissionMaxBackoffMs: number;
  retransmissionJitterPercent: number;
  fragmentsPerMinuteLimit: number;
  maxMemoryPerNode: number;
  maxSessionsPerNode: number;
}

export interface FragmentationConfig {
  maxFragmentSize: number;
  sessionTimeout: number;
  maxConcurrentSessions: number;
  retryAttempts: number;
  ackRequired: boolean;
}

export interface FragmentationStats {
  totalMessagesSent: number;
  totalMessagesReceived: number;
  totalFragmentsSent: number;
  totalFragmentsReceived: number;
  averageFragmentsPerMessage: number;
  retransmissionRate: number;
  reassemblySuccessRate: number;
  averageDeliveryTime: number;
}

export enum FragmentationEvent {
  FRAGMENT_SENT = 'fragment_sent',
  FRAGMENT_RECEIVED = 'fragment_received',
  MESSAGE_COMPLETE = 'message_complete',
  MESSAGE_TIMEOUT = 'message_timeout',
  FRAGMENT_RETRANSMIT = 'fragment_retransmit',
  BUFFER_FULL = 'buffer_full',
}

export interface FragmentationEventData {
  messageId: string;
  fragmentSequence?: number;
  totalFragments?: number;
  retryCount?: number;
  timestamp: number;
}

// UTXO Message Types for Fragmentation
export enum UTXOMessageType {
  UTXO_TRANSACTION = 'utxo_transaction',
  BLOCK = 'block',
  MERKLE_PROOF = 'merkle_proof',
  SYNC_DATA = 'sync_data',
}

export interface UTXOFragmentableMessage {
  type: UTXOMessageType;
  data: UTXOTransaction | Block | CompressedMerkleProof | unknown;
  priority: number;
  ttl: number; // Time to live in milliseconds
}

export interface EvictionCriteria {
  maxAge: number;
  maxSessions: number;
  memoryThreshold: number;
}

// Enhanced MeshMessage for fragmentation support
export interface FragmentedMeshMessage extends MeshMessage {
  fragmentationId?: string;
  isFragmented: boolean;
  fragmentInfo?: {
    currentFragment: number;
    totalFragments: number;
    fragmentSize: number;
  };
}

export interface FragmentedMeshProtocol {
  // Existing methods
  sendMessage(message: MeshMessage): Promise<boolean>;
  receiveMessage(data: Uint8Array): MeshMessage | null;

  // New fragmentation-specific methods
  setFragmentationConfig(config: FragmentationConfig): void;
  getFragmentationStats(): FragmentationStats;
  clearReassemblyBuffers(): void;
  retransmitMissingFragments(messageId: string): Promise<void>;

  // UTXO-specific fragmented message methods
  sendUTXOTransaction(tx: UTXOTransaction): Promise<boolean>;
  sendBlock(block: Block): Promise<boolean>;
  sendMerkleProof(proof: CompressedMerkleProof): Promise<boolean>;
}

// ==========================================
// ROUTING PROTOCOL TYPES
// ==========================================

// Node and Route Management Types
export interface BlockchainRouteEntry {
  destination: string;
  nextHop: string;
  hopCount: number;
  sequenceNumber: number;
  timestamp: number;
  linkQuality: number;
  nodeType: 'full' | 'light' | 'mining';
  utxoSetCompleteness: number; // 0-1 score of UTXO set completeness
  blockchainHeight: number;
  isActive: boolean;
  lastUTXOSync: number;
  signature: string; // Cryptographic signature for route authenticity
}

export interface UTXORouteTable {
  routes: Map<string, BlockchainRouteEntry[]>;
  maxRoutes: number;
  cleanupInterval: number;
  priorityNodes: Set<string>; // Full nodes and miners get priority
}

// Flood Management Types
export interface BlockchainFloodMessage {
  id: string;
  originator: string;
  sequenceNumber: number;
  ttl: number;
  messageType: 'utxo_transaction' | 'block' | 'discovery' | 'spv_proof';
  payload: UTXOTransaction | Block | unknown;
  timestamp: number;
  priority: 'high' | 'medium' | 'low'; // UTXO transactions = high priority
  signature: string;
  isFragmented: boolean;
  fragmentInfo?: {
    totalFragments: number;
    fragmentId: number;
    messageId: string;
  };
}

export interface BlockchainFloodEntry {
  messageId: string;
  originator: string;
  sequenceNumber: number;
  messageType: string;
  timestamp: number;
  processed: boolean;
  signatureValid: boolean;
}

// Message Forwarding Types
export interface BlockchainForwardingEntry {
  messageId: string;
  destination: string;
  nextHop: string;
  messageType: 'utxo_transaction' | 'block' | 'spv_proof' | 'discovery';
  priority: number;
  timestamp: number;
  retryCount: number;
  acknowledged: boolean;
  isFragmented: boolean;
  blockchainHeight?: number; // For prioritizing recent blocks
}

// Loop Prevention Types
export interface BlockchainPathVector {
  destination: string;
  path: string[];
  sequenceNumber: number;
  timestamp: number;
  blockchainHeight: number; // Prevent loops in blockchain sync
  pathSignature: string; // Cryptographic proof of path authenticity
}

export interface CryptoSequenceEntry {
  nodeId: string;
  sequenceNumber: number;
  timestamp: number;
  publicKey: string;
  signature: string;
}

// Protocol Message Types
export interface UTXORouteRequest {
  type: 'utxo_route_request';
  requestId: string;
  originator: string;
  destination: string;
  hopCount: number;
  sequenceNumber: number;
  path: string[];
  requestedNodeType: 'full' | 'light' | 'mining' | 'any';
  minUTXOCompleteness: number; // 0-1, minimum UTXO set completeness required
  minBlockchainHeight: number;
  timestamp: number;
  signature: string; // Cryptographic signature
  isFragmented: boolean;
  fragmentInfo?: FragmentInfo;
}

export interface UTXORouteReply {
  type: 'utxo_route_reply';
  requestId: string;
  originator: string;
  destination: string;
  hopCount: number;
  sequenceNumber: number;
  path: string[];
  nodeType: 'full' | 'light' | 'mining';
  utxoSetCompleteness: number;
  currentBlockchainHeight: number;
  lastUTXOSync: number;
  availableServices: string[]; // ['mining', 'spv_proofs', 'full_sync']
  timestamp: number;
  signature: string;
  isFragmented: boolean;
  fragmentInfo?: FragmentInfo;
}

export interface BlockchainRouteError {
  type: 'blockchain_route_error';
  brokenLink: {
    from: string;
    to: string;
  };
  affectedDestinations: string[];
  sequenceNumber: number;
  errorReason:
    | 'link_failure'
    | 'node_offline'
    | 'blockchain_sync_failed'
    | 'utxo_mismatch';
  blockchainContext?: {
    lastKnownHeight: number;
    utxoSetHash: string;
  };
  timestamp: number;
  signature: string;
}

export interface BlockchainHelloMessage {
  type: 'blockchain_hello';
  nodeId: string;
  sequenceNumber: number;
  nodeType: 'full' | 'light' | 'mining';
  currentBlockchainHeight: number;
  utxoSetCompleteness: number;
  lastUTXOSync: number;
  availableServices: string[];
  neighbors: {
    nodeId: string;
    linkQuality: number;
    nodeType: 'full' | 'light' | 'mining';
    blockchainHeight: number;
  }[];
  timestamp: number;
  signature: string;
  publicKey: string;
}

export interface FragmentInfo {
  totalFragments: number;
  fragmentId: number;
  messageId: string;
}

// Enhanced MeshMessage for routing support
export interface UTXORoutingMeshMessage extends MeshMessage {
  type: 'transaction' | 'block' | 'sync' | 'discovery';

  blockchainRoutingInfo?: {
    hopCount: number;
    path: string[];
    sequenceNumber: number;
    nextHop?: string;
    nodeType: 'full' | 'light' | 'mining';
    blockchainHeight: number;
    utxoSetHash?: string;
    priority: 'high' | 'medium' | 'low';
    signature: string;
  };

  // Existing fragmentation support
  fragmentationInfo?: {
    messageId: string;
    fragmentId: number;
    totalFragments: number;
    isComplete: boolean;
  };
}

// Routing Configuration
export interface RoutingConfig {
  // Route discovery
  routeDiscoveryTimeout: number; // Default: 30000ms
  maxRouteDiscoveryRetries: number; // Default: 3
  routeRequestTTL: number; // Default: 10 hops

  // Route maintenance
  routeExpiryTime: number; // Default: 300000ms (5 minutes)
  routeCleanupInterval: number; // Default: 60000ms (1 minute)
  maxRoutesPerDestination: number; // Default: 3

  // Flooding control
  floodCacheSize: number; // Default: 500 entries
  floodCacheExpiryTime: number; // Default: 60000ms
  maxFloodTTL: number; // Default: 15 hops

  // Message forwarding
  acknowledgmentTimeout: number; // Default: 5000ms
  maxForwardRetries: number; // Default: 3
  fragmentSize: number; // Default: 200 bytes

  // Loop prevention
  maxSequenceNumberAge: number; // Default: 600000ms (10 minutes)
  holdDownTime: number; // Default: 60000ms
  maxPathLength: number; // Default: 15 hops

  // Resource limits
  maxRoutingTableSize: number; // Default: 1000 entries
  maxPendingForwards: number; // Default: 100 entries
  memoryCleanupInterval: number; // Default: 300000ms (5 minutes)
}

// Routing Events
export interface RoutingEvents {
  route_discovered: (route: BlockchainRouteEntry) => void;
  route_lost: (destination: string, reason: string) => void;
  route_updated: (
    route: BlockchainRouteEntry,
    oldRoute: BlockchainRouteEntry
  ) => void;
  topology_changed: (changes: TopologyChange[]) => void;
  loop_detected: (path: string[], message: MeshMessage) => void;
  flood_suppressed: (messageId: string, reason: string) => void;
}

export interface TopologyChange {
  type: 'node_added' | 'node_removed' | 'link_added' | 'link_removed';
  nodeId?: string;
  linkFrom?: string;
  linkTo?: string;
  timestamp: number;
}

// Routing Metrics and Statistics
export interface RoutingMetrics {
  totalRoutes: number;
  activeRoutes: number;
  routeDiscoveryLatency: number;
  messageDeliveryRate: number;
  loopDetectionCount: number;
  floodSuppressionRate: number;
  memoryUsage: {
    routingTable: number;
    floodCache: number;
    pendingForwards: number;
  };
}

// Enhanced MeshProtocol Interface with Routing
export interface IEnhancedMeshProtocol extends FragmentedMeshProtocol {
  // Routing-aware messaging
  sendRoutedMessage(
    message: MeshMessage,
    destination: string
  ): Promise<boolean>;
  broadcastMessage(
    message: MeshMessage,
    excludeNodes?: string[]
  ): Promise<boolean>;

  // Route management
  discoverRoute(destination: string): Promise<BlockchainRouteEntry | null>;
  getRouteToDestination(destination: string): BlockchainRouteEntry | null;
  invalidateRoute(destination: string, nextHop: string): void;

  // Network topology
  getNetworkTopology(): NetworkTopology;
  getNeighbors(): NetworkNode[];
  getReachableNodes(): string[];

  // Events
  on(
    event: 'route_discovered',
    listener: (route: BlockchainRouteEntry) => void
  ): void;
  on(event: 'route_lost', listener: (destination: string) => void): void;
  on(
    event: 'topology_changed',
    listener: (topology: NetworkTopology) => void
  ): void;
}

export interface NetworkTopology {
  nodes: Map<string, NetworkNode>;
  links: Map<string, Set<string>>;
  lastUpdated: number;
}
