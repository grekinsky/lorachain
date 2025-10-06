/**
 * Peer Handshake Message Handler
 *
 * Implements three-way handshake protocol for peer authentication and capability exchange.
 * Supports cryptographic challenge-response authentication using ECDSA/Ed25519 signatures.
 *
 * HANDSHAKE FLOW:
 * 1. INIT: Initiator sends nodeId, publicKey, capabilities, and challenge
 * 2. RESPONSE: Responder signs challenge, sends capabilities, and new challenge
 * 3. ACK: Initiator signs responder's challenge, completing authentication
 *
 * DESIGN NOTES:
 * - UTXO-only design with no backwards compatibility
 * - Priority 25 (highest) for connection establishment
 * - 30-second timeout for incomplete handshakes
 * - Supports both ECDSA (secp256k1) and Ed25519 algorithms
 * - Integrates with PeerManager for peer registration
 *
 * @module peer-handshake-message-handler
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
  PeerHandshakeInitPayload,
  PeerHandshakeResponsePayload,
  PeerHandshakeAckPayload,
  PeerNodeCapabilities,
} from './blockchain-message-payloads.js';

/**
 * Pending handshake tracking structure
 *
 * Stores state for handshakes in progress to enable timeout detection
 * and challenge validation.
 */
interface PendingHandshake {
  /**
   * Challenge issued to the peer (hex string)
   */
  challenge: string;

  /**
   * Timestamp when handshake was initiated (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Peer ID for this handshake
   */
  peerId: string;

  /**
   * Peer's public key for signature verification
   */
  publicKey: string;

  /**
   * Peer's capabilities received during handshake
   */
  capabilities: PeerNodeCapabilities;

  /**
   * Protocol version being used
   */
  protocolVersion: string;
}

/**
 * Peer Handshake Message Handler
 *
 * Handles peer authentication via three-way handshake protocol.
 * Implements cryptographic challenge-response authentication and
 * capability exchange for secure peer connections.
 */
export class PeerHandshakeMessageHandler extends BaseBlockchainMessageHandler {
  /**
   * Map of pending handshakes by peer ID
   */
  private pendingHandshakes: Map<string, PendingHandshake> = new Map();

  /**
   * Handshake timeout duration (30 seconds)
   */
  private handshakeTimeout: number = 30000;

  /**
   * Local node capabilities to advertise
   */
  private nodeCapabilities: PeerNodeCapabilities;

  /**
   * Cleanup interval timer
   */
  private cleanupTimer?: ReturnType<typeof setInterval>;

  /**
   * Create a new peer handshake message handler
   *
   * @param cryptoService - Cryptographic service for signature operations
   * @param nodeCapabilities - Local node's capabilities to advertise
   * @param priority - Handler priority (default: 25, highest)
   */
  constructor(
    cryptoService: CryptographicService,
    nodeCapabilities: PeerNodeCapabilities,
    priority: number = 25
  ) {
    super(priority, cryptoService);
    this.nodeCapabilities = nodeCapabilities;
    this.startHandshakeCleanup();
  }

  /**
   * Determine if this handler can process the given message type
   *
   * @param messageType - The blockchain message type
   * @returns True if this handler can process the message
   */
  canHandle(messageType: BlockchainMessageType): boolean {
    return [
      BlockchainMessageType.PEER_HANDSHAKE_INIT,
      BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
      BlockchainMessageType.PEER_HANDSHAKE_ACK,
    ].includes(messageType);
  }

  /**
   * Process a peer handshake message
   *
   * Routes to appropriate handler based on message type:
   * - INIT: First handshake message from initiator
   * - RESPONSE: Second handshake message from responder
   * - ACK: Third and final handshake message from initiator
   *
   * @param message - The blockchain network message
   * @param context - Message processing context
   * @returns Message response with optional response message
   */
  async handle(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    const validation = this.validateBasicMessage(message);
    if (!validation.isValid) {
      return this.createResponse(
        false,
        undefined,
        validation.errors.join(', ')
      );
    }

    switch (message.type) {
      case BlockchainMessageType.PEER_HANDSHAKE_INIT:
        return this.handleHandshakeInit(message, context);
      case BlockchainMessageType.PEER_HANDSHAKE_RESPONSE:
        return this.handleHandshakeResponse(message, context);
      case BlockchainMessageType.PEER_HANDSHAKE_ACK:
        return this.handleHandshakeAck(message, context);
      default:
        return this.createResponse(
          false,
          undefined,
          `Unsupported message type: ${message.type}`
        );
    }
  }

