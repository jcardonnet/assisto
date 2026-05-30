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

function command(name, reason) {
  return {
    name,
    command: name === "check:memory-data" ? "pnpm check:memory-data" : `pnpm ${name}`,
    env: name.startsWith("test") || name.startsWith("eval") ? { ...tempEnv } : {},
    reason
  };
}

function classifyFile(file) {
  if (file.startsWith("memory/events/") || file.startsWith("memory/transactions/")) {
    return "guarded-memory-data";
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

function addCommands(commands, additions) {
  const existing = new Set(commands.map((item) => item.name));
  for (const addition of additions) {
    if (!existing.has(addition.name)) {
      commands.push(addition);
      existing.add(addition.name);
    }
  }
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
    const fullCommands = ciParity
      ? [
          "test:e2e",
          "test:browser",
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
          "eval:v8",
          "check:memory-data"
        ]
      : [
          "test:e2e",
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
          "eval:v8",
          "test:browser",
          "check:memory-data"
        ];
    addCommands(commands, fullCommands.map((name) => command(name, "Full validation requested.")));
  } else if (docsOnly) {
    mode = "docs-process";
  } else if (hasAny(categories, ["eval-test-harness"])) {
    mode = "eval-test-harness";
    addCommands(
      commands,
      [
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
        "eval:v8",
        "check:memory-data"
      ].map((name) => command(name, "Eval/test harness changes require the full eval chain."))
    );
  } else if (hasAny(categories, ["workbench"])) {
    mode = "workbench-browser";
    addCommands(
      commands,
      [
        "test:e2e",
        "test:browser",
        "eval:v4",
        "eval:v5",
        "eval:v6",
        "eval:dogfood-local",
        "eval:v7",
        "eval:answers",
        "eval:v8",
        "check:memory-data"
      ].map((name) => command(name, "Workbench/browser changes require UI and recent eval coverage."))
    );
  } else if (hasAny(categories, ["core", "cli", "pi"])) {
    mode = "core-behavior";
    addCommands(
      commands,
      [
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
        "eval:v8",
        "check:memory-data"
      ].map((name) => command(name, "Core/CLI/Pi behavior changes require deterministic eval coverage."))
    );
  } else if (hasAny(categories, ["workflow", "tests", "repo"])) {
    mode = "workflow-scripts";
    addCommands(commands, [command("check:memory-data", "Workflow/test changes should prove guarded memory data was not edited.")]);
  }

  const filteredCommands = skipBrowser ? commands.filter((item) => item.name !== "test:browser") : commands;

  return {
    mode,
    categories,
    changed_files: changedFiles,
    commands: filteredCommands
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
