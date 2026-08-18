export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'audit' | 'security';

export const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  audit: 60,
  security: 70,
};

/**
 * Determine if targetLevel meets or exceeds configuredLevel threshold
 */
export function isLevelEnabled(configuredLevel: LogLevel, targetLevel: LogLevel): boolean {
  const configuredWeight = LOG_LEVEL_WEIGHTS[configuredLevel] ?? LOG_LEVEL_WEIGHTS.info;
  const targetWeight = LOG_LEVEL_WEIGHTS[targetLevel] ?? LOG_LEVEL_WEIGHTS.info;
  return targetWeight >= configuredWeight;
}
