import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";

test("capture tab previews and creates pending transactions without canonical page edits", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-capture-console-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Capture" }).click();
    await page.getByLabel("Note").fill("Joe is the DBA. We use MySQL.");
    await page.getByLabel("Observed at").fill("2026-05-21");
    await page.getByLabel("Source label").fill("browser capture");
    await page.getByLabel("Context").fill("ctx_inventory_project");

    await page.getByRole("button", { name: "Preview capture" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.getByText("memory/people/joe.md")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create pending transaction" }).click();
    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: browser capture/);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
