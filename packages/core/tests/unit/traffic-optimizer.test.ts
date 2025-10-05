/**
 * TrafficOptimizer unit tests
 *
 * Comprehensive test suite for traffic analysis, congestion detection,
 * load prediction, and QoS-based routing optimization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrafficOptimizer } from '../../src/traffic-optimizer.js';
import type { NetworkConditions } from '../../src/hybrid-router.js';

describe('TrafficOptimizer', () => {
  let optimizer: TrafficOptimizer;

  beforeEach(() => {
    optimizer = new TrafficOptimizer();
  });

  describe('Lifecycle Management', () => {
    it('should start optimizer successfully', async () => {
      const startedSpy = vi.fn();
      optimizer.on('optimizer:started', startedSpy);

      await optimizer.start();

      expect(optimizer.getIsRunning()).toBe(true);
      expect(startedSpy).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      await optimizer.start();
      const startedSpy = vi.fn();
      optimizer.on('optimizer:started', startedSpy);

      await optimizer.start();

      expect(startedSpy).not.toHaveBeenCalled();
    });

    it('should stop optimizer and clear interval', async () => {
      await optimizer.start();
      const stoppedSpy = vi.fn();
      optimizer.on('optimizer:stopped', stoppedSpy);

      await optimizer.stop();

      expect(optimizer.getIsRunning()).toBe(false);
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should not stop if not running', async () => {
      const stoppedSpy = vi.fn();
      optimizer.on('optimizer:stopped', stoppedSpy);

      await optimizer.stop();

      expect(stoppedSpy).not.toHaveBeenCalled();
    });
  });

  describe('Traffic Pattern Analysis', () => {
    it('should analyze traffic patterns', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);
      optimizer.recordMessageMetrics('block', 'mesh', 200);

      optimizer.analyzeTrafficPatterns();

      const metrics = optimizer.getTrafficMetrics();
      expect(metrics.totalMessages).toBe(2);
    });

    it('should emit patterns:analyzed event', () => {
      const analyzedSpy = vi.fn();
      optimizer.on('patterns:analyzed', analyzedSpy);

      optimizer.analyzeTrafficPatterns();

      expect(analyzedSpy).toHaveBeenCalled();
      expect(analyzedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          patternCount: expect.any(Number),
          totalMessages: expect.any(Number),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should update pattern frequency during analysis', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);
      optimizer.recordMessageMetrics('transaction', 'internet', 60);

      optimizer.analyzeTrafficPatterns();

      const metrics = optimizer.getTrafficMetrics();
      expect(metrics.messagesByType.get('transaction')).toBe(2);
    });
  });

  describe('Congestion Detection', () => {
    it('should detect mesh congestion', () => {
      // Set high error rate
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.9;

      const isCongested = optimizer.detectCongestion('mesh');

      expect(isCongested).toBe(true);
    });

    it('should not detect congestion below threshold', () => {
      // Set low error rate
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.internet = 0.5;

      const isCongested = optimizer.detectCongestion('internet');

      expect(isCongested).toBe(false);
    });

    it('should emit congestion:detected event', () => {
      const detectedSpy = vi.fn();
      optimizer.on('congestion:detected', detectedSpy);

      // Set high error rate
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.9;

      optimizer.detectCongestion('mesh');

      expect(detectedSpy).toHaveBeenCalled();
      expect(detectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'mesh',
          errorRate: 0.9,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should detect internet congestion', () => {
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.internet = 0.85;

      const isCongested = optimizer.detectCongestion('internet');

      expect(isCongested).toBe(true);
    });
  });

  describe('Traffic Prediction', () => {
    it('should predict traffic load', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);
      optimizer.recordMessageMetrics('block', 'mesh', 100);

      const prediction = optimizer.predictTrafficLoad(3600000);

      expect(prediction.estimatedMessages).toBeGreaterThanOrEqual(2);
      expect(prediction.congestionRisk).toBeGreaterThanOrEqual(0);
      expect(prediction.congestionRisk).toBeLessThanOrEqual(1);
      expect(prediction.peakTime).toBeGreaterThan(Date.now());
    });

    it('should emit traffic:predicted event', () => {
      const predictedSpy = vi.fn();
      optimizer.on('traffic:predicted', predictedSpy);

      optimizer.predictTrafficLoad(3600000);

      expect(predictedSpy).toHaveBeenCalled();
      expect(predictedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prediction: expect.objectContaining({
            estimatedMessages: expect.any(Number),
            peakTime: expect.any(Number),
            congestionRisk: expect.any(Number),
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should calculate congestion risk correctly', () => {
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.5;
      metrics.errorRates.internet = 0.3;

      const prediction = optimizer.predictTrafficLoad(3600000);

      // Average error rate: (0.5 + 0.3) / 2 = 0.4
      expect(prediction.congestionRisk).toBe(0.4);
    });
  });

  describe('QoS Routing', () => {
    it('should route high-priority messages to internet', () => {
      const message = { type: 'block' };

      const route = optimizer.implementQoSRouting(message);

      expect(route.targetNetwork).toBe('internet');
      expect(route.priority).toBe('high');
      expect(route.estimatedDelay).toBe(500);
    });

    it('should route medium-priority messages to mesh', () => {
      const message = { type: 'peer_discovery' };

      const route = optimizer.implementQoSRouting(message);

      expect(route.targetNetwork).toBe('mesh');
      expect(route.priority).toBe('medium');
    });

    it('should route low-priority messages to mesh', () => {
      const message = { type: 'unknown' };

      const route = optimizer.implementQoSRouting(message);

      expect(route.targetNetwork).toBe('mesh');
      expect(route.priority).toBe('low');
      expect(route.estimatedDelay).toBe(2000);
    });

    it('should route transactions as high priority', () => {
      const message = { type: 'transaction' };

      const route = optimizer.implementQoSRouting(message);

      expect(route.priority).toBe('high');
      expect(route.targetNetwork).toBe('internet');
    });

    it('should route utxo_sync as medium priority', () => {
      const message = { type: 'utxo_sync' };

      const route = optimizer.implementQoSRouting(message);

      expect(route.priority).toBe('medium');
    });
  });

  describe('Optimization Rules', () => {
    it('should apply rules in priority order', () => {
      const message = { type: 'transaction' };
      const conditions = {
        internetConnectivity: true,
        meshConnectivity: true,
        availableGateways: [],
      } as NetworkConditions;

      const route = optimizer.optimizeMessageRouting(message, conditions);

      expect(route.targetNetwork).toBe('internet');
      expect(route.priority).toBe('high');
    });

    it('should apply mesh discovery rule', () => {
      const message = { type: 'peer_discovery' };
      const conditions = {
        internetConnectivity: true,
        meshConnectivity: true,
        availableGateways: [],
      } as NetworkConditions;

      const route = optimizer.optimizeMessageRouting(message, conditions);

      expect(route.targetNetwork).toBe('mesh');
      expect(route.priority).toBe('low');
    });

    it('should apply hybrid rule when both networks available', () => {
      const message = { type: 'sync_request' };
      const conditions = {
        internetConnectivity: true,
        meshConnectivity: true,
        availableGateways: ['gateway1', 'gateway2'],
      } as NetworkConditions;

      const route = optimizer.optimizeMessageRouting(message, conditions);

      expect(route.targetNetwork).toBe('hybrid');
      expect(route.priority).toBe('medium');
    });

    it('should disable rules on network failure', () => {
      optimizer.handleNetworkFailure('mesh');

      const rules = optimizer.getOptimizationRules();
      const meshRules = rules.filter(
        rule => rule.action({}).targetNetwork === 'mesh' && rule.enabled
      );

      expect(meshRules).toHaveLength(0);
    });

    it('should disable internet rules on internet failure', () => {
      optimizer.handleNetworkFailure('internet');

      const rules = optimizer.getOptimizationRules();
      const internetRules = rules.filter(
        rule => rule.action({}).targetNetwork === 'internet' && rule.enabled
      );

      expect(internetRules).toHaveLength(0);
    });

    it('should return default route when no rules match', () => {
      const message = { type: 'unknown' };
      const conditions = {
        internetConnectivity: false,
        meshConnectivity: false,
        availableGateways: [],
      } as NetworkConditions;

      const route = optimizer.optimizeMessageRouting(message, conditions);

      expect(route.targetNetwork).toBe('internet');
      expect(route.priority).toBe('medium');
    });
  });

  describe('Metrics Recording', () => {
    it('should record message metrics', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);

      const metrics = optimizer.getTrafficMetrics();
      expect(metrics.totalMessages).toBe(1);
      expect(metrics.messagesByType.get('transaction')).toBe(1);
    });

    it('should update average latency', () => {
      optimizer.recordMessageMetrics('block', 'internet', 100);
      optimizer.recordMessageMetrics('block', 'internet', 200);

      const metrics = optimizer.getTrafficMetrics();
      const avgLatency = metrics.averageLatency.internet;

      expect(avgLatency).toBeGreaterThan(0);
      expect(avgLatency).toBe(150); // (100 + 200) / 2
    });

    it('should track multiple message types', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);
      optimizer.recordMessageMetrics('block', 'mesh', 100);
      optimizer.recordMessageMetrics('transaction', 'internet', 60);

      const metrics = optimizer.getTrafficMetrics();
      expect(metrics.messagesByType.get('transaction')).toBe(2);
      expect(metrics.messagesByType.get('block')).toBe(1);
    });

    it('should update mesh latency separately', () => {
      optimizer.recordMessageMetrics('transaction', 'mesh', 200);
      optimizer.recordMessageMetrics('transaction', 'mesh', 400);

      const metrics = optimizer.getTrafficMetrics();
      expect(metrics.averageLatency.mesh).toBe(300);
    });
  });

  describe('Load Balancing', () => {
    it('should balance network load when congestion detected', () => {
      const balancedSpy = vi.fn();
      optimizer.on('load:balanced', balancedSpy);

      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.9;

      optimizer.balanceNetworkLoad();

      expect(balancedSpy).toHaveBeenCalled();
      expect(balancedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          meshCongestion: true,
          internetCongestion: false,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should not balance load when no congestion', () => {
      const balancedSpy = vi.fn();
      optimizer.on('load:balanced', balancedSpy);

      optimizer.balanceNetworkLoad();

      expect(balancedSpy).not.toHaveBeenCalled();
    });

    it('should detect both networks congested', () => {
      const balancedSpy = vi.fn();
      optimizer.on('load:balanced', balancedSpy);

      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.85;
      metrics.errorRates.internet = 0.9;

      optimizer.balanceNetworkLoad();

      expect(balancedSpy).toHaveBeenCalled();
      expect(balancedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          meshCongestion: true,
          internetCongestion: true,
        })
      );
    });
  });

  describe('Network Adaptation', () => {
    it('should adapt to network conditions', () => {
      const adaptedSpy = vi.fn();
      optimizer.on('conditions:adapted', adaptedSpy);

      const conditions = {
        meshConnectivity: false,
        internetConnectivity: true,
        availableGateways: ['gateway1'],
      } as NetworkConditions;

      optimizer.adaptToNetworkConditions(conditions);

      expect(adaptedSpy).toHaveBeenCalled();
      expect(adaptedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should disable mesh rules when mesh unavailable', () => {
      const conditions = {
        meshConnectivity: false,
        internetConnectivity: true,
        availableGateways: [],
      } as NetworkConditions;

      optimizer.adaptToNetworkConditions(conditions);

      const rules = optimizer.getOptimizationRules();
      const meshRules = rules.filter(
        rule => rule.action({}).targetNetwork === 'mesh' && rule.enabled
      );

      expect(meshRules).toHaveLength(0);
    });

    it('should disable internet rules when internet unavailable', () => {
      const conditions = {
        meshConnectivity: true,
        internetConnectivity: false,
        availableGateways: [],
      } as NetworkConditions;

      optimizer.adaptToNetworkConditions(conditions);

      const rules = optimizer.getOptimizationRules();
      const internetRules = rules.filter(
        rule => rule.action({}).targetNetwork === 'internet' && rule.enabled
      );

      expect(internetRules).toHaveLength(0);
    });
  });

  describe('Optimization Reports', () => {
    it('should generate optimization report', () => {
      optimizer.recordMessageMetrics('transaction', 'internet', 50);
      optimizer.recordMessageMetrics('block', 'mesh', 100);

      const report = optimizer.generateOptimizationReport();

      expect(report.metrics.totalMessages).toBe(2);
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.timestamp).toBeGreaterThan(0);
    });

    it('should emit report:generated event', () => {
      const generatedSpy = vi.fn();
      optimizer.on('report:generated', generatedSpy);

      optimizer.generateOptimizationReport();

      expect(generatedSpy).toHaveBeenCalled();
      expect(generatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          report: expect.objectContaining({
            metrics: expect.any(Object),
            patterns: expect.any(Array),
            recommendations: expect.any(Array),
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should recommend internet routing for mesh congestion', () => {
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.mesh = 0.9;

      const report = optimizer.generateOptimizationReport();

      expect(report.recommendations).toContain(
        'Consider routing more traffic via internet to reduce mesh congestion'
      );
    });

    it('should recommend mesh routing for internet congestion', () => {
      const metrics = optimizer.getTrafficMetrics();
      metrics.errorRates.internet = 0.85;

      const report = optimizer.generateOptimizationReport();

      expect(report.recommendations).toContain(
        'Consider using mesh network for non-urgent traffic'
      );
    });

    it('should recommend gateway nodes for high traffic', () => {
      // Record many messages
      for (let i = 0; i < 11000; i++) {
        optimizer.recordMessageMetrics('transaction', 'internet', 50);
      }

      const report = optimizer.generateOptimizationReport();

      expect(report.recommendations).toContain(
        'High traffic volume - consider adding more gateway nodes'
      );
    });
  });

  describe('Rule Updates', () => {
    it('should update optimization rules based on performance', () => {
      const updatedSpy = vi.fn();
      optimizer.on('rules:updated', updatedSpy);

      const performance = {
        latency: 100,
        throughput: 1000,
        errorRate: 0.1,
      };

      optimizer.updateOptimizationRules(performance);

      expect(updatedSpy).toHaveBeenCalled();
      expect(updatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          performance,
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('Network Failure Handling', () => {
    it('should handle mesh network failure', () => {
      const failureHandledSpy = vi.fn();
      optimizer.on('network:failure-handled', failureHandledSpy);

      optimizer.handleNetworkFailure('mesh');

      expect(failureHandledSpy).toHaveBeenCalled();
      expect(failureHandledSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          failedNetwork: 'mesh',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle internet network failure', () => {
      const failureHandledSpy = vi.fn();
      optimizer.on('network:failure-handled', failureHandledSpy);

      optimizer.handleNetworkFailure('internet');

      expect(failureHandledSpy).toHaveBeenCalled();
      expect(failureHandledSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          failedNetwork: 'internet',
          timestamp: expect.any(Number),
        })
      );
    });
  });
});
