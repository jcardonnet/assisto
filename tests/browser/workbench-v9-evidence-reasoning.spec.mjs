import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test.describe.configure({ timeout: 60_000 });

test("Workbench v9 surfaces cited proof paths, entity risk, Context room, and dogfood feedback safely", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-v9-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    await writeVaultFile(
      root,
      "memory/people/jeffrey.md",
      `---
id: per_jeffrey
type: person
object_state: active
review_state: reviewed
created_at: 2026-05-21T10:00:00-03:00
updated_at: 2026-05-21T10:00:00-03:00
aliases:
  - Jeff
source_events:
  - ev_2026_05_21_001
related: []
summary_generated_from:
  - clm_jeffrey_reports
---

# Jeffrey

## Active claims

- claim_id: clm_jeffrey_reports
  statement: Jeffrey reports to Dana.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: ctx_inventory_project
  scope_state: complete
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T10:00:00-03:00
  observed_at: 2026-05-21
  valid_from: null
  valid_to: null
`
    );
    const beforePersonPage = await readVaultFile(root, "memory/people/jeff.md");
    const beforeContextPage = await readVaultFile(root, "memory/contexts/inventory-project.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.locator('[data-tab="ask"]').click();
    await page.locator("#ask-input").fill("Who is my manager?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();

    await expect(page.getByRole("heading", { name: "What memory can say" })).toBeVisible();
    await expect(page.locator('[data-ask-section="what-memory-can-say"]').getByText("claim_id: clm_jeff_manager").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proof paths" })).toBeVisible();
    await expect(page.locator('[data-ask-section="proof-paths"]').getByText(/sym_proof_/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Citation explorer" })).toBeVisible();
    await expect(page.locator('[data-ask-section="citation-explorer"]').getByText("ev_2026_05_21_001")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Repair actions" })).toBeVisible();

    await page.getByRole("button", { name: "Open Person page" }).first().click();
    await expect(page.locator('[data-tab="entities"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#entity-detail").getByRole("heading", { name: "Jeff" })).toBeVisible();
    await expect(page.locator("#entity-detail").getByRole("heading", { name: "Stewardship risk" })).toBeVisible();
    await expect(page.locator("#entity-detail").getByText("Near duplicates")).toBeVisible();
    await expect(page.locator("#entity-detail").getByText("Jeffrey · per_jeffrey")).toBeVisible();

    await page.locator('[data-entity-kind="context"]').click();
    const contextCard = page.locator("article.item").filter({ hasText: "ctx_inventory_project" }).first();
    await contextCard.getByRole("button", { name: "Open detail" }).click();
    const detailPanel = page.locator("#entity-detail");
    await expect(detailPanel.getByRole("heading", { name: "Context operating room" })).toBeVisible();
    await expect(detailPanel.getByRole("heading", { name: "Source timeline" })).toBeVisible();
    await expect(detailPanel.getByText("No new temporal inference")).toBeVisible();

    await page.locator('[data-tab="review"]').click();
    await expect(page.getByRole("heading", { name: "Review lanes" })).toBeVisible();
    await expect(page.getByText("Review one staged memory decision at a time.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "rev_mysql_scope" })).toBeVisible();

    const feedback = await page.evaluate(async () => {
      const response = await globalThis.fetch("/api/dogfood/feedback/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "bad_answer",
          question: "Who owns Inventory Project?",
          note: "The browser evidence flow needs clearer proof before trust."
        })
      });
      return response.json();
    });

    assert.equal(feedback.created, false);
    assert.deepEqual(feedback.operations, ["NOOP"]);
    assert.deepEqual(feedback.canonical_writes, []);
    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforePersonPage);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeContextPage);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
