import type { SourceAdapterInput, SourceAdapterParsedUnit, SourceSpan } from "./index";
import { contextsFromInput, normalizeAdapterObservedAt, sourceLines, wholeInputSpan } from "./markdown";

interface CalendarBlock {
  rawText: string;
  sourceSpan: SourceSpan;
}

export function collectCalendarSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const rawText = (input.rawText ?? "").trim();

  if (!rawText) {
    return [];
  }

  return calendarBlocks(input).map((block, index) => {
    const metadata = calendarMetadata(block.rawText);

    return {
      raw_text: block.rawText,
      source_label: input.source_label ?? metadata.summary ?? input.path ?? `calendar event ${index + 1}`,
      observed_at: input.observed_at ?? normalizeAdapterObservedAt(metadata.dtstart),
      contexts: contextsFromInput(input),
      metadata,
      source_spans: [block.sourceSpan]
    };
  });
}

function calendarBlocks(input: SourceAdapterInput): CalendarBlock[] {
  const rawText = input.rawText ?? "";
  const lines = sourceLines(rawText);
  const blocks: CalendarBlock[] = [];
  let startIndex: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line) {
      continue;
    }

    if (/^BEGIN:VEVENT\s*$/i.test(line.text)) {
      startIndex = index;
    }

    if (startIndex !== undefined && /^END:VEVENT\s*$/i.test(line.text)) {
      const start = lines[startIndex];
      const end = line;

      if (start) {
        blocks.push({
          rawText: rawText.slice(start.offset, end.offset + end.text.length).trim(),
          sourceSpan: {
            ...(input.path ? { source_path: input.path } : {}),
            start_line: start.line,
            end_line: end.line,
            start_offset: start.offset,
            end_offset: end.offset + end.text.length,
            label: `calendar event ${blocks.length + 1}`
          }
        });
      }

      startIndex = undefined;
    }
  }

  if (blocks.length > 0) {
    return blocks;
  }

  return [
    {
      rawText: rawText.trim(),
      sourceSpan: wholeInputSpan(input, "calendar event")[0] ?? { label: "calendar event" }
    }
  ];
}

function calendarMetadata(rawText: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const line of rawText.split(/\r?\n/)) {
    const match = /^(SUMMARY|DTSTART|ATTENDEE)(?:;[^:]*)?:(.+?)\s*$/i.exec(line);

    if (match) {
      metadata[(match[1] ?? "").toLowerCase()] = (match[2] ?? "").trim();
    }
  }

  return metadata;
}
