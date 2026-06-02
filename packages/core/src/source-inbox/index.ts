import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sourceHashForAdapterUnit, type SourceAdapterKind, type SourceAdapterPreviewResult, type SourceSpan } from "../source-adapters";
import { ingestWithExtractionProvider, type ExtractionProvider } from "../extraction";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type FrontmatterValue } from "../markdown";
import { validateTransaction } from "../transactions";
import type { ValidationResult } from "../validators";

export type SourceInboxImportStatus = "previewed" | "triaged" | "events_created";
export type SourceInboxTriageState = "untriaged" | "keep" | "skip" | "split" | "merge";

export interface SourceInboxUnitInput {
  unit_id?: string;
  adapter_kind?: SourceAdapterKind | string;
  raw_text?: string;
  source_label?: string;
  source_hash: string;
  observed_at?: string | null;
  contexts?: string[];
  source_spans?: SourceSpan[];
  metadata?: Record<string, string>;
  duplicate_state?: "new" | "duplicate";
  skip_reason?: string;
  triage_state?: SourceInboxTriageState;
}

export interface SourceInboxUnit {
  unit_id: string;
  adapter_kind: SourceAdapterKind | string;
  raw_text?: string;
  source_label: string;
  source_hash: string;
  observed_at: string | null;
  contexts: string[];
  source_spans: SourceSpan[];
  metadata: Record<string, string>;
  duplicate_state: "new" | "duplicate";
  skip_reason?: string;
  triage_state: SourceInboxTriageState;
}

export interface SourceInboxSessionInput {
  session_id?: string;
  adapter_kind: SourceAdapterKind | string;
  source_label?: string;
  source_path?: string;
  import_status?: SourceInboxImportStatus;
  units: SourceInboxUnitInput[];
  warnings?: string[];
  review_load_forecast?: {
    total_units: number;
    likely_safe: number;
    likely_staged: number;
    likely_conflict: number;
    duplicates: number;
  };
  now?: string;
}

export interface SourceInboxSession {
  session_id: string;
  created_at: string;
  updated_at: string;
  adapter_kind: SourceAdapterKind | string;
  source_label?: string;
  source_path?: string;
  import_status: SourceInboxImportStatus;
  unit_count: number;
  source_hashes: string[];
  warnings: string[];
  review_load_forecast: {
    total_units: number;
    likely_safe: number;
    likely_staged: number;
    likely_conflict: number;
    duplicates: number;
  };
  triage_counts: Record<SourceInboxTriageState, number>;
  units: SourceInboxUnit[];
}

export interface SourceInboxSessionSummary {
  session_id: string;
  created_at: string;
  updated_at: string;
  adapter_kind: SourceAdapterKind | string;
  source_label?: string;
  source_path?: string;
  import_status: SourceInboxImportStatus;
  unit_count: number;
  new_units: number;
  duplicate_units: number;
  source_hashes: string[];
  warnings: string[];
  triage_counts: Record<SourceInboxTriageState, number>;
}

export interface SourceInboxListResult {
  inbox_root: string;
  session_count: number;
  sessions: SourceInboxSessionSummary[];
}


export interface SourceCaptureHubResult {
  version: "source-capture-hub-v1";
  inbox_root: string;
  session_count: number;
  totals: {
    sessions: number;
    units: number;
    new_units: number;
    duplicates: number;
    untriaged_units: number;
    triaged_units: number;
    event_created_units: number;
  };
  adapter_counts: Record<string, number>;
  triage_backlog: {
    sessions: SourceInboxSessionSummary[];
    untriaged_units: number;
  };
  duplicate_groups: Array<{ source_hash: string; unit_count: number; sessions: string[] }>;
  recent_sessions: SourceInboxSessionSummary[];
  review_load_forecast: SourceInboxSession["review_load_forecast"];
  next_recommended_action: {
    action: "triage_source_session" | "create_source_events" | "preview_source_export";
    label: string;
    session_id?: string;
  };
  canonical_writes: [];
}

export interface SourceInboxSearchInput {
  query?: string;
  session_id?: string;
  adapter_kind?: SourceAdapterKind | string;
  import_status?: SourceInboxImportStatus;
  triage_state?: SourceInboxTriageState;
  duplicate_state?: "new" | "duplicate";
  context?: string;
  source_label?: string;
  limit?: number;
}

