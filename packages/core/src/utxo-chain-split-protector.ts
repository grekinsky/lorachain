import {
  UTXOChainBranch,
  UTXOChainConfig,
  UTXOChainSplitAnalysis,
  IUTXOChainSplitProtector,
  EnhancedNetworkTopology,
  Block,
  UTXOTransaction,
} from './types.js';
import { NodeDiscoveryProtocol } from './node-discovery-protocol.js';

/**
 * UTXO Chain Split Protector - NO BACKWARDS COMPATIBILITY
 *
 * Detects and analyzes blockchain attacks and suspicious chain splits.
 * Integrates with existing NodeDiscoveryProtocol for network topology awareness.
 *
 * Key Features:
 * - Attack detection: selfish mining, eclipse attacks, long-range attacks
 * - Chain split analysis with security risk assessment
 * - Network topology integration using existing NodeDiscoveryProtocol
 * - Mining distribution analysis for centralization detection
 * - LoRa mesh network partition detection
 * - Security recommendations based on threat analysis
 */
export class UTXOChainSplitProtector implements IUTXOChainSplitProtector {
  private readonly logger = console;
  private readonly config: UTXOChainConfig;
  private readonly nodeDiscovery?: NodeDiscoveryProtocol;

  // Security analysis caches and history
  private readonly analysisCache = new Map<string, UTXOChainSplitAnalysis>();
  private readonly minerHistoryCache = new Map<
    string,
    { blocks: number; lastSeen: number }
  >();
  private readonly suspiciousPatterns = new Set<string>();

  constructor(config: UTXOChainConfig, nodeDiscovery?: NodeDiscoveryProtocol) {
    this.config = config;
    this.nodeDiscovery = nodeDiscovery;

    this.logger.info(
      'UTXOChainSplitProtector initialized with UTXO-only security monitoring'
    );
  }

