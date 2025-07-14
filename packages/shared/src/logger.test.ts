import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel } from './logger.js';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    // Reset singleton instance
    (Logger as any).instance = undefined;
    logger = Logger.getInstance();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('setLogLevel', () => {
    it('should set log level', () => {
      logger.setLogLevel(LogLevel.ERROR);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error message')
      );
    });

    it('should respect log level hierarchy', () => {
      logger.setLogLevel(LogLevel.WARN);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Warn message')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error message')
      );
    });
  });

  describe('debug', () => {
    it('should log debug message', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Debug message')
      );
    });

    it('should log debug message with context', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      const context = { key: 'value' };
      logger.debug('Debug message', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Debug message {"key":"value"}')
      );
    });

    it('should not log debug when level is higher', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('Debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.info('Info message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Info message')
      );
    });

    it('should log info message with context', () => {
      logger.setLogLevel(LogLevel.INFO);
      const context = { userId: 123 };
      logger.info('User logged in', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO: User logged in {"userId":123}')
      );
    });
  });

  describe('warn', () => {
    it('should log warn message', () => {
      logger.setLogLevel(LogLevel.WARN);
      logger.warn('Warning message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Warning message')
      );
    });

    it('should log warn message with context', () => {
      logger.setLogLevel(LogLevel.WARN);
      const context = { error: 'timeout' };
      logger.warn('Connection warning', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Connection warning {"error":"timeout"}')
      );
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('Error message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error message')
      );
    });

    it('should log error message with context', () => {
      logger.setLogLevel(LogLevel.ERROR);
      const context = { stack: 'error stack trace' };
      logger.error('Critical error', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'ERROR: Critical error {"stack":"error stack trace"}'
        )
      );
    });
  });

  describe('getLogs', () => {
    it('should return empty array initially', () => {
      const logs = logger.getLogs();
      expect(logs).toHaveLength(0);
    });

    it('should return logged entries', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('Debug message');
      logger.info('Info message');
      logger.error('Error message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);

      expect(logs[0]).toMatchObject({
        level: LogLevel.DEBUG,
        message: 'Debug message',
        timestamp: expect.any(Number),
      });

      expect(logs[1]).toMatchObject({
        level: LogLevel.INFO,
        message: 'Info message',
        timestamp: expect.any(Number),
      });

      expect(logs[2]).toMatchObject({
        level: LogLevel.ERROR,
        message: 'Error message',
        timestamp: expect.any(Number),
      });
    });

    it('should return copy of logs array', () => {
      logger.debug('Test message');

      const logs1 = logger.getLogs();
      const logs2 = logger.getLogs();

      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });

    it('should include context in log entries', () => {
      logger.setLogLevel(LogLevel.INFO);
      const context = { requestId: 'abc123' };
      logger.info('Request processed', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual(context);
    });

    it('should not include logs below threshold', () => {
      logger.setLogLevel(LogLevel.WARN);
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('Debug message');
      logger.info('Info message');
      logger.error('Error message');

      expect(logger.getLogs()).toHaveLength(3);

      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });

    it('should not affect future logging', () => {
      logger.info('First message');
      logger.clearLogs();
      logger.info('Second message');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Second message');
    });
  });

  describe('log format', () => {
    it('should format log messages correctly', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Test message$/
        )
      );
    });

    it('should format log messages with context correctly', () => {
      logger.setLogLevel(LogLevel.INFO);
      const context = { key: 'value' };
      logger.info('Test message', context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Test message {"key":"value"}$/
        )
      );
    });
  });

  describe('timestamp', () => {
    it('should include timestamp in log entries', () => {
      const beforeTime = Date.now();
      logger.info('Test message');
      const afterTime = Date.now();

      const logs = logger.getLogs();
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(logs[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });
});
