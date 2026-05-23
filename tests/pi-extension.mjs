import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTsModule } from "./ts-module-loader.mjs";

async function makeTempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assisto-pi-"));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function toolMap(extension) {
  return new Map(extension.tools.map((tool) => [tool.name, tool]));
}

function commandMap(commands) {
  return new Map(commands.map((command) => [command.name, command.options]));
}

export async function runPiExtensionTests() {
  const piExtension = await loadTsModule("packages/pi-extension/src/index.ts");
  const piEntry = await loadTsModule(".pi/extensions/work-memory/index.ts");
  const root = await makeTempVault();

  try {
    assert.equal(typeof piEntry.default, "function");
    assert.equal(typeof piEntry.factory, "function");
    assert.equal(piEntry.default, piEntry.factory);

    const factoryExtension = piEntry.default({ vaultRoot: root });
    assert.equal(factoryExtension.tools.length, 12);
    assert.equal(factoryExtension.commands.length, 8);

    const nativeTools = [];
    const nativeCommands = [];
    const nativeHandlers = [];
    piEntry.default(
      {
        registerTool: (tool) => nativeTools.push(tool),
        registerCommand: (name, options) => nativeCommands.push({ name, options }),
        on: (eventName, handler) => nativeHandlers.push({ eventName, handler })
      },
      { vaultRoot: root }
    );

    assert.deepEqual(
      nativeTools.map((tool) => tool.name).sort(),
      [
        "wm_apply_transaction",
        "wm_ingest_note",
        "wm_lint",
        "wm_list_review_items",
        "wm_list_transactions",
        "wm_mark_review_item",
        "wm_pack_context",
        "wm_reject_transaction",
        "wm_review_inbox",
        "wm_show_review_item",
        "wm_show_transaction",
        "wm_validate"
      ].sort()
    );
    assert.deepEqual(
      nativeCommands.map((command) => command.name).sort(),
      [
        "wm-apply",
        "wm-ask",
        "wm-ingest",
        "wm-lint",
        "wm-review",
        "wm-review-mark",
        "wm-review-show",
        "wm-validate"
      ].sort()
    );
    assert.equal(nativeCommands.every((command) => typeof command.name === "string"), true);
    assert.equal(nativeCommands.every((command) => typeof command.options.description === "string"), true);
    assert.equal(nativeHandlers.some((handler) => handler.eventName === "tool_call"), true);
    const writeGuardHandler = nativeHandlers.find((handler) => handler.eventName === "tool_call").handler;
    const blockedWrite = await writeGuardHandler(
      { toolName: "write", input: { path: "memory/people/joe.md" } },
      { ui: { notify: () => undefined } }
    );
    assert.equal(blockedWrite.block, true);
    assert.match(blockedWrite.reason, /wm_apply_transaction/);

    const registeredTools = [];
    const registeredCommands = [];
    const registeredGuards = [];
    const registered = piEntry.registerWorkMemoryExtension(
      {
        registerTool: (tool) => registeredTools.push(tool),
        registerCommand: (command) => registeredCommands.push(command),
        registerWriteGuard: (guard) => registeredGuards.push(guard)
      },
      { vaultRoot: root }
    );

    assert.deepEqual(
      registeredTools.map((tool) => tool.name).sort(),
      [
        "wm_apply_transaction",
        "wm_ingest_note",
        "wm_lint",
        "wm_list_review_items",
        "wm_list_transactions",
        "wm_mark_review_item",
        "wm_pack_context",
        "wm_reject_transaction",
        "wm_review_inbox",
        "wm_show_review_item",
        "wm_show_transaction",
        "wm_validate"
      ].sort()
    );
    assert.deepEqual(
      registeredCommands.map((command) => command.name).sort(),
      [
        "/wm-apply",
        "/wm-ask",
        "/wm-ingest",
        "/wm-lint",
        "/wm-review",
        "/wm-review-mark",
        "/wm-review-show",
        "/wm-validate"
      ].sort()
    );
    assert.equal(registeredGuards.length, 1);
    assert.equal(registered.tools.length, 12);
    assert.equal(registered.commands.length, 8);

    const directCanonical = piExtension.checkWorkMemoryWrite({ path: "memory/people/joe.md" });
    assert.equal(directCanonical.allowed, false);
    assert.match(directCanonical.reason, /wm_apply_transaction/);
    assert.equal(
      piExtension.checkWorkMemoryWrite({
        path: "memory/people/joe.md",
        invokedBy: "wm_apply_transaction"
      }).allowed,
      true
    );
    assert.equal(piExtension.checkWorkMemoryWrite({ path: ".obsidian/workspace.json" }).allowed, false);
    assert.equal(piExtension.checkWorkMemoryWrite({ path: "notes/scratch.md" }).allowed, true);
    assert.match(piExtension.checkWorkMemoryWrite({ path: "notes/scratch.md" }).warnings[0], /outside memory\/ and \.pi\//);

    const tools = toolMap(piExtension.createWorkMemoryExtension({ vaultRoot: root }));
    const ingestResult = await tools.get("wm_ingest_note").run({ note: "Joe is the DBA. We use MySQL." });
    assert.equal(ingestResult.transaction_id, "tx_2026_05_20_001");
    assert.match(
      await readVaultFile(root, "memory/transactions/pending/tx_2026_05_20_001.md"),
      /path=memory\/people\/joe\.md/
    );

    const nativeCommandOptions = commandMap(nativeCommands);
    const completions = await nativeCommandOptions.get("wm-apply").getArgumentCompletions("tx");
    assert.equal(completions.every((item) => typeof item.value === "string"), true);
    assert.equal(completions.every((item) => item.label === undefined || typeof item.label === "string"), true);
    assert.equal(
      completions.every((item) => item.description === undefined || typeof item.description === "string"),
      true
    );

    const transactions = await tools.get("wm_list_transactions").run();
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].id, "tx_2026_05_20_001");

    const shown = await tools.get("wm_show_transaction").run({ id: "tx_2026_05_20_001" });
    assert.match(shown.content, /# Transaction tx_2026_05_20_001/);

    await assert.rejects(() => readVaultFile(root, "memory/people/joe.md"));
    const applyResult = await tools.get("wm_apply_transaction").run({ id: "tx_2026_05_20_001" });
    assert.equal(applyResult.applied, true);
    assert.match(await readVaultFile(root, "memory/people/joe.md"), /clm_joe_role_dba/);

    const inbox = await tools.get("wm_review_inbox").run();
    assert.equal(inbox.some((item) => item.id === "rev_unscoped_claims"), true);

    const reviewItems = await tools.get("wm_list_review_items").run();
    assert.equal(reviewItems.some((item) => item.id === "rev_unscoped_claims"), true);

    const reviewItem = await tools.get("wm_show_review_item").run({ id: "rev_unscoped_claims" });
    assert.match(reviewItem.content, /# Review: Unscoped claims/);

    const reviewMark = await tools.get("wm_mark_review_item").run({
      id: "rev_unscoped_claims",
      state: "contested",
      note: "Needs project scope."
    });
    assert.equal(reviewMark.transaction_id, "tx_2026_05_21_001");
    assert.match(
      await readVaultFile(root, "memory/transactions/pending/tx_2026_05_21_001.md"),
      /review_state: contested/
    );

    const context = await tools.get("wm_pack_context").run({ question: "What should I know about Joe?" });
    assert.match(context.contextPack, /memory\/people\/joe\.md/);

    const lintResult = await tools.get("wm_lint").run();
    assert.equal(Array.isArray(lintResult.issues), true);

    const validation = await tools.get("wm_validate").run();
    assert.equal(typeof validation.passed, "boolean");

    const commandResult = await registered.commands
      .find((command) => command.name === "/wm-ask")
      .run("What should I know about Joe?");
    assert.match(commandResult.contextPack, /memory\/people\/joe\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const rejectRoot = await makeTempVault();

  try {
    const tools = toolMap(piExtension.createWorkMemoryExtension({ vaultRoot: rejectRoot }));
    await tools.get("wm_ingest_note").run({ note: "Maybe I should ask Joe" });
    const rejected = await tools.get("wm_reject_transaction").run({
      id: "tx_2026_05_20_001",
      reason: "Not needed"
    });

    assert.equal(rejected.rejected, true);
    assert.match(
      await readVaultFile(rejectRoot, "memory/transactions/rejected/tx_2026_05_20_001.md"),
      /transaction_state: rejected/
    );
  } finally {
    await rm(rejectRoot, { recursive: true, force: true });
  }
}
