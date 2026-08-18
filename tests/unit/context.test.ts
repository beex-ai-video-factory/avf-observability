import { CorrelationContext } from '../../src/context/correlation-context';

describe('CorrelationContext AsyncLocalStorage Manager', () => {
  it('returns fallback trace_id and correlation_id when outside active context', () => {
    expect(CorrelationContext.get()).toBeUndefined();
    const traceId = CorrelationContext.getTraceId();
    expect(traceId).toHaveLength(32);
    const corrId = CorrelationContext.getCorrelationId();
    expect(corrId).toBeDefined();
    expect(CorrelationContext.getSpanId()).toBeUndefined();
    expect(CorrelationContext.getServiceName()).toBe('avf-service');
  });

  it('sets and retrieves default service name', () => {
    CorrelationContext.setDefaultServiceName('custom-avf-service');
    expect(CorrelationContext.getServiceName()).toBe('custom-avf-service');
    CorrelationContext.setDefaultServiceName('avf-service');
  });

  it('propagates context through nested async/await operations', async () => {
    const traceId = '11112222333344445555666677778888';
    const correlationId = 'corr-uuid-1234';

    await CorrelationContext.run(
      {
        trace_id: traceId,
        correlation_id: correlationId,
        service_name: 'R14_platform_observability',
        job_id: 'job-100',
      },
      async () => {
        expect(CorrelationContext.get()?.trace_id).toBe(traceId);
        expect(CorrelationContext.getCorrelationId()).toBe(correlationId);
        expect(CorrelationContext.get()?.job_id).toBe('job-100');

        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(CorrelationContext.get()?.trace_id).toBe(traceId);
      }
    );

    // Cleans up after run
    expect(CorrelationContext.get()).toBeUndefined();
  });

  it('preserves isolated context across concurrent Promise.all branches', async () => {
    const taskA = CorrelationContext.run(
      {
        trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        correlation_id: 'corr-A',
        service_name: 'service-A',
      },
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        return {
          trace: CorrelationContext.getTraceId(),
          corr: CorrelationContext.getCorrelationId(),
        };
      }
    );

    const taskB = CorrelationContext.run(
      {
        trace_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        correlation_id: 'corr-B',
        service_name: 'service-B',
      },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return {
          trace: CorrelationContext.getTraceId(),
          corr: CorrelationContext.getCorrelationId(),
        };
      }
    );

    const [resA, resB] = await Promise.all([taskA, taskB]);
    expect(resA.trace).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(resA.corr).toBe('corr-A');
    expect(resB.trace).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(resB.corr).toBe('corr-B');
  });

  it('merges overrides in runWith without mutating outer context', () => {
    CorrelationContext.run(
      {
        trace_id: '11112222333344445555666677778888',
        correlation_id: 'root-corr',
        service_name: 'outer-service',
        custom_tags: { tag1: 'val1' },
      },
      () => {
        expect(CorrelationContext.get()?.span_id).toBeUndefined();

        CorrelationContext.runWith(
          {
            span_id: '0000111122223333',
            custom_tags: { tag2: 'val2' },
          },
          () => {
            const inner = CorrelationContext.get();
            expect(inner?.trace_id).toBe('11112222333344445555666677778888');
            expect(inner?.span_id).toBe('0000111122223333');
            expect(inner?.custom_tags).toEqual({ tag1: 'val1', tag2: 'val2' });
          }
        );

        // Outer context remains unchanged
        expect(CorrelationContext.get()?.span_id).toBeUndefined();
        expect(CorrelationContext.get()?.custom_tags).toEqual({ tag1: 'val1' });
      }
    );
  });

  it('sets custom tag inside active context', () => {
    CorrelationContext.run(
      {
        trace_id: '11112222333344445555666677778888',
        correlation_id: 'corr-id',
        service_name: 'test-service',
      },
      () => {
        CorrelationContext.setCustomTag('shot_type', 'EXT_WIDE');
        expect(CorrelationContext.get()?.custom_tags?.shot_type).toBe('EXT_WIDE');
      }
    );
  });

  it('creates child context with derived parent span ID', () => {
    CorrelationContext.run(
      {
        trace_id: '11112222333344445555666677778888',
        span_id: '0011223344556677',
        correlation_id: 'corr-root',
        service_name: 'parent-service',
        workflow_run_id: 'wf-123',
      },
      () => {
        const child = CorrelationContext.createChildContext('child-service', '8899aabbccddeeff');
        expect(child.trace_id).toBe('11112222333344445555666677778888');
        expect(child.parent_span_id).toBe('0011223344556677');
        expect(child.span_id).toBe('8899aabbccddeeff');
        expect(child.service_name).toBe('child-service');
        expect(child.workflow_run_id).toBe('wf-123');
      }
    );
  });

  it('converts to standard HTTP headers and extracts back', () => {
    CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        span_id: '00f067aa0ba902b7',
        correlation_id: '550e8400-e29b-41d4-a716-446655440000',
        workflow_run_id: 'wf-999',
        job_id: 'job-888',
        shot_id: 'shot-777',
        project_id: 'proj-666',
        user_id: 'user-555',
        service_name: 'test-service',
      },
      () => {
        const headers = CorrelationContext.toHeaders();
        expect(headers.traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
        expect(headers['x-correlation-id']).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(headers['x-workflow-run-id']).toBe('wf-999');
        expect(headers['x-job-id']).toBe('job-888');
        expect(headers['x-shot-id']).toBe('shot-777');
        expect(headers['x-project-id']).toBe('proj-666');

        const extracted = CorrelationContext.fromHeaders(
          {
            ...headers,
            'x-user-id': 'user-555',
          },
          'downstream-service'
        );
        expect(extracted.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
        expect(extracted.parent_span_id).toBe('00f067aa0ba902b7');
        expect(extracted.correlation_id).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(extracted.workflow_run_id).toBe('wf-999');
        expect(extracted.user_id).toBe('user-555');
        expect(extracted.service_name).toBe('downstream-service');
      }
    );
  });

  it('extracts headers with array values and alternate header names', () => {
    const extracted = CorrelationContext.fromHeaders({
      'correlation-id': ['corr-arr-123'],
      'workflow-run-id': ['wf-arr-456'],
      'job-id': 'job-789',
      'shot-id': 'shot-101',
      'project-id': 'proj-102',
      'user-id': 'usr-103',
    });

    expect(extracted.correlation_id).toBe('corr-arr-123');
    expect(extracted.workflow_run_id).toBe('wf-arr-456');
    expect(extracted.job_id).toBe('job-789');
    expect(extracted.shot_id).toBe('shot-101');
    expect(extracted.project_id).toBe('proj-102');
    expect(extracted.user_id).toBe('usr-103');
  });
});
