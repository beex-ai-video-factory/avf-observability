# R14 PLATFORM OBSERVABILITY, TELEMETRY & SECURITY — ARCHITECTURAL IMPLEMENTATION PLAN

**Repository:** `R14_platform_observability`  
**Architectural Layer:** Layer Cross-Cutting  
**Specification Baseline:** v1.0.0 (Frozen Spec Candidate)  
**Document Status:** APPROVED FOR IMPLEMENTATION  
**Target Package:** `@avf/platform-observability` (TypeScript Observability, Tracing & Security Library)  
**Author:** AI Video Factory Architecture & Engineering  

---

## Executive Summary

`R14_platform_observability` is the cross-cutting foundational observability, distributed telemetry, and automated security sanitization engine for the AI Video Factory (AVF) ecosystem. It provides the universal runtime instrumentation framework consumed by every domain repository (`R02` through `R15`) to guarantee:

1. **End-to-End Distributed Tracing & W3C TraceContext Propagation:** Seamless correlation across synchronous HTTP/gRPC APIs, asynchronous event brokers, Temporal workflow activities, and browser worker subprocesses.
2. **Zero-Leak Automated Secret & Token Redaction:** Comprehensive, high-throughput sanitization of sensitive credentials, API keys (`AIza*`, bearer tokens, `sk-*`, AWS secrets), session cookies (`SAPISID`, `SSID`, `__Secure-*`), passwords, and private SAS storage URLs across all log streams, error payloads, span attributes, and metric tags.
3. **Structured JSON Logging:** High-performance, contextualized logging with automated correlation ID enrichment, strict RFC 5424 severity mapping, and audit logging support.
4. **Prometheus Metrics & Cost/Latency Telemetry:** Standardized dimensional metrics for provider execution latency percentiles ($p50$, $p95$, $p99$), credit consumption, technical/creative retry counts, error taxonomy distributions, and queue wait times.
5. **Contract Conformance:** Native integration with `@avf/contracts` to validate and construct distributed event envelopes (`event-envelope.schema.json`) and normalize operational errors into canonical AVF error taxonomies.

---

## 1. Blueprint Conformance & Repository Responsibilities

### 1.1 Responsibility (OWNS)
- **OpenTelemetry Tracing SDK Wrapper:** Provide an ergonomic, transport-agnostic wrapper over OpenTelemetry APIs for span creation, parent-child span hierarchy tracking, active span scoping, span event emission, and baggage management.
- **Distributed Correlation Context Propagation:** Manage asynchronous execution context across Node.js event loop hops using `AsyncLocalStorage` (`CorrelationContext`) to track `trace_id`, `span_id`, `correlation_id`, `workflow_run_id`, `job_id`, `shot_id`, and `project_id`.
- **Automated Secret & Token Redaction Engine:** Provide a hardened, multi-tier sanitization engine (`SecretRedactor`) with pre-compiled pattern matching, recursive object traversal with cyclic reference protection, HTTP header sanitization, query string redaction, and stream transform capabilities.
- **Structured Log Formatter & Transports:** Provide a strongly-typed JSON logger (`StructuredLogger`) supporting standard levels (`trace`, `debug`, `info`, `warn`, `error`, `audit`, `security`), automatic correlation context injection, and guaranteed redaction before output.
- **Prometheus Metrics Exporter & Registry:** Maintain an in-memory thread-safe metrics registry (`MetricsRegistry`) supporting counters, gauges, and histograms with standard Prometheus text exposition format export for scraping or push gateways.
- **Provider Cost, Latency & Retry Telemetry:** Standardize metric definitions for provider generation latency, cost credit expenditure, retry attempts, and queue dwell times.
- **Audit Logging & Security Challenge Event Emission:** Emit tamper-evident security challenge events and operator audit trails conforming to `event-envelope.schema.json`.

