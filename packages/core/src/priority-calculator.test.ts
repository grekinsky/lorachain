/**
 * UTXOPriorityCalculator Tests
 *
 * Comprehensive unit tests for the priority calculation service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UTXOPriorityCalculator } from './priority-calculator.js';
import type {
  UTXOPriorityThresholds,
  UTXONetworkContext,
  PriorityFactor,
} from './priority-types.js';
import { MessagePriority } from './types.js';
import type { MeshMessage, UTXOTransaction, Block } from './types.js';

describe('UTXOPriorityCalculator', () => {
  let priorityCalculator: UTXOPriorityCalculator;
  let mockThresholds: UTXOPriorityThresholds;
  let mockNetworkContext: UTXONetworkContext;

  beforeEach(() => {
    mockThresholds = {
      highFeeSatoshiPerByte: 10,
      normalFeeSatoshiPerByte: 1,
      emergencyBypass: true,
      blockPriorityBoost: 1.5,
      merkleProofPriority: MessagePriority.HIGH,
    };

    mockNetworkContext = {
      currentBlockHeight: 1000,
      utxoSetCompleteness: 1.0,
      averageTransactionFee: 5.0,
      networkCongestionLevel: 0.3,
      batteryLevel: 0.8,
      signalStrength: 0.9,
      nodeCapacity: 0.7,
      emergencyMode: false,
    };

    priorityCalculator = new UTXOPriorityCalculator(
      mockThresholds,
      mockNetworkContext
    );
  });

  afterEach(() => {
    priorityCalculator.removeAllListeners();
  });

  describe('UTXO Transaction Priority Calculation', () => {
    it('should calculate HIGH priority for high-fee transactions', () => {
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

      const priority = priorityCalculator.calculateUTXOTransactionPriority(
        highFeeTransaction,
        mockNetworkContext
      );

      expect(priority).toBe(MessagePriority.HIGH);
    });

    it('should calculate NORMAL priority for medium-fee transactions', () => {
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

      const priority = priorityCalculator.calculateUTXOTransactionPriority(
        mediumFeeTransaction,
        mockNetworkContext
      );

      expect(priority).toBe(MessagePriority.NORMAL);
    });

    it('should calculate LOW priority for low-fee transactions', () => {
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

      const priority = priorityCalculator.calculateUTXOTransactionPriority(
        lowFeeTransaction,
        mockNetworkContext
      );

      expect(priority).toBe(MessagePriority.LOW);
    });

    it('should handle transactions with multiple inputs and outputs', () => {
      const complexTransaction: UTXOTransaction = {
        id: 'tx-complex',
        inputs: [
          {
            previousTxId: 'prev1',
            outputIndex: 0,
            unlockingScript: 'script1',
            sequence: 1,
          },
          {
            previousTxId: 'prev2',
            outputIndex: 1,
            unlockingScript: 'script2',
            sequence: 1,
          },
        ],
        outputs: [
          { value: 500, lockingScript: 'script3', outputIndex: 0 },
          { value: 300, lockingScript: 'script4', outputIndex: 1 },
          { value: 200, lockingScript: 'script5', outputIndex: 2 }, // Change output
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 1000,
      };

      const priority = priorityCalculator.calculateUTXOTransactionPriority(
        complexTransaction,
        mockNetworkContext
      );

      expect(priority).toBeOneOf([
        MessagePriority.HIGH,
        MessagePriority.NORMAL,
      ]);
    });
  });

  describe('Block Priority Calculation', () => {
    it('should assign CRITICAL priority to recent blocks', () => {
      const recentBlock: Block = {
        index: mockNetworkContext.currentBlockHeight - 1,
        timestamp: Date.now(),
        transactions: [],
        previousHash: 'prev-hash',
        hash: 'block-hash',
        nonce: 12345,
        merkleRoot: 'merkle-root',
        difficulty: 1000,
      };

      const priority = priorityCalculator.calculateBlockPriority(
        recentBlock,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.CRITICAL);
    });

    it('should assign HIGH priority to older blocks', () => {
      const oldBlock: Block = {
        index: mockNetworkContext.currentBlockHeight - 20,
        timestamp: Date.now() - 1000000,
        transactions: [],
        previousHash: 'prev-hash',
        hash: 'block-hash',
        nonce: 12345,
        merkleRoot: 'merkle-root',
        difficulty: 1000,
      };

      const priority = priorityCalculator.calculateBlockPriority(
        oldBlock,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.HIGH);
    });
  });

  describe('General Message Priority Calculation', () => {
    it('should handle transaction messages', () => {
      const transactionMessage: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        transactionMessage,
        mockNetworkContext
      );
      expect(priority).toBeOneOf(
        Object.values(MessagePriority).filter(p => typeof p === 'number')
      );
    });

    it('should handle block messages', () => {
      const blockMessage: MeshMessage = {
        type: 'block',
        payload: {
          index: 1000,
          timestamp: Date.now(),
          transactions: [],
          previousHash: 'prev-hash',
          hash: 'block-hash',
          nonce: 12345,
          merkleRoot: 'merkle-root',
          difficulty: 1000,
        } as Block,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        blockMessage,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.CRITICAL);
    });

    it('should handle sync messages (merkle proofs)', () => {
      const syncMessage: MeshMessage = {
        type: 'sync',
        payload: {
          txId: 'tx1',
          txHash: 'tx-hash',
          root: 'merkle-root',
          path: 'compressed-path',
          index: 0,
        },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        syncMessage,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.HIGH);
    });

    it('should handle discovery messages', () => {
      const discoveryMessage: MeshMessage = {
        type: 'discovery',
        payload: { nodeId: 'node1' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        discoveryMessage,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.NORMAL);
    });
  });

  describe('Priority Factors Management', () => {
    it('should add custom priority factors', () => {
      const customFactor: PriorityFactor = {
        name: 'custom_factor',
        weight: 0.5,
        calculator: (message, context) => context.signalStrength,
      };

      priorityCalculator.addPriorityFactor(customFactor);

      const factors = priorityCalculator.getPriorityFactors();
      const addedFactor = factors.find(f => f.name === 'custom_factor');

      expect(addedFactor).toBeDefined();
      expect(addedFactor?.weight).toBe(0.5);
    });

    it('should remove priority factors', () => {
      const initialFactors = priorityCalculator.getPriorityFactors();
      const factorToRemove = initialFactors[0];

      priorityCalculator.removePriorityFactor(factorToRemove.name);

      const remainingFactors = priorityCalculator.getPriorityFactors();
      const removedFactor = remainingFactors.find(
        f => f.name === factorToRemove.name
      );

      expect(removedFactor).toBeUndefined();
      expect(remainingFactors.length).toBe(initialFactors.length - 1);
    });

    it('should handle factor calculation errors gracefully', () => {
      const faultyFactor: PriorityFactor = {
        name: 'faulty_factor',
        weight: 1.0,
        calculator: () => {
          throw new Error('Calculation failed');
        },
      };

      priorityCalculator.addPriorityFactor(faultyFactor);

      // Should not throw error, should handle gracefully
      const transactionMessage: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      expect(() => {
        priorityCalculator.calculatePriority(
          transactionMessage,
          mockNetworkContext
        );
      }).not.toThrow();
    });
  });

  describe('Network Context Management', () => {
    it('should update network context', () => {
      const contextUpdate: Partial<UTXONetworkContext> = {
        batteryLevel: 0.2,
        emergencyMode: true,
        networkCongestionLevel: 0.8,
      };

      priorityCalculator.updateNetworkContext(contextUpdate);

      const updatedContext = priorityCalculator.getNetworkContext();
      expect(updatedContext.batteryLevel).toBe(0.2);
      expect(updatedContext.emergencyMode).toBe(true);
      expect(updatedContext.networkCongestionLevel).toBe(0.8);
    });

    it('should emit context updated event', done => {
      priorityCalculator.on('contextUpdated', context => {
        expect(context.batteryLevel).toBe(0.5);
        done();
      });

      priorityCalculator.updateNetworkContext({ batteryLevel: 0.5 });
    });

    it('should clear cache on significant context changes', () => {
      // First calculation to populate cache
      const message: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      priorityCalculator.calculatePriority(message, mockNetworkContext);

      const statsBefore = priorityCalculator.getCalculationStats();
      expect(statsBefore.cacheSize).toBeGreaterThan(0);

      // Make significant context change
      priorityCalculator.updateNetworkContext({
        averageTransactionFee: mockNetworkContext.averageTransactionFee * 2, // 100% change
      });

      // Cache should be cleared
      const statsAfter = priorityCalculator.getCalculationStats();
      expect(statsAfter.cacheSize).toBe(0);
    });
  });

  describe('Threshold Management', () => {
    it('should update priority thresholds', () => {
      const newThresholds: UTXOPriorityThresholds = {
        highFeeSatoshiPerByte: 20,
        normalFeeSatoshiPerByte: 2,
        emergencyBypass: false,
        blockPriorityBoost: 2.0,
        merkleProofPriority: MessagePriority.NORMAL,
      };

      priorityCalculator.updateThresholds(newThresholds);

      const updatedThresholds = priorityCalculator.getThresholds();
      expect(updatedThresholds.highFeeSatoshiPerByte).toBe(20);
      expect(updatedThresholds.normalFeeSatoshiPerByte).toBe(2);
      expect(updatedThresholds.emergencyBypass).toBe(false);
    });

    it('should recalculate priorities with new thresholds', () => {
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
        fee: 1000, // This should be HIGH priority with original thresholds
      };

      // With original thresholds
      const originalPriority =
        priorityCalculator.calculateUTXOTransactionPriority(
          mediumFeeTransaction,
          mockNetworkContext
        );
      expect(originalPriority).toBe(MessagePriority.HIGH);

      // Update thresholds to make this transaction NORMAL priority
      priorityCalculator.updateThresholds({
        ...mockThresholds,
        highFeeSatoshiPerByte: 100, // Much higher threshold
      });

      const newPriority = priorityCalculator.calculateUTXOTransactionPriority(
        mediumFeeTransaction,
        mockNetworkContext
      );
      expect(newPriority).toBe(MessagePriority.NORMAL);
    });
  });

  describe('Emergency Mode and Contextual Adjustments', () => {
    it('should boost priorities in emergency mode', () => {
      const emergencyContext: UTXONetworkContext = {
        ...mockNetworkContext,
        emergencyMode: true,
      };

      const transactionMessage: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 100, // Low fee, normally NORMAL priority
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const normalPriority = priorityCalculator.calculatePriority(
        transactionMessage,
        mockNetworkContext
      );
      const emergencyPriority = priorityCalculator.calculatePriority(
        transactionMessage,
        emergencyContext
      );

      // Emergency mode should boost the priority
      expect(emergencyPriority).toBeLessThanOrEqual(normalPriority); // Lower enum value = higher priority
    });

    it('should apply merkle proof priority override', () => {
      const syncMessage: MeshMessage = {
        type: 'sync',
        payload: { merkleProof: 'data' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        syncMessage,
        mockNetworkContext
      );
      expect(priority).toBe(mockThresholds.merkleProofPriority);
    });

    it('should apply block priority boost', () => {
      const blockMessage: MeshMessage = {
        type: 'block',
        payload: {
          index: 1000,
          timestamp: Date.now(),
          transactions: [],
          previousHash: 'prev-hash',
          hash: 'block-hash',
          nonce: 12345,
          merkleRoot: 'merkle-root',
          difficulty: 1000,
        } as Block,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        blockMessage,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.CRITICAL);
    });
  });

  describe('Caching and Performance', () => {
    it('should cache priority calculations', () => {
      const message: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      // First calculation
      priorityCalculator.calculatePriority(message, mockNetworkContext);

      const statsAfterFirst = priorityCalculator.getCalculationStats();
      expect(statsAfterFirst.cacheMisses).toBe(1);
      expect(statsAfterFirst.cacheHits).toBe(0);

      // Second calculation (should hit cache)
      priorityCalculator.calculatePriority(message, mockNetworkContext);

      const statsAfterSecond = priorityCalculator.getCalculationStats();
      expect(statsAfterSecond.cacheMisses).toBe(1);
      expect(statsAfterSecond.cacheHits).toBe(1);
    });

    it('should track calculation statistics', () => {
      const stats = priorityCalculator.getCalculationStats();
      expect(stats).toHaveProperty('totalCalculations');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('averageCalculationTime');
      expect(stats).toHaveProperty('priorityDistribution');
    });

    it('should reset statistics', () => {
      // Generate some statistics
      const message: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      priorityCalculator.calculatePriority(message, mockNetworkContext);

      let stats = priorityCalculator.getCalculationStats();
      expect(stats.totalCalculations).toBeGreaterThan(0);

      // Reset
      priorityCalculator.resetStats();

      stats = priorityCalculator.getCalculationStats();
      expect(stats.totalCalculations).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid transaction data gracefully', () => {
      const invalidTransaction = {
        id: 'invalid-tx',
        // Missing required fields
      } as any;

      expect(() => {
        priorityCalculator.calculateUTXOTransactionPriority(
          invalidTransaction,
          mockNetworkContext
        );
      }).not.toThrow();
    });

    it('should handle missing context data gracefully', () => {
      const incompleteContext = {
        // Missing some required fields
        currentBlockHeight: 1000,
      } as any;

      const message: MeshMessage = {
        type: 'transaction',
        payload: {
          id: 'tx1',
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
          fee: 500,
        } as UTXOTransaction,
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      expect(() => {
        priorityCalculator.calculatePriority(message, incompleteContext);
      }).not.toThrow();
    });

    it('should handle unknown message types', () => {
      const unknownMessage: MeshMessage = {
        type: 'unknown' as any,
        payload: { data: 'test' },
        timestamp: Date.now(),
        from: 'node1',
        signature: 'sig1',
      };

      const priority = priorityCalculator.calculatePriority(
        unknownMessage,
        mockNetworkContext
      );
      expect(priority).toBe(MessagePriority.LOW); // Default for unknown types
    });
  });
});
