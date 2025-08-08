import {
  type MeshMessage,
  type Fragment,
  type FragmentationConfig,
  type FragmentationStats,
  type UTXOTransaction,
  type Block,
  type CompressedMerkleProof,
  ReassemblyResult,
  type FragmentedMeshProtocol,
} from '@lorachain/core';
import {
  UTXOMessageFragmenter,
  UTXOFragmentReassembler,
  UTXOFragmentCache,
  CryptographicService,
  type KeyPair,
} from '@lorachain/core';
import { Logger } from '@lorachain/shared';

export interface MeshConfig {
  nodeId: string;
  channel: number;
  txPower: number;
  bandwidth: number;
  spreadingFactor: number;
  codingRate: number;
  fragmentation: FragmentationConfig;
}

export interface MeshNode {
  id: string;
  lastSeen: number;
  signalStrength: number;
  hopCount: number;
}

export class MeshProtocol implements FragmentedMeshProtocol {
  private config: MeshConfig;
  private logger = Logger.getInstance();
  private connectedNodes: Map<string, MeshNode> = new Map();
  private messageQueue: (MeshMessage | Fragment)[] = [];
  private isConnected = false;

  // Fragmentation components
  private fragmenter: UTXOMessageFragmenter;
  private reassembler: UTXOFragmentReassembler;
  private fragmentCache: UTXOFragmentCache;
  private cryptoService: CryptographicService;
  private nodeKeyPair: KeyPair;

  // Statistics tracking
  private stats: FragmentationStats = {
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    totalFragmentsSent: 0,
    totalFragmentsReceived: 0,
    averageFragmentsPerMessage: 0,
    retransmissionRate: 0,
    reassemblySuccessRate: 0,
    averageDeliveryTime: 0,
  };

  constructor(config: MeshConfig) {
    this.config = config;
    this.cryptoService = new CryptographicService();
    this.nodeKeyPair = CryptographicService.generateKeyPair('ed25519');

    this.fragmenter = new UTXOMessageFragmenter(this.cryptoService);
    this.reassembler = new UTXOFragmentReassembler();
    this.fragmentCache = new UTXOFragmentCache();

    this.logger.info('Fragmented mesh protocol initialized', {
      nodeId: config.nodeId,
      fragmentationEnabled: true,
      maxFragmentSize: config.fragmentation.maxFragmentSize,
    });

    // Start cleanup interval
    setInterval(() => this.performCleanup(), 60000); // Every minute
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.logger.info('Connecting to fragmented mesh network', {
      nodeId: this.config.nodeId,
      channel: this.config.channel,
    });

    this.isConnected = true;
    this.startHeartbeat();
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.logger.info('Disconnecting from fragmented mesh network', {
      nodeId: this.config.nodeId,
    });

    this.isConnected = false;
    this.connectedNodes.clear();
  }