### 1.2 Does NOT Own (Boundaries & Exclusions)
- **Domain Business Logic:** Does NOT own story decomposition, character continuity, prompt compilation, or media assembly (owned by R03, R04, R05, R11, R12).
- **Database Schema Migrations & Direct Persistence:** Does NOT own database schemas, connection pools, or direct table mutations (owned exclusively by `R02_core_state`).
- **Workflow Orchestration & Sagas:** Does NOT schedule or execute Temporal workflows (owned by `R06_workflow`).
- **Provider Adapters & Browser Automation:** Does NOT execute HTTP/CDP calls to video generation backends (owned by R07, R08, R09, R10).
- **Frontend UI & Operator Displays:** Does NOT render operator dashboards or UI components (owned by `R13_operator_console`).

---

## 2. Inputs, Invariants & System Guarantees

### 2.1 Inputs
- Canonical JSON Schemas and TypeScript types from `R01_contracts` (`@avf/contracts`), specifically `event-envelope.schema.json` and `domain-entities.schema.json`.
- Runtime execution context, HTTP headers (`traceparent`, `tracestate`, `x-correlation-id`), Temporal activity headers, and log messages from host services.
- Environment configurations for log level, OTLP exporter endpoints, metric scrape ports, and custom redaction rules.

### 2.2 System Invariants Enforced
- **INV-003:** Trace spans for mutating operations must capture and tag deterministic `idempotency_key` attributes.
- **INV-006:** Media and artifact logging must record `checksum_sha256` and storage URI provenance without leaking SAS access tokens.
- **INV-007:** Provider-specific telemetry and metric dimensions must remain namespaced under `provider_parameters` / `provider_id`.
- **INV-010 & INV-011:** Metrics must strictly distinguish technical retries (same `prompt_version_id`) from creative retries (new `prompt_version_id`).
- **INV-012:** Authentication and security challenges (e.g. CAPTCHAs, bot blocks) must emit immediate high-priority `SECURITY_CHALLENGE` security events and pause worker metrics rather than attempting automated bypass.
- **INV-014:** Event envelopes emitted by the observability layer must pass runtime validation against `event-envelope.schema.json`.
- **INV-015:** Correlation IDs (`correlation_id`, `trace_id`, `span_id`) must propagate unbroken across workflow activities, provider requests, browser execution, QC checks, and media rendering.

---

## 3. Hardening & Security Specifications

### 3.1 Zero Plaintext Credentials Policy
Under no circumstances may plaintext API tokens, session cookies, passwords, bearer tokens, or sensitive storage access credentials appear in log files, console outputs, exception stack traces, span tags, or metric labels.

### 3.2 Automated Redaction Rule Matrix
The `SecretRedactor` module implements multi-pass pattern scanning and recursive structural sanitization:

| Category | Target Patterns / Keys | Redaction Mask |
|---|---|---|
| **Google API Keys** | `AIza[0-9A-Za-z-_]{35}` | `[REDACTED:GOOGLE_API_KEY]` |
| **OpenAI / LLM Keys** | `sk-[a-zA-Z0-9]{32,}`, `sk-proj-[a-zA-Z0-9_-]{32,}` | `[REDACTED:API_KEY]` |
| **Bearer Tokens** | `Bearer\s+[a-zA-Z0-9_\-\.]+`, `bearer\s+[a-zA-Z0-9_\-\.]+` | `Bearer [REDACTED:BEARER_TOKEN]` |
| **AWS Credentials** | `AKIA[0-9A-Z]{16}`, AWS secret access key patterns | `[REDACTED:AWS_KEY]` |
| **Session Cookies** | `(SAPISID\|SSID\|HSID\|SID\|__Secure-[a-zA-Z0-9_-]+)=[^;]+` | `$1=[REDACTED:COOKIE]` |
| **Sensitive Object Keys** | `password`, `secret`, `client_secret`, `private_key`, `token`, `api_key`, `access_token`, `refresh_token`, `authorization`, `cookie`, `set-cookie`, `session_id`, `credentials` (case-insensitive regex: `/^(password\|secret\|client_secret\|private_key\|token\|api_?key\|access_?token\|refresh_?token\|authorization\|cookie\|set-cookie\|session_id\|credentials)$/i`) | `[REDACTED:FIELD]` |
| **URL Query Secrets** | `([?&](api_?key\|token\|key\|secret\|sig\|signature\|se\|sp\|sv\|X-Amz-Signature\|X-Amz-Credential)=)([^&]+)` | `$1[REDACTED]` |
| **Storage SAS Tokens** | Azure SAS `sig=...`, AWS S3 Presigned `X-Amz-Signature=...`, GCP Signed `Signature=...` | `[REDACTED:SAS_SIGNATURE]` |
| **JWT Tokens** | `eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | `[REDACTED:JWT_TOKEN]` |

### 3.3 Structural Sanitizer Safety Rules
1. **Cyclic Reference Handling:** Use a `WeakSet` during recursive traversal of objects and arrays to prevent infinite loops on circular data structures.
2. **Depth & Size Clamping:** Impose a maximum object recursion depth (default: 10 levels) and string length limit per field to prevent DoS via adversarial deep/large payloads.
3. **In-Memory Buffer Zeroing:** Provide a secure buffer utility `zeroBuffer(buf: Buffer): void` that executes `buf.fill(0)` immediately after sensitive data parsing.
4. **Error Object & Stack Trace Sanitization:** Recursively sanitize `Error.message`, `Error.stack`, and any attached custom error properties before serialization.

---

## 4. Architecture & Component Breakdown

```text
R14_platform_observability/
├── src/
│   ├── index.ts                     # Main library entry point
│   ├── context/                     # AsyncLocalStorage correlation context manager
│   │   ├── correlation-context.ts   # Context holder, async store, getter/setters
│   │   ├── traceparent.ts           # W3C traceparent (00-traceid-spanid-flags) parser & serializer
│   │   └── index.ts
│   ├── redactor/                    # Automated secret & token redaction engine
│   │   ├── secret-redactor.ts       # Main redactor class with string, object, and stream redaction
│   │   ├── patterns.ts              # Canonical regex definitions and token matchers
│   │   ├── stream-redactor.ts       # Node.js Transform stream for redacting continuous log streams
│   │   ├── buffer-hygiene.ts        # Secure in-memory buffer clearing utilities
│   │   └── index.ts
│   ├── logging/                     # Structured JSON logging system
│   │   ├── structured-logger.ts     # Logger class with info, warn, error, audit, security methods
│   │   ├── log-formatter.ts         # JSON log serializer with ISO timestamps and level names
│   │   ├── log-levels.ts            # Log level enum, numeric weights, and threshold filters
│   │   └── index.ts
│   ├── tracing/                     # OpenTelemetry tracing SDK wrapper
│   │   ├── tracer-wrapper.ts        # Tracer interface, startSpan, withSpan, active span management
│   │   ├── span-context.ts          # Span lifecycle, attribute injection, and error status mapping
│   │   ├── noop-tracer.ts           # Zero-overhead fallback tracer for isolated unit tests
│   │   └── index.ts
│   ├── metrics/                     # Prometheus / OpenTelemetry metrics engine
│   │   ├── metrics-registry.ts      # Registry maintaining metric collectors and Prometheus exposition
│   │   ├── counter.ts               # Monotonically increasing metric counter with label dimensions
│   │   ├── gauge.ts                 # Arbitrary value gauge with label dimensions
│   │   ├── histogram.ts             # Bucket-based latency and size distribution histogram
│   │   ├── avf-metrics.ts           # Pre-registered standard AVF platform metrics
│   │   └── index.ts
│   ├── events/                      # Contract-conforming event envelope builder
│   │   ├── event-builder.ts         # Helper to construct validated event envelopes with active context
│   │   └── index.ts
│   └── errors/                      # Error normalizer and sanitized error reporter
│       ├── normalized-error.ts      # Error wrapper mapping to 9 AVF codes with sanitized stack
│       └── index.ts
├── tests/
│   ├── unit/
│   │   ├── context.test.ts          # Async context propagation across async/await and promises
│   │   ├── traceparent.test.ts      # W3C traceparent parsing, format validation, and generation
│   │   ├── redactor.test.ts         # Pattern matching, string, object, cyclic, and stream redaction
│   │   ├── logger.test.ts           # Log formatting, level filtering, and context enrichment
│   │   ├── tracing.test.ts          # Span nesting, active context propagation, and error tagging
│   │   ├── metrics.test.ts          # Counters, gauges, histograms, labels, and Prometheus exposition
│   │   ├── event-builder.test.ts    # Envelope construction and validation against @avf/contracts
│   │   └── normalized-error.test.ts # Stack trace stripping and 9 AVF error codes mapping
│   └── contract/
│       ├── event-envelope-conformance.test.ts # Validates emitted envelopes against R01 JSON schema
│       └── error-taxonomy-conformance.test.ts # Validates error representations against R01 schema
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── jest.config.js
├── .eslintrc.js
├── .gitignore
└── README.md
```

---

## 5. TypeScript Interfaces & Type Specifications

### 5.1 Correlation Context Interfaces
```typescript
export interface CorrelationContextData {
  trace_id: string;             // 32-character hex or UUID string
  span_id?: string;             // 16-character hex string
  correlation_id: string;       // UUID string tracking request inception
  parent_span_id?: string;      // 16-character hex string of parent span
  workflow_run_id?: string;     // Temporal workflow execution ID
  job_id?: string;              // AVF GenerationJob UUID
  shot_id?: string;             // AVF Shot UUID
  project_id?: string;          // AVF Project UUID
  user_id?: string;             // Authenticated user ID (if available)
  service_name: string;         // Service identifier (e.g. 'R08_google_flow_adapter')
  custom_tags?: Record<string, string>;
}

