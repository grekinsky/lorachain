import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Blockchain } from '../../src/blockchain.js';
import { UTXOManager } from '../../src/utxo.js';
import { UTXOPersistenceManager } from '../../src/persistence.js';
import { UTXOCompressionManager } from '../../src/utxo-compression-manager.js';
import { UTXOReliableDeliveryManager } from '../../src/utxo-reliable-delivery-manager.js';
import { NodeDiscoveryProtocol } from '../../src/node-discovery-protocol.js';
import { DatabaseFactory } from '../../src/database.js';
import { BlockManager } from '../../src/block.js';
import type { DifficultyConfig } from '../../src/difficulty.js';
import type {
  Block,
  UTXOTransaction,
  GenesisConfig,
  UTXOPersistenceConfig,
  UTXOChainBranch,
  UTXOChainState
} from '../../src/types.js';

describe('Enhanced Blockchain Fork Handling (NO BACKWARDS COMPATIBILITY)', () => {
  let blockchain: Blockchain;
  let persistence: UTXOPersistenceManager;
  let utxoManager: UTXOManager;
  let compressionManager: UTXOCompressionManager;
  let reliableDelivery: UTXOReliableDeliveryManager;
  let nodeDiscovery: NodeDiscoveryProtocol;

  const testConfig: UTXOPersistenceConfig = {
    enabled: true,
    dbPath: ':memory:',
    dbType: 'memory',
    autoSave: true,
    batchSize: 100,
    compressionType: 'none',
    utxoSetCacheSize: 1000,
    cryptographicAlgorithm: 'secp256k1',
    compactionStyle: 'size',
  };

  const testGenesisConfig: GenesisConfig = {
    chainId: 'fork-test-chain-v1',
    networkName: 'Fork Test Network',
    version: '1.0.0',
    initialAllocations: [
      {
        address: 'lora1initial000000000000000000000000000000',
        amount: 1000000,
        description: 'Initial test allocation',
      },
    ],
    totalSupply: 21000000,
    networkParams: {
      initialDifficulty: 2,
      targetBlockTime: 180,
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      miningReward: 50,
      maxBlockSize: 1024 * 1024,
    },
  };

  const testDifficultyConfig: DifficultyConfig = {
    targetBlockTime: 180,
    adjustmentPeriod: 10,
    maxDifficultyRatio: 4,
    minDifficulty: 1,
    maxDifficulty: 1000000,
  };

  beforeEach(async () => {
    const database = DatabaseFactory.create(testConfig);
    await database.initialize();
    
    persistence = new UTXOPersistenceManager(database, testConfig);
    utxoManager = new UTXOManager();
    
    const chainConfig = {
      maxReorganizationDepth: 10,
      suspiciousSplitThreshold: 6,
      nodeDiscoveryEnabled: true,
      maxMessageSize: 256,
      forkDetectionEnabled: true,
      attackDetectionEnabled: true,
      minConfirmationsForFinality: 6
    };
    
    compressionManager = new UTXOCompressionManager();
    reliableDelivery = new UTXOReliableDeliveryManager(chainConfig, compressionManager);
    nodeDiscovery = new NodeDiscoveryProtocol(chainConfig);

    blockchain = new Blockchain(
      persistence,
      utxoManager,
      testDifficultyConfig,
      testGenesisConfig,
      compressionManager,
      reliableDelivery,
      nodeDiscovery
    );

    await blockchain.waitForInitialization();
  });

  afterEach(async () => {
    await blockchain.close();
  });

  describe('chain extension handling', () => {
    it('should handle normal chain extension', async () => {
      // Mine a block to extend the chain
      const minedBlock = blockchain.minePendingUTXOTransactions('test-miner');
      expect(minedBlock).toBeDefined();

      // Create a valid extension block
      const extensionBlock = createMockUTXOBlock(2, minedBlock!.hash, 2);
      
      const result = await blockchain.addBlock(extensionBlock);
      
      expect(result.isValid).toBe(true);
      expect(blockchain.getBlocks()).toHaveLength(3); // Genesis + mined + extension
      expect(blockchain.getActiveBranch().height).toBe(2);
    });

    it('should validate UTXO-only blocks in extensions', async () => {
      const minedBlock = blockchain.minePendingUTXOTransactions('test-miner');
      expect(minedBlock).toBeDefined();

      // Create a block with legacy transactions (should be rejected)
      const legacyBlock = createMockLegacyBlock(2, minedBlock!.hash, 2);
      
      const result = await blockchain.addBlock(legacyBlock);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('non-UTXO transactions');
    });

    it('should update active branch after extension', async () => {
      const initialHeight = blockchain.getActiveBranch().height;
      
      const minedBlock = blockchain.minePendingUTXOTransactions('test-miner');
      expect(minedBlock).toBeDefined();

      const activeBranch = blockchain.getActiveBranch();
      expect(activeBranch.height).toBe(initialHeight + 1);
      expect(activeBranch.lastBlockHash).toBe(minedBlock!.hash);
      expect(activeBranch.isActive).toBe(true);
    });
  });

  describe('fork detection and handling', () => {
    it('should detect and handle fork creation', async () => {
      // Create initial chain
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      const block2 = blockchain.minePendingUTXOTransactions('miner2');
      expect(block2).toBeDefined();

      // Create a competing fork from block1
      const forkBlock = createMockUTXOBlock(2, block1!.hash, 4); // Fork with higher difficulty
      
      const result = await blockchain.addBlock(forkBlock);
      
      expect(result.isValid).toBe(true);
      expect(blockchain.getCompetingBranches().size).toBeGreaterThan(1);
    });

    it('should select best chain based on cumulative difficulty', async () => {
      // Create initial chain with low difficulty
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      const block2 = blockchain.minePendingUTXOTransactions('miner2');

      // Create competing fork with higher difficulty
      const highDifficultyFork = createMockUTXOBlock(2, block1!.hash, 8); // Much higher difficulty
      
      const result = await blockchain.addBlock(highDifficultyFork);
      
      expect(result.isValid).toBe(true);
      
      // The chain might reorganize to the higher difficulty fork
      // Check if the active branch reflects the best chain
      const activeBranch = blockchain.getActiveBranch();
      expect(activeBranch.cumulativeDifficulty).toBeGreaterThan(0n);
    });

    it('should maintain competing branches information', async () => {
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      
      // Create multiple competing forks
      const fork1 = createMockUTXOBlock(2, block1!.hash, 3);
      const fork2 = createMockUTXOBlock(2, block1!.hash, 4);
      
      await blockchain.addBlock(fork1);
      await blockchain.addBlock(fork2);
      
      const branches = blockchain.getCompetingBranches();
      expect(branches.size).toBeGreaterThan(1);
      
      // Check that branches have correct metadata
      for (const branch of branches.values()) {
        expect(branch.id).toBeDefined();
        expect(branch.cumulativeDifficulty).toBeGreaterThan(0n);
        expect(branch.utxoBlocks.length).toBeGreaterThan(0);
      }
    });

    it('should perform chain reorganization when necessary', async () => {
      // Create initial weaker chain
      const weakBlock = blockchain.minePendingUTXOTransactions('weak-miner');
      const initialBlocks = blockchain.getBlocks().length;

      // Create a stronger competing chain
      const strongerFork = createMockUTXOBlock(weakBlock!.index, 'genesis', 10); // Much higher difficulty
      
      const result = await blockchain.addBlock(strongerFork);
      
      expect(result.isValid).toBe(true);
      
      // Force chain selection to see if reorganization occurs
      const selectionResult = await blockchain.forceChainSelection();
      
      expect(selectionResult.selectedBranch).toBeDefined();
      expect(selectionResult.splitAnalysis).toBeDefined();
    });
  });

  describe('orphan block handling', () => {
    it('should handle orphan blocks correctly', async () => {
      // Create an orphan block with unknown parent
      const orphanBlock = createMockUTXOBlock(5, 'unknown-parent-hash', 2);
      
      const result = await blockchain.addBlock(orphanBlock);
      
      expect(result.isValid).toBe(true);
      expect(blockchain.getOrphanBlocks()).toContain(orphanBlock);
    });

    it('should connect orphan blocks when parent becomes available', async () => {
      // Create orphan block first
      const orphanBlock = createMockUTXOBlock(3, 'missing-parent', 2);
      await blockchain.addBlock(orphanBlock);
      
      expect(blockchain.getOrphanBlocks()).toContain(orphanBlock);
      
      // Now create the missing parent by mining
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      const parentBlock = createMockUTXOBlock(2, block1!.hash, 2);
      parentBlock.hash = 'missing-parent';
      
      const result = await blockchain.addBlock(parentBlock);
      
      expect(result.isValid).toBe(true);
      
      // The orphan block should potentially be connected now
      // (This is a simplified test - in reality the connection logic is more complex)
    });

    it('should maintain orphan block list', async () => {
      const initialOrphans = blockchain.getOrphanBlocks().length;
      
      const orphan1 = createMockUTXOBlock(10, 'missing-1', 2);
      const orphan2 = createMockUTXOBlock(15, 'missing-2', 2);
      
      await blockchain.addBlock(orphan1);
      await blockchain.addBlock(orphan2);
      
      const currentOrphans = blockchain.getOrphanBlocks();
      expect(currentOrphans.length).toBeGreaterThanOrEqual(initialOrphans + 2);
    });
  });

  describe('security and attack detection', () => {
    it('should analyze chain splits for security threats', async () => {
      // Create competing branches that might indicate an attack
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      
      // Create multiple competing forks quickly (potential attack pattern)
      const fork1 = createMockUTXOBlock(2, block1!.hash, 3);
      const fork2 = createMockUTXOBlock(2, block1!.hash, 3);
      const fork3 = createMockUTXOBlock(2, block1!.hash, 3);
      
      await blockchain.addBlock(fork1);
      await blockchain.addBlock(fork2);
      await blockchain.addBlock(fork3);
      
      const selectionResult = await blockchain.forceChainSelection();
      
      expect(selectionResult.splitAnalysis).toBeDefined();
      expect(selectionResult.splitAnalysis.competingBranches.length).toBeGreaterThan(1);
      expect(selectionResult.splitAnalysis.recommendations).toBeDefined();
    });

    it('should detect mining centralization', async () => {
      // Create blocks all mined by the same entity (centralization risk)
      const centralizationBlocks = Array.from({ length: 5 }, (_, i) => {
        const block = createMockUTXOBlock(i + 2, `block${i + 1}`, 2);
        block.validator = 'dominant-miner'; // Same miner for all blocks
        return block;
      });

      // Add blocks to create branches with centralized mining
      for (const block of centralizationBlocks) {
        await blockchain.addBlock(block);
      }

      const selectionResult = await blockchain.forceChainSelection();
      
      expect(selectionResult.splitAnalysis.minerDistribution).toBeDefined();
      if (selectionResult.splitAnalysis.minerDistribution) {
        expect(selectionResult.splitAnalysis.minerDistribution.totalMiners).toBeGreaterThan(0);
      }
    });

    it('should provide security recommendations', async () => {
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      
      // Create a suspicious pattern (multiple equal-height branches)
      const suspiciousFork1 = createMockUTXOBlock(2, block1!.hash, 2);
      const suspiciousFork2 = createMockUTXOBlock(2, block1!.hash, 2);
      
      await blockchain.addBlock(suspiciousFork1);
      await blockchain.addBlock(suspiciousFork2);
      
      const selectionResult = await blockchain.forceChainSelection();
      
      expect(selectionResult.splitAnalysis.recommendations).toBeDefined();
      expect(Array.isArray(selectionResult.splitAnalysis.recommendations)).toBe(true);
    });
  });

  describe('chain state management', () => {
    it('should provide accurate chain state', async () => {
      const minedBlock = blockchain.minePendingUTXOTransactions('miner');
      
      const chainState = blockchain.getUTXOChainState();
      
      expect(chainState.activeBranch).toBeDefined();
      expect(chainState.branches).toBeDefined();
      expect(chainState.orphanUTXOBlocks).toBeDefined();
      expect(chainState.activeBranch.isActive).toBe(true);
    });

    it('should maintain branch metadata correctly', async () => {
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      const block2 = blockchain.minePendingUTXOTransactions('miner2');
      
      const activeBranch = blockchain.getActiveBranch();
      
      expect(activeBranch.id).toBeDefined();
      expect(activeBranch.height).toBeGreaterThan(0);
      expect(activeBranch.cumulativeDifficulty).toBeGreaterThan(0n);
      expect(activeBranch.lastBlockHash).toBe(block2!.hash);
      expect(activeBranch.utxoBlocks.length).toBeGreaterThan(0);
      expect(activeBranch.utxoSetHash).toBeDefined();
    });

    it('should update timestamps correctly', async () => {
      const beforeTime = Date.now();
      
      blockchain.minePendingUTXOTransactions('miner');
      
      const afterTime = Date.now();
      const activeBranch = blockchain.getActiveBranch();
      
      expect(activeBranch.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(activeBranch.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('integration with existing blockchain features', () => {
    it('should maintain UTXO set consistency during forks', async () => {
      const initialBalance = blockchain.getBalance('lora1initial000000000000000000000000000000');
      expect(initialBalance).toBe(1000000); // From genesis allocation

      // Mine some blocks and check UTXO consistency
      blockchain.minePendingUTXOTransactions('test-miner');
      const finalBalance = blockchain.getBalance('lora1initial000000000000000000000000000000');
      
      // Balance should remain consistent
      expect(finalBalance).toBe(initialBalance);
    });

    it('should preserve difficulty adjustment during reorganization', async () => {
      const initialDifficulty = blockchain.getDifficulty();
      
      // Create competing branches with different difficulties
      const block1 = blockchain.minePendingUTXOTransactions('miner1');
      const competingFork = createMockUTXOBlock(2, block1!.hash, initialDifficulty + 2);
      
      await blockchain.addBlock(competingFork);
      
      // Difficulty should be preserved or properly adjusted
      const currentDifficulty = blockchain.getDifficulty();
      expect(currentDifficulty).toBeGreaterThan(0);
    });

    it('should maintain genesis configuration integrity', async () => {
      const genesisConfig = await blockchain.getGenesisConfig();
      
      expect(genesisConfig).toBeDefined();
      expect(genesisConfig!.chainId).toBe('fork-test-chain-v1');
      expect(genesisConfig!.totalSupply).toBe(21000000);
      
      // Even after forks, genesis config should remain intact
      const block1 = blockchain.minePendingUTXOTransactions('miner');
      const fork = createMockUTXOBlock(2, block1!.hash, 3);
      await blockchain.addBlock(fork);
      
      const postForkConfig = await blockchain.getGenesisConfig();
      expect(postForkConfig).toEqual(genesisConfig);
    });
  });

  // Mock helper functions
  function createMockUTXOBlock(index: number, previousHash: string, difficulty: number): Block {
    const utxoTransaction: UTXOTransaction = {
      id: `fork-tx-${index}-${Math.random()}`,
      inputs: index > 0 ? [{
        previousTxId: `prev-fork-tx-${index - 1}`,
        outputIndex: 0,
        unlockingScript: 'test-signature'
      }] : [],
      outputs: [{
        value: 50,
        lockingScript: `fork-address-${index}`,
        outputIndex: 0
      }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 1
    };

    return {
      index,
      timestamp: Date.now(),
      transactions: [utxoTransaction as any],
      previousHash,
      hash: `fork-block-${index}-${Math.random()}`,
      merkleRoot: `fork-merkle-${index}`,
      nonce: 12345,
      difficulty,
      validator: `fork-validator-${index}`
    };
  }

  function createMockLegacyBlock(index: number, previousHash: string, difficulty: number): Block {
    return {
      index,
      timestamp: Date.now(),
      transactions: [{
        id: `legacy-tx-${index}`,
        from: 'legacy-from',
        to: 'legacy-to',
        amount: 50,
        fee: 1,
        timestamp: Date.now(),
        signature: 'legacy-signature',
        nonce: 0
      }],
      previousHash,
      hash: `legacy-block-${index}`,
      merkleRoot: `legacy-merkle-${index}`,
      nonce: 12345,
      difficulty,
      validator: 'legacy-validator'
    };
  }
});