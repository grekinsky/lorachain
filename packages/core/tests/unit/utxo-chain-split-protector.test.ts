import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOChainSplitProtector } from '../../src/utxo-chain-split-protector.js';
import { NodeDiscoveryProtocol } from '../../src/node-discovery-protocol.js';
import type {
  Block,
  UTXOTransaction,
  UTXOChainBranch,
  UTXOChainConfig,
  EnhancedNetworkTopology
} from '../../src/types.js';

describe('UTXOChainSplitProtector (NO BACKWARDS COMPATIBILITY)', () => {
  let splitProtector: UTXOChainSplitProtector;
  let nodeDiscovery: NodeDiscoveryProtocol;
  let config: UTXOChainConfig;

  beforeEach(() => {
    config = {
      maxReorganizationDepth: 10,
      suspiciousSplitThreshold: 6,
      nodeDiscoveryEnabled: true,
      maxMessageSize: 256,
      forkDetectionEnabled: true,
      attackDetectionEnabled: true,
      minConfirmationsForFinality: 6
    };

    nodeDiscovery = new NodeDiscoveryProtocol(config);
    splitProtector = new UTXOChainSplitProtector(config, nodeDiscovery);
  });

  describe('analyzeUTXOChainSplit', () => {
    it('should detect no split for single branch', () => {
      const singleBranch = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(singleBranch);

      expect(analysis.isSuspicious).toBe(false);
      expect(analysis.riskLevel).toBe('low');
      expect(analysis.recommendations).toContain('Single chain - no split detected');
    });

    it('should detect deep split as suspicious', () => {
      const branches = new Map([
        ['main', createMockBranch('main', 10, 20n)],
        ['fork', createMockBranch('fork', 3, 15n)] // Deep split
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(branches);

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.splitDepth).toBe(7); // 10 - 3
      expect(analysis.recommendations.some(r => r.includes('Deep chain split'))).toBe(true);
    });

    it('should detect equal-length competing chains', () => {
      const branches = new Map([
        ['branch1', createMockBranch('branch1', 5, 10n)],
        ['branch2', createMockBranch('branch2', 5, 12n)],
        ['branch3', createMockBranch('branch3', 5, 8n)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(branches);

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.recommendations.some(r => r.includes('equal length'))).toBe(true);
    });

    it('should analyze mining distribution', () => {
      const branchWithDominantMiner = new Map([
        ['main', createMockBranchWithMiner('main', 5, 10n, 'dominant-miner', 0.8)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(branchWithDominantMiner);

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.minerDistribution?.dominantMinerPercentage).toBeGreaterThan(0.6);
      expect(analysis.recommendations.some(r => r.includes('51% attack'))).toBe(true);
    });

    it('should cache analysis results', () => {
      const branches = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      const analysis1 = splitProtector.analyzeUTXOChainSplit(branches);
      const analysis2 = splitProtector.analyzeUTXOChainSplit(branches);

      // Should return same cached result
      expect(analysis1.timestamp).toBe(analysis2.timestamp);
    });

    it('should handle no valid UTXO branches', () => {
      const invalidBranches = new Map([
        ['invalid', createMockInvalidBranch('invalid')]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(invalidBranches);

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.recommendations.some(r => r.includes('No valid UTXO branches'))).toBe(true);
    });
  });

  describe('detectSelfishMining', () => {
    it('should detect anomalous block intervals', () => {
      const branchWithAnomalousIntervals = [
        createMockBranchWithIntervals('selfish', [100, 50, 25, 300, 200]) // Fast then slow
      ];

      const result = splitProtector.detectSelfishMining(branchWithAnomalousIntervals);

      expect(result).toBe(true);
    });

    it('should detect difficulty manipulation', () => {
      const branchWithDifficultySpikes = [
        createMockBranchWithDifficulties('manipulation', [2, 8, 2, 2, 2]) // Spike then normal
      ];

      const result = splitProtector.detectSelfishMining(branchWithDifficultySpikes);

      expect(result).toBe(true);
    });

    it('should not flag normal mining patterns', () => {
      const normalBranch = [
        createMockBranchWithIntervals('normal', [200, 180, 220, 190, 210]) // Normal variation
      ];

      const result = splitProtector.detectSelfishMining(normalBranch);

      expect(result).toBe(false);
    });

    it('should handle insufficient data gracefully', () => {
      const shortBranch = [
        createMockBranchWithIntervals('short', [200]) // Too short to analyze
      ];

      const result = splitProtector.detectSelfishMining(shortBranch);

      expect(result).toBe(false);
    });
  });

  describe('detectEclipseAttack', () => {
    it('should detect low node connectivity', () => {
      const mockTopology: EnhancedNetworkTopology = {
        nodes: new Map([
          ['node1', { id: 'node1', lastSeen: Date.now(), isActive: true }],
          ['node2', { id: 'node2', lastSeen: Date.now(), isActive: true }]
        ]),
        links: new Map([
          ['node1', new Set(['node2'])],
          ['node2', new Set(['node1'])]
        ]),
        lastUpdated: Date.now()
      };

      const branches = [createMockBranch('isolated', 5, 10n)];

      const result = splitProtector.detectEclipseAttack(branches, mockTopology);

      expect(result).toBe(true); // Low connectivity should be detected
    });

    it('should detect chains known by few nodes', () => {
      const healthyTopology: EnhancedNetworkTopology = {
        nodes: new Map([
          ['node1', { id: 'node1', lastSeen: Date.now(), isActive: true }],
          ['node2', { id: 'node2', lastSeen: Date.now(), isActive: true }],
          ['node3', { id: 'node3', lastSeen: Date.now(), isActive: true }],
          ['node4', { id: 'node4', lastSeen: Date.now(), isActive: true }],
          ['node5', { id: 'node5', lastSeen: Date.now(), isActive: true }]
        ]),
        links: new Map(),
        lastUpdated: Date.now()
      };

      const branches = [createMockBranch('isolated-chain', 5, 10n)];

      const result = splitProtector.detectEclipseAttack(branches, healthyTopology);

      expect(result).toBe(true); // Chain known by few nodes
    });

    it('should handle missing topology gracefully', () => {
      const branches = [createMockBranch('test', 5, 10n)];

      const result = splitProtector.detectEclipseAttack(branches, undefined);

      expect(result).toBe(false);
    });
  });

  describe('detectLongRangeAttack', () => {
    it('should detect old branch with recent activity', () => {
      const now = Date.now();
      const oldBranch = createMockBranch('old', 5, 10n);
      
      // Make first block very old, last block very recent
      oldBranch.utxoBlocks[0].timestamp = now - (25 * 60 * 60 * 1000); // 25 hours ago
      oldBranch.utxoBlocks[oldBranch.utxoBlocks.length - 1].timestamp = now - (30 * 60 * 1000); // 30 minutes ago

      const result = splitProtector.detectLongRangeAttack([oldBranch]);

      expect(result).toBe(true);
    });

    it('should detect rapid historical mining', () => {
      const rapidBranch = createMockBranchWithRapidMining('rapid', 10);

      const result = splitProtector.detectLongRangeAttack([rapidBranch]);

      expect(result).toBe(true);
    });

    it('should not flag normal historical chains', () => {
      const normalBranch = createMockBranch('normal', 5, 10n);

      const result = splitProtector.detectLongRangeAttack([normalBranch]);

      expect(result).toBe(false);
    });

    it('should handle insufficient block data', () => {
      const shortBranch = createMockBranch('short', 1, 2n);

      const result = splitProtector.detectLongRangeAttack([shortBranch]);

      expect(result).toBe(false);
    });
  });

  describe('validateChainIntegrity', () => {
    it('should validate correct chain structure', () => {
      const validBranch = createMockBranch('valid', 5, 10n);

      const result = splitProtector.validateChainIntegrity(validBranch);

      expect(result).toBe(true);
    });

    it('should reject empty branch', () => {
      const emptyBranch = createMockBranch('empty', 0, 0n);

      const result = splitProtector.validateChainIntegrity(emptyBranch);

      expect(result).toBe(false);
    });

    it('should detect chain discontinuity', () => {
      const discontinuousBranch = createMockBranch('broken', 3, 6n);
      // Break the chain continuity
      discontinuousBranch.utxoBlocks[1].previousHash = 'wrong-hash';

      const result = splitProtector.validateChainIntegrity(discontinuousBranch);

      expect(result).toBe(false);
    });

    it('should reject non-UTXO blocks', () => {
      const branchWithLegacy = createMockBranch('legacy', 2, 4n);
      // Replace with legacy transaction
      branchWithLegacy.utxoBlocks[0].transactions = [{
        id: 'legacy-tx',
        from: 'legacy-from',
        to: 'legacy-to',
        amount: 100,
        fee: 1,
        timestamp: Date.now(),
        signature: 'signature',
        nonce: 0
      }] as any;

      const result = splitProtector.validateChainIntegrity(branchWithLegacy);

      expect(result).toBe(false);
    });

    it('should handle validation errors gracefully', () => {
      const corruptBranch = {
        ...createMockBranch('corrupt', 1, 2n),
        utxoBlocks: null as any
      };

      const result = splitProtector.validateChainIntegrity(corruptBranch);

      expect(result).toBe(false);
    });
  });

  describe('network topology analysis', () => {
    it('should analyze healthy network topology', () => {
      const healthyBranches = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      // Mock healthy topology
      const mockTopology: EnhancedNetworkTopology = {
        nodes: new Map([
          ['node1', { id: 'node1', lastSeen: Date.now(), isActive: true }],
          ['node2', { id: 'node2', lastSeen: Date.now(), isActive: true }],
          ['node3', { id: 'node3', lastSeen: Date.now(), isActive: true }],
          ['node4', { id: 'node4', lastSeen: Date.now(), isActive: true }],
          ['node5', { id: 'node5', lastSeen: Date.now(), isActive: true }]
        ]),
        links: new Map([
          ['node1', new Set(['node2', 'node3'])],
          ['node2', new Set(['node1', 'node3', 'node4'])],
          ['node3', new Set(['node1', 'node2', 'node4', 'node5'])],
          ['node4', new Set(['node2', 'node3', 'node5'])],
          ['node5', new Set(['node3', 'node4'])]
        ]),
        lastUpdated: Date.now()
      };

      // Mock nodeDiscovery to return healthy topology
      jest.spyOn(splitProtector as any, 'getNetworkTopology').mockReturnValue(mockTopology);

      const analysis = splitProtector.analyzeUTXOChainSplit(healthyBranches);

      expect(analysis.networkTopology?.connectedNodes).toBe(5);
      expect(analysis.networkTopology?.partitionDetected).toBe(false);
    });

    it('should detect network partitions', () => {
      const branches = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      // Mock partitioned topology
      const partitionedTopology: EnhancedNetworkTopology = {
        nodes: new Map([
          ['node1', { id: 'node1', lastSeen: Date.now(), isActive: true }],
          ['node2', { id: 'node2', lastSeen: Date.now(), isActive: true }],
          ['node3', { id: 'node3', lastSeen: Date.now(), isActive: true }]
        ]),
        links: new Map([
          ['node1', new Set()], // Isolated nodes
          ['node2', new Set(['node3'])],
          ['node3', new Set(['node2'])]
        ]),
        lastUpdated: Date.now()
      };

      jest.spyOn(splitProtector as any, 'getNetworkTopology').mockReturnValue(partitionedTopology);

      const analysis = splitProtector.analyzeUTXOChainSplit(branches);

      expect(analysis.isSuspicious).toBe(true);
      expect(analysis.networkTopology?.partitionDetected).toBe(true);
      expect(analysis.recommendations.some(r => r.includes('partition'))).toBe(true);
    });

    it('should handle missing node discovery gracefully', () => {
      const protectorWithoutDiscovery = new UTXOChainSplitProtector(config);
      const branches = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      const analysis = protectorWithoutDiscovery.analyzeUTXOChainSplit(branches);

      expect(analysis.recommendations.some(r => r.includes('node discovery'))).toBe(true);
    });
  });

  describe('security recommendations', () => {
    it('should provide appropriate recommendations for high risk', () => {
      const highRiskBranches = new Map([
        ['main', createMockBranchWithMiner('main', 5, 10n, 'dominant', 0.9)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(highRiskBranches);

      expect(analysis.riskLevel).toBe('high');
      expect(analysis.recommendations.some(r => r.includes('unsafe'))).toBe(true);
      expect(analysis.recommendations.some(r => r.includes('emergency'))).toBe(true);
    });

    it('should provide monitoring recommendations for medium risk', () => {
      const mediumRiskBranches = new Map([
        ['main', createMockBranchWithMiner('main', 5, 10n, 'concentrated', 0.5)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(mediumRiskBranches);

      expect(analysis.riskLevel).toBe('medium');
      expect(analysis.recommendations.some(r => r.includes('concentration'))).toBe(true);
    });

    it('should provide reassuring message for low risk', () => {
      const lowRiskBranches = new Map([
        ['main', createMockBranch('main', 5, 10n)]
      ]);

      const analysis = splitProtector.analyzeUTXOChainSplit(lowRiskBranches);

      expect(analysis.riskLevel).toBe('low');
      expect(analysis.recommendations.some(r => r.includes('healthy'))).toBe(true);
    });
  });

  // Mock helper functions
  function createMockBranch(id: string, height: number, cumulativeDifficulty: bigint): UTXOChainBranch {
    const blocks = Array.from({ length: height + 1 }, (_, i) => createMockBlock(i, i === 0 ? 'genesis' : `block${i-1}`));
    
    return {
      id,
      utxoBlocks: blocks,
      height,
      cumulativeDifficulty,
      totalWork: cumulativeDifficulty,
      utxoMerkleRoot: `merkle-${id}`,
      lastBlockHash: blocks[blocks.length - 1]?.hash || '',
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `utxo-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined
    };
  }

  function createMockBranchWithMiner(id: string, height: number, cumulativeDifficulty: bigint, miner: string, dominance: number): UTXOChainBranch {
    const branch = createMockBranch(id, height, cumulativeDifficulty);
    
    // Set dominant miner for specified percentage of blocks
    const dominantBlocks = Math.floor(branch.utxoBlocks.length * dominance);
    for (let i = 0; i < dominantBlocks; i++) {
      branch.utxoBlocks[i].validator = miner;
    }
    
    return branch;
  }

  function createMockBranchWithIntervals(id: string, intervals: number[]): UTXOChainBranch {
    const blocks: Block[] = [];
    let timestamp = Date.now() - intervals.reduce((sum, interval) => sum + interval, 0);
    
    for (let i = 0; i < intervals.length + 1; i++) {
      blocks.push({
        ...createMockBlock(i, i === 0 ? 'genesis' : `block${i-1}`),
        timestamp
      });
      
      if (i < intervals.length) {
        timestamp += intervals[i];
      }
    }
    
    return {
      id,
      utxoBlocks: blocks,
      height: blocks.length - 1,
      cumulativeDifficulty: BigInt(blocks.length * 2),
      totalWork: BigInt(blocks.length * 2),
      utxoMerkleRoot: `merkle-${id}`,
      lastBlockHash: blocks[blocks.length - 1].hash,
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `utxo-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined
    };
  }

  function createMockBranchWithDifficulties(id: string, difficulties: number[]): UTXOChainBranch {
    const blocks = difficulties.map((difficulty, i) => ({
      ...createMockBlock(i, i === 0 ? 'genesis' : `block${i-1}`),
      difficulty
    }));
    
    return {
      id,
      utxoBlocks: blocks,
      height: blocks.length - 1,
      cumulativeDifficulty: BigInt(difficulties.reduce((sum, d) => sum + d, 0)),
      totalWork: BigInt(difficulties.reduce((sum, d) => sum + d, 0)),
      utxoMerkleRoot: `merkle-${id}`,
      lastBlockHash: blocks[blocks.length - 1].hash,
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `utxo-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined
    };
  }

  function createMockBranchWithRapidMining(id: string, blockCount: number): UTXOChainBranch {
    const now = Date.now();
    const rapidInterval = 30000; // 30 seconds between blocks (very fast)
    
    const blocks = Array.from({ length: blockCount }, (_, i) => ({
      ...createMockBlock(i, i === 0 ? 'genesis' : `block${i-1}`),
      timestamp: now - ((blockCount - i) * rapidInterval)
    }));
    
    return {
      id,
      utxoBlocks: blocks,
      height: blockCount - 1,
      cumulativeDifficulty: BigInt(blockCount * 2),
      totalWork: BigInt(blockCount * 2),
      utxoMerkleRoot: `rapid-merkle-${id}`,
      lastBlockHash: blocks[blocks.length - 1].hash,
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `rapid-utxo-${id}`,
      timestamp: now,
      parentBranchId: undefined
    };
  }

  function createMockBlock(index: number, previousHash: string): Block {
    const utxoTransaction: UTXOTransaction = {
      id: `tx-${index}-${Math.random()}`,
      inputs: index > 0 ? [{
        previousTxId: `prev-tx-${index - 1}`,
        outputIndex: 0,
        unlockingScript: 'signature'
      }] : [],
      outputs: [{
        value: 50,
        lockingScript: `address-${index}`,
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
      hash: `${previousHash}-${index}`,
      merkleRoot: `merkle${index}`,
      nonce: 12345,
      difficulty: 2,
      validator: 'default-validator'
    };
  }

  function createMockInvalidBranch(id: string): UTXOChainBranch {
    return {
      id,
      utxoBlocks: [], // Invalid: empty blocks
      height: 0,
      cumulativeDifficulty: 0n,
      totalWork: 0n,
      utxoMerkleRoot: '',
      lastBlockHash: '',
      branchPoint: 0,
      isActive: false,
      utxoSetHash: `invalid-${id}`,
      timestamp: Date.now(),
      parentBranchId: undefined
    };
  }
});