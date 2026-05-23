import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";
import path from "node:path";
import { makeTempVault, readVaultFile } from "./helpers/temp-vault.mjs";

const execFileAsync = promisify(execFile);
const wmBin = path.resolve("packages/cli/bin/wm.mjs");

async function runWm(root, args) {
  const result = await execFileAsync(process.execPath, [wmBin, "--root", root, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COREPACK_HOME: process.env.COREPACK_HOME ?? "/tmp/corepack",
      LOCALAPPDATA: process.env.LOCALAPPDATA ?? "/tmp",
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/tmp",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      TEMP: process.env.TEMP ?? "/tmp",
      TMP: process.env.TMP ?? "/tmp"
    }
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function expectMissing(root, relativePath) {
  await assert.rejects(() => readVaultFile(root, relativePath));
}

async function runCliWorkflowE2e() {
  const root = await makeTempVault("assisto-e2e-cli-");

  try {
    const ingest = await runWm(root, ["ingest", "Joe is the DBA. We use MySQL."]);
    assert.match(ingest.stdout, /Pending transaction: tx_2026_05_20_001/);

    const show = await runWm(root, ["tx", "show", "tx_2026_05_20_001"]);
    assert.match(show.stdout, /path=memory\/people\/joe\.md/);
    assert.match(show.stdout, /path=memory\/review\/unscoped-claims\.md/);
    await expectMissing(root, "memory/people/joe.md");

    const apply = await runWm(root, ["tx", "apply", "tx_2026_05_20_001"]);
    assert.match(apply.stdout, /Applied transaction tx_2026_05_20_001/);
    assert.match(await readVaultFile(root, "memory/people/joe.md"), /clm_joe_role_dba/);

    const validate = await runWm(root, ["validate"]);
    assert.match(validate.stdout, /Validation passed/);

    const ask = await runWm(root, ["ask", "--pack-context", "What is Joe's role?"]);
    assert.match(ask.stdout, /# Context pack/);
    assert.match(ask.stdout, /Joe is the DBA/);

    const reviewList = await runWm(root, ["review", "list"]);
    assert.match(reviewList.stdout, /rev_unscoped_claims/);

    const reviewShow = await runWm(root, ["review", "show", "rev_unscoped_claims"]);
    assert.match(reviewShow.stdout, /# Review: Unscoped claims/);

    const reviewMark = await runWm(root, [
      "review",
      "mark",
      "rev_unscoped_claims",
      "--state",
      "contested",
      "--note",
      "Needs scope."
    ]);
    assert.match(reviewMark.stdout, /Pending review transaction: tx_2026_05_21_001/);

    await runWm(root, ["tx", "apply", "tx_2026_05_21_001"]);
    const allReview = await runWm(root, ["review", "list", "--all"]);
    assert.match(allReview.stdout, /contested/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runProviderStubE2e() {
  const root = await makeTempVault("assisto-e2e-provider-");

  try {
    const ingest = await runWm(root, ["ingest", "--provider", "llm-stub", "Joe is the DBA."]);
    assert.match(ingest.stdout, /Pending transaction: tx_2026_05_21_001/);
    assert.match(ingest.stdout, /Staged review proposals:/);

    const tx = await readVaultFile(root, "memory/transactions/pending/tx_2026_05_21_001.md");
    assert.match(tx, /llm_output_malformed/);
    assert.doesNotMatch(tx, /path=memory\/people\/joe\.md/);
    await expectMissing(root, "memory/people/joe.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await runCliWorkflowE2e();
await runProviderStubE2e();

console.log("near-e2e tests passed");
