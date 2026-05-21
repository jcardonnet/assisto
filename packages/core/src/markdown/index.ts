import type { ClaimBlock } from "../model";

export type FrontmatterValue = string | boolean | null | FrontmatterValue[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedMarkdownFile {
  frontmatter: Frontmatter;
  body: string;
}

export interface ParsedClaimBlockRecord {
  fields: Record<string, FrontmatterValue>;
  line: number;
}

interface SectionRange {
  headingIndex: number;
  contentStartIndex: number;
  contentEndIndex: number;
  level: number;
  headingText: string;
}

type ParsedScalar = string | boolean | null | ParsedScalar[];

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const frontmatterDelimiter = "---";

export function parseMarkdownFile(content: string): ParsedMarkdownFile {
  const normalized = normalizeNewlines(content);
  const lines = normalized.split("\n");

  if (lines[0]?.trim() !== frontmatterDelimiter) {
    return {
      frontmatter: {},
      body: normalized.trimStart()
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === frontmatterDelimiter);

  if (closingIndex === -1) {
    throw new Error("Markdown frontmatter is missing a closing delimiter.");
  }

  const frontmatterText = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n").replace(/^\n/, "");

  return {
    frontmatter: parseSimpleYamlMap(frontmatterText),
    body
  };
}

export function serializeMarkdownFile(frontmatter: Frontmatter, body: string): string {
  const serializedFrontmatter = serializeSimpleYamlMap(frontmatter);
  const normalizedBody = normalizeNewlines(body).trimEnd();

  return `---\n${serializedFrontmatter}---\n\n${normalizedBody}\n`;
}

export function parseWikilinks(body: string): string[] {
  const links = new Set<string>();
  const wikilinkPattern = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = wikilinkPattern.exec(body)) !== null) {
    const rawLink = match[1] ?? "";
    const target = rawLink.split("|")[0]?.trim();

    if (target) {
      links.add(target);
    }
  }

  return [...links];
}

export function parseClaimBlocks(body: string): ClaimBlock[] {
  return parseClaimBlockRecords(body).map((record) => toClaimBlock(record.fields));
}

export function parseClaimBlockRecords(body: string): ParsedClaimBlockRecord[] {
  const lines = normalizeNewlines(body).split("\n");
  const claims: ParsedClaimBlockRecord[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const claimStart = /^(\s*)-\s+claim_id:\s*(.+?)\s*$/.exec(line);

    if (!claimStart) {
      index += 1;
      continue;
    }

    const lineNumber = index + 1;
    const baseIndent = claimStart[1]?.length ?? 0;
    const rawClaim: Record<string, FrontmatterValue> = {
      claim_id: toFrontmatterValue(parseScalar(claimStart[2] ?? ""))
    };
    index += 1;

    while (index < lines.length) {
      const currentLine = lines[index] ?? "";

      if (headingPattern.test(currentLine)) {
        break;
      }

      if (isSiblingBullet(currentLine, baseIndent)) {
        break;
      }

      const fieldMatch = /^\s+([A-Za-z0-9_]+):(?:\s*(.*))?$/.exec(currentLine);

      if (fieldMatch) {
        const key = fieldMatch[1] ?? "";
        const value = fieldMatch[2] ?? "";
        rawClaim[key] = toFrontmatterValue(parseScalar(value));
      }

      index += 1;
    }

    claims.push({
      fields: rawClaim,
      line: lineNumber
    });
  }

  return claims;
}

export function getSection(body: string, heading: string): string | null {
  const lines = normalizeNewlines(body).split("\n");
  const range = findSectionRange(lines, heading);

  if (!range) {
    return null;
  }

  return lines.slice(range.contentStartIndex, range.contentEndIndex).join("\n").trim();
}

export function replaceSection(body: string, heading: string, newContent: string): string {
  const normalizedBody = normalizeNewlines(body).trimEnd();
  const lines = normalizedBody ? normalizedBody.split("\n") : [];
  const range = findSectionRange(lines, heading);
  const normalizedContent = normalizeNewlines(newContent).trim();
  const contentLines = normalizedContent ? ["", ...normalizedContent.split("\n"), ""] : [""];

  if (!range) {
    const headingLine = normalizeHeadingForAppend(heading);
    const separator = normalizedBody ? "\n\n" : "";
    const sectionBody = normalizedContent ? `\n\n${normalizedContent}` : "";

    return `${normalizedBody}${separator}${headingLine}${sectionBody}\n`;
  }

  const nextLines = [
    ...lines.slice(0, range.contentStartIndex),
    ...contentLines,
    ...lines.slice(range.contentEndIndex)
  ];

  return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function appendToSection(body: string, heading: string, content: string): string {
  const existingContent = getSection(body, heading);
  const normalizedContent = normalizeNewlines(content).trim();

  if (!existingContent) {
    return replaceSection(body, heading, normalizedContent);
  }

  return replaceSection(body, heading, `${existingContent.trimEnd()}\n\n${normalizedContent}`);
}

function parseSimpleYamlMap(yaml: string): Frontmatter {
  const lines = normalizeNewlines(yaml).split("\n");
  const result: Frontmatter = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);

    if (!keyMatch) {
      index += 1;
      continue;
    }

    const key = keyMatch[1] ?? "";
    const value = keyMatch[2] ?? "";

    if (value !== "") {
      result[key] = toFrontmatterValue(parseScalar(value));
      index += 1;
      continue;
    }

    const listItems: FrontmatterValue[] = [];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const listMatch = /^\s+-\s*(.*)$/.exec(lines[cursor] ?? "");

      if (!listMatch) {
        break;
      }

      listItems.push(toFrontmatterValue(parseScalar(listMatch[1] ?? "")));
      cursor += 1;
    }

    result[key] = listItems.length > 0 ? listItems : null;
    index = cursor;
  }

  return result;
}

