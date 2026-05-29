#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const guardedPaths = ["memory/events", "memory/transactions"];

function usage() {
  console.log(`Usage: pnpm check:memory-data [options]

Fails when implementation branches stage, modify, or commit user memory data under memory/events or memory/transactions.
Untracked guarded files are reported separately as local dogfood data so they can be preserved without blocking product PRs.

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
  }).replace(/\r\n/g, "\n");
}

function unique(items) {
  return [...new Set(items.filter((item) => item.trim() !== ""))].sort();
}

function statusPaths() {
  const output = runGit(["status", "--porcelain=v1", "-uall", "--", ...guardedPaths]);
  const result = {
    staged_paths: [],
    unstaged_paths: [],
    untracked_user_memory_paths: []
  };

  for (const line of output.split("\n").filter(Boolean)) {
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const path = statusPath(line);

    if (line.startsWith("?? ")) {
      result.untracked_user_memory_paths.push(path);
      continue;
    }

    if (indexStatus !== " ") {
      result.staged_paths.push(path);
    }

    if (worktreeStatus !== " ") {
      result.unstaged_paths.push(path);
    }
  }

  return {
    staged_paths: unique(result.staged_paths),
    unstaged_paths: unique(result.unstaged_paths),
    untracked_user_memory_paths: unique(result.untracked_user_memory_paths)
  };
}

function statusPath(line) {
  const rawPath = line.slice(3).trim();
  const renameTarget = rawPath.split(" -> ").at(-1);
  return renameTarget ?? rawPath;
}

function diffPaths(base) {
  try {
    const output = runGit(["diff", "--name-only", `${base}...HEAD`, "--", ...guardedPaths]);
    return unique(output.split("\n").filter(Boolean));
  } catch {
    return [];
  }
}

function formatList(label, paths) {
  if (paths.length === 0) {
    return [];
  }

  return [label, ...paths.map((path) => `- ${path}`)];
}

function printHuman(result) {
  if (!result.has_blocking_changes && !result.has_untracked_user_memory) {
    console.log("memory data guard passed: no memory/events or memory/transactions changes detected");
    return;
  }

  if (result.has_blocking_changes) {
    console.log("memory data guard found guarded implementation changes:");
    for (const line of [
      ...formatList("tracked diff:", result.tracked_diff_paths),
      ...formatList("staged changes:", result.staged_paths),
      ...formatList("unstaged changes:", result.unstaged_paths)
    ]) {
      console.log(line);
    }
  } else {
    console.log("memory data guard passed: no staged, modified, or committed guarded changes detected");
  }

  if (result.has_untracked_user_memory) {
    console.log("untracked user memory files detected and preserved:");
    for (const path of result.untracked_user_memory_paths) {
      console.log(`- ${path}`);
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const status = statusPaths();
  const tracked_diff_paths = options.useBase ? diffPaths(options.base) : [];
  const changed = unique([...tracked_diff_paths, ...status.staged_paths, ...status.unstaged_paths]);

  const result = {
    guardedPaths,
    base: options.useBase ? options.base : null,
    allowed: options.allow,
    tracked_diff_paths,
    staged_paths: status.staged_paths,
    unstaged_paths: status.unstaged_paths,
    untracked_user_memory_paths: status.untracked_user_memory_paths,
    changed,
    has_blocking_changes: changed.length > 0,
    has_untracked_user_memory: status.untracked_user_memory_paths.length > 0
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.has_blocking_changes && !options.allow) {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
