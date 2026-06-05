#!/usr/bin/env node

import { buildValidationPlan } from "./agent-policy.mjs";

const allowedKinds = new Set(["invariant", "tests"]);

const commonInvariantChecks = [
  "Check for direct canonical writes to memory pages outside Event and Transaction helpers.",
  "Check every durable claim path preserves Event evidence.",
  "Check unscoped system, project, or context claims remain staged.",
  "Check generated answers, briefs, context packs, symbolic output, and Workbench state are not persisted as canonical memory.",
  "Check entity ambiguity does not auto-merge people or topics.",
  "Check contradiction handling stages review instead of resolving autonomously."
];

const testReviewChecks = [
  "Check changed behavior has a focused regression test.",
  "Check targeted tests cover the changed files and public surfaces.",
  "Check validation commands match the changed-file policy.",
  "Check broad gates still include lint, typecheck, test, and memory-data guard."
];

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeChangedFiles(changedFiles) {
  return unique(changedFiles.map((file) => file.trim()).filter(Boolean));
}

function focusAreasForFiles(changedFiles) {
  const areas = [];
  if (changedFiles.some((file) => file.startsWith("packages/core/") || file.startsWith("memory/schema/"))) {
    areas.push("core-memory-semantics");
  }
  if (changedFiles.some((file) => file.startsWith("packages/workbench/") || file.startsWith("tests/browser/"))) {
    areas.push("workbench-ui");
  }
  if (changedFiles.some((file) => file.startsWith("packages/cli/"))) {
    areas.push("cli-surface");
  }
  if (changedFiles.some((file) => file.startsWith("packages/pi-extension/") || file.startsWith(".pi/"))) {
    areas.push("pi-surface");
  }
  if (changedFiles.some((file) => file.startsWith("tests/") || file.startsWith("scripts/"))) {
    areas.push("workflow-and-tests");
  }
  if (changedFiles.some((file) => file.startsWith("memory/events/") || file.startsWith("memory/transactions/"))) {
    areas.push("guarded-memory-data");
  }
  if (changedFiles.some((file) => file.startsWith("docs/") || file === "README.md" || file === "AGENTS.md")) {
    areas.push("docs-process");
  }
  return unique(areas);
}

function commandsForFiles(changedFiles) {
  const plan = buildValidationPlan({ changedFiles });
  return plan.commands.map((item) => {
    if (item.env?.TMPDIR === "/tmp") {
      return `TMPDIR=/tmp ${item.command}`;
    }
    return item.command;
  });
}

function checksForPlan(kind, focusAreas) {
  const checks = kind === "invariant" ? [...commonInvariantChecks] : [...testReviewChecks];
  if (focusAreas.includes("workbench-ui")) {
    checks.push("Check Workbench actions route durable changes through transaction-backed helpers.");
  }
  if (focusAreas.includes("guarded-memory-data")) {
    checks.push("Check guarded memory data was intentionally approved before any staging.");
  }
  if (focusAreas.includes("workflow-and-tests")) {
    checks.push("Check workflow helpers do not stage guarded memory data or hide failing validation.");
  }
  return checks;
}

function subagentPromptForPlan(plan) {
  const checks = plan.checks.map((check) => `- ${check}`).join("\n");
  const commands = plan.commands.map((command) => `- ${command}`).join("\n");
  const files = plan.changed_files.map((file) => `- ${file}`).join("\n") || "- none supplied";
  return `Review kind: ${plan.kind}

Changed files:
${files}

Checks:
${checks}

Validation commands to consider:
${commands}

Report only concrete risks, missing tests, or a clear pass. Do not edit files.`;
}

export function buildReviewPlan({ kind = "invariant", changedFiles = [] } = {}) {
  if (!allowedKinds.has(kind)) {
    throw new Error(`Unknown review kind: ${kind}. Expected one of: ${[...allowedKinds].join(", ")}.`);
  }
  const normalizedFiles = normalizeChangedFiles(changedFiles);
  const focusAreas = focusAreasForFiles(normalizedFiles);
  const plan = {
    schema_version: 1,
    kind,
    changed_files: normalizedFiles,
    focus_areas: focusAreas,
    checks: checksForPlan(kind, focusAreas),
    commands: commandsForFiles(normalizedFiles)
  };
  return {
    ...plan,
    subagent_prompt: subagentPromptForPlan(plan)
  };
}

export function parseReviewArgs(argv) {
  const options = { kind: "invariant", files: [], json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--kind") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error("--kind requires a value.");
      }
      options.kind = next;
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--") {
      continue;
    }
    options.files.push(arg);
  }
  return options;
}

function usage() {
  console.log(`Usage: pnpm agent:review [--kind invariant|tests] [--json] <changed-file...>

Builds deterministic local review prompts for subagent invariant and test review.`);
}

function printPlan(plan, json) {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`# ${plan.kind} review`);
  console.log(`Focus areas: ${plan.focus_areas.join(", ") || "none"}`);
  console.log("\nChecks:");
  for (const check of plan.checks) {
    console.log(`- ${check}`);
  }
  console.log("\nCommands:");
  for (const command of plan.commands) {
    console.log(`- ${command}`);
  }
  console.log("\nSubagent prompt:");
  console.log(plan.subagent_prompt);
}

function main() {
  const options = parseReviewArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  printPlan(buildReviewPlan({ kind: options.kind, changedFiles: options.files }), options.json);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
