#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const guardedRoots = ["memory/events", "memory/transactions"];
const gitExecutable = "/usr/bin/git";

function usage() {
  console.log(`Usage: pnpm agent:stage [--json] [--allow-memory-data --yes] <path...>

Stages explicit paths while refusing memory/events/** and memory/transactions/** by default.
`);
}

function normalizePath(input, root) {
  const platformInput = input.replaceAll("\\", path.sep);
  const absolutePath = path.isAbsolute(platformInput) ? path.resolve(platformInput) : path.resolve(root, platformInput);
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  return path.posix.normalize(relativePath);
}

function uniqueSorted(paths, root) {
  return [...new Set(paths.map((item) => normalizePath(item, root)))].sort((left, right) => left.localeCompare(right));
}

function uniqueRaw(paths) {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function isGuardedPath(filePath) {
  return (
    filePath === "." ||
    guardedRoots.some(
      (root) => filePath === root || filePath.startsWith(`${root}/`) || root.startsWith(`${filePath}/`)
    )
  );
}

function isGitPathspecMagic(input) {
  return input === ":" || input.startsWith(":(") || input.startsWith(":!") || input.startsWith(":^") || input.startsWith(":/");
}

export function classifyStageRequest({ paths, allowMemoryData = false, root = process.cwd() }) {
  const pathspec = uniqueRaw(paths.filter(isGitPathspecMagic));
  const normalized = uniqueSorted(paths.filter((item) => !isGitPathspecMagic(item)), root);
  const guarded = normalized.filter(isGuardedPath);
  const allowed = allowMemoryData ? normalized : normalized.filter((item) => !isGuardedPath(item));
  const refusedReasons = [];

  if (pathspec.length > 0) {
    refusedReasons.push("unsafe_git_pathspec_rejected");
  }
  if (guarded.length > 0 && !allowMemoryData) {
    refusedReasons.push("guarded_memory_data_requires_explicit_allow");
  }

  return {
    allowed: refusedReasons.length === 0,
    allowed_paths: allowed,
    guarded_paths: allowMemoryData ? [] : guarded,
    pathspec_paths: pathspec,
    refused_reason: refusedReasons[0] ?? null,
    refused_reasons: refusedReasons
  };
}

function parseArgs(argv) {
  const options = { paths: [], json: false, allowMemoryData: false, yes: false, help: false };
  let parsingOptions = true;

  for (const arg of argv) {
    if (!parsingOptions) {
      options.paths.push(arg);
      continue;
    }
    if (arg === "--") {
      parsingOptions = false;
      continue;
    }
    if (parseFlag(options, arg)) {
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options.paths.push(arg);
  }

  return options;
}

function parseFlag(options, arg) {
  switch (arg) {
    case "--help":
    case "-h":
      options.help = true;
      return true;
    case "--json":
      options.json = true;
      return true;
    case "--allow-memory-data":
      options.allowMemoryData = true;
      return true;
    case "--yes":
      options.yes = true;
      return true;
    default:
      return false;
  }
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
  for (const filePath of result.pathspec_paths) {
    console.log(`refuse unsafe git pathspec: ${filePath}`);
  }
}

function repoRoot() {
  try {
    return execFileSync(gitExecutable, ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return process.cwd();
  }
}

function stage(paths, root) {
  if (paths.length === 0) {
    return;
  }

  const result = spawnSync(gitExecutable, ["add", "--", ...paths], { cwd: root, stdio: "inherit" });
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

  const root = repoRoot();
  const result = classifyStageRequest({
    paths: options.paths,
    allowMemoryData: options.allowMemoryData,
    root
  });
  printResult(result, options.json);

  if (!result.allowed) {
    process.exitCode = 1;
    return;
  }
  stage(result.allowed_paths, root);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
