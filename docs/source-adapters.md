# Source Adapters

Source adapters normalize external source material into Assisto source-preserving import units. They are an adapter layer over the safe compiler core:

```text
Raw input -> Event -> Candidate claims -> Transaction -> Validated mutation or staged review -> Current pages
```

Adapters may parse Markdown/text batches, pasted notes, email excerpts, calendar events, chat excerpts, and local export files such as EML/MBOX, ICS, Slack/Teams JSON, GitHub JSON, tracker CSV, and repo Markdown. They do not write current Person, Topic, Context, FollowUp, ReviewItem, index, vector, graph, MCP, or generated-answer state directly.

## Public Contract

```ts
export type SourceAdapterKind = "markdown" | "text" | "email" | "calendar" | "chat" | "eml" | "mbox" | "ics" | "slack_json" | "teams_json" | "github_json" | "tracker_csv" | "repo_markdown";
export interface SourceSpan { source_path?: string; start_line?: number; end_line?: number; start_offset?: number; end_offset?: number; label?: string; }
export interface SourceAdapterInput { kind: SourceAdapterKind; root: string; path?: string; rawText?: string; source_label?: string; observed_at?: string; context?: string; limit?: number; dryRun?: boolean; }
export interface SourceAdapterUnit { unit_id: string; adapter_kind: SourceAdapterKind; raw_text: string; source_label: string; source_hash: string; observed_at: string | null; contexts: string[]; source_spans: SourceSpan[]; metadata: Record<string, string>; duplicate_state: "new" | "duplicate"; skip_reason?: string; }
export interface SourceAdapterPreviewResult { adapter_kind: SourceAdapterKind; units: SourceAdapterUnit[]; review_load_forecast: { total_units: number; likely_safe: number; likely_staged: number; likely_conflict: number; duplicates: number; }; warnings: string[]; }
export interface SourceAdapterCreateResult extends SourceAdapterPreviewResult { created_events: string[]; pending_transactions: string[]; }
```

## Adapter Behavior

- Markdown and text split batches on lines containing only `---`; empty units are skipped.
- Email parses `From`, `To`, `Date`, and `Subject` headers when present, and strips quoted lines beginning with `>`.
- Calendar parses `SUMMARY`, `DTSTART`, and `ATTENDEE` fields when present.
- Chat parses lines like `[2026-05-31 09:10] Name: message` into one unit per message.
- Export aliases parse local files only: `eml` uses the email parser, `mbox` splits mailbox exports into email units, and `ics` uses the calendar parser.
- `slack_json` and `teams_json` parse exported message arrays or objects with `messages`, `items`, or `records`.
- `github_json` parses issue/comment-style JSON arrays or objects with `issues`, `pull_requests`, `comments`, `events`, or `items`.
- `tracker_csv` converts each CSV row into a labeled source unit with row metadata.
- `repo_markdown` uses Markdown splitting while preserving its adapter kind for repo documentation imports.
- Every kept unit preserves raw unit text, `source_label`, optional `observed_at`, contexts, metadata, source spans, and a `sha256:<hex>` `source_hash`.
- Duplicate detection scans existing Event frontmatter for `source_hash`; duplicate units are skipped and do not create Events.

## Write Boundary

Preview is read-only. Create writes one Event plus one pending Transaction per kept nonduplicate unit through the existing ingestion path with `apply: false`.

The Event preserves source metadata. The pending Transaction may propose current-page mutations for review, but adapters themselves never apply Transactions and never edit current pages directly.

## CLI And Workbench

Minimal CLI support:

```bash
wm source preview --kind <markdown|text|email|calendar|chat|eml|mbox|ics|slack_json|teams_json|github_json|tracker_csv|repo_markdown> (--path <file> | --stdin) [--json]
wm source import --kind <markdown|text|email|calendar|chat|eml|mbox|ics|slack_json|teams_json|github_json|tracker_csv|repo_markdown> (--path <file> | --stdin) [--dry-run] [--json]
```

Minimal Workbench JSON endpoints:

```text
POST /api/source-inbox/preview
POST /api/source/import/preview
POST /api/source/import
```

## Curated Transcript Boundary

Assisto supports curated transcript excerpts or reviewed transcript sections. Full transcript ingestion remains out of scope unless designed as a separate high-volume workflow with chunking, source-span provenance, review-load forecasting, duplicate detection, and explicit user confirmation.

