import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { makeTempVault, readVaultFile, writeVaultFile } from "../helpers/temp-vault.mjs";
import { writeContextProjectScenario } from "../helpers/scenario-factory.mjs";
import { loadTsModule } from "../ts-module-loader.mjs";

test("dogfood eval tab runs local questions and shows failing expectations without writing memory", async ({ page }) => {
  const root = await makeTempVault("assisto-browser-dogfood-eval-");
  const workbench = await loadTsModule("packages/workbench/src/index.ts");
  let server;

  try {
    await writeContextProjectScenario(root);
    await writeVaultFile(
      root,
      ".assisto-local/eval/questions.json",
      JSON.stringify({
        questions: [
          {
            question: "Who is my manager?",
            expected_claim_ids: ["clm_jeff_manager", "clm_missing_manager"],
            expected_event_ids: ["ev_2026_05_21_001"],
            expected_page_paths: ["memory/people/jeff.md"],
            tags: ["manager"]
          },
          {
            question: "What is the Neptune deploy key?",
            expected_cannot_confirm: ["No deterministic memory page"],
            expected_repair_actions: ["capture_note"],
            tags: ["no_match"]
          }
        ]
      })
    );
    const eventBefore = await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md");
    server = await workbench.startWorkbenchServer({ root, host: "127.0.0.1", port: 0 });

    await page.goto(server.url);
    await page.getByRole("button", { name: "Dogfood Eval" }).click();
    await expect(page.getByRole("heading", { name: "Dogfood Eval" })).toBeVisible();
    await expect(page.getByText("Questions: 2")).toBeVisible();
    await expect(page.getByText("clm_missing_manager")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is the Neptune deploy key?" })).toBeVisible();
    await expect(page.getByText("missing-memory guidance surfaced")).toBeVisible();
    await expect(page.getByText("Cannot-confirm quality")).toBeVisible();
    await expect(page.getByText("Repair precision")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Repair suggestions" }).first()).toBeVisible();
    await expect(page.getByText("Log retrieval miss · /api/dogfood/feedback/preview").first()).toBeVisible();

    await page.getByRole("button", { name: "Run eval" }).click();
    await expect(page.getByText("Dogfood eval refreshed")).toBeVisible();
    await expect(page.locator(".metric").filter({ hasText: "Generated persistence violations" }).getByText("0")).toBeVisible();
    assert.equal(await readVaultFile(root, "memory/events/2026/2026-05/2026-05-21-001.md"), eventBefore);

    await page.getByRole("button", { name: "Copy eval report" }).click();
    await expect(page.locator("#copy-output")).toContainText("Derived text only; not saved.");
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