export interface SourceInboxSearchMatch {
  session_id: string;
  unit_id: string;
  adapter_kind: SourceAdapterKind | string;
  import_status: SourceInboxImportStatus;
  triage_state: SourceInboxTriageState;
  duplicate_state: "new" | "duplicate";
  source_label: string;
  observed_at: string | null;
  contexts: string[];
  source_hash: string;
  raw_excerpt: string;
  source_spans: SourceSpan[];
  metadata: Record<string, string>;
}

export interface SourceInboxSearchResult {
  version: "source-inbox-search-v1";
  query?: string;
  filters: SourceInboxSearchInput;
  match_count: number;
  matches: SourceInboxSearchMatch[];
  canonical_writes: [];
}

export interface SourceInboxClearResult {
  inbox_root: string;
  cleared_count: number;
  removed_sessions: string[];
}

export type SourceTriageDecisionAction = SourceInboxTriageState | "edit_metadata";

export interface SourceTriageDecisionUnitInput {
  unit_id?: string;
  raw_text: string;
  source_label?: string;
  observed_at?: string | null;
  contexts?: string[];
  context?: string;
  source_spans?: SourceSpan[];
  metadata?: Record<string, string>;
  note?: string;
}

export interface SourceTriageDecision {
  unit_id: string;
  action?: SourceTriageDecisionAction;
  raw_text?: string;
  source_label?: string;
  observed_at?: string | null;
  contexts?: string[];
  context?: string;
  source_spans?: SourceSpan[];
  metadata?: Record<string, string>;
  note?: string;
  split_units?: SourceTriageDecisionUnitInput[];
  merge_with_unit_id?: string;
}

export interface SourceInboxTriageInput {
  session_id: string;
  decisions: SourceTriageDecision[];
  now?: string;
}

export interface SourceInboxCreateEventsInput {
  session_id: string;
  now?: string;
  provider?: ExtractionProvider;
}

export interface SourceInboxCreateEventUnitResult {
  unit_id: string;
  created: boolean;
  skipped: boolean;
  skip_reason?: "duplicate_source_hash" | "triage_skip";
  source_hash: string;
  source_label?: string;
  observed_at?: string | null;
  contexts: string[];
  event_id?: string;
  event_path?: string;
  existing_event_id?: string;
  existing_event_path?: string;
  transaction_id?: string;
  transaction_path?: string;
  transaction_state?: string;
  provider_name?: string;
  validation?: ValidationResult;
  operations: string[];
  affected_files: string[];
  source_events: string[];
}

export interface SourceInboxCreateEventsResult {
  action: "source_inbox_create_events";
  created: true;
  session_id: string;
  units_total: number;
  units_created: number;
  units_skipped: number;
  provider_name: string;
  units: SourceInboxCreateEventUnitResult[];
  canonical_writes: [];
}

const TRIAGE_STATES: SourceInboxTriageState[] = ["untriaged", "keep", "skip", "split", "merge"];

export async function createSourceInboxSession(
  root: string,
  input: SourceInboxSessionInput
): Promise<SourceInboxSession> {
  const now = input.now ?? new Date().toISOString();
  const units = input.units.map((unit, index) => normalizeUnit(input.adapter_kind, unit, index));
  const session: SourceInboxSession = {
    session_id: input.session_id ?? makeSourceInboxSessionId(input, now),
    created_at: now,
    updated_at: now,
    adapter_kind: input.adapter_kind,
    source_label: input.source_label,
    source_path: input.source_path,
    import_status: input.import_status ?? "previewed",
    unit_count: units.length,
    source_hashes: uniqueSorted(units.map((unit) => unit.source_hash)),
    warnings: [...(input.warnings ?? [])],
    review_load_forecast:
      input.review_load_forecast ??
      {
        total_units: units.length,
        likely_safe: units.filter((unit) => unit.duplicate_state === "new").length,
        likely_staged: 0,
        likely_conflict: 0,
        duplicates: units.filter((unit) => unit.duplicate_state === "duplicate").length
      },
    triage_counts: countTriageStates(units),
    units
  };

  await writeSourceInboxSession(root, session);
  return session;
}

