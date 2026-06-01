import type { SourceAdapterInput, SourceAdapterParsedUnit, SourceSpan } from "./index";
import { collectCalendarSourceUnits } from "./calendar";
import { collectEmailSourceUnits } from "./email";
import { contextsFromInput, normalizeAdapterObservedAt, sourceLines, wholeInputSpan } from "./markdown";

interface MessageRecord {
  sender: string;
  text: string;
  observed_at: string | null;
  metadata: Record<string, string>;
}

export function collectMboxSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const rawText = input.rawText ?? "";
  const blocks = splitMboxMessages(rawText);
  const messages = blocks.length > 0 ? blocks : [{ rawText, sourceSpan: wholeInputSpan(input, "mbox message")[0] }];

  return messages.flatMap((block, index) =>
    collectEmailSourceUnits({
      ...input,
      rawText: block.rawText,
      source_label: input.source_label ?? input.path ?? "mbox message " + (index + 1)
    }).map((unit) => ({
      ...unit,
      source_spans: block.sourceSpan ? [{ ...block.sourceSpan, label: "mbox message " + (index + 1) }] : unit.source_spans
    }))
  );
}

export function collectIcsSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  return collectCalendarSourceUnits(input).map((unit) => ({
    ...unit,
    metadata: { ...unit.metadata, export_kind: "ics" }
  }));
}

export function collectSlackJsonSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  return collectJsonMessageUnits(input, "slack_json", (record) => ({
    sender: stringValue(record.user_name) ?? stringValue(record.username) ?? stringValue(record.user) ?? "Slack user",
    text: stringValue(record.text) ?? stringValue(record.message) ?? "",
    observed_at: normalizeAdapterObservedAt(stringValue(record.ts) ?? stringValue(record.timestamp) ?? stringValue(record.datetime)),
    metadata: compactMetadata({
      platform: "slack",
      channel: stringValue(record.channel_name) ?? stringValue(record.channel),
      user: stringValue(record.user),
      thread_ts: stringValue(record.thread_ts),
      ts: stringValue(record.ts) ?? stringValue(record.timestamp)
    })
  }));
}

export function collectTeamsJsonSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  return collectJsonMessageUnits(input, "teams_json", (record) => {
    const body = objectValue(record.body);
    const from = objectValue(record.from);
    const user = objectValue(from?.user) ?? objectValue(from?.application);

    return {
      sender: stringValue(record.sender) ?? stringValue(record.from) ?? stringValue(user?.displayName) ?? "Teams user",
      text: stringValue(record.text) ?? stringValue(record.content) ?? stringValue(body?.content) ?? "",
      observed_at: normalizeAdapterObservedAt(stringValue(record.createdDateTime) ?? stringValue(record.timestamp)),
      metadata: compactMetadata({
        platform: "teams",
        chat_id: stringValue(record.chatId) ?? stringValue(record.chat_id),
        message_id: stringValue(record.id),
        content_type: stringValue(body?.contentType)
      })
    };
  });
}

export function collectGithubJsonSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const values = flattenJsonRecords(parseJsonInput(input.rawText ?? ""), ["issues", "pull_requests", "comments", "events", "items"]);

  return values.flatMap((value, index) => {
    const record = objectValue(value);

    if (!record) {
      return [];
    }

    const user = objectValue(record.user) ?? objectValue(record.author);
    const title = stringValue(record.title) ?? stringValue(record.subject);
    const body = stringValue(record.body) ?? stringValue(record.comment) ?? stringValue(record.message) ?? "";
    const text = [title, body].filter(Boolean).join("\n\n").trim();

    if (!text) {
      return [];
    }

    return [
      {
        raw_text: text,
        source_label: input.source_label ?? title ?? input.path ?? "github item " + (index + 1),
        observed_at: input.observed_at ?? normalizeAdapterObservedAt(stringValue(record.updated_at) ?? stringValue(record.created_at)),
        contexts: contextsFromInput(input),
        metadata: compactMetadata({
          platform: "github",
          number: stringValue(record.number),
          state: stringValue(record.state),
          type: stringValue(record.type),
          author: stringValue(user?.login) ?? stringValue(user?.name),
          url: stringValue(record.html_url) ?? stringValue(record.url)
        }),
        source_spans: wholeInputSpan(input, "github item " + (index + 1))
      }
    ];
  });
}

