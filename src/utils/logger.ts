export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export type LogDomain = 
  | 'SYSTEM' 
  | 'API' 
  | 'WEBHOOK' 
  | 'BOT' 
  | 'AI' 
  | 'DB' 
  | 'STREAMING' 
  | 'ADMIN' 
  | 'UTILS' 
  | 'SERVICES'
  | 'INTEGRATION';

interface LoggerConfig {
  globalLevel: LogLevel;
  domainLevels: Partial<Record<LogDomain, LogLevel>>;
}

export class Logger {
  private static config: LoggerConfig = {
    globalLevel: LogLevel.INFO,
    domainLevels: {},
  };

  private static initialized = false;

  static init(env: any) {
    if (this.initialized) return;

    const globalLevelStr = (env.LOG_LEVEL || 'INFO').toUpperCase();
    this.config.globalLevel = this.parseLogLevel(globalLevelStr);

    const domainLevelsStr = env.LOG_DOMAINS || '';
    if (domainLevelsStr) {
      const domains = domainLevelsStr.split(',');
      for (const domainPair of domains) {
        const [domain, level] = domainPair.split('=').map((s: string) => s.trim().toUpperCase());
        if (domain && level) {
          this.config.domainLevels[domain as LogDomain] = this.parseLogLevel(level);
        }
      }
    }

    this.initialized = true;
    this.debug('SYSTEM', `Logger initialized. Global level: ${LogLevel[this.config.globalLevel]}, Domain overrides: ${domainLevelsStr || 'none'}`);
  }

  private static parseLogLevel(level: string): LogLevel {
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'NONE': return LogLevel.NONE;
      default: return LogLevel.INFO;
    }
  }

  private static shouldLog(domain: LogDomain, level: LogLevel): boolean {
    const domainLevel = this.config.domainLevels[domain];
    const threshold = domainLevel !== undefined ? domainLevel : this.config.globalLevel;
    return level >= threshold;
  }

  private static formatMessage(domain: LogDomain, level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${LogLevel[level]}] [${domain}] ${message}`;
  }

  static debug(domain: LogDomain, message: string, ...args: any[]) {
    if (this.shouldLog(domain, LogLevel.DEBUG)) {
      console.debug(this.formatMessage(domain, LogLevel.DEBUG, message), ...args);
    }
  }

  static info(domain: LogDomain, message: string, ...args: any[]) {
    if (this.shouldLog(domain, LogLevel.INFO)) {
      console.info(this.formatMessage(domain, LogLevel.INFO, message), ...args);
    }
  }

  static warn(domain: LogDomain, message: string, ...args: any[]) {
    if (this.shouldLog(domain, LogLevel.WARN)) {
      console.warn(this.formatMessage(domain, LogLevel.WARN, message), ...args);
    }
  }

  static error(domain: LogDomain, message: string, ...args: any[]) {
    if (this.shouldLog(domain, LogLevel.ERROR)) {
      console.error(this.formatMessage(domain, LogLevel.ERROR, message), ...args);
    }
  }

  // Helper to log with generic log method
  static log(level: LogLevel, domain: LogDomain, message: string, ...args: any[]) {
    switch (level) {
      case LogLevel.DEBUG: this.debug(domain, message, ...args); break;
      case LogLevel.INFO: this.info(domain, message, ...args); break;
      case LogLevel.WARN: this.warn(domain, message, ...args); break;
      case LogLevel.ERROR: this.error(domain, message, ...args); break;
    }
  }
}
