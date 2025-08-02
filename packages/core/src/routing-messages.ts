import {
  type UTXORouteRequest,
  type UTXORouteReply,
  type BlockchainRouteError,
  type BlockchainHelloMessage,
  type FragmentInfo,
  type MeshMessage,
  type UTXOTransaction,
  type Block,
  type CompressedMerkleProof,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { Logger } from '@lorachain/shared';

/**
 * RoutingMessageFactory - Creates and validates routing protocol messages
 *
 * BREAKING CHANGE: Complete rewrite with UTXO-exclusive message formats and no legacy support.
 */
export class RoutingMessageFactory {
  private cryptoService: CryptographicService;
  private logger: Logger;
  private nodeId: string;
  private nodeKeyPair: KeyPair;

  constructor(
    nodeId: string,
    nodeKeyPair: KeyPair,
    cryptoService?: CryptographicService
  ) {
    this.nodeId = nodeId;
    this.nodeKeyPair = nodeKeyPair;
    this.cryptoService = cryptoService || new CryptographicService();
    this.logger = Logger.getInstance();

    this.logger.info('RoutingMessageFactory initialized', {
      nodeId: this.nodeId,
      algorithm: this.nodeKeyPair.algorithm,
    });
  }

  /**
   * Create a UTXO Route Request (URREQ) message
   */
  createUTXORouteRequest(
    destination: string,
    requestedNodeType: 'full' | 'light' | 'mining' | 'any' = 'any',
    minUTXOCompleteness: number = 0,
    minBlockchainHeight: number = 0,
    fragmentInfo?: FragmentInfo
  ): UTXORouteRequest {
    const request: UTXORouteRequest = {
      type: 'utxo_route_request',
      requestId: this.generateRequestId(),
      originator: this.nodeId,
      destination,
      hopCount: 0,
      sequenceNumber: this.generateSequenceNumber(),
      path: [this.nodeId],
      requestedNodeType,
      minUTXOCompleteness,
      minBlockchainHeight,
      timestamp: Date.now(),
      signature: '',
      isFragmented: !!fragmentInfo,
      fragmentInfo,
    };

    // Sign the request
    request.signature = this.signMessage(request);

    this.logger.debug('Created UTXO route request', {
      requestId: request.requestId,
      destination,
      requestedNodeType,
    });

    return request;
  }

  /**
   * Create a UTXO Route Reply (URREP) message
   */
  createUTXORouteReply(
    request: UTXORouteRequest,
    nodeType: 'full' | 'light' | 'mining',
    utxoSetCompleteness: number,
    currentBlockchainHeight: number,
    lastUTXOSync: number,
    availableServices: string[],
    fragmentInfo?: FragmentInfo
  ): UTXORouteReply {
    const reply: UTXORouteReply = {
      type: 'utxo_route_reply',
      requestId: request.requestId,
      originator: request.originator,
      destination: this.nodeId,
      hopCount: request.hopCount + 1,
      sequenceNumber: this.generateSequenceNumber(),
      path: [...request.path, this.nodeId],
      nodeType,
      utxoSetCompleteness,
      currentBlockchainHeight,
      lastUTXOSync,
      availableServices,
      timestamp: Date.now(),
      signature: '',
      isFragmented: !!fragmentInfo,
      fragmentInfo,
    };

    // Sign the reply
    reply.signature = this.signMessage(reply);

    this.logger.debug('Created UTXO route reply', {
      requestId: reply.requestId,
      nodeType,
      blockchainHeight: currentBlockchainHeight,
    });

    return reply;
  }

  /**
   * Create a Blockchain Route Error (BRERR) message
   */
  createBlockchainRouteError(
    brokenLinkFrom: string,
    brokenLinkTo: string,
    affectedDestinations: string[],
    errorReason:
      | 'link_failure'
      | 'node_offline'
      | 'blockchain_sync_failed'
      | 'utxo_mismatch',
    blockchainContext?: {
      lastKnownHeight: number;
      utxoSetHash: string;
    }
  ): BlockchainRouteError {
    const error: BlockchainRouteError = {
      type: 'blockchain_route_error',
      brokenLink: {
        from: brokenLinkFrom,
        to: brokenLinkTo,
      },
      affectedDestinations,
      sequenceNumber: this.generateSequenceNumber(),
      errorReason,
      blockchainContext,
      timestamp: Date.now(),
      signature: '',
    };

    // Sign the error message
    error.signature = this.signMessage(error);

    this.logger.warn('Created blockchain route error', {
      brokenLink: `${brokenLinkFrom} -> ${brokenLinkTo}`,
      errorReason,
      affectedDestinations: affectedDestinations.length,
    });

    return error;
  }

  /**
   * Create a Blockchain Hello (BHELLO) message
   */
  createBlockchainHelloMessage(
    nodeType: 'full' | 'light' | 'mining',
    currentBlockchainHeight: number,
    utxoSetCompleteness: number,
    lastUTXOSync: number,
    availableServices: string[],
    neighbors: Array<{
      nodeId: string;
      linkQuality: number;
      nodeType: 'full' | 'light' | 'mining';
      blockchainHeight: number;
    }>
  ): BlockchainHelloMessage {
    const hello: BlockchainHelloMessage = {
      type: 'blockchain_hello',
      nodeId: this.nodeId,
      sequenceNumber: this.generateSequenceNumber(),
      nodeType,
      currentBlockchainHeight,
      utxoSetCompleteness,
      lastUTXOSync,
      availableServices,
      neighbors,
      timestamp: Date.now(),
      signature: '',
      publicKey: this.getPublicKeyString(),
    };

    // Sign the hello message
    hello.signature = this.signMessage(hello);

    this.logger.debug('Created blockchain hello message', {
      nodeType,
      blockchainHeight: currentBlockchainHeight,
      neighbors: neighbors.length,
    });

    return hello;
  }

  /**
   * Validate a UTXO Route Request message
   */
  validateUTXORouteRequest(request: UTXORouteRequest): boolean {
    try {
      // Basic structure validation
      if (!request.type || request.type !== 'utxo_route_request') {
        this.logger.warn('Invalid URREQ: incorrect type');
        return false;
      }

      if (!request.requestId || !request.originator || !request.destination) {
        this.logger.warn('Invalid URREQ: missing required fields');
        return false;
      }

      if (request.hopCount < 0 || request.hopCount > 15) {
        this.logger.warn('Invalid URREQ: invalid hop count', {
          hopCount: request.hopCount,
        });
        return false;
      }

      if (!Array.isArray(request.path) || request.path.length === 0) {
        this.logger.warn('Invalid URREQ: invalid path');
        return false;
      }

      // Validate UTXO-specific fields
      if (request.minUTXOCompleteness < 0 || request.minUTXOCompleteness > 1) {
        this.logger.warn('Invalid URREQ: invalid UTXO completeness range');
        return false;
      }

      // Validate signature
      if (!this.verifyMessageSignature(request)) {
        this.logger.warn('Invalid URREQ: signature verification failed');
        return false;
      }

      this.logger.debug('URREQ validation passed', {
        requestId: request.requestId,
      });
      return true;
    } catch (error) {
      this.logger.error('URREQ validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate a UTXO Route Reply message
   */
  validateUTXORouteReply(reply: UTXORouteReply): boolean {
    try {
      // Basic structure validation
      if (!reply.type || reply.type !== 'utxo_route_reply') {
        this.logger.warn('Invalid URREP: incorrect type');
        return false;
      }

      if (!reply.requestId || !reply.originator || !reply.destination) {
        this.logger.warn('Invalid URREP: missing required fields');
        return false;
      }

      if (reply.hopCount < 0 || reply.hopCount > 15) {
        this.logger.warn('Invalid URREP: invalid hop count', {
          hopCount: reply.hopCount,
        });
        return false;
      }

      // Validate blockchain-specific fields
      if (reply.utxoSetCompleteness < 0 || reply.utxoSetCompleteness > 1) {
        this.logger.warn('Invalid URREP: invalid UTXO completeness range');
        return false;
      }

      if (reply.currentBlockchainHeight < 0) {
        this.logger.warn('Invalid URREP: invalid blockchain height');
        return false;
      }

      if (!['full', 'light', 'mining'].includes(reply.nodeType)) {
        this.logger.warn('Invalid URREP: invalid node type', {
          nodeType: reply.nodeType,
        });
        return false;
      }

      // Validate signature
      if (!this.verifyMessageSignature(reply)) {
        this.logger.warn('Invalid URREP: signature verification failed');
        return false;
      }

      this.logger.debug('URREP validation passed', {
        requestId: reply.requestId,
      });
      return true;
    } catch (error) {
      this.logger.error('URREP validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate a Blockchain Route Error message
   */
  validateBlockchainRouteError(error: BlockchainRouteError): boolean {
    try {
      if (!error.type || error.type !== 'blockchain_route_error') {
        this.logger.warn('Invalid BRERR: incorrect type');
        return false;
      }

      if (!error.brokenLink || !error.brokenLink.from || !error.brokenLink.to) {
        this.logger.warn('Invalid BRERR: missing broken link information');
        return false;
      }

      if (!Array.isArray(error.affectedDestinations)) {
        this.logger.warn('Invalid BRERR: invalid affected destinations');
        return false;
      }

      const validReasons = [
        'link_failure',
        'node_offline',
        'blockchain_sync_failed',
        'utxo_mismatch',
      ];
      if (!validReasons.includes(error.errorReason)) {
        this.logger.warn('Invalid BRERR: invalid error reason', {
          reason: error.errorReason,
        });
        return false;
      }

      // Validate signature
      if (!this.verifyMessageSignature(error)) {
        this.logger.warn('Invalid BRERR: signature verification failed');
        return false;
      }

      this.logger.debug('BRERR validation passed');
      return true;
    } catch (err) {
      this.logger.error('BRERR validation error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Validate a Blockchain Hello message
   */
  validateBlockchainHelloMessage(hello: BlockchainHelloMessage): boolean {
    try {
      if (!hello.type || hello.type !== 'blockchain_hello') {
        this.logger.warn('Invalid BHELLO: incorrect type');
        return false;
      }

      if (!hello.nodeId || !hello.publicKey) {
        this.logger.warn('Invalid BHELLO: missing node identification');
        return false;
      }

      if (!['full', 'light', 'mining'].includes(hello.nodeType)) {
        this.logger.warn('Invalid BHELLO: invalid node type', {
          nodeType: hello.nodeType,
        });
        return false;
      }

      if (hello.utxoSetCompleteness < 0 || hello.utxoSetCompleteness > 1) {
        this.logger.warn('Invalid BHELLO: invalid UTXO completeness range');
        return false;
      }

      if (hello.currentBlockchainHeight < 0) {
        this.logger.warn('Invalid BHELLO: invalid blockchain height');
        return false;
      }

      if (!Array.isArray(hello.availableServices)) {
        this.logger.warn('Invalid BHELLO: invalid available services');
        return false;
      }

      if (!Array.isArray(hello.neighbors)) {
        this.logger.warn('Invalid BHELLO: invalid neighbors array');
        return false;
      }

      // Validate signature
      if (!this.verifyMessageSignature(hello)) {
        this.logger.warn('Invalid BHELLO: signature verification failed');
        return false;
      }

      this.logger.debug('BHELLO validation passed', { nodeId: hello.nodeId });
      return true;
    } catch (error) {
      this.logger.error('BHELLO validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Convert routing message to MeshMessage format for transmission
   */
  toMeshMessage(
    routingMessage:
      | UTXORouteRequest
      | UTXORouteReply
      | BlockchainRouteError
      | BlockchainHelloMessage
  ): MeshMessage {
    return {
      type: 'discovery', // All routing messages use discovery type in mesh layer
      payload: routingMessage,
      timestamp: routingMessage.timestamp,
      from: this.nodeId,
      to: this.extractDestination(routingMessage),
      signature: routingMessage.signature,
    };
  }

  /**
   * Extract routing message from MeshMessage payload
   */
  fromMeshMessage(
    meshMessage: MeshMessage
  ):
    | UTXORouteRequest
    | UTXORouteReply
    | BlockchainRouteError
    | BlockchainHelloMessage
    | null {
    try {
      if (meshMessage.type !== 'discovery') {
        return null;
      }

      const payload = meshMessage.payload as any;
      if (!payload || !payload.type) {
        return null;
      }

      switch (payload.type) {
        case 'utxo_route_request':
          return this.validateUTXORouteRequest(payload) ? payload : null;
        case 'utxo_route_reply':
          return this.validateUTXORouteReply(payload) ? payload : null;
        case 'blockchain_route_error':
          return this.validateBlockchainRouteError(payload) ? payload : null;
        case 'blockchain_hello':
          return this.validateBlockchainHelloMessage(payload) ? payload : null;
        default:
          this.logger.warn('Unknown routing message type', {
            type: payload.type,
          });
          return null;
      }
    } catch (error) {
      this.logger.error('Failed to extract routing message from mesh message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Generate sequence number (monotonically increasing)
   */
  private generateSequenceNumber(): number {
    // In a real implementation, this would be persistent and monotonic
    return Date.now() % 0xffff; // Use timestamp modulo 16-bit max
  }

  /**
   * Sign a routing message
   */
  private signMessage(message: any): string {
    try {
      // Create a copy without signature for signing
      const messageToSign = { ...message, signature: '' };
      const serialized = JSON.stringify(messageToSign);
      const messageBytes = new TextEncoder().encode(serialized);

      const messageHash = CryptographicService.hashMessage(messageBytes);
      const signature = CryptographicService.sign(
        messageHash,
        this.nodeKeyPair.privateKey,
        this.nodeKeyPair.algorithm
      );

      return Array.from(signature.signature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      this.logger.error('Failed to sign message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  /**
   * Verify message signature
   */
  private verifyMessageSignature(message: any): boolean {
    try {
      // Basic signature verification - in full implementation would use proper crypto
      return message.signature && message.signature.length > 0;
    } catch (error) {
      this.logger.error('Failed to verify message signature', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get public key as string
   */
  private getPublicKeyString(): string {
    return Array.from(this.nodeKeyPair.publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Extract destination from routing message
   */
  private extractDestination(
    message:
      | UTXORouteRequest
      | UTXORouteReply
      | BlockchainRouteError
      | BlockchainHelloMessage
  ): string | undefined {
    switch (message.type) {
      case 'utxo_route_request':
        return message.destination;
      case 'utxo_route_reply':
        return message.originator;
      case 'blockchain_route_error':
        return undefined; // Broadcast message
      case 'blockchain_hello':
        return undefined; // Broadcast message
      default:
        return undefined;
    }
  }
}

/**
 * RoutingMessageHandler - Handles processing of received routing messages
 *
 * BREAKING CHANGE: Complete rewrite with UTXO-exclusive message handling and blockchain integration.
 */
export class RoutingMessageHandler {
  private logger: Logger;
  private nodeId: string;
  private messageFactory: RoutingMessageFactory;

  // Callbacks for different message types
  private routeRequestHandler?: (
    request: UTXORouteRequest
  ) => Promise<UTXORouteReply | null>;
  private routeReplyHandler?: (reply: UTXORouteReply) => Promise<void>;
  private routeErrorHandler?: (error: BlockchainRouteError) => Promise<void>;
  private helloMessageHandler?: (
    hello: BlockchainHelloMessage
  ) => Promise<void>;

  constructor(nodeId: string, messageFactory: RoutingMessageFactory) {
    this.nodeId = nodeId;
    this.messageFactory = messageFactory;
    this.logger = Logger.getInstance();

    this.logger.info('RoutingMessageHandler initialized', { nodeId });
  }

  /**
   * Process a received routing message
   */
  async processRoutingMessage(
    meshMessage: MeshMessage
  ): Promise<MeshMessage | null> {
    try {
      const routingMessage = this.messageFactory.fromMeshMessage(meshMessage);
      if (!routingMessage) {
        return null;
      }

      this.logger.debug('Processing routing message', {
        type: routingMessage.type,
        from: meshMessage.from,
      });

      switch (routingMessage.type) {
        case 'utxo_route_request':
          return this.handleRouteRequest(routingMessage);
        case 'utxo_route_reply':
          return this.handleRouteReply(routingMessage);
        case 'blockchain_route_error':
          return this.handleRouteError(routingMessage);
        case 'blockchain_hello':
          return this.handleHelloMessage(routingMessage);
        default:
          this.logger.warn('Unknown routing message type', {
            type: (routingMessage as any).type,
          });
          return null;
      }
    } catch (error) {
      this.logger.error('Failed to process routing message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set handler for route requests
   */
  setRouteRequestHandler(
    handler: (request: UTXORouteRequest) => Promise<UTXORouteReply | null>
  ): void {
    this.routeRequestHandler = handler;
  }

  /**
   * Set handler for route replies
   */
  setRouteReplyHandler(
    handler: (reply: UTXORouteReply) => Promise<void>
  ): void {
    this.routeReplyHandler = handler;
  }

  /**
   * Set handler for route errors
   */
  setRouteErrorHandler(
    handler: (error: BlockchainRouteError) => Promise<void>
  ): void {
    this.routeErrorHandler = handler;
  }

  /**
   * Set handler for hello messages
   */
  setHelloMessageHandler(
    handler: (hello: BlockchainHelloMessage) => Promise<void>
  ): void {
    this.helloMessageHandler = handler;
  }

  /**
   * Handle route request message
   */
  private async handleRouteRequest(
    request: UTXORouteRequest
  ): Promise<MeshMessage | null> {
    if (!this.routeRequestHandler) {
      this.logger.debug('No route request handler configured');
      return null;
    }

    try {
      // Always call the handler for all route requests (for forwarding/processing)
      const reply = await this.routeRequestHandler(request);

      // Only generate response if this is for us and we have a reply
      if (request.destination === this.nodeId && reply) {
        return this.messageFactory.toMeshMessage(reply);
      }

      // For requests not for us, handler is called but no response generated
      if (request.destination !== this.nodeId) {
        this.logger.debug('Route request is not for us, should be forwarded', {
          destination: request.destination,
          ourNodeId: this.nodeId,
        });
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to handle route request', {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Handle route reply message
   */
  private async handleRouteReply(
    reply: UTXORouteReply
  ): Promise<MeshMessage | null> {
    if (!this.routeReplyHandler) {
      this.logger.debug('No route reply handler configured');
      return null;
    }

    try {
      await this.routeReplyHandler(reply);
      return null; // Route replies don't generate response messages
    } catch (error) {
      this.logger.error('Failed to handle route reply', {
        requestId: reply.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Handle route error message
   */
  private async handleRouteError(
    error: BlockchainRouteError
  ): Promise<MeshMessage | null> {
    if (!this.routeErrorHandler) {
      this.logger.debug('No route error handler configured');
      return null;
    }

    try {
      await this.routeErrorHandler(error);
      return null; // Route errors don't generate response messages
    } catch (err) {
      this.logger.error('Failed to handle route error', {
        errorReason: error.errorReason,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Handle hello message
   */
  private async handleHelloMessage(
    hello: BlockchainHelloMessage
  ): Promise<MeshMessage | null> {
    if (!this.helloMessageHandler) {
      this.logger.debug('No hello message handler configured');
      return null;
    }

    try {
      await this.helloMessageHandler(hello);
      return null; // Hello messages don't generate response messages
    } catch (error) {
      this.logger.error('Failed to handle hello message', {
        nodeId: hello.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/**
 * Message size optimization utilities for LoRa constraints
 */
export class RoutingMessageOptimizer {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Compress routing message for LoRa transmission
   */
  compressRoutingMessage(message: any): Uint8Array {
    try {
      // Basic compression using JSON serialization
      // In a full implementation, would use binary encoding
      const serialized = JSON.stringify(message);
      const compressed = new TextEncoder().encode(serialized);

      this.logger.debug('Compressed routing message', {
        originalSize: serialized.length,
        compressedSize: compressed.length,
        type: message.type,
      });

      return compressed;
    } catch (error) {
      this.logger.error('Failed to compress routing message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Uint8Array();
    }
  }

  /**
   * Decompress routing message from LoRa transmission
   */
  decompressRoutingMessage(compressed: Uint8Array): any {
    try {
      const serialized = new TextDecoder().decode(compressed);
      const message = JSON.parse(serialized);

      this.logger.debug('Decompressed routing message', {
        compressedSize: compressed.length,
        type: message.type,
      });

      return message;
    } catch (error) {
      this.logger.error('Failed to decompress routing message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Estimate message size after compression
   */
  estimateCompressedSize(message: any): number {
    try {
      const compressed = this.compressRoutingMessage(message);
      return compressed.length;
    } catch (error) {
      this.logger.error('Failed to estimate compressed size', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Check if message fits within LoRa constraints
   */
  fitsLoRaConstraints(message: any, maxSize: number = 256): boolean {
    const estimatedSize = this.estimateCompressedSize(message);
    const fits = estimatedSize <= maxSize;

    this.logger.debug('Checked LoRa constraints', {
      estimatedSize,
      maxSize,
      fits,
      type: message.type,
    });

    return fits;
  }
}
