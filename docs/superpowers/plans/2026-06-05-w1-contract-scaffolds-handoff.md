# Wave 1 Contract Scaffolds Handoff

Date: 2026-06-05
Workspace: `/home/jc/assisto`
Current branch: `codex/w1-contract-scaffolds`

## Status Update - 2026-06-05

Superseded by PR #115, merged to `main` as `8e830e5 [codex] Add Wave 1 contract scaffolds to main (#115)`. Current `main` is now `8c54595 [codex] Harden agent review harness focus areas (#132)`.

The PR #111/#112 stack, local-only `99e7c9b` push step, retargeting steps, and post-merge Mixedbread refresh described below are complete or obsolete. Keep this file only as historical context for the Wave 1 closeout. Current follow-up work should start from synced `main`.

## Purpose

This file hands off the paused PR review/closeout work so another Codex instance can pick up without replaying the thread.

The user originally asked to check code reviews, implement fixes, commit, push, and merge. Work was paused at the user's explicit boundary: after the next commit, before any push or merge follow-up.

## Current Local State

Run these first to verify nothing drifted:

```bash
git status --short --branch
git log --oneline --decorate -8
pnpm check:memory-data
```

Last observed local status:

```text
## codex/w1-contract-scaffolds...origin/codex/w1-contract-scaffolds [ahead 1]
?? .trunk/
?? docs/superpowers/plans/2026-06-01-agent-acceleration-control-plane.md
?? memory/events/2026/2026-05/2026-05-20-003.md
?? memory/events/2026/2026-05/2026-05-20-004.md
?? memory/events/2026/2026-05/2026-05-20-005.md
?? memory/events/2026/2026-05/2026-05-20-006.md
?? memory/transactions/pending/tx_2026_05_20_003.md
?? memory/transactions/pending/tx_2026_05_20_004.md
?? memory/transactions/pending/tx_2026_05_20_005.md
?? memory/transactions/pending/tx_2026_05_20_006.md
```

Important: the branch is ahead of origin by one local commit:

```text
99e7c9b Reduce Sonar follow-up findings
c3a002b Fix review security hotspots
1e16d0e Add wave 1 contract scaffolds
3eb9f36 Add wave 0 parallel planning docs
```

`99e7c9b` is local-only until pushed. Remote PR checks for `#112` do not include it yet.

## Protected Local Files

Do not stage, revert, delete, or modify these unless the user explicitly asks for memory-data work:

```text
memory/events/**
memory/transactions/**
.assisto-local/**
```

The untracked `memory/events/**` and `memory/transactions/**` files listed above are user dogfood data and were intentionally preserved.

Also note the untracked `.trunk/` directory and untracked `docs/superpowers/plans/2026-06-01-agent-acceleration-control-plane.md`; do not stage them unless they are intentionally part of a later task.

## What Was Fixed

### Commit `c3a002b` - pushed

Commit: `Fix review security hotspots`

Fixed Sonar security hotspots on PR `#112`, all from regex-based normalization flagged as super-linear runtime/backtracking risk:

- `scripts/baseline-local.mjs`
- `scripts/perf-baseline.mjs`
- `packages/core/src/errors/index.ts`
- `packages/core/src/observability/index.ts`
- `packages/core/src/privacy/index.ts`

The fix replaced trim/collapse regex normalizers with deterministic character-by-character token normalization.

### Commit `99e7c9b` - local only

Commit: `Reduce Sonar follow-up findings`

After `c3a002b`, Sonar reported no open security hotspots, but the quality gate still failed on duplicated-lines density. This local commit:

- extracted shared baseline helpers into `scripts/baseline-utils.mjs`;
- updated `scripts/baseline-local.mjs` and `scripts/perf-baseline.mjs` to use that helper;
- simplified `packages/core/src/observability/index.ts` sanitization helpers;
- changed one privacy regex to concise `\d` syntax;
- changed the Windows-path privacy test literal to `String.raw`.

## Validation Already Run

