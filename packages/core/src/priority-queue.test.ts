/**
 * UTXOPriorityQueue Tests
 *
 * Comprehensive unit tests for the enhanced priority queue system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UTXOPriorityQueue } from './priority-queue.js';
import type {
  UTXOPrioritizedMeshMessage,
  QueueCapacityConfig,
} from './priority-types.js';
import { MessagePriority } from './types.js';
import type { UTXOTransaction, Block, CompressedMerkleProof } from './types.js';

describe('UTXOPriorityQueue', () => {
  let priorityQueue: UTXOPriorityQueue;
  let mockCapacityConfig: QueueCapacityConfig;

  beforeEach(() => {
    mockCapacityConfig = {
      maxTotalMessages: 100,
      capacityByPriority: {
        [MessagePriority.CRITICAL]: 20,
        [MessagePriority.HIGH]: 30,
        [MessagePriority.NORMAL]: 40,
        [MessagePriority.LOW]: 10,
      },
      emergencyCapacityReserve: 10,
      memoryLimitBytes: 1024 * 1024, // 1MB
      evictionStrategy: 'priority' as const,
    };

    priorityQueue = new UTXOPriorityQueue(mockCapacityConfig);
  });

  afterEach(() => {
    priorityQueue.clear();
  });

  describe('Basic Queue Operations', () => {
    it('should enqueue and dequeue messages correctly', async () => {
      const message: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.HIGH,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      const enqueued = await priorityQueue.enqueue(message);
      expect(enqueued).toBe(true);
      expect(priorityQueue.size()).toBe(1);

      const dequeued = await priorityQueue.dequeue();
      expect(dequeued).toEqual(message);
      expect(priorityQueue.size()).toBe(0);
    });

    it('should maintain priority order', async () => {
      const lowPriorityMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx-low' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.LOW,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      const highPriorityMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx-high' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.HIGH,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      const criticalMessage: UTXOPrioritizedMeshMessage = {
        type: 'block',
        payload: { id: 'block1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.CRITICAL,
        emergencyFlag: true,
        retryCount: 0,
        maxRetries: 5,
        ttl: 60000,
        createdAt: Date.now(),
      };

      // Enqueue in reverse priority order
      await priorityQueue.enqueue(lowPriorityMessage);
      await priorityQueue.enqueue(highPriorityMessage);
      await priorityQueue.enqueue(criticalMessage);

      // Dequeue should return critical first
      const first = await priorityQueue.dequeue();
      expect((first?.payload as any).id).toBe('block1');
      expect(first?.priority).toBe(MessagePriority.CRITICAL);

      const second = await priorityQueue.dequeue();
      expect((second?.payload as any).id).toBe('tx-high');
      expect(second?.priority).toBe(MessagePriority.HIGH);

      const third = await priorityQueue.dequeue();
      expect((third?.payload as any).id).toBe('tx-low');
      expect(third?.priority).toBe(MessagePriority.LOW);
    });

    it('should handle emergency messages correctly', async () => {
      const normalMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx-normal' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.NORMAL,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      const emergencyMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx-emergency' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.CRITICAL,
        emergencyFlag: true,
        retryCount: 0,
        maxRetries: 5,
        ttl: 60000,
        createdAt: Date.now(),
      };

      await priorityQueue.enqueue(normalMessage);
      await priorityQueue.enqueue(emergencyMessage);

      // Emergency message should come first
      const first = await priorityQueue.dequeue();
      expect(first?.emergencyFlag).toBe(true);
      expect((first?.payload as any).id).toBe('tx-emergency');
    });
  });

  describe('UTXO-Specific Operations', () => {
    it('should enqueue UTXO transactions with calculated priority', async () => {
      const highFeeTransaction: UTXOTransaction = {
        id: 'tx-high-fee',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 2000, // High fee (>10 sat/byte for ~192 byte tx)
      };

      const success =
        await priorityQueue.enqueueUTXOTransaction(highFeeTransaction);
      expect(success).toBe(true);

      const dequeued = await priorityQueue.dequeue();
      expect(dequeued?.type).toBe('transaction');
      expect(dequeued?.utxoFee).toBe(2000);
      expect(dequeued?.priority).toBe(MessagePriority.HIGH); // High fee should result in HIGH priority
    });

    it('should enqueue blocks with CRITICAL priority', async () => {
      const block: Block = {
        index: 100,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'prev-hash',
        hash: 'block-hash',
        nonce: 12345,
        merkleRoot: 'merkle-root',
        difficulty: 1000,
      };

      const success = await priorityQueue.enqueueBlock(block);
      expect(success).toBe(true);

      const dequeued = await priorityQueue.dequeue();
      expect(dequeued?.type).toBe('block');
      expect(dequeued?.priority).toBe(MessagePriority.CRITICAL);
      expect(dequeued?.blockHeight).toBe(100);
    });

    it('should enqueue merkle proofs with HIGH priority', async () => {
      const merkleProof: CompressedMerkleProof = {
        txId: 'tx1',
        txHash: 'tx-hash',
        root: 'merkle-root',
        path: 'compressed-path',
        index: 0,
      };

      const success = await priorityQueue.enqueueMerkleProof(merkleProof);
      expect(success).toBe(true);

      const dequeued = await priorityQueue.dequeue();
      expect(dequeued?.type).toBe('sync');
      expect(dequeued?.priority).toBe(MessagePriority.HIGH);
    });
  });

  describe('Queue Management', () => {
    it('should remove expired messages', async () => {
      const expiredMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'expired-tx' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.NORMAL,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 100, // Very short TTL
        createdAt: Date.now() - 200, // Already expired
      };

      const validMessage: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'valid-tx' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.NORMAL,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      await priorityQueue.enqueue(expiredMessage);
      await priorityQueue.enqueue(validMessage);

      const removedCount = priorityQueue.removeExpired();
      expect(removedCount).toBe(1);
      expect(priorityQueue.size()).toBe(1);

      const remaining = await priorityQueue.dequeue();
      expect((remaining?.payload as any).id).toBe('valid-tx');
    });

    it('should update message priority', async () => {
      const message: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.LOW,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
        queueId: 'queue-id-1',
      };

      await priorityQueue.enqueue(message);

      const updated = priorityQueue.updatePriority(
        'queue-id-1',
        MessagePriority.CRITICAL
      );
      expect(updated).toBe(true);

      const dequeued = await priorityQueue.dequeue();
      expect(dequeued?.priority).toBe(MessagePriority.CRITICAL);
    });

    it('should provide accurate statistics', async () => {
      // Add messages of different priorities
      for (let i = 0; i < 3; i++) {
        await priorityQueue.enqueueWithPriority(
          {
            type: 'transaction',
            payload: { id: `tx-critical-${i}` },
            timestamp: Date.now(),
            from: 'node1',
            signature: 'sig1',
          },
          MessagePriority.CRITICAL
        );
      }

      for (let i = 0; i < 5; i++) {
        await priorityQueue.enqueueWithPriority(
          {
            type: 'transaction',
            payload: { id: `tx-high-${i}` },
            timestamp: Date.now(),
            from: 'node1',
            signature: 'sig1',
          },
          MessagePriority.HIGH
        );
      }

      const stats = priorityQueue.getStatistics();
      expect(stats.totalMessages).toBe(8);
      expect(stats.messagesByPriority[MessagePriority.CRITICAL]).toBe(3);
      expect(stats.messagesByPriority[MessagePriority.HIGH]).toBe(5);
      expect(stats.queueHealthScore).toBeGreaterThan(0.5);
    });
  });

  describe('Capacity Management', () => {
    it('should respect total queue capacity', async () => {
      // Create a queue with very small capacity
      const smallQueue = new UTXOPriorityQueue({
        maxTotalMessages: 2,
        capacityByPriority: {
          [MessagePriority.CRITICAL]: 1,
          [MessagePriority.HIGH]: 1,
          [MessagePriority.NORMAL]: 1,
          [MessagePriority.LOW]: 1,
        },
        emergencyCapacityReserve: 0,
        memoryLimitBytes: 1024,
        evictionStrategy: 'priority' as const,
      });

      // Fill the queue
      const success1 = await smallQueue.enqueue({
        type: 'transaction',
        payload: { id: 'tx1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.NORMAL,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      });

      const success2 = await smallQueue.enqueue({
        type: 'transaction',
        payload: { id: 'tx2' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.LOW,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      });

      expect(success1).toBe(true);
      expect(success2).toBe(true);
      expect(smallQueue.size()).toBe(2);

      // Try to add one more (should succeed by evicting low priority)
      const success3 = await smallQueue.enqueue({
        type: 'transaction',
        payload: { id: 'tx3' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.HIGH,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      });

      expect(success3).toBe(true);
      expect(smallQueue.size()).toBe(2); // Size should remain the same due to eviction
    });

    it('should allow emergency messages to use reserved capacity', async () => {
      // Fill up to regular capacity with different priorities to avoid per-priority limits
      let totalAdded = 0;
      const priorities = [MessagePriority.CRITICAL, MessagePriority.HIGH, MessagePriority.NORMAL, MessagePriority.LOW];
      
      for (let i = 0; i < mockCapacityConfig.maxTotalMessages; i++) {
        const priority = priorities[i % priorities.length];
        const currentCount = Math.floor(i / priorities.length);
        
        // Check if we've hit the per-priority limit
        const maxForPriority = mockCapacityConfig.capacityByPriority[priority];
        if (currentCount >= maxForPriority) {
          continue;
        }
        
        const success = await priorityQueue.enqueue({
          type: 'transaction',
          payload: { id: `tx-${i}` },
          timestamp: Date.now(),
          from: 'node1',
          signature: 'sig1',
          priority,
          emergencyFlag: false,
          retryCount: 0,
          maxRetries: 3,
          ttl: 300000,
          createdAt: Date.now(),
        });
        
        if (success) {
          totalAdded++;
        }
      }

      expect(priorityQueue.size()).toBe(totalAdded);

      // Emergency message should still be accepted
      const emergencySuccess = await priorityQueue.enqueue({
        type: 'transaction',
        payload: { id: 'emergency-tx' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.CRITICAL,
        emergencyFlag: true,
        retryCount: 0,
        maxRetries: 5,
        ttl: 60000,
        createdAt: Date.now(),
      });

      expect(emergencySuccess).toBe(true);
      // The queue should have accepted the emergency message even if at capacity
      expect(priorityQueue.size()).toBe(totalAdded + 1);
    });
  });

  describe('Fee-Based Priority Calculation', () => {
    it('should calculate priority based on UTXO transaction fees', async () => {
      const lowFeeTransaction: UTXOTransaction = {
        id: 'tx-low-fee',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 10, // Low fee
      };

      const mediumFeeTransaction: UTXOTransaction = {
        id: 'tx-medium-fee',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 200, // Medium fee
      };

      const highFeeTransaction: UTXOTransaction = {
        id: 'tx-high-fee',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
        ],
        outputs: [{ value: 1000, lockingScript: 'script2', outputIndex: 0 }],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 2000, // High fee
      };

      await priorityQueue.enqueueUTXOTransaction(lowFeeTransaction);
      await priorityQueue.enqueueUTXOTransaction(mediumFeeTransaction);
      await priorityQueue.enqueueUTXOTransaction(highFeeTransaction);

      // Should dequeue in fee order (highest fee first)
      const first = await priorityQueue.dequeue();
      expect((first?.payload as UTXOTransaction).fee).toBe(2000);

      const second = await priorityQueue.dequeue();
      expect((second?.payload as UTXOTransaction).fee).toBe(200);

      const third = await priorityQueue.dequeue();
      expect((third?.payload as UTXOTransaction).fee).toBe(10);
    });
  });

  describe('Event Emission', () => {
    it('should emit events for queue operations', async () => {
      const enqueueListener = vi.fn();
      const dequeueListener = vi.fn();

      priorityQueue.on('messageEnqueued', enqueueListener);
      priorityQueue.on('messageDequeued', dequeueListener);

      const message: UTXOPrioritizedMeshMessage = {
        type: 'transaction',
        payload: { id: 'tx1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
        priority: MessagePriority.NORMAL,
        emergencyFlag: false,
        retryCount: 0,
        maxRetries: 3,
        ttl: 300000,
        createdAt: Date.now(),
      };

      await priorityQueue.enqueue(message);
      expect(enqueueListener).toHaveBeenCalledWith(message);

      await priorityQueue.dequeue();
      expect(dequeueListener).toHaveBeenCalledWith(message);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large numbers of messages efficiently', async () => {
      const startTime = performance.now();
      const messageCount = 70; // Use less than max capacity (100) to allow all messages
      let enqueuedCount = 0;

      // Enqueue many messages with varied priorities to stay within per-priority limits
      for (let i = 0; i < messageCount; i++) {
        const priority = i % 4 === 0 ? MessagePriority.CRITICAL :
                         i % 4 === 1 ? MessagePriority.HIGH :
                         i % 4 === 2 ? MessagePriority.NORMAL :
                         MessagePriority.LOW;
        
        const success = await priorityQueue.enqueue({
          type: 'transaction',
          payload: { id: `tx-${i}` },
          timestamp: Date.now(),
          from: 'node1',
          signature: 'sig1',
          priority,
          emergencyFlag: false,
          retryCount: 0,
          maxRetries: 3,
          ttl: 300000,
          createdAt: Date.now(),
        });
        
        if (success) {
          enqueuedCount++;
        }
      }

      const enqueueTime = performance.now() - startTime;
      expect(enqueueTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Dequeue all messages
      const dequeueStart = performance.now();
      let dequeuedCount = 0;
      while (priorityQueue.size() > 0) {
        await priorityQueue.dequeue();
        dequeuedCount++;
      }

      const dequeueTime = performance.now() - dequeueStart;
      expect(dequeueTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(dequeuedCount).toBe(enqueuedCount); // Should match what was actually enqueued
    });

    it('should provide health score based on queue state', async () => {
      // Empty queue should have perfect health
      let stats = priorityQueue.getStatistics();
      expect(stats.queueHealthScore).toBe(1.0);

      // Partially filled queue should have good health
      for (let i = 0; i < 10; i++) {
        await priorityQueue.enqueue({
          type: 'transaction',
          payload: { id: `tx-${i}` },
          timestamp: Date.now(),
          from: 'node1',
          signature: 'sig1',
          priority: MessagePriority.NORMAL,
          emergencyFlag: false,
          retryCount: 0,
          maxRetries: 3,
          ttl: 300000,
          createdAt: Date.now(),
        });
      }

      stats = priorityQueue.getStatistics();
      expect(stats.queueHealthScore).toBeGreaterThan(0.8);
    });
  });
});
