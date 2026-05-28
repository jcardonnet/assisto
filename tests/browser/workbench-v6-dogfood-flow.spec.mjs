import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("v6 dogfood activation flow stays derived and transaction backed", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-v6-flow-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const beforeContext = await readVaultFile(root, "memory/contexts/inventory-project.md");

    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.route("**/api/ask/draft/preview", async (route) => {
      const body = route.request().postDataJSON();

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          question: body.question,
          provider_name: "mock-v6-drafter",
          provider_model: "mock-model",
          generated_at: "2026-05-28T12:00:00.000Z",
          answer_text: "Jeff is your manager.",
          citations: ["clm_jeff_manager", "ev_2026_05_21_001"],
          cannot_confirm: ["Memory does not confirm when Jeff became manager."],
          warnings: ["Draft is ephemeral and not saved."],
          basis: {}
        })
      });
    });

    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "First-run activation" })).toBeVisible();
    await expect(page.getByText("Review one memory proposal", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dogfood Home" })).toBeVisible();
    await expect(page.getByText("next recommended action")).toBeVisible();

    await page.getByRole("button", { name: "Quick capture" }).click();
    await page.getByLabel("Quick capture note").fill("Jordan reports to Jeff. I need to ask Jeff about onboarding.");
    await page.getByLabel("Quick context").fill("ctx_inventory_project");
    await page.getByRole("button", { name: "Preview quick capture" }).click();
    await expect(page.locator("#quick-capture-output").getByRole("heading", { name: "Preview only" })).toBeVisible();
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    await page.locator("#quick-capture-close").click();

    await page.locator('[data-tab="review"]').click();
    await expect(page.getByRole("heading", { name: "Review lanes" })).toBeVisible();
    await expect(page.locator('[data-review-lane="needs_context"]')).toBeVisible();

    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("Who is my manager?");
    await page.locator("#ask-form").getByRole("button", { name: "Draft answer" }).click();
    await expect(page.locator('[data-ask-section="draft-answer"]').getByText("Jeff is your manager.")).toBeVisible();
    await expect(page.locator('[data-ask-section="draft-answer"]').getByText("Draft is ephemeral and not saved.")).toBeVisible();

    await page.locator("#ask-input").fill("What is the Neptune deploy key?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "Log retrieval miss" })).toBeVisible();
    await page.getByLabel("Friction note").fill("Memory could not answer the Neptune deploy key question.");
    await page.getByRole("button", { name: "Preview log" }).click();
    await expect(page.locator("#ask-friction-output").getByRole("heading", { name: "Preview only" })).toBeVisible();

    await page.locator('[data-tab="import"]').click();
    await page.getByLabel("Batch text").fill("Kuastav reports to Jeff.\n\nWe use MySQL.\n---\nSkip this unit.");
    await page.getByRole("button", { name: "Prepare triage" }).click();
    await expect(page.getByRole("heading", { name: "Import triage" })).toBeVisible();
    await page.getByRole("button", { name: "Split unit" }).first().click();
    await page.getByLabel("Unit 2 action").selectOption("skip");
    await page.getByRole("button", { name: "Preview triage" }).click();
    await expect(page.getByRole("heading", { name: "Preview triage" })).toBeVisible();
    await expect(page.getByText("triage_skip")).toBeVisible();

    await page.locator('[data-tab="entities"]').click();
    await page.locator('[data-entity-kind="context"]').click();
    await page.locator("article.item").filter({ hasText: "ctx_inventory_project" }).first().getByRole("button", { name: "Open detail" }).click();
    await expect(page.getByRole("heading", { name: "Context operating page" })).toBeVisible();
    await page.getByLabel("Context note or correction").fill("Inventory Project uses PostgreSQL for reporting.");
    await page.getByLabel("Note type").selectOption("correction");
    await page.getByRole("button", { name: "Preview context note" }).click();
    await expect(page.locator("#entity-action-output").getByRole("heading", { name: "Preview only" })).toBeVisible();

    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContext);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
