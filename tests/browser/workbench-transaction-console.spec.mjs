import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("transaction console previews, applies, and rejects pending transactions", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-transaction-console-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Transactions" }).click();
    await expect(page.getByRole("heading", { name: "Transaction summary" })).toBeVisible();

    await page
      .locator("article.item")
      .filter({ hasText: "tx_2026_05_21_apply" })
      .getByRole("button", { name: "Details" })
      .click();
    await expect(page.getByRole("heading", { name: "tx_2026_05_21_apply" })).toBeVisible();
    await expect(page.getByText("memory/topics/transaction-console.md")).toBeVisible();
    await expect(page.getByText("validation passed")).toBeVisible();

    await page.getByRole("button", { name: "Preview apply" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/topics/transaction-console.md"), /ENOENT/);

    await page.getByRole("button", { name: "Apply transaction" }).click();
    await expect(page.getByRole("heading", { name: "Transaction applied" })).toBeVisible();
    await expect(page.getByText("applied · validation passed")).toBeVisible();
    assert.match(await readVaultFile(root, "memory/topics/transaction-console.md"), /clm_transaction_console_ready/);

    await page
      .locator("article.item")
      .filter({ hasText: "tx_2026_05_21_reject" })
      .getByRole("button", { name: "Details" })
      .click();
    await expect(page.getByRole("heading", { name: "tx_2026_05_21_reject" })).toBeVisible();
    await page.getByPlaceholder("Rejection reason").fill("Not needed after manual review.");

    await page.getByRole("button", { name: "Preview reject" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await assert.rejects(
      () => readVaultFile(root, "memory/transactions/rejected/tx_2026_05_21_reject.md"),
      /ENOENT/
    );
    await assert.rejects(() => readVaultFile(root, "memory/topics/rejected-transaction-console.md"), /ENOENT/);

    await page.getByPlaceholder("Rejection reason").fill("Not needed after manual review.");
    await page.getByRole("button", { name: "Reject transaction" }).click();
    await expect(page.getByRole("heading", { name: "Transaction rejected" })).toBeVisible();
    assert.match(
      await readVaultFile(root, "memory/transactions/rejected/tx_2026_05_21_reject.md"),
      /transaction_state: rejected/
    );
    await assert.rejects(() => readVaultFile(root, "memory/topics/rejected-transaction-console.md"), /ENOENT/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("transaction console renders detail load failures", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-transaction-console-error-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.route("**/api/transactions/detail?id=tx_2026_05_21_apply", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ error: "Transaction not found: tx_2026_05_21_apply" })
      });
    });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Transactions" }).click();
    await page
      .locator("article.item")
      .filter({ hasText: "tx_2026_05_21_apply" })
      .getByRole("button", { name: "Details" })
      .click();

    await expect(page.getByText("Failed to load transaction detail: Transaction not found")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transaction detail" })).toBeVisible();
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
