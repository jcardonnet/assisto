import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("today tab summarizes daily triage and previews actions through existing routes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-today-home-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const eventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("needs attention")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pending Transactions", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staged ReviewItems", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stale NOOP Events", exact: true })).toBeVisible();
    await expect(page.getByText("fu_ask_jeff")).toBeVisible();

    const staleNoopCard = page.locator('[data-today-section="stale-noop-events"] article.item').filter({
      hasText: "ev_2026_05_21_003"
    });
    await staleNoopCard.getByRole("button", { name: "Preview reprocess" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#today-action-output").getByText("reprocess event").first()).toBeVisible();
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-003.md"), eventBefore);

    await page.getByRole("button", { name: "Today" }).click();
    const transactionCard = page.locator('[data-today-section="pending-transactions"] article.item').filter({
      hasText: "tx_2026_05_21_apply"
    });
    await transactionCard.getByRole("button", { name: "Preview apply" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.getByText("memory/topics/transaction-console.md")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/topics/transaction-console.md"), /ENOENT/);

    await page.getByRole("button", { name: "Today" }).click();
    await page.getByRole("button", { name: "Open Review" }).click();
    await expect(page.locator('[data-tab="review"]')).toHaveAttribute("aria-pressed", "true");
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