  /**
   * Handle PEER_HANDSHAKE_INIT message
   *
   * First step in three-way handshake:
   * 1. Verify challenge signature from initiator
   * 2. Generate our challenge for authentication
   * 3. Sign initiator's challenge as proof
   * 4. Send RESPONSE with capabilities and our challenge
   *
   * @param message - Handshake init message
   * @param context - Message processing context
   * @returns Response with PEER_HANDSHAKE_RESPONSE message
   */
  private async handleHandshakeInit(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as PeerHandshakeInitPayload;

      this.logger.info(`Received handshake init from peer ${payload.nodeId}`, {
        isFullNode: payload.capabilities.isFullNode,
        networkType: payload.capabilities.networkType,
        protocolVersion: payload.protocolVersion,
      });

      // Verify the message signature to ensure initiator owns their public key
      const isSignatureValid = await this.verifyMessageSignature(
        payload.challenge,
        message.metadata.signature,
        payload.nodeId
      );

      if (!isSignatureValid) {
        this.logger.warn(`Invalid signature from ${payload.nodeId}`);
        return this.createResponse(false, undefined, 'Invalid signature');
      }

      // Generate our challenge for the initiator
      const ourChallenge = this.generateChallenge();

      // Sign the received challenge as response
      const challengeResponse = await this.signChallenge(
        payload.challenge,
        context
      );

      // Store pending handshake for ACK verification
      this.pendingHandshakes.set(payload.nodeId, {
        challenge: ourChallenge,
        timestamp: Date.now(),
        peerId: payload.nodeId,
        publicKey: payload.publicKey,
        capabilities: payload.capabilities,
        protocolVersion: payload.protocolVersion,
      });

      // Resume cleanup timer if it was paused
      this.resumeCleanup();

      // Get local node information
      const localNodeId = this.getLocalNodeId(context);
      const localPublicKey = await this.getLocalPublicKey(context);

      // Create handshake response
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_RESPONSE,
        payload: {
          data: {
            nodeId: localNodeId,
            publicKey: localPublicKey,
            capabilities: this.nodeCapabilities,
            protocolVersion: message.payload.version,
            challengeResponse,
            challenge: ourChallenge,
            timestamp: Date.now(),
          } as PeerHandshakeResponsePayload,
          version: message.payload.version,
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: localNodeId,
          hopCount: 0,
          signature: '',
          nonce: crypto.randomUUID(),
        },
      };

