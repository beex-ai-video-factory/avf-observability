import * as crypto from 'crypto';
import { EventEnvelope, validateEventEnvelope } from '@avf/contracts';
import { CorrelationContext } from '../context/correlation-context';
import { defaultRedactor, ISecretRedactor } from '../redactor/secret-redactor';

export interface CreateEventEnvelopeOptions<T = Record<string, unknown>> {
  eventType: string;
  aggregateId: string;
  aggregateVersion?: number;
  payload: T;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  workflowRunId?: string;
  schemaVersion?: string;
  validate?: boolean;
  redactor?: ISecretRedactor;
}

/**
 * Build a canonical distributed event envelope adhering to event-envelope.schema.json
 * with automatic correlation and trace context injection.
 */
export function createEventEnvelope<T = Record<string, unknown>>(
  options: CreateEventEnvelopeOptions<T>
): EventEnvelope<T> {
  const activeContext = CorrelationContext.get();
  const redactor = options.redactor || defaultRedactor;

  const event_id = crypto.randomUUID();
  const correlation_id = options.correlationId || activeContext?.correlation_id || crypto.randomUUID();
  const trace_id = options.traceId || activeContext?.trace_id;
  const span_id = options.spanId || activeContext?.span_id;
  const workflow_run_id = options.workflowRunId || activeContext?.workflow_run_id;
  const timestamp_utc = new Date().toISOString();
  const schema_version = options.schemaVersion || '1.0.0';
  const aggregate_version = options.aggregateVersion ?? 1;

  // Sanitize payload to guarantee zero secret leakage in distributed event streams
  const sanitizedPayload = redactor.redactObject(options.payload);

  const envelope: EventEnvelope<T> = {
    event_id,
    event_type: options.eventType,
    aggregate_id: options.aggregateId,
    aggregate_version,
    timestamp_utc,
    correlation_id,
    trace_id,
    span_id,
    workflow_run_id,
    schema_version,
    payload: sanitizedPayload,
  };

  if (options.validate !== false) {
    const validation = validateEventEnvelope(envelope);
    if (!validation.valid) {
      const issues = validation.errorMessage || validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ');
      throw new Error(`EventEnvelope validation failed: ${issues || 'Unknown schema violation'}`);
    }
  }

  return envelope;
}
