/**
 * Blockchain Message Handler Interface
 *
 * This module defines the interface that all blockchain message handlers must implement.
 * It follows the same pattern as the existing RoutingMessageHandler but is focused on
 * blockchain-specific operations.
 *
 * DESIGN NOTES:
 * - Handler interface for blockchain messages only
 * - Routing messages continue to use RoutingMessageHandler
 * - Sync protocol messages use UTXOSyncManager
 * - Priority-based handler selection for complex message routing
 * - Async processing for non-blocking operation
 *
 * @module blockchain-message-handler-interface
 */

import type { BlockchainMessageType } from './blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
} from './blockchain-message-interfaces.js';

/**
 * Blockchain Message Handler Interface
 *
 * All blockchain message handlers must implement this interface.
 * Handlers are responsible for:
 * - Determining if they can handle a specific message type
 * - Processing the message and generating appropriate responses
 * - Returning priority for handler selection
 *
 * IMPLEMENTATION PATTERN:
 * - Extend BaseBlockchainMessageHandler for common functionality
 * - Implement canHandle() to specify supported message types
 * - Implement handle() for message processing logic
 * - Set priority in constructor for handler ordering
 */
export interface BlockchainMessageHandler {
  /**
   * Determine if this handler can process the given message type
   *
   * @param messageType - The blockchain message type to check
   * @returns true if this handler can process this message type
   *
   * @example
   * ```typescript
   * canHandle(messageType: BlockchainMessageType): boolean {
   *   return messageType === BlockchainMessageType.BLOCK_ANNOUNCEMENT ||
   *          messageType === BlockchainMessageType.BLOCK_REQUEST;
   * }
   * ```
   */
  canHandle(messageType: BlockchainMessageType): boolean;

  /**
   * Process a blockchain network message
   *
   * This is the main entry point for message processing.
   * Handlers should:
   * 1. Validate the message structure and signatures
   * 2. Process the message according to its type
   * 3. Generate appropriate responses if needed
   * 4. Update blockchain state as required
   *
   * @param message - The blockchain network message to process
   * @param context - The blockchain context (blockchain, peers, etc.)
   * @returns Promise resolving to message response
   * @throws Error if message processing fails critically
   *
   * @example
   * ```typescript
   * async handle(
   *   message: BlockchainNetworkMessage,
   *   context: BlockchainMessageContext
   * ): Promise<MessageResponse> {
   *   // Validate message
   *   const validation = this.validateBasicMessage(message);
   *   if (!validation.isValid) {
   *     return this.createResponse(false, undefined, validation.errors.join(', '));
   *   }
   *
   *   // Process message
   *   // ... handler-specific logic ...
   *
   *   return this.createResponse(true);
   * }
   * ```
   */
  handle(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse>;

  /**
   * Get handler priority for selection when multiple handlers can process a message
   *
   * Higher priority handlers are selected first.
   * Use priority to control handler ordering:
   * - 100+: Critical handlers (security, validation)
   * - 50-99: Normal handlers (blocks, transactions)
   * - 0-49: Low priority handlers (informational messages)
   *
   * @returns Numeric priority value
   *
   * @example
   * ```typescript
   * getHandlerPriority(): number {
   *   return 80; // High priority for block handling
   * }
   * ```
   */
  getHandlerPriority(): number;
}
