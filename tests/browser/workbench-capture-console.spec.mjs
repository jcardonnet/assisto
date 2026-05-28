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
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await page.getByLabel("Note", { exact: true }).fill("Joe is the DBA. We use MySQL.");
    await page.getByLabel("Observed at", { exact: true }).fill("2026-05-21");
    await page.getByLabel("Source label", { exact: true }).fill("browser capture");
    await page.getByLabel("Context", { exact: true }).fill("ctx_inventory_project");

    await page.getByRole("button", { name: "Preview capture" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.getByText("memory/people/joe.md")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create pending transaction" }).click();
    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: browser capture/);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);

    await page.getByLabel("My role").fill("I am an AI Engineer at SmartEquip.");
    await page.getByLabel("Manager and team").fill("Jeff is my manager.");
    await page.getByRole("button", { name: "Preview seed kit" }).click();
    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.getByText("seed:role")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-002.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create seed kit" }).click();
    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-002.md"), /source_label: seed:role/);
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-003.md"), /source_label: seed:manager-team/);
    await assert.rejects(() => readVaultFile(root, "memory/people/jeff.md"), /ENOENT/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("quick capture is available from any Workbench tab and stays transaction backed", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-quick-capture-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await expect(page.locator("#ask-input")).toBeVisible();

    await page.getByRole("button", { name: "Quick capture" }).click();
    await expect(page.getByRole("heading", { name: "Quick capture" })).toBeVisible();
    await page.getByLabel("Quick capture note").fill("Joe is the DBA. We use MySQL.");
    await page.getByLabel("Quick observed at").fill("2026-05-22");
    await page.getByLabel("Source label preset").selectOption("meeting note");
    await page.getByLabel("Quick context").fill("ctx_inventory_project");

    await page.getByRole("button", { name: "Preview quick capture" }).click();
    await expect(page.locator("#quick-capture-output").getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#quick-capture-output")).toContainText("memory/people/joe.md");
    await assert.rejects(() => readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /ENOENT/);

    await page.getByRole("button", { name: "Create quick capture" }).click();
    await expect(page.locator("#quick-capture-output").getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    assert.match(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-20-001.md"), /source_label: meeting note/);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"), /transaction_state: pending/);
    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"), /ENOENT/);
    await expect(page.locator('[data-tab="ask"]')).toHaveAttribute("aria-pressed", "true");
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
