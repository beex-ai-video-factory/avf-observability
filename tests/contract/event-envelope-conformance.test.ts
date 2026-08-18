import {
  createEventEnvelope,
  CorrelationContext,
  createTracer,
} from '../../src';
import {
  EventEnvelopeValidator,
  EventTypes,
  validateEventEnvelope,
} from '@avf/contracts';

describe('R14 to R01 Contract Conformance — EventEnvelope', () => {
  it('produces envelopes that strictly conform to R01 event-envelope.schema.json', () => {
    const envelope = CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        span_id: '00f067aa0ba902b7',
        correlation_id: '550e8400-e29b-41d4-a716-446655440000',
        workflow_run_id: 'wf-run-1234',
        job_id: 'job-1234',
        service_name: 'R14_platform_observability',
      },
      () => {
        return createEventEnvelope({
          eventType: EventTypes.GENERATION_JOB_COMPLETED,
          aggregateId: 'job-1234',
          aggregateVersion: 2,
          payload: {
            video_uri: 'https://storage.provider.internal/videos/shot1.mp4',
            checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            generation_time_seconds: 14.2,
          },
        });
      }
    );

    // Contract schema assertion via @avf/contracts AJV instance
    const validation = validateEventEnvelope(envelope);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toBeUndefined();

    // Direct schema validator assertion
    expect(() => EventEnvelopeValidator.assert(envelope)).not.toThrow();
  });

  it('validates across all canonical domain event types', () => {
    const typesToTest = [
      EventTypes.GENERATION_JOB_CREATED,
      EventTypes.GENERATION_STAGE_CHANGED,
      EventTypes.GENERATION_JOB_SUBMITTED,
      EventTypes.GENERATION_JOB_COMPLETED,
      EventTypes.GENERATION_JOB_FAILED,
      EventTypes.GENERATION_JOB_CANCELLED,
      EventTypes.GENERATION_JOB_RECONCILED,
      EventTypes.TAKE_GENERATED,
      EventTypes.TAKE_QC_STARTED,
      EventTypes.TAKE_QC_COMPLETED,
      EventTypes.ASSET_REGISTERED,
      EventTypes.WORKER_LEASE_ACQUIRED,
      EventTypes.WORKER_LEASE_RENEWED,
      EventTypes.WORKER_LEASE_EXPIRED,
      EventTypes.DIAGNOSTIC_CAPTURED,
    ];

    for (const eventType of typesToTest) {
      const envelope = createEventEnvelope({
        eventType,
        aggregateId: 'test-aggregate-id',
        payload: { status: 'OK', type: eventType },
      });

      const res = validateEventEnvelope(envelope);
      expect(res.valid).toBe(true);
    }
  });

  it('verifies that end-to-end telemetry generation conforms with contract types', async () => {
    const tracer = createTracer('R14_platform_observability');

    await tracer.startActiveSpan('process_event', async (span) => {
      span.setAttribute('generation.stage', 'RENDERING');

      const envelope = createEventEnvelope({
        eventType: EventTypes.GENERATION_STAGE_CHANGED,
        aggregateId: 'stage-agg-1',
        payload: { stage: 'RENDERING' },
      });

      expect(envelope.trace_id).toBe(span.trace_id);
      expect(envelope.span_id).toBe(span.span_id);

      const validation = validateEventEnvelope(envelope);
      expect(validation.valid).toBe(true);
    });
  });
});
