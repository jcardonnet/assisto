import {
  redactEventRawText,
  redactImportedSourceText,
  redactProviderPrompt,
  redactProviderResponse,
  redactProposedMarkdownWrite,
  redactRawNote,
  redactUserString,
  safeCode,
  safeCount
} from "../privacy";
import { normalizeToken, safeStatusClass, scalarString } from "../utils/normalization";

export const ASSISTO_ERROR_CODES = [
  "validation_failed",
  "vault_path_invalid",
  "transaction_apply_failed",
  "workbench_forbidden",
  "payload_too_large",
  "provider_failed",
  "unknown"
] as const;

export type AssistoErrorCode = (typeof ASSISTO_ERROR_CODES)[number];

export interface AssistoErrorOptions {
  code: AssistoErrorCode;
  message: string;
  component: string;
  operation?: string;
  status?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface SafeErrorSummary {
  name: string;
  code: AssistoErrorCode;
  component: string;
  operation?: string;
  status_class: string;
}

const DEFAULT_ASSISTO_ERROR_MESSAGE = "Assisto operation failed.";

const DETAIL_TEXT_REDACTORS = {
  event_raw_text: redactEventRawText,
  imported_source_text: redactImportedSourceText,
  provider_prompt: redactProviderPrompt,
  provider_response: redactProviderResponse,
  proposed_markdown_write: redactProposedMarkdownWrite,
  raw_note: redactRawNote,
  user_string: redactUserString
} as const;

const SAFE_DETAIL_CODE_KEYS = new Set([
  "code",
  "component",
  "kind",
  "operation",
  "reason",
  "result",
  "scope",
  "state",
  "status_class",
  "type"
]);

export class AssistoError extends Error {
  readonly code: AssistoErrorCode;
  readonly component: string;
  readonly operation?: string;
  readonly status?: number;
  readonly details: Record<string, unknown>;

  constructor(options: AssistoErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AssistoError";
    this.code = options.code;
    this.component = normalizeToken(options.component);
    this.operation = options.operation === undefined ? undefined : normalizeToken(options.operation);
    this.status = Number.isInteger(options.status) ? options.status : undefined;
    this.details = sanitizeErrorDetails(options.details ?? {});
  }
}

export function isAssistoError(error: unknown): error is AssistoError {
  return error instanceof AssistoError;
}

export function assistoErrorCode(error: unknown): AssistoErrorCode {
  return isAssistoError(error) ? error.code : "unknown";
}

export function toAssistoError(
  error: unknown,
  defaults: Omit<AssistoErrorOptions, "message"> & { message?: string }
): AssistoError {
  if (isAssistoError(error)) {
    return error;
  }

  return new AssistoError({
    ...defaults,
    message: defaults.message ?? DEFAULT_ASSISTO_ERROR_MESSAGE,
    cause: error
  });
}

export function safeErrorSummary(error: unknown): SafeErrorSummary {
  if (!isAssistoError(error)) {
    return {
      name: error instanceof Error && error.name ? normalizeToken(error.name) : "Error",
      code: "unknown",
      component: "unknown",
      status_class: "unknown"
    };
  }

  return {
    name: error.name,
    code: error.code,
    component: error.component,
    ...(error.operation === undefined ? {} : { operation: error.operation }),
    status_class: safeStatusClass(error.status)
  };
}

function sanitizeErrorDetails(details: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const safeKey = safeCode(key);
    safe[safeKey] = sanitizeErrorDetailValue(safeKey, value);
  }

  return safe;
}

function sanitizeErrorDetailValue(key: string, value: unknown): unknown {
  const redactor = DETAIL_TEXT_REDACTORS[key as keyof typeof DETAIL_TEXT_REDACTORS];
  if (redactor) {
    return redactor(scalarString(value));
  }

  if (typeof value === "number") {
    return safeCount(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string" || typeof value === "bigint") {
    return isSafeDetailCodeKey(key) ? safeCode(scalarString(value)) : redactUserString(scalarString(value));
  }

  if (Array.isArray(value)) {
    return { kind: "array", item_count: safeCount(value.length) };
  }

  if (value && typeof value === "object") {
    return { kind: "object", key_count: safeCount(Object.keys(value).length) };
  }

  return "unknown";
}

function isSafeDetailCodeKey(key: string): boolean {
  return SAFE_DETAIL_CODE_KEYS.has(key) || key.endsWith("_code") || key.endsWith("_kind") || key.endsWith("_state");
}
