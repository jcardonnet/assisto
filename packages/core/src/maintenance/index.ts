import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { collectLintIssues, type LintIssue } from "../lint";
import {
  checkMemoryHealth,
  createHealthReviewTransaction,
  type HealthReviewTransactionResult,
  type MemoryHealthFinding,
  type MemoryHealthResult,
  type MemoryHealthSeverity
} from "../health";
import { listReviewItems } from "../review";
import { buildReviewAccelerationQueue, buildReviewThroughputResult, type ReviewThroughputResult } from "../review/acceleration";

export type MaintenanceMode = "changed" | "random" | "topic" | "full";
export type MaintenanceFindingSource = "health" | "lint" | "review_throughput";

export interface MaintenancePlanOptions {
  mode?: MaintenanceMode;
  seed?: string;
  topic?: string;
  now?: string;
  limit?: number;
}

export interface MaintenanceFinding {
  finding_id: string;
  source: MaintenanceFindingSource;
  source_id: string;
  code: string;
  severity: MemoryHealthSeverity;
  rank: number;
  message: string;
  affected_files: string[];
  source_events: string[];
  evidence: string[];
  suggested_action: string;
  stageable: boolean;
  stage_endpoint?: string;
  preview_endpoint?: string;
}

export interface MaintenancePlanResult {
  version: "maintenance-dream-cycle-v1";
  generated_at: string;
  mode: MaintenanceMode;
  seed: string;
  topic?: string;
  summary: {
    total_findings: number;
    high: number;
    medium: number;
    low: number;
    stageable: number;
    health: number;
    lint: number;
    review_throughput: number;
  };
  selected_files: string[];
  findings: MaintenanceFinding[];
  review_throughput: ReviewThroughputResult;
  warnings: string[];
  canonical_writes: [];
}

export interface MaintenanceRunResult extends MaintenancePlanResult {
  run_id: string;
  run_path: string;
}

export interface MaintenanceRunListItem {
  run_id: string;
  run_path: string;
  generated_at: string;
  mode: MaintenanceMode;
  finding_count: number;
}

export interface StageMaintenanceFindingOptions {
  now?: string;
  note?: string;
}

export interface StageMaintenanceFindingResult extends HealthReviewTransactionResult {
  maintenance_finding_id: string;
  maintenance_source: MaintenanceFindingSource;
  created: true;
}

const defaultNow = "2026-05-27T12:00:00.000Z";
const runDir = path.join(".assisto-local", "lint-runs");

export async function buildMaintenancePlan(root: string, options: MaintenancePlanOptions = {}): Promise<MaintenancePlanResult> {
  const mode = options.mode ?? "full";
  const seed = options.seed ?? "default";
  const generatedAt = options.now ?? defaultNow;
  const [health, lintIssues, reviewItems] = await Promise.all([
    checkMemoryHealth(root, { now: generatedAt }),
    collectLintIssues(root, { now: generatedAt }),
    listReviewItems(root).catch(() => [])
  ]);
  const reviewQueue = buildReviewAccelerationQueue({
    reviewItems: reviewItems.map((item) => ({
      id: item.id,
      path: item.path,
      review_reason: item.review_reason,
      source_events: [],
      staged_claim_ids: []
    }))
  });
  const reviewThroughput = buildReviewThroughputResult(reviewQueue);
  const findings = selectFindings(
    [
      ...health.findings.map((finding) => maintenanceFindingFromHealth(finding)),
      ...lintIssues.map((issue) => maintenanceFindingFromLint(issue)),
      ...reviewThroughput.bottlenecks.map((lane) => maintenanceFindingFromThroughput(lane))
    ],
    { mode, seed, topic: options.topic, limit: options.limit }
  );

  return {
    version: "maintenance-dream-cycle-v1",
    generated_at: generatedAt,
    mode,
    seed,
    topic: options.topic,
    summary: summarizeMaintenanceFindings(findings),
    selected_files: uniqueSorted(findings.flatMap((finding) => finding.affected_files)).slice(0, 50),
    findings,
    review_throughput: reviewThroughput,
    warnings: uniqueSorted([
      ...health.warnings,
      ...(mode === "topic" && !options.topic ? ["Topic mode was requested without a topic; no topic filter was applied."] : []),
      ...(mode === "changed" ? ["Changed mode is a bounded explicit maintenance pass in v1; it is not background or git-scoped linting."] : []),
      "Maintenance Dream Cycle is derived and explicit; it does not run in the background.",
      "Only health-backed findings are stageable in v1; lint and throughput findings are read-only signals.",
      "Run state is local under .assisto-local/lint-runs and is not canonical memory."
    ]),
    canonical_writes: []
  };
}

