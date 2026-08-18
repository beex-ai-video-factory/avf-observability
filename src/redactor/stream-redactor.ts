import { Transform, TransformCallback } from 'stream';
import { ISecretRedactor } from './secret-redactor';

export class StreamRedactor extends Transform {
  private redactor: ISecretRedactor;
  private buffer = '';

  constructor(redactor: ISecretRedactor) {
    super({ decodeStrings: false });
    this.redactor = redactor;
  }

  public _transform(chunk: any, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      this.buffer += str;

      const lines = this.buffer.split('\n');
      // Keep the last partial line in the buffer
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        const redactedLine = this.redactor.redactString(line);
        this.push(redactedLine + '\n');
      }

      callback();
    } catch (err: any) {
      callback(err);
    }
  }

  public _flush(callback: TransformCallback): void {
    try {
      if (this.buffer.length > 0) {
        const redacted = this.redactor.redactString(this.buffer);
        this.push(redacted);
        this.buffer = '';
      }
      callback();
    } catch (err: any) {
      callback(err);
    }
  }
}
