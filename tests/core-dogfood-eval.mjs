import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreDogfoodEvalTests() {
  const dogfoodEval = await loadTsModule("packages/core/src/dogfood-eval/index.ts");
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-dogfood-eval-"));

  try {
    await writeDogfoodEvalFixture(root);
    const questionsPath = path.join(root, ".assisto-local", "eval", "questions.json");
    await writeJson(questionsPath, {
      questions: [
        {
          question: "Who is my manager?",
          expected_claim_ids: ["clm_jeff_manager"],
          expected_event_ids: ["ev_manager"],
          expected_page_paths: ["memory/people/jeff.md"],
          tags: ["manager"]
        },
        {
          question: "What do I need to review about MySQL?",
          expected_review_ids: ["rev_mysql_scope"],
          tags: ["review"]
        },
        {
          question: "What open follow-ups are linked to Jeff?",
          expected_followup_ids: ["fu_ask_jeff"],
          tags: ["followup"]
        },
        {
          question: "What is the Neptune deploy key?",
          expected_cannot_confirm: ["No deterministic memory page"],
          expected_repair_actions: ["capture_note"],
          tags: ["no_match"]
        }
      ]
    });
    await writeJson(path.join(root, ".assisto-local", "eval", "last-result.json"), {
      metrics: {
        total_questions: 4,
        answerable_questions: 4,
        answerability: 1,
        expected_items: 7,
        found_expected_items: 7,
        citation_coverage: 1,
        irrelevant_inclusion_count: 0,
        cannot_confirm_quality: 1,
        repair_action_precision: 1,
        missing_memory_guidance_count: 1,
        review_followup_surfacing_count: 2,
        generated_persistence_violations: 0,
        regression_since_last_run: 0
      }
    });
    const before = await snapshotMemory(root);

    const result = await dogfoodEval.runPersonalDogfoodEval(root, { questionsPath });
    const after = await snapshotMemory(root);

    assert.deepEqual(after, before);
    assert.equal(result.questions_path, questionsPath);
    assert.equal(result.metrics.total_questions, 4);
    assert.equal(result.metrics.expected_items, 7);
    assert.equal(result.metrics.found_expected_items, 7);
    assert.equal(result.metrics.citation_coverage, 1);
    assert.equal(result.metrics.answerability, 1);
    assert.equal(result.metrics.cannot_confirm_quality, 1);
    assert.equal(result.metrics.repair_action_precision, 0.5);
    assert.equal(result.metrics.missing_memory_guidance_count, 1);
    assert.equal(result.metrics.review_followup_surfacing_count, 2);
    assert.equal(result.metrics.generated_persistence_violations, 0);
    assert.equal(result.metrics.regression_since_last_run, 1);
    assert.equal(result.questions[0].found_claim_ids.includes("clm_jeff_manager"), true);
    assert.equal(result.questions[0].found_event_ids.includes("ev_manager"), true);
    assert.equal(result.questions[1].found_review_ids.includes("rev_mysql_scope"), true);
    assert.equal(result.questions[2].found_followup_ids.includes("fu_ask_jeff"), true);
    assert.equal(result.questions[3].missing_memory_guidance, true);
    assert.equal(result.questions[3].found_cannot_confirm.includes("No deterministic memory page"), true);
    assert.equal(result.questions[3].found_repair_actions.includes("capture_note"), true);
    assert.equal(result.questions[3].repair_suggestions.some((suggestion) => suggestion.action === "log_retrieval_miss"), true);
    assert.equal(result.questions[3].repair_suggestions.some((suggestion) => suggestion.action === "pin_question"), true);

    const missing = await dogfoodEval.runPersonalDogfoodEval(root, {
      questionsPath: path.join(root, ".assisto-local", "eval", "missing.json")
    });
    assert.equal(missing.metrics.total_questions, 0);
    assert.equal(missing.warnings.some((warning) => /No dogfood eval questions/.test(warning)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeDogfoodEvalFixture(root) {
  await writeVaultFile(root, "memory/people/jeff.md", personPage("per_jeff", "Jeff", [
    claim("clm_jeff_manager", "Jeff is my manager.", "active", "ev_manager")
  ]));
  await writeVaultFile(root, "memory/topics/mysql.md", topicPage("top_mysql", "MySQL", "clm_mysql_usage", "We use MySQL.", "ev_mysql"));
  await writeVaultFile(root, "memory/review/mysql-scope.md", `---
id: rev_mysql_scope
type: review_item
object_state: active
review_state: staged
review_reason: unscoped_claim
created_at: 2026-05-21T10:00:00-03:00
source_events:
  - ev_mysql
affected_files:
  - topics/mysql.md
linked_transaction: tx_mysql_scope
---

# Review: MySQL scope

## Staged claims

- claim_id: clm_mysql_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: [ev_mysql]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
`);
  await writeVaultFile(root, "memory/followups/ask-jeff.md", `---
id: fu_ask_jeff
type: followup
object_state: active
review_state: reviewed
followup_state: open
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
owner: user
source_events:
  - ev_manager
related:
  - per_jeff
---

# Follow-up: Ask Jeff
`);

  for (const [id, text] of Object.entries({
    ev_manager: "Jeff is my manager.",
    ev_mysql: "We use MySQL."
  })) {
    await writeVaultFile(root, `memory/events/2026/2026-05/${id}.md`, eventPage(id, text));
  }
}

async function writeVaultFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function snapshotMemory(root) {
  const files = await listFiles(path.join(root, "memory"));
  const snapshot = {};

  for (const file of files) {
    snapshot[path.relative(root, file)] = await readFile(file, "utf8");
  }

  return snapshot;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function personPage(id, name, claims) {
  return page({
    id,
    type: "person",
    title: name,
    claims
  });
}

function topicPage(id, name, claimId, statement, eventId) {
  return page({
    id,
    type: "topic",
    title: name,
    claims: [claim(claimId, statement, "active", eventId)]
  });
}

function page({ id, type, title, claims }) {
  return `---
id: ${id}
type: ${type}
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events:
  - ${claims[0].eventId}
related: []
---

# ${title}

## Active claims

${claims.map((item) => claimBlock(item)).join("\n")}
`;
}

function claim(claimId, statement, state, eventId) {
  return { claimId, statement, state, eventId };
}

function claimBlock({ claimId, statement, state, eventId }) {
  return `- claim_id: ${claimId}
  statement: ${statement}
  claim_kind: fact
  claim_state: ${state}
  evidence_strength: explicit
  scope: null
  scope_state: complete
  evidence: [${eventId}]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null`;
}

function eventPage(id, text) {
  return `---
id: ${id}
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-21T10:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims: []
---

# Event ${id}

## Raw text

${text}
`;
}
