# Agent Acceleration Control Plane v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Assisto development much faster without weakening quality by adding no-Copilot PR closeout, smarter validation, guarded staging, better diagnostics, Workbench modularity, scenario reuse, and run-state visibility.

**Architecture:** Build on the existing `.assisto-agent` runtime, `scripts/agent-*.mjs` helpers, `pnpm validate:*` commands, and Agent Workbench. Keep all process state under ignored `.assisto-agent/**` files, keep product memory untouched, and make every merge/network action explicit through flags.

**Tech Stack:** Node 22 stdlib ESM scripts, pnpm scripts, Git/GitHub CLI, Playwright Chromium for Agent Workbench coverage, existing Assisto test/eval scripts, local markdown docs.

---

## Status Update - 2026-06-05

PR #115 is merged to `main` as `8e830e5 [codex] Add Wave 1 contract scaffolds to main (#115)`. That completed the Wave 1 contract scaffolds, not this control-plane plan.

Current follow-up branch: `codex/agent-no-copilot-closeout-v2`.

Current implementation slice: PR 1, No-Copilot PR Closeout. The old local branch name `codex/agent-no-copilot-closeout` points behind current `main`, so this follow-up uses the `-v2` branch from synced `main`.

## Operating Rules

- Do not edit or stage `memory/events/**` or `memory/transactions/**`; those paths are dogfood user data unless the user explicitly asks for a memory-data operation.
- Do not write to `.obsidian/**`.
- Do not add vector search, graph DBs, MCP, autonomous merges, autonomous contradiction resolution, or direct canonical memory writes.
- Treat GitHub Copilot review as disabled. Do not call `pnpm pr:review-wait`, do not request `@codex review`, and do not require Copilot review-thread state for closeout.
- Preserve explicit safety gates: CI green, mergeable PR, non-draft PR, memory-data guard pass, recorded validation pass, and explicit `--merge --yes` before merging.
- Run `pnpm check:memory-data` before staging and before every closeout.
- Use `TMPDIR=/tmp` for test/eval commands that create temp files.
- Refresh Mixedbread only after a successful merge and synced `main`, using `pnpm mxbai:upload` then `pnpm mxbai:smoke`.

## Current Baseline

Existing scripts already present:

- `scripts/agent-control.mjs`: run ledger start/status/handoff/note.
- `scripts/agent-policy.mjs`: changed-file policy and validation planner.
- `scripts/agent-run.mjs`: command logging and failure diagnosis.
- `scripts/agent-pr.mjs`: PR state machine and closeout.
- `scripts/agent-ci-local.mjs`: local CI capsule planning.
- `scripts/agent-map.mjs`: repo map.
- `scripts/agent-workbench.mjs`: local Agent Workbench.
- `scripts/check-memory-data.mjs`: guarded memory-data detection.
- `tests/helpers/scenario-factory.mjs`: existing scenario factory.
- `packages/workbench/src/index.ts`: large product Workbench server/client surface.

The plan below strengthens this baseline rather than replacing it.

## File Structure

Create or modify these files across the program:

- Modify `package.json`: add focused scripts such as `agent:stage`, `agent:closeout:no-copilot`, `agent:mxbai`, and targeted validation helpers.
- Modify `scripts/agent-pr.mjs`: make no-Copilot closeout the default path, keep review checks opt-in, record closeout evidence.
- Modify `scripts/agent-policy.mjs`: add validation profiles, command cost metadata, changed-file reasons, and exact command output.
- Create `scripts/agent-stage.mjs`: guarded staging helper that refuses user-memory paths by default.
- Modify `scripts/agent-run.mjs`: expand failure diagnosis and rerun hints.
- Create `scripts/agent-mxbai.mjs`: trusted Mixedbread refresh wrapper with structured logs.
- Create `scripts/agent-review.mjs`: local invariant/spec/test review checklist generator for subagents.
- Modify `scripts/agent-map.mjs`: include validation groups, ownership hints, and scenario links.
- Modify `scripts/agent-workbench.mjs`: expose new run, validation, PR, diagnostics, staging, and Mixedbread actions.
- Create `scripts/workbench-split-check.mjs`: temporary guard that verifies modularized Workbench exports remain compatible.
- Modify `packages/workbench/src/index.ts`: reduce to compatibility exports after modularization.
- Create `packages/workbench/src/server/http.ts`: HTTP server creation and request routing.
- Create `packages/workbench/src/server/route-registry.ts`: declarative route registration.
- Create `packages/workbench/src/server/routes/*.ts`: focused route modules by feature.
- Create `packages/workbench/src/client/app.ts`: browser bootstrapping.
- Create `packages/workbench/src/client/tabs/*.ts`: tab renderers.
- Create `packages/workbench/src/shared/contracts.ts`: shared Workbench types.
- Create `packages/core/src/capabilities/index.ts`: source-of-truth capability registry.
- Create `packages/core/src/capabilities/schema.ts`: registry types and validation helpers.
- Create `tests/agent-no-copilot-pr.mjs`: no-Copilot PR closeout tests.
- Modify `tests/agent-policy.mjs`: validation planner v2 tests.
- Create `tests/agent-stage.mjs`: guarded staging tests.
- Modify `tests/agent-runner.mjs`: failure diagnosis tests.
- Create `tests/agent-mxbai.mjs`: Mixedbread wrapper tests.
- Create `tests/agent-review.mjs`: review checklist tests.
- Modify `tests/agent-map.mjs`: repo-map validation group tests.
- Modify `tests/helpers/scenario-factory.mjs`: add missing reusable scenarios.
- Create `tests/workbench-modularization.mjs`: compatibility tests for split Workbench.
- Create `tests/capabilities-registry.mjs`: CLI/API/Pi/docs registry consistency tests.
- Modify `tests/browser/agent-workbench.spec.mjs`: UI coverage for new Agent Workbench actions.
- Create `docs/agent-acceleration.md`: human guide for the faster workflow.
- Modify `docs/wsl2-handoff.md`: add the new no-Copilot, validation, and staging commands.

## Program Workflow

Each PR starts from synced `main`:

```bash
git switch main
git pull --ff-only origin main
pnpm check:memory-data
pnpm agent:start --slug <slug> --objective "<objective>" --branch codex/<slug>
```

Each PR ends with:

```bash
pnpm check:memory-data
pnpm agent:validate --plan
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
```

Run extra commands when the validation plan requires them:

```bash
TMPDIR=/tmp pnpm test:e2e
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:mvp
TMPDIR=/tmp pnpm eval:v8
```

No-Copilot closeout after push and PR creation:

```bash
pnpm agent:pr closeout <pr-number> --merge --yes --refresh-mxbai
```

Expected closeout behavior:

- Refuses if CI is not green.
- Refuses if PR is draft.
- Refuses if PR is not mergeable.
- Refuses if `pnpm check:memory-data` reports blocking guarded changes.
- Refuses if the active run has not recorded validation as passed.
- Does not wait for or inspect Copilot unless `--with-review-check` is explicitly supplied.

---

## PR 1: No-Copilot PR Closeout

**Branch:** `codex/agent-no-copilot-closeout`

**Purpose:** Remove the Copilot review wait from the default PR closeout path while preserving explicit quality gates and local run evidence.

