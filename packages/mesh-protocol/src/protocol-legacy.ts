import type { MeshMessage } from '@lorachain/core';
import { Logger } from '@lorachain/shared';

export interface MeshConfig {
  nodeId: string;
  channel: number;
  txPower: number;
  bandwidth: number;
  spreadingFactor: number;
  codingRate: number;
}

export interface MeshNode {
  id: string;
  lastSeen: number;
  signalStrength: number;
  hopCount: number;
}

export class MeshProtocol {
  private config: MeshConfig;
  private logger = Logger.getInstance();
  private connectedNodes: Map<string, MeshNode> = new Map();
  private messageQueue: MeshMessage[] = [];
  private isConnected = false;

  constructor(config: MeshConfig) {
    this.config = config;
    this.logger.info('Mesh protocol initialized', { nodeId: config.nodeId });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.logger.info('Connecting to mesh network', {
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

    this.logger.info('Disconnecting from mesh network', {
      nodeId: this.config.nodeId,
    });

    this.isConnected = false;
    this.connectedNodes.clear();
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
        },
        timestamp: Date.now(),
        from: this.config.nodeId,
        signature: this.signMessage('heartbeat'),
      };

      this.broadcastMessage(heartbeatMessage);
      setTimeout(sendHeartbeat, 30000); // Send heartbeat every 30 seconds
    };

    setTimeout(sendHeartbeat, 1000);
  }

  sendMessage(message: MeshMessage): Promise<boolean> {
    return new Promise(resolve => {
      if (!this.isConnected) {
        this.logger.warn('Cannot send message: not connected to mesh network');
        resolve(false);
        return;
      }

      if (!this.validateMessage(message)) {
        this.logger.warn('Invalid message format', {
          messageType: message.type,
        });
        resolve(false);
        return;
      }

      this.logger.debug('Sending mesh message', {
        type: message.type,
        from: message.from,
        to: message.to,
      });

      this.messageQueue.push(message);
      this.processMessageQueue();
      resolve(true);
    });
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.transmitMessage(message);
      }
    }
  }

  private transmitMessage(message: MeshMessage): void {
    const payload = this.serializeMessage(message);

    if (payload.length > 256) {
      // LoRa packet size limit
      this.logger.warn('Message too large for LoRa transmission', {
        messageSize: payload.length,
        messageType: message.type,
      });
      return;
    }

    this.logger.debug('Transmitting message via LoRa', {
      messageType: message.type,
      payloadSize: payload.length,
    });
  }

  private broadcastMessage(message: MeshMessage): void {
    this.connectedNodes.forEach((_, nodeId) => {
      const broadcastMessage = { ...message, to: nodeId };
      this.transmitMessage(broadcastMessage);
    });
  }

  receiveMessage(data: Uint8Array): MeshMessage | null {
    try {
      const message = this.deserializeMessage(data);

      if (!this.validateMessage(message)) {
        this.logger.warn('Received invalid message');
        return null;
      }

      this.updateNodeInfo(message.from);

      this.logger.debug('Received mesh message', {
        type: message.type,
        from: message.from,
        to: message.to,
      });

      return message;
    } catch (error) {
      this.logger.error('Failed to deserialize received message', { error });
      return null;
    }
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

      this.logger.info('New node discovered', { nodeId });
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
