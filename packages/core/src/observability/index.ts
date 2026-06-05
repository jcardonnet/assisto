import {
  redactEventRawText,
  redactImportedSourceText,
  redactProviderPrompt,
  redactProviderResponse,
  redactProposedMarkdownWrite,
  redactRawNote,
  redactUserString,
  safeCode,
  safeCount,
  safeRouteTemplate
} from "../privacy";
import { normalizeToken, safeStatusClass, scalarString } from "../utils/normalization";

export type AssistoComponent = "core" | "cli" | "workbench" | "pi" | "unknown";
export type ObservabilityResult = string;

export interface RunContextOptions {
  run_id?: string;
  component: AssistoComponent;
  sink?: ObservabilitySink;
  now?: () => string;
}

export interface RunContext {
  run_id: string;
  component: AssistoComponent;
  started_at: string;
  sink: ObservabilitySink;
}

export interface SpanInput {
  domain: string;
  operation: string;
  attributes?: Record<string, unknown>;
  now?: () => string;
}

export interface SpanEndInput {
  result?: ObservabilityResult;
  attributes?: Record<string, unknown>;
  now?: () => string;
}

export interface SpanHandle {
  end(input?: SpanEndInput): void;
}

export interface SpanRecord {
  run_id: string;
  component: AssistoComponent;
  domain: string;
  operation: string;
  result: ObservabilityResult;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  attributes: Record<string, unknown>;
}

export interface MetricInput {
  name: string;
  value: number;
  labels?: Record<string, unknown>;
}

export interface MetricRecord {
  run_id: string;
  component: AssistoComponent;
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface ObservabilitySink {
  recordSpan(record: SpanRecord): void;
  recordMetric(record: MetricRecord): void;
}

export interface InMemoryObservabilitySink extends ObservabilitySink {
  spans: SpanRecord[];
  metrics: MetricRecord[];
}

const ATTRIBUTE_TEXT_REDACTORS = {
  raw_note: redactRawNote,
  event_raw_text: redactEventRawText,
  imported_source_text: redactImportedSourceText,
  provider_prompt: redactProviderPrompt,
  provider_response: redactProviderResponse,
  proposed_markdown_write: redactProposedMarkdownWrite,
  user_string: redactUserString
} as const;

type SanitizedEntry = { key: string; value: unknown };
type SanitizationRule = (value: unknown) => SanitizedEntry;

const OBSERVABILITY_RULES: Record<string, SanitizationRule> = {
  route: (value) => ({ key: "route", value: safeRouteTemplate(scalarString(value)) }),
  status: (value) => ({ key: "status_class", value: safeStatusClass(Number(value)) }),
  status_code: (value) => ({ key: "status_class", value: safeStatusClass(Number(value)) }),
  status_class: (value) => ({ key: "status_class", value: safeStatusClass(Number(value)) })
};

const FORBIDDEN_OBSERVABILITY_KEYS = new Set([
  "run_id",
  "file_path",
  "path",
  "query",
  "query_hash",
  "event_id",
  "claim_id",
  "transaction_id",
  "tx_id",
  "person_name",
  "raw_route",
  "error_message"
]);

export function createNoopObservabilitySink(): ObservabilitySink {
  return {
    recordSpan() {},
    recordMetric() {}
  };
}

export function createInMemoryObservabilitySink(): InMemoryObservabilitySink {
  return {
    spans: [],
    metrics: [],
    recordSpan(record) {
      this.spans.push(record);
    },
    recordMetric(record) {
      this.metrics.push(record);
    }
  };
}

export function createRunContext(options: RunContextOptions): RunContext {
  return {
    run_id: options.run_id ?? "run_" + Date.now().toString(36),
    component: options.component,
    started_at: timestamp(options.now),
    sink: options.sink ?? createNoopObservabilitySink()
  };
}

export function startSpan(context: RunContext, input: SpanInput): SpanHandle {
  const startedAt = timestamp(input.now);
  const baseAttributes = sanitizeAttributes(input.attributes ?? {});
  let ended = false;

  return {
    end(endInput = {}) {
      if (ended) {
        return;
      }

      ended = true;
      const endedAt = timestamp(endInput.now);
      context.sink.recordSpan({
        run_id: context.run_id,
        component: context.component,
        domain: safeCode(input.domain),
        operation: safeCode(input.operation),
        result: safeCode(endInput.result ?? "ok"),
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: durationMs(startedAt, endedAt),
        attributes: {
          ...baseAttributes,
          ...sanitizeAttributes(endInput.attributes ?? {})
        }
      });
    }
  };
}

export function recordMetric(context: RunContext, input: MetricInput): void {
  context.sink.recordMetric({
    run_id: context.run_id,
    component: context.component,
    name: safeMetricName(input.name),
    value: safeCount(input.value),
    labels: sanitizeLabels(input.labels ?? {})
  });
}

function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attributes)) {
    const sanitized = sanitizeAttributeEntry(key, value);
    safe[sanitized.key] = sanitized.value;
  }

  return safe;
}

function sanitizeAttributeEntry(key: string, value: unknown): SanitizedEntry {
  const safeKey = safeCode(key);

  if (isForbiddenObservabilityKey(safeKey)) {
    return { key: safeKey, value: "redacted" };
  }

  const special = OBSERVABILITY_RULES[safeKey];
  if (special) {
    return special(value);
  }

  const redactor = ATTRIBUTE_TEXT_REDACTORS[safeKey as keyof typeof ATTRIBUTE_TEXT_REDACTORS];
  if (redactor) {
    return { key: safeKey, value: redactor(scalarString(value)) };
  }

  return { key: safeKey, value: sanitizeGenericAttributeValue(value) };
}

function sanitizeGenericAttributeValue(value: unknown): string | number {
  return typeof value === "number" ? safeCount(value) : safeCode(scalarString(value));
}

function sanitizeLabels(labels: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels)) {
    const safeKey = safeCode(key);

    if (isForbiddenObservabilityKey(safeKey)) {
      safe[safeKey] = "redacted";
      continue;
    }

    const special = OBSERVABILITY_RULES[safeKey];
    if (special) {
      const sanitized = special(value);
      safe[sanitized.key] = String(sanitized.value);
      continue;
    }

    safe[safeKey] = safeCode(scalarString(value));
  }

  return safe;
}

function isForbiddenObservabilityKey(key: string): boolean {
  return FORBIDDEN_OBSERVABILITY_KEYS.has(key);
}

function timestamp(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function durationMs(startedAt: string, endedAt: string): number {
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return safeCount(duration);
}

function safeMetricName(name: string): string {
  return normalizeToken(name, { separator: "." });
}