**Status Update - 2026-06-05:** Implemented on `codex/agent-no-copilot-closeout-v2`. The original red/green checklist below was collapsed into one patch after inspection; final coverage is in `tests/agent-no-copilot-pr.mjs` and `tests/agent-pr.mjs`. Targeted tests, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm check:memory-data` passed.

**Files:**

- Modify `scripts/agent-pr.mjs`
- Modify `package.json`
- Create `tests/agent-no-copilot-pr.mjs`
- Modify `tests/agent-pr.mjs`
- Modify `docs/agent-acceleration.md`

### Task 1.1: Add no-Copilot closeout tests

- [x] **Step 1: Write failing tests in `tests/agent-no-copilot-pr.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePrCloseoutReadiness } from "../scripts/agent-pr.mjs";

const greenPr = {
  isDraft: false,
  mergeable: "MERGEABLE",
  statusCheckRollup: [{ conclusion: "SUCCESS" }]
};

test("no-Copilot closeout does not require review wait state", () => {
  const readiness = evaluatePrCloseoutReadiness({
    prInfo: greenPr,
    reviewSummary: null,
    memoryGuard: { changed: [] },
    run: {
      validation_status: "passed",
      pr_state: { state: "ci_green" }
    },
    options: { skipReviewCheck: true }
  });

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
});

