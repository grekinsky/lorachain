# State Synchronization Performance Tuning

## Overview

This guide provides recommendations for optimizing state synchronization performance across different network conditions and device capabilities.

## Configuration Parameters

### Checkpoint Configuration

#### Checkpoint Interval

- **Default**: 100 blocks
- **Range**: 50-500 blocks
- **Recommendation**:
  - High-frequency networks: 50-100 blocks
  - Low-frequency networks: 200-500 blocks
- **Impact**: Lower interval = more checkpoints, faster bootstrap but more storage

```typescript
const checkpointManager = new StateCheckpointManager(
  blockchain,
  persistence,
  compression,
  100 // Adjust based on network
);
```

#### Compression Level

- **Default**: 6 (gzip)
- **Range**: 1-9
- **Recommendation**:
  - Fast sync priority: 1-3 (less compression, faster)
  - Bandwidth priority: 7-9 (more compression, slower)
  - Balanced: 4-6
- **Impact**: Higher level = smaller checkpoints but slower creation

```typescript
const checkpoint = await checkpointManager.createCheckpoint({
  compressionLevel: 6, // Adjust for speed vs size tradeoff
});
```

#### Max Checkpoints

- **Default**: 10
- **Range**: 3-20
- **Recommendation**:
  - Storage-constrained: 3-5
  - High-availability: 10-20
- **Impact**: More checkpoints = more storage but better recovery options

### Incremental Update Configuration

#### Batch Size

- **Default**: 10 updates per batch
- **Range**: 5-50
- **Recommendation**:
  - LoRa mesh: 5-10 (fit in 256-byte packets)
  - Internet: 20-50 (maximize throughput)
- **Impact**: Larger batches = fewer messages but higher latency

```typescript
const stateManager = new IncrementalStateManager(
  blockchain,
  CryptographicService,
  MerkleTree,
  compression,
  meshProtocol,
  priorityQueue,
  10 // batch size - adjust based on network
);
```

#### Batch Interval

- **Default**: 1000ms
- **Range**: 100-5000ms
- **Recommendation**:
  - Real-time priority: 100-500ms
  - Bandwidth optimization: 2000-5000ms
- **Impact**: Lower interval = lower latency but more messages

#### Buffer Size

- **Default**: 100 updates
- **Range**: 50-500
- **Recommendation**:
  - Memory-constrained: 50-100
  - High-throughput: 200-500
- **Impact**: Larger buffer = handle more out-of-order updates but more memory

### Sync Resume Configuration

#### Checkpoint Interval

- **Default**: 100 blocks
- **Range**: 50-200
- **Recommendation**: Match checkpoint manager interval
- **Impact**: Lower interval = more frequent saves, better resume granularity

```typescript
const resumeManager = new SyncResumeManager(persistence, syncManager, {
  checkpointInterval: 100,
  maxRetries: 3,
  maxProgressAge: 24 * 60 * 60 * 1000, // 24 hours
});
```

## Performance Benchmarks

### Checkpoint Performance

- **Creation time**: ~50-200ms for 1000 UTXOs
- **Compression ratio**: 50-70% reduction typical
- **Storage**: ~1-2MB per 10,000 UTXOs (compressed)

### Incremental Update Performance

- **Update latency**: <50ms average
- **Broadcast latency**: 100-500ms depending on network
- **Bandwidth**: ~1-5KB per update

### Sync Resume Performance

- **Save time**: <10ms
- **Load time**: <50ms
- **Resume success rate**: >95% typical

## Network-Specific Tuning

### Internet Nodes

```typescript
// Optimize for high bandwidth
const config = {
  checkpointInterval: 100,
  compressionLevel: 6,
  batchSize: 30,
  batchInterval: 1000,
  maxBufferSize: 200,
};
```

### LoRa Mesh Nodes

```typescript
// Optimize for bandwidth constraints
const config = {
  checkpointInterval: 200,
  compressionLevel: 9, // max compression
  batchSize: 5,
  batchInterval: 5000,
  maxBufferSize: 50,
};
```

### Gateway Nodes (Hybrid)

```typescript
// Balance both networks
const config = {
  checkpointInterval: 100,
  compressionLevel: 6,
  batchSize: 15,
  batchInterval: 2000,
  maxBufferSize: 100,
};
```

## Memory Optimization

### Checkpoint Memory

- Keep max 10 checkpoints in storage
- Clear old checkpoints periodically
- Use streaming for large checkpoint application

### Update History

- Default limit: 1000 updates
- Automatic pruning when limit reached
- Adjust based on available memory

### Buffer Management

- Set reasonable buffer timeout (60s default)
- Monitor buffer size with `getGapDetectionStats()`
- Clear expired buffers regularly

## Monitoring Performance

```typescript
// Track checkpoint stats
const stats = await checkpointManager.getCheckpointStats();
console.log(`Total checkpoints: ${stats.totalCheckpoints}`);
console.log(`Average size: ${stats.averageSize} bytes`);

// Monitor sync metrics
const syncMetrics = syncManager.getSyncMetrics();
console.log(`Blocks downloaded: ${syncMetrics.blocksDownloaded}`);
console.log(`Bandwidth used: ${syncMetrics.bandwidthMBps} MB/s`);

// Check gap detection
const gapStats = stateManager.getGapDetectionStats();
console.log(`Gaps detected: ${gapStats.totalGapsDetected}`);
console.log(`Gaps recovered: ${gapStats.totalGapsRecovered}`);
```

## Troubleshooting

### Slow Checkpoint Creation

- **Solution**: Reduce compression level
- **Solution**: Increase checkpoint interval
- **Check**: UTXO set size (large sets take longer)

### High Memory Usage

- **Solution**: Reduce max buffer size
- **Solution**: Decrease update history limit
- **Solution**: Run cleanup more frequently

### Frequent Resume Failures

- **Solution**: Increase max progress age
- **Solution**: Save progress more frequently
- **Solution**: Check network stability

### Slow Sync Speed

- **Solution**: Increase batch size (internet)
- **Solution**: Use checkpoints for bootstrap
- **Solution**: Check peer connectivity

## Best Practices

1. **Monitor Performance**: Track metrics continuously
2. **Tune Incrementally**: Change one parameter at a time
3. **Test Thoroughly**: Benchmark after each change
4. **Match Network**: Configure for actual network conditions
5. **Balance Tradeoffs**: Speed vs bandwidth vs memory

## See Also

- [API Documentation](./state-synchronization-api.md)
- [Integration Guide](./state-sync-integration-guide.md)
