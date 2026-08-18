import { Transform } from 'stream';
import {
  DEFAULT_REDACTION_PATTERNS,
  SENSITIVE_KEY_REGEX,
  FIELD_MASK_TEXT,
  RedactionPattern,
} from './patterns';
import { StreamRedactor } from './stream-redactor';

export interface RedactionOptions {
  maskText?: string;
  sensitiveKeys?: RegExp;
  customPatterns?: RedactionPattern[];
  maxObjectDepth?: number;
  maxArrayLength?: number;
  maskUrls?: boolean;
}

export interface ISecretRedactor {
  redactString(input: string): string;
  redactObject<T>(input: T, depth?: number, seen?: WeakSet<object>): T;
  redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]>;
  redactUrl(url: string): string;
  redactError(err: Error | unknown): Record<string, unknown>;
  createTransformStream(): Transform;
}

export class SecretRedactor implements ISecretRedactor {
  private patterns: RedactionPattern[];
  private sensitiveKeysRegex: RegExp;
  private maxObjectDepth: number;
  private maxArrayLength: number;
  private maskUrls: boolean;

  constructor(options?: RedactionOptions) {
    this.patterns = [
      ...(options?.customPatterns || []),
      ...DEFAULT_REDACTION_PATTERNS,
    ];
    this.sensitiveKeysRegex = options?.sensitiveKeys || SENSITIVE_KEY_REGEX;
    this.maxObjectDepth = options?.maxObjectDepth ?? 10;
    this.maxArrayLength = options?.maxArrayLength ?? 1000;
    this.maskUrls = options?.maskUrls ?? true;
  }

  /**
   * Redact sensitive patterns in arbitrary text strings
   */
  public redactString(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    if (input.length === 0) {
      return input;
    }

    let result = input;
    for (const { pattern, mask } of this.patterns) {
      // Reset pattern state if it's a global regex
      if (pattern.global) {
        pattern.lastIndex = 0;
      }
      result = result.replace(pattern, typeof mask === 'function' ? (mask as any) : mask);
    }

    return result;
  }

  /**
   * Redact a URL's sensitive query parameters and SAS tokens
   */
  public redactUrl(url: string): string {
    if (typeof url !== 'string' || !url) {
      return url;
    }

    try {
      // Check if it's a valid absolute URL
      const parsed = new URL(url);
      const searchParams = parsed.searchParams;
      const keysToRedact: string[] = [];

      for (const [key] of searchParams.entries()) {
        if (this.sensitiveKeysRegex.test(key) || /^(sig|signature|se|sp|sv|token|api_?key|key|X-Amz-Signature|X-Amz-Credential)$/i.test(key)) {
          keysToRedact.push(key);
        }
      }

      for (const key of keysToRedact) {
        searchParams.set(key, '[REDACTED]');
      }

      // Also redact credentials in URL user/pass
      if (parsed.username) parsed.username = '[REDACTED]';
      if (parsed.password) parsed.password = '[REDACTED]';

      return parsed.toString();
    } catch {
      // If not a full URL, fallback to string-based pattern redaction
      return this.redactString(url);
    }
  }

  /**
   * Redact sensitive HTTP headers
   */
  public redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
    if (!headers || typeof headers !== 'object') {
      return {};
    }

    const sanitized: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;

      const lowerKey = key.toLowerCase();
      if (this.sensitiveKeysRegex.test(lowerKey) || /^(authorization|cookie|set-cookie|x-api-key|proxy-authorization)$/i.test(lowerKey)) {
        if (lowerKey === 'authorization' && typeof value === 'string' && value.startsWith('Bearer ')) {
          sanitized[key] = 'Bearer [REDACTED:BEARER_TOKEN]';
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(() => '[REDACTED:HEADER]');
        } else {
          sanitized[key] = '[REDACTED:HEADER]';
        }
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((v) => (typeof v === 'string' ? this.redactString(v) : v));
      } else if (typeof value === 'string') {
        sanitized[key] = this.redactString(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Recursively redact an object, protecting against circular references and deep graphs
   */
  public redactObject<T>(input: T, depth = 0, seen = new WeakSet<object>()): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return (this.maskUrls && (input.startsWith('http://') || input.startsWith('https://'))
        ? this.redactUrl(input)
        : this.redactString(input)) as unknown as T;
    }

    if (typeof input !== 'object') {
      return input;
    }

    if (input instanceof Date) {
      return new Date(input.getTime()) as unknown as T;
    }

    if (Buffer.isBuffer(input)) {
      return input;
    }

    // Circular reference protection
    if (seen.has(input as object)) {
      return '[CIRCULAR]' as unknown as T;
    }
    seen.add(input as object);

    // Max depth guard
    if (depth >= this.maxObjectDepth) {
      return '[MAX_DEPTH_EXCEEDED]' as unknown as T;
    }

    if (Array.isArray(input)) {
      const arrLength = Math.min(input.length, this.maxArrayLength);
      const result: any[] = [];
      for (let i = 0; i < arrLength; i++) {
        result.push(this.redactObject(input[i], depth + 1, seen));
      }
      return result as unknown as T;
    }

    if (input instanceof Error) {
      return this.redactError(input) as unknown as T;
    }

    const output: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      if (this.sensitiveKeysRegex.test(key)) {
        output[key] = FIELD_MASK_TEXT;
      } else {
        output[key] = this.redactObject(value, depth + 1, seen);
      }
    }

    return output as unknown as T;
  }

  /**
   * Redact and structure an Error object for safe logging
   */
  public redactError(err: Error | unknown): Record<string, unknown> {
    if (!err) {
      return { message: 'Unknown Error' };
    }

    if (err instanceof Error) {
      const sanitized: Record<string, unknown> = {
        name: this.redactString(err.name),
        message: this.redactString(err.message),
      };

      if (err.stack) {
        sanitized.stack = this.redactString(err.stack);
      }

      // Check any attached custom properties
      for (const [key, value] of Object.entries(err)) {
        if (key !== 'name' && key !== 'message' && key !== 'stack') {
          if (this.sensitiveKeysRegex.test(key)) {
            sanitized[key] = FIELD_MASK_TEXT;
          } else {
            sanitized[key] = this.redactObject(value, 0, new WeakSet<object>());
          }
        }
      }

      return sanitized;
    }

    if (typeof err === 'object') {
      return this.redactObject(err as Record<string, unknown>);
    }

    return { message: this.redactString(String(err)) };
  }

  /**
   * Create a Node.js Transform stream for redacting continuous log streams
   */
  public createTransformStream(): Transform {
    return new StreamRedactor(this);
  }
}

/**
 * Global default instance of SecretRedactor
 */
export const defaultRedactor = new SecretRedactor();
