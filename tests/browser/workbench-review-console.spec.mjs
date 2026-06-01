import assert from "node:assert/strict";
import path from "node:path";
import { readdir, rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test("review tab filters by reason and previews staged apply without canonical writes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-review-console-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    await writeVaultFile(
      root,
      "memory/review/jeff-role.md",
      `---
id: rev_jeff_role
type: review_item
object_state: active
review_state: staged
review_reason: role_change
created_at: 2026-05-21T10:15:00-03:00
source_events:
  - ev_2026_05_21_001
affected_files:
  - people/jeff.md
---

# Review: Jeff role

## Staged claims

- claim_id: clm_jeff_role_change
  statement: Jeff changed roles.
  claim_kind: fact
  claim_state: staged
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:15:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
    );
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    const beforeReviewPage = await readVaultFile(root, "memory/review/mysql-scope.md");
    const beforePendingTransactions = await pendingTransactionFiles(root);
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review lanes" })).toBeVisible();
    await expect(page.locator('[data-review-reason="all"]')).toContainText("2 items");
    await expect(page.locator('[data-review-lane="all"]')).toContainText("2 items");
    await expect(page.locator(".review-queue-navigator")).toContainText("1 / 2");
    const acceleration = await page.evaluate(async () => {
      const response = await globalThis.fetch("/api/review/acceleration");
      return response.json();
    });
    assert.equal(acceleration.batchApplyAllowed, false);
    assert.equal(acceleration.lanes.some((lane) => lane.id === "conflict_or_change"), true);

    await expect(page.locator('article.item[data-review-selected="true"]')).toContainText("rev_mysql_scope");

    await page.locator(".review-queue-next").click();
    await expect(page.locator(".review-queue-navigator")).toContainText("2 / 2");
    await expect(page.locator('article.item[data-review-selected="true"]')).toContainText("rev_jeff_role");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".review-queue-navigator")).toContainText("1 / 2");
    await expect(page.locator('article.item[data-review-selected="true"]')).toContainText("rev_mysql_scope");

    await page.locator('[data-review-lane="conflict_or_change"]').click();
    await expect(page.locator('[data-review-lane="conflict_or_change"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".review-queue-navigator")).toContainText("1 / 1");
    await expect(page.getByRole("heading", { name: "rev_jeff_role" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "rev_mysql_scope" })).toHaveCount(0);
    await expect(page.locator(".claim-diff-card", { hasText: "clm_jeff_role_change" })).toBeVisible();

    await page.locator('[data-review-lane="needs_context"]').click();
    await expect(page.locator('[data-review-lane="needs_context"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "rev_mysql_scope" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "rev_jeff_role" })).toHaveCount(0);
    await expect(page.locator(".claim-diff-card", { hasText: "clm_mysql_used_unknown_scope" })).toBeVisible();
    await expect(page.locator(".claim-diff-card", { hasText: "scope_state: unknown" })).toBeVisible();

    await page.locator('[data-review-lane="all"]').click();
    await page.locator('[data-review-reason="role_change"]').click();
    await expect(page.locator('[data-review-reason="role_change"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "rev_jeff_role" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "rev_mysql_scope" })).toHaveCount(0);

    await page.locator('[data-review-reason="unscoped_claim"]').click();
    await expect(page.locator('[data-review-reason="unscoped_claim"]')).toHaveAttribute("aria-pressed", "true");
    const mysqlReviewCard = page.locator("article.item").filter({ hasText: "rev_mysql_scope" });
    await expect(mysqlReviewCard.getByRole("heading", { name: "rev_mysql_scope" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "rev_jeff_role" })).toHaveCount(0);

    const applyForm = mysqlReviewCard.locator(".review-apply-form");
    await applyForm.getByPlaceholder("Context id or path").fill("ctx_inventory_project");
    await applyForm.getByPlaceholder("Note").fill("Preview only scope confirmation.");
    await applyForm.getByRole("button", { name: "Preview" }).click();

    await expect(page.getByRole("heading", { name: "Preview only" })).toBeVisible();
    const actionOutput = page.locator("#action-output");
    await expect(actionOutput.locator(".pill", { hasText: "apply staged claim" })).toBeVisible();
    await expect(actionOutput.getByText("memory/topics/mysql.md")).toBeVisible();

    await assert.rejects(() => readVaultFile(root, "memory/topics/mysql.md"), /ENOENT/);
    assert.deepEqual(await pendingTransactionFiles(root), beforePendingTransactions);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
    assert.equal(await readVaultFile(root, "memory/review/mysql-scope.md"), beforeReviewPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function pendingTransactionFiles(root) {
  return (await readdir(path.join(root, "memory/transactions/pending"))).sort((left, right) => left.localeCompare(right));
}
