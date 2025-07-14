import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeshProtocol } from './protocol.js';
import { Logger } from '@lorachain/shared';
import type { MeshConfig } from './protocol.js';
import type { MeshMessage } from '@lorachain/core';

// Mock the logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('MeshProtocol', () => {
  let meshProtocol: MeshProtocol;
  let mockLogger: any;
  let meshConfig: MeshConfig;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    (Logger.getInstance as any).mockReturnValue(mockLogger);

    meshConfig = {
      nodeId: 'test-node-1',
      channel: 1,
      txPower: 20,
      bandwidth: 125,
      spreadingFactor: 7,
      codingRate: 5,
    };
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      meshProtocol = new MeshProtocol(meshConfig);

      expect(meshProtocol.getConfig()).toEqual(meshConfig);
      expect(meshProtocol.isConnectedToMesh()).toBe(false);
      expect(meshProtocol.getConnectedNodes()).toHaveLength(0);
    });

    it('should log initialization', () => {
      meshProtocol = new MeshProtocol(meshConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Mesh protocol initialized',
        { nodeId: 'test-node-1' }
      );
    });
  });

  describe('connect', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should connect to mesh network', async () => {
      await meshProtocol.connect();

      expect(meshProtocol.isConnectedToMesh()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Connecting to mesh network',
        {
          nodeId: 'test-node-1',
          channel: 1,
        }
      );
    });

    it('should handle already connected state', async () => {
      await meshProtocol.connect();
      expect(meshProtocol.isConnectedToMesh()).toBe(true);

      // Should not throw or change state
      await meshProtocol.connect();
      expect(meshProtocol.isConnectedToMesh()).toBe(true);
    });

    it('should start heartbeat after connection', async () => {
      await meshProtocol.connect();

      // Add a mock connected node so heartbeat has something to broadcast to
      const mockMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'other-node' },
        timestamp: Date.now(),
        from: 'other-node',
        signature: 'signature',
      };

      const serializedMessage = new TextEncoder().encode(
        JSON.stringify(mockMessage)
      );
      meshProtocol.receiveMessage(serializedMessage);

      // Wait for heartbeat to be sent
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Transmitting message via LoRa',
        {
          messageType: 'discovery',
          payloadSize: expect.any(Number),
        }
      );
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should disconnect from mesh network', async () => {
      await meshProtocol.connect();
      expect(meshProtocol.isConnectedToMesh()).toBe(true);

      await meshProtocol.disconnect();
      expect(meshProtocol.isConnectedToMesh()).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disconnecting from mesh network',
        { nodeId: 'test-node-1' }
      );
    });

    it('should handle already disconnected state', async () => {
      await meshProtocol.disconnect();

      expect(meshProtocol.isConnectedToMesh()).toBe(false);
      // Should not throw
    });

    it('should clear connected nodes on disconnect', async () => {
      await meshProtocol.connect();

      // Simulate receiving a message to add a node
      const mockMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'other-node' },
        timestamp: Date.now(),
        from: 'other-node',
        signature: 'signature',
      };

      const serializedMessage = new TextEncoder().encode(
        JSON.stringify(mockMessage)
      );
      meshProtocol.receiveMessage(serializedMessage);

      expect(meshProtocol.getConnectedNodes()).toHaveLength(1);

      await meshProtocol.disconnect();
      expect(meshProtocol.getConnectedNodes()).toHaveLength(0);
    });
  });

  describe('sendMessage', () => {
    let meshMessage: MeshMessage;

    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
      meshMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        timestamp: Date.now(),
        from: 'test-node-1',
        to: 'target-node',
        signature: 'signature',
      };
    });

    it('should send message when connected', async () => {
      await meshProtocol.connect();

      const result = await meshProtocol.sendMessage(meshMessage);

      expect(result).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Sending mesh message', {
        type: 'transaction',
        from: 'test-node-1',
        to: 'target-node',
      });
    });

    it('should fail to send message when not connected', async () => {
      const result = await meshProtocol.sendMessage(meshMessage);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot send message: not connected to mesh network'
      );
    });

    it('should validate message before sending', async () => {
      await meshProtocol.connect();

      const invalidMessage = { ...meshMessage, type: undefined as any };
      const result = await meshProtocol.sendMessage(invalidMessage);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid message format', {
        messageType: undefined,
      });
    });

    it('should reject message larger than LoRa limit', async () => {
      await meshProtocol.connect();

      const largeMessage = {
        ...meshMessage,
        payload: { data: 'x'.repeat(300) }, // Large payload
      };

      const result = await meshProtocol.sendMessage(largeMessage);

      expect(result).toBe(true); // Still queued
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Message too large for LoRa transmission',
        {
          messageSize: expect.any(Number),
          messageType: 'transaction',
        }
      );
    });
  });

  describe('receiveMessage', () => {
    let meshMessage: MeshMessage;
    let serializedMessage: Uint8Array;

    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
      meshMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        timestamp: Date.now(),
        from: 'other-node',
        signature: 'signature',
      };
      serializedMessage = new TextEncoder().encode(JSON.stringify(meshMessage));
    });

    it('should receive and deserialize valid message', () => {
      const result = meshProtocol.receiveMessage(serializedMessage);

      expect(result).toEqual(meshMessage);
      expect(mockLogger.debug).toHaveBeenCalledWith('Received mesh message', {
        type: 'transaction',
        from: 'other-node',
        to: undefined,
      });
    });

    it('should update node info on message receipt', () => {
      expect(meshProtocol.getConnectedNodes()).toHaveLength(0);

      meshProtocol.receiveMessage(serializedMessage);

      const connectedNodes = meshProtocol.getConnectedNodes();
      expect(connectedNodes).toHaveLength(1);
      expect(connectedNodes[0].id).toBe('other-node');
    });

    it('should handle invalid message data', () => {
      const invalidData = new TextEncoder().encode('invalid json');

      const result = meshProtocol.receiveMessage(invalidData);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to deserialize received message',
        { error: expect.any(Error) }
      );
    });

    it('should reject invalid message format', () => {
      const invalidMessage = { ...meshMessage, type: undefined };
      const invalidData = new TextEncoder().encode(
        JSON.stringify(invalidMessage)
      );

      const result = meshProtocol.receiveMessage(invalidData);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Received invalid message');
    });

    it('should update existing node lastSeen time', () => {
      // First message
      meshProtocol.receiveMessage(serializedMessage);
      const firstNode = meshProtocol.getConnectedNodes()[0];
      const firstLastSeen = firstNode.lastSeen;

      // Wait and send second message
      setTimeout(() => {
        meshProtocol.receiveMessage(serializedMessage);
        const updatedNode = meshProtocol.getConnectedNodes()[0];

        expect(updatedNode.lastSeen).toBeGreaterThan(firstLastSeen);
        expect(meshProtocol.getConnectedNodes()).toHaveLength(1); // Still only one node
      }, 100);
    });
  });

  describe('message validation', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should validate complete message', () => {
      const validMessage: MeshMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        timestamp: Date.now(),
        from: 'sender',
        signature: 'signature',
      };

      // Test through private method via sendMessage
      meshProtocol.connect();
      expect(meshProtocol.sendMessage(validMessage)).resolves.toBe(true);
    });

    it('should reject message without type', () => {
      const invalidMessage = {
        payload: { amount: 100 },
        timestamp: Date.now(),
        from: 'sender',
        signature: 'signature',
      } as any;

      meshProtocol.connect();
      expect(meshProtocol.sendMessage(invalidMessage)).resolves.toBe(false);
    });

    it('should reject message without payload', () => {
      const invalidMessage = {
        type: 'transaction',
        timestamp: Date.now(),
        from: 'sender',
        signature: 'signature',
      } as any;

      meshProtocol.connect();
      expect(meshProtocol.sendMessage(invalidMessage)).resolves.toBe(false);
    });

    it('should reject message without timestamp', () => {
      const invalidMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        from: 'sender',
        signature: 'signature',
      } as any;

      meshProtocol.connect();
      expect(meshProtocol.sendMessage(invalidMessage)).resolves.toBe(false);
    });

    it('should reject message without from field', () => {
      const invalidMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        timestamp: Date.now(),
        signature: 'signature',
      } as any;

      meshProtocol.connect();
      expect(meshProtocol.sendMessage(invalidMessage)).resolves.toBe(false);
    });

    it('should reject message without signature', () => {
      const invalidMessage = {
        type: 'transaction',
        payload: { amount: 100 },
        timestamp: Date.now(),
        from: 'sender',
      } as any;

      meshProtocol.connect();
      expect(meshProtocol.sendMessage(invalidMessage)).resolves.toBe(false);
    });
  });

  describe('getConnectedNodes', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should return empty array initially', () => {
      expect(meshProtocol.getConnectedNodes()).toHaveLength(0);
    });

    it('should return connected nodes', () => {
      const message1: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'node-1' },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const message2: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'node-2' },
        timestamp: Date.now(),
        from: 'node-2',
        signature: 'signature',
      };

      meshProtocol.receiveMessage(
        new TextEncoder().encode(JSON.stringify(message1))
      );
      meshProtocol.receiveMessage(
        new TextEncoder().encode(JSON.stringify(message2))
      );

      const nodes = meshProtocol.getConnectedNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes.map(n => n.id)).toEqual(['node-1', 'node-2']);
    });

    it('should return array copy', () => {
      const nodes1 = meshProtocol.getConnectedNodes();
      const nodes2 = meshProtocol.getConnectedNodes();

      expect(nodes1).not.toBe(nodes2);
      expect(nodes1).toEqual(nodes2);
    });
  });

  describe('getConfig', () => {
    it('should return config copy', () => {
      meshProtocol = new MeshProtocol(meshConfig);

      const config1 = meshProtocol.getConfig();
      const config2 = meshProtocol.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
      expect(config1).toEqual(meshConfig);
    });
  });

  describe('message serialization', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should serialize and deserialize messages correctly', () => {
      const originalMessage: MeshMessage = {
        type: 'transaction',
        payload: { amount: 100, from: 'sender', to: 'receiver' },
        timestamp: 1234567890,
        from: 'node-1',
        to: 'node-2',
        signature: 'signature-string',
      };

      const serialized = new TextEncoder().encode(
        JSON.stringify(originalMessage)
      );
      const deserialized = meshProtocol.receiveMessage(serialized);

      expect(deserialized).toEqual(originalMessage);
    });

    it('should handle unicode characters', () => {
      const messageWithUnicode: MeshMessage = {
        type: 'transaction',
        payload: { note: 'Payment for 🍕' },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const serialized = new TextEncoder().encode(
        JSON.stringify(messageWithUnicode)
      );
      const deserialized = meshProtocol.receiveMessage(serialized);

      expect(deserialized).toEqual(messageWithUnicode);
    });
  });

  describe('heartbeat', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should send heartbeat after connection', async () => {
      await meshProtocol.connect();

      // Wait for heartbeat
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Transmitting message via LoRa',
        {
          messageType: 'discovery',
          payloadSize: expect.any(Number),
        }
      );
    });

    it('should stop heartbeat after disconnection', async () => {
      await meshProtocol.connect();

      // Add a mock connected node so heartbeat has something to broadcast to
      const mockMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'other-node' },
        timestamp: Date.now(),
        from: 'other-node',
        signature: 'signature',
      };

      const serializedMessage = new TextEncoder().encode(
        JSON.stringify(mockMessage)
      );
      meshProtocol.receiveMessage(serializedMessage);

      await meshProtocol.disconnect();

      mockLogger.debug.mockClear();

      // Wait longer than heartbeat interval but not 35 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        'Transmitting message via LoRa',
        expect.any(Object)
      );
    }, 10000); // Set timeout to 10 seconds
  });

  describe('message types', () => {
    beforeEach(() => {
      meshProtocol = new MeshProtocol(meshConfig);
    });

    it('should handle transaction messages', () => {
      const transactionMessage: MeshMessage = {
        type: 'transaction',
        payload: { amount: 100, from: 'A', to: 'B' },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const serialized = new TextEncoder().encode(
        JSON.stringify(transactionMessage)
      );
      const result = meshProtocol.receiveMessage(serialized);

      expect(result?.type).toBe('transaction');
    });

    it('should handle block messages', () => {
      const blockMessage: MeshMessage = {
        type: 'block',
        payload: { index: 1, hash: 'block-hash' },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const serialized = new TextEncoder().encode(JSON.stringify(blockMessage));
      const result = meshProtocol.receiveMessage(serialized);

      expect(result?.type).toBe('block');
    });

    it('should handle sync messages', () => {
      const syncMessage: MeshMessage = {
        type: 'sync',
        payload: { requestedBlock: 5 },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const serialized = new TextEncoder().encode(JSON.stringify(syncMessage));
      const result = meshProtocol.receiveMessage(serialized);

      expect(result?.type).toBe('sync');
    });

    it('should handle discovery messages', () => {
      const discoveryMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'node-1' },
        timestamp: Date.now(),
        from: 'node-1',
        signature: 'signature',
      };

      const serialized = new TextEncoder().encode(
        JSON.stringify(discoveryMessage)
      );
      const result = meshProtocol.receiveMessage(serialized);

      expect(result?.type).toBe('discovery');
    });
  });
});
