import { ErrorCode, NormalizedError, RetryCategory } from '@avf/contracts';
import { CorrelationContext } from '../context/correlation-context';
import { defaultRedactor, ISecretRedactor } from '../redactor/secret-redactor';

export interface CreateNormalizedErrorParams {
  code: ErrorCode | keyof typeof ErrorCode;
  message: string;
  retry_category?: RetryCategory | keyof typeof RetryCategory;
  suggested_backoff_ms?: number;
  raw_provider_error?: Record<string, unknown>;
  raw_details?: Record<string, unknown>;
  cause?: Error;
  redactor?: ISecretRedactor;
}

/**
 * Standard default retry classification mapping according to AVF Taxonomy
 */
export function getDefaultRetryCategory(code: ErrorCode | keyof typeof ErrorCode): RetryCategory {
  switch (code) {
    case ErrorCode.PROVIDER_RATE_LIMIT:
    case 'PROVIDER_RATE_LIMIT':
    case ErrorCode.NETWORK_TIMEOUT:
    case 'NETWORK_TIMEOUT':
    case ErrorCode.PROVIDER_INTERNAL_ERROR:
    case 'PROVIDER_INTERNAL_ERROR':
      return RetryCategory.TRANSIENT;

    case ErrorCode.BUDGET_EXHAUSTED:
    case 'BUDGET_EXHAUSTED':
      return RetryCategory.RESOURCE_EXHAUSTED;

    case ErrorCode.AUTH_REQUIRED:
    case 'AUTH_REQUIRED':
    case ErrorCode.SECURITY_CHALLENGE:
    case 'SECURITY_CHALLENGE':
    case ErrorCode.UI_CHANGED:
    case 'UI_CHANGED':
      return RetryCategory.POLICY_BLOCKED;

    case ErrorCode.UNSUPPORTED_CAPABILITY:
    case 'UNSUPPORTED_CAPABILITY':
    case ErrorCode.BAD_REQUEST:
    case 'BAD_REQUEST':
    default:
      return RetryCategory.PERMANENT;
  }
}

export class AVFNormalizedError extends Error implements NormalizedError {
  public readonly code: ErrorCode | keyof typeof ErrorCode;
  public readonly retry_category: RetryCategory | keyof typeof RetryCategory;
  public readonly suggested_backoff_ms?: number;
  public readonly raw_provider_error?: Record<string, unknown>;
  public readonly raw_details?: Record<string, unknown>;
  public readonly correlation_id?: string;
  public readonly trace_id?: string;

  constructor(params: CreateNormalizedErrorParams) {
    const redactor = params.redactor || defaultRedactor;
    const sanitizedMessage = redactor.redactString(params.message);

    super(sanitizedMessage);
    this.name = `AVFNormalizedError[${params.code}]`;

    this.code = params.code;
    this.retry_category = params.retry_category || getDefaultRetryCategory(params.code);
    this.suggested_backoff_ms = params.suggested_backoff_ms;

    if (params.raw_provider_error) {
      this.raw_provider_error = redactor.redactObject(params.raw_provider_error);
    }
    if (params.raw_details) {
      this.raw_details = redactor.redactObject(params.raw_details);
    }

    const activeContext = CorrelationContext.get();
    this.correlation_id = activeContext?.correlation_id;
    this.trace_id = activeContext?.trace_id;

    if (params.cause && params.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${redactor.redactString(params.cause.stack)}`;
    } else if (this.stack) {
      this.stack = redactor.redactString(this.stack);
    }
  }

  /**
   * Convert into canonical NormalizedError contract object
   */
  public toNormalizedError(): NormalizedError {
    const obj: NormalizedError = {
      code: this.code,
      message: this.message,
      retry_category: this.retry_category,
    };

    if (this.suggested_backoff_ms !== undefined) {
      obj.suggested_backoff_ms = this.suggested_backoff_ms;
    }
    if (this.raw_provider_error) {
      obj.raw_provider_error = this.raw_provider_error;
    }
    if (this.raw_details) {
      obj.raw_details = this.raw_details;
    }

    return obj;
  }

  /**
   * Factory function to wrap an unknown error into AVFNormalizedError
   */
  public static fromError(
    err: unknown,
    fallbackCode: ErrorCode | keyof typeof ErrorCode = ErrorCode.PROVIDER_INTERNAL_ERROR,
    fallbackCategory?: RetryCategory | keyof typeof RetryCategory,
    redactor?: ISecretRedactor
  ): AVFNormalizedError {
    if (err instanceof AVFNormalizedError) {
      return err;
    }

    if (err instanceof Error) {
      return new AVFNormalizedError({
        code: fallbackCode,
        message: err.message,
        retry_category: fallbackCategory,
        cause: err,
        redactor,
      });
    }

    return new AVFNormalizedError({
      code: fallbackCode,
      message: typeof err === 'string' ? err : 'Unknown non-error exception occurred',
      retry_category: fallbackCategory,
      redactor,
    });
  }

  /**
   * Type guard to check if an object is an instance of AVFNormalizedError
   */
  public static isNormalizedError(obj: unknown): obj is AVFNormalizedError {
    return obj instanceof AVFNormalizedError;
  }
}
