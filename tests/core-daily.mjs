import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { writeContextProjectScenario } from "./helpers/scenario-factory.mjs";

export async function runCoreDailyTests() {
  const daily = await loadTsModule("packages/core/src/daily/index.ts");
  assert.match(await readFile(".gitignore", "utf8"), /\.assisto-local\/\*\*/);
  const root = await makeTempVault("assisto-core-daily-");

  try {
    await writeContextProjectScenario(root);
    const queue = await daily.buildDailyQueueResult(root, {
      now: "2026-05-28T12:00:00.000Z"
    });

    assert.equal(queue.generated_at, "2026-05-28T12:00:00.000Z");
    assert.equal(queue.items.length > 0, true);
    assert.equal(queue.current_item.item_type, "pending_transaction");
    assert.equal(queue.current_item.target_id, "tx_2026_05_21_apply");
    assert.equal(queue.current_item.preview_endpoint, "/api/transactions/apply/preview");
    assert.equal(queue.counts.pending_transactions, 4);
    assert.equal(queue.items.some((item) => item.item_type === "review_item" && item.target_id === "rev_mysql_scope"), true);
    assert.equal(queue.items.some((item) => item.item_type === "stale_noop_event" && item.target_id === "ev_2026_05_21_003"), true);
    assert.equal(queue.items.some((item) => item.item_type === "followup" && item.target_id === "fu_ask_jeff"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const emptyRoot = await makeTempVault("assisto-core-daily-empty-");

  try {
    const queue = await daily.buildDailyQueueResult(emptyRoot);

    assert.equal(queue.items.length, 0);
    assert.equal(queue.current_item, null);
    assert.equal(queue.queue_complete, true);
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }

  const sessionRoot = await makeTempVault("assisto-core-daily-session-");

  try {
    const initial = await daily.readDailySession(sessionRoot, {
      now: "2026-05-29T10:00:00.000Z"
    });

    assert.equal(initial.generated_at, "2026-05-29T10:00:00.000Z");
    assert.equal(initial.exists, false);
    assert.deepEqual(initial.state.dismissed_prompts, []);
    assert.deepEqual(initial.state.pinned_daily_questions, []);
    assert.equal(initial.path, ".assisto-local/daily/session.json");

    const updated = await daily.updateDailySession(
      sessionRoot,
      {
        dismissed_prompts: ["seed_prompt"],
        pinned_daily_questions: ["Who is my manager?"],
        last_selected_mode: "morning",
        last_completed_derived_step: "ask_cited_question"
      },
      { now: "2026-05-29T10:05:00.000Z" }
    );

    assert.equal(updated.exists, true);
    assert.deepEqual(updated.state.dismissed_prompts, ["seed_prompt"]);
    assert.deepEqual(updated.state.pinned_daily_questions, ["Who is my manager?"]);
    assert.equal(updated.state.last_selected_mode, "morning");
    assert.equal(updated.state.last_completed_derived_step, "ask_cited_question");
    assert.equal(updated.state.updated_at, "2026-05-29T10:05:00.000Z");
    assert.match(await readFile(path.join(sessionRoot, ".assisto-local/daily/session.json"), "utf8"), /Who is my manager/);

    await assert.rejects(() => readFile(path.join(sessionRoot, "memory/people/jeff.md"), "utf8"), /ENOENT/);

    const reset = await daily.updateDailySession(sessionRoot, { reset: true }, { now: "2026-05-29T10:10:00.000Z" });

    assert.equal(reset.exists, false);
    assert.deepEqual(reset.state.dismissed_prompts, []);
    await assert.rejects(() => readFile(path.join(sessionRoot, ".assisto-local/daily/session.json"), "utf8"), /ENOENT/);
  } finally {
    await rm(sessionRoot, { recursive: true, force: true });
  }
}
