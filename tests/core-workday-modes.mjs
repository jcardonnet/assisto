import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { writeContextProjectScenario } from "./helpers/scenario-factory.mjs";

export async function runCoreWorkdayModeTests() {
  const workdayModes = await loadTsModule("packages/core/src/workday-modes/index.ts");
  const root = await makeTempVault("assisto-core-workday-modes-");

  try {
    await writeContextProjectScenario(root);
    await writeVaultFile(
      root,
      ".assisto-local/daily/session.json",
      JSON.stringify(
        {
          dismissed_prompts: ["seed_prompt"],
          pinned_daily_questions: ["Who is my manager?"],
          last_selected_mode: "morning",
          last_completed_derived_step: "pin_question",
          updated_at: "2026-05-21T12:00:00.000Z"
        },
        null,
        2
      )
    );
    await writeRetrievalMissEvent(root);

    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    const morning = await workdayModes.buildWorkdayModeResult(root, "morning", {
      now: "2026-05-21T09:00:00.000Z"
    });

    assert.equal(morning.mode, "morning");
    assert.equal(morning.title, "Morning");
    assert.equal(morning.next_queue_item.target_id, "tx_2026_05_21_apply");
    assert.deepEqual(morning.pinned_questions, ["Who is my manager?"]);
    assert.equal(morning.open_followups.some((followup) => followup.id === "fu_ask_jeff"), true);
    assert.equal(morning.health_warnings.length > 0, true);
    assert.equal(morning.recent_changes.some((change) => change.id === "ev_2026_05_21_003"), true);
    assert.equal(morning.suggested_captures.some((capture) => /changed/.test(capture)), true);
    assert.equal(morning.citations.event_ids.includes("ev_2026_05_21_001"), true);

    const endDay = await workdayModes.buildWorkdayModeResult(root, "end-day", {
      now: "2026-05-21T18:00:00.000Z"
    });

    assert.equal(endDay.mode, "end-day");
    assert.equal(endDay.title, "End of day");
    assert.equal(endDay.todays_captures.length >= 3, true);
    assert.equal(endDay.unresolved_transactions.some((transaction) => transaction.id === "tx_2026_05_21_apply"), true);
    assert.equal(endDay.logged_misses.some((miss) => miss.id === "ev_2026_05_21_004"), true);
    assert.equal(endDay.citations.event_ids.includes("ev_2026_05_21_004"), true);
    assert.match(endDay.disclaimer, /derived/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeRetrievalMissEvent(root) {
  await writeVaultFile(
    root,
    "memory/events/2026/2026-05/2026-05-21-004.md",
    `---
id: ev_2026_05_21_004
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T17:00:00.000Z
observed_at: 2026-05-21
source_type: user_note
source_actor: user
source_label: friction:retrieval_miss
participants: []
topics: []
contexts: []
derived_claims: []
transactions: []
---

# Event ev_2026_05_21_004

## Raw text

Friction log: retrieval_miss

Question:
What is the Neptune deploy key?

Note:
Memory could not answer the Neptune deploy key question.
`
  );
}
