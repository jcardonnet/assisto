import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";

test("import tab previews, creates pending transactions, and dedupes by source hash", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-import-console-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByLabel("Batch text").fill("Joe is the DBA. We use MySQL.\n---\nJoe is the DBA. We use MySQL.");
    await page.getByLabel("Source label", { exact: true }).fill("browser import");

    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(page.getByRole("heading", { name: "Preview import" })).toBeVisible();
    await expect(page.getByText("Skipped duplicate")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create pending imports" }).click();
    await expect(page.getByRole("heading", { name: "Import transactions created" })).toBeVisible();
    await expect(page.getByText("Skipped duplicate")).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_hash: [a-f0-9]{64}/);
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: browser import/);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
