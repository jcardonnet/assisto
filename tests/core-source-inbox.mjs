import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreSourceInboxTests() {
  const inbox = await loadTsModule("packages/core/src/source-inbox/index.ts");
  const root = await makeTempVault("assisto-source-inbox-");

  try {
    const session = await inbox.createSourceInboxSession(root, {
      session_id: "srcin_20260601120000_demo",
      adapter_kind: "markdown",
      source_label: "exported notes",
      source_path: "exports/notes.md",
      now: "2026-06-01T12:00:00Z",
      warnings: ["1 duplicate source unit(s) will be skipped."],
      units: [
        {
          unit_id: "markdown_1",
          raw_text: "Joe owns Search.",
          source_label: "exported notes",
          source_hash: "sha256:" + "a".repeat(64),
          observed_at: "2026-06-01",
          contexts: ["ctx_search"],
          source_spans: [{ source_path: "exports/notes.md", start_line: 1, end_line: 1, label: "note 1" }],
          metadata: { title: "Search note" }
        },
        {
          unit_id: "markdown_2",
          source_hash: "b".repeat(64),
          duplicate_state: "duplicate",
          skip_reason: "duplicate_source_hash",
          triage_state: "skip"
        }
      ]
    });

    assert.equal(session.session_id, "srcin_20260601120000_demo");
    assert.equal(session.unit_count, 2);
    assert.equal(session.triage_counts.untriaged, 1);
    assert.equal(session.triage_counts.skip, 1);
    assert.equal(session.source_hashes[1], "sha256:" + "b".repeat(64));

    const listed = await inbox.listSourceInboxSessions(root);
    assert.equal(listed.session_count, 1);
    assert.equal(listed.sessions[0].duplicate_units, 1);
    assert.match(listed.inbox_root, new RegExp("\\.assisto-local[/\\\\]source-inbox$"));

    const loaded = await inbox.readSourceInboxSession(root, "srcin_20260601120000_demo");
    assert.equal(loaded.units[0].metadata.title, "Search note");
    assert.deepEqual(loaded.units[0].source_spans[0], {
      source_path: "exports/notes.md",
      start_line: 1,
      end_line: 1,
      label: "note 1"
    });

    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-06/2026-06-01-001.md"), /ENOENT/);
    await assert.rejects(() => readVaultFile(root, "memory/transactions/pending/tx_2026_06_01_001.md"), /ENOENT/);

    const cleared = await inbox.clearSourceInboxSessions(root, { session_id: "srcin_20260601120000_demo" });
    assert.equal(cleared.cleared_count, 1);
    assert.deepEqual(cleared.removed_sessions, ["srcin_20260601120000_demo"]);
    assert.equal((await inbox.listSourceInboxSessions(root)).session_count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
