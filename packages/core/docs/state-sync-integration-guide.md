# State Synchronization Integration Guide

## Overview

This guide shows how to integrate state synchronization into your Lorachain application. Choose from checkpoint-based sync, incremental updates, or light client sync depending on your use case.

## Quick Start

### Full Node Integration

```typescript
import {
  StateCheckpointManager,
  IncrementalStateManager,
  SyncResumeManager,
} from '@lorachain/core';

// 1. Setup checkpoint manager
const checkpointManager = new StateCheckpointManager(
  blockchain,
  persistence,
  compression,
  100 // checkpoint every 100 blocks
);

// 2. Auto-create checkpoints
blockchain.on('block_added', async block => {
  if (block.index % 100 === 0) {
    const checkpoint = await checkpointManager.createCheckpoint();
    await checkpointManager.broadcastCheckpoint(checkpoint);
  }
});

// 3. Setup incremental updates
const stateManager = new IncrementalStateManager(
  blockchain,
  CryptographicService,
  MerkleTree,
  compression,
  meshProtocol
);

await stateManager.startWatchingStateChanges();

stateManager.on('block_detected', async block => {
  const update = await stateManager.createStateUpdate(
    block,
    nodePrivateKey,
    'secp256k1'
  );
  await stateManager.broadcastStateUpdate(update);
});

// 4. Setup sync resume
const resumeManager = new SyncResumeManager(persistence, syncManager, {
  checkpointInterval: 100,
});

// Auto-save progress
setInterval(async () => {
  await resumeManager.saveProgress();
}, 60000); // every minute
```

### Light Client Integration

```typescript
import { LightClientSyncStrategy } from '@lorachain/core';

// Create light client for mobile wallet
const lightClient = new LightClientSyncStrategy(
  compression,
  cryptoService,
  meshProtocol,
  dutyCycle,
  discovery,
  reliableDelivery,
  {
    addressFilter: ['lora1abc...', 'lora1def...'], // wallet addresses
    enableBloomFilters: true,
    maxBlocksPerRequest: 5,
  }
);

// Sync wallet data
const result = await lightClient.syncAddressSpecificData(
  walletAddresses,
  0, // from genesis
  currentHeight
);

console.log(`Synced ${result.utxosSynced} UTXOs`);
```

## Integration Patterns

### Pattern 1: Checkpoint Bootstrap

Use checkpoints to quickly bootstrap new nodes:

```typescript
// New node startup
async function bootstrapNode() {
  // Download latest checkpoint from peers
  const peers = await discoverPeers();
  const latestCheckpoint = await findLatestCheckpoint(peers);

  if (latestCheckpoint) {
    // Apply checkpoint
    await checkpointManager.applyCheckpoint(latestCheckpoint);

    // Sync remaining blocks
    await syncManager.startSync();
  } else {
    // Full sync from genesis
    await syncManager.startSync();
  }
}
```

### Pattern 2: Real-Time Updates

Subscribe to state updates for synchronized nodes:

```typescript
// Subscribe to incremental updates
await stateManager.subscribeToUpdates({
  peerId: nodeId,
  subscriptionType: 'all',
  startSequence: 0,
});

// Handle incoming updates
stateManager.on('update_received', async update => {
  try {
    await stateManager.applyStateUpdate(update);
  } catch (error) {
    if (error instanceof InvalidSequenceError) {
      // Request missing updates
      const missing = stateManager.detectMissingUpdates(update.sequenceNumber);
      await requestMissingUpdates(missing);
    }
  }
});
```

### Pattern 3: Resume After Interruption

Handle network interruptions gracefully:

```typescript
// On startup
const resumed = await resumeManager.resumeSync();

if (!resumed) {
  // Start fresh sync
  await syncManager.startSync();
}

// On sync completion
syncManager.on('synchronized', async () => {
  await resumeManager.clearSavedProgress();
});
```

## Testing Your Integration

```typescript
import { createTestBlockchain } from '@lorachain/core/tests/helpers';

// Create test blockchain
const testChain = await createTestBlockchain(100);

// Test checkpoint creation
const checkpoint = await checkpointManager.createCheckpoint();
expect(checkpoint.height).toBeGreaterThan(0);

// Test incremental updates
const update = await stateManager.createStateUpdate(
  block,
  privateKey,
  'secp256k1'
);
await stateManager.applyStateUpdate(update);
```

## See Also

- [API Documentation](./state-synchronization-api.md)
- [Performance Tuning](./state-sync-performance.md)
