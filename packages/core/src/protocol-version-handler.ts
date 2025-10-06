/**
 * Protocol Version Handler
 *
 * This module implements the ProtocolVersionHandler for negotiating protocol versions
 * with peers during connection establishment. Enforces modern protocol requirements
 * with NO BACKWARDS COMPATIBILITY as per project requirements.
 *
 * DESIGN NOTES:
 * - Only version 1.0.0 is supported (no backwards compatibility)
 * - Required features: UTXO-only and cryptographic signing
 * - Feature intersection determines agreed capabilities
 * - Graceful disconnection for incompatible peers
 * - Highest priority handler (priority 30)
 *
 * @module protocol-version-handler
 */

import { Logger } from '@lorachain/shared';
import { BaseBlockchainMessageHandler } from './base-blockchain-message-handler.js';
import { BlockchainMessageType } from './blockchain-message-types.js';
import type { CryptographicService } from './cryptographic.js';
import type {
  BlockchainNetworkMessage,
  BlockchainMessageContext,
  MessageResponse,
} from './blockchain-message-interfaces.js';
import type {
  VersionNegotiationPayload,
  ProtocolFeatureFlags,
  VersionNegotiationResult,
} from './blockchain-message-payloads.js';

/**
 * Protocol Version Handler
 *
 * Handles VERSION_NEGOTIATION messages to establish protocol compatibility
 * between peers. Validates required features, negotiates version, and
 * stores agreed capabilities in PeerManager.
 *
 * BREAKING CHANGE: No backwards compatibility - only version 1.0.0 supported.
 *
 * @example
 * ```typescript
 * const handler = new ProtocolVersionHandler(
 *   cryptoService,
 *   {
 *     supportsUTXOOnly: true,
 *     supportsCompression: true,
 *     supportsFragmentation: true,
 *     supportsCryptographicSigning: true,
 *     supportsMeshRouting: true,
 *     supportsHybridNetworking: true,
 *   },
 *   30 // Highest priority
 * );
 *
 * const response = await handler.handle(versionMessage, context);
 * ```
 */
export class ProtocolVersionHandler extends BaseBlockchainMessageHandler {
  /**
   * Current protocol version (no backwards compatibility)
   */
  private readonly CURRENT_VERSION = '1.0.0';

  /**
   * Minimum required version (must match current version)
   */
  private readonly MIN_REQUIRED_VERSION = '1.0.0';

  /**
   * Supported versions (only current version)
   */
  private readonly SUPPORTED_VERSIONS = ['1.0.0'];

  /**
   * Required feature flags that all peers must support
   */
  private requiredFeatureFlags: ProtocolFeatureFlags = {
    supportsUTXOOnly: true, // Required
    supportsCompression: false,
    supportsFragmentation: false,
    supportsCryptographicSigning: true, // Required
    supportsMeshRouting: false,
    supportsHybridNetworking: false,
  };

  /**
   * Local node's feature flags
   */
  private localFeatureFlags: ProtocolFeatureFlags;

  /**
   * Create a new protocol version handler
   *
   * @param cryptoService - Cryptographic service for signature verification
   * @param localFeatureFlags - Feature flags supported by this node
   * @param priority - Handler priority (default: 30 for highest priority)
   * @throws Error if local features don't meet requirements
   */
  constructor(
    cryptoService: CryptographicService,
    localFeatureFlags: ProtocolFeatureFlags,
    priority: number = 30
  ) {
    super(priority, cryptoService);
    this.localFeatureFlags = localFeatureFlags;
    this.validateLocalFeatures();
  }

  /**
   * Determine if this handler can process the given message type
   *
   * @param messageType - The blockchain message type
   * @returns True if this handler can process VERSION_NEGOTIATION messages
   */
  canHandle(messageType: BlockchainMessageType): boolean {
    return messageType === BlockchainMessageType.VERSION_NEGOTIATION;
  }

