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
