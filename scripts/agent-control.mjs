#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const schemaVersion = 1;
const allowedNoteKinds = new Set(["decision", "blocker", "validation", "review", "next"]);

function usage() {
  console.log(`Usage: pnpm agent:<command> [options]

Commands:
  start --slug <slug> --objective "<text>" [--branch codex/<slug>] [--resume] [--json]
  status [--json]
  handoff [--json]
  note --kind <decision|blocker|validation|review|next> --text "<text>" [--json]

Runtime state is stored under ignored .assisto-agent/runs/** files.
`);
}

function iso(now = new Date()) {
  return now.toISOString();
}

function timestampForId(now) {
  return iso(now).replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function agentDir(root) {
  return path.join(root, ".assisto-agent");
}

function runsDir(root) {
  return path.join(agentDir(root), "runs");
}

function activeRunPath(root) {
  return path.join(runsDir(root), "active-run");
}

function runPath(root, runId) {
  return path.join(runsDir(root), `${runId}.json`);
}

function defaultRunGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: options.root ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    if (error.status === 0 && stdout !== "") {
      return stdout.trim();
    }
    throw error;
  }
}

function parseChangedFiles(statusOutput) {
  return statusOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .sort();
}

function classifySubsystem(file) {
  if (file.startsWith("packages/core/")) {
    return "core";
  }
  if (file.startsWith("packages/workbench/")) {
    return "workbench";
  }
  if (file.startsWith("packages/cli/")) {
    return "cli";
  }
  if (file.startsWith("packages/pi-extension/") || file.startsWith(".pi/")) {
    return "pi";
  }
  if (file.startsWith("tests/")) {
    return "tests";
  }
  if (file.startsWith("docs/") || file === "README.md" || file === "AGENTS.md") {
    return "docs";
  }
  if (file.startsWith("scripts/") || file === "package.json" || file.startsWith(".github/") || file.startsWith(".devcontainer/")) {
    return "workflow";
  }
  if (file.startsWith("memory/events/") || file.startsWith("memory/transactions/")) {
    return "guarded-memory-data";
  }
  if (file.startsWith("memory/")) {
    return "memory";
  }
  return "repo";
}

function unique(values) {
  return [...new Set(values)].sort();
}

