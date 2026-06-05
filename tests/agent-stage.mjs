import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStageRequest } from "../scripts/agent-stage.mjs";
import { makeRepo, run, runGit, writeRepoFile } from "./check-memory-data.mjs";

const scriptPath = path.resolve("scripts/agent-stage.mjs");

function runStage(root, args, options = {}) {
  return run(process.execPath, [scriptPath, ...args], { cwd: options.cwd ?? root });
}

export async function runAgentStageTests() {
  const refused = classifyStageRequest({
    paths: ["docs/agent-acceleration.md", "memory/events/2026/example.md"],
    allowMemoryData: false
  });

  assert.deepEqual(refused.allowed_paths, ["docs/agent-acceleration.md"]);
  assert.deepEqual(refused.guarded_paths, ["memory/events/2026/example.md"]);
  assert.equal(refused.allowed, false);
  assert.equal(refused.refused_reason, "guarded_memory_data_requires_explicit_allow");

  const allowed = classifyStageRequest({
    paths: ["memory/transactions/pending/example.md"],
    allowMemoryData: true
  });

  assert.deepEqual(allowed.allowed_paths, ["memory/transactions/pending/example.md"]);
  assert.deepEqual(allowed.guarded_paths, []);
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.pathspec_paths, []);

  const normalized = classifyStageRequest({
    paths: ["./memory/events/example.md", "docs/agent-acceleration.md", "docs/agent-acceleration.md"],
    allowMemoryData: false
  });
  assert.deepEqual(normalized.allowed_paths, ["docs/agent-acceleration.md"]);
  assert.deepEqual(normalized.guarded_paths, ["memory/events/example.md"]);

  const classifierRoot = path.join(os.tmpdir(), "assisto-agent-stage-classifier");
  const absoluteGuarded = classifyStageRequest({
    paths: [path.join(classifierRoot, "memory/events/example.md"), "docs/../memory/transactions/pending/tx.md"],
    allowMemoryData: false,
    root: classifierRoot
  });
  assert.deepEqual(absoluteGuarded.allowed_paths, []);
  assert.deepEqual(absoluteGuarded.guarded_paths, [
    "memory/events/example.md",
    "memory/transactions/pending/tx.md"
  ]);

  const parentMemory = classifyStageRequest({
    paths: ["memory"],
    allowMemoryData: false
  });
  assert.equal(parentMemory.allowed, false);
  assert.deepEqual(parentMemory.guarded_paths, ["memory"]);

  const pathspecMagic = classifyStageRequest({
    paths: [":", ":(glob)memory/events/**"],
    allowMemoryData: true
  });
  assert.equal(pathspecMagic.allowed, false);
  assert.deepEqual(pathspecMagic.pathspec_paths, [":", ":(glob)memory/events/**"]);
  assert.equal(pathspecMagic.refused_reason, "unsafe_git_pathspec_rejected");

  const safeRoot = await makeRepo();
  try {
    await writeRepoFile(safeRoot, "docs/agent-acceleration.md", "# Agent Acceleration\n");
    const result = runStage(safeRoot, ["docs/agent-acceleration.md"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /stage: docs\/agent-acceleration\.md/);
    assert.equal(runGit(safeRoot, ["status", "--short"]), "A  docs/agent-acceleration.md");
  } finally {
    await rm(safeRoot, { recursive: true, force: true });
  }

  const mixedRoot = await makeRepo();
  try {
    await writeRepoFile(mixedRoot, "docs/agent-acceleration.md", "# Agent Acceleration\n");
    await writeRepoFile(mixedRoot, "memory/events/2026/example.md", "# Event\n");
    const result = runStage(mixedRoot, [
      "--json",
      "docs/agent-acceleration.md",
      "memory/events/2026/example.md"
    ]);

    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.deepEqual(parsed.allowed_paths, ["docs/agent-acceleration.md"]);
    assert.deepEqual(parsed.guarded_paths, ["memory/events/2026/example.md"]);
    assert.equal(runGit(mixedRoot, ["status", "--short"]), "?? docs/\n?? memory/");

    const human = runStage(mixedRoot, [
      "docs/agent-acceleration.md",
      "memory/events/2026/example.md"
    ]);
    assert.equal(human.status, 1);
    assert.match(human.stdout, /refusing to stage/);
    assert.doesNotMatch(human.stdout, /stage: docs\/agent-acceleration\.md/);
    assert.equal(runGit(mixedRoot, ["status", "--short"]), "?? docs/\n?? memory/");
  } finally {
    await rm(mixedRoot, { recursive: true, force: true });
  }

  const absoluteRoot = await makeRepo();
  try {
    await writeRepoFile(absoluteRoot, "memory/events/2026/example.md", "# Event\n");
    const result = runStage(absoluteRoot, [
      path.join(absoluteRoot, "memory/events/2026/example.md")
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /refuse guarded memory data: memory\/events\/2026\/example\.md/);
    assert.equal(runGit(absoluteRoot, ["status", "--short"]), "?? memory/");
  } finally {
    await rm(absoluteRoot, { recursive: true, force: true });
  }

  const subdirRoot = await makeRepo();
  try {
    await writeRepoFile(subdirRoot, "docs/readme.md", "# Docs\n");
    await writeRepoFile(subdirRoot, "memory/events/2026/example.md", "# Event\n");
    const result = runStage(
      subdirRoot,
      [path.join(subdirRoot, "memory/events/2026/example.md")],
      { cwd: path.join(subdirRoot, "docs") }
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /refuse guarded memory data: memory\/events\/2026\/example\.md/);
    assert.equal(runGit(subdirRoot, ["status", "--short"]), "?? docs/\n?? memory/");
  } finally {
    await rm(subdirRoot, { recursive: true, force: true });
  }

  const parentRoot = await makeRepo();
  try {
    await writeRepoFile(parentRoot, "memory/events/2026/example.md", "# Event\n");
    const result = runStage(parentRoot, ["memory"]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /refuse guarded memory data: memory/);
    assert.equal(runGit(parentRoot, ["status", "--short"]), "?? memory/");
  } finally {
    await rm(parentRoot, { recursive: true, force: true });
  }

  const pathspecRoot = await makeRepo();
  try {
    await writeRepoFile(pathspecRoot, "memory/events/2026/example.md", "# Event\n");
    const result = runStage(pathspecRoot, [":"]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /refuse unsafe git pathspec: :/);
    assert.equal(runGit(pathspecRoot, ["status", "--short"]), "?? memory/");
  } finally {
    await rm(pathspecRoot, { recursive: true, force: true });
  }

  const memoryRoot = await makeRepo();
  try {
    await writeRepoFile(memoryRoot, "memory/transactions/pending/example.md", "# Transaction\n");

    const missingYes = runStage(memoryRoot, [
      "--allow-memory-data",
      "memory/transactions/pending/example.md"
    ]);
    assert.equal(missingYes.status, 1);
    assert.match(missingYes.stderr, /requires --yes/);

    const result = runStage(memoryRoot, [
      "--allow-memory-data",
      "--yes",
      "memory/transactions/pending/example.md"
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(runGit(memoryRoot, ["status", "--short"]), "A  memory/transactions/pending/example.md");
  } finally {
    await rm(memoryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runAgentStageTests();
  console.log("agent stage tests passed");
}