export async function createSourceInboxSessionFromPreview(
  root: string,
  preview: SourceAdapterPreviewResult,
  options: { source_path?: string; source_label?: string; now?: string } = {}
): Promise<SourceInboxSession> {
  return createSourceInboxSession(root, {
    adapter_kind: preview.adapter_kind,
    source_label: options.source_label,
    source_path: options.source_path,
    now: options.now,
    units: preview.units.map((unit) => ({
      unit_id: unit.unit_id,
      adapter_kind: unit.adapter_kind,
      raw_text: unit.raw_text,
      source_label: unit.source_label,
      source_hash: unit.source_hash,
      observed_at: unit.observed_at,
      contexts: unit.contexts,
      source_spans: unit.source_spans,
      metadata: unit.metadata,
      duplicate_state: unit.duplicate_state,
      skip_reason: unit.skip_reason
    })),
    warnings: preview.warnings,
    review_load_forecast: preview.review_load_forecast
  });
}

export async function listSourceInboxSessions(root: string): Promise<SourceInboxListResult> {
  const sessions = await readAllSourceInboxSessions(root);

  return {
    inbox_root: sourceInboxRoot(root),
    session_count: sessions.length,
    sessions: sessions.map(summarizeSession)
  };
}

export async function readSourceInboxSession(root: string, sessionId: string): Promise<SourceInboxSession> {
  const safeId = assertSourceInboxSessionId(sessionId);
  return parseSessionJson(await readFile(sourceInboxSessionPath(root, safeId), "utf8"));
}

export async function clearSourceInboxSessions(
  root: string,
  options: { session_id?: string } = {}
): Promise<SourceInboxClearResult> {
  const sessions = options.session_id
    ? [await readSourceInboxSession(root, options.session_id)]
    : await readAllSourceInboxSessions(root);
  const removedSessions: string[] = [];

  for (const session of sessions) {
    await rm(sourceInboxSessionPath(root, session.session_id), { force: true });
    removedSessions.push(session.session_id);
  }

  return {
    inbox_root: sourceInboxRoot(root),
    cleared_count: removedSessions.length,
    removed_sessions: removedSessions
  };
}

export async function triageSourceInboxSession(
  root: string,
  input: SourceInboxTriageInput
): Promise<SourceInboxSession> {
  const session = await readSourceInboxSession(root, input.session_id);
  const decisions = new Map(input.decisions.map((decision) => [decision.unit_id, decision]));
  const consumed = new Set<string>();
  const nextUnits: SourceInboxUnit[] = [];

  for (let index = 0; index < session.units.length; index += 1) {
    const unit = session.units[index];

    if (consumed.has(unit.unit_id)) {
      continue;
    }

    const decision = decisions.get(unit.unit_id);

    if (!decision) {
      nextUnits.push(unit);
      continue;
    }

    const action = normalizeDecisionAction(decision.action);

    if (action === "split") {
      nextUnits.push(...splitSourceInboxUnit(unit, decision));
      continue;
    }

    if (action === "merge") {
      const target = mergeTargetUnit(session.units, unit, index, decision, consumed);
      nextUnits.push(mergeSourceInboxUnits(unit, target, decision));
      continue;
    }

    nextUnits.push(updateSourceInboxUnit(unit, decision, action));
  }

  const updated = withUpdatedSessionDerived(session, nextUnits, "triaged", input.now ?? new Date().toISOString());
  await writeSourceInboxSession(root, updated);
  return updated;
}