async function ensureRuntime(root) {
  await mkdir(runsDir(root), { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${filePath}.tmp`, filePath);
}

async function activeRunId(root) {
  const filePath = activeRunPath(root);
  if (!existsSync(filePath)) {
    return null;
  }
  const value = (await readFile(filePath, "utf8")).trim();
  return value === "" ? null : value;
}

export async function loadActiveRun({ root = process.cwd() } = {}) {
  const runId = await activeRunId(root);
  if (runId === null) {
    throw new Error("No active agent run exists.");
  }
  return await readJson(runPath(root, runId));
}

async function saveRun(root, run) {
  await ensureRuntime(root);
  await writeJson(runPath(root, run.id), run);
  await writeFile(activeRunPath(root), `${run.id}\n`);
}

function branchExists(branch, runGit, root) {
  try {
    runGit(["rev-parse", "--verify", branch], { root });
    return true;
  } catch {
    return false;
  }
}

function ensureBranch(branch, runGit, root) {
  const current = runGit(["branch", "--show-current"], { root });
  if (current === branch) {
    return;
  }
  if (branchExists(branch, runGit, root)) {
    runGit(["switch", branch], { root });
    return;
  }
  runGit(["switch", "-c", branch], { root });
}

export async function startAgentRun({
  root = process.cwd(),
  slug,
  objective,
  branch,
  resume = false,
  now = new Date(),
  runGit = defaultRunGit
}) {
  if (slug === undefined || slug.trim() === "") {
    throw new Error("--slug is required.");
  }
  if (objective === undefined || objective.trim() === "") {
    throw new Error("--objective is required.");
  }

  await ensureRuntime(root);
  const existingRunId = await activeRunId(root);
  if (existingRunId !== null) {
    if (!resume) {
      throw new Error(`Active agent run already exists: ${existingRunId}. Use --resume to continue it.`);
    }
    return await readJson(runPath(root, existingRunId));
  }

  const normalizedSlug = slugify(slug);
  if (normalizedSlug === "") {
    throw new Error("--slug must contain at least one letter or number.");
  }
  const targetBranch = branch ?? `codex/${normalizedSlug}`;
  ensureBranch(targetBranch, runGit, root);

  const statusOutput = runGit(["status", "--short"], { root });
  const changedFiles = parseChangedFiles(statusOutput);
  const createdAt = iso(now);
  const run = {
    id: `run_${timestampForId(now)}_${normalizedSlug}`,
    schema_version: schemaVersion,
    slug: normalizedSlug,
    objective: objective.trim(),
    branch: targetBranch,
    base_ref: "origin/main",
    created_at: createdAt,
    updated_at: createdAt,
    changed_files: changedFiles,
    touched_subsystems: unique(changedFiles.map(classifySubsystem)),
    commands: [],
    validation_status: "not_run",
    review_state: "not_requested",
    pr_url: null,
    blockers: [],
    next_action: "Implement the objective, then run validation.",
    notes: []
  };

  await saveRun(root, run);
  return run;
}

export async function addRunNote({ root = process.cwd(), kind, text, now = new Date() }) {
  if (!allowedNoteKinds.has(kind)) {
    throw new Error(`--kind must be one of: ${[...allowedNoteKinds].join(", ")}`);
  }
  if (text === undefined || text.trim() === "") {
    throw new Error("--text is required.");
  }
  const run = await loadActiveRun({ root });
  const trimmed = text.trim();
  run.updated_at = iso(now);
  run.notes.push({
    kind,
    text: trimmed,
    created_at: iso(now)
  });
  if (kind === "next") {
    run.next_action = trimmed;
  }
  if (kind === "blocker" && !run.blockers.includes(trimmed)) {
    run.blockers.push(trimmed);
  }
  if (kind === "validation") {
    run.validation_status = trimmed.toLowerCase().includes("pass") ? "passed" : "partial";
  }
  if (kind === "review") {
    run.review_state = trimmed.toLowerCase().includes("request") ? "requested" : run.review_state;
  }
  await saveRun(root, run);
  return run;
}

export function formatHandoff(run) {
  const notes = run.notes.length === 0
    ? "- No notes recorded yet."
    : run.notes.map((note) => `- ${note.created_at} [${note.kind}] ${note.text}`).join("\n");
  const changedFiles = run.changed_files.length === 0
    ? "- No changed files recorded at run start."
    : run.changed_files.map((file) => `- ${file}`).join("\n");

  return `# Agent Run Handoff

Run: ${run.id}
Objective: ${run.objective}
Branch: ${run.branch}
Base: ${run.base_ref}
Validation: ${run.validation_status}
Review: ${run.review_state}
PR: ${run.pr_url ?? "none"}
Next action: ${run.next_action}

## Touched Subsystems

${run.touched_subsystems.length === 0 ? "- none" : run.touched_subsystems.map((item) => `- ${item}`).join("\n")}

## Changed Files At Start

${changedFiles}

## Blockers

${run.blockers.length === 0 ? "- none" : run.blockers.map((item) => `- ${item}`).join("\n")}

## Notes

${notes}
`;
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      if (key === "json" || key === "resume") {
        options[key] = true;
      } else {
        options[key] = argv[index + 1];
        index += 1;
      }
      continue;
    }
    options._.push(arg);
  }
  return options;
}

function printResult(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value.trimEnd());
    return;
  }
  console.log(`Agent run: ${value.id}`);
  console.log(`Objective: ${value.objective}`);
  console.log(`Branch: ${value.branch}`);
  console.log(`Validation: ${value.validation_status}`);
  console.log(`Review: ${value.review_state}`);
  console.log(`Next action: ${value.next_action}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h" || rest.includes("--help") || rest.includes("-h")) {
    usage();
    return;
  }
  const options = parseArgs(rest);

  if (command === "start") {
    printResult(
      await startAgentRun({
        slug: options.slug,
        objective: options.objective,
        branch: options.branch,
        resume: options.resume === true
      }),
      options.json === true
    );
    return;
  }

  if (command === "status") {
    printResult(await loadActiveRun(), options.json === true);
    return;
  }

  if (command === "handoff") {
    const run = await loadActiveRun();
    printResult(options.json === true ? run : formatHandoff(run), options.json === true);
    return;
  }

  if (command === "note") {
    printResult(
      await addRunNote({
        kind: options.kind,
        text: options.text
      }),
      options.json === true
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
