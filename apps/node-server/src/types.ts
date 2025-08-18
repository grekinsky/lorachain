// Types are imported in files that use them

// Server Configuration
export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    utxoPriorityBoost: boolean; // Boost limits for high-fee UTXO transactions
  };
  auth: {
    jwtSecret: string;
    jwtExpiration: string;
    signatureAlgorithm: 'secp256k1' | 'ed25519';
    challengeExpiration: number;
  };
  websocket: {
    enabled: boolean;
    path: string;
    maxConnections: number;
    compressionEnabled: boolean;
    compressionEngine: 'gzip' | 'zlib' | 'brotli' | 'lz4';
  };
  utxo: {
    maxInputsPerTransaction: number;
    maxOutputsPerTransaction: number;
    minRelayFee: bigint;
    mempoolMaxSize: number;
  };
}

// API Response Types
export interface UTXOAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: UTXOErrorCode;
    message: string;
    details?: {
      utxoId?: string;
      requiredAmount?: bigint;
      availableAmount?: bigint;
    };
  };
  timestamp: number;
  chainId: string;
  version: string;
}

export enum UTXOErrorCode {
  DOUBLE_SPEND = 'UTXO_DOUBLE_SPEND',
  INSUFFICIENT_FUNDS = 'UTXO_INSUFFICIENT_FUNDS',
  INVALID_SIGNATURE = 'UTXO_INVALID_SIGNATURE',
  UTXO_NOT_FOUND = 'UTXO_NOT_FOUND',
  INVALID_OUTPUT = 'UTXO_INVALID_OUTPUT',
  FEE_TOO_LOW = 'UTXO_FEE_TOO_LOW',
  INVALID_INPUT = 'UTXO_INVALID_INPUT',
  MEMPOOL_FULL = 'UTXO_MEMPOOL_FULL',
  TRANSACTION_TOO_LARGE = 'UTXO_TRANSACTION_TOO_LARGE',
  RATE_LIMITED = 'UTXO_RATE_LIMITED',
  UNAUTHORIZED = 'UTXO_UNAUTHORIZED',
  INTERNAL_ERROR = 'UTXO_INTERNAL_ERROR',
}

// UTXO Response Types
export interface UTXOSetResponse {
  address: string;
  utxos: Array<{
    id: string;
    transactionId: string;
    outputIndex: number;
    amount: string; // BigInt as string
    scriptPubKey: string;
    blockHeight: number;
    confirmations: number;
  }>;
  totalBalance: string; // BigInt as string
  spendableBalance: string; // BigInt as string
}

export interface BlockchainInfo {
  height: number;
  latestBlockHash: string;
  difficulty: number;
  targetDifficulty: number;
  networkHashRate: number;
  totalUTXOs: number;
  totalSupply: string; // BigInt as string
  averageBlockTime: number;
  nextDifficultyAdjustment: number;
}

// WebSocket Event Types
export interface UTXOWebSocketEvent {
  event: 'utxo:created' | 'utxo:spent';
  data: {
    utxoId: string;
    transactionId: string;
    outputIndex: number;
    address: string;
    amount: string; // BigInt as string
    blockHeight: number;
    spentInTx?: string; // For spent events
  };
  timestamp: number;
  blockHash: string;
}

export interface UTXOSubscription {
  action: 'subscribe' | 'unsubscribe';
  filters: {
    addresses?: string[];
    minAmount?: string; // BigInt as string
    confirmations?: number;
  };
  auth?: string; // JWT for privileged subscriptions
}

// Authentication Types
export interface CryptoAuthChallenge {
  challenge: string;
  algorithm: 'secp256k1' | 'ed25519';
  expiresAt: number;
  nodePublicKey: string;
}

export interface CryptoAuthResponse {
  signature: string;
  publicKey: string;
  challenge: string;
}

export interface AuthenticatedClient {
  id: string;
  publicKey: string;
  algorithm: 'secp256k1' | 'ed25519';
  permissions: string[];
  connectedAt: number;
  lastActivity: number;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Metrics Types
export interface UTXOServerMetrics {
  utxoOperations: {
    queries: number;
    creates: number;
    spends: number;
    doubleSpendAttempts: number;
  };
  compression: {
    totalCompressed: number;
    averageRatio: number;
    engineUsage: Record<string, number>;
  };
  authentication: {
    ed25519Verifications: number;
    secp256k1Verifications: number;
    challengesIssued: number;
    failedAuthentications: number;
  };
  meshIntegration: {
    dutyCycleWarnings: number;
    priorityTransactions: number;
    reliableDeliveryAcks: number;
  };
}
