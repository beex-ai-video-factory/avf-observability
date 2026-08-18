import { ErrorCode, RetryCategory, NormalizedError } from '@avf/contracts';
import { AVFNormalizedError } from '../../src/errors/normalized-error';

describe('R14 to R01 Contract Conformance — Error Taxonomy', () => {
  const allCodes: ErrorCode[] = [
    ErrorCode.PROVIDER_RATE_LIMIT,
    ErrorCode.AUTH_REQUIRED,
    ErrorCode.SECURITY_CHALLENGE,
    ErrorCode.UI_CHANGED,
    ErrorCode.BUDGET_EXHAUSTED,
    ErrorCode.UNSUPPORTED_CAPABILITY,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.BAD_REQUEST,
    ErrorCode.PROVIDER_INTERNAL_ERROR,
  ];

  it('verifies all 9 canonical error codes produce conformant NormalizedError objects', () => {
    for (const code of allCodes) {
      const err = new AVFNormalizedError({
        code,
        message: `Simulated error for ${code}`,
        suggested_backoff_ms: 1000,
        raw_provider_error: { provider_code: 500 },
        raw_details: { detail_key: 'value' },
      });

      const normalized: NormalizedError = err.toNormalizedError();

      expect(normalized.code).toBe(code);
      expect(typeof normalized.message).toBe('string');
      expect(Object.values(RetryCategory)).toContain(normalized.retry_category);
      expect(normalized.suggested_backoff_ms).toBe(1000);
      expect(normalized.raw_provider_error).toEqual({ provider_code: 500 });
      expect(normalized.raw_details).toEqual({ detail_key: 'value' });
    }
  });

  it('guarantees that exactly 9 canonical error codes exist in enum', () => {
    expect(Object.keys(ErrorCode)).toHaveLength(9);
  });

  it('guarantees that exactly 4 retry categories exist in enum', () => {
    expect(Object.keys(RetryCategory)).toHaveLength(4);
    expect(Object.values(RetryCategory)).toEqual(
      expect.arrayContaining([
        RetryCategory.TRANSIENT,
        RetryCategory.PERMANENT,
        RetryCategory.POLICY_BLOCKED,
        RetryCategory.RESOURCE_EXHAUSTED,
      ])
    );
  });
});
