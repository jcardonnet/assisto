import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";

const thresholds = JSON.parse(await readFile("tests/golden/v3-eval-thresholds.json", "utf8"));
const fixedNow = "2026-05-21T12:00:00-03:00";

const modules = {
  ingest: await loadTsModule("packages/core/src/ingest/index.ts"),
  transactions: await loadTsModule("packages/core/src/transactions/index.ts"),
  review: await loadTsModule("packages/core/src/review/index.ts")
};

const metrics = {
  unsafeCanonicalWrites: 0,
  unscopedActiveClaims: 0,
  falseMerges: 0,
  silentRoleOrReportingOverwrites: 0,
  reviewApplySuccess: 0,
  eventReprocessSuccess: 0
};

await suite("v3 org-chart extraction stays transactional", async () => {
  const root = await makeTempVault("eval-v3-org-");

  try {
    const result = await modules.ingest.ingestNote(
      root,
      "Kuastav, the Sr. Director of Software Engineering, is my manager. He reports to Jeff, the CTO.",
      { now: fixedNow }
    );
    const tx = await readTransaction(root, result.transaction_id);

    metrics.unsafeCanonicalWrites += (await exists(root, "memory/people/kuastav.md")) ? 1 : 0;
    metrics.unscopedActiveClaims += countUnscopedActiveClaims(tx);
    assert.equal(tx.proposed_file_writes.some((write) => write.path === "memory/people/kuastav.md"), true);
    assert.equal(tx.proposed_file_writes.some((write) => write.path === "memory/people/jeff.md"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("v3 ambiguous people and reporting conflicts stage review", async () => {
  const root = await makeTempVault("eval-v3-conflicts-");

  try {
    await writeVaultFile(root, "memory/people/kuastav-platform.md", minimalPerson("per_kuastav_platform", "Kuastav Platform"));
    await writeVaultFile(root, "memory/people/kuastav-analytics.md", minimalPerson("per_kuastav_analytics", "Kuastav Analytics"));
    const ambiguous = await modules.ingest.ingestNote(root, "Kuastav reports to Jeff.", { now: fixedNow });
    const ambiguousTx = await readTransaction(root, ambiguous.transaction_id);

    metrics.falseMerges += ambiguousTx.proposed_file_writes.some((write) => write.path === "memory/people/kuastav.md") ? 1 : 0;

    await writeVaultFile(
      root,
      "memory/people/maria.md",
      personWithClaim("per_maria", "Maria", "clm_maria_reports_to_jeff", "Maria reports to Jeff.")
    );
    const conflict = await modules.ingest.ingestNote(root, "Maria reports to Alice.", { now: addMinutes(fixedNow, 1) });
    const conflictTx = await readTransaction(root, conflict.transaction_id);

    metrics.silentRoleOrReportingOverwrites += conflictTx.proposed_file_writes.some((write) => write.path === "memory/people/maria.md")
      ? 1
      : 0;
    assert.match(conflictTx.proposed_file_writes.map((write) => write.content).join("\n"), /review_reason: reporting_change/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await suite("v3 review application and event reprocessing", async () => {
  const root = await makeTempVault("eval-v3-review-");

  try {
    await writeVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md", eventPage("ev_2026_05_20_001"));
    await writeVaultFile(root, "memory/review/mysql-scope.md", mysqlScopeReviewItem());

    const applyResult = await modules.review.createReviewApplyTransaction(root, "rev_mysql_scope", {
      target: "memory/topics/mysql.md",
      createContext: "Inventory Project",
      now: fixedNow
    });
    const topicWrite = applyResult.transaction.proposed_file_writes.find((write) => write.path === "memory/topics/mysql.md");

    if (topicWrite && /scope: ctx_inventory_project/.test(topicWrite.content)) {
      metrics.reviewApplySuccess += 1;
    }

    const reprocessResult = await modules.ingest.reprocessEvent(root, "ev_2026_05_20_001", { now: addMinutes(fixedNow, 1) });
    const reprocessTx = await readTransaction(root, reprocessResult.transaction_id);

    if (reprocessTx.proposed_file_writes.some((write) => /clm_user_job_ai_engineer_smartequip/.test(write.content))) {
      metrics.eventReprocessSuccess += 1;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

assertAtMost("unsafe canonical writes", metrics.unsafeCanonicalWrites, thresholds.unsafeCanonicalWritesMax);
assertAtMost("unscoped active claims", metrics.unscopedActiveClaims, thresholds.unscopedActiveClaimsMax);
assertAtMost("false merges", metrics.falseMerges, thresholds.falseMergesMax);
assertAtMost(
  "silent role/reporting overwrites",
  metrics.silentRoleOrReportingOverwrites,
  thresholds.silentRoleOrReportingOverwritesMax
);
assertAtLeast("review apply success", metrics.reviewApplySuccess, thresholds.reviewApplySuccessMin);
assertAtLeast("event reprocess success", metrics.eventReprocessSuccess, thresholds.eventReprocessSuccessMin);

console.log(JSON.stringify({ metrics }, null, 2));

async function suite(name, run) {
  await run();
  console.log(`✓ ${name}`);
}

async function makeTempVault(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readTransaction(root, id) {
  return modules.transactions.parseTransactionMarkdown(
    await readFile(path.join(root, "memory", "transactions", "pending", `${id}.md`), "utf8")
  );
}

async function writeVaultFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function exists(root, relativePath) {
  try {
    await readFile(path.join(root, relativePath), "utf8");
    return true;
  } catch {
    return false;
  }
}

function countUnscopedActiveClaims(transaction) {
  return transaction.proposed_file_writes
    .filter((write) => !write.path.startsWith("memory/review/"))
    .map((write) => write.content)
    .filter((content) => /claim_state: active[\s\S]*scope_state: unknown/.test(content)).length;
}

function assertAtMost(label, actual, expected) {
  assert.equal(actual <= expected, true, `${label}: expected <= ${expected}, got ${actual}`);
}

function assertAtLeast(label, actual, expected) {
  assert.equal(actual >= expected, true, `${label}: expected >= ${expected}, got ${actual}`);
}

assert.equal(addMinutes("2026-05-20T12:00:00-03:00", 1), "2026-05-20T12:01:00-03:00");

function addMinutes(iso, minutes) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/.exec(iso);

  if (!match) {
    throw new Error(`Unsupported timestamp format: ${iso}`);
  }

  const [, year, month, day, hour, minute, second, offset] = match;
  const localDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute) + minutes,
      Number(second)
    )
  );

  return `${localDate.getUTCFullYear()}-${pad2(localDate.getUTCMonth() + 1)}-${pad2(localDate.getUTCDate())}T${pad2(localDate.getUTCHours())}:${pad2(localDate.getUTCMinutes())}:${pad2(localDate.getUTCSeconds())}${offset}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function eventPage(id) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims: []
---

# Event ${id}

## Raw text

I started new job this monday as a AI Engineer at SmartEquip

## Candidate extraction

- No durable claim candidates extracted.
`;
}

function minimalPerson(id, name) {
  return personWithClaim(id, name, `clm_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_seed`, `${name} exists.`);
}

function personWithClaim(id, name, claimId, statement) {
  return `---
id: ${id}
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-20T12:00:00-03:00
updated_at: 2026-05-20T12:00:00-03:00
aliases: []
source_events:
  - ev_2026_05_20_001
related: []
summary_generated_from:
  - ${claimId}
---

# ${name}

## Current summary

${statement}

## Active claims

- claim_id: ${claimId}
  statement: ${statement}
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
}

function mysqlScopeReviewItem() {
  return `---
id: rev_mysql_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-20T12:00:00-03:00
source_events:
  - ev_2026_05_20_001
affected_files:
  - topics/mysql.md
---

# Review: MySQL scope

## Staged claims

- claim_id: clm_mysql_used_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: [ev_2026_05_20_001]
  recorded_at: 2026-05-20T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`;
}
