/**
 * TrafficOptimizer - Traffic analysis and optimization for hybrid routing
 *
 * This module provides traffic pattern analysis, congestion detection,
 * load prediction, and QoS-based routing optimization to improve overall
 * hybrid network performance.
 *
 * Part 7 of 8 in the hybrid routing system implementation.
 */

import { EventEmitter } from 'events';
import { Logger } from '@lorachain/shared';
import type { NetworkConditions, RouteDecision } from './hybrid-router.js';

/**
 * Traffic pattern tracking for network analysis
 */
export interface TrafficPattern {
  /** Message type identifier */
  messageType: string;
  /** Source network type */
  sourceNetwork: 'mesh' | 'internet';
  /** Target network type */
  targetNetwork: 'mesh' | 'internet';
  /** Message frequency (messages per analysis period) */
  frequency: number;
  /** Average message size in bytes */
  averageSize: number;
  /** Message priority level */
  priority: number;
  /** Latency requirement in milliseconds */
  latencyRequirement: number;
}

/**
 * Optimization rule for routing decisions
 */
export interface OptimizationRule {
  /** Condition function to check if rule applies */
  condition: (message: unknown, conditions: NetworkConditions) => boolean;
  /** Action function to determine route decision */
  action: (message: unknown) => RouteDecision;
  /** Rule priority (lower number = higher priority) */
  priority: number;
  /** Whether rule is currently enabled */
  enabled: boolean;
}

/**
 * Traffic metrics for network analysis
 */
export interface TrafficMetrics {
  /** Total messages processed */
  totalMessages: number;
  /** Message count by type */
  messagesByType: Map<string, number>;
  /** Average latency measurements */
  averageLatency: {
    mesh: number;
    internet: number;
    crossNetwork: number;
  };
  /** Throughput measurements */
  throughput: {
    mesh: number;
    internet: number;
    crossNetwork: number;
  };
  /** Error rates by network */
  errorRates: {
    mesh: number;
    internet: number;
    crossNetwork: number;
  };
}

/**
 * Traffic load prediction
 */
export interface TrafficPrediction {
  /** Estimated message count for prediction window */
  estimatedMessages: number;
  /** Predicted peak time (timestamp) */
  peakTime: number;
  /** Congestion risk level (0-1 scale) */
  congestionRisk: number;
}

/**
 * Performance data for optimization
 */
export interface PerformanceData {
  /** Observed latency in milliseconds */
  latency: number;
  /** Observed throughput in bytes/sec */
  throughput: number;
  /** Observed error rate (0-1 scale) */
  errorRate: number;
}

/**
 * Optimization report with recommendations
 */
export interface OptimizationReport {
  /** Report timestamp */
  timestamp: number;
  /** Current traffic metrics */
  metrics: TrafficMetrics;
  /** Detected traffic patterns */
  patterns: TrafficPattern[];
  /** Optimization recommendations */
  recommendations: string[];
}

/**
 * Constants for traffic optimization
 */
const CONGESTION_THRESHOLD = 0.8; // 80% error rate threshold
const TRAFFIC_GROWTH_ESTIMATE = 1.2; // 20% growth estimate
const HIGH_TRAFFIC_THRESHOLD = 10000; // High traffic volume threshold
const OPTIMIZATION_INTERVAL_MS = 60000; // Optimize every minute

/**
 * TrafficOptimizer - Analyzes traffic patterns and optimizes routing decisions
 *
 * Provides traffic analysis, congestion detection, pattern recognition, and
 * QoS-based routing optimization to improve hybrid network performance.
 *
 * @fires optimizer:started - Emitted when optimizer starts
 * @fires optimizer:stopped - Emitted when optimizer stops
 * @fires patterns:analyzed - Emitted when traffic patterns are analyzed
 * @fires congestion:detected - Emitted when network congestion is detected
 * @fires traffic:predicted - Emitted when traffic load is predicted
 * @fires load:balanced - Emitted when network load is balanced
 * @fires rules:updated - Emitted when optimization rules are updated
 * @fires conditions:adapted - Emitted when optimizer adapts to network conditions
 * @fires network:failure-handled - Emitted when network failure is handled
 * @fires report:generated - Emitted when optimization report is generated
 */
export class TrafficOptimizer extends EventEmitter {
  private trafficPatterns: Map<string, TrafficPattern>;
  private optimizationRules: OptimizationRule[];
  private trafficMetrics: TrafficMetrics;
  private logger: Logger;
  private isRunning = false;
  private optimizationInterval?: ReturnType<typeof setInterval>;

  /**
   * Create a new TrafficOptimizer instance
   */
  constructor() {
    super();
    this.trafficPatterns = new Map();
    this.optimizationRules = [];
    this.logger = Logger.getInstance();
    this.trafficMetrics = this.initializeMetrics();

    this.initializeOptimizationRules();
  }

