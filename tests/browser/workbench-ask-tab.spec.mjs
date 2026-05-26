import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("ask tab renders structured cited answer basis with non-persistent copy controls", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-ask-tab-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("Who is my manager?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();

    await expect(page.getByRole("heading", { name: "Answer candidates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Supporting claims" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence Events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked FollowUps" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matched pages" })).toBeVisible();
    const answerSection = page.locator('[data-ask-section="answer-candidates"]');
    await expect(answerSection.getByText("Jeff is my manager.")).toBeVisible();
    await expect(answerSection.getByText("claim_id: clm_jeff_manager")).toBeVisible();
    await expect(answerSection.getByText("page: memory/people/jeff.md")).toBeVisible();
    await expect(answerSection.getByText("events: ev_2026_05_21_001")).toBeVisible();

    await page.getByRole("button", { name: "Copy citation" }).first().click();
    await expect(page.locator("#copy-output")).toContainText("Derived text only; not saved");
    await expect(page.locator("#copy-output")).toContainText("clm_jeff_manager");
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
    const answerSection = page.locator('[data-ask-section="answer-candidates"]');
    await expect(
      cannotConfirmSection.getByText("No deterministic memory page, claim ID, or relation claim matched the question.")
    ).toBeVisible();
    await expect(answerSection.getByText("No active answer candidates found.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matched pages" })).toBeVisible();
    const matchedPagesSection = page.locator('[data-ask-section="matched-pages"]');
    await expect(matchedPagesSection.getByText("No matched people, topics, or contexts.")).toBeVisible();
    await expect(page.locator(".ask-card", { hasText: "Neptune deploy key" })).toHaveCount(0);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