export async function createSourceInboxEvents(
  root: string,
  input: SourceInboxCreateEventsInput
): Promise<SourceInboxCreateEventsResult> {
  const session = await readSourceInboxSession(root, input.session_id);
  const existingSourceHashes = await loadExistingEventSourceHashes(root);
  const providerName = input.provider?.name ?? "rule-based";
  const results: SourceInboxCreateEventUnitResult[] = [];

  for (const unit of session.units) {
    const rawText = unit.raw_text?.trim() ?? "";
    const sourceHash = normalizeSourceHash(unit.source_hash || sourceHashForAdapterUnit(rawText));
    const existing = existingSourceHashes.get(sourceHash);

    if (!rawText || unit.triage_state === "skip") {
      results.push(skippedCreateEventUnit(unit, sourceHash, "triage_skip"));
      continue;
    }

    if (unit.duplicate_state === "duplicate" || existing) {
      results.push({
        ...skippedCreateEventUnit(unit, sourceHash, "duplicate_source_hash"),
        existing_event_id: existing?.event_id,
        existing_event_path: existing?.event_path,
        source_events: existing?.event_id ? [existing.event_id] : []
      });
      continue;
    }

    const ingest = await ingestWithExtractionProvider(root, rawText, {
      now: input.now,
      provider: input.provider,
      observed_at: unit.observed_at,
      source_label: unit.source_label,
      source_hash: sourceHash,
      context: unit.contexts[0],
      raw_note: rawText,
      source_spans: unit.source_spans.map(formatSourceSpan),
      apply: false
    });
    const validation = await validateTransaction(root, ingest.transaction);
    const result: SourceInboxCreateEventUnitResult = {
      unit_id: unit.unit_id,
      created: true,
      skipped: false,
      source_hash: sourceHash,
      source_label: unit.source_label,
      observed_at: unit.observed_at,
      contexts: unit.contexts,
      event_id: ingest.event_id,
      event_path: ingest.event_path,
      transaction_id: ingest.transaction_id,
      transaction_path: ingest.transaction_path,
      transaction_state: ingest.transaction.transaction_state,
      provider_name: ingest.provider_name,
      validation,
      operations: ingest.transaction.operations.map((operation) => operation.operation),
      affected_files: [...ingest.transaction.affected_files],
      source_events: [...ingest.transaction.source_events]
    };
    results.push(result);
    existingSourceHashes.set(sourceHash, { event_id: ingest.event_id, event_path: ingest.event_path });
  }

  const updated = withUpdatedSessionDerived(session, session.units, "events_created", input.now ?? new Date().toISOString());
  await writeSourceInboxSession(root, updated);

  return {
    action: "source_inbox_create_events",
    created: true,
    session_id: session.session_id,
    units_total: results.length,
    units_created: results.filter((unit) => !unit.skipped).length,
    units_skipped: results.filter((unit) => unit.skipped).length,
    provider_name: providerName,
    units: results,
    canonical_writes: []
  };
}


export async function buildSourceCaptureHub(root: string): Promise<SourceCaptureHubResult> {
  const sessions = await readAllSourceInboxSessions(root);
  const summaries = sessions.map(summarizeSession);
  const units = sessions.flatMap((session) => session.units.map((unit) => ({ session, unit })));
  const adapterCounts: Record<string, number> = {};

  for (const session of sessions) {
    adapterCounts[String(session.adapter_kind)] = (adapterCounts[String(session.adapter_kind)] ?? 0) + 1;
  }

  const duplicateGroups = [...sourceHashGroups(units)]
    .filter(([, group]) => group.length > 1 || group.some((item) => item.unit.duplicate_state === "duplicate"))
    .map(([sourceHash, group]) => ({
      source_hash: sourceHash,
      unit_count: group.length,
      sessions: uniqueSorted(group.map((item) => item.session.session_id))
    }));
  const untriagedSessions = summaries.filter((summary) => summary.triage_counts.untriaged > 0);
  const triagedUnits = units.filter(({ unit }) => unit.triage_state !== "untriaged").length;
  const eventCreatedUnits = sessions
    .filter((session) => session.import_status === "events_created")
    .reduce((sum, session) => sum + session.unit_count, 0);
  const firstUntriaged = untriagedSessions[0];
  const firstTriaged = summaries.find((summary) => summary.import_status === "triaged");

  return {
    version: "source-capture-hub-v1",
    inbox_root: sourceInboxRoot(root),
    session_count: sessions.length,
    totals: {
      sessions: sessions.length,
      units: units.length,
      new_units: units.filter(({ unit }) => unit.duplicate_state === "new").length,
      duplicates: units.filter(({ unit }) => unit.duplicate_state === "duplicate").length,
      untriaged_units: units.filter(({ unit }) => unit.triage_state === "untriaged").length,
      triaged_units: triagedUnits,
      event_created_units: eventCreatedUnits
    },
    adapter_counts: adapterCounts,
    triage_backlog: {
      sessions: untriagedSessions,
      untriaged_units: units.filter(({ unit }) => unit.triage_state === "untriaged").length
    },
    duplicate_groups: duplicateGroups,
    recent_sessions: summaries.slice(0, 10),
    review_load_forecast: aggregateReviewLoadForecast(sessions),
    next_recommended_action: firstUntriaged
      ? { action: "triage_source_session", label: "Triage the next Source Inbox session.", session_id: firstUntriaged.session_id }
      : firstTriaged
        ? { action: "create_source_events", label: "Create Events and pending Transactions for a triaged session.", session_id: firstTriaged.session_id }
        : { action: "preview_source_export", label: "Preview a local source export or manual clip." },
    canonical_writes: []
  };
}