function serializeSimpleYamlMap(frontmatter: Frontmatter): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => serializeYamlEntry(key, value))
    .join("");
}

function serializeYamlEntry(key: string, value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${key}: []\n`;
    }

    const items = value.map((item) => `  - ${serializeScalar(item)}\n`).join("");
    return `${key}:\n${items}`;
  }

  return `${key}: ${serializeScalar(value)}\n`;
}

function parseScalar(rawValue: string): ParsedScalar {
  const value = rawValue.trim();

  if (value === "null" || value === "~") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "[]") {
    return [];
  }

  if (value.startsWith("[[") && value.endsWith("]]")) {
    return value;
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();

    if (!inner) {
      return [];
    }

    return splitInlineArray(inner).map(parseScalar);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function serializeScalar(value: FrontmatterValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeScalar).join(", ")}]`;
  }

  if (value === "") {
    return '""';
  }

  return value;
}

function splitInlineArray(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of value) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      current += char;
      continue;
    }

    if (char === quote) {
      quote = null;
      current += char;
      continue;
    }

    if (char === "," && quote === null) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function toFrontmatterValue(value: ParsedScalar): FrontmatterValue {
  if (Array.isArray(value)) {
    return value.map(toFrontmatterValue);
  }

  return value;
}

function toClaimBlock(rawClaim: Record<string, FrontmatterValue>): ClaimBlock {
  return {
    claim_id: requiredString(rawClaim, "claim_id"),
    statement: requiredString(rawClaim, "statement"),
    claim_kind: requiredString(rawClaim, "claim_kind") as ClaimBlock["claim_kind"],
    claim_state: requiredString(rawClaim, "claim_state") as ClaimBlock["claim_state"],
    evidence_strength: requiredString(
      rawClaim,
      "evidence_strength"
    ) as ClaimBlock["evidence_strength"],
    scope: optionalStringOrNull(rawClaim, "scope"),
    scope_state: requiredString(rawClaim, "scope_state") as ClaimBlock["scope_state"],
    evidence: requiredStringArray(rawClaim, "evidence"),
    recorded_at: requiredString(rawClaim, "recorded_at"),
    observed_at: optionalStringOrNull(rawClaim, "observed_at"),
    valid_from: optionalStringOrNull(rawClaim, "valid_from"),
    valid_to: optionalStringOrNull(rawClaim, "valid_to")
  };
}

function requiredString(record: Record<string, FrontmatterValue>, key: string): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new Error(`Claim block is missing string field: ${key}.`);
  }

  return value;
}

function optionalStringOrNull(record: Record<string, FrontmatterValue>, key: string): string | null {
  const value = record[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Claim block field must be a string or null: ${key}.`);
  }

  return value;
}

function requiredStringArray(record: Record<string, FrontmatterValue>, key: string): string[] {
  const value = record[key];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Claim block is missing string array field: ${key}.`);
  }

  return value as string[];
}

function isSiblingBullet(line: string, baseIndent: number): boolean {
  const siblingPattern = new RegExp(`^\\s{0,${baseIndent}}-\\s+`);
  return siblingPattern.test(line);
}

function findSectionRange(lines: string[], heading: string): SectionRange | null {
  const requested = parseRequestedHeading(heading);

  for (let index = 0; index < lines.length; index += 1) {
    const current = parseHeadingLine(lines[index] ?? "");

    if (!current) {
      continue;
    }

    if (current.headingText !== requested.headingText) {
      continue;
    }

    if (requested.level !== null && current.level !== requested.level) {
      continue;
    }

    let contentEndIndex = lines.length;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextHeading = parseHeadingLine(lines[cursor] ?? "");

      if (nextHeading && nextHeading.level <= current.level) {
        contentEndIndex = cursor;
        break;
      }
    }

    return {
      headingIndex: index,
      contentStartIndex: index + 1,
      contentEndIndex,
      level: current.level,
      headingText: current.headingText
    };
  }

  return null;
}

function parseRequestedHeading(heading: string): { level: number | null; headingText: string } {
  const parsed = parseHeadingLine(heading.trim());

  if (parsed) {
    return parsed;
  }

  return {
    level: null,
    headingText: normalizeHeadingText(heading)
  };
}

function parseHeadingLine(line: string): { level: number; headingText: string } | null {
  const match = headingPattern.exec(line.trim());

  if (!match) {
    return null;
  }

  return {
    level: match[1]?.length ?? 0,
    headingText: normalizeHeadingText(match[2] ?? "")
  };
}

function normalizeHeadingForAppend(heading: string): string {
  if (parseHeadingLine(heading.trim())) {
    return heading.trim();
  }

  return `## ${normalizeHeadingText(heading)}`;
}

function normalizeHeadingText(heading: string): string {
  return heading.trim().replace(/\s+/g, " ");
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