  /**
   * Analyze UTXO chain split for security threats
   * Integrates with existing NodeDiscoveryProtocol for topology awareness
   */
  analyzeUTXOChainSplit(
    branches: Map<string, UTXOChainBranch>
  ): UTXOChainSplitAnalysis {
    const startTime = Date.now();
    this.logger.info(
      `Analyzing UTXO chain split across ${branches.size} branches`
    );

    const cacheKey = Array.from(branches.keys()).sort().join('-');

    // Check cache first
    if (this.analysisCache.has(cacheKey)) {
      const cachedAnalysis = this.analysisCache.get(cacheKey)!;
      // Use cached result if less than 30 seconds old
      if (Date.now() - cachedAnalysis.timestamp < 30000) {
        return cachedAnalysis;
      }
    }

    const analysis: UTXOChainSplitAnalysis = {
      isSuspicious: false,
      splitDepth: 0,
      competingBranches: [],
      riskLevel: 'low',
      recommendations: [],
      timestamp: Date.now(),
    };

    try {
      // Sort branches by height (longest first)
      const sortedBranches = Array.from(branches.values())
        .filter(branch => this.validateChainIntegrity(branch))
        .sort((a, b) => b.height - a.height);

      if (sortedBranches.length === 0) {
        analysis.riskLevel = 'high';
        analysis.isSuspicious = true;
        analysis.recommendations.push(
          'No valid UTXO branches found - potential data corruption'
        );
        return this.cacheAndReturn(cacheKey, analysis);
      }

      analysis.competingBranches = sortedBranches.slice(0, 5); // Top 5 branches

      // Check for single branch (no split)
      if (branches.size <= 1) {
        analysis.recommendations.push('Single chain - no split detected');
        // Still analyze mining distribution for security
        this.analyzeMiningDistribution(analysis, sortedBranches);
        this.generateSecurityRecommendations(analysis);
        return this.cacheAndReturn(cacheKey, analysis);
      }

      const primaryBranch = sortedBranches[0];
      const secondaryBranch = sortedBranches[1];

      // Calculate split depth
      if (secondaryBranch) {
        analysis.splitDepth = Math.abs(
          primaryBranch.height - secondaryBranch.height
        );
      }

      // Detect suspicious patterns
      this.detectDeepSplit(analysis, primaryBranch, secondaryBranch);
      this.detectEqualLengthChains(analysis, sortedBranches);
      this.analyzeMiningDistribution(analysis, sortedBranches);

      // Advanced attack detection
      if (this.detectSelfishMining(sortedBranches)) {
        this.addSecurityThreat(
          analysis,
          'Selfish mining pattern detected',
          'high'
        );
      }

      if (this.detectEclipseAttack(sortedBranches, this.getNetworkTopology())) {
        this.addSecurityThreat(
          analysis,
          'Potential eclipse attack detected',
          'high'
        );
      }

      if (this.detectLongRangeAttack(sortedBranches)) {
        this.addSecurityThreat(
          analysis,
          'Long-range attack pattern detected',
          'high'
        );
      }

      // Network topology analysis
      this.analyzeNetworkTopology(analysis);

      // Generate final recommendations
      this.generateSecurityRecommendations(analysis);

      const processingTime = Date.now() - startTime;
      this.logger.info(
        `Chain split analysis completed in ${processingTime}ms - Risk: ${analysis.riskLevel}`
      );

      return this.cacheAndReturn(cacheKey, analysis);
    } catch (error) {
      this.logger.error(
        `Chain split analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      analysis.riskLevel = 'high';
      analysis.isSuspicious = true;
      analysis.recommendations.push(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return analysis;
    }
  }

  /**
   * Detect selfish mining patterns in UTXO branches
   */
  detectSelfishMining(branches: UTXOChainBranch[]): boolean {
    this.logger.debug('Analyzing for selfish mining patterns');

    // Look for patterns of withheld blocks followed by rapid release
    for (const branch of branches) {
      const recentBlocks = branch.utxoBlocks.slice(-20); // Last 20 blocks
      const blockIntervals = this.calculateBlockIntervals(recentBlocks);

      if (this.hasAnomalousIntervals(blockIntervals)) {
        this.logger.warn(
          `Anomalous block intervals detected in branch ${branch.id}`
        );
        return true;
      }

      // Check for sudden difficulty spikes followed by normal mining
      if (this.detectDifficultyManipulation(recentBlocks)) {
        this.logger.warn(
          `Difficulty manipulation detected in branch ${branch.id}`
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Detect eclipse attack patterns
   */
  detectEclipseAttack(
    branches: UTXOChainBranch[],
    topology?: EnhancedNetworkTopology
  ): boolean {
    this.logger.debug('Analyzing for eclipse attack patterns');

    if (!topology) {
      this.logger.debug(
        'No network topology available for eclipse attack detection'
      );
      return false;
    }

    // Check for network isolation patterns
    const connectedNodes = topology.nodes.size;
    const expectedNodes = this.config.nodeDiscoveryEnabled ? 10 : 5; // Estimated minimum

    if (connectedNodes < expectedNodes * 0.3) {
      // Less than 30% of expected nodes
      this.logger.warn(
        `Low node connectivity detected: ${connectedNodes} nodes (expected ~${expectedNodes})`
      );
      return true;
    }

    // Check for chains that are only known by a small subset of nodes
    for (const branch of branches) {
      const knownByNodes = this.countNodesKnowingBranch(branch, topology);
      if (knownByNodes < connectedNodes * 0.1) {
        // Less than 10% of nodes know this chain
        this.logger.warn(
          `Chain ${branch.id} known by only ${knownByNodes}/${connectedNodes} nodes`
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Detect long-range attack patterns
   */
  detectLongRangeAttack(branches: UTXOChainBranch[]): boolean {
    this.logger.debug('Analyzing for long-range attack patterns');

    const currentTime = Date.now();

    for (const branch of branches) {
      // Check for very old branches with recent activity
      const oldestBlock = branch.utxoBlocks[0];
      const newestBlock = branch.utxoBlocks[branch.utxoBlocks.length - 1];

      if (oldestBlock && newestBlock) {
        const branchSpan = newestBlock.timestamp - oldestBlock.timestamp;
        const timeSinceNewestBlock = currentTime - newestBlock.timestamp;

        // Suspicious if branch spans a long time but has very recent activity
        if (
          branchSpan > 24 * 60 * 60 * 1000 &&
          timeSinceNewestBlock < 60 * 60 * 1000
        ) {
          // 24h span, 1h recent
          this.logger.warn(
            `Potential long-range attack: branch ${branch.id} spans ${branchSpan / 1000 / 60 / 60}h but has recent activity`
          );
          return true;
        }
      }

      // Check for rapid mining of old blocks
      if (this.detectRapidHistoricalMining(branch)) {
        this.logger.warn(
          `Rapid historical mining detected in branch ${branch.id}`
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Validate UTXO chain integrity
   */
  validateChainIntegrity(branch: UTXOChainBranch): boolean {
    try {
      // Validate branch structure
      if (!branch.utxoBlocks || branch.utxoBlocks.length === 0) {
        return false;
      }

      // Validate chain continuity
      for (let i = 1; i < branch.utxoBlocks.length; i++) {
        const prevBlock = branch.utxoBlocks[i - 1];
        const currentBlock = branch.utxoBlocks[i];

        if (currentBlock.previousHash !== prevBlock.hash) {
          this.logger.warn(
            `Chain discontinuity in branch ${branch.id} at height ${currentBlock.index}`
          );
          return false;
        }
      }

      // Validate all blocks contain only UTXO transactions
      for (const block of branch.utxoBlocks) {
        if (!this.validateUTXOOnlyBlock(block)) {
          this.logger.warn(
            `Non-UTXO block detected in branch ${branch.id} at height ${block.index}`
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Chain integrity validation failed for branch ${branch.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  /**
   * Detect deep split between primary and secondary branches
   */
  private detectDeepSplit(
    analysis: UTXOChainSplitAnalysis,
    primaryBranch: UTXOChainBranch,
    secondaryBranch?: UTXOChainBranch
  ): void {
    if (!secondaryBranch) return;

    const splitDepth = Math.abs(primaryBranch.height - secondaryBranch.height);

    if (splitDepth > this.config.suspiciousSplitThreshold) {
      this.addSecurityThreat(
        analysis,
        `Deep chain split detected: ${splitDepth} blocks`,
        'high'
      );
      analysis.splitDepth = splitDepth;
    }
  }

  /**
   * Detect equal-length competing chains
   */
  private detectEqualLengthChains(
    analysis: UTXOChainSplitAnalysis,
    branches: UTXOChainBranch[]
  ): void {
    if (branches.length < 2) return;

    const primaryHeight = branches[0].height;
    const equalLengthBranches = branches.filter(
      b => b.height === primaryHeight
    );

    if (equalLengthBranches.length > 1) {
      this.addSecurityThreat(
        analysis,
        `${equalLengthBranches.length} chains of equal length detected - potential attack`,
        'medium'
      );
    }
  }

  /**
   * Analyze mining distribution across branches
   */
  private analyzeMiningDistribution(
    analysis: UTXOChainSplitAnalysis,
    branches: UTXOChainBranch[]
  ): void {
    const minerCounts = new Map<string, number>();
    let totalBlocks = 0;

    // Count blocks per miner across all branches
    for (const branch of branches) {
      for (const block of branch.utxoBlocks) {
        if (block.validator) {
          minerCounts.set(
            block.validator,
            (minerCounts.get(block.validator) || 0) + 1
          );
          totalBlocks++;
        }
      }
    }

    if (totalBlocks === 0) return;

    const sortedMiners = Array.from(minerCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    const minerDistribution = {
      totalMiners: minerCounts.size,
      dominantMiner: sortedMiners[0]?.[0] || 'unknown',
      dominantMinerPercentage:
        totalBlocks > 0 ? (sortedMiners[0]?.[1] || 0) / totalBlocks : 0,
      minerDistribution: sortedMiners,
    };

    analysis.minerDistribution = minerDistribution;

    // Check for mining centralization
    if (minerDistribution.dominantMinerPercentage > 0.6) {
      this.addSecurityThreat(
        analysis,
        `Single miner dominance: ${(minerDistribution.dominantMinerPercentage * 100).toFixed(1)}% - potential 51% attack`,
        'high'
      );
    } else if (minerDistribution.dominantMinerPercentage > 0.4) {
      this.addSecurityThreat(
        analysis,
        `High miner concentration: ${(minerDistribution.dominantMinerPercentage * 100).toFixed(1)}%`,
        'medium'
      );
    }
  }

  /**
   * Analyze network topology for security implications
   */
  private analyzeNetworkTopology(analysis: UTXOChainSplitAnalysis): void {
    const topology = this.getNetworkTopology();

    if (!topology) {
      analysis.recommendations.push(
        'Enable node discovery for enhanced security monitoring'
      );
      return;
    }

    const connectedNodes = topology.nodes.size;
    const isolatedNodes = this.countIsolatedNodes(topology);
    const partitionDetected = this.detectNetworkPartition(topology);

    analysis.networkTopology = {
      connectedNodes,
      isolatedNodes,
      partitionDetected,
    };

    if (partitionDetected) {
      this.addSecurityThreat(
        analysis,
        'Network partition detected - potential eclipse attack',
        'high'
      );
    }

    if (isolatedNodes > connectedNodes * 0.2) {
      this.addSecurityThreat(
        analysis,
        `High number of isolated nodes: ${isolatedNodes}`,
        'medium'
      );
    }
  }

  /**
   * Generate security recommendations based on analysis
   */
  private generateSecurityRecommendations(
    analysis: UTXOChainSplitAnalysis
  ): void {
    if (analysis.riskLevel === 'low' && !analysis.isSuspicious) {
      analysis.recommendations.push(
        'Chain appears healthy - continue normal operations'
      );
      return;
    }

    if (analysis.splitDepth > this.config.suspiciousSplitThreshold) {
      analysis.recommendations.push(
        'Wait for additional confirmations before considering transactions final'
      );
      analysis.recommendations.push(
        'Monitor network for potential attack patterns'
      );
    }

    if (
      analysis.minerDistribution?.dominantMinerPercentage &&
      analysis.minerDistribution.dominantMinerPercentage > 0.5
    ) {
      analysis.recommendations.push(
        'Critical: Single entity controls majority of mining - consider network unsafe'
      );
      analysis.recommendations.push('Implement emergency response procedures');
    }

    if (analysis.networkTopology?.partitionDetected) {
      analysis.recommendations.push(
        'Network partition detected - verify connectivity to honest nodes'
      );
      analysis.recommendations.push(
        'Consider waiting for network healing before processing transactions'
      );
    }
  }

  /**
   * Add security threat to analysis
   */
  private addSecurityThreat(
    analysis: UTXOChainSplitAnalysis,
    message: string,
    riskLevel: 'low' | 'medium' | 'high'
  ): void {
    analysis.isSuspicious = true;
    analysis.recommendations.push(message);

    // Escalate risk level if necessary
    if (
      riskLevel === 'high' ||
      (riskLevel === 'medium' && analysis.riskLevel === 'low')
    ) {
      analysis.riskLevel = riskLevel;
    }
  }

  /**
   * Helper methods for attack detection
   */
  private calculateBlockIntervals(blocks: Block[]): number[] {
    const intervals: number[] = [];
    for (let i = 1; i < blocks.length; i++) {
      intervals.push(blocks[i].timestamp - blocks[i - 1].timestamp);
    }
    return intervals;
  }

  private hasAnomalousIntervals(intervals: number[]): boolean {
    if (intervals.length < 5) return false;

    const avgInterval =
      intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const threshold = avgInterval * 0.1; // Very fast blocks (10% of average)

    // Look for clusters of very fast blocks
    let fastBlockCount = 0;
    for (const interval of intervals) {
      if (interval < threshold) {
        fastBlockCount++;
      }
    }

    return fastBlockCount > intervals.length * 0.3; // More than 30% are suspiciously fast
  }

  private detectDifficultyManipulation(blocks: Block[]): boolean {
    if (blocks.length < 5) return false;

    const difficulties = blocks.map(b => b.difficulty);
    const avgDifficulty =
      difficulties.reduce((sum, diff) => sum + diff, 0) / difficulties.length;

    // Look for sudden spikes followed by normal levels
    for (let i = 1; i < difficulties.length - 1; i++) {
      if (
        difficulties[i] > avgDifficulty * 2 &&
        difficulties[i + 1] < avgDifficulty * 1.2
      ) {
        return true;
      }
    }

    return false;
  }

  private detectRapidHistoricalMining(branch: UTXOChainBranch): boolean {
    if (branch.utxoBlocks.length < 10) return false;

    // Check if recent blocks were mined much faster than they should have been
    const recentBlocks = branch.utxoBlocks.slice(-10);
    const timeSpan =
      recentBlocks[recentBlocks.length - 1].timestamp -
      recentBlocks[0].timestamp;
    const expectedTimeSpan = 10 * 5 * 60 * 1000; // 10 blocks * 5 minutes * 60 seconds * 1000ms

    return timeSpan < expectedTimeSpan * 0.3; // Much faster than expected
  }

  private countNodesKnowingBranch(
    branch: UTXOChainBranch,
    topology: EnhancedNetworkTopology
  ): number {
    // Simplified implementation - in reality would check which nodes have this branch
    return topology.nodes.size;
  }

  private countIsolatedNodes(topology: EnhancedNetworkTopology): number {
    let isolatedCount = 0;
    for (const [nodeId] of topology.nodes) {
      const connections = topology.links.get(nodeId);
      if (!connections || connections.size === 0) {
        isolatedCount++;
      }
    }
    return isolatedCount;
  }

  private detectNetworkPartition(topology: EnhancedNetworkTopology): boolean {
    // Simplified partition detection - in reality would use graph algorithms
    const totalNodes = topology.nodes.size;
    const connectedComponents = this.findConnectedComponents(topology);

    // Consider it a partition if the largest component has less than 80% of nodes
    const largestComponentSize = Math.max(
      ...connectedComponents.map(c => c.size)
    );
    return largestComponentSize < totalNodes * 0.8;
  }

  private findConnectedComponents(
    topology: EnhancedNetworkTopology
  ): Set<string>[] {
    // Simplified connected components - would use proper graph traversal in full implementation
    return [new Set(topology.nodes.keys())];
  }

  private validateUTXOOnlyBlock(block: Block): boolean {
    return block.transactions.every(tx => this.isUTXOTransaction(tx));
  }

  private isUTXOTransaction(tx: unknown): tx is UTXOTransaction {
    const utxoTx = tx as UTXOTransaction;
    return (
      utxoTx &&
      Array.isArray(utxoTx.inputs) &&
      Array.isArray(utxoTx.outputs) &&
      typeof utxoTx.fee === 'number'
    );
  }

  private getNetworkTopology(): EnhancedNetworkTopology | undefined {
    return this.nodeDiscovery?.getNetworkTopology();
  }

  private cacheAndReturn(
    cacheKey: string,
    analysis: UTXOChainSplitAnalysis
  ): UTXOChainSplitAnalysis {
    this.analysisCache.set(cacheKey, analysis);
    // Clean old cache entries
    if (this.analysisCache.size > 100) {
      const oldestKey = this.analysisCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.analysisCache.delete(oldestKey);
      }
    }
    return analysis;
  }
}
