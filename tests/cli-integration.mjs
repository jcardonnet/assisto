import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";
import { writeHealthFixture } from "./core-health.mjs";
import { writeBriefFixture } from "./core-briefs.mjs";
import { writeWorkbenchFixture } from "./workbench.mjs";

let cliModule = null;

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-cli-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, result.stderr);
}

function initGitRepo(root) {
  runGit(root, ["init"]);
  runGit(root, ["branch", "-M", "main"]);
  runGit(root, ["config", "user.email", "tests@example.test"]);
  runGit(root, ["config", "user.name", "Assisto Tests"]);
}

async function runWm(root, args, ioOverrides = {}) {
  if (!cliModule) {
    cliModule = await loadTsModule("packages/cli/src/index.ts");
  }

  const stdout = [];
  const stderr = [];
  const exitCode = await cliModule.main(["--root", root, ...args], {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    ...ioOverrides
  });

  assert.equal(exitCode, 0, stderr.join(""));

  return {
    stdout: stdout.join(""),
    stderr: stderr.join("")
  };
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

export async function runCliIntegrationTests() {
  cliModule = await loadTsModule("packages/cli/src/index.ts");
  const helpStdout = [];
  const helpExitCode = await cliModule.main(["--help"], {
    stdout: (text) => helpStdout.push(text),
    stderr: () => undefined
  });
  const help = { stdout: helpStdout.join("") };
  assert.equal(helpExitCode, 0);
  assert.match(help.stdout, /wm - local markdown work-memory MVP/);
  assert.match(help.stdout, /capture/);
  assert.match(help.stdout, /import notes/);
  assert.match(help.stdout, /provider rule\|llm-stub\|openai/);
  assert.match(help.stdout, /workbench serve/);
  assert.match(help.stdout, /activate status/);
  assert.match(help.stdout, /use-tomorrow/);
  assert.match(help.stdout, /seed kit/);
  assert.match(help.stdout, /daily queue/);
  assert.match(help.stdout, /daily session/);
  assert.match(help.stdout, /mode <morning\|end-day\|meeting\|after-meeting>/);
  assert.match(help.stdout, /context dashboard/);
  assert.match(help.stdout, /context operating-room/);
  assert.match(help.stdout, /context timeline/);
  assert.match(help.stdout, /entities stewardship/);
  assert.match(help.stdout, /entities repair-v2/);
  assert.match(help.stdout, /doctor memory-data/);
  assert.match(help.stdout, /brief <today\|person\|context\|review\|followups\|recent>/);
  assert.match(help.stdout, /friction log/);
  assert.match(help.stdout, /capture feedback/);
  assert.match(help.stdout, /capture presets/);
  assert.match(help.stdout, /capture quick/);

  const doctorRoot = await makeTempVault();

  try {
    initGitRepo(doctorRoot);
    await writeVaultFile(
      doctorRoot,
      "memory/events/2026/2026-05/2026-05-20-003.md",
      "# Dogfood event\n"
    );

    const doctorResult = await runWm(doctorRoot, ["doctor", "memory-data", "--json"]);
    const doctorJson = JSON.parse(doctorResult.stdout);

    assert.deepEqual(doctorJson.changed, []);
    assert.deepEqual(doctorJson.untracked_user_memory_paths, [
      "memory/events/2026/2026-05/2026-05-20-003.md"
    ]);
    assert.equal(doctorJson.has_untracked_user_memory, true);
  } finally {
    await rm(doctorRoot, { recursive: true, force: true });
  }

  const quickCaptureRoot = await makeTempVault();

  try {
    const presetsResult = await runWm(quickCaptureRoot, ["capture", "presets", "--json"]);
    const presets = JSON.parse(presetsResult.stdout);
    assert.equal(presets.some((preset) => preset.preset_id === "meeting-note"), true);

    const previewResult = await runWm(quickCaptureRoot, [
      "capture",
      "quick",
      "--preset",
      "meeting-note",
      "--json",
      "Joe",
      "is",
      "the",
      "DBA."
    ]);
    const previewJson = JSON.parse(previewResult.stdout);
    assert.equal(previewJson.created, false);
    assert.equal(previewJson.event_preview.source_label, "meeting note");
    await expectMissing(quickCaptureRoot, previewJson.event_path);
    await expectMissing(quickCaptureRoot, previewJson.transaction_path);

    const createResult = await runWm(quickCaptureRoot, [
      "capture",
      "quick",
      "--preset",
      "meeting-note",
      "--create",
      "--json",
      "Mike",
      "is",
      "my",
      "manager."
    ]);
    const createJson = JSON.parse(createResult.stdout);
    assert.equal(createJson.created, true);
    assert.equal(createJson.note, "Mike is my manager.");
    assert.equal(createJson.event_raw_text, "Mike is my manager.");
    assert.match(await readVaultFile(quickCaptureRoot, createJson.event_path), /source_label: meeting note/);
    assert.match(await readVaultFile(quickCaptureRoot, createJson.transaction_path), /transaction_state: pending/);
    await expectMissing(quickCaptureRoot, "memory/people/mike.md");
  } finally {
    await rm(quickCaptureRoot, { recursive: true, force: true });
  }
  const txRoot = await makeTempVault();

  try {
    const ingestResult = await runWm(txRoot, ["ingest", "Joe is the DBA. We use MySQL."]);
    assert.match(ingestResult.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(ingestResult.stdout, /Staged review proposals: memory\/review\/unscoped-claims\.md/);

    const pendingTransaction = await readVaultFile(
      txRoot,
      "memory/transactions/pending/tx_2026_05_20_001.md"
    );
    assert.match(pendingTransaction, /path=memory\/people\/joe\.md/);
    assert.match(pendingTransaction, /path=memory\/review\/unscoped-claims\.md/);
    assert.match(pendingTransaction, /clm_mysql_used_unknown_scope/);
    await expectMissing(txRoot, "memory/people/joe.md");
    await expectMissing(txRoot, "memory/review/unscoped-claims.md");

    const listResult = await runWm(txRoot, ["tx", "list"]);
    assert.match(listResult.stdout, /tx_2026_05_20_001\s+pending/);

    const showResult = await runWm(txRoot, ["tx", "show", "tx_2026_05_20_001"]);
    assert.match(showResult.stdout, /# Transaction tx_2026_05_20_001/);

    const applyResult = await runWm(txRoot, ["tx", "apply", "tx_2026_05_20_001"]);
    assert.match(applyResult.stdout, /Applied transaction tx_2026_05_20_001/);
    assert.match(await readVaultFile(txRoot, "memory/people/joe.md"), /clm_joe_role_dba/);
    assert.match(await readVaultFile(txRoot, "memory/review/unscoped-claims.md"), /review_state: staged/);

    const reviewResult = await runWm(txRoot, ["review", "inbox"]);
    assert.match(reviewResult.stdout, /Staged review items:/);
    assert.match(reviewResult.stdout, /rev_unscoped_claims/);
  } finally {
    await rm(txRoot, { recursive: true, force: true });
  }

  const captureRoot = await makeTempVault();

  try {
    const dryRun = await runWm(captureRoot, [
      "capture",
      "--dry-run",
      "--observed-at",
      "2026-05-21",
      "--source-label",
      "standup",
      "--context",
      "ctx_inventory_project",
      "Joe is the DBA. We use MySQL."
    ]);
    assert.match(dryRun.stdout, /Dry run\. No changes written/);
    assert.match(dryRun.stdout, /Event: ev_2026_05_20_001/);
    assert.match(dryRun.stdout, /Validation: passed/);
    await expectMissing(captureRoot, "memory/events/2026/2026-05/2026-05-20-001.md");

    const created = await runWm(captureRoot, [
      "capture",
      "--observed-at",
      "2026-05-21",
      "--source-label",
      "standup",
      "--context",
      "ctx_inventory_project",
      "Joe is the DBA. We use MySQL."
    ]);
    assert.match(created.stdout, /Event: ev_2026_05_20_001/);
    assert.match(created.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(created.stdout, /Validation: passed/);
    assert.match(
      await readVaultFile(captureRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: standup/
    );
    assert.match(
      await readVaultFile(captureRoot, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /transaction_state: pending/
    );
    await expectMissing(captureRoot, "memory/people/joe.md");

    const openAiDryRun = await runWm(captureRoot, [
      "capture",
      "--dry-run",
      "--provider",
      "openai",
      "Alice is the PM."
    ]);
    assert.match(openAiDryRun.stdout, /Provider: openai/);
    assert.match(openAiDryRun.stdout, /Staged review proposals:/);
  } finally {
    await rm(captureRoot, { recursive: true, force: true });
  }

  const frictionRoot = await makeTempVault();

  try {
    const frictionResult = await runWm(frictionRoot, [
      "friction",
      "log",
      "--kind",
      "retrieval_miss",
      "--question",
      "What is the Neptune deploy key?",
      "--note",
      "Memory could not answer the Neptune deploy key question."
    ]);

    assert.match(frictionResult.stdout, /Friction event: ev_2026_05_20_001/);
    assert.match(frictionResult.stdout, /Pending friction transaction: tx_2026_05_20_001/);
    assert.match(frictionResult.stdout, /Validation: passed/);
    assert.match(
      await readVaultFile(frictionRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: friction:retrieval_miss/
    );
    assert.match(
      await readVaultFile(frictionRoot, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /NOOP/
    );
    await expectMissing(frictionRoot, "memory/review/friction.md");
    await expectMissing(frictionRoot, "memory/topics/friction.md");
  } finally {
    await rm(frictionRoot, { recursive: true, force: true });
  }

  const captureFeedbackRoot = await makeTempVault();

  try {
    await writeWorkbenchFixture(captureFeedbackRoot);
    const captureFeedback = await runWm(captureFeedbackRoot, [
      "capture",
      "feedback",
      "--kind",
      "wrong_person",
      "--note",
      "Extraction linked this note to the wrong person.",
      "--event",
      "ev_2026_05_21_001",
      "--transaction",
      "tx_2026_05_21_001"
    ]);

    assert.match(captureFeedback.stdout, /Capture feedback event: ev_2026_05_20_001/);
    assert.match(captureFeedback.stdout, /Pending capture feedback transaction: tx_2026_05_20_001/);
    assert.match(captureFeedback.stdout, /Kind: wrong_person/);
    assert.match(captureFeedback.stdout, /Validation: passed/);
    assert.match(
      await readVaultFile(captureFeedbackRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: capture_feedback:wrong_person/
    );
    assert.match(
      await readVaultFile(captureFeedbackRoot, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /NOOP/
    );
    await expectMissing(captureFeedbackRoot, "memory/review/capture-feedback.md");
    await expectMissing(captureFeedbackRoot, "memory/topics/capture-feedback.md");
  } finally {
    await rm(captureFeedbackRoot, { recursive: true, force: true });
  }

  const seedRoot = await makeTempVault();
  const seedFile = path.join(seedRoot, "seed.json");

  try {
    await writeFile(
      seedFile,
      JSON.stringify({
        my_role: "I am an AI Engineer at SmartEquip.",
        manager_team: ["Jeff is my manager."],
        open_loops: ["I need to ask Jeff about onboarding."]
      }),
      "utf8"
    );

    const dryRun = await runWm(seedRoot, ["seed", "kit", "--file", seedFile, "--dry-run"]);
    assert.match(dryRun.stdout, /Dry run\. No changes written/);
    assert.match(dryRun.stdout, /Seed units: 3/);
    await expectMissing(seedRoot, "memory/events/2026/2026-05/2026-05-20-001.md");

    const created = await runWm(seedRoot, ["seed", "kit", "--file", seedFile]);
    assert.match(created.stdout, /Seed units: 3/);
    assert.match(created.stdout, /seed:role/);
    assert.match(created.stdout, /Validation: passed/);
    assert.match(await readVaultFile(seedRoot, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: seed:role/);
    await expectMissing(seedRoot, "memory/people/jeff.md");
  } finally {
    await rm(seedRoot, { recursive: true, force: true });
  }

  const importRoot = await makeTempVault();
  const importSource = path.join(importRoot, "curated");

  try {
    await mkdir(importSource, { recursive: true });
    await writeFile(path.join(importSource, "note.md"), "Joe is the DBA. We use MySQL.", "utf8");
    await writeFile(path.join(importSource, "ignore.csv"), "not imported", "utf8");

    const dryRun = await runWm(importRoot, [
      "import",
      "notes",
      "--path",
      importSource,
      "--limit",
      "1",
      "--dry-run"
    ]);
    assert.match(dryRun.stdout, /Dry run\. No changes written/);
    assert.match(dryRun.stdout, /Import units: 1/);
    assert.match(dryRun.stdout, /Event: ev_2026_05_20_001/);
    await expectMissing(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md");

    const created = await runWm(importRoot, [
      "import",
      "notes",
      "--path",
      importSource,
      "--source-label",
      "curated import"
    ]);
    assert.match(created.stdout, /Imported: 1/);
    assert.match(created.stdout, /Pending transaction: tx_2026_05_20_001/);
    assert.match(
      await readVaultFile(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_hash: [a-f0-9]{64}/
    );
    assert.match(
      await readVaultFile(importRoot, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: curated import/
    );
    await expectMissing(importRoot, "memory/people/joe.md");

    const duplicate = await runWm(importRoot, ["import", "notes", "--path", importSource]);
    assert.match(duplicate.stdout, /Imported: 0/);
    assert.match(duplicate.stdout, /Skipped: 1/);
    assert.match(duplicate.stdout, /Skipped duplicate source_hash/);

    const assistant = await runWm(importRoot, ["import", "assistant"]);
    assert.match(assistant.stdout, /Import assistant/);
    assert.match(assistant.stdout, /Import 10 curated notes/);
    assert.match(assistant.stdout, /Suggested next batch size:\s+10/);

    const assistantJson = await runWm(importRoot, ["import", "assistant", "--json"]);
    assert.equal(JSON.parse(assistantJson.stdout).suggested_next_batch_size, 10);
  } finally {
    await rm(importRoot, { recursive: true, force: true });
  }

  const askRoot = await makeTempVault();

  try {
    await writeVaultFile(
      askRoot,
      "memory/people/joe.md",
      "# Joe\n\n## Current summary\n\nJoe works with search infrastructure.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/people/mike.md",
      "# Mike\n\n## Current summary\n\nMike is a manager who needs clear tradeoffs.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/topics/solr.md",
      "# Solr\n\n## Current summary\n\nSolr is a search platform.\n"
    );
    await writeVaultFile(
      askRoot,
      "memory/topics/qdrant.md",
      "# Qdrant\n\n## Current summary\n\nQdrant is a vector database.\n"
    );

    const askResult = await runWm(askRoot, [
      "ask",
      "--pack-context",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    assert.match(askResult.stdout, /# Context pack/);
    assert.match(askResult.stdout, /memory\/people\/joe\.md/);
    assert.match(askResult.stdout, /memory\/people\/mike\.md/);
    assert.match(askResult.stdout, /memory\/topics\/solr\.md/);
    assert.match(askResult.stdout, /memory\/topics\/qdrant\.md/);

    const answerBasisResult = await runWm(askRoot, [
      "ask",
      "--answer-basis",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    const answerBasis = JSON.parse(answerBasisResult.stdout);
    assert.equal(typeof answerBasis.queryIntent.primary, "string");
    assert.equal(Array.isArray(answerBasis.plannedLookups), true);
    assert.equal(Array.isArray(answerBasis.answerCandidates), true);
    assert.equal(Array.isArray(answerBasis.missingInformation), true);
    assert.equal(Array.isArray(answerBasis.manualActions), true);
    assert.equal(Array.isArray(answerBasis.suggestedNextQuestions), true);
    assert.equal(Array.isArray(answerBasis.directAnswers), true);
    assert.equal(typeof answerBasis.citationMap.claims, "object");
    assert.match(answerBasis.contextPack, /# Context pack/);

    const answerContractResult = await runWm(askRoot, [
      "ask",
      "--answer-contract",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    const answerContract = JSON.parse(answerContractResult.stdout);
    assert.equal(Array.isArray(answerContract.directAnswers), true);
    assert.equal(Array.isArray(answerContract.cannotConfirm), true);
    assert.equal(Array.isArray(answerContract.conflicts), true);
    assert.equal(Array.isArray(answerContract.staleSignals), true);
    assert.equal(Array.isArray(answerContract.repairActions), true);
    assert.equal(typeof answerContract.citationMap.events, "object");
    assert.match(answerContract.contextPack, /# Context pack/);



    const contractV3Result = await runWm(askRoot, [
      "ask",
      "--contract-v3",
      "How should I explain Joe and Mike the difference between Solr and Qdrant?"
    ]);
    const contractV3 = JSON.parse(contractV3Result.stdout);
    assert.equal(contractV3.version, "answer-contract-v3");
    assert.equal(Array.isArray(contractV3.directAnswers[0]?.citations ?? []), true);
    assert.equal(typeof contractV3.citationIndex, "object");
    assert.match(contractV3.contextPack, /# Context pack/);

    const oldOpenAiKey = process.env.OPENAI_API_KEY;
    const oldOpenAiModel = process.env.ASSISTO_OPENAI_MODEL;

    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ASSISTO_OPENAI_MODEL;

      const draftResult = await runWm(askRoot, [
        "ask",
        "--draft",
        "How should I explain Joe and Mike the difference between Solr and Qdrant?"
      ]);
      const draft = JSON.parse(draftResult.stdout);

      assert.equal(draft.provider_name, "openai");
      assert.equal(draft.answer_text, "");
      assert.equal(draft.warnings.some((warning) => /OPENAI_API_KEY/.test(warning)), true);
      assert.match(draft.basis.contextPack, /# Context pack/);
    } finally {
      if (oldOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = oldOpenAiKey;
      }

      if (oldOpenAiModel === undefined) {
        delete process.env.ASSISTO_OPENAI_MODEL;
      } else {
        process.env.ASSISTO_OPENAI_MODEL = oldOpenAiModel;
      }
    }
  } finally {
    await rm(askRoot, { recursive: true, force: true });
  }

  const briefRoot = await makeTempVault();

  try {
    await writeBriefFixture(briefRoot);
    const brief = await runWm(briefRoot, ["brief", "person", "per_jeff"]);
    assert.match(brief.stdout, /# Session brief: Jeff/);
    assert.match(brief.stdout, /Jeff is my manager/);
    assert.match(brief.stdout, /Open follow-ups/);
    assert.match(brief.stdout, /fu_ask_jeff/);
    assert.match(brief.stdout, /Generated explanations were not saved/);

    const followups = await runWm(briefRoot, ["brief", "followups"]);
    assert.match(followups.stdout, /# Session brief: Follow-ups/);
    assert.match(followups.stdout, /fu_ask_jeff/);
    assert.doesNotMatch(followups.stdout, /fu_closed/);

    const recent = await runWm(briefRoot, ["brief", "recent", "person", "per_jeff"], { now: "2026-05-22T12:00:00.000Z" });
    assert.match(recent.stdout, /# Session brief: Recent changes: Jeff/);
    assert.match(recent.stdout, /Jeff is my manager/);
    assert.doesNotMatch(recent.stdout, /prefers email/);
  } finally {
    await rm(briefRoot, { recursive: true, force: true });
  }

  const todayRoot = await makeTempVault();

  try {
    await writeWorkbenchFixture(todayRoot);
    const today = await runWm(todayRoot, ["today"]);
    assert.match(today.stdout, /Daily review: needs attention/);
    assert.match(today.stdout, /pending_transactions\t4/);
    assert.match(today.stdout, /Stale NOOP Events/);
    assert.match(today.stdout, /ev_2026_05_21_003 via tx_2026_05_21_002/);

    const todayJsonResult = await runWm(todayRoot, ["today", "--json"]);
    const todayJson = JSON.parse(todayJsonResult.stdout);
    assert.equal(todayJson.daily_review_complete, false);
    assert.equal(todayJson.staged_review_groups[0].review_reason, "unscoped_claim");

    const dogfood = await runWm(todayRoot, ["dogfood", "status"]);
    assert.match(dogfood.stdout, /Dogfood Home/);
    assert.match(dogfood.stdout, /Next action: Review pending transaction/);
    assert.match(dogfood.stdout, /pending_transactions\t4/);

    const dogfoodJsonResult = await runWm(todayRoot, ["dogfood", "status", "--json"]);
    const dogfoodJson = JSON.parse(dogfoodJsonResult.stdout);
    assert.equal(dogfoodJson.next_recommended_action.action, "review_pending_transaction");
    assert.equal(dogfoodJson.daily_progress.open_items, 7);

    await writeVaultFile(
      todayRoot,
      ".assisto-local/eval/questions.json",
      JSON.stringify({
        questions: [
          {
            question: "Who is my manager?",
            expected_claim_ids: ["clm_jeff_manager"],
            expected_event_ids: ["ev_2026_05_21_001"],
            expected_page_paths: ["memory/people/jeff.md"],
            tags: ["manager"]
          },
          {
            question: "What is the Neptune deploy key?",
            tags: ["no_match"]
          }
        ]
      })
    );
    const dogfoodEvalResult = await runWm(todayRoot, ["dogfood", "eval", "--json"]);
    const dogfoodEvalJson = JSON.parse(dogfoodEvalResult.stdout);
    assert.equal(dogfoodEvalJson.metrics.total_questions, 2);
    assert.equal(dogfoodEvalJson.metrics.answerability, 1);
    assert.equal(dogfoodEvalJson.metrics.generated_persistence_violations, 0);

    const activation = await runWm(todayRoot, ["activate", "status"]);
    assert.match(activation.stdout, /Activation/);
    assert.match(activation.stdout, /State: active/);
    assert.match(activation.stdout, /Next step: Review one memory proposal/);
    assert.match(activation.stdout, /pending_transactions\t4/);

    const activationJsonResult = await runWm(todayRoot, ["activate", "status", "--json"]);
    const activationJson = JSON.parse(activationJsonResult.stdout);
    assert.equal(activationJson.memory_state, "active");
    assert.equal(activationJson.next_wizard_step.step_id, "review_one_transaction");

    const useTomorrow = await runWm(todayRoot, ["use-tomorrow"]);
    assert.match(useTomorrow.stdout, /Use Assisto Tomorrow/);
    assert.match(useTomorrow.stdout, /Next step: Review one memory proposal/);
    assert.match(useTomorrow.stdout, /pending_transactions\t4/);

    const useTomorrowJsonResult = await runWm(todayRoot, ["use-tomorrow", "--json"]);
    const useTomorrowJson = JSON.parse(useTomorrowJsonResult.stdout);
    assert.equal(useTomorrowJson.memory_state, "active");
    assert.equal(useTomorrowJson.next_step.step_id, "review_one_transaction");

    const dailyQueue = await runWm(todayRoot, ["daily", "queue"]);
    assert.match(dailyQueue.stdout, /Daily queue/);
    assert.match(dailyQueue.stdout, /Current: Review pending transaction/);

    const dailyQueueJsonResult = await runWm(todayRoot, ["daily", "queue", "--json"]);
    const dailyQueueJson = JSON.parse(dailyQueueJsonResult.stdout);
    assert.equal(dailyQueueJson.current_item.item_type, "pending_transaction");
    assert.equal(dailyQueueJson.current_item.target_id, "tx_2026_05_21_apply");

    await writeVaultFile(
      todayRoot,
      ".assisto-local/daily/session.json",
      JSON.stringify(
        {
          dismissed_prompts: ["seed_prompt"],
          pinned_daily_questions: ["Who is my manager?"],
          last_selected_mode: "morning",
          last_completed_derived_step: "pin_question",
          updated_at: "2026-05-29T10:00:00.000Z"
        },
        null,
        2
      )
    );
    const dailySession = await runWm(todayRoot, ["daily", "session"]);
    assert.match(dailySession.stdout, /Daily session/);
    assert.match(dailySession.stdout, /last_selected_mode\tmorning/);

    const dailySessionJsonResult = await runWm(todayRoot, ["daily", "session", "--json"]);
    const dailySessionJson = JSON.parse(dailySessionJsonResult.stdout);
    assert.equal(dailySessionJson.exists, true);
    assert.equal(dailySessionJson.state.last_completed_derived_step, "pin_question");

    const morningMode = await runWm(todayRoot, ["mode", "morning"]);
    assert.match(morningMode.stdout, /Workday mode: Morning/);
    assert.match(morningMode.stdout, /Next queue item: Review pending transaction/);

    const endDayModeJsonResult = await runWm(todayRoot, ["mode", "end-day", "--json"]);
    const endDayModeJson = JSON.parse(endDayModeJsonResult.stdout);
    assert.equal(endDayModeJson.mode, "end-day");
    assert.equal(endDayModeJson.unresolved_transactions.length, 4);

    const meetingMode = await runWm(todayRoot, ["mode", "meeting", "per_jeff"]);
    assert.match(meetingMode.stdout, /Workday mode: Meeting/);
    assert.match(meetingMode.stdout, /Target: Jeff/);

    const afterMeetingModeJsonResult = await runWm(todayRoot, ["mode", "after-meeting", "ctx_inventory_project", "--json"]);
    const afterMeetingModeJson = JSON.parse(afterMeetingModeJsonResult.stdout);
    assert.equal(afterMeetingModeJson.mode, "after-meeting");
    assert.equal(afterMeetingModeJson.target.id, "ctx_inventory_project");

    const contextDashboard = await runWm(todayRoot, ["context", "dashboard", "ctx_inventory_project"]);
    assert.match(contextDashboard.stdout, /Context dashboard: Inventory Project/);
    assert.match(contextDashboard.stdout, /Active facts:/);

    const contextDashboardJsonResult = await runWm(todayRoot, ["context", "dashboard", "ctx_inventory_project", "--json"]);
    const contextDashboardJson = JSON.parse(contextDashboardJsonResult.stdout);
    assert.equal(contextDashboardJson.context.id, "ctx_inventory_project");

    const contextOperatingRoom = await runWm(todayRoot, ["context", "operating-room", "ctx_inventory_project"]);
    assert.match(contextOperatingRoom.stdout, /Context operating room: Inventory Project/);
    assert.match(contextOperatingRoom.stdout, /Current facts:/);
    assert.match(contextOperatingRoom.stdout, /Risks:/);

    const contextOperatingRoomJsonResult = await runWm(todayRoot, [
      "context",
      "operating-room",
      "ctx_inventory_project",
      "--json"
    ]);
    const contextOperatingRoomJson = JSON.parse(contextOperatingRoomJsonResult.stdout);
    assert.equal(contextOperatingRoomJson.context.id, "ctx_inventory_project");
    assert.equal(contextOperatingRoomJson.quickActions.some((action) => action.action_id === "capture_context_note"), true);

    const contextOperatingRoomV3 = await runWm(todayRoot, ["context", "operating-room-v3", "ctx_inventory_project"]);
    assert.match(contextOperatingRoomV3.stdout, /Context operating room v3: Inventory Project/);
    assert.match(contextOperatingRoomV3.stdout, /Symbolic facts:/);

    const contextOperatingRoomV3JsonResult = await runWm(todayRoot, [
      "context",
      "operating-room-v3",
      "ctx_inventory_project",
      "--json"
    ]);
    const contextOperatingRoomV3Json = JSON.parse(contextOperatingRoomV3JsonResult.stdout);
    assert.equal(contextOperatingRoomV3Json.version, "context-operating-room-v3");
    assert.equal(contextOperatingRoomV3Json.canonical_writes.length, 0);

    const contextTimeline = await runWm(todayRoot, ["context", "timeline", "ctx_inventory_project"]);
    assert.match(contextTimeline.stdout, /Context timeline: Inventory Project/);
    assert.match(contextTimeline.stdout, /Timeline items:/);

    const contextTimelineJsonResult = await runWm(todayRoot, ["context", "timeline", "ctx_inventory_project", "--json"]);
    const contextTimelineJson = JSON.parse(contextTimelineJsonResult.stdout);
    assert.equal(contextTimelineJson.context.id, "ctx_inventory_project");
    assert.equal(contextTimelineJson.items.some((item) => item.item_type === "event" && item.event_id === "ev_2026_05_21_001"), true);

    await writeVaultFile(
      todayRoot,
      "memory/people/jeffrey.md",
      `---
id: per_jeffrey
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Jeff
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_jeffrey_reports
---

# Jeffrey

## Active claims

- claim_id: clm_jeffrey_reports
  statement: Jeffrey reports to Dana.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
    );
    const entityStewardship = await runWm(todayRoot, ["entities", "stewardship", "--kind", "person"]);
    assert.match(entityStewardship.stdout, /Entity stewardship: person/);
    assert.match(entityStewardship.stdout, /Identity ambiguity: 2/);

    const entityRepairV2Result = await runWm(todayRoot, [
      "entities",
      "repair-v2",
      "--kind",
      "identity_review",
      "--id",
      "per_jeff",
      "--note",
      "May be duplicated with Jeffrey.",
      "--json"
    ]);
    const entityRepairV2Json = JSON.parse(entityRepairV2Result.stdout);
    assert.equal(entityRepairV2Json.allowed, true);
    assert.equal(entityRepairV2Json.transaction.operations[0].op, "STAGE_REVIEW");

    const entityStewardshipJsonResult = await runWm(todayRoot, ["entities", "stewardship", "--kind", "person", "--json"]);
    const entityStewardshipJson = JSON.parse(entityStewardshipJsonResult.stdout);
    assert.equal(entityStewardshipJson.summary.identity_ambiguity >= 1, true);
    assert.equal(
      entityStewardshipJson.items.some(
        (item) => item.id === "per_jeff" && item.recommendedReviewLane === "identity_ambiguity"
      ),
      true
    );
  } finally {
    await rm(todayRoot, { recursive: true, force: true });
  }

  const rejectRoot = await makeTempVault();

  try {
    await runWm(rejectRoot, ["ingest", "Maybe I should ask Joe"]);
    const rejectResult = await runWm(rejectRoot, [
      "tx",
      "reject",
      "tx_2026_05_20_001",
      "--reason",
      "Not needed"
    ]);
    assert.match(rejectResult.stdout, /Rejected transaction tx_2026_05_20_001: Not needed/);
    assert.match(
      await readVaultFile(rejectRoot, "memory/transactions/rejected/tx_2026_05_20_001.md"),
      /transaction_state: rejected/
    );
  } finally {
    await rm(rejectRoot, { recursive: true, force: true });
  }

  const lintRoot = await makeTempVault();

  try {
    await writeVaultFile(
      lintRoot,
      "memory/topics/mysql.md",
      `---
id: top_mysql
type: topic
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases: []
source_events: []
related: []
summary_generated_from: []
---

# MySQL

## Active claims

- claim_id: clm_mysql_unknown_scope
  statement: We use MySQL.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: null
  scope_state: unknown
  evidence: []
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
    );
    const lintResult = await runWm(lintRoot, ["lint"]);
    assert.match(lintResult.stdout, /Staged \d+ lint review item/);
    const reviewResult = await runWm(lintRoot, ["review", "inbox"]);
    assert.match(reviewResult.stdout, /lint-unscoped_claim/);
    assert.match(await readVaultFile(lintRoot, "memory/topics/mysql.md"), /object_state: active/);
  } finally {
    await rm(lintRoot, { recursive: true, force: true });
  }

  const healthRoot = await makeTempVault();

  try {
    await writeHealthFixture(healthRoot);

    const healthCheck = await runWm(healthRoot, ["health", "check"]);
    assert.match(healthCheck.stdout, /Memory health/);
    assert.match(healthCheck.stdout, /staged_review_items\s+1/);
    assert.match(healthCheck.stdout, /stale_noop_events\s+1/);
    assert.match(healthCheck.stdout, /pages_missing_source_events\s+1/);
    assert.match(healthCheck.stdout, /Suggested manual actions/);

    const healthStage = await runWm(healthRoot, [
      "health",
      "check",
      "--stage-review",
      "--note",
      "Manual health triage."
    ]);
    const healthTransactionId = /Pending health review transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(
      healthStage.stdout
    )?.[1];
    assert.ok(healthTransactionId);
    assert.match(
      await readVaultFile(healthRoot, `memory/transactions/pending/${healthTransactionId}.md`),
      /health-stale_noop_event/
    );
    await expectMissing(healthRoot, "memory/review/health-stale_noop_event.md");
    assert.match(await readVaultFile(healthRoot, "memory/topics/mysql.md"), /review_state: contested/);
  } finally {
    await rm(healthRoot, { recursive: true, force: true });
  }

  const v3CliRoot = await makeTempVault();

  try {
    await writeVaultFile(v3CliRoot, "memory/events/2026/2026-05/2026-05-20-001.md", `---
id: ev_2026_05_20_001
type: event
object_state: active
review_state: reviewed
recorded_at: 2026-05-20T12:00:00-03:00
observed_at: null
source_type: user_note
source_actor: user
derived_claims: []
---

# Event ev_2026_05_20_001

## Raw text

I started new job this monday as a AI Engineer at SmartEquip

## Candidate extraction

- No durable claim candidates extracted.
`);
    await writeVaultFile(v3CliRoot, "memory/review/mysql-scope.md", `---
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
`);

    const applyReview = await runWm(v3CliRoot, [
      "review",
      "apply-staged",
      "rev_mysql_scope",
      "--target",
      "memory/topics/mysql.md",
      "--create-context",
      "Inventory Project",
      "--note",
      "Scope confirmed"
    ]);
    const applyReviewId = /Pending review apply transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(applyReview.stdout)?.[1];
    assert.ok(applyReviewId);
    assert.match(await readVaultFile(v3CliRoot, `memory/transactions/pending/${applyReviewId}.md`), /scope: ctx_inventory_project/);

    const reprocess = await runWm(v3CliRoot, [
      "events",
      "reprocess",
      "ev_2026_05_20_001",
      "--stage-only"
    ]);
    const reprocessId = /Pending reprocess transaction: (tx_\d{4}_\d{2}_\d{2}_\d{3})/.exec(reprocess.stdout)?.[1];
    assert.ok(reprocessId);
    assert.match(await readVaultFile(v3CliRoot, `memory/transactions/pending/${reprocessId}.md`), /clm_user_job_ai_engineer_smartequip/);
  } finally {
    await rm(v3CliRoot, { recursive: true, force: true });
  }
}
