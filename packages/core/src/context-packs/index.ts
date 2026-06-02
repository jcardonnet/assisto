import { createHash } from "node:crypto";
import {
  retrieveContextForAnswer,
  type AnswerBasisResult,
  type AnswerCannotConfirm,
  type AnswerConflict,
  type AnswerStaleSignal,
  type PackedClaim,
  type PackedEvidenceEvent,
  type RetrievalManualAction
} from "../retrieval";

export type ContextPackKind = "task" | "person" | "context" | "meeting" | "debugging" | "agent-handoff";

export interface PortableContextPack {
  pack_id: string;
  kind: ContextPackKind;
  target?: string;
  generated_at: string;
  instructions: string;
  active_claims: PackedClaim[];
  uncertain_claims: PackedClaim[];
  evidence_events: PackedEvidenceEvent[];
  conflicts: AnswerConflict[];
  stale_signals: AnswerStaleSignal[];
  repair_actions: RetrievalManualAction[];
  cannot_confirm: AnswerCannotConfirm[];
  compact_markdown: string;
  warnings: string[];
  context_pack: string;
  canonical_writes: [];
}

export interface BuildPortableContextPackOptions {
  kind: ContextPackKind;
  target?: string;
  question?: string;
  now?: string;
}

export async function buildPortableContextPack(
  root: string,
  options: BuildPortableContextPackOptions
): Promise<PortableContextPack> {
  const kind = options.kind;
  const target = options.target ?? options.question;
  const query = queryForPack(kind, target);
  const basis = await retrieveContextForAnswer(root, query);
  return packFromBasis(kind, target, options.now ?? new Date().toISOString(), basis);
}

export async function buildTaskPack(root: string, question: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "task", target: question, now });
}

export async function buildPersonPack(root: string, idOrPath: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "person", target: idOrPath, now });
}

export async function buildContextPack(root: string, idOrPath: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "context", target: idOrPath, now });
}

export async function buildMeetingPack(root: string, personOrContext: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "meeting", target: personOrContext, now });
}

export async function buildDebuggingPack(root: string, contextId: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "debugging", target: contextId, now });
}

export async function buildAgentHandoffPack(root: string, objective: string, now?: string): Promise<PortableContextPack> {
  return buildPortableContextPack(root, { kind: "agent-handoff", target: objective, now });
}

function packFromBasis(
  kind: ContextPackKind,
  target: string | undefined,
  generatedAt: string,
  basis: AnswerBasisResult
): PortableContextPack {
  const warnings = unique([
    "Portable context packs are derived only; do not paste them into memory as canonical truth.",
    "Durable corrections must be captured as source Events and routed through pending Transactions.",
    ...basis.warnings
  ]);
  const repairActions = basis.repairActions.length > 0 ? basis.repairActions : fallbackRepairActions(basis.cannotConfirm);
  const pack: PortableContextPack = {
    pack_id: "pack_" + kind.replace(/[^a-z0-9]+/g, "_") + "_" + stableHash(kind + ":" + (target ?? "") + ":" + basis.query).slice(0, 12),
    kind,
    target,
    generated_at: generatedAt,
    instructions: instructionsForKind(kind),
    active_claims: basis.activeClaims,
    uncertain_claims: basis.uncertainClaims,
    evidence_events: basis.evidenceEvents,
    conflicts: basis.conflicts,
    stale_signals: basis.staleSignals,
    repair_actions: repairActions,
    cannot_confirm: basis.cannotConfirm,
    compact_markdown: "",
    warnings,
    context_pack: basis.contextPack,
    canonical_writes: []
  };
  pack.compact_markdown = renderPortablePack(pack, basis);
  return pack;
}

function queryForPack(kind: ContextPackKind, target?: string): string {
  const subject = target?.trim();
  if (!subject) {
    return "What should I know from memory for this work session?";
  }
  if (kind === "task") {
    return subject;
  }
  if (kind === "person") {
    return "What should I know about " + subject + "?";
  }
  if (kind === "context") {
    return "What is the current state, open work, and evidence for " + subject + "?";
  }
  if (kind === "meeting") {
    return "What should I know before meeting about " + subject + "?";
  }
  if (kind === "debugging") {
    return "What systems, blockers, recent changes, evidence, and open questions matter for debugging " + subject + "?";
  }
  return "What should a coding agent know for this handoff objective: " + subject;
}

