import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { makeTempVault, readVaultFile, writeVaultFile } from "./helpers/temp-vault.mjs";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreSourceAdapterTests() {
  const adapters = await loadTsModule("packages/core/src/source-adapters/index.ts");
  const importModule = await loadTsModule("packages/core/src/import/index.ts");

  const previewRoot = await makeTempVault("assisto-source-adapter-preview-");

  try {
    const preview = await adapters.previewSourceAdapterImport({
      kind: "markdown",
      root: previewRoot,
      rawText: "Joe is the DBA.\n---\n\n---\nI will ask Jeff about budgets.",
      source_label: "pasted markdown",
      observed_at: "2026-05-31",
      context: "ctx_inventory_project"
    });

    assert.equal(preview.adapter_kind, "markdown");
    assert.equal(preview.units.length, 2);
    assert.equal(preview.units[0].unit_id, "markdown_1");
    assert.equal(preview.units[0].source_label, "pasted markdown");
    assert.match(preview.units[0].source_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(preview.units[0].observed_at, "2026-05-31");
    assert.deepEqual(preview.units[0].contexts, ["ctx_inventory_project"]);
    assert.deepEqual(preview.units[0].source_spans, [
      {
        start_line: 1,
        end_line: 1,
        start_offset: 0,
        end_offset: 15,
        label: "markdown unit 1"
      }
    ]);
    assert.equal(preview.review_load_forecast.total_units, 2);
    assert.equal(preview.review_load_forecast.duplicates, 0);
    assert.deepEqual(preview.canonical_writes, []);

    const crlfPreview = await adapters.previewSourceAdapterImport({
      kind: "markdown",
      root: previewRoot,
      rawText: "One\r\n---\r\nTwo"
    });
    assert.deepEqual(crlfPreview.units.map((unit) => unit.source_spans[0]), [
      {
        start_line: 1,
        end_line: 1,
        start_offset: 0,
        end_offset: 3,
        label: "markdown unit 1"
      },
      {
        start_line: 3,
        end_line: 3,
        start_offset: 10,
        end_offset: 13,
        label: "markdown unit 2"
      }
    ]);
    await assert.rejects(() => readVaultFile(previewRoot, "memory/events/2026/2026-05/2026-05-31-001.md"), /ENOENT/);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }

  const structuredRoot = await makeTempVault("assisto-source-adapter-structured-");

  try {
    const email = await adapters.previewSourceAdapterImport({
      kind: "email",
      root: structuredRoot,
      rawText: "From: Priya <priya@example.com>\nTo: Me <me@example.com>\nDate: Sun, 31 May 2026 09:10:00 -0700\nSubject: Budget follow-up\n\nI need to ask Jeff about budgets.\n> Previous quoted line",
      source_label: "mailbox"
    });
    assert.equal(email.units.length, 1);
    assert.equal(email.units[0].raw_text.includes("> Previous quoted line"), false);
    assert.equal(email.units[0].metadata.from, "Priya <priya@example.com>");
    assert.equal(email.units[0].metadata.to, "Me <me@example.com>");
    assert.equal(email.units[0].metadata.date, "Sun, 31 May 2026 09:10:00 -0700");
    assert.equal(email.units[0].metadata.subject, "Budget follow-up");
    assert.equal(email.units[0].observed_at, "2026-05-31T16:10:00.000Z");

    const calendar = await adapters.previewSourceAdapterImport({
      kind: "calendar",
      root: structuredRoot,
      rawText:
        "BEGIN:VEVENT\nSUMMARY: Inventory review\nDTSTART:20260531T091000Z\nATTENDEE:mailto:joe@example.com\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY: Budget review\nDTSTART:20260601T110000Z\nATTENDEE:mailto:priya@example.com\nEND:VEVENT"
    });
    assert.equal(calendar.units.length, 2);
    assert.equal(calendar.units[0].metadata.summary, "Inventory review");
    assert.equal(calendar.units[0].metadata.dtstart, "20260531T091000Z");
    assert.equal(calendar.units[0].metadata.attendee, "mailto:joe@example.com");
    assert.equal(calendar.units[0].observed_at, "2026-05-31T09:10:00Z");
    assert.equal(Number.isNaN(Date.parse(calendar.units[0].observed_at)), false);
    assert.equal(calendar.units[1].metadata.summary, "Budget review");
    assert.equal(calendar.units[1].observed_at, "2026-06-01T11:00:00Z");
    assert.match(calendar.units[1].raw_text, /SUMMARY: Budget review/);

    const chat = await adapters.previewSourceAdapterImport({
      kind: "chat",
      root: structuredRoot,
      rawText: "[2026-05-31 09:10] Joe: We use MySQL.\n[2026-05-31 09:11] Priya: I will ask Jeff about budgets."
    });
    assert.equal(chat.units.length, 2);
    assert.equal(chat.units[0].metadata.timestamp, "2026-05-31 09:10");
    assert.equal(chat.units[0].metadata.sender, "Joe");
    assert.equal(chat.units[0].observed_at, "2026-05-31T09:10:00Z");
    assert.equal(Number.isNaN(Date.parse(chat.units[0].observed_at)), false);
    assert.equal(chat.units[0].raw_text, "Joe: We use MySQL.");
    assert.equal(chat.units[1].metadata.sender, "Priya");

    const mbox = await adapters.previewSourceAdapterImport({
      kind: "mbox",
      root: structuredRoot,
      rawText: [
        "From sender@example.com Sun May 31 09:10:00 2026",
        "From: Priya <priya@example.com>",
        "Date: Sun, 31 May 2026 09:10:00 -0700",
        "Subject: Search owner",
        "",
        "Joe owns Search.",
        "From other@example.com Sun May 31 10:10:00 2026",
        "From: Jeff <jeff@example.com>",
        "Date: Sun, 31 May 2026 10:10:00 -0700",
        "Subject: Budget",
        "",
        "I will ask Priya about budget."
      ].join("\n")
    });
    assert.equal(mbox.units.length, 2);
    assert.equal(mbox.units[0].metadata.subject, "Search owner");
    assert.equal(mbox.units[1].metadata.from, "Jeff <jeff@example.com>");

    const ics = await adapters.previewSourceAdapterImport({
      kind: "ics",
      root: structuredRoot,
      rawText: [
        "BEGIN:VEVENT",
        "SUMMARY: Search kickoff",
        "DTSTART:20260601T120000Z",
        "ATTENDEE:mailto:joe@example.com",
        "END:VEVENT"
      ].join("\n")
    });
    assert.equal(ics.units[0].metadata.export_kind, "ics");
    assert.equal(ics.units[0].observed_at, "2026-06-01T12:00:00Z");

    const slack = await adapters.previewSourceAdapterImport({
      kind: "slack_json",
      root: structuredRoot,
      rawText: JSON.stringify({ messages: [{ user_name: "Joe", text: "Search depends on Billing.", ts: "2026-06-01T12:00:00Z", channel_name: "proj-search" }] })
    });
    assert.equal(slack.units[0].raw_text, "Joe: Search depends on Billing.");
    assert.equal(slack.units[0].metadata.platform, "slack");
    assert.equal(slack.units[0].metadata.channel, "proj-search");

    const teams = await adapters.previewSourceAdapterImport({
      kind: "teams_json",
      root: structuredRoot,
      rawText: JSON.stringify({ messages: [{ from: { user: { displayName: "Priya" } }, body: { content: "We decided to keep MySQL." }, createdDateTime: "2026-06-01T13:00:00Z" }] })
    });
    assert.equal(teams.units[0].raw_text, "Priya: We decided to keep MySQL.");
    assert.equal(teams.units[0].metadata.platform, "teams");

    const github = await adapters.previewSourceAdapterImport({
      kind: "github_json",
      root: structuredRoot,
      rawText: JSON.stringify({ issues: [{ number: 42, title: "Search timeout", body: "Billing blocks rollout.", user: { login: "jane" }, created_at: "2026-06-01T14:00:00Z", html_url: "https://github.example/issues/42" }] })
    });
    assert.equal(github.units[0].source_label, "Search timeout");
    assert.match(github.units[0].raw_text, /Billing blocks rollout/);
    assert.equal(github.units[0].metadata.author, "jane");

    const tracker = await adapters.previewSourceAdapterImport({
      kind: "tracker_csv",
      root: structuredRoot,
      rawText: [
        "key,title,status,updated_at",
        "PROJ-1,Fix search timeout,blocked,2026-06-01T15:00:00Z"
      ].join("\n")
    });
    assert.equal(tracker.units[0].source_label, "Fix search timeout");
    assert.match(tracker.units[0].raw_text, /status: blocked/);
    assert.equal(tracker.units[0].metadata.export_kind, "tracker_csv");

    const repoMarkdown = await adapters.previewSourceAdapterImport({
      kind: "repo_markdown",
      root: structuredRoot,
      rawText: ["# Search README", "", "Owner: Joe"].join("\n")
    });
    assert.equal(repoMarkdown.units[0].adapter_kind, "repo_markdown");
  } finally {
    await rm(structuredRoot, { recursive: true, force: true });
  }

  const duplicateRoot = await makeTempVault("assisto-source-adapter-duplicate-");

  try {
    const duplicatePreview = await adapters.previewSourceAdapterImport({
      kind: "text",
      root: duplicateRoot,
      rawText: "Joe is the DBA.",
      source_label: "existing text"
    });
    const sourceHash = duplicatePreview.units[0].source_hash.replace(/^sha256:/, "");
    await writeVaultFile(
      duplicateRoot,
      "memory/events/2026/2026-05/2026-05-20-001.md",
      [
        "---",
        "id: ev_2026_05_20_001",
        "type: event",
        "object_state: active",
        "review_state: reviewed",
        "recorded_at: 2026-05-20T09:00:00Z",
        `source_hash: ${sourceHash}`,
        "---",
        "# Event ev_2026_05_20_001",
        "",
        "## Raw text",
        "",
        "Joe is the DBA."
      ].join("\n")
    );

    const preview = await adapters.previewSourceAdapterImport({
      kind: "text",
      root: duplicateRoot,
      rawText: "Joe is the DBA."
    });

    assert.equal(preview.units[0].duplicate_state, "duplicate");
    assert.equal(preview.units[0].skip_reason, "duplicate_source_hash");
    assert.equal(preview.review_load_forecast.duplicates, 1);
    assert.equal(preview.review_load_forecast.likely_safe, 0);
  } finally {
    await rm(duplicateRoot, { recursive: true, force: true });
  }

  const createRoot = await makeTempVault("assisto-source-adapter-create-");

  try {
    const created = await adapters.createSourceAdapterImport({
      kind: "chat",
      root: createRoot,
      rawText: "[2026-05-31 09:10] Joe: Joe is the DBA.",
      source_label: "team chat",
      context: "ctx_inventory_project"
    });

    assert.equal(created.created_events.length, 1);
    assert.equal(created.pending_transactions.length, 1);
    assert.deepEqual(created.canonical_writes, []);
    assert.equal(created.units[0].duplicate_state, "new");
    assert.match(await readVaultFile(createRoot, created.created_events[0]), /source_hash: sha256:[a-f0-9]{64}/);
    assert.match(await readVaultFile(createRoot, created.created_events[0]), /source_label: team chat/);
    assert.match(await readVaultFile(createRoot, created.created_events[0]), /Joe: Joe is the DBA\./);
    assert.match(await readVaultFile(createRoot, created.pending_transactions[0]), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(createRoot, "memory/people/joe.md"), /ENOENT/);

    const duplicateImport = await importModule.createImportNotes(
      createRoot,
      {
        text: "Joe: Joe is the DBA."
      },
      {
        now: "2026-05-31T10:00:00Z"
      }
    );
    assert.equal(duplicateImport.units_imported, 0);
    assert.equal(duplicateImport.units_skipped, 1);
    assert.deepEqual(duplicateImport.canonical_writes, []);
    assert.equal(duplicateImport.units[0].skip_reason, "duplicate_source_hash");
    assert.equal(duplicateImport.units[0].existing_event_path, created.created_events[0]);

    const eventDirs = await readdir(`${createRoot}/memory/events/2026/2026-05`);
    const transactionDirs = await readdir(`${createRoot}/memory/transactions/pending`);
    assert.equal(eventDirs.length, 1);
    assert.equal(transactionDirs.length, 1);
  } finally {
    await rm(createRoot, { recursive: true, force: true });
  }
}
