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
