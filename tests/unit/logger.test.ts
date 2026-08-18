import { Writable } from 'stream';
import { StructuredLogger, createLogger } from '../../src/logging/structured-logger';
import { isLevelEnabled } from '../../src/logging/log-levels';
import { CorrelationContext } from '../../src/context/correlation-context';

class MemoryStream extends Writable {
  public lines: string[] = [];

  _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
    this.lines.push(chunk.toString());
    callback();
  }

  public getParsedLogs(): any[] {
    return this.lines.map((l) => JSON.parse(l.trim()));
  }

  public clear(): void {
    this.lines = [];
  }
}

describe('StructuredLogger Implementation', () => {
  let memoryStream: MemoryStream;

  beforeEach(() => {
    memoryStream = new MemoryStream();
  });

  it('formats JSON log records with standard fields and timestamp', () => {
    const logger = new StructuredLogger({
      serviceName: 'R14_platform_observability',
      minLevel: 'debug',
      destinationStream: memoryStream,
    });

    logger.info('Engine initialized successfully', { port: 8080 });

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].service).toBe('R14_platform_observability');
    expect(logs[0].level).toBe('info');
    expect(logs[0].message).toBe('Engine initialized successfully');
    expect(logs[0].data?.port).toBe(8080);
    expect(new Date(logs[0].timestamp).getTime()).not.toBeNaN();
  });

  it('filters log levels below configured minLevel threshold', () => {
    const logger = new StructuredLogger({
      serviceName: 'test-service',
      minLevel: 'warn',
      destinationStream: memoryStream,
    });

    logger.trace('Trace message');
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].level).toBe('warn');
    expect(logs[1].level).toBe('error');
  });

  it('evaluates isLevelEnabled with fallback weights', () => {
    expect(isLevelEnabled('info', 'warn')).toBe(true);
    expect(isLevelEnabled('error', 'debug')).toBe(false);
    expect(isLevelEnabled('unknown' as any, 'info')).toBe(true);
    expect(isLevelEnabled('info', 'unknown' as any)).toBe(true);
  });

  it('reads LOG_LEVEL from environment variable when minLevel omitted', () => {
    const orig = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    const logger = new StructuredLogger({
      serviceName: 'env-service',
      destinationStream: memoryStream,
    });
    expect(logger.minLevel).toBe('warn');
    process.env.LOG_LEVEL = orig;
  });

  it('automatically injects active correlation context into log records', () => {
    const logger = createLogger({
      serviceName: 'worker-service',
      destinationStream: memoryStream,
    });

    CorrelationContext.run(
      {
        trace_id: '11112222333344445555666677778888',
        span_id: 'span-9999',
        correlation_id: 'corr-5555',
        workflow_run_id: 'wf-run-777',
        job_id: 'job-123',
        service_name: 'worker-service',
      },
      () => {
        logger.info('Rendering scene completed');
      }
    );

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].trace_id).toBe('11112222333344445555666677778888');
    expect(logs[0].span_id).toBe('span-9999');
    expect(logs[0].correlation_id).toBe('corr-5555');
    expect(logs[0].workflow_run_id).toBe('wf-run-777');
    expect(logs[0].job_id).toBe('job-123');
  });

  it('redacts sensitive API keys and passwords from log message and data payload', () => {
    const logger = createLogger({
      serviceName: 'auth-service',
      destinationStream: memoryStream,
    });

    logger.error('Connection failed with token AIzaSyD98fjk28hskjdf8723kjsdhf8234kj', new Error('Auth fail'), {
      password: 'MySecretPassword',
      client_secret: 'SecretSecret123',
      apiKey: 'sk-abcdef1234567890abcdef1234567890',
    });

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('[REDACTED:GOOGLE_API_KEY]');
    expect(logs[0].data?.password).toBe('[REDACTED:FIELD]');
    expect(logs[0].data?.client_secret).toBe('[REDACTED:FIELD]');
    expect(logs[0].data?.apiKey).toBe('[REDACTED:FIELD]');
    expect(memoryStream.lines[0]).not.toContain('MySecretPassword');
    expect(memoryStream.lines[0]).not.toContain('AIzaSyD');
  });

  it('supports child loggers with persistent contextual bindings', () => {
    const rootLogger = createLogger({
      serviceName: 'shot-renderer',
      destinationStream: memoryStream,
    });

    const childLogger = rootLogger.child({ shotId: 'shot-001', sceneId: 'scene-002' });
    childLogger.info('Encoding frame', { frameNumber: 120 });

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].data?.shotId).toBe('shot-001');
    expect(logs[0].data?.sceneId).toBe('scene-002');
    expect(logs[0].data?.frameNumber).toBe(120);
  });

  it('emits structured audit logs with actor and resource metadata', () => {
    const logger = createLogger({
      serviceName: 'admin-service',
      destinationStream: memoryStream,
    });

    logger.audit('DELETE_PROJECT', 'operator_alice', 'project_uuid_999', { reason: 'user_request' });

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('audit');
    expect(logs[0].data?.audit?.action).toBe('DELETE_PROJECT');
    expect(logs[0].data?.audit?.actor).toBe('operator_alice');
    expect(logs[0].data?.audit?.resource).toBe('project_uuid_999');
  });

  it('emits high-severity security events', () => {
    const logger = createLogger({
      serviceName: 'security-gateway',
      destinationStream: memoryStream,
    });

    logger.security('CAPTCHA_CHALLENGE_DETECTED', 'HIGH', { provider: 'google_flow' });

    const logs = memoryStream.getParsedLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('security');
    expect(logs[0].data?.security?.event).toBe('CAPTCHA_CHALLENGE_DETECTED');
    expect(logs[0].data?.security?.severity).toBe('HIGH');
  });

  it('supports non-json format fallback', () => {
    const logger = createLogger({
      serviceName: 'simple-service',
      jsonFormat: false,
      destinationStream: memoryStream,
    });

    logger.info('Simple text message');
    expect(memoryStream.lines[0]).toContain('[INFO] [simple-service] Simple text message');
  });

  it('handles logger stream write exceptions without throwing (fail-safe)', () => {
    const brokenStream = new Writable({
      write() {
        throw new Error('Stream write failed');
      },
    });

    const logger = new StructuredLogger({
      serviceName: 'fail-safe-service',
      destinationStream: brokenStream,
    });

    expect(() => logger.info('This will trigger stream failure')).not.toThrow();
  });
});
