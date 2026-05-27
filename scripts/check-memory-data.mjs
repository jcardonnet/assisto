#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const guardedPaths = ["memory/events", "memory/transactions"];

function usage() {
  console.log(`Usage: pnpm check:memory-data [options]

Fails when implementation branches change user memory data under memory/events or memory/transactions.

Options:
  --base <ref>     Compare committed changes against ref. Default: origin/main.
  --no-base        Only inspect working tree/index status.
  --allow          Allow changes and exit 0.
  --json           Print machine-readable JSON.
  --help           Show this help.

Set ASSISTO_ALLOW_MEMORY_DATA_CHANGES=1 to allow intentional memory data edits.
`);
}

function parseArgs(argv) {
  const options = {
    base: "origin/main",
    useBase: true,
    allow: process.env.ASSISTO_ALLOW_MEMORY_DATA_CHANGES === "1",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--base") {
      options.base = argv[index + 1];
      options.useBase = true;
      index += 1;
      continue;
    }
    if (arg === "--no-base") {
      options.useBase = false;
      continue;
    }
    if (arg === "--allow") {
      options.allow = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function unique(items) {
  return [...new Set(items.filter((item) => item.trim() !== ""))].sort();
}

function statusPaths() {
  const output = runGit(["status", "--porcelain", "--", ...guardedPaths]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}

function diffPaths(base) {
  try {
    const output = runGit(["diff", "--name-only", `${base}...HEAD`, "--", ...guardedPaths]);
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const changed = unique([
    ...statusPaths(),
    ...(options.useBase ? diffPaths(options.base) : [])
  ]);

  const result = {
    guardedPaths,
    base: options.useBase ? options.base : null,
    allowed: options.allow,
    changed
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (changed.length === 0) {
    console.log("memory data guard passed: no memory/events or memory/transactions changes detected");
  } else {
    console.log("memory data guard found guarded changes:");
    for (const path of changed) {
      console.log(`- ${path}`);
    }
  }

  if (changed.length > 0 && !options.allow) {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
