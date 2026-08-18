import { LogLevel } from './log-levels';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  correlation_id?: string;
  trace_id?: string;
  span_id?: string;
  workflow_run_id?: string;
  job_id?: string;
  shot_id?: string;
  project_id?: string;
  user_id?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    [key: string]: unknown;
  };
  audit?: {
    action: string;
    actor: string;
    resource: string;
  };
  security?: {
    event: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

/**
 * Serialize LogRecord into a standardized single-line JSON string
 */
export function formatJsonLog(record: LogRecord): string {
  return JSON.stringify(record);
}
