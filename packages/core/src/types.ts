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
