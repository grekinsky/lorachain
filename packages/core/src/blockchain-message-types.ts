/**
 * Blockchain Message Types
 *
 * This module defines blockchain-specific message types for the Lorachain network.
 * These message types extend the existing routing protocol (handled by RoutingMessageHandler)
 * with blockchain-specific operations like block announcements, transaction broadcasts,
 * peer handshakes, and version negotiation.
 *
 * DESIGN NOTES:
 * - UTXO-only design with no backwards compatibility
 * - All messages are cryptographically signed (ECDSA/Ed25519)
 * - Integrates with existing infrastructure:
 *   - RoutingMessageHandler for routing messages (ROUTE_REQUEST, ROUTE_REPLY, etc.)
 *   - UTXOSyncManager for sync protocol messages
 *   - UTXOEnhancedMeshProtocol for transmission
 *
 * @module blockchain-message-types
 */

/**
 * Blockchain-specific message types
 *
 * These types complement the existing routing message types:
 * - ROUTE_REQUEST, ROUTE_REPLY, ROUTE_ERROR, HELLO (handled by RoutingMessageHandler)
 * - Sync protocol messages (handled by UTXOSyncManager)
 *
 * BREAKING CHANGE: No legacy message type support
 */
export enum BlockchainMessageType {
  // Block-related messages (UTXO-only)
  BLOCK_ANNOUNCEMENT = 'block_announcement',
  BLOCK_REQUEST = 'block_request',
  BLOCK_RESPONSE = 'block_response',

  // UTXO Transaction-related messages
  UTXO_TRANSACTION_BROADCAST = 'utxo_transaction_broadcast',
  UTXO_TRANSACTION_REQUEST = 'utxo_transaction_request',

  // Peer management messages
  PEER_HANDSHAKE_INIT = 'peer_handshake_init',
  PEER_HANDSHAKE_RESPONSE = 'peer_handshake_response',
  PEER_HANDSHAKE_ACK = 'peer_handshake_ack',

  // Protocol messages
  VERSION_NEGOTIATION = 'version_negotiation',
  HEARTBEAT = 'heartbeat',

  // Error handling
  ERROR_RESPONSE = 'error_response',
}
