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
    this.component = normalizeComponent(options.component);
    this.operation = options.operation === undefined ? undefined : normalizeToken(options.operation);
    this.status = Number.isInteger(options.status) ? options.status : undefined;
    this.details = options.details ?? {};
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
    message: defaults.message ?? messageFromUnknown(error),
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
    status_class: statusClass(error.status)
  };
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown Assisto error.";
}

function normalizeComponent(value: string): string {
  return normalizeToken(value) || "unknown";
}

function normalizeToken(value: string): string {
  let output = "";
  let pendingSeparator = false;

  for (const char of String(value ?? "").trim().toLowerCase()) {
    if (isAsciiAlphaNumeric(char)) {
      if (pendingSeparator && output) {
        output += "_";
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  return output || "unknown";
}

function isAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

function statusClass(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    return "unknown";
  }

  return String(Math.floor(value / 100)) + "xx";
}
