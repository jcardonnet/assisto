import type { SourceAdapterInput, SourceAdapterParsedUnit } from "./index";
import { contextsFromInput, normalizeAdapterObservedAt, sourceLines, wholeInputSpan } from "./markdown";

export function collectChatSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const rawText = input.rawText ?? "";
  const units: SourceAdapterParsedUnit[] = [];
  const lines = sourceLines(rawText);

  for (const line of lines) {
    const match = /^\[([^\]]+)\]\s+([^:]+):\s*(.+?)\s*$/.exec(line.text);

    if (!match) {
      continue;
    }

    const sender = (match[2] ?? "").trim();
    const message = (match[3] ?? "").trim();
    const rawUnitText = `${sender}: ${message}`;

    units.push({
      raw_text: rawUnitText,
      source_label: input.source_label ?? input.path ?? "chat import",
      observed_at: input.observed_at ?? normalizeAdapterObservedAt(match[1]),
      contexts: contextsFromInput(input),
      metadata: {
        timestamp: match[1] ?? "",
        sender
      },
      source_spans: [
        {
          ...(input.path ? { source_path: input.path } : {}),
          start_line: line.line,
          end_line: line.line,
          start_offset: line.offset,
          end_offset: line.offset + line.text.length,
          label: `chat message ${units.length + 1}`
        }
      ]
    });
  }

  if (units.length > 0) {
    return units;
  }

  const trimmed = rawText.trim();

  if (!trimmed) {
    return [];
  }

  return [
    {
      raw_text: trimmed,
      source_label: input.source_label ?? input.path ?? "chat import",
      observed_at: input.observed_at ?? null,
      contexts: contextsFromInput(input),
      metadata: {},
      source_spans: wholeInputSpan(input, "chat transcript")
    }
  ];
}
