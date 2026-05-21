import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

const eventPage = `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims:
  - clm_joe_role_dba
---

# Event ev_2026_05_20_001

## Raw text

Joe is the DBA.
`;

const personPage = `---
id: per_joe
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related:
  - [[topics/mysql]]
summary_generated_from:
  - clm_joe_role_dba
---

# Joe

## Active claims

- claim_id: clm_joe_role_dba
  statement: Joe is the DBA.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;

function rejectsVaultPath(fn, expectedMessagePart) {
  assert.throws(fn, (error) => {
    assert.equal(error.name, "VaultPathError");
    assert.match(error.message, expectedMessagePart);
    return true;
  });
}

async function rejectsVaultPathAsync(fn, expectedMessagePart) {
  await assert.rejects(fn, (error) => {
    assert.equal(error.name, "VaultPathError");
    assert.match(error.message, expectedMessagePart);
    return true;
  });
}

export async function runCoreFsVaultTests() {
  const fsUtils = await loadTsModule("packages/core/src/fs/index.ts");
  const vault = await loadTsModule("packages/core/src/vault/index.ts");
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-vault-"));

  try {
    rejectsVaultPath(() => fsUtils.resolveVaultPath(root, "../outside.md"), /escapes/);
    await rejectsVaultPathAsync(
      () => fsUtils.writeMarkdownPageAtomic(root, "memory/.obsidian/config.md", "# no"),
      /\.obsidian/
    );
    await rejectsVaultPathAsync(
      () => fsUtils.writeMarkdownPageAtomic(root, "docs/outside.md", "# no"),
      /inside memory/
    );

    await fsUtils.writeMarkdownPageAtomic(
      root,
      "memory/events/2026/2026-05/2026-05-20-001.md",
      eventPage
    );
    await fsUtils.writeMarkdownPageAtomic(root, "memory/people/joe.md", personPage);

    const roundtrip = await fsUtils.readMarkdownPage(root, "memory/people/joe.md");
    assert.equal(roundtrip, personPage);

    const files = await fsUtils.listMarkdownFiles(root, "memory/**/*.md");
    assert.deepEqual(files, [
      "memory/events/2026/2026-05/2026-05-20-001.md",
      "memory/people/joe.md"
    ]);

    const index = await vault.loadVaultIndex(root);
    assert.equal(index.ids.get("per_joe"), "memory/people/joe.md");
    assert.equal(
      index.ids.get("ev_2026_05_20_001"),
      "memory/events/2026/2026-05/2026-05-20-001.md"
    );
    assert.equal(index.eventIds.has("ev_2026_05_20_001"), true);
    assert.equal(index.claimIds.get("clm_joe_role_dba"), "memory/people/joe.md");
    assert.deepEqual(index.wikilinks.get("memory/people/joe.md"), ["topics/mysql"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