export function collectTrackerCsvSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const rows = parseCsv(input.rawText ?? "");

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...records] = rows;
  const safeHeaders = headers?.map((header, index) => header.trim() || "column_" + (index + 1)) ?? [];
  const lines = sourceLines(input.rawText ?? "");

  return records.flatMap((record, index) => {
    const metadata: Record<string, string> = {};

    for (let column = 0; column < safeHeaders.length; column += 1) {
      metadata[safeHeaders[column] ?? "column_" + (column + 1)] = record[column] ?? "";
    }

    const rawText = safeHeaders
      .map((header, column) => header + ": " + (record[column] ?? ""))
      .filter((line) => !/:\s*$/.test(line))
      .join("\n")
      .trim();

    if (!rawText) {
      return [];
    }

    const line = lines[index + 1] ?? lines[0];
    const sourceSpan: SourceSpan = line
      ? {
          ...(input.path ? { source_path: input.path } : {}),
          start_line: line.line,
          end_line: line.line,
          start_offset: line.offset,
          end_offset: line.offset + line.text.length,
          label: "tracker row " + (index + 1)
        }
      : wholeInputSpan(input, "tracker row " + (index + 1))[0] ?? { label: "tracker row " + (index + 1) };

    return [
      {
        raw_text: rawText,
        source_label: input.source_label ?? metadata.title ?? metadata.summary ?? metadata.key ?? input.path ?? "tracker row " + (index + 1),
        observed_at: input.observed_at ?? normalizeAdapterObservedAt(metadata.updated_at ?? metadata.created_at ?? metadata.date ?? metadata.due_date),
        contexts: contextsFromInput(input),
        metadata: compactMetadata({ ...metadata, export_kind: "tracker_csv" }),
        source_spans: [sourceSpan]
      }
    ];
  });
}

function collectJsonMessageUnits(
  input: SourceAdapterInput,
  label: string,
  projector: (record: Record<string, unknown>) => MessageRecord
): SourceAdapterParsedUnit[] {
  const values = flattenJsonRecords(parseJsonInput(input.rawText ?? ""), ["messages", "items", "records"]);

  return values.flatMap((value, index) => {
    const record = objectValue(value);

    if (!record) {
      return [];
    }

    const projected = projector(record);
    const text = projected.text.trim();

    if (!text) {
      return [];
    }

    return [
      {
        raw_text: projected.sender + ": " + text,
        source_label: input.source_label ?? input.path ?? label + " message " + (index + 1),
        observed_at: input.observed_at ?? projected.observed_at,
        contexts: contextsFromInput(input),
        metadata: projected.metadata,
        source_spans: wholeInputSpan(input, label + " message " + (index + 1))
      }
    ];
  });
}

function splitMboxMessages(rawText: string): Array<{ rawText: string; sourceSpan?: SourceSpan }> {
  const lines = sourceLines(rawText);
  const starts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^From\s+\S+/.test(lines[index]?.text ?? "")) {
      starts.push(index);
    }
  }

  if (starts.length === 0) {
    return [];
  }

  const blocks: Array<{ rawText: string; sourceSpan: SourceSpan }> = [];

  for (let startIndex = 0; startIndex < starts.length; startIndex += 1) {
    const start = lines[(starts[startIndex] ?? 0) + 1] ?? lines[starts[startIndex] ?? 0];
    const nextStart = starts[startIndex + 1];
    const end = nextStart === undefined ? lines[lines.length - 1] : lines[nextStart - 1];

    if (!start || !end) {
      continue;
    }

    const text = rawText.slice(start.offset, end.offset + end.text.length).trim();

    if (!text) {
      continue;
    }

    blocks.push({
      rawText: text,
      sourceSpan: {
        start_line: start.line,
        end_line: end.line,
        start_offset: start.offset,
        end_offset: end.offset + end.text.length,
        label: "mbox message " + (blocks.length + 1)
      }
    });
  }

  return blocks;
}

function parseJsonInput(rawText: string): unknown {
  if (!rawText.trim()) {
    return [];
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return [];
  }
}

function flattenJsonRecords(value: unknown, collectionKeys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const object = objectValue(value);

  if (!object) {
    return [];
  }

  for (const key of collectionKeys) {
    const nested = object[key];

    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [object];
}

function parseCsv(rawText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const next = rawText[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char ?? "";
  }

  row.push(field);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function compactMetadata(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
