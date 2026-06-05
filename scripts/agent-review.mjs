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

function normalizeChangedFile(file) {
  let normalized = file.trim();
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function normalizeChangedFiles(changedFiles) {
  return unique(changedFiles.map(normalizeChangedFile).filter(Boolean));
}

function focusAreasForPlan(validationPlan) {
  const categories = validationPlan.categories;
  const areas = [];
  if (categories.includes("core")) {
    areas.push("core-memory-semantics");
  }
  if (categories.includes("workbench")) {
    areas.push("workbench-ui");
  }
  if (categories.includes("cli")) {
    areas.push("cli-surface");
  }
  if (categories.includes("pi")) {
    areas.push("pi-surface");
  }
  if (categories.includes("workflow") || categories.includes("tests")) {
    areas.push("workflow-and-tests");
  }
  if (categories.includes("eval-test-harness")) {
    areas.push("eval-test-harness");
  }
  if (categories.includes("memory")) {
    areas.push("canonical-memory-pages");
  }
  if (categories.includes("guarded-memory-data")) {
    areas.push("guarded-memory-data");
  }
  if (categories.includes("docs")) {
    areas.push("docs-process");
  }
  return unique(areas);
}

function formatValidationCommand(item) {
  const env = item.env ?? {};
  const preferredKeys = ["TMPDIR", "TEMP", "TMP"];
  const envParts = [
    ...preferredKeys.filter((key) => env[key] !== undefined).map((key) => `${key}=${env[key]}`),
    ...Object.keys(env)
      .filter((key) => !preferredKeys.includes(key))
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${key}=${env[key]}`)
  ];
  return [...envParts, item.command].join(" ");
}

function checksForPlan(kind, focusAreas) {
  const checks = kind === "invariant" ? [...commonInvariantChecks] : [...testReviewChecks];
  if (focusAreas.includes("workbench-ui")) {
    checks.push("Check Workbench actions route durable changes through transaction-backed helpers.");
  }
  if (focusAreas.includes("guarded-memory-data")) {
    checks.push("Check guarded memory data was intentionally approved before any staging.");
  }
  if (focusAreas.includes("canonical-memory-pages")) {
    checks.push("Check canonical memory page edits are explicit, reviewed, and transaction-backed.");
  }
  if (focusAreas.includes("workflow-and-tests")) {
    checks.push("Check workflow helpers do not stage guarded memory data or hide failing validation.");
  }
  if (focusAreas.includes("eval-test-harness")) {
    checks.push("Check eval harness changes preserve scenario, fixture, and golden-threshold expectations.");
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
  const validationPlan = buildValidationPlan({ changedFiles: normalizedFiles });
  const focusAreas = focusAreasForPlan(validationPlan);
  const plan = {
    schema_version: 1,
    kind,
    changed_files: normalizedFiles,
    focus_areas: focusAreas,
    checks: checksForPlan(kind, focusAreas),
    commands: validationPlan.commands.map(formatValidationCommand)
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
