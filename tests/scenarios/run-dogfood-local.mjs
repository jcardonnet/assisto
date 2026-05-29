import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

const dogfoodEval = await loadTsModule("packages/core/src/dogfood-eval/index.ts");
const root = await mkdtemp(path.join(os.tmpdir(), "eval-dogfood-local-"));

try {
  await writeWorkbenchFixture(root);
  const questionsPath = path.join(root, ".assisto-local", "eval", "questions.json");
  await mkdir(path.dirname(questionsPath), { recursive: true });
  await writeFile(
    questionsPath,
    `${JSON.stringify(
      {
        questions: [
          {
            question: "Who is my manager?",
            expected_claim_ids: ["clm_jeff_manager"],
            expected_event_ids: ["ev_2026_05_21_001"],
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
            tags: ["no_match"]
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const result = await dogfoodEval.runPersonalDogfoodEval(root, {
    questionsPath,
    now: "2026-05-29T00:00:00.000Z"
  });

  assert.equal(result.metrics.total_questions, 4);
  assert.equal(result.metrics.answerability, 1);
  assert.equal(result.metrics.citation_coverage, 1);
  assert.equal(result.metrics.irrelevant_inclusion_count, 0);
  assert.equal(result.metrics.missing_memory_guidance_count, 1);
  assert.equal(result.metrics.review_followup_surfacing_count, 2);
  assert.equal(result.metrics.generated_persistence_violations, 0);

  console.log("✓ local personal question scoring");
  console.log("✓ no-match guidance and review/follow-up surfacing");
  console.log(JSON.stringify({ metrics: result.metrics }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
