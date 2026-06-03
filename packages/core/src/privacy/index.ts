import { createHash } from "node:crypto";

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
  /^(?:ev|tx|ctx|fu|rev|log|run|sess|session)_[a-z0-9_-]+$/i;

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
  return `[redacted:api_key chars=${stringLength(value)}]`;
}

export function redactBearerToken(value: string): string {
  return `[redacted:bearer_token chars=${stringLength(value)}]`;
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

export function safeStatusClass(value: number): string {
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    return "unknown";
  }

  return `${Math.floor(value / 100)}xx`;
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
  const baseLength = stringLength(value);
  if (kind === "imported_source_text" || kind === "provider_response") {
    return baseLength + 1;
  }

  return baseLength;
}

function stringLength(value: string): number {
  return String(value ?? "").length;
}

function lineCount(value: string): number {
  if (!value) {
    return 0;
  }

  return value.split(/\r\n|\r|\n/).length;
}

function normalizeBoundedCode(value: string, maxLength: number): string {
  const normalized = normalizeSeparatedToken(value, "_", isAsciiAlphaNumeric);

  if (!normalized) {
    return "unknown";
  }

  return normalized.slice(0, maxLength) || "unknown";
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
    /[0-9]{4,}/.test(value) ||
    /^[a-f0-9]{8,}$/i.test(value)
  );
}

function normalizeRouteSegment(value: string): string {
  return normalizeSeparatedToken(value, "-", isAsciiAlphaNumeric) || "unknown";
}

function normalizeSeparatedToken(
  value: string,
  separator: "_" | "-",
  isAllowed: (char: string) => boolean
): string {
  let output = "";
  let pendingSeparator = false;

  for (const char of String(value ?? "").trim().toLowerCase()) {
    if (isAllowed(char)) {
      if (pendingSeparator && output) {
        output += separator;
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  return output;
}

function isAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
