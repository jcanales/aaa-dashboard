type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = formatEntry(level, message, context);
  const line = JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    write('info', message, context);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    write('warn', message, context);
  },

  error(message: string, context?: Record<string, unknown>): void {
    write('error', message, context);
  },

  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      write('debug', message, context);
    }
  },
};
