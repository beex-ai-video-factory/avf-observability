import { ErrorCode, RetryCategory } from '@avf/contracts';
import { AVFNormalizedError, getDefaultRetryCategory } from '../../src/errors/normalized-error';
import { CorrelationContext } from '../../src/context/correlation-context';

describe('AVFNormalizedError Implementation', () => {
  it('correctly maps default retry categories for all 9 canonical error codes', () => {
    expect(getDefaultRetryCategory(ErrorCode.PROVIDER_RATE_LIMIT)).toBe(RetryCategory.TRANSIENT);
    expect(getDefaultRetryCategory(ErrorCode.NETWORK_TIMEOUT)).toBe(RetryCategory.TRANSIENT);
    expect(getDefaultRetryCategory(ErrorCode.PROVIDER_INTERNAL_ERROR)).toBe(RetryCategory.TRANSIENT);
    expect(getDefaultRetryCategory(ErrorCode.BUDGET_EXHAUSTED)).toBe(RetryCategory.RESOURCE_EXHAUSTED);
    expect(getDefaultRetryCategory(ErrorCode.AUTH_REQUIRED)).toBe(RetryCategory.POLICY_BLOCKED);
    expect(getDefaultRetryCategory(ErrorCode.SECURITY_CHALLENGE)).toBe(RetryCategory.POLICY_BLOCKED);
    expect(getDefaultRetryCategory(ErrorCode.UI_CHANGED)).toBe(RetryCategory.POLICY_BLOCKED);
    expect(getDefaultRetryCategory(ErrorCode.UNSUPPORTED_CAPABILITY)).toBe(RetryCategory.PERMANENT);
    expect(getDefaultRetryCategory(ErrorCode.BAD_REQUEST)).toBe(RetryCategory.PERMANENT);
  });

  it('constructs AVFNormalizedError with sanitized message and active correlation context', () => {
    const error = CorrelationContext.run(
      {
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        correlation_id: 'corr-err-101',
        service_name: 'test-service',
      },
      () => {
        return new AVFNormalizedError({
          code: ErrorCode.PROVIDER_RATE_LIMIT,
          message: 'Rate limit hit for key AIzaSyD98fjk28hskjdf8723kjsdhf8234kj',
          suggested_backoff_ms: 5000,
          raw_provider_error: {
            quota: 'exceeded',
            secret_token: 'secret_val',
          },
          raw_details: {
            info: 'extra info',
          },
        });
      }
    );

    expect(error.code).toBe(ErrorCode.PROVIDER_RATE_LIMIT);
    expect(error.retry_category).toBe(RetryCategory.TRANSIENT);
    expect(error.suggested_backoff_ms).toBe(5000);
    expect(error.message).toContain('[REDACTED:GOOGLE_API_KEY]');
    expect(error.message).not.toContain('AIzaSyD');
    expect(error.raw_provider_error?.secret_token).toBe('[REDACTED:FIELD]');
    expect(error.raw_details?.info).toBe('extra info');
    expect(error.correlation_id).toBe('corr-err-101');
    expect(error.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

    const contractObj = error.toNormalizedError();
    expect(contractObj.code).toBe(ErrorCode.PROVIDER_RATE_LIMIT);
    expect(contractObj.retry_category).toBe(RetryCategory.TRANSIENT);
    expect(contractObj.suggested_backoff_ms).toBe(5000);
    expect(contractObj.raw_details).toEqual({ info: 'extra info' });
  });

  it('wraps native Error instances and sanitizes cause stack traces', () => {
    const nativeErr = new Error('Connection refused with bearer sk-abcdef1234567890abcdef1234567890');
    const normalized = AVFNormalizedError.fromError(nativeErr, ErrorCode.NETWORK_TIMEOUT);

    expect(normalized.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    expect(normalized.retry_category).toBe(RetryCategory.TRANSIENT);
    expect(normalized.message).toContain('[REDACTED:API_KEY]');
    expect(normalized.stack).toContain('[REDACTED:API_KEY]');
    expect(normalized.stack).not.toContain('sk-abcdef');
  });

  it('returns self if fromError is passed an existing AVFNormalizedError', () => {
    const orig = new AVFNormalizedError({ code: ErrorCode.BAD_REQUEST, message: 'Bad' });
    expect(AVFNormalizedError.fromError(orig)).toBe(orig);
  });

  it('wraps non-Error objects and strings in fromError', () => {
    const strErr = AVFNormalizedError.fromError('Simple string message', ErrorCode.AUTH_REQUIRED);
    expect(strErr.code).toBe(ErrorCode.AUTH_REQUIRED);
    expect(strErr.message).toBe('Simple string message');

    const objErr = AVFNormalizedError.fromError({ custom: 'val' });
    expect(objErr.code).toBe(ErrorCode.PROVIDER_INTERNAL_ERROR);
  });

  it('recognizes normalized errors with isNormalizedError guard', () => {
    const norm = new AVFNormalizedError({
      code: ErrorCode.BAD_REQUEST,
      message: 'Invalid payload',
    });
    const regular = new Error('Regular');

    expect(AVFNormalizedError.isNormalizedError(norm)).toBe(true);
    expect(AVFNormalizedError.isNormalizedError(regular)).toBe(false);
    expect(AVFNormalizedError.isNormalizedError(null)).toBe(false);
  });
});
