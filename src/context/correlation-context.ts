import { AsyncLocalStorage } from 'async_hooks';
import * as crypto from 'crypto';
import {
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  parseTraceParent,
  formatTraceParent,
} from './traceparent';

export interface CorrelationContextData {
  trace_id: string;              // 32-character hex trace ID
  span_id?: string;              // 16-character hex active span ID
  correlation_id: string;        // UUID tracking root request inception
  parent_span_id?: string;       // 16-character hex parent span ID
  workflow_run_id?: string;      // Temporal workflow execution ID
  job_id?: string;               // Generation job UUID
  shot_id?: string;              // Shot UUID
  project_id?: string;           // Project UUID
  user_id?: string;              // Authenticated user UUID
  service_name: string;          // Service identifier (e.g., 'R14_platform_observability')
  custom_tags?: Record<string, string>;
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContextData>();

export class CorrelationContext {
  private static defaultServiceName = 'avf-service';

  /**
   * Set global fallback service name when none is provided
   */
  public static setDefaultServiceName(name: string): void {
    CorrelationContext.defaultServiceName = name;
  }

  /**
   * Run a callback within an explicit correlation context
   */
  public static run<T>(context: CorrelationContextData, fn: () => T): T {
    const normalizedContext: CorrelationContextData = {
      ...context,
      trace_id: isValidTraceId(context.trace_id) ? context.trace_id : generateTraceId(),
      correlation_id: context.correlation_id || crypto.randomUUID(),
      service_name: context.service_name || CorrelationContext.defaultServiceName,
      custom_tags: context.custom_tags ? { ...context.custom_tags } : {},
    };
    return asyncLocalStorage.run(normalizedContext, fn);
  }

  /**
   * Run a callback inheriting the active context with overrides
   */
  public static runWith<T>(partial: Partial<CorrelationContextData>, fn: () => T): T {
    const active = asyncLocalStorage.getStore();
    const merged: CorrelationContextData = {
      trace_id: partial.trace_id || active?.trace_id || generateTraceId(),
      correlation_id: partial.correlation_id || active?.correlation_id || crypto.randomUUID(),
      service_name: partial.service_name || active?.service_name || CorrelationContext.defaultServiceName,
      span_id: partial.span_id !== undefined ? partial.span_id : active?.span_id,
      parent_span_id: partial.parent_span_id !== undefined ? partial.parent_span_id : active?.parent_span_id,
      workflow_run_id: partial.workflow_run_id !== undefined ? partial.workflow_run_id : active?.workflow_run_id,
      job_id: partial.job_id !== undefined ? partial.job_id : active?.job_id,
      shot_id: partial.shot_id !== undefined ? partial.shot_id : active?.shot_id,
      project_id: partial.project_id !== undefined ? partial.project_id : active?.project_id,
      user_id: partial.user_id !== undefined ? partial.user_id : active?.user_id,
      custom_tags: {
        ...(active?.custom_tags || {}),
        ...(partial.custom_tags || {}),
      },
    };
    return asyncLocalStorage.run(merged, fn);
  }

  /**
   * Get the current active context, or undefined if outside a context
   */
  public static get(): CorrelationContextData | undefined {
    return asyncLocalStorage.getStore();
  }

  /**
   * Get the active trace_id or generate a fallback trace_id
   */
  public static getTraceId(): string {
    const active = asyncLocalStorage.getStore();
    return active?.trace_id || generateTraceId();
  }

  /**
   * Get the active correlation_id or generate a fallback UUID
   */
  public static getCorrelationId(): string {
    const active = asyncLocalStorage.getStore();
    return active?.correlation_id || crypto.randomUUID();
  }

  /**
   * Get the active span_id if present
   */
  public static getSpanId(): string | undefined {
    const active = asyncLocalStorage.getStore();
    return active?.span_id;
  }

  /**
   * Get the active service_name
   */
  public static getServiceName(): string {
    const active = asyncLocalStorage.getStore();
    return active?.service_name || CorrelationContext.defaultServiceName;
  }