  // Original MeshMessage interface (legacy support)
  async sendMessage(message: MeshMessage): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Cannot send message: not connected to mesh network');
      return false;
    }

    if (!this.validateMessage(message)) {
      this.logger.warn('Invalid message format', {
        messageType: message.type,
      });
      return false;
    }

    const serializedMessage = this.serializeMessage(message);

    // Check if fragmentation is needed
    if (serializedMessage.length <= 256) {
      // Send as single message
      return this.transmitSingleMessage(message);
    } else {
      // Fragment and send
      return this.fragmentAndSend(serializedMessage, 'legacy');
    }
  }

  receiveMessage(data: Uint8Array): MeshMessage | null {
    try {
      // First, try to determine if this is a fragment or complete message
      if (this.isFragmentData(data)) {
        return this.handleFragmentReceived(data);
      } else {
        return this.handleCompleteMessageReceived(data);
      }
    } catch (error) {
      this.logger.error('Failed to process received message', { error });
      return null;
    }
  }

  // New UTXO-specific fragmentation methods
  async sendUTXOTransaction(tx: UTXOTransaction): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn(
        'Cannot send UTXO transaction: not connected to mesh network'
      );
      return false;
    }

    try {
      const fragments = this.fragmenter.splitUTXOTransaction(
        tx,
        this.nodeKeyPair
      );
      return await this.sendFragments(fragments);
    } catch (error) {
      this.logger.error('Failed to send UTXO transaction', {
        txId: tx.id,
        error,
      });
      return false;
    }
  }

  async sendBlock(block: Block): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Cannot send block: not connected to mesh network');
      return false;
    }

    try {
      const fragments = this.fragmenter.splitBlock(block, this.nodeKeyPair);
      return await this.sendFragments(fragments);
    } catch (error) {
      this.logger.error('Failed to send block', {
        blockIndex: block.index,
        error,
      });
      return false;
    }
  }

  async sendMerkleProof(proof: CompressedMerkleProof): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn(
        'Cannot send merkle proof: not connected to mesh network'
      );
      return false;
    }

    try {
      const fragments = this.fragmenter.splitMerkleProof(
        proof,
        this.nodeKeyPair
      );
      return await this.sendFragments(fragments);
    } catch (error) {
      this.logger.error('Failed to send merkle proof', {
        txId: proof.txId,
        error,
      });
      return false;
    }
  }

  // Fragmentation management methods
  setFragmentationConfig(config: FragmentationConfig): void {
    this.config.fragmentation = { ...config };
    this.logger.info('Updated fragmentation configuration', config);
  }

  getFragmentationStats(): FragmentationStats {
    // Update calculated stats
    this.stats.averageFragmentsPerMessage =
      this.stats.totalMessagesSent > 0
        ? this.stats.totalFragmentsSent / this.stats.totalMessagesSent
        : 0;

    return { ...this.stats };
  }

  clearReassemblyBuffers(): void {
    this.reassembler.cleanup();
    this.logger.debug('Cleared all reassembly buffers');
  }

  async retransmitMissingFragments(messageId: string): Promise<void> {
    // TODO: Implement retransmission logic
    this.logger.debug(`Retransmission requested for message ${messageId}`);
  }

  // Private methods
  private async sendFragments(fragments: Fragment[]): Promise<boolean> {
    if (fragments.length === 0) {
      return false;
    }

    this.logger.debug(`Sending ${fragments.length} fragments`);

    let successCount = 0;
    for (const fragment of fragments) {
      if (await this.transmitFragment(fragment)) {
        successCount++;
        this.stats.totalFragmentsSent++;
      }
    }

    this.stats.totalMessagesSent++;

    const success = successCount === fragments.length;
    if (success) {
      this.logger.debug(`Successfully sent all ${fragments.length} fragments`);
    } else {
      this.logger.warn(
        `Only sent ${successCount}/${fragments.length} fragments`
      );
    }

    return success;
  }

  private async transmitFragment(fragment: Fragment): Promise<boolean> {
    const serializedFragment = this.serializeFragment(fragment);

    if (serializedFragment.length > 256) {
      this.logger.error(
        `Fragment too large: ${serializedFragment.length} bytes`
      );
      return false;
    }

    // Store fragment in cache for potential retransmission
    await this.fragmentCache.store(fragment);

    this.logger.debug('Transmitting fragment via LoRa', {
      messageId: Buffer.from(fragment.header.messageId).toString('hex'),
      sequence: fragment.header.sequenceNumber,
      totalFragments: fragment.header.totalFragments,
      payloadSize: serializedFragment.length,
    });

    // Simulate LoRa transmission (in real implementation, this would interface with LoRa hardware)
    return true;
  }

  private async transmitSingleMessage(message: MeshMessage): Promise<boolean> {
    const payload = this.serializeMessage(message);

    if (payload.length > 256) {
      this.logger.warn('Message too large for LoRa transmission', {
        messageSize: payload.length,
        messageType: message.type,
      });
      return false;
    }

    this.logger.debug('Transmitting message via LoRa', {
      messageType: message.type,
      payloadSize: payload.length,
    });

    this.stats.totalMessagesSent++;
    return true;
  }

  private async fragmentAndSend(
    data: Uint8Array,
    messageType: string
  ): Promise<boolean> {
    // Create fragments for legacy messages
    // This is a simplified implementation for backwards compatibility
    const fragmentSize = this.config.fragmentation.maxFragmentSize || 197;
    const totalFragments = Math.ceil(data.length / fragmentSize);

    this.logger.debug(
      `Fragmenting ${messageType} message: ${data.length} bytes into ${totalFragments} fragments`
    );

    // For now, just log the fragmentation - full implementation would create proper fragments
    this.stats.totalMessagesSent++;
    this.stats.totalFragmentsSent += totalFragments;

    return true;
  }

  private handleFragmentReceived(data: Uint8Array): MeshMessage | null {
    try {
      const fragment = this.deserializeFragment(data);
      if (!fragment) {
        return null;
      }

      this.stats.totalFragmentsReceived++;

      const result = this.reassembler.addFragment(fragment);

      switch (result) {
        case ReassemblyResult.MESSAGE_COMPLETE:
          return this.handleCompleteMessageReassembled(
            fragment.header.messageId
          );

        case ReassemblyResult.FRAGMENT_ADDED:
          this.logger.debug(`Fragment added to reassembly session`, {
            messageId: Buffer.from(fragment.header.messageId).toString('hex'),
            sequence: fragment.header.sequenceNumber,
          });
          return null;

        case ReassemblyResult.DUPLICATE_FRAGMENT:
          this.logger.debug('Duplicate fragment received');
          return null;

        case ReassemblyResult.INVALID_FRAGMENT:
          this.logger.warn('Invalid fragment received');
          return null;

        default:
          return null;
      }
    } catch (error) {
      this.logger.error('Failed to handle fragment', { error });
      return null;
    }
  }

  private handleCompleteMessageReceived(data: Uint8Array): MeshMessage | null {
    try {
      const message = this.deserializeMessage(data);

      if (!this.validateMessage(message)) {
        this.logger.warn('Received invalid message');
        return null;
      }

      this.updateNodeInfo(message.from);
      this.stats.totalMessagesReceived++;

      this.logger.debug('Received complete mesh message', {
        type: message.type,
        from: message.from,
        to: message.to,
      });

      return message;
    } catch (error) {
      this.logger.error('Failed to deserialize complete message', { error });
      return null;
    }
  }

  private handleCompleteMessageReassembled(
    messageId: Uint8Array
  ): MeshMessage | null {
    // Try to get complete UTXO transaction
    const utxoTx = this.reassembler.getCompleteUTXOTransaction(messageId);
    if (utxoTx) {
      this.stats.totalMessagesReceived++;
      this.logger.debug('Reassembled complete UTXO transaction', {
        txId: utxoTx.id,
      });

      // Convert to MeshMessage format for compatibility
      return {
        type: 'transaction',
        payload: utxoTx,
        timestamp: utxoTx.timestamp,
        from: 'reassembled',
        signature: 'fragment-verified',
      };
    }

    // Try to get complete block
    const block = this.reassembler.getCompleteBlock(messageId);
    if (block) {
      this.stats.totalMessagesReceived++;
      this.logger.debug('Reassembled complete block', {
        blockIndex: block.index,
      });

      return {
        type: 'block',
        payload: block,
        timestamp: block.timestamp,
        from: 'reassembled',
        signature: 'fragment-verified',
      };
    }

    // Try to get complete merkle proof
    const proof = this.reassembler.getCompleteMerkleProof(messageId);
    if (proof) {
      this.stats.totalMessagesReceived++;
      this.logger.debug('Reassembled complete merkle proof', {
        txId: proof.txId,
      });

      return {
        type: 'sync',
        payload: proof,
        timestamp: Date.now(),
        from: 'reassembled',
        signature: 'fragment-verified',
      };
    }

    this.logger.warn('Could not reassemble message from fragments', {
      messageId: Buffer.from(messageId).toString('hex'),
    });

    return null;
  }

  private isFragmentData(data: Uint8Array): boolean {
    // Fragments must have at least 59 bytes for the header
    if (data.length < 59) {
      return false;
    }

    // Check if data starts with a valid fragment header structure
    // Try to parse as fragment and see if it's valid
    try {
      const fragment = this.deserializeFragment(data);
      return fragment !== null;
    } catch {
      // If deserialization fails, it's not a fragment
      return false;
    }
  }

  private serializeFragment(fragment: Fragment): Uint8Array {
    // Serialize fragment header + payload
    const headerSize = 59; // As per specification
    const totalSize = headerSize + fragment.payload.length;
    const result = new Uint8Array(totalSize);

    let offset = 0;

    // messageId (16 bytes)
    result.set(fragment.header.messageId, offset);
    offset += 16;

    // sequenceNumber (2 bytes, little-endian)
    result[offset] = fragment.header.sequenceNumber & 0xff;
    result[offset + 1] = (fragment.header.sequenceNumber >> 8) & 0xff;
    offset += 2;

    // totalFragments (2 bytes, little-endian)
    result[offset] = fragment.header.totalFragments & 0xff;
    result[offset + 1] = (fragment.header.totalFragments >> 8) & 0xff;
    offset += 2;

    // fragmentSize (2 bytes, little-endian)
    result[offset] = fragment.header.fragmentSize & 0xff;
    result[offset + 1] = (fragment.header.fragmentSize >> 8) & 0xff;
    offset += 2;

    // flags (1 byte)
    result[offset] = fragment.header.flags;
    offset += 1;

    // checksum (4 bytes, little-endian)
    result[offset] = fragment.header.checksum & 0xff;
    result[offset + 1] = (fragment.header.checksum >> 8) & 0xff;
    result[offset + 2] = (fragment.header.checksum >> 16) & 0xff;
    result[offset + 3] = (fragment.header.checksum >> 24) & 0xff;
    offset += 4;

    // signature (32 bytes)
    result.set(fragment.header.signature.slice(0, 32), offset);
    offset += 32;

    // payload
    result.set(fragment.payload, offset);

    return result;
  }

  private deserializeFragment(data: Uint8Array): Fragment | null {
    if (data.length < 59) {
      return null;
    }

    try {
      let offset = 0;

      // messageId (16 bytes)
      const messageId = data.slice(offset, offset + 16);
      offset += 16;

      // sequenceNumber (2 bytes, little-endian)
      const sequenceNumber = data[offset] | (data[offset + 1] << 8);
      offset += 2;

      // totalFragments (2 bytes, little-endian)
      const totalFragments = data[offset] | (data[offset + 1] << 8);
      offset += 2;

      // fragmentSize (2 bytes, little-endian)
      const fragmentSize = data[offset] | (data[offset + 1] << 8);
      offset += 2;

      // flags (1 byte)
      const flags = data[offset];
      offset += 1;

      // checksum (4 bytes, little-endian)
      const checksum =
        data[offset] |
        (data[offset + 1] << 8) |
        (data[offset + 2] << 16) |
        (data[offset + 3] << 24);
      offset += 4;

      // signature (32 bytes in header, but Ed25519 is 64 bytes)
      const signature = data.slice(offset, offset + 32);
      offset += 32;

      // payload
      const payload = data.slice(offset);

      // Validate fragment structure
      if (payload.length !== fragmentSize) {
        return null;
      }

      // Basic validation of fragment values
      if (totalFragments === 0 || sequenceNumber >= totalFragments) {
        return null;
      }

      if (fragmentSize > 256 || fragmentSize === 0) {
        return null;
      }

      // Check if signature has the expected length as per FragmentHeader spec
      if (signature.length !== 32) {
        return null;
      }

      return {
        header: {
          messageId,
          sequenceNumber,
          totalFragments,
          fragmentSize,
          flags,
          checksum,
          signature,
        },
        payload,
      };
    } catch {
      return null;
    }
  }

  private performCleanup(): void {
    this.reassembler.cleanup();

    // Cleanup old fragments from cache
    this.fragmentCache.evict({
      maxAge: 300000, // 5 minutes
      maxSessions: this.config.fragmentation.maxConcurrentSessions,
      memoryThreshold: 10 * 1024 * 1024, // 10MB
    });
  }

  private startHeartbeat(): void {
    const sendHeartbeat = (): void => {
      if (!this.isConnected) {
        return;
      }

      const heartbeatMessage: MeshMessage = {
        type: 'discovery',
        payload: {
          nodeId: this.config.nodeId,
          timestamp: Date.now(),
          fragmentationEnabled: true,
        },
        timestamp: Date.now(),
        from: this.config.nodeId,
        signature: this.signMessage('heartbeat'),
      };

      this.transmitSingleMessage(heartbeatMessage);
      setTimeout(sendHeartbeat, 30000); // Send heartbeat every 30 seconds
    };

    setTimeout(sendHeartbeat, 1000);
  }

  private updateNodeInfo(nodeId: string): void {
    const existingNode = this.connectedNodes.get(nodeId);

    if (existingNode) {
      existingNode.lastSeen = Date.now();
    } else {
      this.connectedNodes.set(nodeId, {
        id: nodeId,
        lastSeen: Date.now(),
        signalStrength: -80, // Mock signal strength
        hopCount: 1,
      });

      this.logger.info('New fragmentation-capable node discovered', { nodeId });
    }
  }

  private validateMessage(message: MeshMessage): boolean {
    return !!(
      message.type &&
      message.payload &&
      message.timestamp &&
      message.from &&
      message.signature
    );
  }

  private serializeMessage(message: MeshMessage): Uint8Array {
    const jsonString = JSON.stringify(message);
    return new TextEncoder().encode(jsonString);
  }

  private deserializeMessage(data: Uint8Array): MeshMessage {
    const jsonString = new TextDecoder().decode(data);
    return JSON.parse(jsonString) as MeshMessage;
  }

  private signMessage(content: string): string {
    return `signature_${content}_${this.config.nodeId}`;
  }

  // Public getters (for compatibility with existing API)
  getConnectedNodes(): MeshNode[] {
    return Array.from(this.connectedNodes.values());
  }

  isConnectedToMesh(): boolean {
    return this.isConnected;
  }

  getConfig(): MeshConfig {
    return { ...this.config };
  }
}
