#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

function usage() {
  console.log(`Usage: pnpm env:doctor [options]

Checks local Assisto development environment health without mutating the repo.

Options:
  --json     Print machine-readable JSON.
  --strict   Exit nonzero when any check fails or warns.
  --help     Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    strict: false
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function run(command, args) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim()
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`.trim()
    };
  }
}

function check(name, status, message, details = undefined) {
  return { name, status, message, details };
}

function checkWritableDir(path) {
  try {
    accessSync(path, constants.W_OK);
    const tempPath = mkdtempSync(join(path, "assisto-doctor-"));
    writeFileSync(join(tempPath, "probe"), "ok");
    rmSync(tempPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function checkLocalhostBind() {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.on("error", (error) => {
      resolve(check("localhost bind", "fail", `Cannot bind 127.0.0.1: ${error.message}`));
    });
    server.listen(0, "127.0.0.1", () => {
      server.close(() => {
        resolve(check("localhost bind", "pass", "Can bind 127.0.0.1 on an ephemeral port."));
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = [];

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  checks.push(
    check(
      "node",
      nodeMajor >= 22 ? "pass" : "warn",
      `Node ${process.versions.node}${nodeMajor >= 22 ? "" : " is older than the CI baseline."}`
    )
  );

  const pnpm = run("pnpm", ["--version"]);
  checks.push(
    check("pnpm", pnpm.ok ? "pass" : "fail", pnpm.ok ? `pnpm ${pnpm.output || "available"}` : "pnpm is not available.")
  );

  const currentTmp = process.env.TMPDIR ?? tmpdir();
  const currentTmpWritable = checkWritableDir(currentTmp);
  checks.push(
    check(
      "current temp",
      currentTmpWritable ? "pass" : "warn",
      `${currentTmp} ${currentTmpWritable ? "is writable" : "is not writable; use pnpm validate:local or set TMPDIR=/tmp."}`
    )
  );
  checks.push(check("/tmp", checkWritableDir("/tmp") ? "pass" : "fail", "/tmp writable scratch space"));

  const ghVersion = run("gh", ["--version"]);
  checks.push(check("gh cli", ghVersion.ok ? "pass" : "warn", ghVersion.ok ? ghVersion.output.split("\n")[0] : "gh is not available."));

  const ghAuth = run("gh", ["auth", "status"]);
  checks.push(check("gh auth", ghAuth.ok ? "pass" : "warn", ghAuth.ok ? "GitHub CLI is authenticated." : "GitHub CLI auth is not ready."));

  checks.push(
    check(
      "mxbai api key",
      process.env.MXBAI_API_KEY === undefined || process.env.MXBAI_API_KEY === "" ? "warn" : "pass",
      process.env.MXBAI_API_KEY === undefined || process.env.MXBAI_API_KEY === ""
        ? "MXBAI_API_KEY is not set."
        : "MXBAI_API_KEY is set."
    )
  );

  const playwright = run("pnpm", ["exec", "playwright", "--version"]);
  checks.push(
    check(
      "playwright",
      playwright.ok ? "pass" : "warn",
      playwright.ok ? playwright.output || "Playwright CLI is available." : "Playwright CLI is not available; run pnpm install first."
    )
  );

  checks.push(await checkLocalhostBind());

  const gitStatus = run("git", ["status", "--short", "--branch"]);
  checks.push(check("git status", gitStatus.ok ? "pass" : "warn", gitStatus.ok ? gitStatus.output : "Could not read git status."));

  const summary = {
    passed: checks.filter((item) => item.status === "pass").length,
    warned: checks.filter((item) => item.status === "warn").length,
    failed: checks.filter((item) => item.status === "fail").length
  };

  if (options.json) {
    console.log(JSON.stringify({ summary, checks }, null, 2));
  } else {
    for (const item of checks) {
      console.log(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
    }
    console.log(`summary: ${summary.passed} passed, ${summary.warned} warnings, ${summary.failed} failed`);
  }

  if (options.strict && (summary.warned > 0 || summary.failed > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