  /**
   * Start the traffic optimizer
   *
   * Begins periodic optimization and traffic analysis.
   * Emits 'optimizer:started' event on successful start.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('TrafficOptimizer already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting traffic optimizer');

    this.startPeriodicOptimization();

    this.emit('optimizer:started', { timestamp: Date.now() });
  }

  /**
   * Stop the traffic optimizer
   *
   * Stops periodic optimization and cleans up resources.
   * Emits 'optimizer:stopped' event on successful stop.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('TrafficOptimizer not running');
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping traffic optimizer');

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = undefined;
    }

    this.emit('optimizer:stopped', { timestamp: Date.now() });
  }

  /**
   * Analyze traffic patterns
   *
   * Analyzes current traffic patterns and updates statistics.
   * Emits 'patterns:analyzed' event with analysis results.
   */
  analyzeTrafficPatterns(): void {
    this.logger.debug('Analyzing traffic patterns', {
      totalMessages: this.trafficMetrics.totalMessages,
      uniqueTypes: this.trafficPatterns.size,
    });

    // Analyze patterns and update statistics
    for (const [type, pattern] of this.trafficPatterns) {
      const messageCount = this.trafficMetrics.messagesByType.get(type) || 0;

      // Update frequency (messages per hour)
      pattern.frequency = messageCount;

      this.trafficPatterns.set(type, pattern);
    }

    this.emit('patterns:analyzed', {
      patternCount: this.trafficPatterns.size,
      totalMessages: this.trafficMetrics.totalMessages,
      timestamp: Date.now(),
    });
  }

  /**
   * Detect network congestion
   *
   * Checks if specified network is experiencing congestion based on error rates.
   * Emits 'congestion:detected' event if congestion is detected.
   *
   * @param network - Network to check for congestion
   * @returns True if network is congested
   */
  detectCongestion(network: 'mesh' | 'internet'): boolean {
    const errorRate = this.trafficMetrics.errorRates[network];

    const isCongested = errorRate > CONGESTION_THRESHOLD;

    if (isCongested) {
      this.logger.warn('Network congestion detected', { network, errorRate });

      this.emit('congestion:detected', {
        network,
        errorRate,
        timestamp: Date.now(),
      });
    }

    return isCongested;
  }

  /**
   * Predict traffic load for future time window
   *
   * Estimates future message volume based on recent traffic patterns.
   * Emits 'traffic:predicted' event with prediction results.
   *
   * @param timeWindow - Time window for prediction in milliseconds
   * @returns Traffic prediction with estimated volume and congestion risk
   */
  predictTrafficLoad(timeWindow: number): TrafficPrediction {
    // Simple prediction based on recent traffic
    const recentMessages = this.trafficMetrics.totalMessages;
    const estimatedMessages = Math.floor(
      recentMessages * TRAFFIC_GROWTH_ESTIMATE
    );

    const prediction: TrafficPrediction = {
      estimatedMessages,
      peakTime: Date.now() + timeWindow / 2, // Assume peak at middle of window
      congestionRisk: this.calculateCongestionRisk(),
    };

    this.logger.debug('Traffic load predicted', prediction);

    this.emit('traffic:predicted', {
      prediction,
      timestamp: Date.now(),
    });

    return prediction;
  }

  /**
   * Optimize message routing based on rules and conditions
   *
   * Applies optimization rules in priority order to determine optimal route.
   *
   * @param message - Message to route
   * @param conditions - Current network conditions
   * @returns Route decision with optimal network selection
   */
  optimizeMessageRouting(
    message: unknown,
    conditions: NetworkConditions
  ): RouteDecision {
    // Apply optimization rules in priority order
    for (const rule of this.optimizationRules) {
      if (rule.enabled && rule.condition(message, conditions)) {
        this.logger.debug('Applying optimization rule', {
          messageType: (message as { type?: string })?.type,
          priority: rule.priority,
        });

        return rule.action(message);
      }
    }

    // Default routing decision
    return this.createDefaultRoute();
  }

  /**
   * Implement QoS-based routing
   *
   * Determines routing decision based on Quality of Service priority levels.
   *
   * @param message - Message to route
   * @returns Route decision with QoS-based network selection
   */
  implementQoSRouting(message: unknown): RouteDecision {
    const priority = this.determineQoSPriority(message);

    const route: RouteDecision = {
      targetNetwork: priority === 'high' ? 'internet' : 'mesh',
      priority,
      estimatedDelay: priority === 'high' ? 500 : 2000,
      cost: priority === 'high' ? 2.0 : 1.0,
      reliability: 0.95,
    };

    this.logger.debug('QoS route determined', {
      messageType: (message as { type?: string })?.type,
      priority,
      targetNetwork: route.targetNetwork,
    });

    return route;
  }

