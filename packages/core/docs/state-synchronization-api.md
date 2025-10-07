# State Synchronization API Documentation

## Overview

This document provides comprehensive API documentation for the Lorachain state synchronization system. The system enables efficient blockchain state synchronization across hybrid networks (internet + LoRa mesh) with support for checkpoints, incremental updates, and resumable sync operations.

**Version**: 1.0.0
**Protocol Version**: 2.0.0
**Last Updated**: 2025-10-06

---

## Table of Contents

1. [StateCheckpointManager](#statecheckpointmanager)
2. [IncrementalStateManager](#incrementalstatemanager)
3. [SyncResumeManager](#syncresumemanager)
4. [LightClientSyncStrategy](#lightclientsyncstrategy)
5. [Types and Interfaces](#types-and-interfaces)
6. [Error Handling](#error-handling)
7. [Events](#events)

---

## StateCheckpointManager

Manages blockchain state checkpoints for fast synchronization. Creates periodic UTXO set snapshots with merkle roots and validator signatures.

### Constructor

```typescript
constructor(
  blockchain: Blockchain,
  persistence: UTXOPersistenceManager,
  compression: UTXOCompressionManager,
  checkpointInterval: number = 100,
  validators?: ValidatorConfig[],
  signatureThreshold?: number,
  meshProtocol?: UTXOEnhancedMeshProtocol,
  reliableDelivery?: UTXOReliableDeliveryManager,
  maxCheckpoints: number = 10
)
```

**Parameters:**

- `blockchain`: Blockchain instance to create checkpoints from
- `persistence`: Persistence manager for storing checkpoints
- `compression`: Compression manager for UTXO set compression
- `checkpointInterval`: Block interval between checkpoints (default: 100)
- `validators`: Optional validator configurations for multi-sig
- `signatureThreshold`: Minimum signatures required (default: 2)
- `meshProtocol`: Optional mesh protocol for distribution
- `reliableDelivery`: Optional reliable delivery manager
- `maxCheckpoints`: Maximum checkpoints to retain (default: 10)

**Example:**

```typescript
const checkpointManager = new StateCheckpointManager(
  blockchain,
  persistence,
  compression,
  100, // checkpoint every 100 blocks
  validators,
  2 // require 2 validator signatures
);
```

### Methods

#### createCheckpoint()

Creates a checkpoint at the current or specified block height.

```typescript
async createCheckpoint(
  options?: CheckpointCreationOptions
): Promise<StateCheckpoint>
```

**Parameters:**

- `options.height`: Optional specific block height
- `options.compressionLevel`: Compression level 1-9 (default: 6)
- `options.includeMetadata`: Include extra metadata (default: false)

**Returns:** Promise resolving to StateCheckpoint

**Throws:**

- `CheckpointCreationError`: If checkpoint creation fails
- `CheckpointCreationError`: If already creating a checkpoint

**Example:**

```typescript
const checkpoint = await checkpointManager.createCheckpoint({
  height: 1000,
  compressionLevel: 9, // max compression
});

console.log(`Created checkpoint at height ${checkpoint.height}`);
console.log(`UTXO count: ${checkpoint.utxoCount}`);
console.log(`Merkle root: ${checkpoint.merkleRoot}`);
```

#### validateCheckpoint()

Validates checkpoint integrity and signatures.

```typescript
async validateCheckpoint(
  checkpoint: StateCheckpoint
): Promise<CheckpointValidationResult>
```

**Returns:** Validation result with details

**Example:**

```typescript
const result = await checkpointManager.validateCheckpoint(checkpoint);

if (result.isValid) {
  console.log(
    `Valid signatures: ${result.validSignatures}/${result.requiredSignatures}`
  );
} else {
  console.error('Validation failed:', result.errors);
}
```

#### getAvailableCheckpoints()

Lists all available checkpoints, sorted by height descending.

```typescript
async getAvailableCheckpoints(): Promise<StateCheckpoint[]>
```

**Returns:** Array of checkpoints

**Example:**

```typescript
const checkpoints = await checkpointManager.getAvailableCheckpoints();

for (const cp of checkpoints) {
  console.log(`Height ${cp.height}: ${cp.utxoCount} UTXOs`);
}
```

#### applyCheckpoint()

Applies a checkpoint to bootstrap blockchain state.

```typescript
async applyCheckpoint(checkpoint: StateCheckpoint): Promise<void>
```

**Throws:**

- `CheckpointApplicationError`: If application fails
- `CheckpointValidationError`: If checkpoint invalid

**Example:**

```typescript
// Download checkpoint from peer
const checkpoint = await downloadCheckpointFromPeer(peerId);

// Apply to local blockchain
await checkpointManager.applyCheckpoint(checkpoint);

console.log(`Bootstrapped from checkpoint at height ${checkpoint.height}`);
```

#### broadcastCheckpoint()

Broadcasts checkpoint announcement to network.

```typescript
async broadcastCheckpoint(checkpoint: StateCheckpoint): Promise<void>
```

**Example:**

```typescript
const checkpoint = await checkpointManager.createCheckpoint();
await checkpointManager.broadcastCheckpoint(checkpoint);

console.log('Checkpoint announced to network');
```

#### downloadCheckpoint()

Downloads a checkpoint from network peers.

```typescript
async downloadCheckpoint(
  checkpointHash: string,
  sourcePeers: string[]
): Promise<StateCheckpoint>
```

**Parameters:**

- `checkpointHash`: Hash of checkpoint to download
- `sourcePeers`: Array of peer IDs to request from

**Throws:**

- `CheckpointDownloadError`: If download fails

**Example:**

```typescript
const checkpoint = await checkpointManager.downloadCheckpoint(
  'abc123...', // checkpoint hash
  ['peer-1', 'peer-2', 'peer-3']
);
```

#### cleanupOldCheckpoints()

Removes old checkpoints beyond the retention limit.

```typescript
async cleanupOldCheckpoints(): Promise<number>
```

**Returns:** Number of checkpoints deleted

**Example:**

```typescript
const deleted = await checkpointManager.cleanupOldCheckpoints();
console.log(`Deleted ${deleted} old checkpoints`);
```

---

## IncrementalStateManager

Manages real-time blockchain state change detection and delta update broadcasting.

### Constructor

```typescript
constructor(
  blockchain: Blockchain,
  cryptoService: typeof CryptographicService,
  merkleTree: typeof MerkleTree,
  compression: UTXOCompressionManager,
  meshProtocol?: UTXOEnhancedMeshProtocol,
  priorityQueue?: UTXOPriorityQueue,
  batchSize: number = 10,
  batchIntervalMs: number = 1000,
  maxBufferSize: number = 100,
  bufferTimeoutMs: number = 60000
)
```

**Example:**

```typescript
const stateManager = new IncrementalStateManager(
  blockchain,
  CryptographicService,
  MerkleTree,
  compression,
  meshProtocol,
  priorityQueue,
  10, // batch 10 updates
  1000, // send every 1 second
  100, // buffer up to 100 out-of-order updates
  60000 // discard buffered updates after 60 seconds
);
```

### Methods

#### startWatchingStateChanges()

Begins monitoring blockchain for state changes.

```typescript
async startWatchingStateChanges(): Promise<void>
```

**Throws:**

- `StateUpdateError`: If already watching

**Example:**

```typescript
await stateManager.startWatchingStateChanges();

stateManager.on('block_detected', async block => {
  const update = await stateManager.createStateUpdate(
    block,
    privateKey,
    'secp256k1'
  );
  await stateManager.broadcastStateUpdate(update);
});
```

#### createStateUpdate()

Creates a signed state update from a block's changes.

```typescript
async createStateUpdate(
  block: Block,
  privateKey: string,
  algorithm: 'secp256k1' | 'ed25519'
): Promise<StateUpdate>
```

**Parameters:**

- `block`: Block to create update from
- `privateKey`: Hex-encoded private key for signing
- `algorithm`: Cryptographic algorithm to use

**Returns:** Signed state update

**Example:**

```typescript
const update = await stateManager.createStateUpdate(
  newBlock,
  '1a2b3c...', // private key
  'secp256k1'
);

console.log(`Created update #${update.sequenceNumber}`);
console.log(`UTXOs created: ${update.utxosCreated.length}`);
console.log(`UTXOs spent: ${update.utxosSpent.length}`);
```

#### applyStateUpdate()

Applies a received state update to local blockchain.

```typescript
async applyStateUpdate(update: StateUpdate): Promise<boolean>
```

**Throws:**

- `StateUpdateError`: If update validation fails
- `InvalidSequenceError`: If sequence number incorrect

**Example:**

```typescript
try {
  await stateManager.applyStateUpdate(receivedUpdate);
  console.log('Update applied successfully');
} catch (error) {
  if (error instanceof InvalidSequenceError) {
    // Handle gap - request missing updates
    const missing = stateManager.detectMissingUpdates(
      receivedUpdate.sequenceNumber
    );
    await requestMissingUpdates(missing);
  }
}
```

#### subscribeToUpdates()

Subscribes a peer to receive state updates.

```typescript
async subscribeToUpdates(
  subscription: StateUpdateSubscribePayload
): Promise<void>
```

**Parameters:**

- `subscription.peerId`: Unique peer identifier
- `subscription.subscriptionType`: 'all' or 'address_specific'
- `subscription.addresses`: Optional address filter
- `subscription.startSequence`: Starting sequence number
- `subscription.expiresAt`: Optional expiration timestamp

**Example:**

```typescript
// Full node subscription
await stateManager.subscribeToUpdates({
  peerId: 'node-123',
  subscriptionType: 'all',
  startSequence: 0,
});

// Light client subscription (address-specific)
await stateManager.subscribeToUpdates({
  peerId: 'wallet-456',
  subscriptionType: 'address_specific',
  addresses: ['lora1abc...', 'lora1def...'],
  startSequence: 100,
  expiresAt: Date.now() + 3600000, // 1 hour
});
```

#### broadcastStateUpdate()

Broadcasts update to all subscribed peers.

```typescript
async broadcastStateUpdate(update: StateUpdate): Promise<void>
```

**Throws:**

- `BroadcastError`: If broadcast fails to all peers

**Example:**

```typescript
const update = await stateManager.createStateUpdate(
  block,
  privateKey,
  'secp256k1'
);

await stateManager.broadcastStateUpdate(update);
```

#### detectMissingUpdates()

Identifies missing updates in the sequence.

```typescript
detectMissingUpdates(receivedSequence: number): number[]
```

**Returns:** Array of missing sequence numbers

**Example:**

```typescript
// Local sequence is at 5, received update with sequence 10
const missing = stateManager.detectMissingUpdates(10);
// Returns: [6, 7, 8, 9]

for (const seq of missing) {
  await requestUpdateFromPeer(seq);
}
```

---

## SyncResumeManager

Handles sync progress persistence and resume capability after network interruptions.

### Constructor

```typescript
constructor(
  persistence: UTXOPersistenceManager,
  syncManager: UTXOSyncManager,
  options?: Partial<SyncResumeOptions>
)
```

**Options:**

- `checkpointInterval`: Save every N blocks (default: 100)
- `maxRetries`: Maximum resume attempts (default: 3)
- `validateOnLoad`: Validate saved state (default: true)
- `maxProgressAge`: Max age in ms (default: 24 hours)

**Example:**

```typescript
const resumeManager = new SyncResumeManager(persistence, syncManager, {
  checkpointInterval: 50, // save every 50 blocks
  maxRetries: 5, // allow 5 resume attempts
  maxProgressAge: 12 * 60 * 60 * 1000, // 12 hours
});
```

### Methods

#### saveProgress()

Saves current sync progress to disk.

```typescript
async saveProgress(progress?: SyncProgress): Promise<void>
```

**Example:**

```typescript
const progress = syncManager.getSyncProgress();
await resumeManager.saveProgress(progress);
```

#### loadProgress()

Loads saved sync progress from disk.

```typescript
async loadProgress(): Promise<SyncResumeState | null>
```

**Returns:** Saved progress or null if none exists

**Example:**

```typescript
const saved = await resumeManager.loadProgress();

if (saved) {
  console.log(`Found saved progress at height ${saved.currentHeight}`);
  console.log(`Session: ${saved.sessionId}`);
  console.log(`Active peers: ${saved.activePeers.length}`);
}
```

#### resumeSync()

Resumes sync from saved progress.

```typescript
async resumeSync(savedProgress?: SyncResumeState): Promise<boolean>
```

**Returns:** True if resume successful, false otherwise

**Example:**

```typescript
const resumed = await resumeManager.resumeSync();

if (resumed) {
  console.log('Sync resumed successfully');
} else {
  console.log('Starting fresh sync');
  await syncManager.startSync();
}
```

#### clearSavedProgress()

Clears saved progress from disk.

```typescript
async clearSavedProgress(): Promise<void>
```

**Example:**

```typescript
// On successful sync completion
syncManager.on('synchronized', async () => {
  await resumeManager.clearSavedProgress();
  console.log('Sync complete - progress cleared');
});
```

---

## LightClientSyncStrategy

Optimized sync strategy for mobile wallets and resource-constrained devices.

### Constructor

```typescript
constructor(
  compressionManager: UTXOCompressionManager,
  cryptoService: CryptographicService,
  meshProtocol?: UTXOEnhancedMeshProtocol,
  dutyCycle?: DutyCycleManager,
  discovery?: NodeDiscoveryProtocol,
  reliableDelivery?: UTXOReliableDeliveryManager,
  config?: Partial<LightClientSyncConfig>
)
```

**Configuration:**

- `addressFilter`: Array of addresses to sync
- `enableBloomFilters`: Use bloom filters (default: true)
- `maxBlocksPerRequest`: Request batch size (default: 10)
- `requestTimeout`: Request timeout ms (default: 30000)

**Example:**

```typescript
const lightClient = new LightClientSyncStrategy(
  compression,
  cryptoService,
  meshProtocol,
  dutyCycle,
  discovery,
  reliableDelivery,
  {
    addressFilter: ['lora1abc...'],
    enableBloomFilters: true,
    maxBlocksPerRequest: 5,
    requestTimeout: 60000,
  }
);
```

---

## Types and Interfaces

### StateCheckpoint

```typescript
interface StateCheckpoint extends UTXOSetSnapshot {
  checkpointHash: string; // SHA-256 hash of checkpoint
  checkpointInterval: number; // Block interval (e.g., 100)
  previousCheckpointHash?: string; // Chain continuity
  validatorSignatures?: ValidatorSignature[];
  expiresAt?: number; // Optional expiration
}
```

### StateUpdate

```typescript
interface StateUpdate {
  sequenceNumber: number; // Monotonically increasing
  blockHeight: number; // Block height
  blockHash: string; // Block hash
  timestamp: number; // Creation timestamp
  previousUpdateHash: string; // Hash chain
  utxosCreated: CompressedUTXO[]; // Created UTXOs
  utxosSpent: UTXOSpentProof[]; // Spent UTXOs
  merkleRootBefore: string; // Pre-state merkle root
  merkleRootAfter: string; // Post-state merkle root
  merkleProof: string[]; // State transition proof
  signature: string; // Cryptographic signature
  publicKey: string; // Signer's public key
  algorithm: 'secp256k1' | 'ed25519';
}
```

### SyncResumeState

```typescript
interface SyncResumeState extends SyncProgress {
  resumeVersion: string; // Schema version
  savedAt: number; // Save timestamp
  sessionId: string; // Unique session ID
  startTime: number; // Session start time
  activePeers: SyncPeer[]; // Connected peers
  bestPeer?: SyncPeer; // Best peer
  downloadedHeaders: number[]; // Downloaded header heights
  downloadedBlocks: number[]; // Downloaded block heights
  downloadedUTXOs: string[]; // Downloaded UTXO IDs
  activeStrategy: 'internet' | 'mesh' | 'hybrid';
  networkMode: 'internet' | 'mesh' | 'gateway';
  retryCount: number; // Resume attempts
  lastError?: string; // Last error message
}
```

---

## Error Handling

### Checkpoint Errors

```typescript
// Checkpoint creation failed
try {
  await checkpointManager.createCheckpoint();
} catch (error) {
  if (error instanceof CheckpointCreationError) {
    console.error('Failed to create checkpoint:', error.message);
  }
}

// Insufficient validator signatures
try {
  const result = await checkpointManager.validateCheckpoint(checkpoint);
  if (!result.isValid) {
    throw new InsufficientSignaturesError(
      result.requiredSignatures,
      result.validSignatures
    );
  }
} catch (error) {
  if (error instanceof InsufficientSignaturesError) {
    console.error(`Need ${error.required} signatures, got ${error.actual}`);
  }
}
```

### State Update Errors

```typescript
// Invalid sequence
try {
  await stateManager.applyStateUpdate(update);
} catch (error) {
  if (error instanceof InvalidSequenceError) {
    console.error(`Expected ${error.expected}, got ${error.actual}`);

    // Request missing updates
    const missing = stateManager.detectMissingUpdates(error.actual);
    await requestMissingUpdates(missing);
  }
}

// Subscription errors
try {
  await stateManager.subscribeToUpdates(subscription);
} catch (error) {
  if (error instanceof SubscriptionError) {
    console.error('Subscription failed:', error.message);
  }
}
```

---

## Events

### StateCheckpointManager Events

```typescript
// Checkpoint lifecycle
checkpointManager.on('checkpoint:creating', ({ height }) => {
  console.log(`Creating checkpoint at height ${height}`);
});

checkpointManager.on('checkpoint:created', ({ checkpoint, duration }) => {
  console.log(`Checkpoint created in ${duration}ms`);
});

checkpointManager.on('checkpoint:announced', ({ checkpointHash, height }) => {
  console.log(`Announced checkpoint ${checkpointHash}`);
});

// Checkpoint distribution
checkpointManager.on('checkpoint:served', ({ peerId, fragmentsServed }) => {
  console.log(`Served ${fragmentsServed} fragments to ${peerId}`);
});

checkpointManager.on(
  'checkpoint:fragment-received',
  ({ fragmentIndex, totalFragments }) => {
    console.log(`Fragment ${fragmentIndex}/${totalFragments} received`);
  }
);

// Checkpoint application
checkpointManager.on('checkpoint:applying', ({ checkpointHash, height }) => {
  console.log(`Applying checkpoint at height ${height}`);
});

checkpointManager.on('checkpoint:applied', ({ height, utxoCount }) => {
  console.log(`Applied checkpoint: ${utxoCount} UTXOs at height ${height}`);
});

// Cleanup
checkpointManager.on('checkpoint:cleanup', ({ deletedCount }) => {
  console.log(`Cleaned up ${deletedCount} old checkpoints`);
});
```

### IncrementalStateManager Events

```typescript
// State watching
stateManager.on('watching_started', () => {
  console.log('Started watching state changes');
});

stateManager.on('block_detected', block => {
  console.log(`New block detected: ${block.index}`);
});

// State updates
stateManager.on('state_update_created', update => {
  console.log(`Created update #${update.sequenceNumber}`);
});

stateManager.on('state_update_applied', update => {
  console.log(`Applied update #${update.sequenceNumber}`);
});

// Gap detection (Task 6)
stateManager.on('gap_detected', ({ gaps, receivedSequence }) => {
  console.log(`Gap detected: missing ${gaps.length} updates`);
});

stateManager.on('update_buffered', ({ sequenceNumber }) => {
  console.log(`Buffered out-of-order update #${sequenceNumber}`);
});

// Subscriptions
stateManager.on('subscription_added', info => {
  console.log(`Peer ${info.peerId} subscribed (${info.type})`);
});

stateManager.on('subscription_removed', info => {
  console.log(`Peer ${info.peerId} unsubscribed`);
});

// Broadcasting
stateManager.on(
  'update_broadcasted',
  ({ update, successCount, failedCount }) => {
    console.log(
      `Broadcasted update #${update.sequenceNumber} to ${successCount} peers`
    );
  }
);

stateManager.on('batch_sent', ({ peerId, batch, payloadSize }) => {
  console.log(`Sent batch to ${peerId}: ${payloadSize} bytes`);
});
```

### SyncResumeManager Events

```typescript
// Progress management
resumeManager.on('progress_saved', state => {
  console.log(`Progress saved at height ${state.currentHeight}`);
});

resumeManager.on('progress_cleared', () => {
  console.log('Saved progress cleared');
});

// Resume operations
resumeManager.on('sync_resumed', progress => {
  console.log(`Sync resumed from height ${progress.currentHeight}`);
  console.log(`Attempt ${progress.retryCount}`);
});

resumeManager.on('new_session', sessionId => {
  console.log(`Started new sync session: ${sessionId}`);
});
```

---

## Best Practices

### 1. Checkpoint Creation

```typescript
// Create checkpoints periodically
blockchain.on('block_added', async block => {
  if (block.index % 100 === 0) {
    try {
      const checkpoint = await checkpointManager.createCheckpoint();
      await checkpointManager.broadcastCheckpoint(checkpoint);
    } catch (error) {
      console.error('Checkpoint creation failed:', error);
    }
  }
});
```

### 2. Incremental Updates with Error Handling

```typescript
stateManager.on('block_detected', async block => {
  try {
    const update = await stateManager.createStateUpdate(
      block,
      privateKey,
      'secp256k1'
    );

    await stateManager.broadcastStateUpdate(update);
  } catch (error) {
    console.error('Update creation/broadcast failed:', error);
  }
});
```

### 3. Sync Resume Management

```typescript
// Auto-save progress
setInterval(async () => {
  const progress = syncManager.getSyncProgress();
  await resumeManager.saveProgress(progress);
}, 60000); // Every minute

// Resume on startup
async function startupSync() {
  const canResume = await resumeManager.canResume();

  if (canResume) {
    const resumed = await resumeManager.resumeSync();
    if (!resumed) {
      await syncManager.startSync();
    }
  } else {
    await syncManager.startSync();
  }
}
```

### 4. Light Client Sync

```typescript
const lightClient = new LightClientSyncStrategy(
  compression,
  cryptoService,
  meshProtocol,
  dutyCycle,
  discovery,
  reliableDelivery,
  {
    addressFilter: walletAddresses,
    enableBloomFilters: true,
    maxBlocksPerRequest: 5,
  }
);

// Sync only relevant data
const result = await lightClient.syncAddressSpecificData(
  walletAddresses,
  0, // start height
  blockchain.getBlocks().length - 1 // current height
);

console.log(`Synced ${result.blocksDownloaded} relevant blocks`);
console.log(`Found ${result.utxosSynced} UTXOs`);
```

---

## Performance Considerations

### Checkpoint Size Optimization

- Use compression level 6-9 for production
- Checkpoints compress by >50% typically
- Fragment size: 200 bytes for LoRa compatibility

### Update Batching

- Batch 5-20 updates per message
- Balance latency vs bandwidth efficiency
- Respect duty cycle limits on LoRa mesh

### Memory Management

- Update history pruned to last 1000 updates
- Buffer limits prevent memory overflow
- Checkpoint cleanup retains last N checkpoints only

### Network Optimization

- Use address filters for light clients
- Enable bloom filters for efficient data transfer
- Prioritize updates with fee-based scoring

---

## Version History

- **1.0.0** (2025-10-06): Initial API documentation

---

## See Also

- [Integration Guide](./state-sync-integration-guide.md)
- [Performance Tuning](./state-sync-performance.md)
- [UTXO Sync Protocol v2.0.0](../src/sync-types.ts)
