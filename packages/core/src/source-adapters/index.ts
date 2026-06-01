import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ingestWithExtractionProvider } from "../extraction";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type FrontmatterValue } from "../markdown";
import { collectCalendarSourceUnits } from "./calendar";
import { collectChatSourceUnits } from "./chat";
import { collectEmailSourceUnits } from "./email";
import { collectMarkdownSourceUnits } from "./markdown";

export type SourceAdapterKind = "markdown" | "text" | "email" | "calendar" | "chat";

export interface SourceSpan {
  source_path?: string;
  start_line?: number;
  end_line?: number;
  start_offset?: number;
  end_offset?: number;
  label?: string;
}

export interface SourceAdapterInput {
  kind: SourceAdapterKind;
  root: string;
  path?: string;
  rawText?: string;
  source_label?: string;
  observed_at?: string;
  context?: string;
  limit?: number;
  dryRun?: boolean;
}

export interface SourceAdapterUnit {
  unit_id: string;
  adapter_kind: SourceAdapterKind;
  raw_text: string;
  source_label: string;
  source_hash: string;
  observed_at: string | null;
  contexts: string[];
  source_spans: SourceSpan[];
  metadata: Record<string, string>;
  duplicate_state: "new" | "duplicate";
  skip_reason?: string;
}

export interface SourceAdapterPreviewResult {
  adapter_kind: SourceAdapterKind;
  units: SourceAdapterUnit[];
  review_load_forecast: {
    total_units: number;
    likely_safe: number;
    likely_staged: number;
    likely_conflict: number;
    duplicates: number;
  };
  warnings: string[];
  canonical_writes: string[];
}

export interface SourceAdapterCreateResult extends SourceAdapterPreviewResult {
  created_events: string[];
  pending_transactions: string[];
}

export interface SourceAdapterParsedUnit {
  raw_text: string;
  source_label: string;
  observed_at: string | null;
  contexts: string[];
  source_spans: SourceSpan[];
  metadata: Record<string, string>;
}

interface ExistingSource {
  event_id?: string;
  event_path: string;
}

export async function previewSourceAdapterImport(input: SourceAdapterInput): Promise<SourceAdapterPreviewResult> {
  const preparedInput = await withResolvedRawText(input);
  return buildPreviewResult(preparedInput, await collectParsedUnits(preparedInput));
}

export async function createSourceAdapterImport(input: SourceAdapterInput): Promise<SourceAdapterCreateResult> {
  const preview = await previewSourceAdapterImport(input);
  const createdEvents: string[] = [];
  const pendingTransactions: string[] = [];

  if (input.dryRun === true) {
    return {
      ...preview,
      created_events: createdEvents,
      pending_transactions: pendingTransactions
    };
  }

  for (const unit of preview.units) {
    if (unit.duplicate_state === "duplicate") {
      continue;
    }

    const ingest = await ingestWithExtractionProvider(input.root, unit.raw_text, {
      observed_at: unit.observed_at,
      source_label: unit.source_label,
      source_hash: unit.source_hash,
      context: unit.contexts[0],
      raw_note: unit.raw_text,
      source_spans: unit.source_spans.map(formatSourceSpan),
      apply: false
    });
    createdEvents.push(ingest.event_path);
    pendingTransactions.push(ingest.transaction_path);
  }

  return {
    ...preview,
    created_events: createdEvents,
    pending_transactions: pendingTransactions
  };
}

async function withResolvedRawText(input: SourceAdapterInput): Promise<SourceAdapterInput> {
  if (typeof input.rawText === "string") {
    return input;
  }

  if (!input.path) {
    throw new Error("Source adapter import requires rawText or path.");
  }

  const resolvedPath = path.isAbsolute(input.path) ? input.path : path.resolve(input.root, input.path);
  return {
    ...input,
    rawText: await readFile(resolvedPath, "utf8")
  };
}

async function collectParsedUnits(input: SourceAdapterInput): Promise<SourceAdapterParsedUnit[]> {
  const units =
    input.kind === "email"
      ? collectEmailSourceUnits(input)
      : input.kind === "calendar"
        ? collectCalendarSourceUnits(input)
        : input.kind === "chat"
          ? collectChatSourceUnits(input)
          : collectMarkdownSourceUnits(input);

  return limitParsedUnits(units, input.limit);
}

async function buildPreviewResult(
  input: SourceAdapterInput,
  parsedUnits: SourceAdapterParsedUnit[]
): Promise<SourceAdapterPreviewResult> {
  const existing = await loadExistingSourceHashes(input.root);
  const seen = new Map(existing);
  const warnings: string[] = [];
  const units: SourceAdapterUnit[] = [];

  for (const parsedUnit of parsedUnits) {
    const sourceHash = sourceHashForAdapterUnit(parsedUnit.raw_text);
    const duplicate = seen.get(sourceHash);
    const unit: SourceAdapterUnit = {
      unit_id: `${input.kind}_${units.length + 1}`,
      adapter_kind: input.kind,
      raw_text: parsedUnit.raw_text,
      source_label: parsedUnit.source_label,
      source_hash: sourceHash,
      observed_at: parsedUnit.observed_at,
      contexts: parsedUnit.contexts,
      source_spans: parsedUnit.source_spans,
      metadata: parsedUnit.metadata,
      duplicate_state: duplicate ? "duplicate" : "new",
      skip_reason: duplicate ? "duplicate_source_hash" : undefined
    };
    units.push(unit);
    seen.set(sourceHash, duplicate ?? { event_path: unit.unit_id });
  }

  const duplicates = units.filter((unit) => unit.duplicate_state === "duplicate").length;

  if (duplicates > 0) {
    warnings.push(`${duplicates} duplicate source unit(s) will be skipped.`);
  }

  return {
    adapter_kind: input.kind,
    units,
    review_load_forecast: {
      total_units: units.length,
      likely_safe: units.length - duplicates,
      likely_staged: 0,
      likely_conflict: 0,
      duplicates
    },
    warnings,
    canonical_writes: []
  };
}

export function sourceHashForAdapterUnit(rawText: string): string {
  return `sha256:${createHash("sha256").update(rawText).digest("hex")}`;
}

async function loadExistingSourceHashes(root: string): Promise<Map<string, ExistingSource>> {
  const hashes = new Map<string, ExistingSource>();
  let files: string[];

  try {
    files = await listMarkdownFiles(root, "memory/events/**/*.md");
  } catch {
    files = [];
  }

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    const sourceHash = stringValue(parsed.frontmatter.source_hash);

    if (sourceHash) {
      hashes.set(normalizeSourceHash(sourceHash), {
        event_id: stringValue(parsed.frontmatter.id),
        event_path: file
      });
    }
  }

  return hashes;
}

function normalizeSourceHash(sourceHash: string): string {
  return sourceHash.startsWith("sha256:") ? sourceHash : `sha256:${sourceHash}`;
}

function limitParsedUnits(units: SourceAdapterParsedUnit[], limit: number | undefined): SourceAdapterParsedUnit[] {
  if (limit === undefined) {
    return units;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Source adapter limit must be a positive integer.");
  }

  return units.slice(0, limit);
}

function formatSourceSpan(span: SourceSpan): string {
  const parts = [
    span.source_path ? `path=${span.source_path}` : null,
    span.start_line !== undefined ? `lines=${span.start_line}-${span.end_line ?? span.start_line}` : null,
    span.start_offset !== undefined ? `offsets=${span.start_offset}-${span.end_offset ?? span.start_offset}` : null,
    span.label ? `label=${span.label}` : null
  ].filter((value): value is string => Boolean(value));

  return parts.join(" ");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
