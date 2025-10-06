/**
 * Blockchain Message Payloads
 *
 * This module defines payload structures for blockchain-specific network messages.
 * Each message type has its own payload interface that defines the data structure
 * for that particular message type.
 *
 * DESIGN NOTES:
 * - UTXO-only design with no backwards compatibility
 * - All payloads are used with BlockchainNetworkMessage
 * - Payloads are type-safe and validated by handlers
 *
 * @module blockchain-message-payloads
 */

import type { Block } from './types.js';

/**
 * Block announcement payload
 *
 * Sent when a node mines or receives a new block.
 * Contains essential block metadata for efficient announcement
 * without sending the full block data.
 */
export interface BlockAnnouncementPayload {
  /**
   * Block hash (unique identifier)
   */
  blockHash: string;

  /**
   * Block height (index in chain)
   */
  blockHeight: number;

  /**
   * Previous block hash (for chain validation)
   */
  previousHash: string;

  /**
   * Block creation timestamp (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Miner address (block creator)
   */
  minerAddress: string;
}

/**
 * Block request payload
 *
 * Sent when a node needs to retrieve a specific block.
 * Can request by hash or height.
 */
export interface BlockRequestPayload {
  /**
   * Block hash to request (optional, preferred over height)
   */
  blockHash?: string;

  /**
   * Block height to request (optional, used if hash not provided)
   */
  blockHeight?: number;

  /**
   * Request ID for response correlation
   */
  requestId: string;
}

/**
 * Block response payload
 *
 * Sent in response to a block request.
 * Contains the full block data.
 */
export interface BlockResponsePayload {
  /**
   * The requested block (full data)
   */
  block: Block;

  /**
   * Request ID for correlation with request
   */
  requestId: string;
}

/**
 * UTXO transaction broadcast payload
 *
 * Sent when a node creates or receives a new UTXO transaction.
 * Used for flooding protocol to propagate transactions across the network.
 */
export interface UTXOTransactionBroadcastPayload {
  /**
   * The UTXO transaction to broadcast
   */
  transaction: import('./types.js').UTXOTransaction;

  /**
   * Unique propagation ID for deduplication
   * Prevents flooding loops by tracking which transactions have been seen
   */
  propagationId: string;

  /**
   * Transaction broadcast timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * UTXO transaction request payload
 *
 * Sent when a node needs to retrieve a specific UTXO transaction.
 * Can be used to request transactions from mempool or confirmed blocks.
 */
export interface UTXOTransactionRequestPayload {
  /**
   * Transaction ID to request
   */
  transactionId: string;

  /**
   * Request ID for response correlation
   */
  requestId: string;
}

/**
 * Peer node capabilities
 *
 * Describes the capabilities and features supported by a peer node.
 * Exchanged during peer handshake to enable feature negotiation.
 */
export interface PeerNodeCapabilities {
  /**
   * Whether this is a full node (stores complete blockchain)
   */
  isFullNode: boolean;

  /**
   * Whether this node participates in mining
   */
  isMiningNode: boolean;

  /**
   * Whether compression is supported for message transmission
   */
  supportsCompression: boolean;

  /**
   * List of supported compression algorithms (e.g., 'gzip', 'zlib', 'brotli')
   */
  compressionAlgorithms: string[];

  /**
   * Maximum message size this node can handle (bytes)
   */
  maxMessageSize: number;

  /**
   * Network type this node operates on
   */
  networkType: 'mesh' | 'internet' | 'hybrid';

  /**
   * Port number this node is listening on for peer connections
   */
  listeningPort: number;

  /**
   * Optional API port for HTTP/WebSocket connections (internet nodes)
   */
  apiPort?: number;
}

/**
 * Peer handshake init payload
 *
 * First message in three-way handshake protocol.
 * Initiator sends their identity, capabilities, and a challenge for authentication.
 */
export interface PeerHandshakeInitPayload {
  /**
   * Unique node identifier
   */
  nodeId: string;

  /**
   * Node's public key for cryptographic operations
   */
  publicKey: string;

