import { MetricsRegistry } from '../../src/metrics/metrics-registry';
import { registerStandardAVFMetrics, AVF_STANDARD_METRICS } from '../../src/metrics/avf-metrics';

describe('Prometheus Metrics Collectors & Exposition Registry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  describe('Counter', () => {
    it('increments monotonically with label dimensions', () => {
      const counter = registry.createCounter('test_counter_total', 'Test counter', ['service', 'status']);

      counter.inc({ service: 'video_gen', status: 'success' });
      counter.inc({ service: 'video_gen', status: 'success' }, 4);
      counter.inc({ service: 'video_gen', status: 'error' }, 2);

      expect(counter.get({ service: 'video_gen', status: 'success' })).toBe(5);
      expect(counter.get({ service: 'video_gen', status: 'error' })).toBe(2);
      expect(counter.get({ service: 'video_gen', status: 'unknown' })).toBe(0);

      counter.reset();
      expect(counter.get({ service: 'video_gen', status: 'success' })).toBe(0);
    });

    it('increments without labels', () => {
      const counter = registry.createCounter('simple_counter', 'Simple counter');
      counter.inc();
      expect(counter.get()).toBe(1);
      counter.inc(5);
      expect(counter.get()).toBe(6);
    });

    it('rejects negative increments', () => {
      const counter = registry.createCounter('invalid_counter', 'Help');
      expect(() => counter.inc(-1)).toThrow('must be non-negative');
    });
  });

  describe('Gauge', () => {
    it('sets, increments, and decrements arbitrary values with labels', () => {
      const gauge = registry.createGauge('active_workers', 'Number of active workers', ['pool']);

      gauge.set({ pool: 'gpu' }, 10);
      expect(gauge.get({ pool: 'gpu' })).toBe(10);

      gauge.inc({ pool: 'gpu' }, 5);
      expect(gauge.get({ pool: 'gpu' })).toBe(15);

      gauge.dec({ pool: 'gpu' }, 3);
      expect(gauge.get({ pool: 'gpu' })).toBe(12);

      gauge.reset();
      expect(gauge.get({ pool: 'gpu' })).toBe(0);
    });

    it('sets, increments, and decrements without labels', () => {
      const gauge = registry.createGauge('simple_gauge', 'Simple');
      gauge.set(20);
      expect(gauge.get()).toBe(20);
      gauge.inc();
      expect(gauge.get()).toBe(21);
      gauge.inc(4);
      expect(gauge.get()).toBe(25);
      gauge.dec();
      expect(gauge.get()).toBe(24);
      gauge.dec(4);
      expect(gauge.get()).toBe(20);
    });
  });

  describe('Histogram', () => {
    it('accumulates observations into standard exponential buckets', () => {
      const hist = registry.createHistogram(
        'request_duration_seconds',
        'Request latency',
        ['endpoint'],
        [0.1, 0.5, 1.0, 5.0]
      );

      hist.observe({ endpoint: '/generate' }, 0.05); // <= 0.1, 0.5, 1.0, 5.0
      hist.observe({ endpoint: '/generate' }, 0.4);  // <= 0.5, 1.0, 5.0
      hist.observe({ endpoint: '/generate' }, 2.0);  // <= 5.0
      hist.observe({ endpoint: '/generate' }, 10.0); // > 5.0 (only +Inf)

      const records = hist.collect();
      expect(records).toHaveLength(1);
      const rec = records[0];
      expect(rec.count).toBe(4);
      expect(rec.sum).toBeCloseTo(12.45);
      expect(rec.bucketCounts.get(0.1)).toBe(1);
      expect(rec.bucketCounts.get(0.5)).toBe(2);
      expect(rec.bucketCounts.get(1.0)).toBe(2);
      expect(rec.bucketCounts.get(5.0)).toBe(3);
    });

    it('observes without labels', () => {
      const hist = registry.createHistogram('unlabeled_hist', 'Unlabeled', [], [1, 2]);
      hist.observe(1.5);
      expect(hist.collect()[0].count).toBe(1);
    });

    it('measures elapsed execution time using startTimer', async () => {
      const hist = registry.createHistogram('timed_operation', 'Timed operation', ['op']);
      const endTimer = hist.startTimer({ op: 'sleep' });

      await new Promise((resolve) => setTimeout(resolve, 50));
      const duration = endTimer();

      expect(duration).toBeGreaterThanOrEqual(0.04);
      const records = hist.collect();
      expect(records[0].count).toBe(1);
      expect(records[0].sum).toBe(duration);
    });
  });

  describe('MetricsRegistry & Prometheus Exposition Export', () => {
    it('exports all metric types in valid Prometheus v0.0.4 text format', () => {
      const counter = registry.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'code']);
      counter.inc({ method: 'POST', code: 200 }, 42);

      const gauge = registry.createGauge('memory_usage_bytes', 'Process memory', ['type']);
      gauge.set({ type: 'heap' }, 1048576);

      const hist = registry.createHistogram('job_duration_seconds', 'Job latency', ['type'], [1, 5]);
      hist.observe({ type: 'video' }, 2.5);

      const exported = registry.exportPrometheus();

      expect(exported).toContain('# HELP http_requests_total Total HTTP requests');
      expect(exported).toContain('# TYPE http_requests_total counter');
      expect(exported).toContain('http_requests_total{method="POST",code="200"} 42');

      expect(exported).toContain('# HELP memory_usage_bytes Process memory');
      expect(exported).toContain('# TYPE memory_usage_bytes gauge');
      expect(exported).toContain('memory_usage_bytes{type="heap"} 1048576');

      expect(exported).toContain('# HELP job_duration_seconds Job latency');
      expect(exported).toContain('# TYPE job_duration_seconds histogram');
      expect(exported).toContain('job_duration_seconds_bucket{type="video",le="1"} 0');
      expect(exported).toContain('job_duration_seconds_bucket{type="video",le="5"} 1');
      expect(exported).toContain('job_duration_seconds_bucket{type="video",le="+Inf"} 1');
      expect(exported).toContain('job_duration_seconds_sum{type="video"} 2.5');
      expect(exported).toContain('job_duration_seconds_count{type="video"} 1');
    });

    it('handles empty metrics when exporting exposition', () => {
      registry.createCounter('empty_counter', 'Empty counter');
      registry.createGauge('empty_gauge', 'Empty gauge');
      registry.createHistogram('empty_hist', 'Empty histogram');

      const exp = registry.exportPrometheus();
      expect(exp).toContain('empty_counter 0');
      expect(exp).toContain('empty_gauge 0');
      expect(exp).toContain('empty_hist_count 0');
    });

    it('returns existing metric on duplicate registration or throws if type differs', () => {
      const c1 = registry.createCounter('metric_a', 'Help A');
      const c2 = registry.createCounter('metric_a', 'Help A');
      expect(c1).toBe(c2);

      const g1 = registry.createGauge('metric_g', 'Help G');
      const g2 = registry.createGauge('metric_g', 'Help G');
      expect(g1).toBe(g2);

      const h1 = registry.createHistogram('metric_h', 'Help H');
      const h2 = registry.createHistogram('metric_h', 'Help H');
      expect(h1).toBe(h2);

      expect(() => registry.createGauge('metric_a', 'Help A')).toThrow('already registered as a different type');
      expect(() => registry.createHistogram('metric_a', 'Help A')).toThrow('already registered as a different type');
    });

    it('fetches metric by name and clears registry', () => {
      const c = registry.createCounter('lookup_metric', 'Help');
      expect(registry.getMetric('lookup_metric')).toBe(c);
      expect(registry.getMetric('non_existent')).toBeUndefined();

      registry.clear();
      expect(registry.getMetric('lookup_metric')).toBeUndefined();
      expect(registry.exportPrometheus()).toBe('');
    });
  });

  describe('Standard AVF Platform Metrics', () => {
    it('registers and records standard platform metrics correctly', () => {
      const std = registerStandardAVFMetrics(registry);

      std.providerGenerationDuration.observe({ provider_id: 'fake_provider', operation: 'render', status: 'OK' }, 1.5);
      std.providerCostCredits.inc({ provider_id: 'fake_provider', project_id: 'proj-1' }, 10);
      std.providerRetries.inc({ provider_id: 'fake_provider', retry_type: 'technical', error_code: 'NETWORK_TIMEOUT' }, 1);
      std.providerErrors.inc({ provider_id: 'fake_provider', error_code: 'NETWORK_TIMEOUT', retry_category: 'TRANSIENT' }, 1);

      const exported = registry.exportPrometheus();
      expect(exported).toContain(AVF_STANDARD_METRICS.PROVIDER_GENERATION_DURATION);
      expect(exported).toContain(AVF_STANDARD_METRICS.PROVIDER_COST_CREDITS_TOTAL);
      expect(exported).toContain(AVF_STANDARD_METRICS.PROVIDER_RETRIES_TOTAL);
      expect(exported).toContain(AVF_STANDARD_METRICS.PROVIDER_ERRORS_TOTAL);
    });

    it('registers on defaultRegistry when called without arguments', () => {
      const std = registerStandardAVFMetrics();
      expect(std.providerGenerationDuration).toBeDefined();
    });
  });
});
