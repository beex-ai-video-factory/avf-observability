import {
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  parseTraceParent,
  formatTraceParent,
  createTraceParent,
} from '../../src/context/traceparent';

describe('TraceParent W3C TraceContext Implementation', () => {
  describe('generateTraceId & generateSpanId', () => {
    it('generates a valid 32-hex trace ID', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(isValidTraceId(traceId)).toBe(true);
    });

    it('generates a valid 16-hex span ID', () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(isValidSpanId(spanId)).toBe(true);
    });
  });

  describe('isValidTraceId', () => {
    it('returns true for valid non-zero 32 hex strings', () => {
      expect(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e4736')).toBe(true);
      expect(isValidTraceId('4BF92F3577B34DA6A3CE929D0E0E4736')).toBe(true);
    });

    it('returns false for invalid trace IDs', () => {
      expect(isValidTraceId('00000000000000000000000000000000')).toBe(false); // all-zero
      expect(isValidTraceId('short')).toBe(false);
      expect(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e4736123')).toBe(false); // too long
      expect(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e473g')).toBe(false); // non-hex
      expect(isValidTraceId(null as any)).toBe(false);
      expect(isValidTraceId(undefined as any)).toBe(false);
    });
  });

  describe('isValidSpanId', () => {
    it('returns true for valid non-zero 16 hex strings', () => {
      expect(isValidSpanId('00f067aa0ba902b7')).toBe(true);
      expect(isValidSpanId('00F067AA0BA902B7')).toBe(true);
    });

    it('returns false for invalid span IDs', () => {
      expect(isValidSpanId('0000000000000000')).toBe(false); // all-zero
      expect(isValidSpanId('short')).toBe(false);
      expect(isValidSpanId('00f067aa0ba902b7123')).toBe(false); // too long
      expect(isValidSpanId('00f067aa0ba902bg')).toBe(false); // non-hex
      expect(isValidSpanId(null as any)).toBe(false);
    });
  });

  describe('parseTraceParent', () => {
    it('parses valid standard W3C traceparent header', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = parseTraceParent(header);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        version: '00',
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        parent_id: '00f067aa0ba902b7',
        trace_flags: '01',
      });
    });

    it('handles uppercase and trims whitespace', () => {
      const header = '  00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01  ';
      const parsed = parseTraceParent(header);
      expect(parsed).not.toBeNull();
      expect(parsed?.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.parent_id).toBe('00f067aa0ba902b7');
    });

    it('returns null for null, undefined, empty, or non-string inputs', () => {
      expect(parseTraceParent(null)).toBeNull();
      expect(parseTraceParent(undefined)).toBeNull();
      expect(parseTraceParent('')).toBeNull();
      expect(parseTraceParent(123 as any)).toBeNull();
    });

    it('returns null for invalid version ff', () => {
      const header = 'ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      expect(parseTraceParent(header)).toBeNull();
    });

    it('returns null for all-zero trace_id or span_id', () => {
      expect(parseTraceParent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull();
      expect(parseTraceParent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBeNull();
    });

    it('returns null for malformed structures', () => {
      expect(parseTraceParent('not-a-traceparent')).toBeNull();
      expect(parseTraceParent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7')).toBeNull();
    });
  });

  describe('formatTraceParent & createTraceParent', () => {
    it('formats a parsed object into a valid header', () => {
      const tp = {
        version: '00',
        trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
        parent_id: '00f067aa0ba902b7',
        trace_flags: '01',
      };
      expect(formatTraceParent(tp)).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('creates traceparent with custom or generated IDs', () => {
      const customTrace = '1234567890abcdef1234567890abcdef';
      const customSpan = 'abcdef1234567890';
      const tp = createTraceParent(customTrace, customSpan, true);
      expect(tp).toBe(`00-${customTrace}-${customSpan}-01`);

      const tpSampledFalse = createTraceParent(customTrace, customSpan, false);
      expect(tpSampledFalse).toBe(`00-${customTrace}-${customSpan}-00`);

      const tpGenerated = createTraceParent();
      const parsed = parseTraceParent(tpGenerated);
      expect(parsed).not.toBeNull();
      expect(parsed?.trace_flags).toBe('01');
    });
  });
});
