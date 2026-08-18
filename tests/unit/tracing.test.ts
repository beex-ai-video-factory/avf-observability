import { createTracer } from '../../src/tracing/tracer-wrapper';
import { CorrelationContext } from '../../src/context/correlation-context';
import { NoopTracer, NoopSpan } from '../../src/tracing/noop-tracer';
import { Span } from '../../src/tracing/span-context';

describe('Tracer & Span Lifecycle Management', () => {
  const tracer = createTracer('R14_platform_observability');

  it('creates spans with attributes and events, redacting sensitive values', () => {
    const span = tracer.startSpan('generate_video_prompt', {
      parentSpanId: '0011223344556677',
      attributes: { initial_attr: 'val' },
    });
    expect(span.name).toBe('generate_video_prompt');
    expect(span.span_id).toHaveLength(16);
    expect(span.trace_id).toHaveLength(32);
    expect(span.parent_span_id).toBe('0011223344556677');

    span.setAttribute('prompt_text', 'Cinematic shot with key AIzaSyD98fjk28hskjdf8723kjsdhf8234kj');
    span.setAttribute('max_tokens', 2048);
    span.setAttribute('is_valid', true);
    span.addEvent('simple_event');
    span.addEvent('cache_miss', { 'query.token': 'Bearer secret_token_value', count: 1 });

    const attributes = span.getAttributes();
    expect(attributes.prompt_text).toContain('[REDACTED:GOOGLE_API_KEY]');
    expect(attributes.prompt_text).not.toContain('AIzaSyD');
    expect(attributes.max_tokens).toBe(2048);
    expect(attributes.is_valid).toBe(true);

    const events = span.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].name).toBe('simple_event');
    expect(events[1].attributes?.['query.token']).toBe('Bearer [REDACTED:BEARER_TOKEN]');
    expect(events[1].attributes?.count).toBe(1);

    span.end();
    expect(span.isEnded()).toBe(true);
    expect(span.getStatus().code).toBe('OK');
    expect(span.getDurationMs()).toBeGreaterThanOrEqual(0);

    // Operations after end are no-ops
    span.setAttribute('new_key', 'val');
    span.addEvent('event_after_end');
    span.setStatus({ code: 'ERROR' });
    expect(span.getStatus().code).toBe('OK');
  });

  it('records exceptions and sets ERROR status on spans', () => {
    const span = tracer.startSpan('failing_operation');
    span.recordException(new Error('Provider timeout with secret AIzaSyD98fjk28hskjdf8723kjsdhf8234kj'));
    span.end();

    expect(span.getStatus().code).toBe('ERROR');
    expect(span.getStatus().message).toContain('[REDACTED:GOOGLE_API_KEY]');

    const events = span.getEvents();
    const exceptionEvent = events.find((e) => e.name === 'exception');
    expect(exceptionEvent).toBeDefined();
    expect(exceptionEvent?.attributes?.['exception.message']).toContain('[REDACTED:GOOGLE_API_KEY]');
  });

  it('handles string and error without stack in recordException', () => {
    const span = new Span('test_span', '11112222333344445555666677778888');
    span.recordException('String error message');
    expect(span.getStatus().message).toBe('String error message');

    const errNoStack = new Error('No stack');
    delete errNoStack.stack;
    span.recordException(errNoStack);
    expect(span.getStatus().message).toBe('No stack');
  });

  it('measures duration before span end', () => {
    const span = new Span('running_span', '11112222333344445555666677778888');
    expect(span.getDurationMs()).toBeGreaterThanOrEqual(0);
  });

  it('manages active span lifecycle and correlation context propagation in startActiveSpan', async () => {
    const result = await CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        correlation_id: 'root-corr-123',
        service_name: 'test-service',
      },
      async () => {
        return tracer.startActiveSpan(
          'parent_operation',
          async (parentSpan) => {
            expect(CorrelationContext.getSpanId()).toBe(parentSpan.span_id);
            expect(CorrelationContext.getTraceId()).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

            const childResult = await tracer.startActiveSpan('child_operation', async (childSpan) => {
              expect(childSpan.parent_span_id).toBe(parentSpan.span_id);
              expect(childSpan.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
              expect(CorrelationContext.getSpanId()).toBe(childSpan.span_id);
              return 'success_from_child';
            });

            // Context reverts to parent span ID
            expect(CorrelationContext.getSpanId()).toBe(parentSpan.span_id);
            return childResult;
          },
          { attributes: { initialAttr: 'val' } }
        );
      }
    );

    expect(result).toBe('success_from_child');
  });

  it('executes withSpan correctly', () => {
    const span = tracer.startSpan('scoped_span');
    const res = tracer.withSpan(span, () => {
      expect(CorrelationContext.getSpanId()).toBe(span.span_id);
      return 'scoped_result';
    });
    expect(res).toBe('scoped_result');
  });

  it('records error and rethrows when startActiveSpan callback fails', async () => {
    let capturedSpanId = '';

    await expect(
      tracer.startActiveSpan('failing_active_span', async (span) => {
        capturedSpanId = span.span_id;
        throw new Error('Something went wrong');
      })
    ).rejects.toThrow('Something went wrong');

    expect(capturedSpanId).toHaveLength(16);
  });

  it('injects and extracts W3C traceparent headers with full context', () => {
    CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        span_id: '00f067aa0ba902b7',
        correlation_id: 'corr-id-999',
        workflow_run_id: 'wf-888',
        job_id: 'job-777',
        service_name: 'upstream-service',
      },
      () => {
        const headers: Record<string, string> = {};
        tracer.injectContextToHeaders(headers);

        expect(headers.traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
        expect(headers['x-correlation-id']).toBe('corr-id-999');
        expect(headers['x-workflow-run-id']).toBe('wf-888');
        expect(headers['x-job-id']).toBe('job-777');

        const extracted = tracer.extractContextFromHeaders(headers);
        expect(extracted.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
        expect(extracted.parent_span_id).toBe('00f067aa0ba902b7');
        expect(extracted.workflow_run_id).toBe('wf-888');
        expect(extracted.job_id).toBe('job-777');
      }
    );
  });

  it('covers NoopTracer and NoopSpan completely', async () => {
    const noopSpan = new NoopSpan();
    expect(noopSpan.span_id).toBe('0000000000000000');
    expect(noopSpan.trace_id).toBe('00000000000000000000000000000000');
    expect(noopSpan.name).toBe('noop');
    expect(noopSpan.setAttribute()).toBe(noopSpan);
    expect(noopSpan.setAttributes()).toBe(noopSpan);
    expect(noopSpan.addEvent()).toBe(noopSpan);
    expect(noopSpan.setStatus()).toBe(noopSpan);
    expect(noopSpan.recordException()).toBe(noopSpan);
    noopSpan.end();
    expect(noopSpan.isEnded()).toBe(true);
    expect(noopSpan.getDurationMs()).toBe(0);
    expect(noopSpan.getAttributes()).toEqual({});
    expect(noopSpan.getEvents()).toEqual([]);
    expect(noopSpan.getStatus()).toEqual({ code: 'OK' });

    const noop = new NoopTracer();
    expect(noop.startSpan()).toBeInstanceOf(NoopSpan);
    const res = await noop.startActiveSpan('test', async () => 'noop_active');
    expect(res).toBe('noop_active');
    expect(noop.withSpan(noopSpan, () => 'noop_with')).toBe('noop_with');
    const headers = { a: 'b' };
    expect(noop.injectContextToHeaders(headers)).toBe(headers);
    expect(noop.extractContextFromHeaders()).toEqual({});
  });
});
