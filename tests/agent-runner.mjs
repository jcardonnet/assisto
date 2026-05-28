import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyFailure,
  diagnoseCommandResult,
  parseRunCommandArgs,
  recordCommandResult
} from "../scripts/agent-run.mjs";

export async function runAgentRunnerTests() {
  assert.equal(classifyFailure({ stderr: "EROFS: read-only file system, mkdtemp '/mnt/c/Users/JC/AppData/Local/Temp/x'" }).code, "windows_temp_readonly");
  assert.equal(classifyFailure({ stderr: "listen EPERM: operation not permitted 127.0.0.1" }).code, "localhost_bind_eperm");
  assert.equal(classifyFailure({ stderr: "spawnSync node EPERM" }).code, "sandbox_child_process_eperm");
  assert.equal(classifyFailure({ stderr: "browserType.launch: Target page, context or browser has been closed" }).code, "playwright_chromium_launch");
  assert.equal(classifyFailure({ stderr: "gh: HTTP 401: Bad credentials" }).code, "github_auth_or_network");
  assert.equal(classifyFailure({ stderr: "MXBAI_API_KEY is not set" }).code, "mixedbread_auth_or_network");
  assert.equal(classifyFailure({ stdout: "unresolved=2", stderr: "" }).code, "unresolved_review_threads");
  assert.equal(classifyFailure({ stderr: "PR checks are not green" }).code, "ci_not_green");
  assert.equal(classifyFailure({ stderr: "eslint . --max-warnings 0" }).code, "lint_failure");
  assert.equal(classifyFailure({ stderr: "tsc -p tsconfig.json --noEmit" }).code, "typecheck_failure");
  assert.equal(classifyFailure({ stderr: "node tests/run-tests.mjs" }).code, "test_failure");
  assert.deepEqual(parseRunCommandArgs(["--", "gh", "pr", "view", "--json", "mergeable"]), ["gh", "pr", "view", "--json", "mergeable"]);

  const diagnosis = diagnoseCommandResult({
    command: ["pnpm", "test:e2e"],
    exit_code: 1,
    stdout: "",
    stderr: "listen EPERM: operation not permitted 127.0.0.1"
  });
  assert.match(diagnosis.workaround, /escalated/);
  assert.deepEqual(diagnosis.rerun_command, ["pnpm", "test:e2e"]);

  const root = await mkdtemp(join(tmpdir(), "assisto-agent-runner-"));
  try {
    const run = {
      id: "run_20260527T232900Z_failure-memory",
      schema_version: 1,
      slug: "failure-memory",
      objective: "Test command result linking.",
      branch: "codex/failure-memory",
      base_ref: "origin/main",
      created_at: "2026-05-27T23:29:00.000Z",
      updated_at: "2026-05-27T23:29:00.000Z",
      changed_files: [],
      touched_subsystems: [],
      commands: [],
      validation_status: "not_run",
      review_state: "not_requested",
      pr_url: null,
      blockers: [],
      next_action: "Run diagnostics.",
      notes: []
    };
    await mkdir(join(root, ".assisto-agent", "runs"), { recursive: true });
    await writeFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), `${JSON.stringify(run, null, 2)}\n`);
    await writeFile(join(root, ".assisto-agent", "runs", "active-run"), `${run.id}\n`);

    const logged = await recordCommandResult({
      root,
      command: ["pnpm", "test"],
      exitCode: 1,
      stdout: "",
      stderr: "EROFS: read-only file system, mkdtemp '/mnt/c/Users/JC/AppData/Local/Temp/x'",
      startedAt: new Date("2026-05-27T23:30:00.000Z"),
      endedAt: new Date("2026-05-27T23:30:02.000Z")
    });
    assert.equal(logged.diagnosis.code, "windows_temp_readonly");
    assert.equal(logged.diagnosis.rerun_passed, null);
    assert.equal(logged.rerun_passed, null);
    assert.equal(logged.environment_hints.cwd, root);
    assert.match(logged.stderr_summary, /EROFS/);
    const last = await readFile(join(root, ".assisto-agent", "logs", "last-command"), "utf8");
    assert.equal(last.trim(), logged.id);
    const updatedRun = JSON.parse(await readFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), "utf8"));
    assert.equal(updatedRun.commands.length, 1);
    assert.equal(updatedRun.commands[0].id, logged.id);
    assert.equal(updatedRun.commands[0].diagnosis_code, "windows_temp_readonly");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
