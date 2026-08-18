import * as crypto from 'crypto';

/**
 * Parsed W3C TraceContext traceparent structure
 * Format: {version}-{trace_id}-{parent_id}-{trace_flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export interface W3CTraceParent {
  version: string;     // '00'
  trace_id: string;    // 32-hex character string (16 bytes)
  parent_id: string;   // 16-hex character string (8 bytes, also called span_id)
  trace_flags: string; // 2-hex character string ('00' or '01')
}

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ALL_ZERO_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZERO_SPAN_ID = '0000000000000000';

/**
 * Generate a random 32-hex character trace ID (16 bytes)
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a random 16-hex character span ID (8 bytes)
 */
export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Validate whether a string is a valid non-zero 32-hex trace ID
 */
export function isValidTraceId(traceId: string): boolean {
  if (typeof traceId !== 'string') return false;
  if (!/^[0-9a-f]{32}$/i.test(traceId)) return false;
  return traceId !== ALL_ZERO_TRACE_ID;
}

/**
 * Validate whether a string is a valid non-zero 16-hex span ID
 */
export function isValidSpanId(spanId: string): boolean {
  if (typeof spanId !== 'string') return false;
  if (!/^[0-9a-f]{16}$/i.test(spanId)) return false;
  return spanId !== ALL_ZERO_SPAN_ID;
}

/**
 * Parse a W3C traceparent header string.
 * Returns null if the header is invalid according to W3C specification.
 */
export function parseTraceParent(header: string | undefined | null): W3CTraceParent | null {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const trimmed = header.trim();
  const match = TRACEPARENT_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, version, trace_id, parent_id, trace_flags] = match;

  // W3C spec rule: version ff is invalid
  if (version.toLowerCase() === 'ff') {
    return null;
  }

  // All-zero trace_id or span_id is invalid
  if (trace_id === ALL_ZERO_TRACE_ID || parent_id === ALL_ZERO_SPAN_ID) {
    return null;
  }

  return {
    version: version.toLowerCase(),
    trace_id: trace_id.toLowerCase(),
    parent_id: parent_id.toLowerCase(),
    trace_flags: trace_flags.toLowerCase(),
  };
}

/**
 * Serialize a W3CTraceParent object into a standard W3C traceparent header string.
 */
export function formatTraceParent(tp: W3CTraceParent): string {
  const version = (tp.version || '00').toLowerCase().padStart(2, '0');
  const traceId = (tp.trace_id || generateTraceId()).toLowerCase().padStart(32, '0');
  const parentId = (tp.parent_id || generateSpanId()).toLowerCase().padStart(16, '0');
  const flags = (tp.trace_flags || '01').toLowerCase().padStart(2, '0');

  return `${version}-${traceId}-${parentId}-${flags}`;
}

/**
 * Create a new traceparent header value with freshly generated IDs or overrides.
 */
export function createTraceParent(traceId?: string, spanId?: string, sampled = true): string {
  return formatTraceParent({
    version: '00',
    trace_id: traceId && isValidTraceId(traceId) ? traceId : generateTraceId(),
    parent_id: spanId && isValidSpanId(spanId) ? spanId : generateSpanId(),
    trace_flags: sampled ? '01' : '00',
  });
}