export async function searchSourceInboxUnits(root: string, input: SourceInboxSearchInput = {}): Promise<SourceInboxSearchResult> {
  const sessions = await readAllSourceInboxSessions(root);
  const terms = (input.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const limit = normalizeSearchLimit(input.limit);
  const matches: SourceInboxSearchMatch[] = [];

  for (const session of sessions) {
    if (input.session_id && session.session_id !== input.session_id) {
      continue;
    }
    if (input.adapter_kind && String(session.adapter_kind) !== String(input.adapter_kind)) {
      continue;
    }
    if (input.import_status && session.import_status !== input.import_status) {
      continue;
    }

    for (const unit of session.units) {
      if (input.triage_state && unit.triage_state !== input.triage_state) {
        continue;
      }
      if (input.duplicate_state && unit.duplicate_state !== input.duplicate_state) {
        continue;
      }
      if (input.context && !unit.contexts.includes(input.context)) {
        continue;
      }
      if (input.source_label && unit.source_label !== input.source_label) {
        continue;
      }
      const haystack = sourceInboxSearchHaystack(session, unit);
      if (terms.length && !terms.every((term) => haystack.includes(term))) {
        continue;
      }

      matches.push({
        session_id: session.session_id,
        unit_id: unit.unit_id,
        adapter_kind: unit.adapter_kind,
        import_status: session.import_status,
        triage_state: unit.triage_state,
        duplicate_state: unit.duplicate_state,
        source_label: unit.source_label,
        observed_at: unit.observed_at,
        contexts: [...unit.contexts],
        source_hash: unit.source_hash,
        raw_excerpt: sourceInboxExcerpt(unit.raw_text),
        source_spans: [...unit.source_spans],
        metadata: { ...unit.metadata }
      });

      if (matches.length >= limit) {
        return sourceInboxSearchResult(input, matches);
      }
    }
  }

  return sourceInboxSearchResult(input, matches);
}

export function sourceInboxRoot(root: string): string {
  return path.join(root, ".assisto-local", "source-inbox");
}

async function writeSourceInboxSession(root: string, session: SourceInboxSession): Promise<void> {
  await mkdir(sourceInboxSessionsRoot(root), { recursive: true });
  await writeFile(sourceInboxSessionPath(root, session.session_id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

async function readAllSourceInboxSessions(root: string): Promise<SourceInboxSession[]> {
  let entries: string[];

  try {
    entries = await readdir(sourceInboxSessionsRoot(root));
  } catch {
    entries = [];
  }

  const sessions: SourceInboxSession[] = [];

  for (const entry of entries.filter((value) => value.endsWith(".json")).sort()) {
    try {
      sessions.push(parseSessionJson(await readFile(path.join(sourceInboxSessionsRoot(root), entry), "utf8")));
    } catch {
      // Corrupt local UI state should not prevent reading the rest of the inbox.
    }
  }

  return sessions.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}


function sourceHashGroups(
  units: Array<{ session: SourceInboxSession; unit: SourceInboxUnit }>
): Map<string, Array<{ session: SourceInboxSession; unit: SourceInboxUnit }>> {
  const groups = new Map<string, Array<{ session: SourceInboxSession; unit: SourceInboxUnit }>>();

  for (const item of units) {
    const group = groups.get(item.unit.source_hash) ?? [];
    group.push(item);
    groups.set(item.unit.source_hash, group);
  }

  return groups;
}

function aggregateReviewLoadForecast(sessions: SourceInboxSession[]): SourceInboxSession["review_load_forecast"] {
  return sessions.reduce(
    (total, session) => ({
      total_units: total.total_units + session.review_load_forecast.total_units,
      likely_safe: total.likely_safe + session.review_load_forecast.likely_safe,
      likely_staged: total.likely_staged + session.review_load_forecast.likely_staged,
      likely_conflict: total.likely_conflict + session.review_load_forecast.likely_conflict,
      duplicates: total.duplicates + session.review_load_forecast.duplicates
    }),
    { total_units: 0, likely_safe: 0, likely_staged: 0, likely_conflict: 0, duplicates: 0 }
  );
}

function normalizeSearchLimit(value: number | undefined): number {
  if (value === undefined) {
    return 50;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Source Inbox search limit must be a positive integer.");
  }

  return Math.min(value, 200);
}

function sourceInboxSearchHaystack(session: SourceInboxSession, unit: SourceInboxUnit): string {
  return [
    session.session_id,
    session.adapter_kind,
    session.source_label,
    session.source_path,
    session.import_status,
    unit.unit_id,
    unit.adapter_kind,
    unit.raw_text,
    unit.source_label,
    unit.observed_at,
    unit.contexts.join(" "),
    unit.source_hash,
    unit.triage_state,
    unit.duplicate_state,
    Object.entries(unit.metadata).map(([key, value]) => key + " " + value).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sourceInboxExcerpt(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
}

function sourceInboxSearchResult(input: SourceInboxSearchInput, matches: SourceInboxSearchMatch[]): SourceInboxSearchResult {
  return {
    version: "source-inbox-search-v1",
    query: input.query,
    filters: { ...input },
    match_count: matches.length,
    matches,
    canonical_writes: []
  };
}

function sourceInboxSessionsRoot(root: string): string {
  return path.join(sourceInboxRoot(root), "sessions");
}

function sourceInboxSessionPath(root: string, sessionId: string): string {
  return path.join(sourceInboxSessionsRoot(root), `${assertSourceInboxSessionId(sessionId)}.json`);
}

function assertSourceInboxSessionId(sessionId: string): string {
  if (!/^srcin_[a-z0-9_]+$/.test(sessionId)) {
    throw new Error("Source Inbox session id must start with srcin_ and contain only lowercase letters, digits, or underscores.");
  }

  return sessionId;
}

function makeSourceInboxSessionId(input: SourceInboxSessionInput, now: string): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        now,
        adapter_kind: input.adapter_kind,
        source_label: input.source_label ?? "",
        source_path: input.source_path ?? "",
        source_hashes: input.units.map((unit) => unit.source_hash).sort()
      })
    )
    .digest("hex")
    .slice(0, 12);
  return `srcin_${compactTimestamp(now)}_${digest}`;
}

function compactTimestamp(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return "local";
  }

  return parsed.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14).toLowerCase();
}