  /**
   * Add or update a custom tag in the current active context
   */
  public static setCustomTag(key: string, value: string): void {
    const active = asyncLocalStorage.getStore();
    if (active) {
      if (!active.custom_tags) {
        active.custom_tags = {};
      }
      active.custom_tags[key] = value;
    }
  }

  /**
   * Derive a child context data object for downstream propagation
   */
  public static createChildContext(serviceName?: string, spanId?: string): CorrelationContextData {
    const active = asyncLocalStorage.getStore();
    const trace_id = active?.trace_id || generateTraceId();
    const correlation_id = active?.correlation_id || crypto.randomUUID();
    const parent_span_id = active?.span_id;
    const new_span_id = spanId && isValidSpanId(spanId) ? spanId : generateSpanId();

    return {
      trace_id,
      span_id: new_span_id,
      parent_span_id,
      correlation_id,
      service_name: serviceName || active?.service_name || CorrelationContext.defaultServiceName,
      workflow_run_id: active?.workflow_run_id,
      job_id: active?.job_id,
      shot_id: active?.shot_id,
      project_id: active?.project_id,
      user_id: active?.user_id,
      custom_tags: active?.custom_tags ? { ...active.custom_tags } : {},
    };
  }

  /**
   * Export active context into standard HTTP headers (W3C traceparent, x-correlation-id, etc.)
   */
  public static toHeaders(): Record<string, string> {
    const active = asyncLocalStorage.getStore();
    const headers: Record<string, string> = {};

    const traceId = active?.trace_id || generateTraceId();
    const spanId = active?.span_id || generateSpanId();
    const correlationId = active?.correlation_id || crypto.randomUUID();

    headers['traceparent'] = formatTraceParent({
      version: '00',
      trace_id: traceId,
      parent_id: spanId,
      trace_flags: '01',
    });

    headers['x-correlation-id'] = correlationId;

    if (active?.workflow_run_id) {
      headers['x-workflow-run-id'] = active.workflow_run_id;
    }
    if (active?.job_id) {
      headers['x-job-id'] = active.job_id;
    }
    if (active?.shot_id) {
      headers['x-shot-id'] = active.shot_id;
    }
    if (active?.project_id) {
      headers['x-project-id'] = active.project_id;
    }

    return headers;
  }

  /**
   * Extract correlation context from incoming HTTP headers or metadata map
   */
  public static fromHeaders(
    headers: Record<string, string | string[] | undefined>,
    defaultServiceName?: string
  ): CorrelationContextData {
    const getHeader = (key: string): string | undefined => {
      const lowerKey = key.toLowerCase();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lowerKey) {
          if (Array.isArray(v)) return v[0];
          return v;
        }
      }
      return undefined;
    };

    const traceparentHeader = getHeader('traceparent');
    const parsedTp = parseTraceParent(traceparentHeader);

    const trace_id = parsedTp?.trace_id || generateTraceId();
    const parent_span_id = parsedTp?.parent_id;
    const span_id = generateSpanId();

    const correlation_id =
      getHeader('x-correlation-id') ||
      getHeader('correlation-id') ||
      getHeader('x-request-id') ||
      crypto.randomUUID();

    const workflow_run_id = getHeader('x-workflow-run-id') || getHeader('workflow-run-id');
    const job_id = getHeader('x-job-id') || getHeader('job-id');
    const shot_id = getHeader('x-shot-id') || getHeader('shot-id');
    const project_id = getHeader('x-project-id') || getHeader('project-id');
    const user_id = getHeader('x-user-id') || getHeader('user-id');

    return {
      trace_id,
      span_id,
      parent_span_id,
      correlation_id,
      service_name: defaultServiceName || CorrelationContext.defaultServiceName,
      workflow_run_id,
      job_id,
      shot_id,
      project_id,
      user_id,
      custom_tags: {},
    };
  }
}
