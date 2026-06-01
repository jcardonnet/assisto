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

    const adapters = await loadTsModule("packages/core/src/source-adapters/index.ts");
    const preview = await adapters.previewSourceAdapterImport({
      kind: "slack_json",
      root,
      rawText: JSON.stringify({ messages: [{ user_name: "Joe", text: "Search depends on Billing." }] })
    });
    const previewSession = await inbox.createSourceInboxSessionFromPreview(root, preview, {
      now: "2026-06-01T13:00:00Z",
      source_label: "slack export"
    });
    assert.equal(previewSession.adapter_kind, "slack_json");
    assert.equal(previewSession.units[0].metadata.platform, "slack");

    const triaged = await inbox.triageSourceInboxSession(root, {
      session_id: "srcin_20260601120000_demo",
      decisions: [
        {
          unit_id: "markdown_1",
          action: "keep",
          source_label: "triaged source inbox",
          observed_at: "2026-06-02",
          contexts: ["ctx_search"],
          note: "ready to create"
        },
        {
          unit_id: "markdown_2",
          action: "skip",
          note: "duplicate stays skipped"
        }
      ],
      now: "2026-06-01T14:00:00Z"
    });
    assert.equal(triaged.import_status, "triaged");
    assert.equal(triaged.triage_counts.keep, 1);
    assert.equal(triaged.triage_counts.skip, 1);
    assert.equal(triaged.units[0].source_label, "triaged source inbox");
    assert.equal(triaged.units[0].observed_at, "2026-06-02");
    assert.deepEqual(triaged.units[0].contexts, ["ctx_search"]);
    assert.equal(triaged.units[0].metadata.triage_note, "ready to create");
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-06/2026-06-02-001.md"), /ENOENT/);

    const splitSession = await inbox.triageSourceInboxSession(root, {
      session_id: previewSession.session_id,
      decisions: [
        {
          unit_id: previewSession.units[0].unit_id,
          action: "split",
          split_units: [
            { raw_text: "Search depends on Billing.", source_label: "slack split", contexts: ["ctx_search"] },
            { raw_text: "Billing blocks Search.", source_label: "slack split", contexts: ["ctx_billing"] }
          ]
        }
      ],
      now: "2026-06-01T14:05:00Z"
    });
    assert.equal(splitSession.import_status, "triaged");
    assert.equal(splitSession.units.length, 2);
    assert.equal(splitSession.units[0].triage_state, "split");
    assert.equal(splitSession.units[1].unit_id, previewSession.units[0].unit_id + "_split_2");

    const created = await inbox.createSourceInboxEvents(root, {
      session_id: "srcin_20260601120000_demo",
      now: "2026-06-01T14:10:00Z"
    });
    assert.equal(created.action, "source_inbox_create_events");
    assert.equal(created.created, true);
    assert.equal(created.units_total, 2);
    assert.equal(created.units_created, 1);
    assert.equal(created.units_skipped, 1);
    assert.deepEqual(created.canonical_writes, []);
    assert.equal(created.units[0].event_path?.startsWith("memory/events/"), true);
    assert.equal(created.units[0].transaction_path?.startsWith("memory/transactions/pending/"), true);
    assert.equal(created.units[1].skip_reason, "triage_skip");
    assert.match(await readVaultFile(root, created.units[0].event_path), /source_label: triaged source inbox/);
    assert.match(await readVaultFile(root, created.units[0].event_path), /source_hash: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    assert.match(await readVaultFile(root, created.units[0].event_path), new RegExp("path=exports\\/notes\\.md lines=1-1 label=note 1"));
    assert.match(await readVaultFile(root, created.units[0].transaction_path), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
    const createdSession = await inbox.readSourceInboxSession(root, "srcin_20260601120000_demo");
    assert.equal(createdSession.import_status, "events_created");

    const cleared = await inbox.clearSourceInboxSessions(root);
    assert.equal(cleared.cleared_count, 2);
    assert.deepEqual(cleared.removed_sessions.sort(), ["srcin_20260601120000_demo", previewSession.session_id].sort());
    assert.equal((await inbox.listSourceInboxSessions(root)).session_count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
