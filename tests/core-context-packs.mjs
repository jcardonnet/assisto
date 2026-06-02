import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

export async function runCoreContextPackTests() {
  const root = await makeTempVault("core-context-packs-");
  try {
    await writeWorkbenchFixture(root);

    const contextPacks = await loadTsModule("packages/core/src/context-packs/index.ts");
    const core = await loadTsModule("packages/core/src/index.ts");

    assert.equal(typeof core.buildPortableContextPack, "function");

    const taskPack = await contextPacks.buildTaskPack(root, "Who is my manager?", "2026-06-02T00:00:00.000Z");
    assert.equal(taskPack.kind, "task");
    assert.equal(taskPack.target, "Who is my manager?");
    assert.equal(taskPack.generated_at, "2026-06-02T00:00:00.000Z");
    assert.deepEqual(taskPack.canonical_writes, []);
    assert.equal(taskPack.active_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);
    assert.equal(taskPack.evidence_events.some((event) => event.id === "ev_2026_05_21_001"), true);
    assert.match(taskPack.compact_markdown, /# Portable Cited Context Pack/);
    assert.match(taskPack.compact_markdown, /claim_id: clm_jeff_manager/);
    assert.match(taskPack.compact_markdown, /ev_2026_05_21_001/);
    assert.match(taskPack.compact_markdown, /canonical_writes: 0/);
    assert.match(taskPack.compact_markdown, /derived only/i);
    assert.match(taskPack.context_pack, /# Context pack/);

    const personPack = await contextPacks.buildPersonPack(root, "Jeff", "2026-06-02T00:00:00.000Z");
    assert.equal(personPack.kind, "person");
    assert.equal(personPack.active_claims.some((claim) => claim.claim_id === "clm_jeff_manager"), true);

    const noMatchPack = await contextPacks.buildTaskPack(root, "What is the Neptune deploy key?", "2026-06-02T00:00:00.000Z");
    assert.equal(noMatchPack.kind, "task");
    assert.equal(noMatchPack.cannot_confirm.some((item) => item.code === "no_match"), true);
    assert.equal(noMatchPack.repair_actions.length >= 1, true);
    assert.match(noMatchPack.compact_markdown, /What Memory Cannot Confirm/);
    assert.match(noMatchPack.compact_markdown, /Repair Actions/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
