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

Use the legacy review-thread gate only when a human explicitly asks for it:

```bash
pnpm agent:pr closeout <pr-number> --with-review-check
```

That opt-in path runs the review wait helper, stores a review-thread snapshot, and refuses unresolved review threads.

## Smart Validation Planner

Use the validation planner before deciding which local gates to run:

```bash
pnpm agent:validate --plan --json
```

The plan includes:

- `commands`: required validation commands with reason, cost, and required metadata;
- `skipped`: known commands that are not required for the current changed-file mode, with skip reasons;
- `file_reasons`: deterministic path classifications that explain why each changed file selected a validation mode;
- `capability_groups`: stable capability IDs mapped to focused validation gates for public surfaces.

Docs-only work can request the lighter docs process:

```bash
pnpm agent:validate --plan --json --docs-only
```

Use `--docs-only` only for branches whose intentional changes are docs/process files; it is an explicit override.

Use `--full` or `--ci-parity` when the branch has cross-cutting risk or when local evidence must mirror CI.

## Safe Staging

Use:

```bash
pnpm agent:stage docs/agent-acceleration.md scripts/agent-stage.mjs tests/agent-stage.mjs
```

The helper refuses `memory/events/**`, `memory/transactions/**`, parent directories that include them, and Git pathspec magic by default. Intentional memory-data staging requires explicit repo-relative paths:

```bash
pnpm agent:stage --allow-memory-data --yes memory/events/example.md
```

Product PRs should not use that override.

The memory guard and agent policy distinguish blocking guarded changes from preserved local dogfood data. Untracked files under `memory/events/**` and `memory/transactions/**` are reported so they are not forgotten, but they do not block policy checks unless they are staged, modified from tracked content, or committed on the branch.

## Scenario Factory And Targeted Groups

Use named scenario vaults when a test only needs a known fixture shape:

```js
const vault = await createScenarioVault("manager-chain");
```

`pnpm agent:validate --plan --json` also reports `targeted_groups` for workflow, scenario-factory, Workbench, retrieval, and memory-sensitive changes, so agents can run focused checks before the full required gates.

## Capability Groups

Core publishes a deterministic capability registry for high-value public surfaces such as capture, cited answer contracts, entity stewardship, and Context operating rooms. `pnpm agent:validate --plan --json` reports a `capability_groups` map that ties those stable capability IDs to focused validation gates. The map is advisory: it helps agents choose extra targeted checks for touched surfaces without changing the planner's required command list.

## Local Review Harness

Before opening a PR, generate deterministic review prompts for subagents:

```bash
pnpm agent:review --kind invariant --json $(git diff --name-only origin/main...HEAD)
pnpm agent:review --kind tests --json $(git diff --name-only origin/main...HEAD)
```

Use the invariant prompt for memory-safety, transaction-flow, and derived-output checks. Use the tests prompt to verify targeted coverage and validation scope. Dispatch separate subagents when the branch touches core memory, transactions, retrieval, Workbench, Pi, or evals, then record the result:

```bash
pnpm agent:note --kind review --text "Invariant review passed: no direct canonical writes."
```

## Common Environment Failures

| Code | Meaning | First rerun |
| --- | --- | --- |
| `windows_temp_readonly` | Command used read-only Windows temp | `TMPDIR=/tmp TEMP=/tmp TMP=/tmp <command>` |
| `localhost_bind_eperm` | Sandbox blocked local server bind | Rerun the exact server/test command outside sandbox |
| `playwright_sandbox_host_eperm` | Chromium sandbox launch blocked | `TMPDIR=/tmp pnpm test:browser` outside sandbox or local CI capsule |
| `sandbox_child_process_eperm` | Nested process blocked | Rerun through `pnpm agent:run` outside sandbox |
| `wsl_access_denied` | Windows-to-WSL access denied | `wsl.exe -d Ubuntu --cd /home/jc/assisto -- <cmd>` |
| `mixedbread_auth_or_network` | Mixedbread auth/network unavailable | Check `MXBAI_API_KEY` and rerun trusted Mixedbread command |
| `mixedbread_smoke_no_results` | Store query did not find expected docs | `pnpm agent:mxbai refresh` |

## Mixedbread Refresh

After a PR merges and local `main` is synced, refresh the trusted Mixedbread store through the logged wrapper:

```bash
pnpm agent:mxbai refresh
```

The wrapper runs manifest-scoped upload before smoke, sets WSL-safe temp variables, and routes each underlying command through `agent:run` so failures get `.assisto-agent/logs/**` diagnostics.

## Agent Workbench

Start the local-only cockpit with:

```bash
pnpm agent:workbench serve
```

The Workbench shows run state, diagnostics, PR state, repo map, and handoff controls. The v2 panels also expose read-only validation, staging, and Mixedbread previews:

- Validation calls `/api/validation/plan` and shows the JSON plan from `pnpm agent:validate --plan --json`.
- Staging calls `/api/stage/classify` so guarded memory-data paths are visible before staging.
- Mixedbread calls `/api/mxbai/plan` and previews the upload-then-smoke refresh sequence without running network operations.

Mutating controls remain explicit: the next-action note button is disabled until confirmation is checked.
