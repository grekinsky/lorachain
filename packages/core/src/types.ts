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
