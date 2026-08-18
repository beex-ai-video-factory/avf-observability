import { CorrelationContext, CorrelationContextData } from '../context/correlation-context';
import { generateSpanId, generateTraceId, isValidTraceId, formatTraceParent } from '../context/traceparent';
import { defaultRedactor, ISecretRedactor } from '../redactor/secret-redactor';
import { ISpan, Span, SpanAttributes } from './span-context';

export interface ITracer {
  startSpan(name: string, options?: { parentSpanId?: string; attributes?: SpanAttributes }): ISpan;
  startActiveSpan<T>(
    name: string,
    fn: (span: ISpan) => Promise<T>,
    options?: { attributes?: SpanAttributes }
  ): Promise<T>;
  withSpan<T>(span: ISpan, fn: () => T): T;
  injectContextToHeaders(headers: Record<string, string>): Record<string, string>;
  extractContextFromHeaders(headers: Record<string, string | string[] | undefined>): Partial<CorrelationContextData>;
}

export class Tracer implements ITracer {
  private serviceName: string;
  private redactor: ISecretRedactor;

  constructor(serviceName: string, redactor?: ISecretRedactor) {
    this.serviceName = serviceName;
    this.redactor = redactor || defaultRedactor;
  }

  /**
   * Start an unmanaged trace span
   */
  public startSpan(name: string, options?: { parentSpanId?: string; attributes?: SpanAttributes }): ISpan {
    const activeContext = CorrelationContext.get();
    const traceId = activeContext?.trace_id || generateTraceId();
    const parentSpanId = options?.parentSpanId || activeContext?.span_id;
    const spanId = generateSpanId();

    const span = new Span(name, traceId, parentSpanId, spanId, this.redactor);
    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }
    return span;
  }

  /**
   * Start an active span that automatically scopes the CorrelationContext and handles lifecycle
   */
  public async startActiveSpan<T>(
    name: string,
    fn: (span: ISpan) => Promise<T>,
    options?: { attributes?: SpanAttributes }
  ): Promise<T> {
    const activeContext = CorrelationContext.get();
    const traceId = activeContext?.trace_id && isValidTraceId(activeContext.trace_id)
      ? activeContext.trace_id
      : generateTraceId();
    const parentSpanId = activeContext?.span_id;
    const spanId = generateSpanId();

    const span = new Span(name, traceId, parentSpanId, spanId, this.redactor);
    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }

    return CorrelationContext.runWith(
      {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId,
        service_name: this.serviceName,
      },
      async () => {
        try {
          const result = await fn(span);
          if (!span.isEnded()) {
            span.end();
          }
          return result;
        } catch (error) {
          if (!span.isEnded()) {
            span.recordException(error);
            span.end();
          }
          throw error;
        }
      }
    );
  }

  /**
   * Run a function scoped under an existing span's context
   */
  public withSpan<T>(span: ISpan, fn: () => T): T {
    return CorrelationContext.runWith(
      {
        trace_id: span.trace_id,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
      },
      fn
    );
  }

  /**
   * Inject W3C traceparent and correlation headers into an outgoing HTTP headers object
   */
  public injectContextToHeaders(headers: Record<string, string>): Record<string, string> {
    const activeContext = CorrelationContext.get();
    const traceId = activeContext?.trace_id || generateTraceId();
    const spanId = activeContext?.span_id || generateSpanId();
    const correlationId = activeContext?.correlation_id || CorrelationContext.getCorrelationId();

    headers['traceparent'] = formatTraceParent({
      version: '00',
      trace_id: traceId,
      parent_id: spanId,
      trace_flags: '01',
    });
    headers['x-correlation-id'] = correlationId;

    if (activeContext?.workflow_run_id) {
      headers['x-workflow-run-id'] = activeContext.workflow_run_id;
    }
    if (activeContext?.job_id) {
      headers['x-job-id'] = activeContext.job_id;
    }

    return headers;
  }

  /**
   * Extract correlation context and traceparent from incoming headers
   */
  public extractContextFromHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Partial<CorrelationContextData> {
    return CorrelationContext.fromHeaders(headers, this.serviceName);
  }
}

/**
 * Factory function to create a Tracer
 */
export function createTracer(serviceName: string, redactor?: ISecretRedactor): ITracer {
  return new Tracer(serviceName, redactor);
}
