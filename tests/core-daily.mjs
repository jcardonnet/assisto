import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadTsModule } from "./ts-module-loader.mjs";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { writeContextProjectScenario } from "./helpers/scenario-factory.mjs";

export async function runCoreDailyTests() {
  const daily = await loadTsModule("packages/core/src/daily/index.ts");
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
}
