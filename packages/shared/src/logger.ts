export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>
  ): void {
    if (level >= this.logLevel) {
      const entry: LogEntry = {
        level,
        message,
        timestamp: Date.now(),
        context,
      };

      this.logs.push(entry);

      const levelName = LogLevel[level];
      const timestamp = new Date(entry.timestamp).toISOString();
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';

      console.log(`[${timestamp}] ${levelName}: ${message}${contextStr}`);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
