import { Writable } from 'stream';
import { CorrelationContext } from '../context/correlation-context';
import { defaultRedactor, ISecretRedactor } from '../redactor/secret-redactor';
import { LogLevel, isLevelEnabled } from './log-levels';
import { LogRecord, formatJsonLog } from './log-formatter';

export interface LoggerOptions {
  serviceName: string;
  minLevel?: LogLevel;
  redactor?: ISecretRedactor;
  destinationStream?: Writable;
  jsonFormat?: boolean;
  bindings?: Record<string, unknown>;
}

export interface IStructuredLogger {
  readonly serviceName: string;
  readonly minLevel: LogLevel;
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  audit(action: string, actor: string, resource: string, data?: Record<string, unknown>): void;
  security(event: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): IStructuredLogger;
}

export class StructuredLogger implements IStructuredLogger {
  public readonly serviceName: string;
  public readonly minLevel: LogLevel;
  private redactor: ISecretRedactor;
  private destinationStream: Writable;
  private jsonFormat: boolean;
  private bindings: Record<string, unknown>;

  constructor(options: LoggerOptions) {
    this.serviceName = options.serviceName || 'avf-service';
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    this.minLevel = options.minLevel || envLevel || 'info';
    this.redactor = options.redactor || defaultRedactor;
    this.destinationStream = options.destinationStream || (process.stdout as Writable);
    this.jsonFormat = options.jsonFormat ?? true;
    this.bindings = options.bindings ? { ...options.bindings } : {};
  }

  public trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, undefined, data);
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, undefined, data);
  }

  public info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, undefined, data);
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, undefined, data);
  }

  public error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.log('error', message, error, data);
  }

  public audit(action: string, actor: string, resource: string, data?: Record<string, unknown>): void {
    const auditData: Record<string, unknown> = {
      ...(data || {}),
      audit: {
        action: this.redactor.redactString(action),
        actor: this.redactor.redactString(actor),
        resource: this.redactor.redactString(resource),
      },
    };
    this.log('audit', `[AUDIT] ${action} by ${actor} on ${resource}`, undefined, auditData);
  }

  public security(
    event: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    data?: Record<string, unknown>
  ): void {
    const securityData: Record<string, unknown> = {
      ...(data || {}),
      security: {
        event: this.redactor.redactString(event),
        severity,
      },
    };
    this.log('security', `[SECURITY:${severity}] ${event}`, undefined, securityData);
  }

  public child(bindings: Record<string, unknown>): IStructuredLogger {
    const mergedBindings = {
      ...this.bindings,
      ...bindings,
    };
    return new StructuredLogger({
      serviceName: this.serviceName,
      minLevel: this.minLevel,
      redactor: this.redactor,
      destinationStream: this.destinationStream,
      jsonFormat: this.jsonFormat,
      bindings: mergedBindings,
    });
  }

  private log(
    level: LogLevel,
    rawMessage: string,
    rawError?: Error | unknown,
    rawData?: Record<string, unknown>
  ): void {
    if (!isLevelEnabled(this.minLevel, level)) {
      return;
    }

    try {
      const activeContext = CorrelationContext.get();
      const message = this.redactor.redactString(rawMessage);

      let sanitizedData: Record<string, unknown> | undefined;
      const combinedData = {
        ...this.bindings,
        ...(rawData || {}),
      };

      if (Object.keys(combinedData).length > 0) {
        sanitizedData = this.redactor.redactObject(combinedData);
      }

      let sanitizedError: LogRecord['error'];
      if (rawError) {
        sanitizedError = this.redactor.redactError(rawError) as LogRecord['error'];
      }

      const record: LogRecord = {
        timestamp: new Date().toISOString(),
        level,
        message,
        service: this.serviceName,
        correlation_id: activeContext?.correlation_id,
        trace_id: activeContext?.trace_id,
        span_id: activeContext?.span_id,
        workflow_run_id: activeContext?.workflow_run_id,
        job_id: activeContext?.job_id,
        shot_id: activeContext?.shot_id,
        project_id: activeContext?.project_id,
        user_id: activeContext?.user_id,
        data: sanitizedData,
        error: sanitizedError,
      };

      // Strip undefined keys
      for (const [key, value] of Object.entries(record)) {
        if (value === undefined) {
          delete (record as any)[key];
        }
      }

      const output = this.jsonFormat
        ? formatJsonLog(record) + '\n'
        : `[${record.timestamp}] [${record.level.toUpperCase()}] [${record.service}] ${record.message}\n`;

      this.destinationStream.write(output);
    } catch {
      // Fail-safe principle: logging errors must NEVER crash the host application
    }
  }
}

/**
 * Factory function to create a StructuredLogger
 */
export function createLogger(options: LoggerOptions): IStructuredLogger {
  return new StructuredLogger(options);
}