export async function runMaintenance(root: string, options: MaintenancePlanOptions = {}): Promise<MaintenanceRunResult> {
  const plan = await buildMaintenancePlan(root, options);
  const datePart = plan.generated_at.slice(0, 10).replace(/-/g, "_");
  const runId = "maint_" + datePart + "_" + stableHash(plan.mode + ":" + plan.seed + ":" + (plan.topic ?? "")).slice(0, 8);
  const runPath = path.join(runDir, runId + ".json");
  const result: MaintenanceRunResult = { ...plan, run_id: runId, run_path: runPath };
  await mkdir(path.join(root, runDir), { recursive: true });
  await writeFile(path.join(root, runPath), JSON.stringify(result, null, 2) + "\n", "utf8");
  return result;
}

export async function listMaintenanceRuns(root: string): Promise<MaintenanceRunListItem[]> {
  const absolute = path.join(root, runDir);
  let files: string[] = [];
  try {
    files = await readdir(absolute);
  } catch {
    return [];
  }
  const runs: MaintenanceRunListItem[] = [];
  for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
    try {
      const run = JSON.parse(await readFile(path.join(absolute, file), "utf8")) as MaintenanceRunResult;
      runs.push({
        run_id: run.run_id,
        run_path: path.join(runDir, file),
        generated_at: run.generated_at,
        mode: run.mode,
        finding_count: run.findings.length
      });
    } catch {
      // Local run files are noncanonical scratch state; malformed files are ignored.
    }
  }
  return runs.sort((left, right) => right.generated_at.localeCompare(left.generated_at) || right.run_id.localeCompare(left.run_id));
}

export async function readMaintenanceRun(root: string, runIdOrPath: string): Promise<MaintenanceRunResult> {
  return JSON.parse(await readFile(path.join(root, normalizeRunPath(runIdOrPath)), "utf8")) as MaintenanceRunResult;
}

export async function clearMaintenanceRuns(root: string): Promise<{ cleared: true; run_dir: string }> {
  await rm(path.join(root, runDir), { recursive: true, force: true });
  return { cleared: true, run_dir: runDir };
}

export async function stageMaintenanceFinding(
  root: string,
  findingId: string,
  options: StageMaintenanceFindingOptions = {}
): Promise<StageMaintenanceFindingResult> {
  const plan = await buildMaintenancePlan(root, { now: options.now });
  const finding = plan.findings.find((item) => item.finding_id === findingId);
  if (!finding) {
    throw new Error("Maintenance finding not found: " + findingId);
  }
  if (finding.source !== "health") {
    throw new Error("Maintenance finding " + findingId + " is read-only in v1; only health-backed findings can be staged.");
  }
  const health = await checkMemoryHealth(root, { now: options.now });
  const healthFinding = health.findings.find((item) => item.finding_id === finding.source_id);
  if (!healthFinding) {
    throw new Error("Health finding not found for maintenance finding: " + findingId);
  }
  const result = await createHealthReviewTransaction(root, healthForOneFinding(health, healthFinding), { now: options.now, note: options.note });
  return {
    ...result,
    maintenance_finding_id: finding.finding_id,
    maintenance_source: finding.source,
    created: true
  };
}

function maintenanceFindingFromHealth(finding: MemoryHealthFinding): MaintenanceFinding {
  return withFindingId({
    source: "health",
    source_id: finding.finding_id,
    code: "health:" + finding.code,
    severity: finding.severity,
    rank: severityRank(finding.severity) + 30,
    message: finding.message,
    affected_files: finding.affected_files,
    source_events: finding.source_events,
    evidence: finding.evidence,
    suggested_action: finding.suggested_action,
    stageable: true,
    preview_endpoint: "/api/maintenance/stage-finding/preview",
    stage_endpoint: "/api/maintenance/stage-finding"
  });
}

