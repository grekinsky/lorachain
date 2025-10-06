# Blockchain Message Handlers Documentation

## Overview

The blockchain message handling system provides secure, efficient communication for blockchain-specific operations in the Lorachain network. It supports block announcements, transaction broadcasts, peer handshakes, and protocol version negotiation while operating within the constraints of LoRa's 256-byte packet size limit and duty cycle restrictions.

**Version**: 1.0.0
**Protocol**: UTXO-only (no backwards compatibility)
**Security**: Cryptographic signing (ECDSA/Ed25519) required for all messages

## Architecture

### Message Flow

The blockchain message handling system follows a structured flow from message reception to response generation:

```
1. Inbound Messages → UTXOEnhancedMeshProtocol → Message Type Check → Router
2. Router → Cryptographic Validation → Replay Check → Handler Selection
3. Handler → Process Message → Generate Response → Validation
4. Outbound Response → Sign → Compress → Fragment (if needed) → Send
```

### System Components

#### 1. BlockchainMessageRouter

**Purpose**: Central routing component that validates and dispatches blockchain messages to appropriate handlers.

**Key Features**:

- Validates cryptographic signatures (ECDSA/Ed25519)
- Prevents replay attacks using nonce tracking
- Routes messages to appropriate handlers by priority
- Integrates with UTXOPriorityQueue and UTXOReliableDeliveryManager

**Location**: `packages/core/src/blockchain-message-router.ts`

**Usage**:

```typescript
import { BlockchainMessageRouter } from '@lorachain/core';
import { CryptographicService } from '@lorachain/core';
import { UTXOPriorityQueue } from '@lorachain/core';
import { UTXOReliableDeliveryManager } from '@lorachain/core';

const cryptoService = new CryptographicService();
const priorityQueue = new UTXOPriorityQueue();
const reliableDelivery = new UTXOReliableDeliveryManager(cryptoService);

const router = new BlockchainMessageRouter(
  cryptoService,
  priorityQueue,
  reliableDelivery
);

// Register handlers
router.registerHandler(new UTXOBlockMessageHandler(cryptoService, 20));
router.registerHandler(new UTXOTransactionMessageHandler(cryptoService, 15));

// Route a message
const response = await router.routeMessage(message, context);
```

**Configuration**:

- Nonce cleanup interval: 5 minutes
- Nonce window: 10,000 entries
- Signature validation: Required for all messages

#### 2. UTXOBlockMessageHandler

**Purpose**: Handles block-related messages including announcements, requests, and responses.

**Priority**: 20 (medium-high)

**Supported Message Types**:

- `BLOCK_ANNOUNCEMENT`: New block announcements from miners or peers
- `BLOCK_REQUEST`: Requests for specific blocks (by hash or height)
- `BLOCK_RESPONSE`: Block data responses

**Key Features**:

- Validates block integrity and UTXO chain consistency
- Integrates with UTXOSyncManager for synchronization
- Manages block propagation to peers
- Implements block request/response correlation

**Location**: `packages/core/src/utxo-block-message-handler.ts`

**Usage Example**:

```typescript
import { UTXOBlockMessageHandler } from '@lorachain/core';

const handler = new UTXOBlockMessageHandler(cryptoService, 20);

// Handler automatically processes:
// - Block announcements (triggers sync if needed)
// - Block requests (responds with block data)
// - Block responses (validates and adds to chain)
```

#### 3. UTXOTransactionMessageHandler

**Purpose**: Processes UTXO transaction broadcasts and validation.

**Priority**: 15 (medium)

**Supported Message Types**:

- `UTXO_TRANSACTION_BROADCAST`: New transaction broadcasts
- `UTXO_TRANSACTION_REQUEST`: Requests for specific transactions

**Key Features**:

- Validates signatures and UTXO inputs
- Implements flooding protocol for propagation
- Manages mempool with deduplication
- Tracks propagation IDs to prevent loops

**Location**: `packages/core/src/utxo-transaction-message-handler.ts`

**Configuration**:

