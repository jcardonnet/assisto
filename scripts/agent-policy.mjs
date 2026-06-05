#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";

const tempEnv = {
  TMPDIR: "/tmp",
  TEMP: "/tmp",
  TMP: "/tmp"
};

function usage() {
  console.log(`Usage: pnpm agent:policy check [--json]
       pnpm agent:validate --plan [--json]
       pnpm agent:validate [--full|--ci-parity|--docs-only|--skip-browser]

Plans and runs deterministic validation based on changed files.
`);
}

function unique(values) {
  return [...new Set(values)].sort();
}

const commandProfiles = {
  lint: { cost: "low", required: true },
  typecheck: { cost: "low", required: true },
  test: { cost: "medium", required: true },
  "test:e2e": { cost: "high", required: true },
  "test:browser": { cost: "high", required: true },
  "eval:mvp": { cost: "medium", required: true },
  "eval:v2": { cost: "medium", required: true },
  "eval:v3": { cost: "medium", required: true },
  "eval:retrieval": { cost: "medium", required: true },
  "eval:source-adapters": { cost: "medium", required: true },
  "eval:v4": { cost: "high", required: true },
  "eval:v5": { cost: "high", required: true },
  "eval:v6": { cost: "high", required: true },
  "eval:dogfood-local": { cost: "medium", required: true },
  "eval:v7": { cost: "high", required: true },
  "eval:answers": { cost: "medium", required: true },
  "eval:context-packs": { cost: "medium", required: true },
  "eval:v8": { cost: "high", required: true },
  "eval:v9": { cost: "high", required: true },
  "eval:v10": { cost: "high", required: true },
  "eval:maintenance": { cost: "medium", required: true },
  "check:memory-data": { cost: "low", required: true }
};

const ciEvalChain = [
  "eval:mvp",
  "eval:v2",
  "eval:v3",
  "eval:retrieval",
  "eval:v4",
  "eval:v5",
  "eval:v6",
  "eval:dogfood-local",
  "eval:v7",
  "eval:answers",
  "eval:context-packs",
  "eval:v8",
  "eval:v9",
  "eval:v10",
  "eval:maintenance"
];

const fullEvalChain = [
  "eval:mvp",
  "eval:v2",
  "eval:v3",
  "eval:retrieval",
  "eval:source-adapters",
  "eval:v4",
  "eval:v5",
  "eval:v6",
  "eval:dogfood-local",
  "eval:v7",
  "eval:answers",
  "eval:context-packs",
  "eval:v8",
  "eval:v9",
  "eval:v10",
  "eval:maintenance"
];

const recentUiEvalSubset = [
  "eval:v4",
  "eval:v5",
  "eval:v6",
  "eval:dogfood-local",
  "eval:v7",
  "eval:answers",
  "eval:context-packs",
  "eval:v8",
  "eval:v9",
  "eval:v10"
];

const ciParityCommandNames = ["test:e2e", "test:browser", ...ciEvalChain, "check:memory-data"];
const fullCommandNames = ["test:e2e", ...fullEvalChain, "test:browser", "check:memory-data"];
const evalHarnessCommandNames = [...fullEvalChain, "check:memory-data"];
const workbenchCommandNames = ["test:e2e", "test:browser", ...recentUiEvalSubset, "check:memory-data"];
const coreBehaviorCommandNames = [...fullEvalChain, "check:memory-data"];

const targetedGroups = {
  agent: ["tests/agent-control.mjs", "tests/agent-policy.mjs", "tests/agent-runner.mjs", "tests/agent-pr.mjs"],
  "scenario-factory": ["tests/scenario-factory.mjs"],
  workbench: ["tests/workbench.mjs", "tests/browser/workbench-*.spec.mjs"],
  retrieval: ["tests/scenarios/run-retrieval.mjs", "tests/scenarios/run-answers.mjs"],
  memory: ["tests/check-memory-data.mjs", "tests/core-v3-memory-hardening.mjs"]
};

export const capabilityValidationGroups = {
  "ask-answer-contract": ["eval:answers", "eval:v8"],
  capture: ["test:e2e", "test:browser", "eval:v5", "eval:v7"],
  "entity-stewardship": ["eval:v8", "test:browser"],
  "context-operating-room": ["eval:v8", "test:browser"]
};

function command(name, reason) {
  const profile = commandProfiles[name];
  if (profile === undefined) {
    throw new Error(`No validation command profile exists for ${name}.`);
  }
  return {
    name,
    command: name === "check:memory-data" ? "pnpm check:memory-data" : `pnpm ${name}`,
    env: name.startsWith("test") || name.startsWith("eval") ? { ...tempEnv } : {},
    reason,
    cost: profile.cost,
    required: profile.required
  };
}

function commandList(names, reason) {
  return names.map((name) => command(name, reason));
}

const canonicalMemoryRoots = [
  "memory/contexts/",
  "memory/followups/",
  "memory/logs/",
  "memory/people/",
  "memory/review/",
  "memory/topics/"
];

