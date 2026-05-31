import type { SourceAdapterInput, SourceAdapterParsedUnit } from "./index";
import { contextsFromInput, normalizeAdapterObservedAt, wholeInputSpan } from "./markdown";

export function collectEmailSourceUnits(input: SourceAdapterInput): SourceAdapterParsedUnit[] {
  const rawText = input.rawText ?? "";
  const lines = rawText.split(/\r?\n/);
  const metadata: Record<string, string> = {};
  const keptLines: string[] = [];

  for (const line of lines) {
    if (/^\s*>/.test(line)) {
      continue;
    }

    const header = /^(From|To|Date|Subject):\s*(.+?)\s*$/i.exec(line);

    if (header) {
      metadata[(header[1] ?? "").toLowerCase()] = header[2] ?? "";
    }

    keptLines.push(line);
  }

  const unitText = keptLines.join("\n").trim();

  if (!unitText) {
    return [];
  }

  return [
    {
      raw_text: unitText,
      source_label: input.source_label ?? metadata.subject ?? input.path ?? "email import",
      observed_at: input.observed_at ?? normalizeAdapterObservedAt(metadata.date),
      contexts: contextsFromInput(input),
      metadata,
      source_spans: wholeInputSpan(input, "email message")
    }
  ];
}
