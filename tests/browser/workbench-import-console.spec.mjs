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
    await expect(page.getByRole("heading", { name: "Import assistant" })).toBeVisible();
    await expect(page.locator("#import-assistant-section .pill")).toHaveText("Import 10 curated notes");
    await expect(page.getByText("Suggested next batch size")).toBeVisible();
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

test("import tab triages units with split, skip, and per-unit metadata", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-import-triage-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByLabel("Batch text").fill("Joe is the DBA.\n\nWe use MySQL.\n---\nJoe is the DBA.");
    await page.getByRole("button", { name: "Prepare triage" }).click();
    await expect(page.getByRole("heading", { name: "Import triage" })).toBeVisible();

    await page.getByRole("button", { name: "Split unit" }).first().click();
    await expect(page.getByLabel("Unit 3 text")).toBeVisible();
    await page.getByLabel("Unit 1 source label").fill("triaged person note");
    await page.getByLabel("Unit 1 observed at").fill("2026-05-22");
    await page.getByLabel("Unit 1 context").fill("ctx_inventory_project");
    await page.getByLabel("Unit 2 action").selectOption("skip");

    await page.getByRole("button", { name: "Preview triage" }).click();
    await expect(page.getByRole("heading", { name: "Preview triage" })).toBeVisible();
    const importOutput = page.locator("#import-output");
    await expect(page.getByText("triaged person note")).toBeVisible();
    await expect(page.getByText("triage_skip")).toBeVisible();
    await expect(importOutput.getByText("Likely safe")).toBeVisible();
    await expect(importOutput.getByText("Likely staged")).toBeVisible();
    await expect(importOutput.getByText("Estimated review units")).toBeVisible();
    await expect(importOutput.getByText("Duplicate groups")).toBeVisible();
    await expect(importOutput.getByText("unit_1, unit_3")).toBeVisible();
    await expect(importOutput.getByText("Likely outcome").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload import session" })).toBeVisible();
    await page.getByRole("button", { name: "Reload import session" }).click();
    await expect(page.getByRole("heading", { name: "Preview triage" })).toBeVisible();
    await expect(importOutput.getByText("unit_1, unit_3")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create triage" }).click();
    await expect(page.getByRole("heading", { name: "Triage imports created" })).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: triaged person note/);
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ctx_inventory_project/);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
