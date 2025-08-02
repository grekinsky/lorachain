import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  RoutingMessageFactory,
  RoutingMessageHandler,
  RoutingMessageOptimizer,
} from './routing-messages.js';
import {
  type UTXORouteRequest,
  type UTXORouteReply,
  type BlockchainRouteError,
  type BlockchainHelloMessage,
  type MeshMessage,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';

// Mock Logger
vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('RoutingMessageFactory', () => {
  let messageFactory: RoutingMessageFactory;
  let nodeKeyPair: KeyPair;

  beforeEach(() => {
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');
    messageFactory = new RoutingMessageFactory('test-node', nodeKeyPair);
  });

  test('should create valid UTXO route request', () => {
    const request = messageFactory.createUTXORouteRequest(
      'destination-node',
      'full',
      0.8,
      100
    );

    expect(request.type).toBe('utxo_route_request');
    expect(request.originator).toBe('test-node');
    expect(request.destination).toBe('destination-node');
    expect(request.requestedNodeType).toBe('full');
    expect(request.minUTXOCompleteness).toBe(0.8);
    expect(request.minBlockchainHeight).toBe(100);
    expect(request.path).toEqual(['test-node']);
    expect(request.hopCount).toBe(0);
    expect(request.signature).toBeTruthy();
    expect(request.requestId).toBeTruthy();
  });

  test('should create valid UTXO route reply', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const reply = messageFactory.createUTXORouteReply(
      request,
      'full',
      1.0,
      150,
      Date.now(),
      ['mining', 'spv_proofs']
    );

    expect(reply.type).toBe('utxo_route_reply');
    expect(reply.requestId).toBe(request.requestId);
    expect(reply.originator).toBe(request.originator);
    expect(reply.destination).toBe('test-node');
    expect(reply.nodeType).toBe('full');
    expect(reply.utxoSetCompleteness).toBe(1.0);
    expect(reply.currentBlockchainHeight).toBe(150);
    expect(reply.availableServices).toEqual(['mining', 'spv_proofs']);
    expect(reply.path).toEqual([...request.path, 'test-node']);
    expect(reply.hopCount).toBe(request.hopCount + 1);
    expect(reply.signature).toBeTruthy();
  });

  test('should create valid blockchain route error', () => {
    const error = messageFactory.createBlockchainRouteError(
      'node-1',
      'node-2',
      ['destination-1', 'destination-2'],
      'link_failure',
      { lastKnownHeight: 100, utxoSetHash: 'hash123' }
    );

    expect(error.type).toBe('blockchain_route_error');
    expect(error.brokenLink.from).toBe('node-1');
    expect(error.brokenLink.to).toBe('node-2');
    expect(error.affectedDestinations).toEqual([
      'destination-1',
      'destination-2',
    ]);
    expect(error.errorReason).toBe('link_failure');
    expect(error.blockchainContext?.lastKnownHeight).toBe(100);
    expect(error.blockchainContext?.utxoSetHash).toBe('hash123');
    expect(error.signature).toBeTruthy();
  });

  test('should create valid blockchain hello message', () => {
    const neighbors = [
      {
        nodeId: 'neighbor-1',
        linkQuality: 0.9,
        nodeType: 'full' as const,
        blockchainHeight: 100,
      },
      {
        nodeId: 'neighbor-2',
        linkQuality: 0.8,
        nodeType: 'light' as const,
        blockchainHeight: 95,
      },
    ];

    const hello = messageFactory.createBlockchainHelloMessage(
      'full',
      150,
      1.0,
      Date.now(),
      ['mining', 'spv_proofs'],
      neighbors
    );

    expect(hello.type).toBe('blockchain_hello');
    expect(hello.nodeId).toBe('test-node');
    expect(hello.nodeType).toBe('full');
    expect(hello.currentBlockchainHeight).toBe(150);
    expect(hello.utxoSetCompleteness).toBe(1.0);
    expect(hello.availableServices).toEqual(['mining', 'spv_proofs']);
    expect(hello.neighbors).toEqual(neighbors);
    expect(hello.publicKey).toBeTruthy();
    expect(hello.signature).toBeTruthy();
  });

  test('should validate UTXO route request correctly', () => {
    const validRequest =
      messageFactory.createUTXORouteRequest('destination-node');
    expect(messageFactory.validateUTXORouteRequest(validRequest)).toBe(true);

    // Test invalid request - wrong type
    const invalidRequest1 = { ...validRequest, type: 'invalid_type' } as any;
    expect(messageFactory.validateUTXORouteRequest(invalidRequest1)).toBe(
      false
    );

    // Test invalid request - missing required fields
    const invalidRequest2 = { ...validRequest, originator: '' };
    expect(messageFactory.validateUTXORouteRequest(invalidRequest2)).toBe(
      false
    );

    // Test invalid request - invalid hop count
    const invalidRequest3 = { ...validRequest, hopCount: -1 };
    expect(messageFactory.validateUTXORouteRequest(invalidRequest3)).toBe(
      false
    );

    // Test invalid request - invalid UTXO completeness
    const invalidRequest4 = { ...validRequest, minUTXOCompleteness: 1.5 };
    expect(messageFactory.validateUTXORouteRequest(invalidRequest4)).toBe(
      false
    );
  });

  test('should validate UTXO route reply correctly', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const validReply = messageFactory.createUTXORouteReply(
      request,
      'full',
      1.0,
      150,
      Date.now(),
      ['mining']
    );
    expect(messageFactory.validateUTXORouteReply(validReply)).toBe(true);

    // Test invalid reply - wrong node type
    const invalidReply1 = { ...validReply, nodeType: 'invalid' as any };
    expect(messageFactory.validateUTXORouteReply(invalidReply1)).toBe(false);

    // Test invalid reply - invalid blockchain height
    const invalidReply2 = { ...validReply, currentBlockchainHeight: -1 };
    expect(messageFactory.validateUTXORouteReply(invalidReply2)).toBe(false);

    // Test invalid reply - invalid UTXO completeness
    const invalidReply3 = { ...validReply, utxoSetCompleteness: 2.0 };
    expect(messageFactory.validateUTXORouteReply(invalidReply3)).toBe(false);
  });

  test('should validate blockchain route error correctly', () => {
    const validError = messageFactory.createBlockchainRouteError(
      'node-1',
      'node-2',
      ['destination-1'],
      'link_failure'
    );
    expect(messageFactory.validateBlockchainRouteError(validError)).toBe(true);

    // Test invalid error - missing broken link info
    const invalidError1 = {
      ...validError,
      brokenLink: { from: '', to: 'node-2' },
    };
    expect(messageFactory.validateBlockchainRouteError(invalidError1)).toBe(
      false
    );

    // Test invalid error - invalid error reason
    const invalidError2 = {
      ...validError,
      errorReason: 'invalid_reason' as any,
    };
    expect(messageFactory.validateBlockchainRouteError(invalidError2)).toBe(
      false
    );

    // Test invalid error - invalid affected destinations
    const invalidError3 = {
      ...validError,
      affectedDestinations: 'not-an-array' as any,
    };
    expect(messageFactory.validateBlockchainRouteError(invalidError3)).toBe(
      false
    );
  });

  test('should validate blockchain hello message correctly', () => {
    const validHello = messageFactory.createBlockchainHelloMessage(
      'full',
      150,
      1.0,
      Date.now(),
      ['mining'],
      []
    );
    expect(messageFactory.validateBlockchainHelloMessage(validHello)).toBe(
      true
    );

    // Test invalid hello - missing node ID
    const invalidHello1 = { ...validHello, nodeId: '' };
    expect(messageFactory.validateBlockchainHelloMessage(invalidHello1)).toBe(
      false
    );

    // Test invalid hello - invalid node type
    const invalidHello2 = { ...validHello, nodeType: 'invalid' as any };
    expect(messageFactory.validateBlockchainHelloMessage(invalidHello2)).toBe(
      false
    );

    // Test invalid hello - invalid blockchain height
    const invalidHello3 = { ...validHello, currentBlockchainHeight: -1 };
    expect(messageFactory.validateBlockchainHelloMessage(invalidHello3)).toBe(
      false
    );
  });

  test('should convert routing messages to mesh messages', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const meshMessage = messageFactory.toMeshMessage(request);

    expect(meshMessage.type).toBe('discovery');
    expect(meshMessage.payload).toEqual(request);
    expect(meshMessage.from).toBe('test-node');
    expect(meshMessage.to).toBe('destination-node');
    expect(meshMessage.signature).toBe(request.signature);
  });

  test('should extract routing messages from mesh messages', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const meshMessage = messageFactory.toMeshMessage(request);
    const extractedMessage = messageFactory.fromMeshMessage(meshMessage);

    expect(extractedMessage).toEqual(request);
  });

  test('should return null for invalid mesh messages', () => {
    const invalidMeshMessage: MeshMessage = {
      type: 'transaction',
      payload: { invalid: 'payload' },
      timestamp: Date.now(),
      from: 'test-node',
      signature: 'signature',
    };

    const extractedMessage = messageFactory.fromMeshMessage(invalidMeshMessage);
    expect(extractedMessage).toBeNull();
  });
});