function normalizeUnit(
  adapterKind: SourceAdapterKind | string,
  unit: SourceInboxUnitInput,
  index: number
): SourceInboxUnit {
  return {
    unit_id: unit.unit_id ?? `unit_${index + 1}`,
    adapter_kind: unit.adapter_kind ?? adapterKind,
    raw_text: unit.raw_text,
    source_label: unit.source_label ?? "source inbox",
    source_hash: normalizeSourceHash(unit.source_hash),
    observed_at: unit.observed_at ?? null,
    contexts: [...(unit.contexts ?? [])],
    source_spans: [...(unit.source_spans ?? [])],
    metadata: { ...(unit.metadata ?? {}) },
    duplicate_state: unit.duplicate_state ?? "new",
    skip_reason: unit.skip_reason,
    triage_state: unit.triage_state ?? "untriaged"
  };
}

function normalizeSourceHash(sourceHash: string): string {
  return sourceHash.startsWith("sha256:") ? sourceHash : `sha256:${sourceHash}`;
}

function parseSessionJson(value: string): SourceInboxSession {
  const parsed = JSON.parse(value) as SourceInboxSession;
  assertSourceInboxSessionId(parsed.session_id);
  return {
    ...parsed,
    unit_count: parsed.units.length,
    source_hashes: uniqueSorted(parsed.units.map((unit) => unit.source_hash)),
    triage_counts: countTriageStates(parsed.units)
  };
}