  /**
   * Node capabilities and features
   */
  capabilities: PeerNodeCapabilities;

  /**
   * Protocol version being used
   */
  protocolVersion: string;

  /**
   * Random challenge for authentication (hex string)
   * Recipient must sign this to prove identity
   */
  challenge: string;

  /**
   * Message creation timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * Peer handshake response payload
 *
 * Second message in three-way handshake protocol.
 * Responder proves identity by signing initiator's challenge,
 * and issues their own challenge.
 */
export interface PeerHandshakeResponsePayload {
  /**
   * Unique node identifier
   */
  nodeId: string;

  /**
   * Node's public key for cryptographic operations
   */
  publicKey: string;

  /**
   * Node capabilities and features
   */
  capabilities: PeerNodeCapabilities;

  /**
   * Protocol version being used
   */
  protocolVersion: string;

  /**
   * Signed response to initiator's challenge
   * Proves ownership of public key
   */
  challengeResponse: string;

  /**
   * New challenge for initiator
   * Initiator must sign this in ACK
   */
  challenge: string;

  /**
   * Message creation timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * Peer handshake ACK payload
 *
 * Third and final message in three-way handshake protocol.
 * Initiator proves identity by signing responder's challenge,
 * completing the mutual authentication.
 */
export interface PeerHandshakeAckPayload {
  /**
   * Unique node identifier
   */
  nodeId: string;

  /**
   * Signed response to responder's challenge
   * Proves ownership of public key
   */
  challengeResponse: string;

  /**
   * Whether the connection is successfully established
   */
  connectionEstablished: boolean;

  /**
   * Message creation timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * Protocol feature flags
 *
 * Describes the protocol features and capabilities supported by a node.
 * Used during version negotiation to determine agreed features between peers.
 *
 * BREAKING CHANGE: No backwards compatibility - all required features must be true.
 */
export interface ProtocolFeatureFlags {
  /**
   * Whether UTXO-only transactions are supported (REQUIRED - must be true)
   */
  supportsUTXOOnly: boolean;

  /**
   * Whether message compression is supported
   */
  supportsCompression: boolean;

  /**
   * Whether message fragmentation is supported
   */
  supportsFragmentation: boolean;

  /**
   * Whether cryptographic signing is supported (REQUIRED - must be true)
   */
  supportsCryptographicSigning: boolean;

  /**
   * Whether mesh routing is supported
   */
  supportsMeshRouting: boolean;

  /**
   * Whether hybrid networking (mesh + internet) is supported
   */
  supportsHybridNetworking: boolean;

  /**
   * Optional custom features
   * Map of feature names to boolean values
   */
  customFeatures?: Record<string, boolean>;
}

/**
 * Version negotiation payload
 *
 * Sent during peer connection establishment to negotiate protocol version
 * and exchange feature capabilities.
 *
 * BREAKING CHANGE: No backwards compatibility - only current version supported.
 */
export interface VersionNegotiationPayload {
  /**
   * Unique node identifier
   */
  nodeId: string;

  /**
   * List of protocol versions this node supports
   * BREAKING CHANGE: Only current version (no backwards compatibility)
   */
  supportedVersions: string[];

  /**
   * Current protocol version this node is using
   */
  currentVersion: string;

  /**
   * Minimum required version for compatibility
   */
  minRequiredVersion: string;

  /**
   * Protocol features supported by this node
   */
  featureFlags: ProtocolFeatureFlags;

  /**
   * Message creation timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * Version negotiation result
 *
 * Result of protocol version negotiation between two peers.
 * Indicates whether negotiation succeeded and what version/features were agreed upon.
 */
export interface VersionNegotiationResult {
  /**
   * Whether version negotiation succeeded
   */
  success: boolean;

  /**
   * The negotiated protocol version to use
   * Empty string if negotiation failed
   */
  negotiatedVersion: string;

  /**
   * The agreed-upon features (intersection of both peers' capabilities)
   */
  agreedFeatures: ProtocolFeatureFlags;

  /**
   * Optional error message if negotiation failed
   */
  error?: string;
}
