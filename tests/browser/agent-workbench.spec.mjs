import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAgentWorkbenchServer } from "../../scripts/agent-workbench.mjs";
import { writeAgentWorkbenchRun } from "../agent-workbench.mjs";

test("agent workbench renders run state and explicit action previews", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "assisto-browser-agent-workbench-"));
  let server;
  try {
    await writeAgentWorkbenchRun(root);
    server = await startAgentWorkbenchServer({
      root,
      host: "127.0.0.1",
      port: 0,
      commandRunner: async () => JSON.stringify({
        mode: "workflow-scripts",
        commands: [{ name: "lint", command: "pnpm lint" }],
        skipped: []
      })
    });
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Assisto Agent Workbench" })).toBeVisible();
    await expect(page.getByText("Test Agent Workbench.")).toBeVisible();
    await page.getByRole("button", { name: "Validation" }).click();
    await expect(page.getByRole("heading", { name: "Validation Plan" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh validation plan" }).click();
    await expect(page.locator("#validation-output")).toContainText("pnpm lint");

    await page.getByRole("button", { name: "PR", exact: true }).click();
    await expect(page.getByText("No-Copilot Closeout")).toBeVisible();
    await expect(page.locator('[data-panel="PR"]')).toContainText("memory-data guard");
    await expect(page.locator("#pr")).toContainText("review_requested");
    await expect(page.getByRole("button", { name: "Record next-action note" })).toBeDisabled();
    await page.getByLabel("Confirm note write").check();
    await expect(page.getByRole("button", { name: "Record next-action note" })).toBeEnabled();

    await page.getByRole("button", { name: "Staging" }).click();
    await page.getByRole("button", { name: "Check memory-data guard" }).click();
    await expect(page.locator("#stage-output")).toContainText("guarded_paths");

    await page.getByRole("button", { name: "Mixedbread" }).click();
    await page.getByRole("button", { name: "Preview refresh plan" }).click();
    await expect(page.locator("#mxbai-output")).toContainText("mxbai:upload");
  } finally {
    if (server) {
      await server.close();
    }
    await rm(root, { recursive: true, force: true });
  }
});