      this.logger.info(`Sending handshake response to peer ${payload.nodeId}`);
      return this.createResponse(true, responseMessage);
    } catch (error) {
      this.logger.error('Error handling handshake init:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createResponse(false, undefined, String(error));
    }
  }

  /**
   * Handle PEER_HANDSHAKE_RESPONSE message
   *
   * Second step in three-way handshake:
   * 1. Verify our challenge was correctly signed
   * 2. Sign responder's challenge as proof
   * 3. Add peer to peer manager with capabilities
   * 4. Send ACK to complete handshake
   *
   * @param message - Handshake response message
   * @param context - Message processing context
   * @returns Response with PEER_HANDSHAKE_ACK message
   */
  private async handleHandshakeResponse(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as PeerHandshakeResponsePayload;

      this.logger.info(
        `Received handshake response from peer ${payload.nodeId}`,
        {
          isFullNode: payload.capabilities.isFullNode,
          networkType: payload.capabilities.networkType,
        }
      );

      // Verify our challenge was correctly signed
      const pending = this.pendingHandshakes.get(payload.nodeId);
      if (!pending) {
        this.logger.warn(`No pending handshake for peer ${payload.nodeId}`);
        return this.createResponse(false, undefined, 'No pending handshake');
      }

      const isChallengeResponseValid = await this.verifyMessageSignature(
        pending.challenge,
        payload.challengeResponse,
        payload.nodeId
      );

      if (!isChallengeResponseValid) {
        this.logger.warn(
          `Invalid challenge response from peer ${payload.nodeId}`
        );
        this.pendingHandshakes.delete(payload.nodeId);
        return this.createResponse(
          false,
          undefined,
          'Invalid challenge response'
        );
      }

      // Sign the received challenge
      const challengeResponse = await this.signChallenge(
        payload.challenge,
        context
      );

      // Add peer to peer manager with capabilities
      const peerRegistrationData = this.createPeerRegistrationData(
        payload.nodeId,
        message.metadata.source,
        payload.publicKey,
        payload.capabilities,
        payload.protocolVersion
      );
      const peerAdded = context.peers.addPeer(peerRegistrationData);

      if (!peerAdded) {
        this.logger.warn(`Failed to add peer ${payload.nodeId}`);
        this.pendingHandshakes.delete(payload.nodeId);
        return this.createResponse(false, undefined, 'Failed to add peer');
      }

      // Get local node information
      const localNodeId = this.getLocalNodeId(context);

      // Create handshake ACK
      const ackMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.PEER_HANDSHAKE_ACK,
        payload: {
          data: {
            nodeId: localNodeId,
            challengeResponse,
            connectionEstablished: true,
            timestamp: Date.now(),
          } as PeerHandshakeAckPayload,
          version: message.payload.version,
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: localNodeId,
          hopCount: 0,
          signature: '',
          nonce: crypto.randomUUID(),
        },
      };

      // Update pending handshake with peer info for ACK verification
      this.pendingHandshakes.set(payload.nodeId, {
        ...pending,
        challenge: payload.challenge,
        publicKey: payload.publicKey,
        capabilities: payload.capabilities,
        protocolVersion: payload.protocolVersion,
      });

      // Resume cleanup timer if it was paused
      this.resumeCleanup();

      this.logger.info(
        `Handshake completed with peer ${payload.nodeId}, sending ACK`
      );
      return this.createResponse(true, ackMessage);
    } catch (error) {
      this.logger.error('Error handling handshake response:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createResponse(false, undefined, String(error));
    }
  }

  /**
   * Handle PEER_HANDSHAKE_ACK message
   *
   * Third and final step in three-way handshake:
   * 1. Verify our challenge was correctly signed
   * 2. Update peer status to connected
   * 3. Clean up pending handshake
   *
   * @param message - Handshake ACK message
   * @param context - Message processing context
   * @returns Success response
   */
  private async handleHandshakeAck(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as PeerHandshakeAckPayload;

      this.logger.info(`Received handshake ACK from peer ${payload.nodeId}`);

      // Verify our challenge was correctly signed
      const pending = this.pendingHandshakes.get(payload.nodeId);
      if (!pending) {
        this.logger.warn(`No pending handshake for peer ${payload.nodeId}`);
        return this.createResponse(false, undefined, 'No pending handshake');
      }

      const isChallengeResponseValid = await this.verifyMessageSignature(
        pending.challenge,
        payload.challengeResponse,
        payload.nodeId
      );

      if (!isChallengeResponseValid) {
        this.logger.warn(
          `Invalid challenge response in ACK from peer ${payload.nodeId}`
        );
        this.pendingHandshakes.delete(payload.nodeId);
        return this.createResponse(
          false,
          undefined,
          'Invalid challenge response'
        );
      }

      // Update peer connection state to connected
      const peer = context.peers.getPeer(payload.nodeId);
      if (peer) {
        context.peers.updatePeerConnectionState(payload.nodeId, 'connected');
        this.logger.info(
          `Peer ${payload.nodeId} connection state updated to connected`
        );
      }

      // Clean up pending handshake
      this.pendingHandshakes.delete(payload.nodeId);

      this.logger.info(`Handshake fully completed with peer ${payload.nodeId}`);
      return this.createResponse(true);
    } catch (error) {
      this.logger.error('Error handling handshake ACK:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createResponse(false, undefined, String(error));
    }
  }

  /**
   * Create peer registration data from handshake information
   *
   * Centralizes peer registration data creation to ensure consistency
   * and avoid code duplication.
   *
   * @param nodeId - Peer's node ID
   * @param address - Peer's network address
   * @param publicKey - Peer's public key
   * @param capabilities - Peer's capabilities
   * @param protocolVersion - Protocol version
   * @returns Peer registration data object
   */
  private createPeerRegistrationData(
    nodeId: string,
    address: string,
    publicKey: string,
    capabilities: PeerNodeCapabilities,
    protocolVersion: string
  ): {
    id: string;
    address: string;
    port: number;
    type: 'full' | 'light';
    isOnline: boolean;
    lastSeen: number;
    publicKey: string;
    capabilities: string[];
    protocolVersion: string;
    connectionState: 'connecting' | 'connected' | 'disconnected';
    connectionAttempts: number;
    lastConnectionAttempt: number;
    latency: number;
    packetLoss: number;
    reputation: number;
    score: number;
    reliability: number;
    messagesReceived: number;
    messagesSent: number;
    blocksPropagated: number;
    transactionsPropagated: number;
    invalidMessages: number;
    isBanned: boolean;
    discoveryMethod:
      | 'manual'
      | 'dns'
      | 'peer_exchange'
      | 'mdns'
      | 'mesh_announce';
    discoveredAt: number;
  } {
    return {
      id: nodeId,
      address,
      port: capabilities.listeningPort,
      type: capabilities.isFullNode ? 'full' : 'light',
      isOnline: true,
      lastSeen: Date.now(),
      publicKey,
      capabilities: capabilities.compressionAlgorithms,
      protocolVersion,
      connectionState: 'connecting',
      connectionAttempts: 0,
      lastConnectionAttempt: Date.now(),
      latency: 0,
      packetLoss: 0,
      reputation: 50, // Initial reputation
      score: 50,
      reliability: 0.5,
      messagesReceived: 1,
      messagesSent: 0,
      blocksPropagated: 0,
      transactionsPropagated: 0,
      invalidMessages: 0,
      isBanned: false,
      discoveryMethod: 'peer_exchange',
      discoveredAt: Date.now(),
    };
  }

  /**
   * Generate random challenge for authentication
   *
   * Creates a 32-byte random hex string for challenge-response authentication.
   *
   * @returns Hex-encoded challenge string
   */
  private generateChallenge(): string {
    const buffer = new Uint8Array(32);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Sign challenge with local private key
   *
   * Note: In production, this would need access to the local node's key pair.
   * Currently uses a simplified approach assuming the context provides access.
   *
   * @param challenge - Challenge string to sign
   * @param context - Message processing context
   * @returns Signature as hex string
   */
  private async signChallenge(
    challenge: string,
    _context: BlockchainMessageContext
  ): Promise<string> {
    // For now, use signMessage from crypto service
    // In production, this would need to access the local node's private key
    // This could be done via PeerManager or a dedicated key management service
    const signature = await this.cryptoService.signMessage(challenge);
    return signature;
  }

  /**
   * Verify challenge signature
   *
   * Uses the cryptographic service's verifySignature method.
   * Note: The current CryptographicService.verifySignature takes (signature, message, nodeId)
   *
   * @param challenge - Original challenge string
   * @param signature - Signature to verify
   * @param nodeId - Node ID for verification (used as identifier)
   * @returns True if signature is valid
   */
  private async verifyMessageSignature(
    challenge: string,
    signature: string,
    nodeId: string
  ): Promise<boolean> {
    try {
      const isValid = await this.cryptoService.verifySignature(
        signature,
        challenge,
        nodeId
      );
      return isValid;
    } catch (error) {
      this.logger.error('Challenge signature verification error:', {
        error: String(error),
        nodeId,
      });
      return false;
    }
  }

  /**
   * Get local node ID from context
   *
   * Helper method to extract local node identifier.
   *
   * @param _context - Message processing context
   * @returns Local node ID
   */
  private getLocalNodeId(_context: BlockchainMessageContext): string {
    // In production, this would come from PeerManager or node configuration
    // For now, return a placeholder
    return 'local_node_' + Date.now();
  }

  /**
   * Get local public key from context
   *
   * Helper method to extract local node's public key.
   *
   * @param _context - Message processing context
   * @returns Local public key as hex string
   */
  private async getLocalPublicKey(
    _context: BlockchainMessageContext
  ): Promise<string> {
    // In production, this would come from PeerManager or key management service
    // For now, return a placeholder
    return 'local_pubkey_placeholder';
  }

  /**
   * Start periodic cleanup of expired handshakes
   *
   * Runs every 10 seconds to remove handshakes that have exceeded the timeout.
   * Automatically pauses when no handshakes are pending to conserve resources.
   */
  private startHandshakeCleanup(): void {
    // Only start if not already running
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();

        for (const [peerId, handshake] of this.pendingHandshakes.entries()) {
          if (now - handshake.timestamp > this.handshakeTimeout) {
            this.logger.warn(`Handshake timeout for peer ${peerId}`, {
              elapsed: now - handshake.timestamp,
              timeout: this.handshakeTimeout,
            });
            this.pendingHandshakes.delete(peerId);
          }
        }

        // Pause cleanup if no pending handshakes
        if (this.pendingHandshakes.size === 0) {
          this.pauseCleanup();
          this.logger.debug('Paused handshake cleanup - no pending handshakes');
        }
      }, 10000); // Check every 10 seconds
    }
  }

  /**
   * Pause handshake cleanup timer
   *
   * Pauses the cleanup timer when no handshakes are pending to conserve resources.
   * Timer will be resumed automatically when new handshakes are added.
   */
  private pauseCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Resume handshake cleanup timer
   *
   * Resumes the cleanup timer when new handshakes are added.
   * Safe to call multiple times - will not create duplicate timers.
   */
  private resumeCleanup(): void {
    if (!this.cleanupTimer && this.pendingHandshakes.size > 0) {
      this.startHandshakeCleanup();
    }
  }

  /**
   * Stop handshake cleanup timer
   *
   * Should be called when handler is being destroyed.
   * Public method to allow external cleanup.
   */
  public stopCleanup(): void {
    this.pauseCleanup();
  }
}
