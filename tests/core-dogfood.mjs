import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runCoreDogfoodTests() {
  const dogfoodModule = await loadTsModule("packages/core/src/dogfood/index.ts");
  const root = await makeTempVault("assisto-core-dogfood-");

  try {
    await writeWorkbenchFixture(root);
    const home = await dogfoodModule.buildDogfoodHomeResult(root, {
      now: "2026-05-27T05:00:00.000Z",
      recentLimit: 2
    });

    assert.equal(home.generated_at, "2026-05-27T05:00:00.000Z");
    assert.equal(home.daily_progress.completed, false);
    assert.equal(home.daily_progress.open_items, 7);
    assert.equal(home.daily_progress.total_steps, 5);
    assert.equal(home.next_recommended_action.action, "review_pending_transaction");
    assert.equal(home.next_recommended_action.target_id, "tx_2026_05_21_apply");
    assert.match(home.capture_prompt.prompt, /What changed/);
    assert.equal(home.pending_transactions.length, 4);
    assert.equal(home.staged_review_groups[0].review_reason, "unscoped_claim");
    assert.equal(home.stale_noop_events[0].event_id, "ev_2026_05_21_003");
    assert.equal(home.open_followups[0].id, "fu_ask_jeff");
    assert.equal(home.quick_briefs.some((brief) => brief.kind === "today"), true);
    assert.equal(home.quick_briefs.some((brief) => brief.kind === "recent"), true);
    assert.equal(home.today.counts.pending_transactions, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const emptyRoot = await makeTempVault("assisto-core-dogfood-empty-");

  try {
    const home = await dogfoodModule.buildDogfoodHomeResult(emptyRoot);

    assert.equal(home.daily_progress.completed, true);
    assert.equal(home.daily_progress.open_items, 0);
    assert.equal(home.next_recommended_action.action, "capture_note");
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }
}
