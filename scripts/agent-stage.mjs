#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const guardedRoots = ["memory/events", "memory/transactions"];

function usage() {
  console.log(`Usage: pnpm agent:stage [--json] [--allow-memory-data --yes] <path...>

Stages explicit paths while refusing memory/events/** and memory/transactions/** by default.
`);
}

function normalizePath(input, root) {
  const platformInput = input.replace(/\\/gu, path.sep);
  const absolutePath = path.isAbsolute(platformInput) ? path.resolve(platformInput) : path.resolve(root, platformInput);
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  return path.posix.normalize(relativePath);
}

function uniqueSorted(paths, root) {
  return [...new Set(paths.map((item) => normalizePath(item, root)).filter((item) => item !== "."))].sort((left, right) => left.localeCompare(right));
}

function isGuardedPath(filePath) {
  return guardedRoots.some((root) => filePath === root || filePath.startsWith(`${root}/`));
}

export function classifyStageRequest({ paths, allowMemoryData = false, root = process.cwd() }) {
  const normalized = uniqueSorted(paths, root);
  const guarded = normalized.filter(isGuardedPath);
  const allowed = allowMemoryData ? normalized : normalized.filter((item) => !isGuardedPath(item));

  return {
    allowed: guarded.length === 0 || allowMemoryData,
    allowed_paths: allowed,
    guarded_paths: allowMemoryData ? [] : guarded,
    refused_reason:
      guarded.length > 0 && !allowMemoryData ? "guarded_memory_data_requires_explicit_allow" : null
  };
}

function parseArgs(argv) {
  const options = { paths: [], json: false, allowMemoryData: false, yes: false, help: false };
  let parsingOptions = true;

  for (const arg of argv) {
    if (parsingOptions && arg === "--") {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && (arg === "--help" || arg === "-h")) {
      options.help = true;
      continue;
    }
    if (parsingOptions && arg === "--json") {
      options.json = true;
      continue;
    }
    if (parsingOptions && arg === "--allow-memory-data") {
      options.allowMemoryData = true;
      continue;
    }
    if (parsingOptions && arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (parsingOptions && arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options.paths.push(arg);
  }

  return options;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.allowed) {
    for (const filePath of result.allowed_paths) {
      console.log(`stage: ${filePath}`);
    }
  } else {
    console.log("refusing to stage because guarded memory data was included");
  }
  for (const filePath of result.guarded_paths) {
    console.log(`refuse guarded memory data: ${filePath}`);
  }
}

function stage(paths) {
  if (paths.length === 0) {
    return;
  }

  const result = spawnSync("git", ["add", "--", ...paths], { stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.paths.length === 0) {
    usage();
    return;
  }
  if (options.allowMemoryData && !options.yes) {
    throw new Error("--allow-memory-data requires --yes.");
  }

  const result = classifyStageRequest({
    paths: options.paths,
    allowMemoryData: options.allowMemoryData,
    root: process.cwd()
  });
  printResult(result, options.json);

  if (!result.allowed) {
    process.exitCode = 1;
    return;
  }
  stage(result.allowed_paths);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