function maintenanceFindingFromLint(issue: LintIssue): MaintenanceFinding {
  return withFindingId({
    source: "lint",
    source_id: issue.code,
    code: "lint:" + issue.code,
    severity: issue.severity,
    rank: severityRank(issue.severity) + 20,
    message: issue.message,
    affected_files: issue.affected_files,
    source_events: issue.source_events,
    evidence: issue.details ? [issue.details] : [],
    suggested_action: "Inspect the lint finding manually; staging is deferred to an explicit health/review action.",
    stageable: false
  });
}

function maintenanceFindingFromThroughput(lane: ReviewThroughputResult["bottlenecks"][number]): MaintenanceFinding {
  return withFindingId({
    source: "review_throughput",
    source_id: lane.lane_id,
    code: "review_throughput:" + lane.lane_id,
    severity: lane.blocked_count > 0 ? "medium" : "low",
    rank: (lane.blocked_count + lane.item_count) * 5,
    message: lane.label + " has " + String(lane.item_count) + " review item(s), " + String(lane.blocked_count) + " blocked.",
    affected_files: [],
    source_events: [],
    evidence: ["item_ids: " + (lane.item_ids.join(", ") || "none"), "required_inputs: " + (lane.required_inputs.join(", ") || "none")],
    suggested_action: lane.action_checklist[0] ?? "Inspect the review lane manually.",
    stageable: false
  });
}

function withFindingId(input: Omit<MaintenanceFinding, "finding_id">): MaintenanceFinding {
  return {
    ...input,
    finding_id: "mnt_" + input.source + "_" + stableHash(stableJson({
      source: input.source,
      source_id: input.source_id,
      code: input.code,
      message: input.message,
      affected_files: uniqueSorted(input.affected_files),
      source_events: uniqueSorted(input.source_events),
      evidence: uniqueSorted(input.evidence)
    })).slice(0, 12)
  };
}

function selectFindings(
  findings: MaintenanceFinding[],
  options: { mode: MaintenanceMode; seed: string; topic?: string; limit?: number }
): MaintenanceFinding[] {
  let selected = dedupeMaintenanceFindings(findings);
  if (options.mode === "topic" && options.topic) {
    const topic = options.topic.toLowerCase();
    selected = selected.filter((finding) =>
      [finding.code, finding.message, ...finding.affected_files, ...finding.evidence].some((value) => value.toLowerCase().includes(topic))
    );
  }
  selected.sort((left, right) => right.rank - left.rank || left.finding_id.localeCompare(right.finding_id));
  if (options.mode === "random") {
    selected.sort((left, right) => stableHash(options.seed + ":" + left.finding_id).localeCompare(stableHash(options.seed + ":" + right.finding_id)));
  }
  const limit = options.limit ?? (options.mode === "full" ? 50 : 12);
  return selected.slice(0, limit);
}

function summarizeMaintenanceFindings(findings: MaintenanceFinding[]): MaintenancePlanResult["summary"] {
  return {
    total_findings: findings.length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
    stageable: findings.filter((finding) => finding.stageable).length,
    health: findings.filter((finding) => finding.source === "health").length,
    lint: findings.filter((finding) => finding.source === "lint").length,
    review_throughput: findings.filter((finding) => finding.source === "review_throughput").length
  };
}

function healthForOneFinding(health: MemoryHealthResult, finding: MemoryHealthFinding): MemoryHealthResult {
  return {
    ...health,
    findings: [finding],
    affected_files: uniqueSorted(finding.affected_files),
    source_events: uniqueSorted(finding.source_events),
    suggested_actions: [finding.suggested_action]
  };
}

function dedupeMaintenanceFindings(findings: MaintenanceFinding[]): MaintenanceFinding[] {
  const seen = new Set<string>();
  const output: MaintenanceFinding[] = [];
  for (const finding of findings) {
    if (seen.has(finding.finding_id)) {
      continue;
    }
    seen.add(finding.finding_id);
    output.push(finding);
  }
  return output;
}

function normalizeRunPath(runIdOrPath: string): string {
  if (runIdOrPath.startsWith(runDir)) {
    return runIdOrPath;
  }
  const file = runIdOrPath.endsWith(".json") ? runIdOrPath : runIdOrPath + ".json";
  return path.join(runDir, path.basename(file));
}

function severityRank(severity: MemoryHealthSeverity): number {
  if (severity === "high") {
    return 300;
  }
  if (severity === "medium") {
    return 200;
  }
  return 100;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