function classifyFile(file) {
  if (file.startsWith("memory/events/") || file.startsWith("memory/transactions/")) {
    return "guarded-memory-data";
  }
  if (canonicalMemoryRoots.some((root) => file.startsWith(root))) {
    return "memory";
  }
  if (file.startsWith(".obsidian/")) {
    return "obsidian";
  }
  if (file.startsWith("packages/core/") || file.startsWith("memory/schema/")) {
    return "core";
  }
  if (file.startsWith("packages/workbench/") || file.startsWith("tests/browser/")) {
    return "workbench";
  }
  if (file.startsWith("packages/pi-extension/") || file.startsWith(".pi/")) {
    return "pi";
  }
  if (file.startsWith("packages/cli/")) {
    return "cli";
  }
  if (file.startsWith("tests/scenarios/") || file.startsWith("tests/golden/") || file.startsWith("tests/eval/")) {
    return "eval-test-harness";
  }
  if (file.startsWith("tests/")) {
    return "tests";
  }
  if (
    file.startsWith("scripts/") ||
    file === "package.json" ||
    file === ".gitignore" ||
    file.startsWith(".github/") ||
    file.startsWith(".devcontainer/") ||
    file.startsWith(".assisto-agent/")
  ) {
    return "workflow";
  }
  if (file.startsWith("docs/") || file === "README.md" || file === "AGENTS.md") {
    return "docs";
  }
  return "repo";
}

function hasAny(categories, values) {
  return values.some((value) => categories.includes(value));
}

function hasChangedFile(changedFiles, paths) {
  return changedFiles.some((file) => paths.includes(file));
}

function inferTargetedGroups(categories, changedFiles) {
  const groups = [];
  if (hasAny(categories, ["workflow"]) || hasChangedFile(changedFiles, targetedGroups.agent)) {
    groups.push({ name: "agent", commands: targetedGroups.agent });
  }
  if (hasChangedFile(changedFiles, ["tests/scenario-factory.mjs", "tests/helpers/scenario-factory.mjs"])) {
    groups.push({ name: "scenario-factory", commands: targetedGroups["scenario-factory"] });
  }
  if (hasAny(categories, ["workbench"])) {
    groups.push({ name: "workbench", commands: targetedGroups.workbench });
  }
  if (hasAny(categories, ["core", "eval-test-harness"])) {
    groups.push({ name: "retrieval", commands: targetedGroups.retrieval });
  }
  if (hasAny(categories, ["guarded-memory-data", "memory"])) {
    groups.push({ name: "memory", commands: targetedGroups.memory });
  }
  return groups;
}

function addCommands(commands, additions) {
  const existing = new Set(commands.map((item) => item.name));
  for (const addition of additions) {
    if (!existing.has(addition.name)) {
      commands.push(addition);
      existing.add(addition.name);
    }
  }
}

export function explainChangedFiles(changedFiles) {
  return unique(changedFiles).map((file) => {
    const category = classifyFile(file);
    return {
      file,
      category,
      reason: `Classified as ${category} by deterministic path rules.`
    };
  });
}

export function buildValidationPlan({
  changedFiles,
  full = false,
  ciParity = false,
  docsOnly = false,
  skipBrowser = false
}) {
  const categories = unique(changedFiles.map(classifyFile));
  let mode = "docs-process";
  const commands = [];

  const base = [
    command("lint", "All changes must satisfy lint rules."),
    command("typecheck", "All changes must satisfy TypeScript checks."),
    command("test", "Unit and integration tests cover repo behavior.")
  ];
  addCommands(commands, base);

  if (full || ciParity) {
    mode = full ? "full" : "ci-parity";
    const fullCommands = ciParity ? ciParityCommandNames : fullCommandNames;
    const reason = ciParity ? "CI parity validation requested." : "Full validation requested.";
    addCommands(commands, commandList(fullCommands, reason));
  } else if (docsOnly) {
    mode = "docs-process";
  } else if (hasAny(categories, ["eval-test-harness"])) {
    mode = "eval-test-harness";
    addCommands(
      commands,
      commandList(evalHarnessCommandNames, "Eval/test harness changes require the full eval chain.")
    );
  } else if (hasAny(categories, ["workbench"])) {
    mode = "workbench-browser";
    addCommands(
      commands,
      commandList(workbenchCommandNames, "Workbench/browser changes require UI and recent eval coverage.")
    );
  } else if (hasAny(categories, ["core", "cli", "pi"])) {
    mode = "core-behavior";
    addCommands(
      commands,
      commandList(coreBehaviorCommandNames, "Core/CLI/Pi behavior changes require deterministic eval coverage.")
    );
  } else if (hasAny(categories, ["workflow", "tests", "repo"])) {
    mode = "workflow-scripts";
    addCommands(commands, [command("check:memory-data", "Workflow/test changes should prove guarded memory data was not edited.")]);
  }
  if (hasAny(categories, ["guarded-memory-data", "memory"])) {
    if (mode === "docs-process") {
      mode = "memory-guarded";
    }
    addCommands(commands, [command("check:memory-data", "Guarded memory-data changes must be checked explicitly.")]);
  }

  const filteredCommands = skipBrowser ? commands.filter((item) => item.name !== "test:browser") : commands;
  const selectedNames = new Set(filteredCommands.map((item) => item.name));
  const skipped = Object.keys(commandProfiles)
    .filter((name) => !selectedNames.has(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const reason =
        docsOnly ? "Skipped because docs-only validation was requested."
        : skipBrowser && name === "test:browser" ? "Skipped because browser tests were explicitly disabled via the skipBrowser flag."
        : `Skipped because mode ${mode} does not require it.`;
      return {
        name,
        reason,
        cost: commandProfiles[name].cost,
        required: false
      };
    });

  return {
    mode,
    categories,
    changed_files: changedFiles,
    file_reasons: explainChangedFiles(changedFiles),
    targeted_groups: inferTargetedGroups(categories, changedFiles),
    capability_groups: capabilityValidationGroups,
    commands: filteredCommands,
    skipped
  };
}

