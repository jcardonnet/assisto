import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addRunNote,
  formatHandoff,
  loadActiveRun,
  startAgentRun
} from "../scripts/agent-control.mjs";

function fakeGit() {
  const calls = [];
  const branches = new Set(["main"]);
  let currentBranch = "main";

  return {
    calls,
    run(args) {
      calls.push(args);
      if (args[0] === "branch" && args[1] === "--show-current") {
        return currentBranch;
      }
      if (args[0] === "status" && args[1] === "--short") {
        return "";
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (!branches.has(args[2])) {
          const error = new Error("missing branch");
          error.status = 1;
          throw error;
        }
        return args[2];
      }
      if (args[0] === "switch" && args[1] === "-c") {
        branches.add(args[2]);
        currentBranch = args[2];
        return "";
      }
      if (args[0] === "switch") {
        currentBranch = args[1];
        return "";
      }
      return "";
    }
  };
}

export async function runAgentControlTests() {
  const root = await mkdtemp(join(tmpdir(), "assisto-agent-control-"));
  const git = fakeGit();

  try {
    const run = await startAgentRun({
      root,
      slug: "agent-ledger",
      objective: "Add an agent run ledger",
      now: new Date("2026-05-27T23:00:00.000Z"),
      runGit: git.run
    });

    assert.equal(run.slug, "agent-ledger");
    assert.equal(run.branch, "codex/agent-ledger");
    assert.equal(run.validation_status, "not_run");
    assert.equal(run.review_state, "not_requested");
    assert.equal(run.next_action, "Implement the objective, then run validation.");
    assert.equal(git.calls.some((args) => args.join(" ") === "switch -c codex/agent-ledger"), true);

    const active = await loadActiveRun({ root });
    assert.equal(active.id, run.id);

    await assert.rejects(
      () =>
        startAgentRun({
          root,
          slug: "another",
          objective: "Should be refused",
          now: new Date("2026-05-27T23:01:00.000Z"),
          runGit: git.run
        }),
      /Active agent run already exists/
    );

    const resumed = await startAgentRun({
      root,
      slug: "agent-ledger",
      objective: "Ignored while resuming",
      resume: true,
      now: new Date("2026-05-27T23:02:00.000Z"),
      runGit: git.run
    });
    assert.equal(resumed.id, run.id);

    const noted = await addRunNote({
      root,
      kind: "next",
      text: "Open the PR",
      now: new Date("2026-05-27T23:03:00.000Z")
    });
    assert.equal(noted.notes.at(-1).kind, "next");
    assert.equal(noted.next_action, "Open the PR");

    const handoff = formatHandoff(noted);
    assert.match(handoff, /# Agent Run Handoff/);
    assert.match(handoff, /Add an agent run ledger/);
    assert.match(handoff, /Open the PR/);

    const runFile = await readFile(join(root, ".assisto-agent", "runs", `${run.id}.json`), "utf8");
    assert.match(runFile, /"objective": "Add an agent run ledger"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