- Propagation tracking: 10,000 entries max
- Mempool deduplication: Transaction ID based
- Validation: Full UTXO validation required

#### 4. PeerHandshakeMessageHandler

**Purpose**: Manages three-way handshake protocol for peer connections.

**Priority**: 25 (high)

**Supported Message Types**:

- `PEER_HANDSHAKE_INIT`: Handshake initiation with challenge
- `PEER_HANDSHAKE_RESPONSE`: Response with signed challenge
- `PEER_HANDSHAKE_ACK`: Acknowledgment with signed response

**Key Features**:

- Challenge-response authentication
- Capability exchange and peer registration
- Timeout management (30 seconds)
- Integration with PeerManager for peer state

**Location**: `packages/core/src/peer-handshake-message-handler.ts`

**Handshake Protocol**:

```
Peer A                                    Peer B
  |                                         |
  |--- HANDSHAKE_INIT (challenge_A) ------>|
  |                                         |
  |<-- HANDSHAKE_RESPONSE ----------------|
  |    (sign(challenge_A), challenge_B)    |
  |                                         |
  |--- HANDSHAKE_ACK -------------------->|
  |    (sign(challenge_B))                 |
  |                                         |
  |<======== Connection Established ======>|
```

**Timeout Configuration**:

- Handshake timeout: 30 seconds
- Challenge expiration: 60 seconds
- Retry attempts: 3 max

#### 5. ProtocolVersionHandler

**Purpose**: Negotiates protocol versions with peers during handshake.

**Priority**: 30 (highest)

**Supported Message Types**:

- `VERSION_NEGOTIATION`: Version and feature negotiation

**Key Features**:

- Version negotiation (no backwards compatibility)
- Feature flag validation and agreement
- Rejects incompatible peers
- Validates required features (UTXO-only, cryptographic signing)

**Location**: `packages/core/src/protocol-version-handler.ts`

**Required Features**:

```typescript
{
  supportsUTXOOnly: true,              // REQUIRED
  supportsCryptographicSigning: true,  // REQUIRED
  supportsCompression: boolean,        // OPTIONAL
  supportsFragmentation: boolean,      // OPTIONAL
  supportsMeshRouting: boolean,        // OPTIONAL
  supportsHybridNetworking: boolean    // OPTIONAL
}
```

**Version Compatibility**:

- Current version: 1.0.0
- Minimum required version: 1.0.0
- No backwards compatibility support

## Message Types

### Block Messages

#### BLOCK_ANNOUNCEMENT

Announces a new block to the network.

**Payload**:

```typescript
{
  blockHash: string; // Unique block identifier
  blockHeight: number; // Block index in chain
  previousHash: string; // Previous block hash
  timestamp: number; // Block creation time
  minerAddress: string; // Miner's address
}
```

#### BLOCK_REQUEST

Requests a specific block from a peer.

**Payload**:

```typescript
{
  blockHash?: string;     // Block hash (preferred)
  blockHeight?: number;   // Block height (alternative)
  requestId: string;      // Correlation ID
}
```

#### BLOCK_RESPONSE

Responds with requested block data.

**Payload**:

```typescript
{
  block: Block; // Full block data
  requestId: string; // Correlation ID
}
```

### Transaction Messages

#### UTXO_TRANSACTION_BROADCAST

Broadcasts a new UTXO transaction to the network.

**Payload**:

```typescript
{
  transaction: UTXOTransaction; // Full transaction data
  propagationId: string; // Deduplication ID
  timestamp: number; // Broadcast timestamp
}
```

#### UTXO_TRANSACTION_REQUEST

Requests a specific transaction.

**Payload**:

```typescript
{
  transactionId: string; // Transaction ID
  requestId: string; // Correlation ID
}
```

### Peer Messages

#### PEER_HANDSHAKE_INIT

Initiates peer handshake.

**Payload**:

```typescript
{
  nodeId: string;
  publicKey: string;
  capabilities: PeerNodeCapabilities;
  protocolVersion: string;
  challenge: string;
  timestamp: number;
}
```

