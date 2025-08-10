/**
 * Mock logger for unit testing
 * Captures log messages for assertion without console output
 */
export class MockLogger {
  private logs: Array<{ level: string; message: string; args: any[] }> = [];
  private enabled = true;

  debug(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logs.push({ level: 'debug', message, args });
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logs.push({ level: 'info', message, args });
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logs.push({ level: 'warn', message, args });
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.enabled) {
      this.logs.push({ level: 'error', message, args });
    }
  }

  // Helper methods for testing
  getLogs(): Array<{ level: string; message: string; args: any[] }> {
    return [...this.logs];
  }

  getLogsByLevel(level: string): Array<{ message: string; args: any[] }> {
    return this.logs
      .filter(log => log.level === level)
      .map(({ message, args }) => ({ message, args }));
  }

  hasLog(level: string, message: string): boolean {
    return this.logs.some(
      log => log.level === level && log.message.includes(message)
    );
  }

  clear(): void {
    this.logs = [];
  }

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }

  getLogCount(): number {
    return this.logs.length;
  }
}
