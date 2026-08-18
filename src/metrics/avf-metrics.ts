import { IMetricsRegistry, defaultRegistry } from './metrics-registry';

export const AVF_STANDARD_METRICS = {
  // Provider latency histogram (seconds)
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

export interface StandardMetricsCollectors {
  providerGenerationDuration: ReturnType<IMetricsRegistry['createHistogram']>;
  providerCostCredits: ReturnType<IMetricsRegistry['createCounter']>;
  providerRetries: ReturnType<IMetricsRegistry['createCounter']>;
  providerErrors: ReturnType<IMetricsRegistry['createCounter']>;
  jobQueueDuration: ReturnType<IMetricsRegistry['createHistogram']>;
  qcEvaluationDuration: ReturnType<IMetricsRegistry['createHistogram']>;
  qcScoreDistribution: ReturnType<IMetricsRegistry['createHistogram']>;
  logRecords: ReturnType<IMetricsRegistry['createCounter']>;
  logRedactions: ReturnType<IMetricsRegistry['createCounter']>;
  flowOperationDuration: ReturnType<IMetricsRegistry['createHistogram']>;
}

/**
 * Initialize and register all standard AVF platform metrics on a registry
 */
export function registerStandardAVFMetrics(
  registry: IMetricsRegistry = defaultRegistry
): StandardMetricsCollectors {
  const providerGenerationDuration = registry.createHistogram(
    AVF_STANDARD_METRICS.PROVIDER_GENERATION_DURATION,
    'Duration of video/audio generation calls in seconds',
    ['provider_id', 'operation', 'status'],
    [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
  );

  const providerCostCredits = registry.createCounter(
    AVF_STANDARD_METRICS.PROVIDER_COST_CREDITS_TOTAL,
    'Total generation credits expended across providers',
    ['provider_id', 'project_id']
  );

  const providerRetries = registry.createCounter(
    AVF_STANDARD_METRICS.PROVIDER_RETRIES_TOTAL,
    'Count of retry attempts classified by type (technical vs creative)',
    ['provider_id', 'retry_type', 'error_code']
  );

  const providerErrors = registry.createCounter(
    AVF_STANDARD_METRICS.PROVIDER_ERRORS_TOTAL,
    'Count of provider errors classified by canonical AVF error code',
    ['provider_id', 'error_code', 'retry_category']
  );

  const jobQueueDuration = registry.createHistogram(
    AVF_STANDARD_METRICS.JOB_QUEUE_DURATION,
    'Time spent by jobs waiting in queue before execution pickup',
    ['pipeline_stage'],
    [0.1, 0.5, 1, 5, 15, 30, 60, 180, 600]
  );

  const qcEvaluationDuration = registry.createHistogram(
    AVF_STANDARD_METRICS.QC_EVALUATION_DURATION,
    'Duration of quality control inspection routines',
    ['qc_tier', 'status'],
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
  );

  const qcScoreDistribution = registry.createHistogram(
    AVF_STANDARD_METRICS.QC_SCORE_DISTRIBUTION,
    'Distribution of QC scores between 0.0 and 1.0',
    ['qc_metric', 'verdict'],
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0]
  );

  const logRecords = registry.createCounter(
    AVF_STANDARD_METRICS.LOG_RECORDS_TOTAL,
    'Total log records emitted per severity level',
    ['service', 'level']
  );

  const logRedactions = registry.createCounter(
    AVF_STANDARD_METRICS.LOG_REDACTIONS_TOTAL,
    'Total sensitive tokens detected and redacted',
    ['service', 'pattern_name']
  );

  const flowOperationDuration = registry.createHistogram(
    AVF_STANDARD_METRICS.FLOW_OPERATION_DURATION,
    'Latency of Google Flow operations across Track A and Track B',
    ['track', 'operation', 'status'],
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]
  );

  return {
    providerGenerationDuration,
    providerCostCredits,
    providerRetries,
    providerErrors,
    jobQueueDuration,
    qcEvaluationDuration,
    qcScoreDistribution,
    logRecords,
    logRedactions,
    flowOperationDuration,
  };
}

export const standardMetrics = registerStandardAVFMetrics(defaultRegistry);