Before `99e7c9b`, these passed:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:local
pnpm check:memory-data
```

`pnpm validate:local` passed the full local suite, including:

- near-e2e tests;
- `eval:mvp`;
- `eval:v2`;
- `eval:v3`;
- `eval:retrieval`;
- `eval:v4`;
- `eval:v5`;
- `eval:v6`;
- `eval:dogfood-local`;
- `eval:v7`;
- `eval:answers`;
- `eval:v8`;
- `test:browser` with 21 Chromium tests.

Run `pnpm check:memory-data` again before any new staging/commit/push operation.

## Remote PR Status

Last checked with GitHub connector, `gh pr checks`, and a read-only explorer subagent.

### PR #111

URL: `https://github.com/jcardonnet/assisto/pull/111`

Status:

- open;
- draft;
- mergeable;
- base `main` at `2feb2b3`;
- head `codex/w0-parallel-synthesis` at `3eb9f36`;
- checks green:
  - `Validation Matrix` pass;
  - `SonarCloud` pass;
  - `SonarCloud Code Analysis` pass.

### PR #112

URL: `https://github.com/jcardonnet/assisto/pull/112`

Status:

- open;
- draft;
- mergeable;
- base `codex/w0-parallel-synthesis` at `3eb9f36`;
- remote head `codex/w1-contract-scaffolds` at `c3a002b`;
- local head is `99e7c9b`, not pushed yet;
- remote checks still reflect `c3a002b`:
  - `SonarCloud` pass;
  - `SonarCloud Code Analysis` fail;
  - no `Validation Matrix` check reported by `gh pr checks`.

The remote Sonar failure on `#112` may be stale relative to local work because `99e7c9b` has not been pushed.

## Resume Plan

When the user says to resume:

1. Re-check local state.

```bash
git status --short --branch
git log --oneline --decorate -8
pnpm check:memory-data
```

2. Confirm `99e7c9b` is still the only unpushed commit on `codex/w1-contract-scaffolds`.

```bash
git log --oneline origin/codex/w1-contract-scaffolds..codex/w1-contract-scaffolds
```

3. Push the local follow-up commit.

```bash
git push origin codex/w1-contract-scaffolds
```

4. Wait for PR `#112` checks and Sonar to rerun against `99e7c9b`.

Useful commands:

```bash
gh pr checks 112
```

If Sonar still fails, inspect live Sonar issues before patching. Do not assume the prior duplication failure is still current after the push.

5. Merge stack in order after checks are green and drafts are ready:

- mark PR `#111` ready for review;
- merge PR `#111` into `main`;
- retarget PR `#112` to `main` if needed after `#111` merges;
- re-check PR `#112` checks;
- mark PR `#112` ready for review;
- merge PR `#112`.

This repository may expect Trunk-managed merge behavior. Prior PR comments indicated `/trunk merge` can be used. Prefer the repo's current merge policy over forcing a direct merge.

6. After merge and synced `main`, refresh Mixedbread:

```bash
git switch main
git pull --ff-only origin main
pnpm check:memory-data
pnpm mxbai:upload
pnpm mxbai:smoke
```

## Subagent Use

The user explicitly requested subagents to parallelize work whenever possible without risking quality.

Recommended safe parallelization on resume:

- one read-only explorer checks PR `#111`/`#112` status and merge policy;
- one read-only explorer checks current Sonar issues for PR `#112` after the push;
- parent agent keeps ownership of local git operations, staging, push, and merge sequencing.

Do not delegate overlapping code edits unless write scopes are disjoint.

## Mixedbread Retrieval Note

Mixedbread was used as a wayfinder for this handoff. Relevant docs found:

- `docs/wsl2-handoff.md`;
- `docs/refactor/codex-agent-ops.md`;
- `docs/superpowers/plans/2026-06-01-agent-acceleration-control-plane.md`;
- `docs/implementation-plan.md`;
- `docs/revised-design.md`.

Local files and live git/PR state are authoritative over search snippets.