export interface W3CTraceParent {
  version: string;              // '00'
  trace_id: string;             // 32 hex chars
  parent_id: string;            // 16 hex chars (span ID)
  trace_flags: string;          // '01' (recorded) or '00'
}
```

### 5.2 Secret Redaction Interfaces
```typescript
export interface RedactionOptions {
  maskText?: string;                               // Default: '[REDACTED]'
  sensitiveKeys?: RegExp[];                        // Custom sensitive key patterns
  customPatterns?: Array<{ name: string; pattern: RegExp; mask: string }>;
  maxObjectDepth?: number;                         // Default: 10
  maxArrayLength?: number;                         // Default: 1000
  maskUrls?: boolean;                              // Default: true (scrubs query params and SAS tokens)
}

export interface ISecretRedactor {
  redactString(input: string): string;
  redactObject<T>(input: T): T;
  redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]>;
  redactUrl(url: string): string;
  createTransformStream(): NodeJS.ReadWriteStream;
}
```

### 5.3 Structured Logging Interfaces
```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'audit' | 'security';

export interface LogRecord {
  timestamp: string;                               // ISO 8601 UTC
  level: LogLevel;
  message: string;
  service: string;
  correlation_id?: string;
  trace_id?: string;
  span_id?: string;
  workflow_run_id?: string;
  job_id?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerOptions {
  serviceName: string;
  minLevel?: LogLevel;
  redactor?: ISecretRedactor;
  destinationStream?: NodeJS.WritableStream;       // Default: process.stdout
  jsonFormat?: boolean;                            // Default: true
}

export interface IStructuredLogger {
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  audit(action: string, actor: string, resource: string, data?: Record<string, unknown>): void;
  security(event: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): IStructuredLogger;
}
```

### 5.4 OpenTelemetry Tracing Interfaces
```typescript
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface ISpan {
  readonly span_id: string;
  readonly trace_id: string;
  setAttribute(key: string, value: string | number | boolean): this;
  setAttributes(attributes: SpanAttributes): this;
  addEvent(name: string, attributes?: SpanAttributes): this;
  setStatus(status: { code: 'OK' | 'ERROR' | 'UNSET'; message?: string }): this;
  recordException(exception: Error | unknown): this;
  end(): void;
}

export interface ITracer {
  startSpan(name: string, options?: { parentSpanId?: string; attributes?: SpanAttributes }): ISpan;
  startActiveSpan<T>(name: string, fn: (span: ISpan) => Promise<T>, options?: { attributes?: SpanAttributes }): Promise<T>;
  withSpan<T>(span: ISpan, fn: () => T): T;
  injectContextToHeaders(headers: Record<string, string>): Record<string, string>;
  extractContextFromHeaders(headers: Record<string, string | undefined>): Partial<CorrelationContextData>;
}
```

### 5.5 Prometheus Metrics Interfaces
```typescript
export type MetricLabels = Record<string, string | number>;

export interface ICounter {
  inc(value?: number): void;
  inc(labels: MetricLabels, value?: number): void;
  reset(): void;
}

export interface IGauge {
  set(value: number): void;
  set(labels: MetricLabels, value: number): void;
  inc(value?: number): void;
  inc(labels: MetricLabels, value?: number): void;
  dec(value?: number): void;
  dec(labels: MetricLabels, value?: number): void;
}

export interface IHistogram {
  observe(value: number): void;
  observe(labels: MetricLabels, value: number): void;
  startTimer(labels?: MetricLabels): () => number;
}

export interface IMetricsRegistry {
  createCounter(name: string, help: string, labelNames?: string[]): ICounter;
  createGauge(name: string, help: string, labelNames?: string[]): IGauge;
  createHistogram(name: string, help: string, labelNames?: string[], buckets?: number[]): IHistogram;
  exportPrometheus(): string;
  clear(): void;
}
```

---

## 6. State Ownership, Persistence & Concurrency Models

### 6.1 State Boundaries
- `R14_platform_observability` is strictly **stateless and ephemeral**.
- In-memory metrics accumulators, trace span buffers, and correlation contexts are held in process memory and discarded upon completion.
- Zero local database storage, files, or persistent disk state.
- Permanent domain state (audit log events, billing records) is emitted as standard `event-envelope` payloads intended for `R02_core_state` persistence.

### 6.2 Concurrency & Context Isolation
- **Node.js `AsyncLocalStorage`:** Guarantees absolute correlation context isolation across hundreds of concurrent promises, HTTP request handlers, and Temporal activity worker tasks running on the same process.
- **Lock-Free Metrics Aggregation:** Metric counters and histogram buckets utilize atomic arithmetic operations in Node.js event-loop turns, ensuring thread safety and sub-microsecond overhead.

---

## 7. Standard AVF Metrics Catalog & Error Normalization

### 7.1 Pre-Registered Standard Platform Metrics
R14 initializes and exports standard dimensional metrics defined across the AVF ecosystem:

```typescript
export const AVF_STANDARD_METRICS = {
  // Provider latency histogram (seconds) with standard exponential buckets [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
  PROVIDER_GENERATION_DURATION: 'avf_provider_generation_duration_seconds',
  // Total cost in provider credits consumed
  PROVIDER_COST_CREDITS_TOTAL: 'avf_provider_cost_credits_total',
  // Technical and creative retry counts
  PROVIDER_RETRIES_TOTAL: 'avf_provider_retries_total',
  // Errors grouped by the 9 standard AVF error codes
  PROVIDER_ERRORS_TOTAL: 'avf_provider_errors_total',
  // Queue duration before worker pickup (seconds)
  JOB_QUEUE_DURATION: 'avf_job_queue_duration_seconds',
  // QC execution latency and score distributions
  QC_EVALUATION_DURATION: 'avf_qc_evaluation_duration_seconds',
  QC_SCORE_DISTRIBUTION: 'avf_qc_score_distribution',
  // Log records emitted per severity level
  LOG_RECORDS_TOTAL: 'avf_log_records_total',
  // Total secrets detected and masked
  LOG_REDACTIONS_TOTAL: 'avf_log_redactions_total',
  // FlowExecutionPort operation latency per track (Track A vs Track B)
  FLOW_OPERATION_DURATION: 'avf_flow_operation_duration_seconds',
} as const;
```

### 7.2 Normalized Error Handling & Fail-Safe Telemetry
1. **9 Canonical Error Codes:**
   - `PROVIDER_RATE_LIMIT`, `AUTH_REQUIRED`, `SECURITY_CHALLENGE`, `UI_CHANGED`, `BUDGET_EXHAUSTED`, `UNSUPPORTED_CAPABILITY`, `NETWORK_TIMEOUT`, `BAD_REQUEST`, `PROVIDER_INTERNAL_ERROR`.
2. **Fail-Safe Observability Principle:**
   - A failure in logging, tracing, or metric collection must **NEVER** throw an uncaught exception or crash the host business process.
   - If writing to an external OTLP endpoint or stream encounters a network error, the library records an internal counter and safely falls back to standard `process.stderr` without interrupting request execution.

---

## 8. Package Structure, Toolchain & Dependencies

### 8.1 Repository Polyrepo Configuration
- **Package Name:** `@avf/platform-observability`
- **Version:** `1.0.0`
- **Node Target:** `Node.js >= 20.0.0 LTS`
- **Language:** `TypeScript 5.7+`
- **Module Format:** CommonJS & ES Module Dual Output (`dist/`)

### 8.2 Dependencies Policy
- **Allowed Dependencies:**
  - `@avf/contracts` (`file:../R01_contracts` for local development / published npm package)
  - Standard minimal zero-dep / low-overhead utilities.
- **Forbidden Dependencies:**
  - `R02_core_state`, `R03_creative`, `R04_assets_continuity`, `R05_prompt_compiler`, `R06_workflow`, `R07_provider_sdk`, `R08_google_flow_adapter`, `R09_browser_worker`, `R10_flowkit_bridge`, `R11_qc`, `R12_media`, `R13_operator_console`, `R15_integration_harness`.
  - Direct database libraries (`pg`, `mysql2`, `ioredis`, `prisma`, `drizzle-orm`).
  - Browser automation drivers (`playwright`, `puppeteer`).

---

## 9. Comprehensive Test Plan & Verification Matrix

### 9.1 Test Suites Breakdown (`tests/`)

| Test Suite | Target Modules | Verification Criteria & Scenarios |
|---|---|---|
| **Secret Redactor Tests** (`tests/unit/redactor.test.ts`) | `src/redactor/*` | 1. Redaction of Google API keys (`AIza...`).<br>2. Redaction of OpenAI bearer tokens (`Bearer sk-...`).<br>3. Redaction of session cookies (`SAPISID`, `__Secure-3PAPISID`, `session_id`).<br>4. URL query param sanitization (`?key=...`, `?sig=...`).<br>5. Azure/AWS SAS signature redaction.<br>6. Deep nested object traversal ($> 5$ levels).<br>7. Circular object reference cycle handling without stack overflow.<br>8. Stream transform chunked string sanitization.<br>9. In-memory `Buffer` wiping verification. |
| **Correlation Context Tests** (`tests/unit/context.test.ts`) | `src/context/*` | 1. `AsyncLocalStorage` propagation across nested `async/await` calls.<br>2. Context preservation across `Promise.all` concurrent execution.<br>3. Extraction and injection of W3C `traceparent` headers.<br>4. Custom tag propagation and child context inheritance. |
| **Structured Logger Tests** (`tests/unit/logger.test.ts`) | `src/logging/*` | 1. JSON formatting with standard fields (`timestamp`, `level`, `service`, `message`).<br>2. Automated enrichment with active `trace_id` and `correlation_id`.<br>3. Log level threshold filtering (e.g. suppress `debug` in `info` mode).<br>4. Integration with redactor: zero secrets written to destination stream.<br>5. Dedicated `audit()` and `security()` methods formatting. |
| **Tracer Wrapper Tests** (`tests/unit/tracing.test.ts`) | `src/tracing/*` | 1. Span hierarchy tracking (root span vs child span).<br>2. `startActiveSpan` automatic span lifecycle and exception recording.<br>3. W3C traceparent header injection and roundtrip extraction.<br>4. Span attribute redaction to prevent secret leakage in trace attributes.<br>5. Proper span status mapping (`OK` vs `ERROR`). |
| **Prometheus Metrics Tests** (`tests/unit/metrics.test.ts`) | `src/metrics/*` | 1. Monotonic counter increments with multi-dimensional labels.<br>2. Gauge set, inc, and dec operations.<br>3. Histogram observation, bucket counting, sum, and count calculations.<br>4. Valid Prometheus text exposition output conforming to Prometheus v0.0.4 format.<br>5. Registry reset and thread-safe accumulation. |
| **Normalized Error Tests** (`tests/unit/normalized-error.test.ts`) | `src/errors/*` | 1. Mapping generic errors to 9 canonical AVF error codes.<br>2. Sanitization of sensitive tokens within error messages and stack traces.<br>3. Correct assignment of retry categories (`TRANSIENT`, `PERMANENT`, `POLICY_BLOCKED`, `RESOURCE_EXHAUSTED`). |
| **Contract Conformance Tests** (`tests/contract/*`) | `src/events/*`, `src/index.ts` | 1. Validate event envelopes constructed by `createEventEnvelope()` against `event-envelope.schema.json` via `@avf/contracts` AJV validator.<br>2. Positive and negative payload validation.<br>3. Schema version `1.0.0` adherence. |

### 9.2 Coverage Targets
- **Secret Redactor Engine:** $100\%$ branch coverage.
- **Overall Library:** $\ge 85\%$ branch coverage across all `src/` modules.
- **Test Pass Rate:** $100\%$ test suite pass rate without skipped or flaky tests.

---

## 10. Implementation Roadmap (Phases for R14_02_IMPLEMENT)

1. **Phase 1: Project Scaffolding & Toolchain Configuration:**
   - Author `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `.eslintrc.js`.
   - Setup dependencies on `@avf/contracts`.
2. **Phase 2: Secret & Token Redaction Engine (`src/redactor/`):**
   - Implement regex patterns for API keys, cookies, tokens, URLs, SAS signatures.
   - Implement recursive structural object redactor with cyclic reference protection.
   - Implement transform stream and buffer hygiene utilities.
3. **Phase 3: Correlation Context Manager (`src/context/`):**
   - Implement `AsyncLocalStorage` wrapper for Node.js.
   - Implement W3C `traceparent` parser, validator, and serializer.
4. **Phase 4: Structured Logging System (`src/logging/`):**
   - Implement JSON log formatter, log level filters, and `StructuredLogger`.
   - Connect automated correlation context injection and secret redaction pipeline.
5. **Phase 5: OpenTelemetry Tracing Wrapper (`src/tracing/`):**
   - Implement `ISpan`, `ITracer`, `TracerWrapper`, and active context propagation.
6. **Phase 6: Prometheus Metrics Registry (`src/metrics/`):**
   - Implement `Counter`, `Gauge`, `Histogram`, `MetricsRegistry`, and Prometheus exposition formatter.
   - Define and export `AVF_STANDARD_METRICS`.
7. **Phase 7: Event Envelope Integration & Normalized Errors (`src/events/`, `src/errors/`):**
   - Implement envelope builder and validator conforming to `@avf/contracts`.
   - Implement normalized error classes and stack trace sanitizers.
8. **Phase 8: Comprehensive Test Suite & Conformance Verification (`tests/`):**
   - Author all unit and contract tests.
   - Run `npm test` and assert $\ge 85\%$ branch coverage and 100% pass rate.

---

## 11. Definition of Done (DoD) Checklist

- [x] **Blueprint Conformance:** All 16 blueprint sections from `01_FROZEN_RELEASE/v1.0.0/FROZEN_SPEC_CANDIDATE/03_repo_blueprints/R14_PLATFORM_OBSERVABILITY.md` comprehensively covered.
- [x] **Strict Architectural Boundaries:** OWNS and DOES NOT OWN constraints clearly defined.
- [x] **Security & Zero-Leak Redaction:** Hardened rules specified for Google API keys, bearer tokens, cookies, passwords, and cloud SAS tokens.
- [x] **Zero Production Code Written in Planning:** Only architectural specification (`PLAN.md`) created in this planning step.
- [x] **Allowed / Forbidden Dependencies:** Strictly allows `@avf/contracts`; forbids R02-R13, R15, and direct database access.
- [x] **Test Strategy Defined:** Branch coverage target $\ge 85\%$ (100% for redactor) and JSON Schema contract validation specified.
- [x] **Run State Alignment:** Run state updated to reflect approved implementation plan.
