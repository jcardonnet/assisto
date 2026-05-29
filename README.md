# Work Memory Assistant

A local-first, markdown-backed work-memory assistant inspired by Karpathy-style LLM Wikis.

The project is designed to run with:

- **Obsidian** as the canonical markdown UI/store;
- **Pi Agent Harness** as the interactive runtime environment;
- an optional OpenAI-compatible extraction provider configured by environment;
- **Codex Pro** as the implementation agent;
- **Git** as the audit, rollback, and review layer.

The first implementation is intentionally small. It is not a general autonomous memory system. It is a source-backed markdown mutation loop with transactions, validation, conservative follow-up extraction, and review staging.

## Core idea

The assistant ingests messy work inputs:

```text
Joe is the DBA. We use MySQL.
Mike is my manager. He is a Java generalist with CRM experience.
I started new job this Monday as an AI Engineer at SmartEquip.
Today I talked with Joe about pgvector for storing CLIP embeddings.
How should I explain Joe and Mike the difference between Solr and Qdrant?
```

It turns them into durable, inspectable markdown state:

```text
Raw input
→ Event
→ Candidate claims
→ Transaction
→ Validated mutation or staged review
→ Current pages
```

Markdown files are canonical. Search indexes, caches, embeddings, graphs, and runtime state are derived.

## MVP scope

The MVP includes:

- Events
- People
- Contexts
- Topics
- FollowUps
- ReviewItems
- Transactions
- Logs
- schema validation
- lexical retrieval and wikilinks

The MVP defers:

- vector search;
- graph database;
- MCP integration;
- autonomous entity merges;
- autonomous contradiction resolution;
- standalone Decision pages;
- standalone OpenQuestion pages;
- standalone Explanation pages;
- full meeting transcript ingestion;
- autonomous background linting.

## Repository layout

```text
work-memory-assistant/
  AGENTS.md
  README.md

  docs/
    revised-design.md
    implementation-plan.md
    decisions.md

  memory/
    schema/
      conventions.md
      statuses.md
      relation-types.md
      validators.md
    events/
    people/
    contexts/
    topics/
    followups/
    review/
    transactions/
      pending/
      applied/
      rejected/
      failed/
    logs/
    indexes/
      README.md

  packages/
    core/
    cli/
    pi-extension/
    workbench/

  .pi/
    extensions/
      work-memory/
        index.ts
    skills/
      work-memory-ingest/
        SKILL.md
      work-memory-retrieve/
        SKILL.md
      work-memory-review/
        SKILL.md
      work-memory-lint/
        SKILL.md
    prompts/
      ingest.md
      ask.md
      review-inbox.md
      apply-transaction.md
      lint.md

  tests/
    fixtures/
    scenarios/
    golden/
```

## Safety invariants

1. No direct canonical writes from ingestion logic.
2. Every multi-file mutation goes through a transaction.
3. Every durable claim cites at least one Event ID.
4. Unknown system/project/context scope is staged.
5. Committed follow-ups require explicit trigger phrases.
6. Ambiguous entities are staged.
7. People and topics are not auto-merged.
8. Contradictions are detected and staged, not resolved automatically.
9. Summaries are generated views, not canonical truth.
10. Validation runs before transactions are applied.

## MVP object types

| Object | Purpose |
|---|---|
| Event | Immutable evidence unit. |
| Person | Current-state page for people, roles, explicit facts, interactions, and staged inferences. |
| Context | Umbrella scope for project, system, team, client, environment, or bounded work context. |
| Topic | Work-relevant technical or business concept. |
| FollowUp | Candidate or committed action. |
| ReviewItem | Ambiguity, contradiction, duplicate candidate, unscoped claim, stale item, unsafe inference. |
| Transaction | Auditable multi-file mutation proposal/application record. |
| LogEntry | Append-only operational trace. |

## State model

Top-level objects use:

```yaml
object_state: active | archived
review_state: none | staged | reviewed | contested
```

