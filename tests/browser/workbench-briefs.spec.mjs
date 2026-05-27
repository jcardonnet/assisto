import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("briefs tab loads presets, targets, and derived export text without persistence", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-briefs-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Dogfood Home", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "What changed recently" }).click();
    await expect(page.locator("#brief-kind")).toHaveValue("recent");
    await expect(page.locator("#brief-export-text")).toContainText("# Session brief: What changed recently");

    await page.locator('[data-tab="briefs"]').click();
    await expect(page.locator("#brief-kind")).toContainText("Today");
    await expect(page.locator("#brief-kind")).toContainText("Before meeting with Person");
    await expect(page.locator("#brief-kind")).toContainText("Project/Context status");
    await expect(page.locator("#brief-kind")).toContainText("Review-risk brief");
    await expect(page.locator("#brief-kind")).toContainText("Follow-up review");
    await expect(page.locator("#brief-kind")).toContainText("What changed recently");

    await page.locator("#brief-kind").selectOption("person");
    await expect(page.locator("#brief-target-select")).toBeVisible();
    await expect(page.locator("#brief-target-select")).toContainText("Jeff");
    await page.locator("#brief-target-select").selectOption("per_jeff");
    await page.locator("#brief-form").getByRole("button", { name: "Build" }).click();

    await expect(page.getByRole("heading", { name: "Jeff", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active claims" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Uncertainty and review" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open follow-ups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Source Events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warnings" })).toBeVisible();
    await expect(page.locator("#brief-export-text")).toContainText("# Session brief: Jeff");
    await expect(page.locator("#brief-export-text")).toContainText("Generated explanations were not saved");

    await page.getByRole("button", { name: "Copy brief" }).click();
    await expect(page.locator("#copy-output")).toContainText("Derived text only; not saved");
    await expect(page.locator("#copy-output")).toContainText("# Session brief: Jeff");

    await page.locator("#brief-kind").selectOption("context");
    await expect(page.locator("#brief-target-select")).toContainText("Inventory Project");
    await expect(page.locator("#brief-target-select")).toContainText("Warehouse Project");

    await page.locator("#brief-kind").selectOption("recent");
    await expect(page.locator("#brief-target-kind")).toBeVisible();
    await page.locator("#brief-target-kind").selectOption("person");
    await expect(page.locator("#brief-target-select")).toContainText("Jeff");

    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