  /**
   * Process a version negotiation message
   *
   * @param message - The blockchain network message
   * @param context - The message processing context
   * @returns Message response with success status and optional response message
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

    return this.handleVersionNegotiation(message, context);
  }

  /**
   * Handle version negotiation logic
   *
   * Validates required features, negotiates version, determines agreed features,
   * and updates peer version in PeerManager.
   *
   * @param message - The version negotiation message
   * @param context - The message processing context
   * @returns Message response with negotiation result
   */
  private async handleVersionNegotiation(
    message: BlockchainNetworkMessage,
    context: BlockchainMessageContext
  ): Promise<MessageResponse> {
    try {
      const payload = message.payload.data as VersionNegotiationPayload;

      this.logger.info(
        `Received version negotiation from peer ${payload.nodeId}: ` +
          `versions=${payload.supportedVersions.join(', ')}, ` +
          `current=${payload.currentVersion}`
      );

      // Validate required features
      const featureValidation = this.validateRequiredFeatures(
        payload.featureFlags
      );
      if (!featureValidation.isValid) {
        this.logger.warn(
          `Peer ${payload.nodeId} missing required features: ${featureValidation.error}`
        );

        // Reject connection - incompatible features
        await context.peers.rejectPeer(
          payload.nodeId,
          featureValidation.error!
        );

        return this.createResponse(
          false,
          undefined,
          `Incompatible features: ${featureValidation.error}`
        );
      }

      // Negotiate version (no backwards compatibility)
      const negotiationResult = this.negotiateVersion(
        payload.supportedVersions,
        payload.currentVersion
      );

      if (!negotiationResult.success) {
        this.logger.warn(
          `Version negotiation failed with peer ${payload.nodeId}: ${negotiationResult.error}`
        );

        // Reject connection - incompatible version
        await context.peers.rejectPeer(
          payload.nodeId,
          negotiationResult.error!
        );

        return this.createResponse(
          false,
          undefined,
          `Version negotiation failed: ${negotiationResult.error}`
        );
      }

      // Determine agreed features (intersection of capabilities)
      const agreedFeatures = this.determineAgreedFeatures(payload.featureFlags);

      // Store negotiated version and features in peer manager
      await context.peers.updatePeerVersion(payload.nodeId, {
        version: negotiationResult.negotiatedVersion,
        features: agreedFeatures,
      });

      this.logger.info(
        `Version negotiation successful with peer ${payload.nodeId}: ` +
          `version=${negotiationResult.negotiatedVersion}`
      );

      // Send our version info back (if this was initial request)
      const responseMessage: BlockchainNetworkMessage = {
        type: BlockchainMessageType.VERSION_NEGOTIATION,
        payload: {
          data: {
            nodeId: context.peers.getLocalNodeId(),
            supportedVersions: this.SUPPORTED_VERSIONS,
            currentVersion: this.CURRENT_VERSION,
            minRequiredVersion: this.MIN_REQUIRED_VERSION,
            featureFlags: this.localFeatureFlags,
            timestamp: Date.now(),
          } as VersionNegotiationPayload,
          version: message.payload.version,
          timestamp: Date.now(),
        },
        metadata: {
          receivedAt: Date.now(),
          source: message.metadata.source,
          hopCount: 0,
          signature: '',
          nonce: `nonce_${Date.now()}`,
        },
      };

      return this.createResponse(true, responseMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling version negotiation:', {
        error: errorMessage,
      });
      return this.createResponse(false, undefined, errorMessage);
    }
  }

  /**
   * Negotiate protocol version between peers
   *
   * NO BACKWARDS COMPATIBILITY - only accepts current version (1.0.0).
   *
   * @param peerVersions - List of versions supported by peer
   * @param peerCurrentVersion - Peer's current version
   * @returns Negotiation result with agreed version or error
   */
  private negotiateVersion(
    peerVersions: string[],
    peerCurrentVersion: string
  ): VersionNegotiationResult {
    // NO BACKWARDS COMPATIBILITY - only accept current version
    const commonVersion = peerVersions.find(v =>
      this.SUPPORTED_VERSIONS.includes(v)
    );

    if (!commonVersion) {
      return {
        success: false,
        negotiatedVersion: '',
        agreedFeatures: {} as ProtocolFeatureFlags,
        error: `No compatible version found. Peer versions: ${peerVersions.join(', ')}, Required: ${this.CURRENT_VERSION}`,
      };
    }

    // Verify minimum version requirement
    if (!this.meetsMinimumVersion(peerCurrentVersion)) {
      return {
        success: false,
        negotiatedVersion: '',
        agreedFeatures: {} as ProtocolFeatureFlags,
        error: `Peer version ${peerCurrentVersion} does not meet minimum requirement ${this.MIN_REQUIRED_VERSION}`,
      };
    }

    return {
      success: true,
      negotiatedVersion: commonVersion,
      agreedFeatures: this.localFeatureFlags,
    };
  }

  /**
   * Check if peer version meets minimum requirement
   *
   * Uses semantic versioning comparison (major.minor.patch).
   *
   * @param version - Peer's version string
   * @returns True if version meets minimum requirement
   */
  private meetsMinimumVersion(version: string): boolean {
    // Simple version comparison (assumes semantic versioning)
    const parseVersion = (v: string): number[] =>
      v.split('.').map(n => parseInt(n, 10));

    const peerParts = parseVersion(version);
    const minParts = parseVersion(this.MIN_REQUIRED_VERSION);

    for (let i = 0; i < Math.max(peerParts.length, minParts.length); i++) {
      const peer = peerParts[i] || 0;
      const min = minParts[i] || 0;

      if (peer > min) return true;
      if (peer < min) return false;
    }

    return true; // Versions are equal
  }

  /**
   * Validate that peer supports required features
   *
   * Required features:
   * - supportsUTXOOnly (must be true)
   * - supportsCryptographicSigning (must be true)
   *
   * @param peerFeatures - Peer's feature flags
   * @returns Validation result with error message if invalid
   */
  private validateRequiredFeatures(peerFeatures: ProtocolFeatureFlags): {
    isValid: boolean;
    error?: string;
  } {
    // Check UTXO-only requirement
    if (!peerFeatures.supportsUTXOOnly) {
      return {
        isValid: false,
        error:
          'Peer must support UTXO-only transactions (no backwards compatibility)',
      };
    }

    // Check cryptographic signing requirement
    if (!peerFeatures.supportsCryptographicSigning) {
      return {
        isValid: false,
        error: 'Peer must support cryptographic signing',
      };
    }

    return { isValid: true };
  }

  /**
   * Determine agreed features between local and peer
   *
   * Returns intersection of capabilities (except required features which are always true).
   *
   * @param peerFeatures - Peer's feature flags
   * @returns Agreed feature flags
   */
  private determineAgreedFeatures(
    peerFeatures: ProtocolFeatureFlags
  ): ProtocolFeatureFlags {
    // Intersection of local and peer features (except required ones)
    return {
      supportsUTXOOnly: true, // Always required
      supportsCompression:
        this.localFeatureFlags.supportsCompression &&
        peerFeatures.supportsCompression,
      supportsFragmentation:
        this.localFeatureFlags.supportsFragmentation &&
        peerFeatures.supportsFragmentation,
      supportsCryptographicSigning: true, // Always required
      supportsMeshRouting:
        this.localFeatureFlags.supportsMeshRouting &&
        peerFeatures.supportsMeshRouting,
      supportsHybridNetworking:
        this.localFeatureFlags.supportsHybridNetworking &&
        peerFeatures.supportsHybridNetworking,
    };
  }

  /**
   * Validate local feature flags
   *
   * Ensures local node meets minimum requirements:
   * - supportsUTXOOnly must be true
   * - supportsCryptographicSigning must be true
   *
   * @throws Error if local features don't meet requirements
   */
  private validateLocalFeatures(): void {
    // Ensure local features meet requirements
    if (!this.localFeatureFlags.supportsUTXOOnly) {
      throw new Error('Local node must support UTXO-only transactions');
    }

    if (!this.localFeatureFlags.supportsCryptographicSigning) {
      throw new Error('Local node must support cryptographic signing');
    }

    this.logger.info(
      `Protocol version handler initialized: version=${this.CURRENT_VERSION}, ` +
        `features=${JSON.stringify(this.localFeatureFlags)}`
    );
  }

  /**
   * Get current protocol version
   *
   * @returns Current protocol version string
   */
  getCurrentVersion(): string {
    return this.CURRENT_VERSION;
  }

  /**
   * Get list of supported protocol versions
   *
   * @returns Array of supported version strings
   */
  getSupportedVersions(): string[] {
    return [...this.SUPPORTED_VERSIONS];
  }

  /**
   * Get local feature flags
   *
   * @returns Copy of local feature flags
   */
  getLocalFeatureFlags(): ProtocolFeatureFlags {
    return { ...this.localFeatureFlags };
  }
}
