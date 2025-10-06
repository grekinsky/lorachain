/**
 * Blockchain Message Interfaces
 *
 * This module defines core interfaces for blockchain-specific network messages.
 * These interfaces enable type-safe message handling throughout the Lorachain network.
 *
 * DESIGN NOTES:
 * - UTXO-only message payloads (no backwards compatibility)
 * - All messages require cryptographic signatures (ECDSA/Ed25519)
 * - Nonce-based replay attack prevention
 * - Integration with existing components:
 *   - Blockchain for block and transaction operations
 *   - UTXOManager for UTXO set management
 *   - PeerManager for peer state and reputation
 *   - UTXOEnhancedMeshProtocol for message transmission
 *   - UTXOSyncManager for blockchain synchronization
 *
 * @module blockchain-message-interfaces
 */

import type { BlockchainMessageType } from './blockchain-message-types.js';
import type { Blockchain } from './blockchain.js';
import type { UTXOManager } from './utxo.js';
import type { PeerManager } from './peer-manager.js';
import type { UTXOEnhancedMeshProtocol } from './enhanced-mesh-protocol.js';
import type { UTXOSyncManager } from './sync-manager.js';

/**
 * UTXO-only message payload structure
 *
 * BREAKING CHANGE: No legacy transaction format support
 */
export interface UTXOMessagePayload {
  /**
   * Payload data (type-specific content)
   * Could be block data, transaction data, handshake data, etc.
   */
  data: unknown;

  /**
   * Protocol version for version negotiation
   * No backwards compatibility - modern protocol only
   */
  version: string;

  /**
   * Message creation timestamp (milliseconds since epoch)
   */
  timestamp: number;
}

/**
 * Blockchain network message structure
 *
 * This is the core message format for all blockchain-specific network communication.
 * Every message includes cryptographic security (signature, nonce) and metadata
 * for routing and reliability.
 */
export interface BlockchainNetworkMessage {
  /**
   * Message type identifier
   */
  type: BlockchainMessageType;

  /**
   * UTXO-only message payload
   * No backwards compatibility with legacy formats
   */
  payload: UTXOMessagePayload;

  /**
   * Message metadata for routing and security
   */
  metadata: {
    /**
     * Timestamp when message was received (milliseconds since epoch)
     */
    receivedAt: number;

    /**
     * Source node identifier (sender)
     */
    source: string;

    /**
     * Number of hops traversed (for mesh routing)
     */
    hopCount: number;

    /**
     * Received Signal Strength Indicator (optional, for LoRa quality metrics)
     */
    rssi?: number;

    /**
     * Cryptographic signature (ECDSA/Ed25519)
     * Computed over the entire message (excluding this field)
     */
    signature: string;

    /**
     * Unique nonce for replay attack prevention
     * Combined with timestamp to ensure message uniqueness
     */
    nonce: string;
  };
}

/**
 * Message context for blockchain message handlers
 *
 * Provides handlers with access to all necessary blockchain components
 * for message processing, validation, and response generation.
 */
export interface BlockchainMessageContext {
  /**
   * Blockchain instance for block and transaction validation
   */
  blockchain: Blockchain;

  /**
   * UTXO manager for UTXO set operations
   */
  utxoManager: UTXOManager;

  /**
   * Peer manager for peer discovery and reputation management
   */
  peers: PeerManager;

  /**
   * Enhanced mesh protocol for message transmission
   */
  protocol: UTXOEnhancedMeshProtocol;

  /**
   * Sync manager for blockchain synchronization
   */
  syncManager: UTXOSyncManager;
}

/**
 * Handler response structure
 *
 * Returned by message handlers to indicate processing results
 * and optional response messages.
 */
export interface MessageResponse {
  /**
   * Whether message processing succeeded
   */
  success: boolean;

  /**
   * Optional response message to send back to sender or network
   */
  responseMessage?: BlockchainNetworkMessage;

  /**
   * Whether to forward this message to other peers
   * Used for flooding protocols (e.g., transaction broadcasts)
   */
  forwardToPeers?: boolean;

  /**
   * Error message if processing failed
   */
  error?: string;
}

/**
 * Validation result for message validation
 *
 * Used throughout the system for consistent validation reporting
 */
export interface ValidationResult {
  /**
   * Whether validation succeeded
   */
  isValid: boolean;

  /**
   * List of validation errors (empty if valid)
   */
  errors: string[];
}
