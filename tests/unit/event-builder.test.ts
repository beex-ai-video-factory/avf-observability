import { createEventEnvelope } from '../../src/events/event-builder';
import { CorrelationContext } from '../../src/context/correlation-context';
import { EventTypes } from '@avf/contracts';

describe('EventEnvelope Builder', () => {
  it('constructs a valid EventEnvelope populated from active CorrelationContext', () => {
    const envelope = CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        span_id: '00f067aa0ba902b7',
        correlation_id: '550e8400-e29b-41d4-a716-446655440000',
        workflow_run_id: 'wf-run-101',
        service_name: 'test-service',
      },
      () => {
        return createEventEnvelope({
          eventType: EventTypes.GENERATION_JOB_CREATED,
          aggregateId: 'job-uuid-1234',
          payload: {
            prompt_text: 'A cinematic sunset over a neon city',
            resolution: '1080p',
          },
        });
      }
    );

    expect(envelope.event_id).toBeDefined();
    expect(envelope.event_type).toBe(EventTypes.GENERATION_JOB_CREATED);
    expect(envelope.aggregate_id).toBe('job-uuid-1234');
    expect(envelope.aggregate_version).toBe(1);
    expect(envelope.correlation_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(envelope.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(envelope.span_id).toBe('00f067aa0ba902b7');
    expect(envelope.workflow_run_id).toBe('wf-run-101');
    expect(envelope.schema_version).toBe('1.0.0');
    expect(envelope.payload).toEqual({
      prompt_text: 'A cinematic sunset over a neon city',
      resolution: '1080p',
    });
  });

  it('constructs envelope with explicit override parameters and skip validation', () => {
    const env = createEventEnvelope({
      eventType: 'custom.event',
      aggregateId: 'agg-1',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      traceId: '11112222333344445555666677778888',
      spanId: '1122334455667788',
      workflowRunId: 'wf-custom',
      schemaVersion: '1.0.0',
      aggregateVersion: 3,
      payload: { custom: 'data' },
      validate: false,
    });

    expect(env.correlation_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(env.trace_id).toBe('11112222333344445555666677778888');
    expect(env.span_id).toBe('1122334455667788');
    expect(env.workflow_run_id).toBe('wf-custom');
    expect(env.aggregate_version).toBe(3);
  });

  it('redacts sensitive fields inside event envelope payload', () => {
    const envelope = createEventEnvelope({
      eventType: EventTypes.DIAGNOSTIC_CAPTURED,
      aggregateId: 'diag-1',
      payload: {
        api_key: 'AIzaSyD98fjk28hskjdf8723kjsdhf8234kj',
        password: 'PlainTextPassword',
        log: 'Bearer secret_token_xyz',
      },
    });

    expect(envelope.payload.api_key).toBe('[REDACTED:FIELD]');
    expect(envelope.payload.password).toBe('[REDACTED:FIELD]');
    expect(envelope.payload.log).toBe('Bearer [REDACTED:BEARER_TOKEN]');
  });

  it('throws validation error if envelope fails schema rules when validation is enabled', () => {
    expect(() => {
      createEventEnvelope({
        eventType: '', // invalid empty event type
        aggregateId: '',
        payload: {},
        validate: true,
      });
    }).toThrow('EventEnvelope validation failed');
  });
});