#### PEER_HANDSHAKE_RESPONSE

Responds to handshake initiation.

**Payload**:

```typescript
{
  nodeId: string;
  publicKey: string;
  capabilities: PeerNodeCapabilities;
  protocolVersion: string;
  challengeResponse: string; // Signed challenge
  challenge: string; // New challenge
  timestamp: number;
}
```

#### PEER_HANDSHAKE_ACK

Acknowledges handshake completion.

**Payload**:

```typescript
{
  nodeId: string;
  challengeResponse: string; // Signed challenge
  connectionEstablished: boolean;
  timestamp: number;
}
```

### Protocol Messages

#### VERSION_NEGOTIATION

Negotiates protocol version and features.

**Payload**:

```typescript
{
  nodeId: string;
  supportedVersions: string[];
  currentVersion: string;
  minRequiredVersion: string;
  featureFlags: ProtocolFeatureFlags;
  timestamp: number;
}
```

## Security

### Cryptographic Validation

All blockchain messages must be cryptographically signed using either:

- **ECDSA** (secp256k1): Bitcoin-compatible signatures
- **Ed25519**: High-performance modern signatures

**Signature Validation Process**:

1. Extract message metadata (excluding signature field)
2. Reconstruct message data for signing
3. Verify signature using sender's public key
4. Reject messages with invalid signatures

**Example**:

```typescript
const messageData = JSON.stringify({
  type: message.type,
  payload: message.payload,
  source: message.metadata.source,
  nonce: message.metadata.nonce,
});

const isValid = await cryptoService.verify(
  messageData,
  message.metadata.signature,
  message.metadata.source,
  'secp256k1'
);
```

### Replay Attack Prevention

The system prevents replay attacks using a nonce-based mechanism:

**Nonce Requirements**:

- Must be unique per message
- Typically includes timestamp + random value
- Tracked in sliding window (10,000 entries)
- Cleaned up every 5 minutes

**Example**:

```typescript
const nonce = `nonce_${Date.now()}_${Math.random()}`;
```

### Required Features

All peers must support these features:

- **UTXO-only transactions**: No account-based transactions
- **Cryptographic signing**: All messages must be signed

Optional features:

- Message compression
- Message fragmentation
- Mesh routing
- Hybrid networking (mesh + internet)

## Performance

### Latency Requirements

**Target**: <100ms message processing latency (95th percentile)

**Measured Latencies** (typical):

- Block announcement: 20-50ms
- Transaction broadcast: 30-60ms
- Peer handshake: 40-80ms
- Version negotiation: 15-30ms

**Performance Considerations**:

- Cryptographic validation overhead: ~10-20ms
- Handler selection: <1ms
- Message serialization: ~5-10ms
- Network transmission: Variable (depends on network)

### Memory Management

**Nonce Tracking**:

- Window size: 10,000 entries
- Cleanup interval: 5 minutes
- Memory usage: ~100KB (estimated)

**Propagation Tracking**:

- Max entries: 10,000 propagation IDs
- Cleanup: Automatic when limit reached
- Memory usage: ~200KB (estimated)

**Handler Priority Queue**:

- Uses existing UTXOPriorityQueue
- Memory usage: Depends on queue configuration

### Optimization Tips

1. **Use message batching** when possible to reduce overhead
2. **Enable compression** for large messages (blocks, transactions)
3. **Implement caching** for frequently requested blocks
4. **Monitor nonce window size** and adjust cleanup interval if needed
5. **Use handler priorities** to ensure critical messages are processed first

## Usage Examples

### Complete Example: Setting Up Message Handling

