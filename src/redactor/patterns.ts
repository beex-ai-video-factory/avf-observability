export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  mask: string | ((match: string, ...args: any[]) => string);
}

/**
 * Pre-compiled canonical regex patterns for sensitive token redaction
 */
export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  // 1. Google API Keys (e.g. AIzaSyD...)
  {
    name: 'GOOGLE_API_KEY',
    pattern: /\bAIza[0-9A-Za-z-_]{30,}\b/g,
    mask: '[REDACTED:GOOGLE_API_KEY]',
  },
  // 2. OpenAI / LLM Keys (sk-..., sk-proj-...)
  {
    name: 'OPENAI_API_KEY',
    pattern: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/g,
    mask: '[REDACTED:API_KEY]',
  },
  // 3. Bearer Tokens in strings / headers
  {
    name: 'BEARER_TOKEN',
    pattern: /Bearer\s+([a-zA-Z0-9_.-]+)/gi,
    mask: 'Bearer [REDACTED:BEARER_TOKEN]',
  },
  // 4. AWS Access Key IDs
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    mask: '[REDACTED:AWS_KEY]',
  },
  // 5. Session Cookies (SAPISID, SSID, HSID, SID, __Secure-*)
  {
    name: 'SESSION_COOKIE',
    pattern: /((?:SAPISID|SSID|HSID|SID|__Secure-[a-zA-Z0-9_-]+)=)([^;\s]+)/gi,
    mask: '$1[REDACTED:COOKIE]',
  },
  // 6. JSON Web Tokens (JWT)
  {
    name: 'JWT_TOKEN',
    pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    mask: '[REDACTED:JWT_TOKEN]',
  },
  // 7. Cloud Storage SAS / Presigned Signatures (Azure sig=, AWS X-Amz-Signature=, GCP Signature=)
  {
    name: 'SAS_SIGNATURE',
    pattern: /((?:sig|X-Amz-Signature|Signature)=)([^&\s]+)/gi,
    mask: '$1[REDACTED:SAS_SIGNATURE]',
  },
  // 8. General URL Query Secrets
  {
    name: 'URL_QUERY_SECRETS',
    pattern: /([?&](?:api_?key|token|password|se|sp|sv|X-Amz-Credential)=)([^&\s]+)/gi,
    mask: '$1[REDACTED]',
  },
];

/**
 * Case-insensitive regex matching sensitive object field keys
 */
export const SENSITIVE_KEY_REGEX =
  /^(?:.*password.*|.*secret.*|.*token.*|.*credentials?.*|.*auth.*|.*cookie.*|.*api_?key.*|.*private_?key.*)$/i;

export const DEFAULT_MASK_TEXT = '[REDACTED]';
export const FIELD_MASK_TEXT = '[REDACTED:FIELD]';
export const COOKIE_MASK_TEXT = '[REDACTED:COOKIE]';
export const HEADER_MASK_TEXT = '[REDACTED:HEADER]';
