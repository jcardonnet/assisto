import assert from "node:assert/strict";
import path from "node:path";
import { readdir, rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("entities tab shows evidence and stages stewardship transactions without canonical writes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-entities-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    const beforePendingTransactions = await pendingTransactionFiles(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "People/Topics/Contexts" }).click();
    await expect(page.getByRole("heading", { name: "People, Topics, Contexts" })).toBeVisible();

    const jeffCard = page.locator("article.item").filter({ hasText: "per_jeff" }).first();
    await expect(jeffCard.getByRole("heading", { name: "Jeff" })).toBeVisible();
    await jeffCard.getByRole("button", { name: "Open detail" }).click();

    const detailPanel = page.locator("#entity-detail");
    await expect(detailPanel.getByRole("heading", { name: "Jeff" })).toBeVisible();
    await expect(detailPanel.getByText("clm_jeff_manager")).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "ev_2026_05_21_001 · memory/events" })).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "fu_ask_jeff" })).toBeVisible();

    await detailPanel.getByRole("button", { name: "Recent changes" }).click();
    await expect(page.locator("#brief-kind")).toHaveValue("recent");
    await expect(page.locator("#brief-target-kind")).toHaveValue("person");
    await expect(page.locator("#brief-export-text")).toContainText("# Session brief: Recent changes: Jeff");

    await page.getByRole("button", { name: "People/Topics/Contexts" }).click();
    await expect(detailPanel.getByRole("heading", { name: "Jeff" })).toBeVisible();

    const aliasForm = detailPanel.locator(".entity-alias-form");
    await aliasForm.getByPlaceholder("New alias").fill("Jeffrey");
    await aliasForm.getByRole("button", { name: "Preview alias" }).click();

    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#entity-action-output").getByText("memory/people/jeff.md")).toBeVisible();
    assert.deepEqual(await pendingTransactionFiles(root), beforePendingTransactions);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);

    await aliasForm.getByPlaceholder("New alias").fill("Jeffrey");
    await aliasForm.getByRole("button", { name: "Stage alias" }).click();

    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    await expect(page.locator("#entity-action-output .pill", { hasText: "stage entity alias" })).toBeVisible();
    assert.notDeepEqual(await pendingTransactionFiles(root), beforePendingTransactions);
    assert.match(await readVaultFile(root, "memory/transactions/pending/tx_2026_05_24_001.md"), /Stage alias "Jeffrey"/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("entities tab renders context operating pages and stages context notes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-context-operating-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforeContextPage = await readVaultFile(root, "memory/contexts/inventory-project.md");
    const beforePendingTransactions = await pendingTransactionFiles(root);
    const beforeEvents = await eventFiles(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "People/Topics/Contexts" }).click();
    await page.locator('[data-entity-kind="context"]').click();

    const contextCard = page.locator("article.item").filter({ hasText: "ctx_inventory_project" }).first();
    await expect(contextCard.getByRole("heading", { name: "Inventory Project" })).toBeVisible();
    await contextCard.getByRole("button", { name: "Open detail" }).click();

    const detailPanel = page.locator("#entity-detail");
    await expect(detailPanel.getByRole("heading", { name: "Inventory Project" })).toBeVisible();
    await expect(detailPanel.getByRole("heading", { name: "Context operating page" })).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "clm_jeff_manager" }).first()).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "per_jeff · person" }).first()).toBeVisible();

    const noteForm = detailPanel.locator(".entity-context-note-form");
    await noteForm.getByLabel("Context note or correction").fill("Inventory Project uses PostgreSQL for reporting.");
    await noteForm.getByLabel("Note type").selectOption("correction");
    await noteForm.getByRole("button", { name: "Preview context note" }).click();

    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.locator("#entity-action-output .pill", { hasText: "stage context note" })).toBeVisible();
    assert.deepEqual(await pendingTransactionFiles(root), beforePendingTransactions);
    assert.deepEqual(await eventFiles(root), beforeEvents);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContextPage);

    await noteForm.getByLabel("Context note or correction").fill("Inventory Project uses PostgreSQL for reporting.");
    await noteForm.getByLabel("Note type").selectOption("correction");
    await noteForm.getByRole("button", { name: "Stage context note" }).click();

    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();
    await expect(page.locator("#entity-action-output .pill", { hasText: "stage context note" })).toBeVisible();
    assert.notDeepEqual(await pendingTransactionFiles(root), beforePendingTransactions);
    assert.notDeepEqual(await eventFiles(root), beforeEvents);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContextPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function pendingTransactionFiles(root) {
  return (await readdir(path.join(root, "memory/transactions/pending"))).sort((left, right) => left.localeCompare(right));
}

async function eventFiles(root) {
  return (await readdir(path.join(root, "memory/events/2026/2026-05"))).sort((left, right) => left.localeCompare(right));
}