```typescript
import {
  BlockchainMessageRouter,
  UTXOBlockMessageHandler,
  UTXOTransactionMessageHandler,
  PeerHandshakeMessageHandler,
  ProtocolVersionHandler,
  CryptographicService,
  UTXOPriorityQueue,
  UTXOReliableDeliveryManager,
  Blockchain,
  UTXOManager,
  PeerManager,
  UTXOEnhancedMeshProtocol,
  UTXOSyncManager,
} from '@lorachain/core';

// Initialize core components
const cryptoService = new CryptographicService();
const blockchain = new Blockchain();
const utxoManager = new UTXOManager(blockchain);
const peerManager = new PeerManager(cryptoService);
const priorityQueue = new UTXOPriorityQueue();
const reliableDelivery = new UTXOReliableDeliveryManager(cryptoService);

// Initialize mesh protocol
const meshProtocol = new UTXOEnhancedMeshProtocol(
  cryptoService,
  peerManager,
  priorityQueue
);

// Initialize sync manager
const syncManager = new UTXOSyncManager(
  blockchain,
  utxoManager,
  meshProtocol,
  peerManager
);

// Create message router
const messageRouter = new BlockchainMessageRouter(
  cryptoService,
  priorityQueue,
  reliableDelivery
);

// Define local features and capabilities
const localFeatures = {
  supportsUTXOOnly: true,
  supportsCompression: true,
  supportsFragmentation: true,
  supportsCryptographicSigning: true,
  supportsMeshRouting: true,
  supportsHybridNetworking: true,
};

const nodeCapabilities = {
  isFullNode: true,
  isMiningNode: false,
  supportsCompression: true,
  compressionAlgorithms: ['gzip'],
  maxMessageSize: 256,
  networkType: 'hybrid' as const,
  listeningPort: 8333,
};

// Register handlers (in priority order)
messageRouter.registerHandler(
  new ProtocolVersionHandler(cryptoService, localFeatures, 30)
);
messageRouter.registerHandler(
  new PeerHandshakeMessageHandler(cryptoService, nodeCapabilities, 25)
);
messageRouter.registerHandler(new UTXOBlockMessageHandler(cryptoService, 20));
messageRouter.registerHandler(
  new UTXOTransactionMessageHandler(cryptoService, 15)
);

// Set router in mesh protocol
meshProtocol.setBlockchainMessageRouter(messageRouter);

// Create message context
const context = {
  blockchain,
  utxoManager,
  peers: peerManager,
  protocol: meshProtocol,
  syncManager,
};

// Route messages
const response = await messageRouter.routeMessage(message, context);
```

### Example: Sending a Block Announcement

```typescript
import { BlockchainMessageType } from '@lorachain/core';

// Generate key pair
const keyPair = await cryptoService.generateKeyPair('secp256k1');

// Create block announcement payload
const payload = {
  data: {
    blockHash: newBlock.hash,
    blockHeight: newBlock.index,
    previousHash: newBlock.previousHash,
    timestamp: Date.now(),
    minerAddress: minerAddress,
  },
  version: '1.0.0',
  timestamp: Date.now(),
};

// Create message data for signing
const messageData = JSON.stringify({
  type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
  payload,
  source: keyPair.publicKey,
  nonce: `nonce_${Date.now()}_${Math.random()}`,
});

// Sign the message
const signature = await cryptoService.sign(
  messageData,
  keyPair.privateKey,
  'secp256k1'
);

// Create the message
const message = {
  type: BlockchainMessageType.BLOCK_ANNOUNCEMENT,
  payload,
  metadata: {
    receivedAt: Date.now(),
    source: keyPair.publicKey,
    hopCount: 0,
    signature,
    nonce: `nonce_${Date.now()}_${Math.random()}`,
  },
};

// Route the message
const response = await messageRouter.routeMessage(message, context);
```

## Integration with Existing Components

### UTXOEnhancedMeshProtocol Integration

The blockchain message router integrates with the existing mesh protocol:

```typescript
// Set the router in mesh protocol
meshProtocol.setBlockchainMessageRouter(router);

// Mesh protocol will route blockchain messages to the router
// while routing messages are handled by RoutingMessageHandler
```

### PeerManager Integration

Handlers integrate with PeerManager for peer state management:

