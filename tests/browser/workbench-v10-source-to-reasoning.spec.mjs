import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";
import { writeWorkbenchFixture } from "../workbench.mjs";

test.describe.configure({ timeout: 90_000 });

test("Workbench v10 runs the source-to-reasoning loop without direct canonical writes", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-v10-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  const symbolic = await loadTsModule("packages/core/src/symbolic/index.ts");
  let server;

  try {
    await writeWorkbenchFixture(root);
    await writeSourceReasoningFixture(root);
    const beforeJeff = await readVaultFile(root, "memory/people/jeff.md");
    const beforeInventory = await readVaultFile(root, "memory/contexts/inventory-project.md");

    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.goto(server.url);

    await page.getByRole("button", { name: "Source Inbox" }).click();
    await page.locator("#source-inbox-kind").selectOption("repo_markdown");
    await page.locator("#source-inbox-source-label").fill("browser v10 repo export");
    await page.locator("#source-inbox-raw-text").fill("Search API depends on Billing repository.\n---\nRavi owns Search API.");
    await page.locator("#source-inbox-observed-at").fill("2026-06-02");
    await page.locator("#source-inbox-context").fill("ctx_inventory_project");
    await page.getByRole("button", { name: "Preview source export" }).click();

    await expect(page.getByRole("heading", { name: "Source preview saved" })).toBeVisible();
    await expect(page.locator("#source-inbox-output")).toContainText("Canonical writes");
    await expect(page.locator("#source-inbox-output")).toContainText("repo_markdown");
    await expect(page.getByRole("heading", { name: /Session srcin_/ })).toBeVisible();

    await page.locator("#source-inbox-triage-context").fill("ctx_inventory_project");
    await page.getByRole("button", { name: "Save triage decisions" }).click();
    await expect(page.locator("#source-inbox-output")).toContainText("triaged");

    await page.getByRole("button", { name: "Create Events + pending Transactions" }).click();
    await expect(page.getByRole("heading", { name: "Source create-events result" })).toBeVisible();
    await expect(page.locator("#source-inbox-output")).toContainText("Canonical writes");
    await expect(page.locator("#source-inbox-output")).toContainText("Transaction");
    await assert.rejects(() => readVaultFile(root, "memory/people/ravi.md"), /ENOENT/);

    const index = await symbolic.buildSymbolicIndex({ root, write: true });
    assert.equal(index.derived_facts.length > 0, true);
    assert.equal(index.proofs.length >= index.derived_facts.length, true);
    assert.match(await readVaultFile(root, "memory/indexes/symbolic/facts.jsonl"), /sym_fact_/);

    const contractV4 = await page.evaluate(async () => {
      const response = await globalThis.fetch("/api/ask/contract-v4?q=" + encodeURIComponent("What does Search API depend on?"));
      return response.json();
    });
    assert.equal(contractV4.version, "answer-contract-v4");
    assert.equal(contractV4.proofTree.length > 0, true);
    assert.equal(contractV4.sourceExcerpts.some((excerpt) => excerpt.event_id === "ev_browser_v10_dependency"), true);

    await page.getByRole("button", { name: "Ask" }).click();
    await page.locator("#ask-input").fill("What does Search API depend on?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "What memory can say" })).toBeVisible();
    await expect(page.locator('[data-ask-section="proof-paths"]').getByText(/sym_proof_/).first()).toBeVisible();
    await expect(page.locator('[data-ask-section="source-event-preview"]').getByRole("heading", { name: "ev_browser_v10_dependency" }).first()).toBeVisible();

    await page.getByRole("button", { name: "People/Topics/Contexts" }).click();
    await page.locator('[data-entity-kind="context"]').click();
    const contextCard = page.locator("article.item").filter({ hasText: "ctx_search_api" }).first();
    await contextCard.getByRole("button", { name: "Open detail" }).click();
    await expect(page.locator("#entity-detail").getByRole("heading", { name: "Context operating room" })).toBeVisible();
    await expect(page.locator("#entity-detail").getByRole("heading", { name: "Source timeline" })).toBeVisible();

    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review Autopilot" })).toBeVisible();
    await page.locator(".review-autopilot-preview").first().click();
    await expect(page.locator("#action-output")).toContainText("review autopilot preview");
    await expect(page.locator("#action-output")).toContainText("Preview only");

    const controlRoom = await page.evaluate(async () => {
      const response = await globalThis.fetch("/api/dogfood/control-room");
      return response.json();
    });
    assert.equal(controlRoom.version, "dogfood-control-room-v10");
    assert.equal(controlRoom.proof_coverage.fact_count > 0, true);
    assert.deepEqual(controlRoom.canonical_writes, []);

    await page.getByRole("button", { name: "Ask" }).click();
    await page.locator("#ask-input").fill("What is the Zephyr deploy token?");
    await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "What memory cannot confirm" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Missing-memory action" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Log retrieval miss" })).toBeVisible();
    await page.locator("#ask-missing-memory-note").fill("Missing source for Zephyr deploy token.");
    await page.getByRole("button", { name: "Preview missing-memory action" }).click();
    await expect(page.locator("#ask-missing-memory-output")).toContainText("Preview only");

    const frictionCreate = await page.evaluate(async () => {
      const response = await globalThis.fetch("/api/friction/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "retrieval_miss", question: "What is the Zephyr deploy token?", note: "Missing source for Zephyr deploy token." })
      });
      return response.json();
    });
    assert.equal(frictionCreate.created, true);
    assert.deepEqual(frictionCreate.canonical_writes, []);
    assert.match(await readVaultFile(root, frictionCreate.event_path), /source_label: friction:retrieval_miss/);
    assert.match(await readVaultFile(root, frictionCreate.transaction_path), /transaction_state: pending/);

    assert.equal(await readVaultFile(root, "memory/people/jeff.md"), beforeJeff);
    assert.equal(await readVaultFile(root, "memory/contexts/inventory-project.md"), beforeInventory);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function writeSourceReasoningFixture(root) {
  await writeVaultFile(root, "memory/events/2026/2026-06/ev_browser_v10_dependency.md", eventMarkdown("ev_browser_v10_dependency", "Search API depends on Billing repository. Billing repository depends on MySQL."));
  await writeVaultFile(root, "memory/contexts/search-api.md", contextMarkdown());
}

