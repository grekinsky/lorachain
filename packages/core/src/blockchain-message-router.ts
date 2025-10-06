import { Logger } from '@lorachain/shared';
import { CryptographicService } from './cryptographic.js';
import type { UTXOPriorityQueue } from './priority-queue.js';
import type { UTXOReliableDeliveryManager } from './utxo-reliable-delivery-manager.js';
import type { BlockchainMessageHandler } from './blockchain-message-handler-interface.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
  ValidationResult,
} from './blockchain-message-interfaces.js';
import { BlockchainMessageType } from './blockchain-message-types.js';

/**
 * Central router for blockchain-specific network messages.
 *
 * Provides comprehensive message routing with:
 * - Cryptographic validation (ECDSA secp256k1 and Ed25519)
 * - Replay attack prevention via nonce tracking
 * - Handler registration with priority-based selection
 * - Integration with existing UTXOPriorityQueue and UTXOReliableDeliveryManager
 *
 * @example
 * ```typescript
 * const router = new BlockchainMessageRouter(
 *   cryptoService,
 *   messageQueue,
 *   reliableDelivery
 * );
 *
 * // Register handlers
 * router.registerHandler(blockHandler);
 * router.registerHandler(txHandler);
 *
 * // Route messages
 * const response = await router.routeMessage(message, context);
 * ```
 */
export class BlockchainMessageRouter {
  private handlers: Map<BlockchainMessageType, BlockchainMessageHandler[]> =
    new Map();
  private processedNonces: Set<string> = new Set();
  private nonceTimeWindow: number = 300000; // 5 minutes in milliseconds
  private logger: Logger;
  private nonceCleanupInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new blockchain message router.
   *
   * @param cryptoService - Cryptographic service for signature verification
   * @param messageQueue - Priority queue for message management
   * @param reliableDelivery - Reliable delivery manager for retry logic
   */
  constructor(
    private cryptoService: CryptographicService,
    private messageQueue: UTXOPriorityQueue,
    private reliableDelivery: UTXOReliableDeliveryManager
  ) {
    this.logger = Logger.getInstance();
    this.startNonceCleanup();
  }

