import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advancePrState,
  evaluatePrCloseoutReadiness,
  prStates,
  storePrReviewSnapshot
} from "../scripts/agent-pr.mjs";

async function writeActiveRun(root, overrides = {}) {
  const run = {
    id: "run_20260528T011500Z_pr-state",
    schema_version: 1,
    slug: "pr-state",
    objective: "Test PR state machine.",
    branch: "codex/agent-pr-state-machine",
    base_ref: "origin/main",
    created_at: "2026-05-28T01:15:00.000Z",
    updated_at: "2026-05-28T01:15:00.000Z",
    changed_files: [],
    touched_subsystems: [],
    commands: [],
    validation_status: "passed",
    review_state: "requested",
    pr_url: "https://github.com/jcardonnet/assisto/pull/99",
    blockers: [],
    next_action: "Close out PR.",
    notes: [],
    ...overrides
  };
  await mkdir(join(root, ".assisto-agent", "runs"), { recursive: true });
  await Promise.all([
    writeFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), `${JSON.stringify(run, null, 2)}\n`),
    writeFile(join(root, ".assisto-agent", "runs", "active-run"), `${run.id}\n`)
  ]);
  return run;
}

function readyInputs(overrides = {}) {
  return {
    prInfo: {
      isDraft: false,
      mergeable: "MERGEABLE",
      statusCheckRollup: [{ conclusion: "SUCCESS" }]
    },
    reviewSummary: {
      unresolvedThreadCount: 0
    },
    memoryGuard: {
      changed: []
    },
    run: {
      validation_status: "passed",
      pr_state: {
        state: "ci_green"
      }
    },
    ...overrides
  };
}

export async function runAgentPrTests() {
  assert.equal(prStates.includes("merge_ready"), true);
  assert.equal(prStates.at(-1), "closed_out");

  const ready = evaluatePrCloseoutReadiness(readyInputs());
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);

  assert.deepEqual(
    evaluatePrCloseoutReadiness(readyInputs({ reviewSummary: { unresolvedThreadCount: 2 } })).blockers,
    ["unresolved_review_threads"]
  );
  assert.deepEqual(
    evaluatePrCloseoutReadiness(readyInputs({ prInfo: { isDraft: true, mergeable: "MERGEABLE", statusCheckRollup: [{ conclusion: "SUCCESS" }] } })).blockers,
    ["pr_is_draft"]
  );
  assert.deepEqual(
    evaluatePrCloseoutReadiness(readyInputs({ memoryGuard: { changed: ["memory/events/example.md"] } })).blockers,
    ["memory_guard_failed"]
  );
  assert.deepEqual(
    evaluatePrCloseoutReadiness(readyInputs({ run: { validation_status: "partial", pr_state: { state: "ci_green" } } })).blockers,
    ["validation_not_recorded_passed"]
  );
  assert.deepEqual(
    evaluatePrCloseoutReadiness(readyInputs({ run: { validation_status: "passed", pr_state: { state: "pr_opened" } } })).blockers,
    ["review_wait_not_elapsed"]
  );

  const root = await mkdtemp(join(tmpdir(), "assisto-agent-pr-"));
  try {
    const run = await writeActiveRun(root);
    const advanced = await advancePrState({
      root,
      pr: "99",
      state: "review_requested",
      now: new Date("2026-05-28T01:20:00.000Z")
    });
    assert.equal(advanced.pr_state.pr, "99");
    assert.equal(advanced.pr_state.state, "review_requested");
    assert.equal(advanced.pr_state.transitions.length, 1);

    const snapshotPath = await storePrReviewSnapshot({
      root,
      pr: "99",
      summary: { unresolvedThreadCount: 0, unresolvedThreads: [] },
      now: new Date("2026-05-28T01:21:00.000Z")
    });
    await stat(snapshotPath);
    const updatedRun = JSON.parse(await readFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), "utf8"));
    assert.match(updatedRun.pr_state.review_threads_path, /pr-99-review-threads\.json$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
