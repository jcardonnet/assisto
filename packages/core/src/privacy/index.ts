import { createHash } from "node:crypto";
import { normalizeToken } from "../utils/normalization";

export { safeStatusClass } from "../utils/normalization";

type RedactionKind =
  | "raw_note"
  | "event_raw_text"
  | "imported_source_text"
  | "provider_prompt"
  | "provider_response"
  | "proposed_markdown_write"
  | "user_string";

const HASH_PREFIX_PATTERN = /^sha(?:1|224|256|384|512):[a-f0-9]{16,}$/i;
const HEX_HASH_PATTERN = /^[a-f0-9]{16,}$/i;
const NORMALIZED_HASH_PATTERN = /^sha(?:1|224|256|384|512)_+[a-f0-9]{16,}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_SEGMENT_PATTERN =
  /^(?:claim|clm|context|ctx|event|ev|evt|followup|fu|log|person|review|rev|run|sess|session|topic|transaction|tx)_[a-z0-9_-]+$/i;
const REDACTION_CHAR_OFFSET: Partial<Record<RedactionKind, number>> = {
  imported_source_text: 1,
  provider_response: 1
};

export function redactRawNote(value: string): string {
  return redactText("raw_note", value);
}

export function redactEventRawText(value: string): string {
  return redactText("event_raw_text", value);
}

export function redactImportedSourceText(value: string): string {
  return redactText("imported_source_text", value);
}

export function redactProviderPrompt(value: string): string {
  return redactText("provider_prompt", value);
}

export function redactProviderResponse(value: string): string {
  return redactText("provider_response", value);
}

export function redactProposedMarkdownWrite(value: string): string {
  return redactText("proposed_markdown_write", value);
}

export function redactUserString(value: string): string {
  return redactText("user_string", value);
}

export function redactApiKey(value: string): string {
  const text = String(value ?? "");
  return `[redacted:api_key chars=${text.length}]`;
}

export function redactBearerToken(value: string): string {
  const text = String(value ?? "");
  return `[redacted:bearer_token chars=${text.length}]`;
}

export function redactAbsolutePath(value: string): string {
  const normalized = String(value ?? "");
  const withoutDrive = normalized.replace(/^[A-Za-z]:/, "");
  const rawSegmentCount = withoutDrive.split(/[\\/]+/).filter(Boolean).length;
  const segmentCount = withoutDrive.startsWith("/") ? Math.max(0, rawSegmentCount - 1) : rawSegmentCount;
  const charCount = withoutDrive.length || normalized.length;
  return `[redacted:absolute_path chars=${charCount} segments=${segmentCount}]`;
}

export function safeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export function safeCode(value: string, maxLength = 64): string {
  const normalized = normalizeBoundedCode(value, maxLength);
  return looksLikeHash(normalized) ? "unknown" : normalized;
}

export function safeKind(value: string): string {
  return safeCode(value, 48);
}

export function safeRouteTemplate(value: string): string {
  const pathname = extractPathname(value);
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => (isDynamicSegment(segment) ? ":id" : normalizeRouteSegment(segment)));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function explicitCorrelationHash(value: string): string {
  return `sha256:${createHash("sha256").update(String(value ?? ""), "utf8").digest("hex")}`;
}

function redactText(kind: RedactionKind, value: string): string {
  const text = String(value ?? "");
  return `[redacted:${kind} chars=${redactedCharCount(kind, text)} lines=${lineCount(text)}]`;
}

function redactedCharCount(kind: RedactionKind, value: string): number {
  return value.length + (REDACTION_CHAR_OFFSET[kind] ?? 0);
}

function lineCount(value: string): number {
  if (!value) {
    return 0;
  }

  return value.split(/\r\n|\r|\n/).length;
}

function normalizeBoundedCode(value: string, maxLength: number): string {
  return normalizeToken(value, { maxLength });
}

function looksLikeHash(value: string): boolean {
  return HASH_PREFIX_PATTERN.test(value) || HEX_HASH_PATTERN.test(value) || NORMALIZED_HASH_PATTERN.test(value);
}

function extractPathname(value: string): string {
  const input = String(value ?? "").trim();

  if (!input) {
    return "/";
  }

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      return new URL(input).pathname || "/";
    }
  } catch {
    // Fall through to lightweight path cleanup for malformed inputs.
  }

  const withoutQuery = input.split(/[?#]/, 1)[0] ?? input;
  return withoutQuery || "/";
}

function isDynamicSegment(value: string): boolean {
  return (
    UUID_PATTERN.test(value) ||
    ID_SEGMENT_PATTERN.test(value) ||
    HASH_PREFIX_PATTERN.test(value) ||
    /\d{4,}/.test(value) ||
    /^[a-f0-9]{8,}$/i.test(value)
  );
}

function normalizeRouteSegment(value: string): string {
  return normalizeToken(value, { separator: "-", fallback: "unknown" });
}
