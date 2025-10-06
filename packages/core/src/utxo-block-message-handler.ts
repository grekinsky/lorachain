/**
 * UTXO Block Message Handler
 *
 * Handles block-related network messages for the UTXO blockchain:
 * - BLOCK_ANNOUNCEMENT: New block announcements from peers
 * - BLOCK_REQUEST: Requests for specific blocks
 * - BLOCK_RESPONSE: Responses containing requested blocks
 *
 * DESIGN NOTES:
 * - UTXO-only design with no backwards compatibility
 * - Priority 20 for critical block propagation
 * - Integrates with UTXOSyncManager for synchronization
 * - Validates blocks before adding to blockchain
 * - Tracks pending requests to prevent unsolicited responses
 *
 * @module utxo-block-message-handler
 */

import { BaseBlockchainMessageHandler } from './base-blockchain-message-handler.js';
import { BlockchainMessageType } from './blockchain-message-types.js';
import type { CryptographicService } from './cryptographic.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
} from './blockchain-message-interfaces.js';
import type {
  BlockAnnouncementPayload,
  BlockRequestPayload,
  BlockResponsePayload,
} from './blockchain-message-payloads.js';
import type { Block } from './types.js';

/**
 * Handler for UTXO block messages
 *
 * Processes block announcements, requests, and responses in the UTXO blockchain network.
 * Manages block propagation, validation, and synchronization.
 *
 * WORKFLOW:
 * 1. Block Announcement: Check if block is next in chain, request if needed
 * 2. Block Request: Find requested block and send response
 * 3. Block Response: Validate and add block to blockchain
 *
 * @example
 * ```typescript
 * const handler = new UTXOBlockMessageHandler(cryptoService, 20);
 * router.registerHandler(handler);
 * ```
 */
export class UTXOBlockMessageHandler extends BaseBlockchainMessageHandler {
  /**
   * Pending block requests tracking
   * Maps request ID to timestamp for validation
   */
  private pendingBlockRequests: Map<string, number> = new Map();

  /**
   * Create a new UTXO block message handler
   *
   * @param cryptoService - Cryptographic service for signature operations
   * @param priority - Handler priority (default: 20 for critical block propagation)
   */
  constructor(cryptoService: CryptographicService, priority: number = 20) {
    super(priority, cryptoService);
  }

  /**
   * Determine if this handler can process the given message type
   *
   * @param messageType - The blockchain message type to check
   * @returns True if this handler can process the message type
   */
  canHandle(messageType: BlockchainMessageType): boolean {
    return [
      BlockchainMessageType.BLOCK_ANNOUNCEMENT,
      BlockchainMessageType.BLOCK_REQUEST,
      BlockchainMessageType.BLOCK_RESPONSE,
    ].includes(messageType);
  }

  /**
   * Process a blockchain network message
   *
   * Routes to specific handler based on message type:
   * - BLOCK_ANNOUNCEMENT → handleBlockAnnouncement()
   * - BLOCK_REQUEST → handleBlockRequest()
   * - BLOCK_RESPONSE → handleBlockResponse()
   *
   * @param message - The blockchain network message
   * @param context - The blockchain message context
   * @returns Message response indicating processing result
   */
  async handle(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    // Validate basic message structure
    const validation = this.validateBasicMessage(message);
    if (!validation.isValid) {
      return this.createResponse(
        false,
        undefined,
        validation.errors.join(', ')
      );
    }

    // Route to specific handler based on message type
    switch (message.type) {
      case BlockchainMessageType.BLOCK_ANNOUNCEMENT:
        return this.handleBlockAnnouncement(message, context);
      case BlockchainMessageType.BLOCK_REQUEST:
        return this.handleBlockRequest(message, context);
      case BlockchainMessageType.BLOCK_RESPONSE:
        return this.handleBlockResponse(message, context);
      default:
        return this.createResponse(
          false,
          undefined,
          `Unsupported message type: ${message.type}`
        );
    }
  }

