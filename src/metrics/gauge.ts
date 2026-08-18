import { MetricLabels, serializeLabels } from './counter';

export interface IGauge {
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];

  set(value: number): void;
  set(labels: MetricLabels, value: number): void;
  inc(value?: number): void;
  inc(labels: MetricLabels, value?: number): void;
  dec(value?: number): void;
  dec(labels: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  collect(): Array<{ labels: MetricLabels; value: number }>;
}

export class Gauge implements IGauge {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];

  private values: Map<string, { labels: MetricLabels; value: number }> = new Map();

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  public set(labelsOrValue: MetricLabels | number, value?: number): void {
    let labels: MetricLabels = {};
    let val = 0;

    if (typeof labelsOrValue === 'number') {
      val = labelsOrValue;
    } else {
      labels = labelsOrValue;
      val = value ?? 0;
    }

    const key = serializeLabels(labels, this.labelNames.length > 0 ? this.labelNames : undefined);
    this.values.set(key, { labels: { ...labels }, value: val });
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

    const current = this.get(labels);
    this.set(labels, current + amount);
  }

  public dec(labelsOrValue?: MetricLabels | number, value?: number): void {
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

    const current = this.get(labels);
    this.set(labels, current - amount);
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
