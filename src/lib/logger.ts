type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  meetingId?: string;
  userId?: string;
  step?: string;
  durationMs?: number;
  error?: Error | string;
  [key: string]: any;
}

class StructuredLogger {
  private service = 'zrnote';

  private log(level: LogLevel, message: string, context: LogContext = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...context,
    };
    
    // Console output with colors for development
    if (process.env.NODE_ENV !== 'production') {
      const colors = {
        debug: '\x1b[90m',   // gray
        info: '\x1b[36m',    // cyan
        warn: '\x1b[33m',    // yellow
        error: '\x1b[31m',   // red
      };
      const reset = '\x1b[0m';
      console.log(`${colors[level]}[${level.toUpperCase()}]${reset} ${message}`, 
        Object.keys(context).length > 0 ? context : '');
    } else {
      // JSON for production (can be piped to log aggregator)
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  // Convenience methods for common operations
  meetingStarted(meetingId: string, userId: string) {
    this.info('Meeting processing started', { meetingId, userId, step: 'started' });
  }

  meetingCompleted(meetingId: string, userId: string, durationMs: number) {
    this.info('Meeting processing completed', { meetingId, userId, durationMs, step: 'completed' });
  }

  meetingFailed(meetingId: string, userId: string, error: Error | string, step: string) {
    const err = error instanceof Error ? error : new Error(error);
    this.error('Meeting processing failed', { meetingId, userId, step, error: err.message, stack: err.stack });
  }

  stepStarted(meetingId: string, step: string) {
    this.info(`Processing step started: ${step}`, { meetingId, step });
  }

  stepCompleted(meetingId: string, step: string, durationMs: number, details?: any) {
    this.info(`Processing step completed: ${step}`, { meetingId, step, durationMs, details });
  }

  stepFailed(meetingId: string, step: string, error: Error | string, details?: any) {
    const err = error instanceof Error ? error : new Error(error);
    this.error(`Processing step failed: ${step}`, { meetingId, step, error: err.message, details });
  }

  transcribeSegment(meetingId: string, segmentIndex: number, attempt: number, success: boolean) {
    if (success) {
      this.info(`Segment transcribed`, { meetingId, segmentIndex, attempt, success });
    } else {
      this.warn(`Segment transcription failed`, { meetingId, segmentIndex, attempt, success });
    }
  }

  emailSent(meetingId: string, recipient: string, type: 'personal' | 'coordinator') {
    this.info('Email sent', { meetingId, recipient, type });
  }

  emailFailed(meetingId: string, recipient: string, error: Error | string) {
    const err = error instanceof Error ? error : new Error(error);
    this.error('Email failed', { meetingId, recipient, error: err.message });
  }
}

export const logger = new StructuredLogger();

// Helper for timing operations
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  context: LogContext = {}
): Promise<T> {
  const start = Date.now();
  try {
    logger.debug(`Starting ${operation}`, context);
    const result = await fn();
    logger.debug(`Completed ${operation}`, { ...context, durationMs: Date.now() - start });
    return result;
  } catch (error) {
    logger.error(`Failed ${operation}`, { ...context, durationMs: Date.now() - start, error: error instanceof Error ? error : new Error(String(error)) });
    throw error;
  }
}