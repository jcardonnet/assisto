import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const scriptPath = path.resolve("scripts/check-memory-data.mjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runGit(root, args) {
  const result = run("git", args, { cwd: root });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runGuard(root, args) {
  const env = { ...process.env };
  delete env.ASSISTO_ALLOW_MEMORY_DATA_CHANGES;

  return run(process.execPath, [scriptPath, ...args], { cwd: root, env });
}

function parseJson(stdout) {
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
}

async function writeRepoFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function makeRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-memory-guard-"));
  runGit(root, ["init"]);
  runGit(root, ["branch", "-M", "main"]);
  runGit(root, ["config", "user.email", "tests@example.test"]);
  runGit(root, ["config", "user.name", "Assisto Tests"]);
  return root;
}

export async function runCheckMemoryDataTests() {
  const untrackedRoot = await makeRepo();

  try {
    await writeRepoFile(
      untrackedRoot,
      "memory/events/2026/2026-05/2026-05-20-003.md",
      "# Dogfood event\n"
    );
    await writeRepoFile(
      untrackedRoot,
      "memory/transactions/pending/tx_2026_05_20_003.md",
      "# Dogfood transaction\n"
    );

    const result = runGuard(untrackedRoot, ["--no-base", "--json"]);
    const json = parseJson(result.stdout);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(json.tracked_diff_paths, []);
    assert.deepEqual(json.staged_paths, []);
    assert.deepEqual(json.unstaged_paths, []);
    assert.deepEqual(json.untracked_user_memory_paths, [
      "memory/events/2026/2026-05/2026-05-20-003.md",
      "memory/transactions/pending/tx_2026_05_20_003.md"
    ]);
    assert.equal(json.has_blocking_changes, false);
    assert.equal(json.has_untracked_user_memory, true);
  } finally {
    await rm(untrackedRoot, { recursive: true, force: true });
  }

  const stagedRoot = await makeRepo();

  try {
    await writeRepoFile(stagedRoot, "memory/events/2026/2026-05/event.md", "# Staged event\n");
    runGit(stagedRoot, ["add", "memory/events/2026/2026-05/event.md"]);

    const result = runGuard(stagedRoot, ["--no-base", "--json"]);
    const json = parseJson(result.stdout);

    assert.equal(result.status, 2);
    assert.deepEqual(json.staged_paths, ["memory/events/2026/2026-05/event.md"]);
    assert.equal(json.has_blocking_changes, true);

    const allowed = runGuard(stagedRoot, ["--no-base", "--allow", "--json"]);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(parseJson(allowed.stdout).allowed, true);
  } finally {
    await rm(stagedRoot, { recursive: true, force: true });
  }

  const unstagedRoot = await makeRepo();

  try {
    await writeRepoFile(unstagedRoot, "memory/events/2026/2026-05/event.md", "# Baseline event\n");
    runGit(unstagedRoot, ["add", "memory/events/2026/2026-05/event.md"]);
    runGit(unstagedRoot, ["commit", "-m", "baseline"]);
    await writeRepoFile(unstagedRoot, "memory/events/2026/2026-05/event.md", "# Edited event\n");

    const result = runGuard(unstagedRoot, ["--no-base", "--json"]);
    const json = parseJson(result.stdout);

    assert.equal(result.status, 2);
    assert.deepEqual(json.unstaged_paths, ["memory/events/2026/2026-05/event.md"]);
    assert.equal(json.has_blocking_changes, true);
  } finally {
    await rm(unstagedRoot, { recursive: true, force: true });
  }

  const diffRoot = await makeRepo();

  try {
    await writeRepoFile(diffRoot, "README.md", "# Temp repo\n");
    runGit(diffRoot, ["add", "README.md"]);
    runGit(diffRoot, ["commit", "-m", "baseline"]);
    runGit(diffRoot, ["switch", "-c", "feature"]);
    await writeRepoFile(diffRoot, "memory/transactions/pending/tx.md", "# Committed tx\n");
    runGit(diffRoot, ["add", "memory/transactions/pending/tx.md"]);
    runGit(diffRoot, ["commit", "-m", "add guarded transaction"]);

    const result = runGuard(diffRoot, ["--base", "main", "--json"]);
    const json = parseJson(result.stdout);

    assert.equal(result.status, 2);
    assert.deepEqual(json.tracked_diff_paths, ["memory/transactions/pending/tx.md"]);
    assert.equal(json.has_blocking_changes, true);
  } finally {
    await rm(diffRoot, { recursive: true, force: true });
  }
}
