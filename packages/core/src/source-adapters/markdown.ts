import type { SourceAdapterInput, SourceAdapterKind, SourceAdapterParsedUnit, SourceSpan } from "./index";

export interface SourceLineRecord {
  text: string;
  line: number;
  offset: number;
  newline: string;
}

export function collectMarkdownSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  return splitDelimitedSourceUnits(input, input.kind === "text" ? "text" : "markdown");
}

export function splitDelimitedSourceUnits(
  input: SourceAdapterInput,
  kind: Extract<SourceAdapterKind, "markdown" | "text">
): SourceAdapterParsedUnit[] {
  const text = input.rawText ?? "";
  const units: SourceAdapterParsedUnit[] = [];
  const current: SourceLineRecord[] = [];
  const lines = sourceLines(text);

  for (const line of lines) {
    const lineText = line.text;

    if (/^\s*---\s*$/.test(lineText)) {
      pushDelimitedUnit(units, current, input, kind);
      current.length = 0;
    } else {
      current.push(line);
    }
  }

  pushDelimitedUnit(units, current, input, kind);
  return units;
}

function pushDelimitedUnit(
  units: SourceAdapterParsedUnit[],
  lines: SourceLineRecord[],
  input: SourceAdapterInput,
  kind: Extract<SourceAdapterKind, "markdown" | "text">
): void {
  const firstContentIndex = lines.findIndex((line) => line.text.trim().length > 0);

  if (firstContentIndex === -1) {
    return;
  }

  let lastContentIndex = lines.length - 1;

  while (lastContentIndex >= firstContentIndex && (lines[lastContentIndex]?.text.trim().length ?? 0) === 0) {
    lastContentIndex -= 1;
  }

  const kept = lines.slice(firstContentIndex, lastContentIndex + 1);
  const rawText = kept.map((line) => line.text).join("\n").trim();

  if (!rawText) {
    return;
  }

  const first = kept[0];
  const last = kept[kept.length - 1];

  if (!first || !last) {
    return;
  }

  const unitNumber = units.length + 1;
  units.push({
    raw_text: rawText,
    source_label: input.source_label ?? input.path ?? `${kind} import`,
    observed_at: input.observed_at ?? null,
    contexts: contextsFromInput(input),
    metadata: {},
    source_spans: [
      {
        ...(input.path ? { source_path: input.path } : {}),
        start_line: first.line,
        end_line: last.line,
        start_offset: first.offset + leadingWhitespace(first.text),
        end_offset: last.offset + last.text.length - trailingWhitespace(last.text),
        label: `${kind} unit ${unitNumber}`
      }
    ]
  });
}

export function contextsFromInput(input: SourceAdapterInput): string[] {
  const value = input.context?.trim();
  return value ? [value] : [];
}

export function wholeInputSpan(input: SourceAdapterInput, label: string): SourceSpan[] {
  const text = input.rawText ?? "";
  const lines = sourceLines(text);
  return [
    {
      ...(input.path ? { source_path: input.path } : {}),
      start_line: 1,
      end_line: Math.max(1, lines.length),
      start_offset: 0,
      end_offset: text.length,
      label
    }
  ];
}

export function sourceLines(text: string): SourceLineRecord[] {
  const lines: SourceLineRecord[] = [];
  let offset = 0;
  let line = 1;

  while (offset <= text.length) {
    const newline = nextNewline(text, offset);

    if (!newline) {
      lines.push({
        text: text.slice(offset),
        line,
        offset,
        newline: ""
      });
      break;
    }

    lines.push({
      text: text.slice(offset, newline.index),
      line,
      offset,
      newline: newline.value
    });
    offset = newline.index + newline.value.length;
    line += 1;

    if (offset === text.length) {
      lines.push({
        text: "",
        line,
        offset,
        newline: ""
      });
      break;
    }
  }

  return lines;
}

export function normalizeAdapterObservedAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const isoDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const isoDateTimeMatch = /^\d{4}-\d{2}-\d{2}T/.test(trimmed);
  const calendarMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(trimmed);

  if (calendarMatch) {
    return `${calendarMatch[1]}-${calendarMatch[2]}-${calendarMatch[3]}T${calendarMatch[4]}:${calendarMatch[5]}:${calendarMatch[6]}Z`;
  }

  const chatMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(trimmed);

  if (chatMatch) {
    return `${chatMatch[1]}T${chatMatch[2]}:${chatMatch[3] ?? "00"}Z`;
  }

  if (isoDateMatch || isoDateTimeMatch) {
    return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
  }

  if (!Number.isNaN(Date.parse(trimmed))) {
    return new Date(trimmed).toISOString();
  }

  return null;
}

function nextNewline(text: string, offset: number): { index: number; value: string } | undefined {
  for (let index = offset; index < text.length; index += 1) {
    const char = text[index];

    if (char === "\n") {
      return { index, value: "\n" };
    }

    if (char === "\r") {
      return {
        index,
        value: text[index + 1] === "\n" ? "\r\n" : "\r"
      };
    }
  }

  return undefined;
}

function leadingWhitespace(value: string): number {
  return /^\s*/.exec(value)?.[0].length ?? 0;
}

function trailingWhitespace(value: string): number {
  return /\s*$/.exec(value)?.[0].length ?? 0;
}
