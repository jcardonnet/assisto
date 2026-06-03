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
  safeRouteTemplate,
  safeStatusClass
} from "../privacy";

export type AssistoComponent = "core" | "cli" | "workbench" | "pi" | "unknown";
export type ObservabilityResult = "ok" | "recoverable" | "validation_failed" | "failed" | string;

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
  const startedAt = context.started_at;
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
    if (key === "route") {
      safe.route = safeRouteTemplate(String(value ?? ""));
      continue;
    }

    if (key === "status" || key === "status_code") {
      safe.status_class = safeStatusClass(Number(value));
      continue;
    }

    if (key === "raw_note") {
      safe.raw_note = redactRawNote(String(value ?? ""));
      continue;
    }

    if (key === "event_raw_text") {
      safe.event_raw_text = redactEventRawText(String(value ?? ""));
      continue;
    }

    if (key === "imported_source_text") {
      safe.imported_source_text = redactImportedSourceText(String(value ?? ""));
      continue;
    }

    if (key === "provider_prompt") {
      safe.provider_prompt = redactProviderPrompt(String(value ?? ""));
      continue;
    }

    if (key === "provider_response") {
      safe.provider_response = redactProviderResponse(String(value ?? ""));
      continue;
    }

    if (key === "proposed_markdown_write") {
      safe.proposed_markdown_write = redactProposedMarkdownWrite(String(value ?? ""));
      continue;
    }

    if (key === "user_string") {
      safe.user_string = redactUserString(String(value ?? ""));
      continue;
    }

    safe[safeCode(key)] = typeof value === "number" ? safeCount(value) : safeCode(String(value ?? ""));
  }

  return safe;
}

function sanitizeLabels(labels: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels)) {
    const safeKey = safeCode(key);

    if (isForbiddenMetricLabel(safeKey)) {
      safe[safeKey] = "redacted";
      continue;
    }

    if (safeKey === "route") {
      safe.route = safeRouteTemplate(String(value ?? ""));
      continue;
    }

    if (safeKey === "status" || safeKey === "status_code" || safeKey === "status_class") {
      safe.status_class = safeStatusClass(Number(value));
      continue;
    }

    safe[safeKey] = safeCode(String(value ?? ""));
  }

  return safe;
}

function isForbiddenMetricLabel(key: string): boolean {
  return new Set([
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
  ]).has(key);
}

function timestamp(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function durationMs(startedAt: string, endedAt: string): number {
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return safeCount(duration);
}

function safeMetricName(name: string): string {
  let output = "";
  let pendingSeparator = false;

  for (const char of String(name ?? "").trim().toLowerCase()) {
    if (isAsciiAlphaNumeric(char)) {
      if (pendingSeparator && output) {
        output += ".";
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    if (char === ".") {
      pendingSeparator = output.length > 0;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  return output || "unknown";
}

function isAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