function summarizeSession(session: SourceInboxSession): SourceInboxSessionSummary {
  return {
    session_id: session.session_id,
    created_at: session.created_at,
    updated_at: session.updated_at,
    adapter_kind: session.adapter_kind,
    source_label: session.source_label,
    source_path: session.source_path,
    import_status: session.import_status,
    unit_count: session.unit_count,
    new_units: session.units.filter((unit) => unit.duplicate_state === "new").length,
    duplicate_units: session.units.filter((unit) => unit.duplicate_state === "duplicate").length,
    source_hashes: session.source_hashes,
    warnings: session.warnings,
    triage_counts: session.triage_counts
  };
}

function countTriageStates(units: SourceInboxUnit[]): Record<SourceInboxTriageState, number> {
  const counts = Object.fromEntries(TRIAGE_STATES.map((state) => [state, 0])) as Record<SourceInboxTriageState, number>;

  for (const unit of units) {
    counts[unit.triage_state] += 1;
  }

  return counts;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeDecisionAction(action: SourceTriageDecisionAction | undefined): SourceTriageDecisionAction {
  return action ?? "keep";
}

function updateSourceInboxUnit(
  unit: SourceInboxUnit,
  decision: SourceTriageDecision,
  action: SourceTriageDecisionAction
): SourceInboxUnit {
  const rawText = decision.raw_text ?? unit.raw_text;
  const triageState: SourceInboxTriageState = action === "edit_metadata" ? "keep" : action;

  return {
    ...unit,
    raw_text: rawText,
    source_label: decision.source_label ?? unit.source_label,
    source_hash: rawText !== unit.raw_text && rawText ? sourceHashForAdapterUnit(rawText) : unit.source_hash,
    observed_at: decision.observed_at !== undefined ? decision.observed_at : unit.observed_at,
    contexts: contextsFromDecision(decision, unit.contexts),
    source_spans: decision.source_spans ? [...decision.source_spans] : unit.source_spans,
    metadata: metadataFromDecision(unit, decision),
    skip_reason: triageState === "skip" ? "triage_skip" : unit.skip_reason,
    triage_state: triageState
  };
}

function splitSourceInboxUnit(unit: SourceInboxUnit, decision: SourceTriageDecision): SourceInboxUnit[] {
  const splitUnits = decision.split_units?.length
    ? decision.split_units
    : (unit.raw_text ?? "")
        .split(/\n\s*\n/)
        .map((rawText) => ({ raw_text: rawText.trim() }))
        .filter((splitUnit) => splitUnit.raw_text);

  if (!splitUnits.length) {
    throw new Error("Source Inbox split decision for " + unit.unit_id + " requires split units or splittable raw text.");
  }

  return splitUnits.map((splitUnit, index) => sourceInboxUnitFromDecisionUnit(unit, splitUnit, unit.unit_id + "_split_" + String(index + 1), "split"));
}

function mergeTargetUnit(
  units: SourceInboxUnit[],
  unit: SourceInboxUnit,
  index: number,
  decision: SourceTriageDecision,
  consumed: Set<string>
): SourceInboxUnit {
  const target = decision.merge_with_unit_id
    ? units.find((candidate) => candidate.unit_id === decision.merge_with_unit_id)
    : units[index + 1];

  if (!target || target.unit_id === unit.unit_id) {
    throw new Error("Source Inbox merge decision for " + unit.unit_id + " requires a merge target.");
  }

  consumed.add(target.unit_id);
  return target;
}

function mergeSourceInboxUnits(unit: SourceInboxUnit, target: SourceInboxUnit, decision: SourceTriageDecision): SourceInboxUnit {
  const rawText = decision.raw_text ?? [unit.raw_text, target.raw_text].filter(Boolean).join("\n\n");
  const contexts = contextsFromDecision(decision, uniqueSorted(unit.contexts.concat(target.contexts)));

  return {
    ...unit,
    raw_text: rawText,
    source_label: decision.source_label ?? unit.source_label,
    source_hash: sourceHashForAdapterUnit(rawText),
    observed_at: decision.observed_at !== undefined ? decision.observed_at : unit.observed_at ?? target.observed_at,
    contexts,
    source_spans: decision.source_spans ? [...decision.source_spans] : unit.source_spans.concat(target.source_spans),
    metadata: metadataFromDecision({ ...unit, metadata: { ...unit.metadata, ...target.metadata } }, decision),
    duplicate_state: "new",
    skip_reason: undefined,
    triage_state: "merge"
  };
}

function sourceInboxUnitFromDecisionUnit(
  base: SourceInboxUnit,
  input: SourceTriageDecisionUnitInput,
  unitId: string,
  triageState: SourceInboxTriageState
): SourceInboxUnit {
  const rawText = input.raw_text.trim();

  return {
    ...base,
    unit_id: input.unit_id ?? unitId,
    raw_text: rawText,
    source_label: input.source_label ?? base.source_label,
    source_hash: sourceHashForAdapterUnit(rawText),
    observed_at: input.observed_at !== undefined ? input.observed_at : base.observed_at,
    contexts: contextsFromDecision(input, base.contexts),
    source_spans: input.source_spans ? [...input.source_spans] : base.source_spans,
    metadata: metadataFromDecision(base, input),
    duplicate_state: "new",
    skip_reason: undefined,
    triage_state: triageState
  };
}

function contextsFromDecision(input: { contexts?: string[]; context?: string }, fallback: string[]): string[] {
  if (input.contexts) {
    return input.contexts.filter(Boolean);
  }

  if (input.context) {
    return [input.context];
  }

  return [...fallback];
}

function metadataFromDecision(
  unit: Pick<SourceInboxUnit, "metadata">,
  decision: { metadata?: Record<string, string>; note?: string }
): Record<string, string> {
  return {
    ...unit.metadata,
    ...(decision.metadata ?? {}),
    ...(decision.note ? { triage_note: decision.note } : {})
  };
}

function withUpdatedSessionDerived(
  session: SourceInboxSession,
  units: SourceInboxUnit[],
  importStatus: SourceInboxImportStatus,
  updatedAt: string
): SourceInboxSession {
  return {
    ...session,
    updated_at: updatedAt,
    import_status: importStatus,
    unit_count: units.length,
    source_hashes: uniqueSorted(units.map((unit) => unit.source_hash)),
    review_load_forecast: reviewLoadForecastForUnits(units),
    triage_counts: countTriageStates(units),
    units
  };
}

function reviewLoadForecastForUnits(units: SourceInboxUnit[]): SourceInboxSession["review_load_forecast"] {
  const duplicates = units.filter((unit) => unit.duplicate_state === "duplicate").length;

  return {
    total_units: units.length,
    likely_safe: units.filter((unit) => unit.duplicate_state === "new" && unit.triage_state !== "skip").length,
    likely_staged: 0,
    likely_conflict: 0,
    duplicates
  };
}

interface ExistingSourceHash {
  event_id?: string;
  event_path: string;
}

async function loadExistingEventSourceHashes(root: string): Promise<Map<string, ExistingSourceHash>> {
  const hashes = new Map<string, ExistingSourceHash>();
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

function skippedCreateEventUnit(
  unit: SourceInboxUnit,
  sourceHash: string,
  reason: "duplicate_source_hash" | "triage_skip"
): SourceInboxCreateEventUnitResult {
  return {
    unit_id: unit.unit_id,
    created: false,
    skipped: true,
    skip_reason: reason,
    source_hash: sourceHash,
    source_label: unit.source_label,
    observed_at: unit.observed_at,
    contexts: unit.contexts,
    operations: [],
    affected_files: [],
    source_events: []
  };
}

function formatSourceSpan(span: SourceSpan): string {
  const parts = [
    span.source_path ? "path=" + span.source_path : null,
    span.start_line !== undefined ? "lines=" + span.start_line + "-" + (span.end_line ?? span.start_line) : null,
    span.start_offset !== undefined ? "offsets=" + span.start_offset + "-" + (span.end_offset ?? span.start_offset) : null,
    span.label ? "label=" + span.label : null
  ].filter((value): value is string => Boolean(value));

  return parts.join(" ");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
