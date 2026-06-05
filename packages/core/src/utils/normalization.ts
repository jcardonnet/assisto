export type TokenSeparator = "_" | "-" | ".";

export interface NormalizeTokenOptions {
  separator?: TokenSeparator;
  fallback?: string;
  maxLength?: number;
}

export function scalarString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

export function normalizeToken(value: unknown, options: NormalizeTokenOptions = {}): string {
  const separator = options.separator ?? "_";
  const fallback = options.fallback ?? "unknown";
  let output = "";
  let pendingSeparator = false;

  for (const char of String(value ?? "").trim().toLowerCase()) {
    if (isAsciiAlphaNumeric(char)) {
      if (pendingSeparator && output) {
        output += separator;
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  const bounded = options.maxLength === undefined ? output : output.slice(0, options.maxLength);
  return bounded || fallback;
}

export function safeStatusClass(value: unknown): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    return "unknown";
  }

  return String(Math.floor(value / 100)) + "xx";
}

export function isAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