test("no-Copilot closeout still refuses guarded memory changes", () => {
  const readiness = evaluatePrCloseoutReadiness({
    prInfo: greenPr,
    reviewSummary: null,
    memoryGuard: { changed: ["memory/events/2026/example.md"] },
    run: {
      validation_status: "passed",
      pr_state: { state: "ci_green" }
    },
    options: { skipReviewCheck: true }
  });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.includes("memory_guard_failed"));
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
node --test tests/agent-no-copilot-pr.mjs
```

Expected: failure because `evaluatePrCloseoutReadiness` does not accept `options.skipReviewCheck`.

### Task 1.2: Implement closeout option model

- [x] **Step 1: Modify `evaluatePrCloseoutReadiness` in `scripts/agent-pr.mjs`**

Replace the function signature and review blocker logic with:

```js
export function evaluatePrCloseoutReadiness({
  prInfo,
  reviewSummary,
  memoryGuard,
  run,
  options = {}
}) {
  const blockers = [];
  const checks = checkStatusRollup(prInfo.statusCheckRollup);
  const skipReviewCheck = options.skipReviewCheck === true;

  if (!skipReviewCheck && (reviewSummary?.unresolvedThreadCount ?? 0) > 0) {
    blockers.push("unresolved_review_threads");
  }
  if (!skipReviewCheck && stateRank(run?.pr_state?.state ?? "branch_created") < stateRank("wait_elapsed")) {
    blockers.push("review_wait_not_elapsed");
  }
  if (prInfo.isDraft) {
    blockers.push("pr_is_draft");
  }
  if (prInfo.mergeable !== "MERGEABLE") {
    blockers.push("pr_not_mergeable");
  }
  if (!checks.passed) {
    blockers.push("ci_not_green");
  }
  if ((memoryGuard?.changed ?? []).length > 0) {
    blockers.push("memory_guard_failed");
  }
  if (run?.validation_status !== "passed") {
    blockers.push("validation_not_recorded_passed");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    checks,
    review_check: skipReviewCheck ? "skipped_copilot_disabled" : "required"
  };
}
```

- [x] **Step 2: Run the new unit test**

Run:

```bash
node --test tests/agent-no-copilot-pr.mjs
```

Expected: pass.

### Task 1.3: Make review checks opt-in

- [x] **Step 1: Extend argument parsing in `scripts/agent-pr.mjs`**

Add:

```js
if (arg === "--with-review-check") {
  options.withReviewCheck = true;
  continue;
}
```

- [x] **Step 2: Update `commandCloseout` to skip wait/review by default**

Use this exact flow:

```js
const shouldCheckReviews = options.withReviewCheck === true;
if (shouldCheckReviews) {
  await waitForReview(prNumber, repo, options);
}
const reviewSummary = shouldCheckReviews ? fetchReviewSummary(owner, name, Number.parseInt(prNumber, 10)) : null;
if (reviewSummary !== null) {
  await storePrReviewSnapshot({ pr: prNumber, summary: reviewSummary });
  await advancePrState({ pr: prNumber, state: "review_threads_checked" });
}
const runState = await loadActiveRun(process.cwd());
const prInfo = fetchPrInfo(prNumber, repo);
const memoryGuard = runMemoryGuard();
const readiness = evaluatePrCloseoutReadiness({
  prInfo,
  reviewSummary,
  memoryGuard,
  run: runState,
  options: { skipReviewCheck: !shouldCheckReviews }
});
```

- [x] **Step 3: Add package alias in `package.json`**

Add:

```json
"agent:closeout:no-copilot": "node scripts/agent-pr.mjs closeout"
```

- [x] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/agent-no-copilot-pr.mjs tests/agent-pr.mjs
```

Expected: pass.

### Task 1.4: Document the new closeout path

- [x] **Step 1: Create or update `docs/agent-acceleration.md`**

Add:

```md
# Agent Acceleration

## No-Copilot PR Closeout

Copilot reviews are disabled for this repository. The default closeout path does not wait for Copilot and does not require review-thread state.

Use:

```bash
pnpm agent:pr closeout <pr-number> --merge --yes --refresh-mxbai
```

This still requires:

- green GitHub checks;
- mergeable non-draft PR;
- active agent run with validation recorded as passed;
- `pnpm check:memory-data` with no blocking guarded changes;
- explicit `--merge --yes`.
```

- [x] **Step 2: Validate PR 1**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: all pass; memory-data guard may report untracked user-memory files as preserved, but no blocking changes.

---

## PR 2: Smart Validation Planner v2

**Branch:** `codex/agent-validation-planner-v2`

**Purpose:** Reduce wasted validation time by making `pnpm agent:validate --plan` more precise, transparent, and easy to trust.

**Status Update - 2026-06-05:** Implemented on `codex/agent-validation-planner-v2`. The planner now emits command cost and required metadata, skipped-command reasons, and deterministic changed-file explanations. Targeted policy tests, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm check:memory-data` passed.

**Files:**

- Modify `scripts/agent-policy.mjs`
- Modify `tests/agent-policy.mjs`
- Modify `docs/agent-acceleration.md`

### Task 2.1: Add command metadata tests

- [x] **Step 1: Extend `tests/agent-policy.mjs`**

Add:

```js
test("validation plan includes cost and blocking metadata", () => {
  const plan = buildValidationPlan({
    changedFiles: ["packages/workbench/src/index.ts"]
  });

  const browser = plan.commands.find((item) => item.name === "test:browser");
  assert.equal(browser.required, true);
  assert.equal(browser.cost, "high");
  assert.match(browser.reason, /Workbench/);
});

test("docs-only validation records why evals are skipped", () => {
  const plan = buildValidationPlan({
    changedFiles: ["docs/revised-design.md"],
    docsOnly: true
  });

  assert.equal(plan.mode, "docs-process");
  assert.ok(plan.skipped.some((item) => item.name === "eval:v8"));
  assert.match(plan.skipped.find((item) => item.name === "eval:v8").reason, /docs-only/);
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/agent-policy.mjs
```

Expected: failure because commands do not include `required`, `cost`, or `skipped`.

### Task 2.2: Add validation command profiles

- [x] **Step 1: Replace `command(name, reason)` in `scripts/agent-policy.mjs`**

Use:

```js
const commandProfiles = {
  lint: { cost: "low", required: true },
  typecheck: { cost: "low", required: true },
  test: { cost: "medium", required: true },
  "test:e2e": { cost: "high", required: true },
  "test:browser": { cost: "high", required: true },
  "eval:mvp": { cost: "medium", required: true },
  "eval:v2": { cost: "medium", required: true },
  "eval:v3": { cost: "medium", required: true },
  "eval:retrieval": { cost: "medium", required: true },
  "eval:v4": { cost: "high", required: true },
  "eval:v5": { cost: "high", required: true },
  "eval:v6": { cost: "high", required: true },
  "eval:dogfood-local": { cost: "medium", required: true },
  "eval:v7": { cost: "high", required: true },
  "eval:answers": { cost: "medium", required: true },
  "eval:v8": { cost: "high", required: true },
  "check:memory-data": { cost: "low", required: true }
};

function command(name, reason) {
  const profile = commandProfiles[name] ?? { cost: "medium", required: true };
  return {
    name,
    command: name === "check:memory-data" ? "pnpm check:memory-data" : `pnpm ${name}`,
    env: name.startsWith("test") || name.startsWith("eval") ? { ...tempEnv } : {},
    reason,
    cost: profile.cost,
    required: profile.required
  };
}
```

- [x] **Step 2: Add skipped-command output**

At the end of `buildValidationPlan`, before return:

```js
const selectedNames = new Set(filteredCommands.map((item) => item.name));
const allKnownNames = Object.keys(commandProfiles);
const skipped = allKnownNames
  .filter((name) => !selectedNames.has(name))
  .sort()
  .map((name) => ({
    name,
    reason: docsOnly ? "Skipped because docs-only validation was requested." : `Skipped because mode ${mode} does not require it.`,
    cost: commandProfiles[name].cost,
    required: false
  }));
```

Return:

```js
return {
  mode,
  categories,
  changed_files: changedFiles,
  commands: filteredCommands,
  skipped
};
```

- [x] **Step 3: Run targeted tests**

Run:

```bash
node --test tests/agent-policy.mjs
```

Expected: pass.

### Task 2.3: Add changed-file explanation

- [x] **Step 1: Add `explainChangedFiles` to `scripts/agent-policy.mjs`**

```js
export function explainChangedFiles(changedFiles) {
  return unique(changedFiles).map((file) => ({
    file,
    category: classifyFile(file),
    reason: `Classified as ${classifyFile(file)} by deterministic path rules.`
  }));
}
```

- [x] **Step 2: Include it in `buildValidationPlan`**

Add:

```js
file_reasons: explainChangedFiles(changedFiles),
```

- [x] **Step 3: Add JSON test**

Add to `tests/agent-policy.mjs`:

```js
test("validation plan explains changed file categories", () => {
  const plan = buildValidationPlan({
    changedFiles: ["packages/core/src/retrieval/index.ts"]
  });

  assert.deepEqual(plan.file_reasons, [
    {
      file: "packages/core/src/retrieval/index.ts",
      category: "core",
      reason: "Classified as core by deterministic path rules."
    }
  ]);
});
```

- [x] **Step 4: Validate PR 2**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 3: Memory-Safe Staging Helper

**Branch:** `codex/agent-safe-staging`

**Purpose:** Prevent accidental staging of dogfood user-memory files and make every staged path intentional.

**Status Update - 2026-06-05:** Implemented on `codex/agent-safe-staging`. The helper refuses guarded memory data by default, requires `--allow-memory-data --yes` for intentional memory-data staging, resolves paths against the Git repo root, rejects Git pathspec magic, and is covered by targeted CLI/classifier tests plus integration script-helper coverage. `pnpm agent:validate --plan --json`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm check:memory-data` passed.

**Files:**

- Create `scripts/agent-stage.mjs`
- Modify `package.json`
- Create `tests/agent-stage.mjs`
- Modify `docs/agent-acceleration.md`

### Task 3.1: Write staging refusal tests

- [x] **Step 1: Create `tests/agent-stage.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { classifyStageRequest } from "../scripts/agent-stage.mjs";

test("classifyStageRequest refuses guarded user-memory paths by default", () => {
  const result = classifyStageRequest({
    paths: ["docs/agent-acceleration.md", "memory/events/2026/example.md"],
    allowMemoryData: false
  });

  assert.deepEqual(result.allowed_paths, ["docs/agent-acceleration.md"]);
  assert.deepEqual(result.guarded_paths, ["memory/events/2026/example.md"]);
  assert.equal(result.allowed, false);
});

test("classifyStageRequest requires explicit allow for guarded paths", () => {
  const result = classifyStageRequest({
    paths: ["memory/transactions/pending/example.md"],
    allowMemoryData: true
  });

  assert.deepEqual(result.allowed_paths, ["memory/transactions/pending/example.md"]);
  assert.deepEqual(result.guarded_paths, []);
  assert.equal(result.allowed, true);
});
```

- [x] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/agent-stage.mjs
```

Expected: failure because `scripts/agent-stage.mjs` does not exist.

### Task 3.2: Implement the staging classifier

- [x] **Step 1: Create `scripts/agent-stage.mjs`**

```js
#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const guardedPrefixes = ["memory/events/", "memory/transactions/"];

function usage() {
  console.log(`Usage: pnpm agent:stage [--json] [--allow-memory-data --yes] <path...>

Stages explicit paths while refusing memory/events/** and memory/transactions/** by default.
`);
}

export function classifyStageRequest({ paths, allowMemoryData = false }) {
  const normalized = [...new Set(paths)].sort();
  const guarded = normalized.filter((item) => guardedPrefixes.some((prefix) => item.startsWith(prefix)));
  const allowed = allowMemoryData ? normalized : normalized.filter((item) => !guarded.includes(item));
  return {
    allowed: guarded.length === 0 || allowMemoryData,
    allowed_paths: allowed,
    guarded_paths: allowMemoryData ? [] : guarded,
    refused_reason: guarded.length > 0 && !allowMemoryData ? "guarded_memory_data_requires_explicit_allow" : null
  };
}

function parseArgs(argv) {
  const options = { paths: [], json: false, allowMemoryData: false, yes: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--allow-memory-data") {
      options.allowMemoryData = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    options.paths.push(arg);
  }
  return options;
}

function print(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const path of result.allowed_paths) {
    console.log(`stage: ${path}`);
  }
  for (const path of result.guarded_paths) {
    console.log(`refuse guarded memory data: ${path}`);
  }
}

function stage(paths) {
  if (paths.length === 0) {
    return;
  }
  const result = spawnSync("git", ["add", "--", ...paths], { stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.paths.length === 0) {
    usage();
    return;
  }
  if (options.allowMemoryData && !options.yes) {
    throw new Error("--allow-memory-data requires --yes.");
  }
  const result = classifyStageRequest({
    paths: options.paths,
    allowMemoryData: options.allowMemoryData
  });
  print(result, options.json);
  if (!result.allowed) {
    process.exitCode = 1;
    return;
  }
  stage(result.allowed_paths);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [x] **Step 2: Add package script**

Add to `package.json`:

```json
"agent:stage": "node scripts/agent-stage.mjs"
```

- [x] **Step 3: Run targeted tests**

Run:

```bash
node --test tests/agent-stage.mjs
```

Expected: pass.

### Task 3.3: Add practical staging docs

- [x] **Step 1: Append to `docs/agent-acceleration.md`**

```md
## Safe Staging

Use:

```bash
pnpm agent:stage docs/agent-acceleration.md scripts/agent-stage.mjs tests/agent-stage.mjs
```

The helper refuses `memory/events/**` and `memory/transactions/**` by default. Intentional memory-data staging requires:

```bash
pnpm agent:stage --allow-memory-data --yes memory/events/example.md
```

Product PRs should not use that override.
```

- [x] **Step 2: Validate PR 3**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 4: Scenario Factory and Test Shards

**Branch:** `codex/agent-scenario-factory-shards`

**Purpose:** Cut repeated fixture setup time and make targeted validation more reliable.

**Status Update - 2026-06-05:** Implemented on `codex/agent-scenario-factory-shards`. The scenario factory now exposes named scenario registry helpers, supports explicit scenario roots with the normal vault scaffold, `retrieval-no-match` creates an empty usable vault, and validation plans emit targeted test groups for workflow, scenario-factory, eval, Workbench, retrieval, and memory-sensitive changes. Targeted tests, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm check:memory-data` passed.

**Files:**

- Modify `tests/helpers/scenario-factory.mjs`
- Modify `tests/workbench.mjs`
- Modify `tests/core-v3-memory-hardening.mjs`
- Modify `tests/scenarios/run-answers.mjs`
- Modify `scripts/agent-policy.mjs`
- Modify `tests/agent-policy.mjs`
- Modify `docs/agent-acceleration.md`

### Task 4.1: Add scenario factory tests

- [x] **Step 1: Add factory tests to `tests/scenario-factory.mjs`**

```js
test("managerChainScenario creates cited manager and reporting claims", async () => {
  const vault = await createScenarioVault("manager-chain");
  const personPage = await readFile(path.join(vault.root, "memory/people/kuastav.md"), "utf8");

  assert.match(personPage, /claim_id: claim_person_kuastav_manager/);
  assert.match(personPage, /source_events:/);
  assert.match(personPage, /event_/);
});

test("retrievalNoMatchScenario creates an empty but valid vault", async () => {
  const vault = await createScenarioVault("retrieval-no-match");
  const schemaDir = path.join(vault.root, "memory/schema");

  assert.equal(existsSync(schemaDir), true);
  assert.equal(existsSync(path.join(vault.root, "memory/events")), true);
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/scenario-factory.mjs
```

Expected: failure because the named scenarios are not implemented or exported.

### Task 4.2: Implement missing scenarios

- [x] **Step 1: Add exported scenario names in `tests/helpers/scenario-factory.mjs`**

Add a registry:

```js
export const scenarioNames = [
  "manager-chain",
  "review-backlog",
  "stale-noop",
  "context-project",
  "duplicate-import",
  "conflicting-role-claims",
  "missing-evidence",
  "retrieval-no-match"
];
```

- [x] **Step 2: Add `createScenarioVault` registry dispatch**

```js
export async function createScenarioVault(name, options = {}) {
  if (!scenarioNames.includes(name)) {
    throw new Error(`Unknown scenario: ${name}`);
  }
  const root = await createTempVault(options);
  if (name === "manager-chain") {
    await writeManagerChain(root);
  }
  if (name === "retrieval-no-match") {
    await writeEmptyUsableVault(root);
  }
  return { root, name };
}
```

- [x] **Step 3: Add manager chain writer**

```js
async function writeManagerChain(root) {
  await mkdir(path.join(root, "memory/events/2026/2026-05"), { recursive: true });
  await mkdir(path.join(root, "memory/people"), { recursive: true });
  await writeFile(
    path.join(root, "memory/events/2026/2026-05/event_manager_chain.md"),
    `---
id: event_manager_chain
type: Event
object_state: active
recorded_at: 2026-05-20T00:00:00.000Z
observed_at: 2026-05-20T00:00:00.000Z
source_label: scenario
---

Kuastav is my manager. Kuastav reports to Jeff.
`
  );
  await writeFile(
    path.join(root, "memory/people/kuastav.md"),
    `---
id: person_kuastav
type: Person
object_state: active
review_state: none
aliases: []
---

## Claims

<!-- claim
claim_id: claim_person_kuastav_manager
claim_kind: fact
claim_state: active
evidence_strength: explicit
scope_state: complete
source_events:
  - event_manager_chain
-->
Kuastav is my manager.
<!-- /claim -->

<!-- claim
claim_id: claim_person_kuastav_reports_to_jeff
claim_kind: fact
claim_state: active
evidence_strength: explicit
scope_state: complete
source_events:
  - event_manager_chain
-->
Kuastav reports to Jeff.
<!-- /claim -->
`
  );
}
```

- [x] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/scenario-factory.mjs
```

Expected: pass.

### Task 4.3: Add targeted validation groups

- [x] **Step 1: Extend `scripts/agent-policy.mjs` with validation groups**

Add:

```js
const targetedGroups = {
  agent: ["tests/agent-control.mjs", "tests/agent-policy.mjs", "tests/agent-runner.mjs", "tests/agent-pr.mjs"],
  workbench: ["tests/workbench.mjs", "tests/browser/agent-workbench.spec.mjs"],
  retrieval: ["tests/scenarios/run-retrieval.mjs", "tests/scenarios/run-answers.mjs"],
  memory: ["tests/check-memory-data.mjs", "tests/core-v3-memory-hardening.mjs"]
};
```

Add to plans:

```js
targeted_groups: inferTargetedGroups(categories)
```

Use:

```js
function inferTargetedGroups(categories) {
  const groups = [];
  if (hasAny(categories, ["workflow"])) groups.push({ name: "agent", commands: targetedGroups.agent });
  if (hasAny(categories, ["workbench"])) groups.push({ name: "workbench", commands: targetedGroups.workbench });
  if (hasAny(categories, ["core"])) groups.push({ name: "retrieval", commands: targetedGroups.retrieval });
  if (hasAny(categories, ["guarded-memory-data", "memory"])) groups.push({ name: "memory", commands: targetedGroups.memory });
  return groups;
}
```

- [x] **Step 2: Add test to `tests/agent-policy.mjs`**

```js
test("validation plan includes targeted groups for workflow changes", () => {
  const plan = buildValidationPlan({
    changedFiles: ["scripts/agent-stage.mjs"]
  });

  assert.deepEqual(plan.targeted_groups.map((group) => group.name), ["agent"]);
});
```

- [x] **Step 3: Validate PR 4**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 5: Workbench Modularization First Cut

**Branch:** `codex/agent-workbench-modularization`

**Purpose:** Reduce editing risk and review cost by splitting the large Workbench file into focused modules without changing behavior.

**Files:**

- Modify `packages/workbench/src/index.ts`
- Create `packages/workbench/src/server/http.ts`
- Create `packages/workbench/src/server/route-registry.ts`
- Create `packages/workbench/src/server/routes/ask.ts`
- Create `packages/workbench/src/server/routes/review.ts`
- Create `packages/workbench/src/server/routes/transactions.ts`
- Create `packages/workbench/src/server/routes/health.ts`
- Create `packages/workbench/src/server/routes/briefs.ts`
- Create `packages/workbench/src/server/routes/entities.ts`
- Create `packages/workbench/src/server/routes/contexts.ts`
- Create `packages/workbench/src/client/app.ts`
- Create `packages/workbench/src/client/tabs/ask.ts`
- Create `packages/workbench/src/client/tabs/review.ts`
- Create `packages/workbench/src/client/tabs/transactions.ts`
- Create `packages/workbench/src/client/tabs/health.ts`
- Create `packages/workbench/src/client/tabs/briefs.ts`
- Create `packages/workbench/src/shared/contracts.ts`
- Create `scripts/workbench-split-check.mjs`
- Create `tests/workbench-modularization.mjs`

### Task 5.1: Add behavior-preservation smoke test

- [ ] **Step 1: Create `tests/workbench-modularization.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchServer } from "../packages/workbench/src/index.ts";

test("workbench index exports the compatible server factory", () => {
  assert.equal(typeof createWorkbenchServer, "function");
});
```

- [ ] **Step 2: Run it**

Run:

```bash
node --test tests/workbench-modularization.mjs
```

Expected: pass before refactor; this locks the compatibility export.

### Task 5.2: Extract route registry

- [ ] **Step 1: Create `packages/workbench/src/server/route-registry.ts`**

```ts
export type WorkbenchRoute = {
  method: "GET" | "POST";
  pathname: string;
  handler: (request: Request) => Promise<Response> | Response;
};

export function findRoute(routes: WorkbenchRoute[], method: string, pathname: string): WorkbenchRoute | null {
  return routes.find((route) => route.method === method && route.pathname === pathname) ?? null;
}
```

- [ ] **Step 2: Create `packages/workbench/src/server/http.ts`**

```ts
import { createServer } from "node:http";
import { findRoute, type WorkbenchRoute } from "./route-registry.js";

export function createHttpServer(routes: WorkbenchRoute[]) {
  return createServer(async (nodeRequest, nodeResponse) => {
    const url = new URL(nodeRequest.url ?? "/", "http://127.0.0.1");
    const route = findRoute(routes, nodeRequest.method ?? "GET", url.pathname);
    if (route === null) {
      nodeResponse.statusCode = 404;
      nodeResponse.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const response = await route.handler(new Request(url, { method: nodeRequest.method }));
    nodeResponse.statusCode = response.status;
    nodeResponse.end(await response.text());
  });
}
```

- [ ] **Step 3: Move one route first**

Create `packages/workbench/src/server/routes/ask.ts`:

```ts
import type { WorkbenchRoute } from "../route-registry.js";

export function askRoutes(): WorkbenchRoute[] {
  return [
    {
      method: "GET",
      pathname: "/api/ask",
      handler: () => Response.json({ error: "route_moved_without_handler" }, { status: 501 })
    }
  ];
}
```

Then replace the stub with the existing `/api/ask` handler body copied from `packages/workbench/src/index.ts`.

- [ ] **Step 4: Run existing Workbench tests**

Run:

```bash
node --test tests/workbench.mjs tests/workbench-modularization.mjs
```

Expected: pass.

### Task 5.3: Move remaining route groups one by one

- [ ] **Step 1: Move Review routes and run tests**

Create `packages/workbench/src/server/routes/review.ts` with the existing review inbox/apply/reprocess handlers.

Run:

```bash
node --test tests/workbench.mjs
```

Expected: pass.

- [ ] **Step 2: Move Transactions routes and run tests**

Create `packages/workbench/src/server/routes/transactions.ts` with transaction list/detail/apply/reject handlers.

Run:

```bash
node --test tests/workbench.mjs tests/browser/workbench-transaction-console.spec.mjs
```

Expected: unit tests pass; browser test may require `TMPDIR=/tmp pnpm test:browser` in full validation.

- [ ] **Step 3: Move Health, Briefs, Entities, and Contexts routes**

Create the listed route files and preserve handler behavior exactly.

Run:

```bash
node --test tests/workbench.mjs
```

Expected: pass.

### Task 5.4: Extract client tabs without UI redesign

- [ ] **Step 1: Create `packages/workbench/src/client/app.ts`**

Move browser bootstrapping and tab registration from `index.ts` into `app.ts`.

- [ ] **Step 2: Create tab modules**

Create:

- `packages/workbench/src/client/tabs/ask.ts`
- `packages/workbench/src/client/tabs/review.ts`
- `packages/workbench/src/client/tabs/transactions.ts`
- `packages/workbench/src/client/tabs/health.ts`
- `packages/workbench/src/client/tabs/briefs.ts`

Each module exports:

```ts
export function render<TState>(root: HTMLElement, state: TState): void {
  root.replaceChildren();
}
```

Then move the existing tab-specific render logic into the matching module.

- [ ] **Step 3: Validate browser coverage**

Run:

```bash
TMPDIR=/tmp pnpm test:browser
```

Expected: pass in an environment where Chromium can launch. If sandbox blocks Chromium, run through the approved escalated browser path and record the diagnosis with `pnpm agent:run`.

### Task 5.5: Validate PR 5

- [ ] **Step 1: Run full Workbench validation**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:e2e
TMPDIR=/tmp pnpm test:browser
pnpm check:memory-data
```

Expected: pass or produce an environment-classified browser launch failure that is rerun successfully outside sandbox.

---

## PR 6: Capability Registry

**Branch:** `codex/agent-capability-registry`

**Purpose:** Stop duplicating public-interface knowledge across CLI, Workbench, Pi, docs, and evals by adding a deterministic capability registry and consistency tests.

**Files:**

- Create `packages/core/src/capabilities/schema.ts`
- Create `packages/core/src/capabilities/index.ts`
- Modify `packages/core/src/index.ts`
- Create `tests/capabilities-registry.mjs`
- Modify `docs/agent-acceleration.md`

### Task 6.1: Add registry schema tests

- [ ] **Step 1: Create `tests/capabilities-registry.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { capabilityRegistry, validateCapabilityRegistry } from "../packages/core/src/capabilities/index.ts";

test("capability registry has unique stable ids", () => {
  const ids = capabilityRegistry.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("capability registry includes high-value dogfood surfaces", () => {
  const ids = capabilityRegistry.map((item) => item.id);
  assert.ok(ids.includes("capture"));
  assert.ok(ids.includes("ask-answer-contract"));
  assert.ok(ids.includes("entity-stewardship"));
  assert.ok(ids.includes("context-operating-room"));
});

test("capability registry validates mutation semantics", () => {
  const result = validateCapabilityRegistry(capabilityRegistry);
  assert.deepEqual(result.errors, []);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/capabilities-registry.mjs
```

Expected: failure because registry files do not exist.

### Task 6.2: Implement registry schema

- [ ] **Step 1: Create `packages/core/src/capabilities/schema.ts`**

```ts
export type CapabilityMutationKind = "read_only" | "transaction_backed" | "local_noncanonical" | "external_sync";

export type CapabilityDefinition = {
  id: string;
  title: string;
  mutationKind: CapabilityMutationKind;
  cliCommands: string[];
  workbenchRoutes: string[];
  piTools: string[];
  docs: string[];
  validationGroups: string[];
  invariants: string[];
};

export type CapabilityValidationResult = {
  errors: string[];
};

export function validateCapabilityRegistry(items: CapabilityDefinition[]): CapabilityValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      errors.push(`duplicate id: ${item.id}`);
    }
    ids.add(item.id);
    if (item.mutationKind === "transaction_backed" && !item.invariants.some((value) => value.includes("Transaction"))) {
      errors.push(`${item.id} is transaction_backed but does not name Transaction invariant`);
    }
    if (item.mutationKind === "read_only" && item.invariants.some((value) => value.includes("writes"))) {
      errors.push(`${item.id} is read_only but invariant text mentions writes`);
    }
  }
  return { errors };
}
```

- [ ] **Step 2: Create `packages/core/src/capabilities/index.ts`**

```ts
import type { CapabilityDefinition } from "./schema.js";
export { validateCapabilityRegistry } from "./schema.js";
export type { CapabilityDefinition, CapabilityMutationKind, CapabilityValidationResult } from "./schema.js";

export const capabilityRegistry: CapabilityDefinition[] = [
  {
    id: "capture",
    title: "Capture note",
    mutationKind: "transaction_backed",
    cliCommands: ["wm capture"],
    workbenchRoutes: ["/api/capture/preview", "/api/capture"],
    piTools: [],
    docs: ["docs/use-assisto-tomorrow.md"],
    validationGroups: ["core", "workbench", "browser"],
    invariants: ["Writes Event plus pending Transaction only."]
  },
  {
    id: "ask-answer-contract",
    title: "Cited answer contract",
    mutationKind: "read_only",
    cliCommands: ["wm ask --answer-contract"],
    workbenchRoutes: ["/api/ask/answer-contract"],
    piTools: [],
    docs: ["docs/cited-work-memory.md"],
    validationGroups: ["retrieval", "answers"],
    invariants: ["Derived output only."]
  },
  {
    id: "entity-stewardship",
    title: "Entity stewardship",
    mutationKind: "transaction_backed",
    cliCommands: ["wm entities stewardship"],
    workbenchRoutes: ["/api/entities/stewardship", "/api/entities/identity-review/stage"],
    piTools: [],
    docs: ["docs/revised-design.md"],
    validationGroups: ["core", "workbench"],
    invariants: ["Risk detection is read-only; repair actions create pending Transactions."]
  },
  {
    id: "context-operating-room",
    title: "Context operating room",
    mutationKind: "transaction_backed",
    cliCommands: ["wm context operating-room"],
    workbenchRoutes: ["/api/contexts/operating-room"],
    piTools: [],
    docs: ["docs/revised-design.md"],
    validationGroups: ["core", "workbench", "browser"],
    invariants: ["Corrections route through capture or pending Transactions."]
  }
];
```

- [ ] **Step 3: Export registry from `packages/core/src/index.ts`**

Add:

```ts
export * from "./capabilities/index.js";
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/capabilities-registry.mjs
```

Expected: pass.

### Task 6.3: Connect registry to validation planner

- [ ] **Step 1: Add registry-aware group names to `scripts/agent-policy.mjs`**

Add a static mapping:

```js
const capabilityValidationGroups = {
  "ask-answer-contract": ["eval:answers", "eval:v8"],
  capture: ["test:e2e", "test:browser", "eval:v5", "eval:v7"],
  "entity-stewardship": ["eval:v8", "test:browser"],
  "context-operating-room": ["eval:v8", "test:browser"]
};
```

- [ ] **Step 2: Include capability group in plan JSON**

Add:

```js
capability_groups: capabilityValidationGroups
```

- [ ] **Step 3: Validate PR 6**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:answers
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: pass.

---

## PR 7: Local Subagent Review Harness

**Branch:** `codex/agent-local-review-harness`

**Purpose:** Replace disabled Copilot review with deterministic local review prompts/checklists that subagents can run before PR creation.

**Files:**

- Create `scripts/agent-review.mjs`
- Modify `package.json`
- Create `tests/agent-review.mjs`
- Modify `docs/agent-acceleration.md`

### Task 7.1: Add review-plan tests

- [ ] **Step 1: Create `tests/agent-review.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPlan } from "../scripts/agent-review.mjs";

test("invariant review plan includes memory and transaction checks", () => {
  const plan = buildReviewPlan({
    kind: "invariant",
    changedFiles: ["packages/core/src/transactions/apply.ts"]
  });

  assert.equal(plan.kind, "invariant");
  assert.ok(plan.checks.some((item) => item.includes("direct canonical writes")));
  assert.ok(plan.checks.some((item) => item.includes("Event evidence")));
});

test("test review plan includes targeted rerun guidance", () => {
  const plan = buildReviewPlan({
    kind: "tests",
    changedFiles: ["packages/workbench/src/client/tabs/ask.ts"]
  });

  assert.ok(plan.commands.includes("TMPDIR=/tmp pnpm test:browser"));
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
node --test tests/agent-review.mjs
```

Expected: failure because script does not exist.

### Task 7.2: Implement review plan generator

- [ ] **Step 1: Create `scripts/agent-review.mjs`**

```js
#!/usr/bin/env node

const commonInvariantChecks = [
  "Check for direct canonical writes to memory pages outside transaction helpers.",
  "Check every durable claim has Event evidence.",
  "Check unscoped system/context claims remain staged.",
  "Check generated answers and briefs are not persisted.",
  "Check entity ambiguity does not auto-merge people/topics.",
  "Check contradiction handling stages review instead of resolving autonomously."
];

export function buildReviewPlan({ kind, changedFiles }) {
  const workbenchChanged = changedFiles.some((file) => file.startsWith("packages/workbench/"));
  const coreChanged = changedFiles.some((file) => file.startsWith("packages/core/"));
  const commands = ["pnpm lint", "pnpm typecheck", "TMPDIR=/tmp pnpm test", "pnpm check:memory-data"];
  if (workbenchChanged) {
    commands.push("TMPDIR=/tmp pnpm test:browser");
  }
  if (coreChanged) {
    commands.push("TMPDIR=/tmp pnpm eval:mvp", "TMPDIR=/tmp pnpm eval:v8");
  }

  return {
    kind,
    changed_files: changedFiles,
    checks: kind === "invariant" ? commonInvariantChecks : [
      "Check tests fail before implementation when behavior changes.",
      "Check targeted tests cover the changed behavior.",
      "Check validation commands match changed-file policy."
    ],
    commands
  };
}

function parseArgs(argv) {
  const options = { kind: "invariant", files: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--kind") {
      options.kind = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    options.files.push(arg);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildReviewPlan({ kind: options.kind, changedFiles: options.files });
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`# ${plan.kind} review`);
  for (const check of plan.checks) {
    console.log(`- ${check}`);
  }
  console.log("\nCommands:");
  for (const command of plan.commands) {
    console.log(`- ${command}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Add package script**

Add:

```json
"agent:review": "node scripts/agent-review.mjs"
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
node --test tests/agent-review.mjs
```

Expected: pass.

### Task 7.3: Document subagent review prompts

- [ ] **Step 1: Add to `docs/agent-acceleration.md`**

```md
## Local Review Harness

Before opening a PR, generate review prompts:

```bash
pnpm agent:review --kind invariant --json $(git diff --name-only origin/main...HEAD)
pnpm agent:review --kind tests --json $(git diff --name-only origin/main...HEAD)
```

Dispatch one subagent for invariants and one for tests when the change touches core memory, transactions, retrieval, Workbench, or evals. Record findings with:

```bash
pnpm agent:note --kind review --text "Invariant review passed: no direct canonical writes."
```
```

- [ ] **Step 2: Validate PR 7**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 8: Environment Diagnostics v2

**Branch:** `codex/agent-diagnostics-v2`

**Purpose:** Reduce debugging loops by classifying recurring environment failures and giving exact rerun commands.

**Files:**

- Modify `scripts/agent-run.mjs`
- Modify `tests/agent-runner.mjs`
- Modify `docs/agent-acceleration.md`

### Task 8.1: Add failure fixture tests

- [ ] **Step 1: Extend `tests/agent-runner.mjs`**

Add:

```js
test("classifyFailure detects WSL access denied", () => {
  const result = classifyFailure({
    stderr: "Wsl/Service/E_ACCESSDENIED",
    stdout: "",
    exitCode: 1,
    command: ["powershell.exe", "Get-ChildItem"]
  });

  assert.equal(result.code, "wsl_access_denied");
  assert.match(result.workaround, /wsl.exe -d Ubuntu --cd/);
});

test("classifyFailure detects Playwright sandbox host errors", () => {
  const result = classifyFailure({
    stderr: "sandbox_host_linux.cc Operation not permitted",
    stdout: "",
    exitCode: 1,
    command: ["pnpm", "test:browser"]
  });

  assert.equal(result.code, "playwright_sandbox_host_eperm");
  assert.deepEqual(result.rerun_command, ["pnpm", "test:browser"]);
});

test("classifyFailure detects Mixedbread smoke no-results", () => {
  const result = classifyFailure({
    stderr: "",
    stdout: "mxbai smoke failed: query returned no hits",
    exitCode: 1,
    command: ["pnpm", "mxbai:smoke"]
  });

  assert.equal(result.code, "mixedbread_smoke_no_results");
});
```

- [ ] **Step 2: Run targeted tests to verify failure**

Run:

```bash
node --test tests/agent-runner.mjs
```

Expected: failure until new classifiers are added.

### Task 8.2: Add classifiers

- [ ] **Step 1: Update `classifyFailure` in `scripts/agent-run.mjs`**

Add these cases before generic Playwright/Mixedbread checks:

```js
if (haystack.includes("wsl/service/e_accessdenied")) {
  return {
    code: "wsl_access_denied",
    summary: "Windows-to-WSL filesystem access was denied.",
    workaround: "Use wsl.exe -d Ubuntu --cd /home/jc/assisto -- <cmd> or run the command inside the WSL shell.",
    rerun_command: command
  };
}
if (haystack.includes("sandbox_host_linux.cc") && haystack.includes("operation not permitted")) {
  return {
    code: "playwright_sandbox_host_eperm",
    summary: "Chromium sandbox launch was blocked by the execution sandbox.",
    workaround: "Rerun TMPDIR=/tmp pnpm test:browser outside the sandbox or in the local CI capsule.",
    rerun_command: command
  };
}
if (haystack.includes("mxbai smoke failed") && haystack.includes("no hits")) {
  return {
    code: "mixedbread_smoke_no_results",
    summary: "Mixedbread smoke ran but did not find expected indexed documents.",
    workaround: "Run pnpm mxbai:upload, then pnpm mxbai:smoke. Check .mxbai/upload-manifest.yaml if it still fails.",
    rerun_command: ["pnpm", "mxbai:upload"]
  };
}
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
node --test tests/agent-runner.mjs
```

Expected: pass.

### Task 8.3: Add diagnostic doc table

- [ ] **Step 1: Add to `docs/agent-acceleration.md`**

```md
## Common Environment Failures

| Code | Meaning | First rerun |
| --- | --- | --- |
| `windows_temp_readonly` | Command used read-only Windows temp | `TMPDIR=/tmp TEMP=/tmp TMP=/tmp <command>` |
| `localhost_bind_eperm` | Sandbox blocked local server bind | Rerun the exact server/test command outside sandbox |
| `playwright_sandbox_host_eperm` | Chromium sandbox launch blocked | `TMPDIR=/tmp pnpm test:browser` outside sandbox or local CI capsule |
| `sandbox_child_process_eperm` | Nested process blocked | Rerun through `pnpm agent:run` outside sandbox |
| `wsl_access_denied` | Windows-to-WSL access denied | `wsl.exe -d Ubuntu --cd /home/jc/assisto -- <cmd>` |
| `mixedbread_auth_or_network` | Mixedbread auth/network unavailable | Check `MXBAI_API_KEY` and rerun trusted Mixedbread command |
| `mixedbread_smoke_no_results` | Store query did not find expected docs | `pnpm mxbai:upload && pnpm mxbai:smoke` |
```

- [ ] **Step 2: Validate PR 8**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 9: Mixedbread Refresh Orchestrator

**Branch:** `codex/agent-mxbai-refresh`

**Purpose:** Make post-merge Mixedbread refresh consistent, logged, and diagnostically useful.

**Files:**

- Create `scripts/agent-mxbai.mjs`
- Modify `package.json`
- Create `tests/agent-mxbai.mjs`
- Modify `docs/agent-acceleration.md`

### Task 9.1: Add refresh-plan tests

- [ ] **Step 1: Create `tests/agent-mxbai.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildMxbaiRefreshPlan } from "../scripts/agent-mxbai.mjs";

test("Mixedbread refresh plan runs upload before smoke", () => {
  const plan = buildMxbaiRefreshPlan({ store: "assisto" });

  assert.deepEqual(plan.commands, [
    { name: "upload", command: "pnpm mxbai:upload", store: "assisto" },
    { name: "smoke", command: "pnpm mxbai:smoke", store: "assisto" }
  ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
node --test tests/agent-mxbai.mjs
```

Expected: failure because script does not exist.

### Task 9.2: Implement Mixedbread wrapper

- [ ] **Step 1: Create `scripts/agent-mxbai.mjs`**

```js
#!/usr/bin/env node
import { spawnSync } from "node:child_process";

export function buildMxbaiRefreshPlan({ store = process.env.MXBAI_STORE ?? "assisto" } = {}) {
  return {
    store,
    commands: [
      { name: "upload", command: "pnpm mxbai:upload", store },
      { name: "smoke", command: "pnpm mxbai:smoke", store }
    ]
  };
}

function runPnpmScript(script) {
  const result = spawnSync("pnpm", [script], {
    stdio: "inherit",
    env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" }
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help" || command === "-h" || command === undefined) {
    console.log("Usage: pnpm agent:mxbai refresh [--json]");
    return;
  }
  const json = args.includes("--json");
  const plan = buildMxbaiRefreshPlan({});
  if (command !== "refresh") {
    throw new Error(`Unknown command: ${command}`);
  }
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
  }
  runPnpmScript("mxbai:upload");
  runPnpmScript("mxbai:smoke");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Add package script**

Add:

```json
"agent:mxbai": "node scripts/agent-mxbai.mjs"
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
node --test tests/agent-mxbai.mjs
```

Expected: pass.

### Task 9.3: Integrate with PR closeout

- [ ] **Step 1: Modify `scripts/agent-pr.mjs`**

Replace:

```js
inherit("pnpm", ["mxbai:upload"]);
inherit("pnpm", ["mxbai:smoke"]);
```

with:

```js
inherit("pnpm", ["agent:mxbai", "refresh"]);
```

- [ ] **Step 2: Validate PR 9**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
pnpm check:memory-data
```

Expected: pass.

---

## PR 10: Agent Workbench v2

**Branch:** `codex/agent-workbench-v2`

**Purpose:** Give overnight runs a local cockpit for seeing current state, validation plans, diagnostics, PR readiness, staging safety, repo map, and handoff without reading scattered logs.

**Files:**

- Modify `scripts/agent-workbench.mjs`
- Modify `tests/agent-workbench.mjs`
- Modify `tests/browser/agent-workbench.spec.mjs`
- Modify `docs/agent-acceleration.md`

### Task 10.1: Add API route tests

- [ ] **Step 1: Extend `tests/agent-workbench.mjs`**

Add:

```js
test("agent workbench exposes validation plan endpoint", async () => {
  const app = createAgentWorkbenchApp({
    root: fixtureRoot,
    commandRunner: async () => JSON.stringify({
      mode: "workflow-scripts",
      commands: [{ name: "lint", command: "pnpm lint" }],
      skipped: []
    })
  });

  const response = await app.handle(new Request("http://127.0.0.1/api/validation/plan"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "workflow-scripts");
  assert.equal(body.commands[0].name, "lint");
});

test("agent workbench exposes staging classification endpoint", async () => {
  const app = createAgentWorkbenchApp({ root: fixtureRoot });
  const response = await app.handle(new Request("http://127.0.0.1/api/stage/classify", {
    method: "POST",
    body: JSON.stringify({ paths: ["memory/events/example.md"] })
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.allowed, false);
  assert.deepEqual(body.guarded_paths, ["memory/events/example.md"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
node --test tests/agent-workbench.mjs
```

Expected: failure until endpoints exist.

### Task 10.2: Add endpoints

- [ ] **Step 1: Modify `scripts/agent-workbench.mjs`**

Add routes:

```js
if (url.pathname === "/api/validation/plan") {
  return json(await runJsonCommand(["pnpm", "agent:validate", "--", "--plan", "--json"]));
}

if (url.pathname === "/api/stage/classify" && request.method === "POST") {
  const body = await request.json();
  const { classifyStageRequest } = await import("./agent-stage.mjs");
  return json(classifyStageRequest({
    paths: body.paths ?? [],
    allowMemoryData: body.allowMemoryData === true
  }));
}

if (url.pathname === "/api/mxbai/plan") {
  const { buildMxbaiRefreshPlan } = await import("./agent-mxbai.mjs");
  return json(buildMxbaiRefreshPlan({}));
}
```

- [ ] **Step 2: Run route tests**

Run:

```bash
node --test tests/agent-workbench.mjs
```

Expected: pass.

### Task 10.3: Add browser coverage

- [ ] **Step 1: Extend `tests/browser/agent-workbench.spec.mjs`**

Add:

```js
test("Agent Workbench shows validation and staging guard panels", async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByText("Validation Plan")).toBeVisible();
  await expect(page.getByText("pnpm lint")).toBeVisible();

  await page.getByRole("tab", { name: "PR" }).click();
  await expect(page.getByText("No-Copilot Closeout")).toBeVisible();
  await expect(page.getByText("memory-data guard")).toBeVisible();
});
```

- [ ] **Step 2: Update client markup in `scripts/agent-workbench.mjs`**

Add tabs:

- Run
- Validation
- Diagnostics
- PR
- Staging
- Mixedbread
- Repo Map
- Handoff

Each mutating action button must show a confirmation prompt and call an existing CLI helper.

- [ ] **Step 3: Run browser test**

Run:

```bash
TMPDIR=/tmp pnpm test:browser
```

Expected: pass in Chromium-capable environment.

### Task 10.4: Validate PR 10

- [ ] **Step 1: Run full process validation**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
pnpm check:memory-data
```

Expected: pass.

---

## Final Program Validation

After PR 10 merges and `main` is synced:

```bash
git switch main
git pull --ff-only origin main
pnpm check:memory-data
pnpm agent:policy check
pnpm agent:validate --plan
pnpm validate:local
pnpm agent:ci-local --plan
pnpm agent:mxbai refresh
```

Expected:

- `check:memory-data` reports no blocking guarded changes.
- `agent:policy check` passes.
- `agent:validate --plan` prints a coherent changed-file plan.
- `validate:local` passes or any environment failure is classified by `agent:diagnose:last`.
- `agent:ci-local --plan` prints the local CI capsule command plan.
- `agent:mxbai refresh` uploads and smoke-tests the trusted Mixedbread store.

## Execution Strategy

Use subagents aggressively:

- Subagent A: PR 1 and PR 9, because both touch closeout/merge refresh.
- Subagent B: PR 2 and PR 4, because both touch validation planning.
- Subagent C: PR 3 and PR 8, because both focus on safety/diagnostics.
- Subagent D: PR 5, because Workbench modularization is large and should be isolated.
- Subagent E: PR 6, because registry consistency crosses public interfaces.
- Subagent F: PR 7 and PR 10, because review harness and Agent Workbench are related.

Review after each subagent:

```bash
git diff --stat
pnpm check:memory-data
pnpm agent:validate --plan
```

Merge only one PR at a time. Refresh Mixedbread after each merge.

## Risks and Mitigations

- **Risk:** No-Copilot closeout removes an external review signal.
  **Mitigation:** Replace it with local invariant/test review prompts, CI gating, memory guard, validation recording, and explicit merge flags.

- **Risk:** Workbench modularization causes UI regressions.
  **Mitigation:** Move one route group at a time and run `tests/workbench.mjs` after each move; run Chromium browser tests before PR closeout.

- **Risk:** Smart validation skips an important eval.
  **Mitigation:** Planner must print skipped commands with reasons; risky categories still trigger current eval chains.

- **Risk:** Staging helper blocks legitimate memory-data work.
  **Mitigation:** Explicit `--allow-memory-data --yes` exists, but product PR docs forbid using it.

- **Risk:** More automation hides unsafe actions.
  **Mitigation:** Merge, push, Mixedbread refresh, and guarded memory-data staging all require explicit commands/flags and produce structured evidence.

## Definition of Done

The program is complete when:

- No-Copilot closeout works and refuses unsafe PRs.
- Validation plans explain required and skipped commands.
- Guarded staging prevents accidental user-memory staging.
- Scenario factory reduces duplicate setup in at least three tests.
- Workbench server/client code is split into focused modules with behavior preserved.
- Capability registry documents major public surfaces and invariants.
- Local review harness replaces Copilot-dependent review steps.
- Diagnostics classify recurring environment failures.
- Mixedbread refresh is one logged command.
- Agent Workbench shows run, validation, diagnostics, PR, staging, Mixedbread, repo map, and handoff state.
- `pnpm check:memory-data` passes before every commit and merge.