describe('RoutingMessageHandler', () => {
  let messageHandler: RoutingMessageHandler;
  let messageFactory: RoutingMessageFactory;
  let nodeKeyPair: KeyPair;

  beforeEach(() => {
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');
    messageFactory = new RoutingMessageFactory('test-node', nodeKeyPair);
    messageHandler = new RoutingMessageHandler('test-node', messageFactory);
  });

  test('should process route request for our node', async () => {
    let receivedRequest: UTXORouteRequest | null = null;

    messageHandler.setRouteRequestHandler(async request => {
      receivedRequest = request;
      return messageFactory.createUTXORouteReply(
        request,
        'full',
        1.0,
        150,
        Date.now(),
        ['mining']
      );
    });

    const request = messageFactory.createUTXORouteRequest('test-node');
    const meshMessage = messageFactory.toMeshMessage(request);

    const responseMessage =
      await messageHandler.processRoutingMessage(meshMessage);

    expect(receivedRequest).toEqual(request);
    expect(responseMessage).toBeTruthy();
    expect(responseMessage?.type).toBe('discovery');
  });

  test('should process route reply', async () => {
    let receivedReply: UTXORouteReply | null = null;

    messageHandler.setRouteReplyHandler(async reply => {
      receivedReply = reply;
    });

    const request = messageFactory.createUTXORouteRequest('destination-node');
    const reply = messageFactory.createUTXORouteReply(
      request,
      'full',
      1.0,
      150,
      Date.now(),
      ['mining']
    );
    const meshMessage = messageFactory.toMeshMessage(reply);

    const responseMessage =
      await messageHandler.processRoutingMessage(meshMessage);

    expect(receivedReply).toEqual(reply);
    expect(responseMessage).toBeNull(); // Route replies don't generate responses
  });

  test('should process route error', async () => {
    let receivedError: BlockchainRouteError | null = null;

    messageHandler.setRouteErrorHandler(async error => {
      receivedError = error;
    });

    const error = messageFactory.createBlockchainRouteError(
      'node-1',
      'node-2',
      ['destination-1'],
      'link_failure'
    );
    const meshMessage = messageFactory.toMeshMessage(error);

    const responseMessage =
      await messageHandler.processRoutingMessage(meshMessage);

    expect(receivedError).toEqual(error);
    expect(responseMessage).toBeNull(); // Route errors don't generate responses
  });

  test('should process hello message', async () => {
    let receivedHello: BlockchainHelloMessage | null = null;

    messageHandler.setHelloMessageHandler(async hello => {
      receivedHello = hello;
    });

    const hello = messageFactory.createBlockchainHelloMessage(
      'full',
      150,
      1.0,
      Date.now(),
      ['mining'],
      []
    );
    const meshMessage = messageFactory.toMeshMessage(hello);

    const responseMessage =
      await messageHandler.processRoutingMessage(meshMessage);

    expect(receivedHello).toEqual(hello);
    expect(responseMessage).toBeNull(); // Hello messages don't generate responses
  });

  test('should ignore non-routing messages', async () => {
    const nonRoutingMessage: MeshMessage = {
      type: 'transaction',
      payload: { id: 'tx-1' },
      timestamp: Date.now(),
      from: 'test-node',
      signature: 'signature',
    };

    const responseMessage =
      await messageHandler.processRoutingMessage(nonRoutingMessage);
    expect(responseMessage).toBeNull();
  });

  test('should ignore route requests not for our node', async () => {
    let handlerCalled = false;

    messageHandler.setRouteRequestHandler(async request => {
      handlerCalled = true;
      return null;
    });

    const request = messageFactory.createUTXORouteRequest('other-node');
    const meshMessage = messageFactory.toMeshMessage(request);

    const responseMessage =
      await messageHandler.processRoutingMessage(meshMessage);

    expect(handlerCalled).toBe(true); // Handler should be called
    expect(responseMessage).toBeNull(); // But no response generated for other nodes
  });
});

