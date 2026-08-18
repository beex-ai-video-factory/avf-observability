export type MetricLabels = Record<string, string | number>;

export interface ICounter {
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];

  inc(value?: number): void;
  inc(labels: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  collect(): Array<{ labels: MetricLabels; value: number }>;
}

export function serializeLabels(labels: MetricLabels, allowedLabelNames?: string[]): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const keys = allowedLabelNames || Object.keys(labels).sort();
  const pairs: string[] = [];

  for (const k of keys) {
    if (k in labels && labels[k] !== undefined) {
      pairs.push(`${k}="${String(labels[k]).replace(/"/g, '\\"')}"`);
    }
  }

  return pairs.join(',');
}

export class Counter implements ICounter {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];

  private values: Map<string, { labels: MetricLabels; value: number }> = new Map();

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  public inc(labelsOrValue?: MetricLabels | number, value?: number): void {
    let labels: MetricLabels = {};
    let amount = 1;

    if (typeof labelsOrValue === 'number') {
      amount = labelsOrValue;
    } else if (typeof labelsOrValue === 'object' && labelsOrValue !== null) {
      labels = labelsOrValue;
      if (typeof value === 'number') {
        amount = value;
      }
    }

    if (amount < 0) {
      throw new Error(`Counter ${this.name} cannot be decremented: increment value must be non-negative.`);
    }

    const key = serializeLabels(labels, this.labelNames.length > 0 ? this.labelNames : undefined);
    const existing = this.values.get(key);

    if (existing) {
      existing.value += amount;
    } else {
      this.values.set(key, { labels: { ...labels }, value: amount });
    }
  }

  public get(labels: MetricLabels = {}): number {
    const key = serializeLabels(labels, this.labelNames.length > 0 ? this.labelNames : undefined);
    return this.values.get(key)?.value ?? 0;
  }

  public reset(): void {
    this.values.clear();
  }

  public collect(): Array<{ labels: MetricLabels; value: number }> {
    return Array.from(this.values.values());
  }
}