export function buildPolicyResult({ changedFiles, ...planOptions }) {
  const categories = unique(changedFiles.map(classifyFile));
  const findings = [];

  const guarded = changedFiles.filter((file) => file.startsWith("memory/events/") || file.startsWith("memory/transactions/"));
  if (guarded.length > 0) {
    findings.push({
      severity: "error",
      code: "guarded_memory_data_changed",
      message: "Implementation branches must not edit user memory Events or Transactions without explicit approval.",
      files: guarded
    });
  }

  const obsidian = changedFiles.filter((file) => file.startsWith(".obsidian/"));
  if (obsidian.length > 0) {
    findings.push({
      severity: "error",
      code: "obsidian_changed",
      message: "Repo policy forbids writes to .obsidian/.",
      files: obsidian
    });
  }

  return {
    passed: findings.every((finding) => finding.severity !== "error"),
    categories,
    findings,
    validation_plan: buildValidationPlan({ changedFiles, ...planOptions })
  };
}

function runGit(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    if (error.status === 0 && stdout !== "") {
      return stdout.trim();
    }
    return "";
  }
}

function changedFilesFromGit() {
  const names = [
    ...runGit(["diff", "--name-only", "origin/main...HEAD"]).split("\n"),
    ...runGit(["status", "--porcelain"]).split("\n").map((line) => line.replace(/^.{2}\s?/u, "").trim())
  ];
  return unique(names.filter(Boolean));
}

function parseArgs(argv) {
  const options = { _: [] };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg.startsWith("--")) {
      options[arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }
    options._.push(arg);
  }
  return options;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.commands !== undefined) {
    console.log(`Validation mode: ${value.mode}`);
    console.log(`Categories: ${value.categories.join(", ") || "none"}`);
    for (const item of value.commands) {
      console.log(`- ${item.command}: ${item.reason}`);
    }
    if ((value.targeted_groups ?? []).length > 0) {
      console.log("Targeted groups:");
      for (const group of value.targeted_groups) {
        console.log(`- ${group.name}: ${group.commands.join(", ")}`);
      }
    }
    if (value.capability_groups !== undefined) {
      console.log("Capability groups:");
      for (const [name, commands] of Object.entries(value.capability_groups)) {
        console.log(`- ${name}: ${commands.join(", ")}`);
      }
    }
    if ((value.skipped ?? []).length > 0) {
      console.log("Skipped:");
      for (const item of value.skipped) {
        console.log(`- ${item.name}: ${item.reason}`);
      }
    }
    return;
  }
  console.log(`Policy: ${value.passed ? "passed" : "failed"}`);
  console.log(`Categories: ${value.categories.join(", ") || "none"}`);
  for (const finding of value.findings) {
    console.log(`- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
  }
}

function runCommand(item) {
  const args = item.name === "check:memory-data" ? ["check:memory-data"] : [item.name];
  console.log(`\n$ ${item.command}`);
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...item.env
    }
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === "--help" || rest.includes("--help") || rest.includes("-h")) {
    usage();
    return;
  }
  const options = parseArgs(rest);
  const changedFiles = changedFilesFromGit();

  if (command === "policy") {
    const subcommand = options._[0];
    if (subcommand !== "check") {
      throw new Error("agent:policy requires the `check` subcommand.");
    }
    print(buildPolicyResult({ changedFiles }), options.json === true);
    return;
  }

  if (command === "validate") {
    const plan = buildValidationPlan({
      changedFiles,
      full: options.full === true,
      ciParity: options.ciParity === true,
      docsOnly: options.docsOnly === true,
      skipBrowser: options.skipBrowser === true
    });
    if (options.plan === true) {
      print(plan, options.json === true);
      return;
    }
    for (const item of plan.commands) {
      runCommand(item);
    }
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
