import { Counter, ICounter, serializeLabels } from './counter';
import { Gauge, IGauge } from './gauge';
import { Histogram, IHistogram } from './histogram';

export type AnyMetric = Counter | Gauge | Histogram;

export interface IMetricsRegistry {
  createCounter(name: string, help: string, labelNames?: string[]): ICounter;
  createGauge(name: string, help: string, labelNames?: string[]): IGauge;
  createHistogram(name: string, help: string, labelNames?: string[], buckets?: number[]): IHistogram;
  getMetric(name: string): AnyMetric | undefined;
  exportPrometheus(): string;
  clear(): void;
}

export class MetricsRegistry implements IMetricsRegistry {
  private metrics: Map<string, AnyMetric> = new Map();

  public createCounter(name: string, help: string, labelNames: string[] = []): ICounter {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing instanceof Counter) {
        return existing;
      }
      throw new Error(`Metric ${name} already registered as a different type.`);
    }
    const counter = new Counter(name, help, labelNames);
    this.metrics.set(name, counter);
    return counter;
  }

  public createGauge(name: string, help: string, labelNames: string[] = []): IGauge {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing instanceof Gauge) {
        return existing;
      }
      throw new Error(`Metric ${name} already registered as a different type.`);
    }
    const gauge = new Gauge(name, help, labelNames);
    this.metrics.set(name, gauge);
    return gauge;
  }

  public createHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[]
  ): IHistogram {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing instanceof Histogram) {
        return existing;
      }
      throw new Error(`Metric ${name} already registered as a different type.`);
    }
    const histogram = new Histogram(name, help, labelNames, buckets);
    this.metrics.set(name, histogram);
    return histogram;
  }

  public getMetric(name: string): AnyMetric | undefined {
    return this.metrics.get(name);
  }

  public clear(): void {
    this.metrics.clear();
  }

  /**
   * Export all registered metrics in standard Prometheus text exposition format (v0.0.4)
   */
  public exportPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      if (metric instanceof Counter) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} counter`);
        const records = metric.collect();
        if (records.length === 0) {
          lines.push(`${metric.name} 0`);
        } else {
          for (const rec of records) {
            const labelsStr = serializeLabels(rec.labels, metric.labelNames);
            const line = labelsStr ? `${metric.name}{${labelsStr}} ${rec.value}` : `${metric.name} ${rec.value}`;
            lines.push(line);
          }
        }
      } else if (metric instanceof Gauge) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} gauge`);
        const records = metric.collect();
        if (records.length === 0) {
          lines.push(`${metric.name} 0`);
        } else {
          for (const rec of records) {
            const labelsStr = serializeLabels(rec.labels, metric.labelNames);
            const line = labelsStr ? `${metric.name}{${labelsStr}} ${rec.value}` : `${metric.name} ${rec.value}`;
            lines.push(line);
          }
        }
      } else if (metric instanceof Histogram) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} histogram`);
        const records = metric.collect();
        if (records.length === 0) {
          lines.push(`${metric.name}_count 0`);
          lines.push(`${metric.name}_sum 0`);
        } else {
          for (const rec of records) {
            const baseLabelsStr = serializeLabels(rec.labels, metric.labelNames);

            // Bucket entries
            for (const b of metric.buckets) {
              const count = rec.bucketCounts.get(b) ?? 0;
              const leLabel = `le="${b}"`;
              const bucketLabels = baseLabelsStr ? `${baseLabelsStr},${leLabel}` : leLabel;
              lines.push(`${metric.name}_bucket{${bucketLabels}} ${count}`);
            }

            // +Inf bucket (which equals total count)
            const infLabel = `le="+Inf"`;
            const infLabels = baseLabelsStr ? `${baseLabelsStr},${infLabel}` : infLabel;
            lines.push(`${metric.name}_bucket{${infLabels}} ${rec.count}`);

            // Sum and count
            const sumLine = baseLabelsStr
              ? `${metric.name}_sum{${baseLabelsStr}} ${rec.sum}`
              : `${metric.name}_sum ${rec.sum}`;
            const countLine = baseLabelsStr
              ? `${metric.name}_count{${baseLabelsStr}} ${rec.count}`
              : `${metric.name}_count ${rec.count}`;

            lines.push(sumLine);
            lines.push(countLine);
          }
        }
      }
    }

    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  }
}

/**
 * Global default metrics registry instance
 */
export const defaultRegistry = new MetricsRegistry();