```typescript
// Register peer after successful handshake
await peerManager.addPeer({
  nodeId: peerData.nodeId,
  publicKey: peerData.publicKey,
  capabilities: peerData.capabilities,
  address: peerAddress,
  port: peerData.capabilities.listeningPort,
});

// Query peer information
const peer = peerManager.getPeer(nodeId);
const allPeers = peerManager.getAllPeers();
```

### UTXOSyncManager Integration

Block handlers trigger synchronization when needed:

```typescript
// Trigger sync when new block announced
if (blockHeight > currentHeight + 1) {
  await syncManager.startSync({
    targetHeight: blockHeight,
    peers: [sourceNodeId],
  });
}
```

## Troubleshooting

### Common Issues

#### Invalid Signature Errors

**Symptom**: Messages rejected with "Invalid cryptographic signature"

**Causes**:

- Incorrect message data serialization
- Wrong public key used for verification
- Signature algorithm mismatch (ECDSA vs Ed25519)

**Solution**:

```typescript
// Ensure consistent message data format
const messageData = JSON.stringify({
  type: message.type,
  payload: message.payload,
  source: message.metadata.source,
  nonce: message.metadata.nonce,
});

// Use correct algorithm
const signature = await cryptoService.sign(
  messageData,
  privateKey,
  'secp256k1' // or 'ed25519'
);
```

#### Replay Attack Detection

**Symptom**: Valid messages rejected with "Replay attack detected"

**Causes**:

- Reusing nonces
- Duplicate message transmission
- Nonce window too small

**Solution**:

```typescript
// Always generate unique nonces
const nonce = `nonce_${Date.now()}_${Math.random()}`;

// Increase nonce window if needed (in router configuration)
```

#### Version Negotiation Failures

**Symptom**: Peers rejected during version negotiation

**Causes**:

- Incompatible protocol versions
- Missing required features
- Feature flag mismatch

**Solution**:

```typescript
// Ensure required features are enabled
const features = {
  supportsUTXOOnly: true, // REQUIRED
  supportsCryptographicSigning: true, // REQUIRED
  // ... other features
};

// Use current protocol version
const currentVersion = '1.0.0';
```

### Performance Issues

#### High Latency

**Symptom**: Message processing exceeds 100ms

**Causes**:

- Large message payloads
- Inefficient cryptographic operations
- Network congestion

**Solutions**:

- Enable message compression
- Use message fragmentation for large payloads
- Implement caching for frequently accessed data
- Monitor and optimize handler performance

#### Memory Leaks

**Symptom**: Increasing memory usage over time

**Causes**:

- Nonce tracking window not cleaning up
- Propagation ID accumulation
- Handler state not being cleared

**Solutions**:

- Verify nonce cleanup interval is running
- Implement propagation ID limits
- Call `router.shutdown()` on cleanup
- Monitor memory usage with profiling tools

## API Reference

For complete API documentation, see:

- [BlockchainMessageRouter API](../src/blockchain-message-router.ts)
- [UTXOBlockMessageHandler API](../src/utxo-block-message-handler.ts)
- [UTXOTransactionMessageHandler API](../src/utxo-transaction-message-handler.ts)
- [PeerHandshakeMessageHandler API](../src/peer-handshake-message-handler.ts)
- [ProtocolVersionHandler API](../src/protocol-version-handler.ts)

## Testing

See comprehensive test suites:

- [Integration Tests](../tests/integration/blockchain-message-handlers.integration.test.ts)
- [Performance Tests](../tests/integration/blockchain-message-performance.test.ts)

Run tests:

```bash
# Run all tests
pnpm test

# Run integration tests only
pnpm test:integration

# Run performance tests
pnpm test -- blockchain-message-performance
```

## Contributing

When extending or modifying the blockchain message handling system:

1. **Maintain UTXO-only design** - No backwards compatibility
2. **Require cryptographic signatures** - All messages must be signed
3. **Follow handler priority conventions** - Use consistent priorities
4. **Add comprehensive tests** - Both unit and integration tests
5. **Update documentation** - Keep this document current
6. **Measure performance** - Ensure <100ms latency requirement

## License

See [LICENSE](../../LICENSE) file in the repository root.
