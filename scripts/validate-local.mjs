#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const tempEnv = {
  TMPDIR: "/tmp",
  TEMP: "/tmp",
  TMP: "/tmp"
};

const localOrder = [
  "lint",
  "typecheck",
  "test",
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
  "test:browser"
];

const ciOrder = [
  "lint",
  "typecheck",
  "test",
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
  "eval:v8"
];

function usage() {
  console.log(`Usage: pnpm validate:local [options]

Runs the full local validation suite with WSL-safe temp/cache environment variables.

Options:
  --ci-parity       Use the same command order as GitHub Actions.
  --skip-browser    Skip Chromium Playwright browser tests.
  --list            Print commands without running them.
  --help            Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    ciParity: false,
    skipBrowser: false,
    list: false
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--ci-parity") {
      options.ciParity = true;
      continue;
    }
    if (arg === "--skip-browser") {
      options.skipBrowser = true;
      continue;
    }
    if (arg === "--list") {
      options.list = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function commandList(options) {
  const selected = options.ciParity ? ciOrder : localOrder;
  return selected.filter((script) => !(options.skipBrowser && script === "test:browser"));
}

function formatCommand(script) {
  return `TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm ${script}`;
}

function runScript(script) {
  console.log(`\n$ ${formatCommand(script)}`);
  const result = spawnSync("pnpm", [script], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...tempEnv
    }
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const scripts = commandList(options);

  if (options.list) {
    for (const script of scripts) {
      console.log(formatCommand(script));
    }
    process.exit(0);
  }

  for (const script of scripts) {
    runScript(script);
  }

  console.log("\nlocal validation passed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