  /**
   * Handle block announcement messages
   *
   * When a peer announces a new block:
   * 1. Check if we already have this block
   * 2. If block is next in chain, request it
   * 3. If block is ahead, trigger sync
   *
   * @param message - The block announcement message
   * @param context - The blockchain message context
   * @returns Message response with optional block request
   */
  private async handleBlockAnnouncement(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as BlockAnnouncementPayload;

      this.logger.info(
        `Received block announcement: height=${payload.blockHeight}, hash=${payload.blockHash}`
      );

      // Check if we already have this block
      const existingBlock = context.blockchain
        .getBlocks()
        .find((b: Block) => b.hash === payload.blockHash);

      if (existingBlock) {
        this.logger.debug(
          `Block ${payload.blockHash} already exists, skipping`
        );
        return this.createResponse(true);
      }

      // Check if block is next in chain
      const currentHeight = context.blockchain.getLatestBlock().index;
      if (payload.blockHeight === currentHeight + 1) {
        // Request the block
        this.logger.info(
          `Requesting block ${payload.blockHash} at height ${payload.blockHeight}`
        );

        const requestId = `block_req_${Date.now()}`;
        this.pendingBlockRequests.set(requestId, Date.now());

        const blockRequest: BlockchainNetworkMessage = {
          type: BlockchainMessageType.BLOCK_REQUEST,
          payload: {
            data: {
              blockHash: payload.blockHash,
              requestId,
            } as BlockRequestPayload,
            version: message.payload.version,
            timestamp: Date.now(),
          },
          metadata: {
            receivedAt: Date.now(),
            source: message.metadata.source,
            hopCount: 0,
            signature: '', // Will be signed by protocol
            nonce: `nonce_${Date.now()}`,
          },
        };

        return this.createResponse(true, blockRequest, undefined);
      } else if (payload.blockHeight > currentHeight + 1) {
        // Block is ahead, trigger sync
        this.logger.info(
          `Block height ${payload.blockHeight} is ahead, triggering sync`
        );

        // Delegate to sync manager
        await context.syncManager.startSync();
      }

      return this.createResponse(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling block announcement:', {
        error: errorMessage,
      });
      return this.createResponse(false, undefined, errorMessage);
    }
  }

  /**
   * Handle block request messages
   *
   * When a peer requests a block:
   * 1. Find the requested block (by hash or height)
   * 2. Create and send block response
   *
   * @param message - The block request message
   * @param context - The blockchain message context
   * @returns Message response with block data
   */
  private async handleBlockRequest(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as BlockRequestPayload;

      this.logger.info(
        `Received block request: hash=${payload.blockHash}, height=${payload.blockHeight}`
      );

      // Find requested block
      let block;
      if (payload.blockHash) {
        block = context.blockchain
          .getBlocks()
          .find((b: Block) => b.hash === payload.blockHash);
      } else if (payload.blockHeight !== undefined) {
        block = context.blockchain
          .getBlocks()
          .find((b: Block) => b.index === payload.blockHeight);
      }

      if (!block) {
        return this.createResponse(
          false,
          undefined,
          'Requested block not found'
        );
      }

      // Create block response
      const blockResponse: BlockchainNetworkMessage = {
        type: BlockchainMessageType.BLOCK_RESPONSE,
        payload: {
          data: {
            block,
            requestId: payload.requestId,
          } as BlockResponsePayload,
          version: message.payload.version,
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: message.metadata.source,
          hopCount: 0,
          signature: '', // Will be signed by protocol
          nonce: `nonce_${Date.now()}`,
        },
      };

      this.logger.info(`Sending block response for ${block.hash}`);
      return this.createResponse(true, blockResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling block request:', {
        error: errorMessage,
      });
      return this.createResponse(false, undefined, errorMessage);
    }
  }

  /**
   * Handle block response messages
   *
   * When receiving a block response:
   * 1. Verify this was a pending request
   * 2. Validate the block
   * 3. Add block to blockchain
   *
   * @param message - The block response message
   * @param context - The blockchain message context
   * @returns Message response indicating processing result
   */
  private async handleBlockResponse(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as BlockResponsePayload;

      this.logger.info(
        `Received block response: hash=${payload.block.hash}, requestId=${payload.requestId}`
      );

      // Verify this was a pending request
      if (!this.pendingBlockRequests.has(payload.requestId)) {
        this.logger.warn(
          `Received unsolicited block response: ${payload.requestId}`
        );
        return this.createResponse(false, undefined, 'Unsolicited response');
      }

      // Remove from pending
      this.pendingBlockRequests.delete(payload.requestId);

      // Validate block
      const isValid = await context.blockchain.validateChain();

      if (!isValid) {
        this.logger.warn(`Invalid block received: ${payload.block.hash}`);
        return this.createResponse(false, undefined, 'Invalid block');
      }

      // Add block to blockchain
      context.blockchain.addBlock(payload.block);
      this.logger.info(`Block ${payload.block.hash} added to blockchain`);

      // Forward to peers
      return this.createResponse(true, undefined, undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling block response:', {
        error: errorMessage,
      });
      return this.createResponse(false, undefined, errorMessage);
    }
  }
}
