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
    server = await startAgentWorkbenchServer({ root, host: "127.0.0.1", port: 0 });
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Assisto Agent Workbench" })).toBeVisible();
    await expect(page.getByText("Test Agent Workbench.")).toBeVisible();
    await page.getByRole("button", { name: "Validation" }).click();
    await page.getByRole("button", { name: "Preview validation plan" }).click();
    await expect(page.locator("#validation-output")).toContainText("pnpm agent:validate -- --plan --json");

    await page.getByRole("button", { name: "PR", exact: true }).click();
    await expect(page.locator("#pr")).toContainText("review_requested");
    await expect(page.getByRole("button", { name: "Record next-action note" })).toBeDisabled();
    await page.getByLabel("Confirm note write").check();
    await expect(page.getByRole("button", { name: "Record next-action note" })).toBeEnabled();
  } finally {
    if (server) {
      await server.close();
    }
    await rm(root, { recursive: true, force: true });
  }
});