function instructionsForKind(kind: ContextPackKind): string {
  if (kind === "agent-handoff") {
    return "Use only cited claims and Events from this pack. Treat cannot-confirm and repair actions as constraints, not facts.";
  }
  if (kind === "meeting") {
    return "Use this as disposable meeting prep. Confirm uncertain claims with the cited source Events or ReviewItems.";
  }
  if (kind === "debugging") {
    return "Use this as a cited debugging brief. Do not infer root cause beyond the listed claims, Events, conflicts, and stale signals.";
  }
  return "Use this portable pack as derived context only. Do not persist generated summaries as memory.";
}

function renderPortablePack(pack: PortableContextPack, basis: AnswerBasisResult): string {
  const lines: string[] = [];
  lines.push("# Portable Cited Context Pack");
  lines.push("");
  lines.push("- pack_id: " + pack.pack_id);
  lines.push("- kind: " + pack.kind);
  lines.push("- target: " + (pack.target ?? "none"));
  lines.push("- generated_at: " + pack.generated_at);
  lines.push("- query_intent: " + basis.queryIntent.primary);
  lines.push("- canonical_writes: 0");
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push(pack.instructions);
  lines.push("");
  lines.push("## What Memory Can Say");
  lines.push("");
  appendClaims(lines, pack.active_claims);
  lines.push("## What Memory Cannot Confirm");
  lines.push("");
  appendCannotConfirm(lines, pack.cannot_confirm);
  lines.push("## Uncertainty, Conflicts, And Stale Signals");
  lines.push("");
  appendUncertainty(lines, pack);
  lines.push("## Evidence Events");
  lines.push("");
  appendEvents(lines, pack.evidence_events);
  lines.push("## Repair Actions");
  lines.push("");
  appendRepairActions(lines, pack.repair_actions);
  lines.push("## Warnings");
  lines.push("");
  appendStrings(lines, pack.warnings);
  return lines.join("\n") + "\n";
}

function appendClaims(lines: string[], claims: PackedClaim[]): void {
  if (claims.length === 0) {
    lines.push("- No active cited claims were found.", "");
    return;
  }
  for (const claim of claims) {
    lines.push("- " + claim.statement + " (claim_id: " + claim.claim_id + "; page: " + claim.page_path + "; evidence: " + (claim.evidence.join(", ") || "none") + ")");
  }
  lines.push("");
}

function appendCannotConfirm(lines: string[], items: AnswerCannotConfirm[]): void {
  if (items.length === 0) {
    lines.push("- No cannot-confirm items were returned.", "");
    return;
  }
  for (const item of items) {
    lines.push("- " + item.message + " (code: " + item.code + ")");
  }
  lines.push("");
}

function appendUncertainty(lines: string[], pack: PortableContextPack): void {
  let count = 0;
  for (const claim of pack.uncertain_claims) {
    count += 1;
    lines.push("- Uncertain claim " + claim.claim_id + " on " + claim.page_path + ": " + claim.statement);
  }
  for (const conflict of pack.conflicts) {
    count += 1;
    lines.push("- Conflict " + conflict.code + " on " + conflict.page_path + ": " + conflict.message);
  }
  for (const stale of pack.stale_signals) {
    count += 1;
    lines.push("- Stale signal " + stale.code + ": " + stale.message);
  }
  if (count === 0) {
    lines.push("- No uncertainty, conflict, or stale signal was returned.");
  }
  lines.push("");
}

function appendEvents(lines: string[], events: PackedEvidenceEvent[]): void {
  if (events.length === 0) {
    lines.push("- No source Event pages were loaded.", "");
    return;
  }
  for (const event of events) {
    lines.push("- " + (event.id ?? "unknown_event") + " (" + event.path + "; observed_at: " + (event.observed_at ?? "null") + ")");
  }
  lines.push("");
}

function appendRepairActions(lines: string[], actions: RetrievalManualAction[]): void {
  if (actions.length === 0) {
    lines.push("- No repair action was suggested.", "");
    return;
  }
  for (const action of actions) {
    lines.push("- " + action.action + ": " + action.label + " - " + action.reason + (action.target ? " (target: " + action.target + ")" : ""));
  }
  lines.push("");
}

function fallbackRepairActions(cannotConfirm: AnswerCannotConfirm[]): RetrievalManualAction[] {
  if (cannotConfirm.length === 0) {
    return [];
  }
  return [
    {
      action: "capture_note",
      label: "Capture missing memory",
      reason: "This portable pack cannot confirm requested information from cited memory."
    },
    {
      action: "log_friction",
      label: "Log retrieval miss",
      reason: "The pack surfaced uncertainty or missing information that may need dogfood feedback."
    }
  ];
}

function appendStrings(lines: string[], values: string[]): void {
  if (values.length === 0) {
    lines.push("- none", "");
    return;
  }
  for (const value of values) {
    lines.push("- " + value);
  }
  lines.push("");
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