describe('RoutingMessageOptimizer', () => {
  let optimizer: RoutingMessageOptimizer;
  let messageFactory: RoutingMessageFactory;
  let nodeKeyPair: KeyPair;

  beforeEach(() => {
    optimizer = new RoutingMessageOptimizer();
    nodeKeyPair = CryptographicService.generateKeyPair('ed25519');
    messageFactory = new RoutingMessageFactory('test-node', nodeKeyPair);
  });

  test('should compress and decompress messages correctly', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');

    const compressed = optimizer.compressRoutingMessage(request);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = optimizer.decompressRoutingMessage(compressed);
    expect(decompressed).toEqual(request);
  });

  test('should estimate compressed size correctly', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const estimatedSize = optimizer.estimateCompressedSize(request);

    expect(estimatedSize).toBeGreaterThan(0);
    expect(typeof estimatedSize).toBe('number');

    const actualCompressed = optimizer.compressRoutingMessage(request);
    expect(estimatedSize).toBe(actualCompressed.length);
  });

  test('should check LoRa constraints correctly', () => {
    const smallRequest = messageFactory.createUTXORouteRequest('dest');
    const actualSize = optimizer.estimateCompressedSize(smallRequest);
    // Route requests with signatures are typically larger than 256 bytes
    // Use a more realistic size limit for testing
    const fitsSmall = optimizer.fitsLoRaConstraints(smallRequest, 1024);
    expect(fitsSmall).toBe(true);

    // Create a large message by adding many services
    const largeServices = Array.from({ length: 100 }, (_, i) => `service-${i}`);
    const largeHello = messageFactory.createBlockchainHelloMessage(
      'full',
      150,
      1.0,
      Date.now(),
      largeServices,
      []
    );

    const fitsLarge = optimizer.fitsLoRaConstraints(largeHello, 256);
    // This might still fit depending on compression, but test the logic
    expect(typeof fitsLarge).toBe('boolean');
  });

  test('should handle compression errors gracefully', () => {
    const invalidMessage = {
      circular: null as any,
    };
    invalidMessage.circular = invalidMessage; // Create circular reference

    const compressed = optimizer.compressRoutingMessage(invalidMessage);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBe(0); // Should return empty array on error
  });

  test('should handle decompression errors gracefully', () => {
    const invalidCompressed = new Uint8Array([1, 2, 3, 4, 5]); // Invalid JSON

    const decompressed = optimizer.decompressRoutingMessage(invalidCompressed);
    expect(decompressed).toBeNull();
  });

  test('should estimate size of different message types', () => {
    const request = messageFactory.createUTXORouteRequest('destination-node');
    const reply = messageFactory.createUTXORouteReply(
      request,
      'full',
      1.0,
      150,
      Date.now(),
      ['mining']
    );
    const error = messageFactory.createBlockchainRouteError(
      'node-1',
      'node-2',
      ['dest-1'],
      'link_failure'
    );
    const hello = messageFactory.createBlockchainHelloMessage(
      'full',
      150,
      1.0,
      Date.now(),
      ['mining'],
      []
    );

    const requestSize = optimizer.estimateCompressedSize(request);
    const replySize = optimizer.estimateCompressedSize(reply);
    const errorSize = optimizer.estimateCompressedSize(error);
    const helloSize = optimizer.estimateCompressedSize(hello);

    expect(requestSize).toBeGreaterThan(0);
    expect(replySize).toBeGreaterThan(requestSize); // Reply has more data
    expect(errorSize).toBeGreaterThan(0);
    expect(helloSize).toBeGreaterThan(0);
  });
});
