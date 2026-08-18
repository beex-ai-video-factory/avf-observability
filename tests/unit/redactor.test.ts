import { Readable } from 'stream';
import { SecretRedactor } from '../../src/redactor/secret-redactor';
import { zeroBuffer, zeroBuffers } from '../../src/redactor/buffer-hygiene';

describe('SecretRedactor Engine & Security Sanitization', () => {
  const redactor = new SecretRedactor();

  describe('Pattern Redaction in Strings', () => {
    it('redacts Google API Keys', () => {
      const input = 'API Error: Google key AIzaSyD98fjk28hskjdf8723kjsdhf8234kj failed auth';
      const output = redactor.redactString(input);
      expect(output).toBe('API Error: Google key [REDACTED:GOOGLE_API_KEY] failed auth');
      expect(output).not.toContain('AIzaSyD98fjk28hskjdf8723kjsdhf8234kj');
    });

    it('redacts OpenAI / Anthropic / LLM API Keys', () => {
      const input = 'Using OpenAI key sk-abcdef1234567890abcdef1234567890 and sk-proj-1234567890abcdef12345678901234';
      const output = redactor.redactString(input);
      expect(output).toBe('Using OpenAI key [REDACTED:API_KEY] and [REDACTED:API_KEY]');
      expect(output).not.toContain('sk-abcdef');
      expect(output).not.toContain('sk-proj-');
    });

    it('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const output = redactor.redactString(input);
      expect(output).toContain('Bearer [REDACTED:BEARER_TOKEN]');
      expect(output).not.toContain('eyJhbGciOiJIUzI1Ni');
    });

    it('redacts AWS Access Keys', () => {
      const input = 'Failed AWS S3 upload with credentials AKIAIOSFODNN7EXAMPLE';
      const output = redactor.redactString(input);
      expect(output).toBe('Failed AWS S3 upload with credentials [REDACTED:AWS_KEY]');
      expect(output).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('redacts session cookies in cookie strings', () => {
      const input = 'Cookie: SAPISID=v1/abc123XYZ; SSID=secret_ssid_val; __Secure-3PAPISID=secure_cookie_val; other=public';
      const output = redactor.redactString(input);
      expect(output).toBe('Cookie: SAPISID=[REDACTED:COOKIE]; SSID=[REDACTED:COOKIE]; __Secure-3PAPISID=[REDACTED:COOKIE]; other=public');
      expect(output).not.toContain('secret_ssid_val');
      expect(output).not.toContain('secure_cookie_val');
    });

    it('redacts standalone JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN_p_m_something_secret';
      const input = `User token is ${jwt}`;
      const output = redactor.redactString(input);
      expect(output).toBe('User token is [REDACTED:JWT_TOKEN]');
      expect(output).not.toContain('dozjgN');
    });

    it('redacts Cloud SAS and presigned signatures in query strings', () => {
      const input = 'https://blob.core.windows.net/media/shot1.mp4?sp=r&st=2026-08-18&sig=secret_sas_signature_123';
      const output = redactor.redactString(input);
      expect(output).toContain('sig=[REDACTED:SAS_SIGNATURE]');
      expect(output).not.toContain('secret_sas_signature_123');
    });

    it('handles custom patterns and options', () => {
      const custom = new SecretRedactor({
        customPatterns: [
          {
            name: 'CREDIT_CARD',
            pattern: /\b4\d{3}-\d{4}-\d{4}-\d{4}\b/g,
            mask: '[REDACTED:CC]',
          },
        ],
      });
      const res = custom.redactString('Card is 4111-2222-3333-4444');
      expect(res).toBe('Card is [REDACTED:CC]');
    });

    it('handles empty strings and non-string inputs safely', () => {
      expect(redactor.redactString('')).toBe('');
      expect(redactor.redactString(null as any)).toBeNull();
      expect(redactor.redactString(undefined as any)).toBeUndefined();
    });
  });

  describe('URL Redaction', () => {
    it('redacts sensitive query params and user/pass in URLs', () => {
      const url = 'https://user:password123@api.provider.com/v1/generate?api_key=AIzaSyD98fjk28hskjdf8723kjsdhf8234kj&prompt=cat&sig=mysig123';
      const output = redactor.redactUrl(url);
      expect(output).toContain('api_key=%5BREDACTED%5D');
      expect(output).toContain('sig=%5BREDACTED%5D');
      expect(output).toContain('prompt=cat');
      expect(output).toContain('%5BREDACTED%5D:%5BREDACTED%5D@');
      expect(output).not.toContain('password123');
    });

    it('handles URLs without secrets safely', () => {
      const url = 'https://api.provider.com/v1/generate?prompt=cat';
      const output = redactor.redactUrl(url);
      expect(output).toBe('https://api.provider.com/v1/generate?prompt=cat');
    });

    it('falls back to string redaction if URL parsing throws', () => {
      const invalidUrl = 'not-a-valid-url?key=AIzaSyD98fjk28hskjdf8723kjsdhf8234kj';
      const output = redactor.redactUrl(invalidUrl);
      expect(output).toContain('[REDACTED:GOOGLE_API_KEY]');
    });
  });

  describe('HTTP Headers Redaction', () => {
    it('sanitizes authorization, cookie, and custom sensitive headers', () => {
      const headers = {
        'Authorization': 'Bearer my_secret_token_12345',
        'Cookie': 'SAPISID=12345; SSID=67890',
        'X-Api-Key': 'my-secret-api-key',
        'Content-Type': 'application/json',
        'User-Agent': 'AVF-Worker/1.0',
      };

      const sanitized = redactor.redactHeaders(headers);
      expect(sanitized['Authorization']).toBe('Bearer [REDACTED:BEARER_TOKEN]');
      expect(sanitized['Cookie']).toBe('[REDACTED:HEADER]');
      expect(sanitized['X-Api-Key']).toBe('[REDACTED:HEADER]');
      expect(sanitized['Content-Type']).toBe('application/json');
      expect(sanitized['User-Agent']).toBe('AVF-Worker/1.0');
    });

    it('handles header arrays and undefined entries', () => {
      const headers = {
        'Set-Cookie': ['cookie1=val1', 'cookie2=val2'],
        'X-Normal-List': ['item1', 'item2 AIzaSyD98fjk28hskjdf8723kjsdhf8234kj'],
        'X-Empty': undefined,
      };

      const sanitized = redactor.redactHeaders(headers);
      expect(sanitized['Set-Cookie']).toEqual(['[REDACTED:HEADER]', '[REDACTED:HEADER]']);
      expect(sanitized['X-Normal-List']).toEqual(['item1', 'item2 [REDACTED:GOOGLE_API_KEY]']);
      expect(sanitized['X-Empty']).toBeUndefined();
    });

    it('returns empty object for non-object headers', () => {
      expect(redactor.redactHeaders(null as any)).toEqual({});
    });
  });

  describe('Object & Structural Redaction', () => {
    it('redacts sensitive keys regardless of case', () => {
      const input = {
        projectId: 'proj-123',
        password: 'PlainTextPassword123!',
        API_KEY: 'AIzaSyD98fjk28hskjdf8723kjsdhf8234kj',
        Client_Secret: 'secret_value',
        nested: {
          token: 'token_12345',
          publicInfo: 'hello world',
        },
      };

      const sanitized = redactor.redactObject(input);
      expect(sanitized.projectId).toBe('proj-123');
      expect(sanitized.password).toBe('[REDACTED:FIELD]');
      expect(sanitized.API_KEY).toBe('[REDACTED:FIELD]');
      expect(sanitized.Client_Secret).toBe('[REDACTED:FIELD]');
      expect(sanitized.nested.token).toBe('[REDACTED:FIELD]');
      expect(sanitized.nested.publicInfo).toBe('hello world');
    });

    it('safely handles circular references without infinite recursion', () => {
      const objA: any = { name: 'Node A' };
      const objB: any = { name: 'Node B', ref: objA };
      objA.ref = objB;

      const sanitized = redactor.redactObject(objA);
      expect(sanitized.name).toBe('Node A');
      expect(sanitized.ref.name).toBe('Node B');
      expect(sanitized.ref.ref).toBe('[CIRCULAR]');
    });

    it('clamps deep nested hierarchies exceeding maxObjectDepth', () => {
      let current: any = { value: 'leaf' };
      for (let i = 0; i < 15; i++) {
        current = { child: current };
      }

      const shallowRedactor = new SecretRedactor({ maxObjectDepth: 5 });
      const sanitized = shallowRedactor.redactObject(current);
      expect(JSON.stringify(sanitized)).toContain('[MAX_DEPTH_EXCEEDED]');
    });

    it('clamps array length exceeding maxArrayLength', () => {
      const longArr = Array.from({ length: 50 }, (_, i) => `item_${i}`);
      const arrayRedactor = new SecretRedactor({ maxArrayLength: 5 });
      const sanitized = arrayRedactor.redactObject(longArr);
      expect(sanitized).toHaveLength(5);
    });

    it('preserves Dates and Buffers correctly', () => {
      const date = new Date('2026-08-18T12:00:00Z');
      const buf = Buffer.from('test buffer');
      const input = { date, buf, count: 42 };

      const sanitized = redactor.redactObject(input);
      expect(sanitized.date).toEqual(date);
      expect(Buffer.isBuffer(sanitized.buf)).toBe(true);
      expect(sanitized.count).toBe(42);
    });

    it('redacts errors with sanitized stack traces', () => {
      const err = new Error('Database connect failed with key AIzaSyD98fjk28hskjdf8723kjsdhf8234kj');
      (err as any).secret_key = 'super_secret';

      const sanitized = redactor.redactError(err);
      expect(sanitized.message).toContain('[REDACTED:GOOGLE_API_KEY]');
      expect(sanitized.message).not.toContain('AIzaSyD');
      expect(sanitized.secret_key).toBe('[REDACTED:FIELD]');
      if (sanitized.stack) {
        expect(sanitized.stack).not.toContain('AIzaSyD');
      }
    });

    it('handles non-Error objects and string errors in redactError', () => {
      expect(redactor.redactError(null)).toEqual({ message: 'Unknown Error' });
      expect(redactor.redactError('String error message')).toEqual({ message: 'String error message' });
      expect(redactor.redactError({ code: 500, error_token: 'secret' })).toEqual({ code: 500, error_token: '[REDACTED:FIELD]' });
    });
  });

  describe('Stream Transform Redaction', () => {
    it('redacts continuous stream data line by line', async () => {
      const stream = redactor.createTransformStream();
      const chunks: string[] = [];

      stream.on('data', (chunk) => {
        chunks.push(chunk.toString());
      });

      const readable = Readable.from([
        'Line 1: Normal log\n',
        'Line 2: Secret AIzaSyD98fjk28hskjdf8723kjsdhf8234kj in log\n',
        'Line 3: Bearer my_super_secret_token_123',
      ]);

      await new Promise<void>((resolve, reject) => {
        readable.pipe(stream)
          .on('finish', resolve)
          .on('error', reject);
      });

      const combined = chunks.join('');
      expect(combined).toContain('Line 1: Normal log');
      expect(combined).toContain('Line 2: Secret [REDACTED:GOOGLE_API_KEY] in log');
      expect(combined).toContain('Bearer [REDACTED:BEARER_TOKEN]');
      expect(combined).not.toContain('AIzaSyD');
    });
  });

  describe('Buffer Hygiene Zeroing', () => {
    it('zeros out memory Buffer contents with buf.fill(0)', () => {
      const secret = Buffer.from('Sensitive_Password_12345');
      expect(secret.toString()).toBe('Sensitive_Password_12345');

      zeroBuffer(secret);
      expect(secret.toString()).not.toBe('Sensitive_Password_12345');
      expect(secret.every((byte) => byte === 0)).toBe(true);
    });

    it('zeros out Uint8Array contents', () => {
      const u8 = new Uint8Array([1, 2, 3, 4, 5]);
      zeroBuffer(u8);
      expect(Array.from(u8)).toEqual([0, 0, 0, 0, 0]);
    });

    it('zeros out multiple buffers with zeroBuffers', () => {
      const b1 = Buffer.from('sec1');
      const b2 = Buffer.from('sec2');
      zeroBuffers([b1, b2, null, undefined]);

      expect(b1.every((b) => b === 0)).toBe(true);
      expect(b2.every((b) => b === 0)).toBe(true);
    });
  });
});
