import { ISpan, SpanAttributes, SpanEvent, SpanStatus } from './span-context';
import { ITracer } from './tracer-wrapper';
import { CorrelationContextData } from '../context/correlation-context';

export class NoopSpan implements ISpan {
  public readonly span_id: string = '0000000000000000';
  public readonly trace_id: string = '00000000000000000000000000000000';
  public readonly name: string = 'noop';

  public setAttribute(): this { return this; }
  public setAttributes(): this { return this; }
  public addEvent(): this { return this; }
  public setStatus(): this { return this; }
  public recordException(): this { return this; }
  public end(): void { /* no-op */ }
  public isEnded(): boolean { return true; }
  public getDurationMs(): number { return 0; }
  public getAttributes(): SpanAttributes { return {}; }
  public getEvents(): SpanEvent[] { return []; }
  public getStatus(): SpanStatus { return { code: 'OK' }; }
}

export class NoopTracer implements ITracer {
  public startSpan(): ISpan {
    return new NoopSpan();
  }

  public async startActiveSpan<T>(_name: string, fn: (span: ISpan) => Promise<T>): Promise<T> {
    return fn(new NoopSpan());
  }

  public withSpan<T>(_span: ISpan, fn: () => T): T {
    return fn();
  }

  public injectContextToHeaders(headers: Record<string, string>): Record<string, string> {
    return headers;
  }

  public extractContextFromHeaders(): Partial<CorrelationContextData> {
    return {};
  }
}