Claims use:

```yaml
claim_state: active | staged | superseded | rejected
claim_kind: fact | inference | assumption | preference | commitment
evidence_strength: explicit | inferred | weak
scope_state: complete | partial | unknown
```

Temporal fields:

```yaml
recorded_at: <when the memory system recorded it>
observed_at: <when the event happened, if known>
valid_from: <when the claim became true, if known>
valid_to: <when the claim stopped being true, if known>
```

## Development workflow

Use Codex in small tasks:

1. Scaffold repo.
2. Implement core domain types.
3. Implement markdown/frontmatter parsing.
4. Implement validators.
5. Implement transaction engine.
6. Implement deterministic follow-up, staging, and entity-resolution policies.
7. Implement CLI.
8. Implement MVP eval harness.
9. Implement Pi extension wrapper.
10. Add optional OpenAI-compatible candidate extraction after deterministic tests pass.

Do not ask Codex to invent the architecture while coding. Give it a narrow task, allowed file scope, invariants, and tests.

## Setup

Install dependencies:

```bash
pnpm install
```

Run the scaffold checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
pnpm eval:retrieval
pnpm eval:v4
pnpm eval:v5
pnpm eval:v6
pnpm eval:dogfood-local
pnpm test:browser
```

For WSL/Codex local validation, prefer the environment-hardened wrapper:

```bash
pnpm validate:local
```

It runs the full suite with Linux temp variables (`TMPDIR=/tmp`, `TEMP=/tmp`, and `TMP=/tmp`) so Node and test vaults do not fall back to read-only Windows temp paths. To mirror the GitHub Actions order exactly, run:

```bash
pnpm validate:ci-parity
```

Useful narrower test commands:

```bash
pnpm test:unit
pnpm test:integration
```

`pnpm test:browser` runs Chromium-only Playwright tests for Workbench DOM flows.

Useful environment and PR workflow helpers:

```bash
pnpm env:doctor
pnpm check:memory-data
wm doctor memory-data
pnpm pr:review-wait <pr-number-or-url>
pnpm pr:closeout <pr-number-or-url>
pnpm agent:pr status <pr-number-or-url>
pnpm agent:ci-local --plan
pnpm agent:map query workbench
pnpm agent:workbench serve
```

`pnpm env:doctor` checks local Node/pnpm/temp/GitHub/Mixedbread/Playwright/localhost readiness. `pnpm check:memory-data` fails if a branch accidentally stages, modifies, or commits `memory/events/**` or `memory/transactions/**` unless `ASSISTO_ALLOW_MEMORY_DATA_CHANGES=1` or `--allow` is used. Untracked Event/Transaction files are reported separately as dogfood user data. `wm doctor memory-data` is a read-only CLI wrapper for the same guard, and [Dogfood Vault Hygiene](docs/dogfood-vault-hygiene.md) explains the dev repo vs personal vault boundary. `pnpm pr:closeout` delegates to the Agent Control Plane PR state machine: it performs the delayed review-thread check, records review snapshots, verifies mergeability, CI, validation state, and memory-data guard status, and can merge/sync/refresh Mixedbread only when called with explicit merge flags.

Use `pnpm agent:validate` for fast policy-selected local confidence. Use `pnpm agent:ci-local --plan` before large PRs or after sandbox/browser failures to see the Docker/devcontainer CI capsule; `pnpm agent:ci-local` builds the Node 22/pnpm 9.15.4 capsule, installs Playwright Chromium, passes through GitHub/Mixedbread/OpenAI credentials, and runs `pnpm validate:ci-parity`. GitHub Actions remains the authoritative remote CI gate.

Use `pnpm agent:map build` and `pnpm agent:map query "<area>"` to map source areas to relevant tests, evals, docs, invariants, and public commands before editing.

Use `pnpm agent:workbench serve` for a local-only development control surface over agent run state, validation, diagnostics, PR state, repo map, and handoff. It is separate from the product Workbench and does not write product memory.

The current implementation includes deterministic ingestion, a first-run Activation Wizard, a Personal Seed Kit, a Capture Console for daily note entry, curated Markdown/text backfill import with `source_hash` dedupe and Workbench triage, a Today Home daily loop, a candidate extraction pipeline, optional OpenAI-compatible extraction/drafting that still stays behind deterministic policy, transaction-backed review item state changes, Event reprocessing, safe claim upserts, People/Topics/Contexts stewardship, Context dashboards and operating pages, retrieval intent planning, lexical retrieval, derived session briefs, deterministic memory health checks, CLI and Pi adapters, a local Workbench, Playwright browser coverage, and MVP/v2/v3/retrieval/v4/v5/v6 deterministic evals. `packages/core` owns deterministic memory semantics, `packages/cli` wraps those semantics for local commands, `packages/pi-extension` remains a thin runtime adapter, and `packages/workbench` exposes a local browser UI over derived markdown snapshots.

For personal dogfooding, add local questions to `.assisto-local/eval/questions.json` and run:

```bash
wm dogfood eval --json
pnpm eval:dogfood-local
```

The question file is noncanonical local state. It can include expected claim IDs, Event IDs, page paths, ReviewItem IDs, FollowUp IDs, and tags; the evaluator scores deterministic retrieval against those expectations without writing to `memory/`.

## Workbench

Start the local Workbench:

```bash
wm workbench serve
```

The server binds to `127.0.0.1:3721` by default. Override only when needed:

```bash
wm workbench serve --host 127.0.0.1 --port 3721
```

For a practical dogfood path, see [docs/first-week-with-assisto.md](docs/first-week-with-assisto.md).

Workbench endpoints under `/api/*` expose Activation status, Use-Assisto-Tomorrow first-day guidance, Daily Queue, local Daily Session state, Morning, End-day, Meeting, and After-meeting workday modes, Today Home, Capture Inbox, seed preview/create, capture preview/create, import preview/create/triage/session lookup, People/Topics/Contexts listing, detail, and Context dashboards, entity/context note stewardship staging, review inbox, transaction summaries and details, retrieval query/session results, follow-ups, derived session briefs, and a health summary. Review resolution and stewardship actions are human-triggered and transaction-backed: previews run against a temporary copy of `memory/`, while seed/create, capture/create, import/create, apply/mark/reprocess, alias/context/context-note stewardship, friction logging, and explicit health staging actions create Events and/or pending Transactions through core helpers. The Today tab includes a focused Daily Queue for one-at-a-time preview/apply/reject/reprocess/stage decisions, a derived first-run Activation Wizard, a read-only Use-Assisto-Tomorrow checklist, local daily session progress from `.assisto-local/daily/session.json`, disposable workday mode previews, pending Transactions, staged ReviewItems, stale NOOP Events, open FollowUps, recent Events, recent decisions, recent friction logs, health/read warnings, and suggested manual actions; quick actions call the existing preview/apply/reject/reprocess endpoints. Today exposes a derived triage-complete state for zero pending/staged/stale items and a stricter daily-review-complete state when follow-ups and warnings are also clear. The Capture tab shows recent Events, pending capture Transactions, source-label presets, observed-at shortcuts, recent Context suggestions, reusable templates, and preview guidance for why a capture was staged, whether it needs Context, and the likely next review action before creating the Event plus pending Transaction; it also includes the Personal Seed Kit for role, manager/team, project/context, people, topic, open-loop, and memory-gap setup. The Import tab previews pasted batches or local Markdown/text paths, splits pasted batches on `---`, supports triage split/merge/skip/metadata/context assignment, estimates review load, shows likely safe/staged/conflict/duplicate counts, summarizes extraction per unit, records ignored local sessions under `.assisto-local/import-sessions/`, uses `source_hash` to skip duplicates, and creates pending Transactions only. `.assisto-local/**` is noncanonical UI/session state and can be deleted without corrupting memory. The People/Topics/Contexts tab inspects aliases, active/staged/superseded claims, evidence Events, linked ReviewItems, FollowUps, related pages, and Context dashboards and operating pages with decisions-as-claims, open questions-as-claims, owners, roles, and recent changes; alias, Context, and Context note/correction changes are staged as pending Transactions and ambiguous links become ReviewItems. The Ask tab renders deterministic query intent, planned lookups, citation explorer, matched-page/source-Event previews, pinned local questions under `.assisto-local/retrieval/questions.json`, what memory can and cannot confirm, linked review/follow-up actions, missing-memory action previews, retrieval-miss logging, optional ephemeral drafts, and suggested next questions while preserving the raw `contextPack`. The Transactions tab can inspect parsed transaction bodies, proposed file writes, validation results, source Events, affected files, and application/rejection notes; explicit apply/reject actions call core transaction helpers and never bypass validation. The browser UI groups review items by `review_reason`, surfaces suggested manual actions, and renders action previews and created results with operations, affected files, source Events, and proposed file writes instead of relying on raw JSON. Briefs are disposable derived views for today, before-meeting person prep, project/context status, follow-up review, review risk, and recent changes; Today, Ask, and entity detail quick links open relevant briefs without persisting generated explanations.

`pnpm test:e2e` includes a browser-style Workbench HTTP flow that loads the shell/assets and exercises Today, capture, import, review triage, staged claim application, Event reprocessing, Ask, Health, and Brief endpoints. `pnpm test:browser` adds DOM-level Chromium coverage for Today Home, Capture, Import/triage, Entities/Context pages, Review, Transactions, Ask/drafts/friction, Health, and Briefs. `pnpm eval:v4` gates the same v4 safety shape: no unsafe canonical writes, no generated persistence, no autonomous supersession, no Event raw text rewrites, cited derived output, review flow success, health detection, no-match guidance, and session brief generation. `pnpm eval:v5` gates dogfood readiness across capture, OpenAI-style provider fallback, duplicate import prevention, Today triage, entity stewardship, cited retrieval, and disposable briefs. `pnpm eval:v6` gates the activated daily loop: Dogfood Home read-only behavior, global capture, Review Turbo lanes, mocked answer drafts, friction logging, import triage, duplicate prevention, Context dashboards and operating pages, cited answer coverage, and the same no-unsafe-write invariants.

Capture daily notes from the CLI:

```bash
wm capture "Joe is the DBA. We use MySQL."
wm capture --dry-run --observed-at 2026-05-21 --source-label standup --context ctx_inventory_project "Joe is the DBA."
wm capture --file ./daily-note.md --source-label daily-note
```

Import curated Markdown/text backfill from the CLI:

```bash
wm import notes --path ./curated-notes --glob "*.md,*.txt" --dry-run
wm import notes --path ./curated-notes --source-label curated-history --limit 50
```

Review the derived daily loop from the CLI:

```bash
wm activate status
wm activate status --json
wm use-tomorrow
wm use-tomorrow --json
wm seed kit --file docs/seed-kit-template.md --dry-run
wm today
wm today --json
wm daily queue
wm daily queue --json
wm daily session
wm daily session --json
wm mode morning
wm mode end-day --json
wm mode meeting per_jeff
wm mode after-meeting ctx_inventory_project --json
wm context dashboard ctx_inventory_project
wm context dashboard ctx_inventory_project --json
```

Run health checks from the CLI:

```bash
wm health check
wm health check --stage-review --note "Weekly manual triage"
```

Build derived session briefs from the CLI:

```bash
wm brief today
wm brief person per_jeff
wm brief context ctx_inventory_project
wm brief review
wm brief followups
wm brief recent
wm brief recent person per_jeff
wm brief recent context ctx_inventory_project
```

## Required commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

`pnpm eval:mvp` runs a deterministic MVP eval harness. It does not call GPT or any external model.

## Review Guidelines

When requesting Codex PR review, ask it to prioritize behavioral regressions, corruption risks, and missing tests. Codex should flag as P1 any change that:

- bypasses Transactions;
- writes active claims without Event evidence;
- promotes unscoped system/project/context claims;
- creates committed FollowUps without explicit trigger phrases;
- adds vector, graph DB, or MCP dependencies to MVP code;
- auto-merges people or topics;
- auto-resolves contradictions;
- deletes memory instead of staging, rejecting, or archiving;
- writes to `.obsidian/`.

## Codex PR Workflow

Use this PR process for MVP changes:

1. Create a task-scoped branch.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm eval:mvp`.
3. Open a PR with a concise summary, validation results, and known limitations.
4. Request `@codex` review.
5. Wait 3-5 minutes before the first review-thread check so Copilot has time to finish. For large PRs, wait 8-10 minutes.
6. If Copilot reports a transient review error or no threads are present, wait one more short interval and re-check before classifying it as non-actionable.
7. Fix P0/P1 findings only unless a human reviewer explicitly asks for broader cleanup.
8. Merge only after human inspection confirms the transaction, validation, and review invariants still hold.

The delayed review check can be run with:

```bash
pnpm pr:review-wait <pr-number-or-url>
```

If the helper reports no unresolved review threads after the retry window and CI is green, a Copilot review failure can be treated as non-actionable.

Before merge, run:

```bash
pnpm check:memory-data
```

The guard blocks staged, unstaged, and committed guarded memory changes. Untracked `memory/events/**` and `memory/transactions/**` files are shown as local dogfood data so they can be preserved without being staged into product PRs.

After merge, refresh Mixedbread with compact output:

```bash
pnpm mxbai:upload
pnpm mxbai:smoke
```

Use `MXBAI_SMOKE_VERBOSE=1 pnpm mxbai:smoke` to print full search result tables.

## Acceptance thresholds

```text
Committed follow-up precision >= 95%
Duplicate-person false merge rate = 0%
Unscoped system claims auto-promoted = 0%
Source citation coverage for factual context packs >= 95%
Transaction validation failure caught before write = 100%
Summary unsupported-claim rate = 0%
Broken-link rate after applied transactions = 0%
```

## MVP eval suites

`pnpm eval:mvp` runs the following deterministic scenario suites:

| Suite | What it measures |
|---|---|
| Ingestion precision benchmark | Rule-based ingest creates Events and pending Transactions, stages unscoped MySQL claims, and keeps query-only inputs as NOOP. |
| Source-event granularity A/B | Raw notes are preserved as source Events with derived claim references, without splitting or losing evidence. |
| Follow-up extraction stress test | Committed follow-up precision on explicit trigger phrases versus discussion/candidate language. |
| Entity resolution torture test | Ambiguous or near-match people are staged rather than merged. |
| Temporal supersession test | Active claims are preferred while superseded claims remain visible only as uncertain audit context. |
| Summary drift test | Summaries remain backed by active claims and unsupported summaries are flagged. |
| Review backlog simulation | Manual linting detects staged review backlog growth; no autonomous background linting is scheduled. |
| Retrieval context packing test | Lexical context packing loads exact people/topics, skips unrelated Events, includes citations, and marks uncertainty. |
| Markdown noise endurance test | Parsers tolerate readable markdown noise, wikilinks, quotes, and unrelated bullets. |
| Multi-file rollback test | Invalid transactions fail validation before canonical writes occur. |

Golden thresholds live in `tests/golden/mvp-eval-thresholds.json`; scenarios live under `tests/scenarios/`.

## Runtime model

| Design concept | Runtime binding |
|---|---|
| Canonical memory | Obsidian-readable markdown under `memory/` |
| Interactive agent | Pi Agent Harness |
| Candidate extraction model | Optional OpenAI-compatible provider via `OPENAI_API_KEY` and `ASSISTO_OPENAI_MODEL` |
| Implementation agent | Codex Pro |
| Audit/versioning | Git |
| Workflow instructions | `AGENTS.md`, `.pi/skills`, `.pi/prompts` |
| Deterministic semantics | `packages/core` |
| Command surface | `packages/cli` |
| Pi integration | `packages/pi-extension` / `.pi/extensions/work-memory` |

## Pi extension wrapper

The Pi wrapper lives at `.pi/extensions/work-memory/index.ts` and delegates to `packages/pi-extension`.

It registers these tools:

```text
wm_validate
wm_ingest_note
wm_capture_note
wm_list_transactions
wm_show_transaction
wm_apply_transaction
wm_reject_transaction
wm_review_inbox
wm_list_review_items
wm_show_review_item
wm_mark_review_item
wm_review_apply_staged
wm_events_reprocess
wm_pack_context
wm_lint
```

It registers these commands:

```text
/wm-ingest
/wm-capture
/wm-review
/wm-review-show
/wm-review-mark
/wm-review-apply
/wm-event-reprocess
/wm-apply
/wm-ask
/wm-validate
/wm-lint
```

The wrapper preserves MVP transaction invariants. Direct writes to `memory/people/`, `memory/topics/`, `memory/contexts/`, and `memory/followups/` are blocked unless invoked through `wm_apply_transaction`; `.obsidian/` writes are blocked; writes outside `memory/` and `.pi/` produce warnings. Capture, ingest, review apply, and Event reprocess commands create pending Transactions only. The optional `openai` extraction provider is candidate-only and requires `OPENAI_API_KEY` plus `ASSISTO_OPENAI_MODEL`; it does not implement MCP, vector search, separate memory semantics, autonomous merges, or autonomous background linting.

## Pi prompt templates

Common Pi command prompts live under `.pi/prompts/`:

| Template | Command | Tool |
|---|---|---|
| `.pi/prompts/ingest.md` | `/ingest <note>` | `wm_ingest_note` |
| `.pi/prompts/capture.md` | `/capture <note>` | `wm_capture_note` |
| `.pi/prompts/ask.md` | `/ask <question>` | `wm_pack_context` |
| `.pi/prompts/review-inbox.md` | `/review-inbox` | `wm_review_inbox` |
| `.pi/prompts/apply-transaction.md` | `/apply-transaction <tx-id>` | `wm_apply_transaction` |
| `.pi/prompts/reject-transaction.md` | `/reject-transaction <tx-id> <reason>` | `wm_reject_transaction` |
| `.pi/prompts/lint.md` | `/lint` | `wm_lint` |

Each template repeats the relevant safety constraints: no direct canonical edits, writes route through Transactions, no vector/graph/MCP behavior, no autonomous merges or contradiction resolution, and no generated explanation persistence unless explicitly saved.

## Pi skills

Pi workflow skills live under `.pi/skills/`:

| Skill | Purpose |
|---|---|
| `.pi/skills/work-memory-ingest/SKILL.md` | Safely ingest short notes as Event plus pending Transaction. |
| `.pi/skills/work-memory-retrieve/SKILL.md` | Pack deterministic lexical context without GPT calls or generated persistence. |
| `.pi/skills/work-memory-review/SKILL.md` | Review, apply, or reject Transactions without bypassing validation. |
| `.pi/skills/work-memory-lint/SKILL.md` | Run manual lint checks that stage ReviewItems only. |

All skills forbid direct canonical writes, unscoped claim promotion, committed follow-ups without triggers, entity auto-merge, contradiction auto-resolution, and unsaved generated explanations.

## Current status

This repository has a deterministic markdown/transaction core, Workbench UI, Pi wrapper, evals, and an optional OpenAI-compatible candidate extraction provider. The provider is never authoritative: malformed output, unsafe follow-ups, ambiguous entities, generated explanations, unscoped system facts, and validation failures are staged for review instead of becoming canonical truth.