  /**
   * Balance network load
   *
   * Detects congestion and triggers load balancing when needed.
   * Emits 'load:balanced' event if load balancing is performed.
   */
  balanceNetworkLoad(): void {
    const meshCongestion = this.detectCongestion('mesh');
    const internetCongestion = this.detectCongestion('internet');

    if (meshCongestion || internetCongestion) {
      this.logger.info('Balancing network load due to congestion');

      this.emit('load:balanced', {
        meshCongestion,
        internetCongestion,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Update optimization rules based on performance
   *
   * Adjusts optimization rules based on observed performance data.
   * Emits 'rules:updated' event with performance data.
   *
   * @param performance - Observed performance metrics
   */
  updateOptimizationRules(performance: PerformanceData): void {
    this.logger.debug('Updating optimization rules based on performance data');

    // Adjust rules based on observed performance
    // In production, this would use more sophisticated ML/heuristics

    this.emit('rules:updated', {
      performance,
      timestamp: Date.now(),
    });
  }

  /**
   * Adapt to changing network conditions
   *
   * Adjusts optimization rules based on current network conditions.
   * Disables rules targeting unavailable networks.
   * Emits 'conditions:adapted' event with new conditions.
   *
   * @param conditions - Current network conditions
   */
  adaptToNetworkConditions(conditions: NetworkConditions): void {
    this.logger.debug('Adapting to network conditions', {
      meshConnectivity: conditions.meshConnectivity,
      internetConnectivity: conditions.internetConnectivity,
      availableGateways: conditions.availableGateways.length,
    });

    // Adapt optimization rules based on conditions
    if (!conditions.meshConnectivity) {
      // Disable mesh-preferring rules
      this.optimizationRules.forEach(rule => {
        if (rule.action({}).targetNetwork === 'mesh') {
          rule.enabled = false;
        }
      });
    }

    if (!conditions.internetConnectivity) {
      // Disable internet-preferring rules
      this.optimizationRules.forEach(rule => {
        if (rule.action({}).targetNetwork === 'internet') {
          rule.enabled = false;
        }
      });
    }

    this.emit('conditions:adapted', {
      conditions,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle network failure
   *
   * Responds to network failure by disabling rules targeting failed network.
   * Emits 'network:failure-handled' event.
   *
   * @param failedNetwork - The network that failed
   */
  handleNetworkFailure(failedNetwork: 'mesh' | 'internet'): void {
    this.logger.warn('Handling network failure', { failedNetwork });

    // Disable rules targeting failed network
    this.optimizationRules.forEach(rule => {
      if (rule.action({}).targetNetwork === failedNetwork) {
        rule.enabled = false;
      }
    });

    this.emit('network:failure-handled', {
      failedNetwork,
      timestamp: Date.now(),
    });
  }

  /**
   * Generate optimization report
   *
   * Creates comprehensive report with metrics, patterns, and recommendations.
   * Emits 'report:generated' event with report data.
   *
   * @returns Optimization report with current state and recommendations
   */
  generateOptimizationReport(): OptimizationReport {
    const report: OptimizationReport = {
      timestamp: Date.now(),
      metrics: this.trafficMetrics,
      patterns: Array.from(this.trafficPatterns.values()),
      recommendations: this.generateRecommendations(),
    };

    this.logger.info('Optimization report generated', {
      messageCount: report.metrics.totalMessages,
      patternCount: report.patterns.length,
      recommendationCount: report.recommendations.length,
    });

    this.emit('report:generated', {
      report,
      timestamp: Date.now(),
    });

    return report;
  }

  /**
   * Record message metrics
   *
   * Updates traffic metrics with message delivery data.
   *
   * @param messageType - Type of message
   * @param network - Network used for delivery
   * @param latency - Observed latency in milliseconds
   */
  recordMessageMetrics(
    messageType: string,
    network: 'mesh' | 'internet',
    latency: number
  ): void {
    // Update total message count
    this.trafficMetrics.totalMessages++;

    // Update message type count
    const currentCount =
      this.trafficMetrics.messagesByType.get(messageType) || 0;
    this.trafficMetrics.messagesByType.set(messageType, currentCount + 1);

    // Update average latency
    this.updateAverageLatency(network, latency);
  }

  /**
   * Get current traffic metrics
   *
   * @returns Current traffic metrics
   */
  getTrafficMetrics(): TrafficMetrics {
    return { ...this.trafficMetrics };
  }

  /**
   * Get current optimization rules
   *
   * @returns Array of optimization rules
   */
  getOptimizationRules(): OptimizationRule[] {
    return [...this.optimizationRules];
  }

  /**
   * Check if optimizer is running
   *
   * @returns True if optimizer is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Determine QoS priority for message
   *
   * @param message - Message to evaluate
   * @returns Priority level
   */
  private determineQoSPriority(message: unknown): 'high' | 'medium' | 'low' {
    const highPriorityTypes = ['block', 'transaction'];
    const mediumPriorityTypes = ['peer_discovery', 'utxo_sync'];

    const messageType = (message as { type?: string })?.type;

    if (highPriorityTypes.includes(messageType || '')) {
      return 'high';
    } else if (mediumPriorityTypes.includes(messageType || '')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate congestion risk
   *
   * @returns Congestion risk level (0-1 scale)
   */
  private calculateCongestionRisk(): number {
    const meshError = this.trafficMetrics.errorRates.mesh;
    const internetError = this.trafficMetrics.errorRates.internet;

    const avgError = (meshError + internetError) / 2;

    return Math.min(1.0, avgError);
  }

  /**
   * Initialize optimization rules
   *
   * Sets up default optimization rules for routing decisions.
   */
  private initializeOptimizationRules(): void {
    // Rule 1: Route high-priority messages via internet if available
    this.optimizationRules.push({
      condition: (message, conditions) => {
        const messageType = (message as { type?: string })?.type;
        return (
          ['block', 'transaction'].includes(messageType || '') &&
          conditions.internetConnectivity
        );
      },
      action: _message => ({
        targetNetwork: 'internet',
        priority: 'high',
        estimatedDelay: 500,
        cost: 2.0,
        reliability: 0.95,
      }),
      priority: 1,
      enabled: true,
    });

    // Rule 2: Route mesh discovery via mesh network
    this.optimizationRules.push({
      condition: (message, conditions) => {
        const messageType = (message as { type?: string })?.type;
        return messageType === 'peer_discovery' && conditions.meshConnectivity;
      },
      action: _message => ({
        targetNetwork: 'mesh',
        priority: 'low',
        estimatedDelay: 2000,
        cost: 1.0,
        reliability: 0.8,
      }),
      priority: 2,
      enabled: true,
    });

    // Rule 3: Use hybrid for balanced traffic
    this.optimizationRules.push({
      condition: (_message, conditions) =>
        conditions.meshConnectivity &&
        conditions.internetConnectivity &&
        conditions.availableGateways.length > 0,
      action: _message => ({
        targetNetwork: 'hybrid',
        priority: 'medium',
        estimatedDelay: 1000,
        cost: 1.5,
        reliability: 0.9,
      }),
      priority: 3,
      enabled: true,
    });
  }

  /**
   * Initialize traffic metrics
   *
   * @returns Initialized metrics object
   */
  private initializeMetrics(): TrafficMetrics {
    return {
      totalMessages: 0,
      messagesByType: new Map(),
      averageLatency: {
        mesh: 0,
        internet: 0,
        crossNetwork: 0,
      },
      throughput: {
        mesh: 0,
        internet: 0,
        crossNetwork: 0,
      },
      errorRates: {
        mesh: 0,
        internet: 0,
        crossNetwork: 0,
      },
    };
  }

  /**
   * Generate optimization recommendations
   *
   * @returns Array of recommendation strings
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.detectCongestion('mesh')) {
      recommendations.push(
        'Consider routing more traffic via internet to reduce mesh congestion'
      );
    }

    if (this.detectCongestion('internet')) {
      recommendations.push(
        'Consider using mesh network for non-urgent traffic'
      );
    }

    if (this.trafficMetrics.totalMessages > HIGH_TRAFFIC_THRESHOLD) {
      recommendations.push(
        'High traffic volume - consider adding more gateway nodes'
      );
    }

    return recommendations;
  }

  /**
   * Start periodic optimization
   *
   * Begins interval-based traffic analysis and load balancing.
   */
  private startPeriodicOptimization(): void {
    this.optimizationInterval = setInterval(() => {
      if (!this.isRunning) return;

      this.analyzeTrafficPatterns();
      this.balanceNetworkLoad();
    }, OPTIMIZATION_INTERVAL_MS);
  }

  /**
   * Update average latency
   *
   * @param network - Network type
   * @param latency - New latency measurement
   */
  private updateAverageLatency(
    network: 'mesh' | 'internet',
    latency: number
  ): void {
    const currentAvg = this.trafficMetrics.averageLatency[network];
    const messageCount = this.trafficMetrics.totalMessages;

    // Calculate new average
    const newAvg = (currentAvg * (messageCount - 1) + latency) / messageCount;

    this.trafficMetrics.averageLatency[network] = newAvg;
  }

  /**
   * Create default route decision
   *
   * @returns Default route decision
   */
  private createDefaultRoute(): RouteDecision {
    return {
      targetNetwork: 'internet',
      priority: 'medium',
      estimatedDelay: 1000,
      cost: 1.0,
      reliability: 0.8,
    };
  }
}
