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
  applyUTXOUpdates(additions: UTXO[], removals: Array<{txId: string, outputIndex: number}>): void;
  
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
  
  validateTransaction(transaction: UTXOTransaction, utxoManager: IUTXOManager): ValidationResult;
  
  calculateTransactionFee(inputs: TransactionInput[], outputs: TransactionOutput[]): number;
  
  selectUTXOs(availableUTXOs: UTXO[], targetAmount: number): UTXOSelectionResult;
}
