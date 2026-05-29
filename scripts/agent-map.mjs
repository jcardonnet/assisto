#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const schemaVersion = 1;

function usage() {
  console.log(`Usage: pnpm agent:map build
       pnpm agent:map query "<area>"

Builds or queries the generated repo map cache under ignored .assisto-agent/cache/repo-map.json.
`);
}

export function buildRepoMap({ generatedAt = new Date().toISOString() } = {}) {
  return {
    schema_version: schemaVersion,
    generated_at: generatedAt,
    areas: [
      {
        area: "memory-validation",
        paths: ["packages/core/src/validators", "packages/core/src/transactions", "memory/schema"],
        tests: ["tests/core-validators.mjs", "tests/core-transactions.mjs", "tests/core-transaction-apply.mjs"],
        evals: ["eval:mvp", "eval:v2", "eval:v3", "eval:v4", "eval:v5", "eval:v6", "eval:dogfood-local", "eval:v7"],
        docs: ["AGENTS.md", "docs/implementation-plan.md", "docs/decisions.md"],
        invariants: ["all multi-file mutations go through transactions", "every durable claim cites an Event"],
        commands: ["pnpm agent:validate", "pnpm check:memory-data"]
      },
      {
        area: "ingestion-capture-import",
        paths: ["packages/core/src/ingest", "packages/core/src/capture", "packages/core/src/import", "packages/core/src/extraction"],
        tests: ["tests/core-ingest.mjs", "tests/core-capture.mjs", "tests/core-import.mjs", "tests/core-extraction.mjs"],
        evals: ["eval:mvp", "eval:v2", "eval:v5", "eval:v6", "eval:dogfood-local", "eval:v7"],
        docs: ["README.md", "docs/revised-design.md"],
        invariants: ["ingestion writes Events plus pending Transactions only", "no generated explanation persistence"],
        commands: ["wm capture", "wm import notes", "wm ingest"]
      },
      {
        area: "retrieval-briefs",
        paths: ["packages/core/src/retrieval", "packages/core/src/briefs", "packages/cli/src/index.ts"],
        tests: ["tests/core-retrieval.mjs", "tests/core-briefs.mjs", "tests/cli-integration.mjs"],
        evals: ["eval:retrieval", "eval:v4", "eval:v5", "eval:v6", "eval:dogfood-local", "eval:v7"],
        docs: ["README.md", ".pi/prompts/ask.md", ".pi/skills/work-memory-retrieve/SKILL.md"],
        invariants: ["retrieval remains deterministic", "briefs are derived and disposable"],
        commands: ["wm ask", "wm brief"]
      },
      {
        area: "workbench-ui",
        paths: ["packages/workbench/src", "tests/browser", "tests/workbench.mjs"],
        tests: ["tests/workbench.mjs", "tests/browser/*.spec.mjs"],
        evals: ["eval:v4", "eval:v5", "eval:v6", "eval:dogfood-local", "eval:v7"],
        docs: ["README.md", "docs/wsl2-handoff.md"],
        invariants: ["UI mutations call transaction-backed helpers", "no direct canonical UI writes"],
        commands: ["wm workbench serve", "pnpm test:browser"]
      },
      {
        area: "agent-control-plane",
        paths: ["scripts/agent-*.mjs", ".assisto-agent", ".devcontainer"],
        tests: ["tests/agent-*.mjs", "tests/script-helpers.mjs"],
        evals: ["eval:mvp"],
        docs: [".assisto-agent/README.md", "README.md", "docs/wsl2-handoff.md"],
        invariants: ["agent runtime state is ignored", "no guarded memory-data writes"],
        commands: ["pnpm agent:start", "pnpm agent:validate", "pnpm agent:run", "pnpm agent:pr", "pnpm agent:ci-local", "pnpm agent:map"]
      }
    ]
  };
}

function cachePath(root) {
  return path.join(root, ".assisto-agent", "cache", "repo-map.json");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${filePath}.tmp`, filePath);
}

export async function writeRepoMap({ root = process.cwd(), generatedAt } = {}) {
  const repoMap = buildRepoMap({ generatedAt });
  const filePath = cachePath(root);
  await writeJson(filePath, repoMap);
  return { repoMap, filePath };
}

export function queryRepoMap(repoMap, query) {
  const normalized = query.toLowerCase();
  return repoMap.areas.filter((area) => {
    const haystack = [
      area.area,
      ...area.paths,
      ...area.tests,
      ...area.evals,
      ...area.docs,
      ...area.invariants,
      ...area.commands
    ].join("\n").toLowerCase();
    return haystack.includes(normalized);
  });
}

async function readOrBuildRepoMap(root) {
  try {
    return JSON.parse(await readFile(cachePath(root), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return buildRepoMap();
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = { _: [], json: false };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
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
  if (Array.isArray(value)) {
    for (const area of value) {
      console.log(`${area.area}:`);
      console.log(`  paths: ${area.paths.join(", ")}`);
      console.log(`  tests: ${area.tests.join(", ")}`);
      console.log(`  commands: ${area.commands.join(", ")}`);
    }
    return;
  }
  console.log(`repo map written: ${value.filePath}`);
  console.log(`areas=${value.repoMap.areas.length}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  if (command === undefined || command === "--help" || command === "-h" || options.help) {
    usage();
    return;
  }
  if (command === "build") {
    print(await writeRepoMap(), options.json);
    return;
  }
  if (command === "query") {
    const query = options._.join(" ").trim();
    if (query === "") {
      throw new Error("agent:map query requires an area string.");
    }
    print(queryRepoMap(await readOrBuildRepoMap(process.cwd()), query), options.json);
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