  /**
   * Routes a blockchain message to the appropriate handler.
   *
   * Performs comprehensive validation:
   * 1. Cryptographic signature verification
   * 2. Replay attack prevention
   * 3. Message structure validation
   * 4. Handler selection and execution
   *
   * @param message - The blockchain network message to route
   * @param context - Context containing blockchain state and dependencies
   * @returns Promise resolving to the handler's message response
   * @throws Error if validation fails or no handler is available
   */
  async routeMessage(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      // Step 1: Cryptographic validation
      if (!(await this.verifyCryptographicSignature(message))) {
        const error = 'Invalid cryptographic signature';
        this.logger.warn('Message validation failed', { error });
        throw new Error(error);
      }

      // Step 2: Replay attack prevention
      if (!this.checkReplayAttack(message.metadata.nonce)) {
        const error = 'Replay attack detected';
        this.logger.warn('Security violation', { error });
        throw new Error(error);
      }

      // Step 3: Message validation
      const validation = this.validateMessage(message);
      if (!validation.isValid) {
        const error = `Invalid message: ${validation.errors.join(', ')}`;
        this.logger.warn('Message structure validation failed', { error });
        throw new Error(error);
      }

      // Step 4: Handler selection and execution
      const handler = this.selectHandler(message.type);
      if (!handler) {
        const error = `No handler available for message type: ${message.type}`;
        this.logger.error('Handler not found', { error });
        throw new Error(error);
      }

      this.logger.debug(
        `Routing message type ${message.type} to handler with priority ${handler.getHandlerPriority()}`
      );

      // Step 5: Execute handler
      return await handler.handle(message, context);
    } catch (error) {
      this.logger.error('Message routing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Registers a blockchain message handler.
   *
   * Handlers are automatically registered for all message types they can handle.
   * Multiple handlers can be registered for the same message type, with priority
   * determining selection order.
   *
   * @param handler - The handler to register
   */
  registerHandler(handler: BlockchainMessageHandler): void {
    // Get all message types this handler can handle
    const messageTypes = Object.values(BlockchainMessageType);

    for (const type of messageTypes) {
      if (handler.canHandle(type)) {
        if (!this.handlers.has(type)) {
          this.handlers.set(type, []);
        }

        const handlers = this.handlers.get(type)!;
        handlers.push(handler);

        // Sort by priority (higher priority first)
        handlers.sort(
          (a, b) => b.getHandlerPriority() - a.getHandlerPriority()
        );

        this.logger.info(
          `Registered handler for message type ${type} with priority ${handler.getHandlerPriority()}`
        );
      }
    }
  }

  /**
   * Unregisters a blockchain message handler.
   *
   * Removes the handler from all message types it was registered for.
   *
   * @param handler - The handler to unregister
   */
  unregisterHandler(handler: BlockchainMessageHandler): void {
    const messageTypes = Object.values(BlockchainMessageType);

    for (const type of messageTypes) {
      if (this.handlers.has(type)) {
        const handlers = this.handlers.get(type)!;
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
          this.logger.info(`Unregistered handler for message type ${type}`);
        }
      }
    }
  }

  /**
   * Selects the appropriate handler for a message type.
   *
   * Returns the highest priority handler capable of handling the message type.
   *
   * @param messageType - The blockchain message type
   * @returns The selected handler, or null if no handler is available
   */
  private selectHandler(
    messageType: BlockchainMessageType
  ): BlockchainMessageHandler | null {
    const handlers = this.handlers.get(messageType);
    if (!handlers || handlers.length === 0) {
      return null;
    }

    // Return highest priority handler (already sorted)
    return handlers[0];
  }

  /**
   * Validates the structure and required fields of a blockchain message.
   *
   * Checks for:
   * - Valid message type
   * - Required payload
   * - Required metadata (source, signature, nonce)
   *
   * @param message - The message to validate
   * @returns Validation result with errors if any
   */
  private validateMessage(message: BlockchainNetworkMessage): ValidationResult {
    const errors: string[] = [];

    // Type validation
    if (!Object.values(BlockchainMessageType).includes(message.type)) {
      errors.push(`Invalid message type: ${message.type}`);
    }

    // Payload validation
    if (!message.payload) {
      errors.push('Message payload is required');
    }

    // Metadata validation
    if (!message.metadata) {
      errors.push('Message metadata is required');
    } else {
      if (!message.metadata.source) {
        errors.push('Message source is required');
      }
      if (!message.metadata.signature) {
        errors.push('Message signature is required');
      }
      if (!message.metadata.nonce) {
        errors.push('Message nonce is required');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Verifies the cryptographic signature of a blockchain message.
   *
   * Attempts verification with both ECDSA (secp256k1) and Ed25519 algorithms.
   * ECDSA is tried first as it's more commonly used in blockchain systems.
   *
   * @param message - The message with signature to verify
   * @returns Promise resolving to true if signature is valid, false otherwise
   */
  private async verifyCryptographicSignature(
    message: BlockchainNetworkMessage
  ): Promise<boolean> {
    try {
      // Create message hash for signature verification
      const messageData = JSON.stringify({
        type: message.type,
        payload: message.payload,
        source: message.metadata.source,
        nonce: message.metadata.nonce,
      });

      const messageHash = CryptographicService.hashMessage(messageData);
      const signatureBytes = this.hexToBytes(message.metadata.signature);
      const publicKeyBytes = this.hexToBytes(message.metadata.source);

      // Try ECDSA verification first
      try {
        const isValid = CryptographicService.verify(
          { signature: signatureBytes, algorithm: 'secp256k1' },
          messageHash,
          publicKeyBytes
        );
        if (isValid) return true;
      } catch {
        // If ECDSA fails, try Ed25519
      }

      // Try Ed25519 verification
      const isValid = CryptographicService.verify(
        { signature: signatureBytes, algorithm: 'ed25519' },
        messageHash,
        publicKeyBytes
      );

      return isValid;
    } catch (error) {
      this.logger.error('Signature verification error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Converts hex string to bytes array.
   *
   * @param hex - Hex string to convert
   * @returns Uint8Array of bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Checks if a message nonce has been processed before (replay attack detection).
   *
   * Uses a simple set-based approach with periodic cleanup. In production,
   * this should be enhanced with timestamp tracking for more granular control.
   *
   * @param nonce - The nonce to check
   * @returns True if nonce is new (not a replay), false if already processed
   */
  private checkReplayAttack(nonce: string): boolean {
    // Check if nonce was already processed
    if (this.processedNonces.has(nonce)) {
      return false;
    }

    // Add nonce to processed set
    this.processedNonces.add(nonce);
    return true;
  }

  /**
   * Starts periodic cleanup of processed nonces.
   *
   * Clears all nonces every 5 minutes to prevent unbounded memory growth.
   * In production, this should track timestamps per nonce for more precise
   * time-window based cleanup.
   */
  private startNonceCleanup(): void {
    // Clean up old nonces every 5 minutes
    this.nonceCleanupInterval = setInterval(() => {
      // Clear all nonces (simple approach for MVP)
      // In production, track timestamps per nonce for more granular cleanup
      this.processedNonces.clear();

      this.logger.debug('Nonce cleanup completed');
    }, this.nonceTimeWindow);
  }

  /**
   * Stops the nonce cleanup interval.
   *
   * Should be called when shutting down the router to prevent memory leaks.
   */
  stopNonceCleanup(): void {
    if (this.nonceCleanupInterval) {
      clearInterval(this.nonceCleanupInterval);
      this.nonceCleanupInterval = null;
      this.logger.debug('Nonce cleanup stopped');
    }
  }

  /**
   * Gets a copy of the registered handlers map.
   *
   * Useful for testing and debugging. Returns a new Map to prevent
   * external modification of internal state.
   *
   * @returns Copy of the handlers map
   */
  getRegisteredHandlers(): Map<
    BlockchainMessageType,
    BlockchainMessageHandler[]
  > {
    return new Map(this.handlers);
  }

  /**
   * Gets the cryptographic service used by this router.
   *
   * @returns The cryptographic service instance
   */
  getCryptoService(): CryptographicService {
    return this.cryptoService;
  }

  /**
   * Gets the message queue used by this router.
   *
   * @returns The priority queue instance
   */
  getMessageQueue(): UTXOPriorityQueue {
    return this.messageQueue;
  }

  /**
   * Gets the reliable delivery manager used by this router.
   *
   * @returns The reliable delivery manager instance
   */
  getReliableDelivery(): UTXOReliableDeliveryManager {
    return this.reliableDelivery;
  }
}
