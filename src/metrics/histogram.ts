import { MetricLabels, serializeLabels } from './counter';

export const DEFAULT_HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300,
];

export interface HistogramRecord {
  labels: MetricLabels;
  bucketCounts: Map<number, number>; // upper bound -> count
  sum: number;
  count: number;
}

export interface IHistogram {
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  readonly buckets: number[];

  observe(value: number): void;
  observe(labels: MetricLabels, value: number): void;
  startTimer(labels?: MetricLabels): () => number;
  reset(): void;
  collect(): HistogramRecord[];
}

export class Histogram implements IHistogram {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];
  public readonly buckets: number[];

  private records: Map<string, HistogramRecord> = new Map();

  constructor(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = DEFAULT_HISTOGRAM_BUCKETS
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  public observe(labelsOrValue: MetricLabels | number, value?: number): void {
    let labels: MetricLabels = {};
    let val = 0;

    if (typeof labelsOrValue === 'number') {
      val = labelsOrValue;
    } else {
      labels = labelsOrValue;
      val = value ?? 0;
    }

    const key = serializeLabels(labels, this.labelNames.length > 0 ? this.labelNames : undefined);
    let record = this.records.get(key);

    if (!record) {
      const bucketCounts = new Map<number, number>();
      for (const b of this.buckets) {
        bucketCounts.set(b, 0);
      }
      record = {
        labels: { ...labels },
        bucketCounts,
        sum: 0,
        count: 0,
      };
      this.records.set(key, record);
    }

    record.sum += val;
    record.count += 1;

    for (const b of this.buckets) {
      if (val <= b) {
        const currentCount = record.bucketCounts.get(b) ?? 0;
        record.bucketCounts.set(b, currentCount + 1);
      }
    }
  }

  public startTimer(labels: MetricLabels = {}): () => number {
    const startHr = process.hrtime();
    return () => {
      const diff = process.hrtime(startHr);
      const seconds = diff[0] + diff[1] / 1e9;
      this.observe(labels, seconds);
      return seconds;
    };
  }

  public reset(): void {
    this.records.clear();
  }

  public collect(): HistogramRecord[] {
    return Array.from(this.records.values());
  }
}
