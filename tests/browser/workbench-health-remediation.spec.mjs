import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("health tab previews and stages one finding without direct ReviewItem writes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-health-remediation-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.locator('[data-tab="health"]').click();
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Maintenance Dream Cycle" })).toBeVisible();
    await expect(page.locator(".maintenance-panel")).toContainText("Stageable");
    const staleFinding = page.locator("[data-finding-id]").filter({ hasText: "stale noop event" }).first();
    await expect(staleFinding.getByText(/hlth_stale_noop_event_[a-f0-9]{12}/)).toBeVisible();
    await staleFinding.getByPlaceholder("Finding note").fill("Reprocess this one.");
    await staleFinding.getByRole("button", { name: "Preview finding" }).click();

    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    await expect(page.getByText("memory/review/health-stale_noop_event.md")).toBeVisible();
    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);

    await page.locator("[data-finding-id]").filter({ hasText: "stale noop event" }).first().getByPlaceholder("Finding note").fill("Reprocess this one.");
    await page.locator("[data-finding-id]").filter({ hasText: "stale noop event" }).first().getByRole("button", { name: "Stage finding" }).click();
    await expect(page.getByRole("heading", { name: "Pending transaction created" })).toBeVisible();

    await assert.rejects(() => readVaultFile(root, "memory/review/health-stale_noop_event.md"), /ENOENT/);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