function eventMarkdown(id, rawText) {
  return [
    "---",
    "id: " + id,
    "type: event",
    "object_state: active",
    "review_state: reviewed",
    "recorded_at: 2026-06-02T00:00:00.000Z",
    "observed_at: 2026-06-02",
    "source_type: user_note",
    "source_actor: user",
    "participants: []",
    "topics: []",
    "contexts: []",
    "derived_claims: []",
    "transactions: []",
    "---",
    "",
    "# Event " + id,
    "",
    "## Raw text",
    "",
    rawText,
    ""
  ].join("\n");
}

function contextMarkdown() {
  return [
    "---",
    "id: ctx_search_api",
    "type: context",
    "object_state: active",
    "review_state: reviewed",
    "created_at: 2026-06-02T00:00:00.000Z",
    "updated_at: 2026-06-02T00:00:00.000Z",
    "aliases:",
    "  - Search API",
    "source_events:",
    "  - ev_browser_v10_dependency",
    "related: []",
    "summary_generated_from:",
    "  - clm_browser_v10_search_depends",
    "---",
    "",
    "# Search API",
    "",
    "## Active claims",
    "",
    "- claim_id: clm_browser_v10_search_depends",
    "  statement: Search API depends on Billing repository. Billing repository depends on MySQL.",
    "  claim_kind: fact",
    "  claim_state: active",
    "  evidence_strength: explicit",
    "  scope: Inventory Project",
    "  scope_state: complete",
    "  evidence: [ev_browser_v10_dependency]",
    "  recorded_at: 2026-06-02T00:00:00.000Z",
    "  observed_at: 2026-06-02",
    "  valid_from: null",
    "  valid_to: null",
    ""
  ].join("\n");
}
