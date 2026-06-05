import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAgentWorkbenchSnapshot,
  createAgentWorkbenchApp,
  previewAgentWorkbenchAction
} from "../scripts/agent-workbench.mjs";

export async function writeAgentWorkbenchRun(root) {
  const run = {
    id: "run_20260528T030000Z_agent-workbench",
    schema_version: 1,
    slug: "agent-workbench",
    objective: "Test Agent Workbench.",
    branch: "codex/agent-workbench-ui",
    base_ref: "origin/main",
    created_at: "2026-05-28T03:00:00.000Z",
    updated_at: "2026-05-28T03:00:00.000Z",
    changed_files: [],
    touched_subsystems: [],
    commands: [],
    validation_status: "passed",
    review_state: "requested",
    pr_url: "https://github.com/jcardonnet/assisto/pull/40",
    pr_state: {
      pr: "40",
      state: "review_requested",
      transitions: [],
      review_threads_path: null
    },
    blockers: [],
    next_action: "Review Agent Workbench output.",
    notes: []
  };
  await mkdir(join(root, ".assisto-agent", "runs"), { recursive: true });
  await Promise.all([
    writeFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), `${JSON.stringify(run, null, 2)}\n`),
    writeFile(join(root, ".assisto-agent", "runs", "active-run"), `${run.id}\n`)
  ]);
  return run;
}

export async function runAgentWorkbenchTests() {
  const root = await mkdtemp(join(tmpdir(), "assisto-agent-workbench-"));
  try {
    const run = await writeAgentWorkbenchRun(root);
    const snapshot = await buildAgentWorkbenchSnapshot(root);
    assert.equal(snapshot.run.id, run.id);
    assert.equal(snapshot.policy.passed, true);
    assert.equal(snapshot.repo_map.areas.some((area) => area.area === "agent-control-plane"), true);
    const preview = previewAgentWorkbenchAction("validation_plan");
    assert.deepEqual(preview.command, ["pnpm", "agent:validate", "--", "--plan", "--json"]);

    const mutatingPreview = previewAgentWorkbenchAction("note_next");
    assert.equal(mutatingPreview.mutating, true);

    const app = createAgentWorkbenchApp({
      root,
      commandRunner: async () => JSON.stringify({
        mode: "workflow-scripts",
        commands: [{ name: "lint", command: "pnpm lint" }],
        skipped: []
      })
    });

    const validationResponse = await app.handle(new globalThis.Request("http://127.0.0.1/api/validation/plan"));
    const validationBody = await validationResponse.json();
    assert.equal(validationResponse.status, 200);
    assert.equal(validationBody.mode, "workflow-scripts");
    assert.equal(validationBody.commands[0].name, "lint");

    const stageResponse = await app.handle(new globalThis.Request("http://127.0.0.1/api/stage/classify", {
      method: "POST",
      body: JSON.stringify({ paths: ["memory/events/example.md"] })
    }));
    const stageBody = await stageResponse.json();
    assert.equal(stageResponse.status, 200);
    assert.equal(stageBody.allowed, false);
    assert.deepEqual(stageBody.guarded_paths, ["memory/events/example.md"]);

    const mxbaiResponse = await app.handle(new globalThis.Request("http://127.0.0.1/api/mxbai/plan"));
    const mxbaiBody = await mxbaiResponse.json();
    assert.equal(mxbaiResponse.status, 200);
    assert.deepEqual(
      mxbaiBody.commands.map((command) => command.name),
      ["upload", "smoke"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
