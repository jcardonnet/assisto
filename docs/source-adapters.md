# Source Adapters

Source adapters normalize external material into Assisto's Event-first mutation loop.

They may handle Markdown/text imports, pasted notes, web clippings, document parser output, email/chat excerpts, calendar notes, code/project artifacts, and curated transcript excerpts.

## SourceAdapterOutput

```ts
type SourceAdapterOutput = {
  adapterId: string;
  sourceLabel: string;
  sourceHash: string;
  observedAt?: string;
  rawText: string;
  units: SourceUnit[];
  parserNotes: string[];
};
```

## SourceUnit

```ts
type SourceUnit = {
  unitId: string;
  rawText: string;
  sourceSpan?: {
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    page?: number;
    timestampStart?: string;
    timestampEnd?: string;
  };
  suggestedEventMetadata: Record<string, unknown>;
};
```

## Rules

- Preserve raw text.
- Use `source_hash` for duplicate detection.
- Preserve `observed_at` and `source_label` when known.
- Include parser notes when extraction is uncertain.
- Keep source spans as evidence metadata.
- Kept units create Events plus pending Transactions.
- Skipped duplicates do not write Events.
- Adapters never write Person, Topic, Context, FollowUp, or ReviewItem pages directly.

## Curated Transcript Boundary

Assisto supports curated transcript excerpts or reviewed transcript sections. Full transcript ingestion remains out of scope unless designed as a separate high-volume workflow with chunking, source-span provenance, review-load forecasting, duplicate detection, and explicit user confirmation.
