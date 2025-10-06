/**
 * Base Blockchain Message Handler
 *
 * Abstract base class providing common functionality for all blockchain message handlers.
 * Implements the BlockchainMessageHandler interface with shared validation logic,
 * response creation helpers, and cryptographic service integration.
 *
 * DESIGN NOTES:
 * - Follows the same pattern as RoutingMessageHandler
 * - Provides common validation and response utilities
 * - Integrates with CryptographicService for signature verification
 * - Subclasses implement canHandle() and handle() methods
 * - Uses Logger from @lorachain/shared for consistent logging
 *
 * @module base-blockchain-message-handler
 */

import { Logger } from '@lorachain/shared';
import type { CryptographicService } from './cryptographic.js';
import type { BlockchainMessageHandler } from './blockchain-message-handler-interface.js';
import type { BlockchainMessageType } from './blockchain-message-types.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
  ValidationResult,
} from './blockchain-message-interfaces.js';

/**
 * Base class for blockchain message handlers
 *
 * Provides common functionality:
 * - Basic message validation (structure, required fields)
 * - Response message creation helpers
 * - Cryptographic service integration
 * - Priority-based handler ordering
 * - Logging utilities
 *
 * USAGE:
 * ```typescript
 * class MyHandler extends BaseBlockchainMessageHandler {
 *   constructor(cryptoService: CryptographicService) {
 *     super(80, cryptoService); // Priority 80
 *   }
 *
 *   canHandle(messageType: BlockchainMessageType): boolean {
 *     return messageType === BlockchainMessageType.MY_MESSAGE_TYPE;
 *   }
 *
 *   async handle(
 *     message: BlockchainNetworkMessage,
 *     context: BlockchainMessageContext
 *   ): Promise<MessageResponse> {
 *     // Validate
 *     const validation = this.validateBasicMessage(message);
 *     if (!validation.isValid) {
 *       return this.createResponse(false, undefined, validation.errors.join(', '));
 *     }
 *
 *     // Process message
 *     // ...
 *
 *     return this.createResponse(true);
 *   }
 * }
 * ```
 */
export abstract class BaseBlockchainMessageHandler
  implements BlockchainMessageHandler
{
  /**
   * Logger instance for consistent logging
   */
  protected logger: Logger;

  /**
   * Handler priority for selection ordering
   * Higher values = higher priority
   */
  protected priority: number;

  /**
   * Cryptographic service for signature verification
   */
  protected cryptoService: CryptographicService;

  /**
   * Create a new base blockchain message handler
   *
   * @param priority - Handler priority (0-100+)
   * @param cryptoService - Cryptographic service instance
   */
  constructor(priority: number = 0, cryptoService: CryptographicService) {
    this.logger = Logger.getInstance();
    this.priority = priority;
    this.cryptoService = cryptoService;
  }

  /**
   * Determine if this handler can process the given message type
   * Must be implemented by subclasses
   */
  abstract canHandle(messageType: BlockchainMessageType): boolean;

  /**
   * Process a blockchain network message
   * Must be implemented by subclasses
   */
  abstract handle(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse>;

  /**
   * Get handler priority for selection
   */
  getHandlerPriority(): number {
    return this.priority;
  }

  /**
   * Validate basic message structure and required fields
   *
   * Performs standard validation that applies to all message types:
   * - Message type is present
   * - Payload is present
   * - Metadata is present
   * - Signature is present (structural check only)
   * - Nonce is present
   *
   * NOTE: This method only validates the presence and structure of required fields.
   * Full cryptographic signature verification (ECDSA/Ed25519) is performed by
   * BlockchainMessageRouter.verifyCryptographicSignature() before message routing.
   *
   * Subclasses can perform additional message-type-specific validation.
   *
   * @param message - The blockchain network message to validate
   * @returns Validation result with error list
   *
   * @example
   * ```typescript
   * protected validateMessage(message: BlockchainNetworkMessage): ValidationResult {
   *   // First, perform basic validation
   *   const basicValidation = this.validateBasicMessage(message);
   *   if (!basicValidation.isValid) {
   *     return basicValidation;
   *   }
   *
   *   // Then perform handler-specific validation
   *   const errors: string[] = [];
   *   if (!message.payload.data) {
   *     errors.push('Missing payload data');
   *   }
   *
   *   return { isValid: errors.length === 0, errors };
   * }
   * ```
   */
  protected validateBasicMessage(
    message: BlockchainNetworkMessage
  ): ValidationResult {
    const errors: string[] = [];

    // Basic structure validation
    if (!message.type) {
      errors.push('Message type is required');
    }

    if (!message.payload) {
      errors.push('Message payload is required');
    }

    if (!message.metadata) {
      errors.push('Message metadata is required');
    }

    // Metadata validation
    if (!message.metadata?.signature) {
      errors.push('Message signature is required');
    }

    if (!message.metadata?.nonce) {
      errors.push('Message nonce is required');
    }

    if (!message.metadata?.source) {
      errors.push('Message source is required');
    }

    // Payload validation
    if (message.payload && !message.payload.version) {
      errors.push('Payload version is required');
    }

    if (message.payload && typeof message.payload.timestamp !== 'number') {
      errors.push('Payload timestamp must be a number');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a standard message response
   *
   * Helper method for creating consistent MessageResponse objects.
   *
   * @param success - Whether message processing succeeded
   * @param responseMessage - Optional response message to send
   * @param error - Optional error message if processing failed
   * @param forwardToPeers - Whether to forward message to peers (for flooding)
   * @returns Message response object
   *
   * @example
   * ```typescript
   * // Success response
   * return this.createResponse(true);
   *
   * // Success with response message
   * return this.createResponse(true, responseMessage);
   *
   * // Error response
   * return this.createResponse(false, undefined, 'Validation failed');
   *
   * // Success with forwarding
   * return this.createResponse(true, undefined, undefined, true);
   * ```
   */
  protected createResponse(
    success: boolean,
    responseMessage?: BlockchainNetworkMessage,
    error?: string,
    forwardToPeers?: boolean
  ): MessageResponse {
    return {
      success,
      responseMessage,
      error,
      forwardToPeers,
    };
  }
}
