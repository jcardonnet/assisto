#!/usr/bin/env node
import { spawnSync } from "node:child_process";

export function buildMxbaiRefreshPlan({ store, env = process.env } = {}) {
  const resolvedStore = store ?? env.MXBAI_STORE ?? "assisto";
  return {
    store: resolvedStore,
    commands: [
      { name: "upload", command: "pnpm mxbai:upload", store: resolvedStore },
      { name: "smoke", command: "pnpm mxbai:smoke", store: resolvedStore }
    ]
  };
}

export function buildLoggedMxbaiCommand(script) {
  return ["pnpm", "agent:run", "--", "pnpm", script];
}

function usageText() {
  return "Usage: pnpm agent:mxbai refresh [--json]";
}

function runLoggedPnpmScript(script) {
  const [command, ...args] = buildLoggedMxbaiCommand(script);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" }
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const options = { _: [], json: false, help: false };
  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    options._.push(arg);
  }
  return options;
}

export function runMxbaiCli(argv, { write = console.log, runScript = runLoggedPnpmScript } = {}) {
  const options = parseArgs(argv);
  const [command] = options._;
  if (options.help || command === undefined) {
    write(usageText());
    return { ran: false, plan: null };
  }
  if (command !== "refresh") {
    throw new Error(`Unknown command: ${command}`);
  }
  const plan = buildMxbaiRefreshPlan();
  if (options.json) {
    write(JSON.stringify(plan, null, 2));
    return { ran: false, plan };
  }
  runScript("mxbai:upload");
  runScript("mxbai:smoke");
  return { ran: true, plan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runMxbaiCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
