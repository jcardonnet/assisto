import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test.describe.configure({ timeout: 60_000 });

test("ask tab stays active when the initial today load finishes late", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-ask-tab-race-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.route("**/api/today", async (route) => {
      await delay(150);
      await route.continue();
    });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await expect(page.locator("#ask-input")).toBeVisible();
    await expect(page.locator('[data-tab="ask"]')).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(250);
    await expect(page.locator("#ask-input")).toBeVisible();
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("ask tab renders structured cited answer basis with non-persistent copy controls", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-ask-tab-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.route("**/api/ask/draft/preview", async (route) => {
      const body = route.request().postDataJSON();
      assert.equal(body.question, "Who is my manager?");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          question: body.question,
          provider_name: "mock-drafter",
          provider_model: "mock-model",
          generated_at: "2026-05-27T15:00:00.000Z",
          answer_text: "Jeff is your manager.",
          citations: ["clm_jeff_manager", "ev_2026_05_21_001"],
          cannot_confirm: ["Memory does not confirm when Jeff became manager."],
          warnings: ["Draft is ephemeral and not saved."],
          basis: {}
        })
      });
    });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("Who is my manager?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();

    await expect(page.getByRole("heading", { name: "Retrieval plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What memory can say" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Supporting claims" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conflicts or stale facts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proof paths" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Repair actions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Suggested next questions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence Events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked FollowUps" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matched pages" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Citation explorer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matched page preview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Source Event preview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cited answer export" })).toBeVisible();
    const answerSection = page.locator('[data-ask-section="what-memory-can-say"]');
    const citationSection = page.locator('[data-ask-section="citation-explorer"]');
    const proofSection = page.locator('[data-ask-section="proof-paths"]');
    const pagePreviewSection = page.locator('[data-ask-section="matched-page-preview"]');
    const eventPreviewSection = page.locator('[data-ask-section="source-event-preview"]');
    const repairSection = page.locator('[data-ask-section="repair-actions"]');
    const planSection = page.locator('[data-ask-section="retrieval-plan"]');
    await expect(planSection.getByRole("heading", { name: "manager_reporting" })).toBeVisible();
    await expect(planSection.getByRole("heading", { name: "relation_claims" })).toBeVisible();
    await expect(answerSection.getByText("Jeff is my manager.")).toBeVisible();
    await expect(answerSection.getByText("claim_id: clm_jeff_manager")).toBeVisible();
    await expect(answerSection.getByText("page: memory/people/jeff.md")).toBeVisible();
    await expect(answerSection.getByText("events: ev_2026_05_21_001")).toBeVisible();
    await expect(answerSection.getByRole("button", { name: "Open Person page" })).toBeVisible();
    await expect(citationSection.getByText("clm_jeff_manager")).toBeVisible();
    await expect(citationSection.getByText("ev_2026_05_21_001")).toBeVisible();
    await expect(citationSection.getByText(/sym_proof_/).first()).toBeVisible();
    await expect(proofSection.getByText(/canonical_frame|inverse_relation/).first()).toBeVisible();
    await expect(proofSection.getByRole("button", { name: "Copy proof path" }).first()).toBeVisible();
    await expect(pagePreviewSection.getByText("memory/people/jeff.md")).toBeVisible();
    await expect(eventPreviewSection.getByText("Jeff is my manager.")).toBeVisible();
    await expect(repairSection.getByText("Inspect matched memory pages")).toBeVisible();
    await expect(repairSection.getByRole("button", { name: "Open entities" })).toBeVisible();
    await expect(page.locator("#answer-contract-export-text")).toContainText("## What memory can say");
    await expect(page.locator("#answer-contract-export-text")).toContainText("clm_jeff_manager");
    await expect(page.locator("#answer-contract-export-text")).toContainText("## Proof paths");

    await page.getByRole("button", { name: "Pin question" }).click();
    await expect(page.locator('[data-ask-section="pinned-questions"]').getByText("Who is my manager?")).toBeVisible();

    await page.getByRole("button", { name: "Copy cited basis" }).first().click();
    await expect(page.locator("#copy-output")).toContainText("Derived text only; not saved");
    await expect(page.locator("#copy-output")).toContainText("clm_jeff_manager");

    await answerSection.getByRole("button", { name: "Open Person page" }).click();
    await expect(page.locator('[data-tab="entities"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#entity-detail").getByRole("heading", { name: "Jeff" })).toBeVisible();

    await page.getByRole("button", { name: "Before meeting brief" }).first().click();
    await expect(page.locator("#brief-kind")).toHaveValue("person");
    await expect(page.locator("#brief-export-text")).toContainText("# Session brief: Jeff");

    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("Who is my manager?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
    await expect(answerSection.getByText("Jeff is my manager.")).toBeVisible();

    await page.getByRole("button", { name: "Draft answer" }).click();
    const draftSection = page.locator('[data-ask-section="draft-answer"]');
    await expect(draftSection.getByText("Jeff is your manager.")).toBeVisible();
    await expect(draftSection.getByText("clm_jeff_manager")).toBeVisible();
    await expect(draftSection.getByText("Memory does not confirm when Jeff became manager.")).toBeVisible();
    await expect(draftSection.getByText("Draft is ephemeral and not saved.")).toBeVisible();
    await page.getByRole("button", { name: "Copy draft" }).click();
    await expect(page.locator("#copy-output")).toContainText("Jeff is your manager.");

    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("What is the Neptune deploy key?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
    await expect(page.locator("#copy-output")).toBeHidden();
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("ask tab renders no-match guidance without inventing memory", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-ask-tab-no-match-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("What is the Neptune deploy key?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();

    await expect(page.getByRole("heading", { name: "What memory cannot confirm" })).toBeVisible();
    const cannotConfirmSection = page.locator('[data-ask-section="what-memory-cannot-confirm"]');
    const answerSection = page.locator('[data-ask-section="what-memory-can-say"]');
    const manualActionSection = page.locator('[data-ask-section="repair-actions"]');
    await expect(
      cannotConfirmSection.getByText("No deterministic memory page, claim ID, or relation claim matched the question.")
    ).toBeVisible();
    await expect(answerSection.getByText("No direct answers found in active memory.")).toBeVisible();
    await expect(manualActionSection.getByText("Capture a note if this should become memory")).toBeVisible();
    await expect(manualActionSection.getByText("Log this retrieval miss")).toBeVisible();
    await expect(manualActionSection.getByRole("button", { name: "Capture missing memory" })).toBeVisible();
    await expect(manualActionSection.getByRole("button", { name: "Log retrieval miss" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Log retrieval miss" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Missing-memory action" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matched pages" })).toBeVisible();
    const matchedPagesSection = page.locator('[data-ask-section="matched-pages"]');
    await expect(matchedPagesSection.getByText("No matched people, topics, or contexts.")).toBeVisible();
    await expect(page.locator(".ask-card", { hasText: "Neptune deploy key" })).toHaveCount(0);

    await page.getByLabel("Missing-memory note").fill("Need to capture the Neptune deploy key source.");
    await page.getByRole("button", { name: "Preview missing-memory action" }).click();
    await expect(page.locator("#ask-missing-memory-output").getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#ask-missing-memory-output")).toContainText("log friction");
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByLabel("Friction note").fill("Memory could not answer the Neptune deploy key question.");
    await page.getByRole("button", { name: "Preview log" }).click();
    await expect(page.locator("#ask-friction-output").getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#ask-friction-output")).toContainText("log friction");
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Log miss" }).click();
    await expect(page.locator("#ask-friction-output").getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.match(
      await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"),
      /source_label: friction:retrieval_miss/
    );
    assert.match(
      await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /NOOP/
    );
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
