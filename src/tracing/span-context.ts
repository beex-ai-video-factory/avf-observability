import { defaultRedactor, ISecretRedactor } from '../redactor/secret-redactor';
import { generateSpanId } from '../context/traceparent';

export type SpanAttributeValue = string | number | boolean | undefined;
export type SpanAttributes = Record<string, SpanAttributeValue>;

export interface SpanStatus {
  code: 'OK' | 'ERROR' | 'UNSET';
  message?: string;
}

export interface SpanEvent {
  name: string;
  timestamp_ms: number;
  attributes?: SpanAttributes;
}

export interface ISpan {
  readonly span_id: string;
  readonly trace_id: string;
  readonly parent_span_id?: string;
  readonly name: string;

  setAttribute(key: string, value: string | number | boolean): this;
  setAttributes(attributes: SpanAttributes): this;
  addEvent(name: string, attributes?: SpanAttributes): this;
  setStatus(status: SpanStatus): this;
  recordException(exception: Error | unknown): this;
  end(): void;
  isEnded(): boolean;
  getDurationMs(): number;
  getAttributes(): SpanAttributes;
  getEvents(): SpanEvent[];
  getStatus(): SpanStatus;
}

export class Span implements ISpan {
  public readonly span_id: string;
  public readonly trace_id: string;
  public readonly parent_span_id?: string;
  public readonly name: string;

  private startTimeHr: [number, number];
  private endTimeHr?: [number, number];
  private attributes: SpanAttributes = {};
  private events: SpanEvent[] = [];
  private status: SpanStatus = { code: 'UNSET' };
  private redactor: ISecretRedactor;
  private ended = false;

  constructor(
    name: string,
    traceId: string,
    parentSpanId?: string,
    spanId?: string,
    redactor?: ISecretRedactor
  ) {
    this.name = name;
    this.trace_id = traceId;
    this.parent_span_id = parentSpanId;
    this.span_id = spanId || generateSpanId();
    this.startTimeHr = process.hrtime();
    this.redactor = redactor || defaultRedactor;
  }

  public setAttribute(key: string, value: string | number | boolean): this {
    if (this.ended) return this;
    if (typeof value === 'string') {
      this.attributes[key] = this.redactor.redactString(value);
    } else {
      this.attributes[key] = value;
    }
    return this;
  }

  public setAttributes(attributes: SpanAttributes): this {
    if (this.ended || !attributes) return this;
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        this.setAttribute(key, value);
      }
    }
    return this;
  }

  public addEvent(name: string, attributes?: SpanAttributes): this {
    if (this.ended) return this;
    const sanitizedAttributes: SpanAttributes = {};
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        if (typeof v === 'string') {
          sanitizedAttributes[k] = this.redactor.redactString(v);
        } else {
          sanitizedAttributes[k] = v;
        }
      }
    }

    this.events.push({
      name: this.redactor.redactString(name),
      timestamp_ms: Date.now(),
      attributes: sanitizedAttributes,
    });
    return this;
  }

  public setStatus(status: SpanStatus): this {
    if (this.ended) return this;
    this.status = {
      code: status.code,
      message: status.message ? this.redactor.redactString(status.message) : undefined,
    };
    return this;
  }

  public recordException(exception: Error | unknown): this {
    if (this.ended) return this;
    let message = 'Unknown Exception';
    let name = 'Error';
    let stack: string | undefined;

    if (exception instanceof Error) {
      message = exception.message;
      name = exception.name;
      stack = exception.stack;
    } else if (typeof exception === 'string') {
      message = exception;
    }

    this.setStatus({
      code: 'ERROR',
      message: this.redactor.redactString(message),
    });

    this.addEvent('exception', {
      'exception.type': this.redactor.redactString(name),
      'exception.message': this.redactor.redactString(message),
      'exception.stacktrace': stack ? this.redactor.redactString(stack) : undefined,
    });

    return this;
  }

  public end(): void {
    if (this.ended) return;
    this.endTimeHr = process.hrtime();
    this.ended = true;
    if (this.status.code === 'UNSET') {
      this.status = { code: 'OK' };
    }
  }

  public isEnded(): boolean {
    return this.ended;
  }

  public getDurationMs(): number {
    if (!this.endTimeHr) {
      const currentHr = process.hrtime(this.startTimeHr);
      return currentHr[0] * 1000 + currentHr[1] / 1e6;
    }
    const diff = [
      this.endTimeHr[0] - this.startTimeHr[0],
      this.endTimeHr[1] - this.startTimeHr[1],
    ];
    return diff[0] * 1000 + diff[1] / 1e6;
  }

  public getAttributes(): SpanAttributes {
    return { ...this.attributes };
  }

  public getEvents(): SpanEvent[] {
    return [...this.events];
  }

  public getStatus(): SpanStatus {
    return { ...this.status };
  }
}
