#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log(`Usage: pnpm agent:run -- <command...>
       pnpm agent:diagnose:last [--json]
       pnpm agent:diagnose <log-id> [--json]

Runs commands with structured logging under ignored .assisto-agent/logs/** files.
`);
}

function iso(date) {
  return date.toISOString();
}

function timestampForId(date) {
  return iso(date).replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
}

function logsDir(root) {
  return path.join(root, ".assisto-agent", "logs");
}

function logPath(root, id) {
  return path.join(logsDir(root), `${id}.json`);
}

function lastPath(root) {
  return path.join(logsDir(root), "last-command");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function compact(text) {
  return text.length > 20000 ? `${text.slice(0, 20000)}\n[truncated]` : text;
}

function summarize(text) {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  const firstLines = trimmed.split("\n").slice(0, 12).join("\n");
  return firstLines.length > 2000 ? `${firstLines.slice(0, 2000)}\n[truncated]` : firstLines;
}

function commandEnv() {
  return {
    ...process.env,
    TMPDIR: "/tmp",
    TEMP: "/tmp",
    TMP: "/tmp"
  };
}

function environmentHints(root, env = process.env) {
  return {
    cwd: root,
    tmpdir: env.TMPDIR ?? null,
    temp: env.TEMP ?? null,
    tmp: env.TMP ?? null,
    ci: env.CI ?? null,
    github_actions: env.GITHUB_ACTIONS ?? null
  };
}

export function classifyFailure({ stdout = "", stderr = "", exitCode = 1, command = [] }) {
  const haystack = `${stdout}\n${stderr}\n${command.join(" ")}`.toLowerCase();

  if (exitCode === 0) {
    return {
      code: "success",
      summary: "The command completed successfully.",
      workaround: "No workaround needed.",
      rerun_command: command
    };
  }
  if (haystack.includes("erofs") && haystack.includes("appdata/local/temp")) {
    return {
      code: "windows_temp_readonly",
      summary: "The command tried to create temporary files under the read-only Windows temp path.",
      workaround: "Rerun with TMPDIR=/tmp TEMP=/tmp TMP=/tmp or use pnpm agent:validate.",
      rerun_command: command
    };
  }
  if (haystack.includes("listen eperm") && haystack.includes("127.0.0.1")) {
    return {
      code: "localhost_bind_eperm",
      summary: "The sandbox blocked binding a localhost server.",
      workaround: "Rerun the command with escalated permissions when localhost binding is required.",
      rerun_command: command
    };
  }
  if (haystack.includes("spawnsync") && haystack.includes("eperm")) {
    return {
      code: "sandbox_child_process_eperm",
      summary: "The sandbox blocked launching a nested child process.",
      workaround: "Rerun pnpm agent:run with escalated permissions, or use the local CI capsule for repeatable validation.",
      rerun_command: command
    };
  }
  if (haystack.includes("wsl/service/e_accessdenied")) {
    return {
      code: "wsl_access_denied",
      summary: "Windows-to-WSL filesystem access was denied.",
      workaround: "Use wsl.exe -d Ubuntu --cd /home/jc/assisto -- <cmd> or run the command inside the WSL shell.",
      rerun_command: command
    };
  }
  if (haystack.includes("sandbox_host_linux.cc") && haystack.includes("operation not permitted")) {
    return {
      code: "playwright_sandbox_host_eperm",
      summary: "Chromium sandbox launch was blocked by the execution sandbox.",
      workaround: "Rerun TMPDIR=/tmp pnpm test:browser outside the sandbox or in the local CI capsule.",
      rerun_command: command
    };
  }
  if (haystack.includes("mxbai smoke failed") && haystack.includes("no hits")) {
    return {
      code: "mixedbread_smoke_no_results",
      summary: "Mixedbread smoke ran but did not find expected indexed documents.",
      workaround: "Run pnpm mxbai:upload, then pnpm mxbai:smoke. Check .mxbai/upload-manifest.yaml if it still fails.",
      rerun_command: ["pnpm", "mxbai:upload"]
    };
  }
  if (haystack.includes("playwright") || haystack.includes("browsertype.launch") || haystack.includes("chromium")) {
    return {
      code: "playwright_chromium_launch",
      summary: "Chromium/Playwright could not launch or stay open in this environment.",
      workaround: "Use the Chromium browser test path with escalated permissions or the local CI capsule.",
      rerun_command: command
    };
  }
  if (haystack.includes("gh:") || haystack.includes("bad credentials") || haystack.includes("resource not accessible by integration")) {
    return {
      code: "github_auth_or_network",
      summary: "GitHub CLI/API authentication, permissions, or network access failed.",
      workaround: "Check gh auth status, connector permissions, or rerun the GitHub command with network escalation.",
      rerun_command: command
    };
  }
  if (haystack.includes("mxbai") || haystack.includes("mxbai_api_key") || haystack.includes("mixedbread")) {
    return {
      code: "mixedbread_auth_or_network",
      summary: "Mixedbread credentials or network access failed.",
      workaround: "Confirm MXBAI_API_KEY and rerun trusted Mixedbread commands with network access.",
      rerun_command: command
    };
  }
  if (haystack.includes("unresolved=") || haystack.includes("unresolved review")) {
    return {
      code: "unresolved_review_threads",
      summary: "The PR still has unresolved review threads.",
      workaround: "Address or explicitly resolve review threads before merge.",
      rerun_command: command
    };
  }
  if (haystack.includes("checks are not green") || haystack.includes("ci is not green")) {
    return {
      code: "ci_not_green",
      summary: "CI status checks are not green.",
      workaround: "Inspect failing checks and rerun closeout only after CI succeeds.",
      rerun_command: command
    };
  }
  if (haystack.includes("eslint") || haystack.includes("lint")) {
    return {
      code: "lint_failure",
      summary: "Lint failed.",
      workaround: "Read the ESLint output, fix the reported issue, and rerun pnpm lint.",
      rerun_command: ["pnpm", "lint"]
    };
  }
  if (haystack.includes("tsc") || haystack.includes("typecheck")) {
    return {
      code: "typecheck_failure",
      summary: "Typecheck failed.",
      workaround: "Read the TypeScript output, fix the reported issue, and rerun pnpm typecheck.",
      rerun_command: ["pnpm", "typecheck"]
    };
  }
  if (haystack.includes("test failed") || haystack.includes("tests/") || haystack.includes("node tests/")) {
    return {
      code: "test_failure",
      summary: "A test command failed.",
      workaround: "Inspect the failing test output, fix the behavior, and rerun the narrow failing test first.",
      rerun_command: command
    };
  }
  return {
    code: "unknown_failure",
    summary: "The command failed for an unclassified reason.",
    workaround: "Read stdout/stderr and classify the failure before retrying broad changes.",
    rerun_command: command
  };
}

export function diagnoseCommandResult(result) {
  return {
    ...classifyFailure({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exit_code,
      command: result.command
    }),
    rerun_passed: null
  };
}

function runsDir(root) {
  return path.join(root, ".assisto-agent", "runs");
}

function activeRunPath(root) {
  return path.join(runsDir(root), "active-run");
}

function runPath(root, id) {
  return path.join(runsDir(root), `${id}.json`);
}

async function maybeReadText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function maybeReadJson(filePath) {
  const text = await maybeReadText(filePath);
  return text === null ? null : JSON.parse(text);
}

async function updateActiveRunWithResult(root, result) {
  const activeRunId = (await maybeReadText(activeRunPath(root)))?.trim();
  if (activeRunId === undefined || activeRunId === "") {
    return null;
  }
  const filePath = runPath(root, activeRunId);
  const run = await maybeReadJson(filePath);
  if (run === null) {
    return null;
  }
  run.updated_at = result.ended_at;
  run.commands.push({
    id: result.id,
    command: result.command,
    exit_code: result.exit_code,
    diagnosis_code: result.diagnosis.code,
    started_at: result.started_at,
    ended_at: result.ended_at,
    duration_ms: result.duration_ms,
    log_path: `.assisto-agent/logs/${result.id}.json`
  });
  await writeJson(filePath, run);
  return run;
}

async function writeJson(filePath, value) {
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${filePath}.tmp`, filePath);
}

export async function recordCommandResult({
  root = process.cwd(),
  command,
  exitCode,
  stdout,
  stderr,
  startedAt,
  endedAt,
  env = process.env
}) {
  await mkdir(logsDir(root), { recursive: true });
  const id = `cmd_${timestampForId(startedAt)}_${shortHash(command.join("\0"))}`;
  const result = {
    id,
    schema_version: 1,
    command,
    exit_code: exitCode,
    started_at: iso(startedAt),
    ended_at: iso(endedAt),
    duration_ms: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    environment_hints: environmentHints(root, env),
    stdout: compact(stdout),
    stdout_summary: summarize(stdout),
    stderr: compact(stderr),
    stderr_summary: summarize(stderr),
    rerun_passed: null,
    diagnosis: null
  };
  result.diagnosis = diagnoseCommandResult(result);
  await writeJson(logPath(root, id), result);
  await writeFile(lastPath(root), `${id}\n`);
  await updateActiveRunWithResult(root, result);
  return result;
}

async function readCommandResult(root, id) {
  return JSON.parse(await readFile(logPath(root, id), "utf8"));
}

async function readLastCommandResult(root) {
  const id = (await readFile(lastPath(root), "utf8")).trim();
  return await readCommandResult(root, id);
}

function parseArgs(argv) {
  const options = { _: [] };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
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

export function parseRunCommandArgs(argv) {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(`diagnosis=${value.diagnosis.code}`);
  console.log(value.diagnosis.summary);
  console.log(`workaround=${value.diagnosis.workaround}`);
}

async function runCommand(args) {
  if (args.length === 0) {
    throw new Error("agent:run requires a command after --.");
  }
  const startedAt = new Date();
  const env = commandEnv();
  const result = spawnSync(args[0], args.slice(1), { encoding: "utf8", env });
  const endedAt = new Date();
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout !== "") {
    process.stdout.write(stdout);
  }
  if (stderr !== "") {
    process.stderr.write(stderr);
  }
  const logged = await recordCommandResult({
    command: args,
    exitCode: result.error === undefined ? (result.status ?? 0) : 1,
    stdout,
    stderr: result.error === undefined ? stderr : `${stderr}\n${result.error.message}`,
    startedAt,
    endedAt,
    env
  });
  if (logged.exit_code !== 0) {
    console.error(`agent:run logged ${logged.id} (${logged.diagnosis.code})`);
  } else {
    console.log(`agent:run logged ${logged.id}`);
  }
  process.exitCode = logged.exit_code;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "run") {
    await runCommand(parseRunCommandArgs(rest));
    return;
  }
  const options = parseArgs(rest);
  if (options.help === true) {
    usage();
    return;
  }
  if (command === "diagnose-last") {
    print(await readLastCommandResult(process.cwd()), options.json === true);
    return;
  }
  if (command === "diagnose") {
    const id = options._[0];
    if (id === undefined) {
      throw new Error("agent:diagnose requires a log id.");
    }
    print(await readCommandResult(process.cwd(), id), options.json === true);
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
