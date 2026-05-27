import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runCoreTodayTests() {
  const todayModule = await loadTsModule("packages/core/src/today/index.ts");
  const root = await makeTempVault("assisto-core-today-");

  try {
    await writeWorkbenchFixture(root);
    const today = await todayModule.buildTodayWorkbenchResult(root, {
      now: "2026-05-27T05:00:00.000Z",
      recentLimit: 2
    });

    assert.equal(today.generated_at, "2026-05-27T05:00:00.000Z");
    assert.equal(today.daily_review_complete, false);
    assert.equal(today.counts.pending_transactions, 4);
    assert.equal(today.counts.staged_review_items, 1);
    assert.equal(today.counts.stale_noop_events, 1);
    assert.equal(today.counts.open_followups, 1);
    assert.equal(today.counts.recent_events, 2);
    assert.equal(today.pending_transactions.some((transaction) => transaction.id === "tx_2026_05_21_apply"), true);
    assert.equal(today.staged_review_groups[0].review_reason, "unscoped_claim");
    assert.equal(today.stale_noop_events[0].event_id, "ev_2026_05_21_003");
    assert.equal(today.stale_noop_events[0].transaction_id, "tx_2026_05_21_002");
    assert.equal(today.open_followups[0].id, "fu_ask_jeff");
    assert.deepEqual(
      today.recent_events.map((event) => event.id),
      ["ev_2026_05_21_003", "ev_2026_05_21_002"]
    );
    assert.match(today.suggested_manual_actions.join("\n"), /Reprocess stale NOOP Events/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const emptyRoot = await makeTempVault("assisto-core-today-empty-");

  try {
    const today = await todayModule.buildTodayWorkbenchResult(emptyRoot);

    assert.equal(today.daily_review_complete, true);
    assert.equal(today.counts.pending_transactions, 0);
    assert.equal(today.counts.staged_review_items, 0);
    assert.equal(today.counts.stale_noop_events, 0);
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }
}
