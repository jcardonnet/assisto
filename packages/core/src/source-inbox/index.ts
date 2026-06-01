import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { SourceAdapterKind, SourceSpan } from "../source-adapters";

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

export interface SourceInboxClearResult {
  inbox_root: string;
  cleared_count: number;
  removed_sessions: string[];
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
