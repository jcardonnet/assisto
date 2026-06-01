import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("v7 first-day dogfood loop exposes activation, eval, modes, feedback, review, and import guidance", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-v7-first-day-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    await writeVaultFile(
      root,
      ".assisto-local/eval/questions.json",
      JSON.stringify(
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
              question: "What is the Neptune deploy key?",
              tags: ["missing-memory"]
            }
          ]
        },
        null,
        2
      )
    );
    await writeVaultFile(
      root,
      ".assisto-local/daily/session.json",
      JSON.stringify(
        {
          dismissed_prompts: ["activation_intro"],
          pinned_daily_questions: ["Who is my manager?"],
          last_selected_mode: "morning",
          last_completed_derived_step: "ask_cited_question"
        },
        null,
        2
      )
    );

    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");
    const beforeFixtureEvent = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");
    const beforeEventFiles = await eventFiles(root);
    const beforePendingTransactions = await pendingTransactionFiles(root);

    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "First-run activation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Use Assisto Tomorrow" })).toBeVisible();
    await expect(page.locator("[data-use-tomorrow]").getByText("Review one memory proposal", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Local daily session" })).toBeVisible();
    await expect(page.getByText(".assisto-local/daily/session.json")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Workday modes" })).toBeVisible();

    await page.getByRole("button", { name: "Morning" }).click();
    await expect(page.locator("#workday-mode-output").getByRole("heading", { name: "Morning" })).toBeVisible();
    await expect(page.locator("#workday-mode-output")).toContainText("do not persist generated explanations");

    await page.locator("#workday-mode-target").fill("ctx_inventory_project");
    await page.getByRole("button", { name: "Meeting", exact: true }).click();
    await expect(page.locator("#workday-mode-output").getByRole("heading", { name: "Meeting" })).toBeVisible();
    await expect(page.locator("#workday-mode-output")).toContainText("Inventory Project");

    await page.getByRole("button", { name: "Dogfood Eval" }).click();
    await expect(page.getByRole("heading", { name: "Dogfood Eval" })).toBeVisible();
    await expect(page.getByText("Questions: 2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is the Neptune deploy key?" })).toBeVisible();
    await page.getByRole("button", { name: "Run eval" }).click();
    await expect(page.getByText("Dogfood eval refreshed")).toBeVisible();
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md"), beforeFixtureEvent);

    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review lanes" })).toBeVisible();
    await expect(page.locator(".review-queue-navigator")).toContainText("1 /");
    await expect(page.locator(".claim-diff-card").first()).toBeVisible();

    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await page.getByLabel("Feedback kind").selectOption("missing_context");
    await page.getByLabel("Feedback note").fill("The capture should have asked me for the Inventory Project context.");
    await page.getByLabel("Linked Event").fill("ev_2026_05_21_001");
    await page.getByLabel("Linked Transaction").fill("tx_2026_05_21_001");
    await page.getByRole("button", { name: "Preview feedback" }).click();
    await expect(page.locator("#action-output").getByRole("heading", { name: "Preview only" })).toBeVisible();
    assert.deepEqual(await eventFiles(root), beforeEventFiles);
    assert.deepEqual(await pendingTransactionFiles(root), beforePendingTransactions);

    await page.getByLabel("Feedback note").fill("The capture should have asked me for the Inventory Project context.");
    await page.getByLabel("Linked Event").fill("ev_2026_05_21_001");
    await page.getByLabel("Linked Transaction").fill("tx_2026_05_21_001");
    await page.getByRole("button", { name: "Log feedback" }).click();
    await expect(page.locator("#action-output").getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.equal((await eventFiles(root)).length, beforeEventFiles.length + 1);
    assert.equal((await pendingTransactionFiles(root)).length, beforePendingTransactions.length + 1);

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Import assistant" })).toBeVisible();
    await expect(page.locator("#import-assistant-section")).toContainText("Import 10 curated notes");
    await expect(page.locator("#import-assistant-section")).toContainText("Suggested next batch size");

    await page.getByRole("button", { name: "People/Topics/Contexts" }).click();
    await page.locator('[data-entity-kind="context"]').click();
    await page.locator("article.item").filter({ hasText: "ctx_inventory_project" }).first().getByRole("button", { name: "Open detail" }).click();
    await expect(page.getByRole("heading", { name: "Context operating page" })).toBeVisible();
    const roomV3 = await page.evaluate(async () => (await globalThis.fetch("/api/contexts/operating-room-v3?id=ctx_inventory_project")).json());
    assert.equal(roomV3.version, "context-operating-room-v3");
    assert.equal(roomV3.canonical_writes.length, 0);

    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContext);
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md"), beforeFixtureEvent);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function eventFiles(root) {
  return (await readdir(path.join(root, "memory/events/2026/2026-05"))).sort((left, right) => left.localeCompare(right));
}

async function pendingTransactionFiles(root) {
  return (await readdir(path.join(root, "memory/transactions/pending"))).sort((left, right) => left.localeCompare(right));
}
