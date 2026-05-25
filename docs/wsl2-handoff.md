# WSL2 Handoff

Use this document to continue the work-memory assistant from a WSL2 checkout.

## Prime Prompt

Paste this into the new WSL2 Codex/Pi thread:

```text
You are continuing work on the Assisto work-memory assistant in WSL2.

Read first:
- AGENTS.md
- README.md
- docs/revised-design.md
- docs/implementation-plan.md
- docs/decisions.md
- docs/wsl2-handoff.md

Project invariant:
- Canonical state lives under memory/.
- Ingestion may create Events and pending Transactions.
- Canonical memory pages must not be written directly from ingestion.
- Multi-file mutations go through Transactions.
- Durable claims must cite Event IDs.
- Unknown system/project/context scope must be staged.
- Do not implement vector search, graph DB, MCP, autonomous merges, autonomous contradiction resolution, autonomous background linting, full transcript ingestion, or direct canonical writes from ingestion.

Current implementation status:
- TypeScript pnpm monorepo is scaffolded.
- Core domain types, markdown parsing, validators, safe fs/vault utilities, transactions, deterministic policies, candidate-pipeline ingestion, provider-ready LLM extraction, CLI, lexical retrieval, lint, eval harness, Pi extension, Pi skills/prompts, review workflow support, and CI exist.
- Pi extension entrypoint exports a default factory function, native Pi command/tool adapter, write guard, and review item tools.
- Skill files have required YAML frontmatter.
- Rule-based ingestion now recognizes first-person job utterances like "I started new job this monday as a AI Engineer at SmartEquip".
- Testing is split into `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm eval:mvp`, `pnpm eval:v2`, and `pnpm eval:v3`; `pnpm test` runs unit plus integration.
- GitHub Actions CI is at `.github/workflows/ci.yml` and runs lint, typecheck, test, test:e2e, eval:mvp, eval:v2, and eval:v3 on push/PR to main.

Before changing behavior, inspect the current git status and preserve unrelated user changes.
Run validation after code changes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e for CLI/Pi/review workflow changes
- pnpm eval:mvp when touching ingestion, validation, transactions, follow-ups, retrieval, entity resolution, linting, or evals.
- pnpm eval:v2 when touching v2 extraction, context staging, review workflow, retrieval, or evals.
- pnpm eval:v3 when touching deterministic detectors, safe upserts, review application, Event reprocessing, or v3 evals.

Recommended next feature:
Expand reviewed resolution flows and detector coverage from real notes while keeping provider output as candidate data only.
```

## WSL2 Bootstrap

From WSL2, prefer working inside the Linux filesystem, for example:

```bash
cd ~/assisto
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
```

If cloning from the Windows working tree, check line endings before committing. The Windows repo has shown LF-to-CRLF warnings. Prefer Git settings that keep repo text stable in WSL2.

## Repo Layout

```text
packages/core          deterministic memory semantics
packages/cli           local wm executable wrapper
packages/pi-extension  Pi runtime adapter
.pi/extensions         Pi extension entrypoint
.pi/skills             Pi workflow skills
.pi/prompts            Pi prompt templates
memory/                canonical markdown vault
tests/                 deterministic unit/integration/eval tests
```

## Current Git/State Notes

Latest pushed commits on `main`:

```text
3494a16 Add CI validation workflow
4cae8ec Finished V2
```

Current expected state after pulling `origin/main`:

```text
git status --short --branch
## main...origin/main
```

Historical caution: earlier handoffs had untracked runtime `memory/events/2026/` and pending transaction files. Treat any local `memory/` files as user data until inspected. Do not delete or revert them without explicit approval.

## Recent Fixes To Preserve

### Pi Extension Loader

Files:

```text
.pi/extensions/work-memory/index.ts
packages/pi-extension/src/index.ts
tests/pi-extension.mjs
```

Important behavior:

- `.pi/extensions/work-memory/index.ts` exports a default factory and named `factory`.
- Native Pi APIs are detected through `api.on`.
- Native command registration uses `registerCommand("wm-apply", options)` instead of passing a command object.
- Autocomplete completions are normalized so `value`, `label`, and `description` are strings.
- Direct canonical writes are blocked through the Pi `tool_call` guard.

This addressed Pi crashes like:

```text
TypeError: value.startsWith is not a function
```

### Pi Skills

Files:

```text
.pi/skills/work-memory-ingest/SKILL.md
.pi/skills/work-memory-lint/SKILL.md
.pi/skills/work-memory-retrieve/SKILL.md
.pi/skills/work-memory-review/SKILL.md
```

Each skill now has required YAML frontmatter:

```yaml
---
name: ...
description: ...
---
```

### First-Person Job Extraction

Files:

```text
packages/core/src/ingest/index.ts
tests/core-ingest.mjs
tests/scenarios/run-mvp.mjs
README.md
```

The rule-based extractor now handles:

```text
I started new job this monday as a AI Engineer at SmartEquip
```

Expected proposed claim:

```text
claim_id: clm_user_job_ai_engineer_smartequip
statement: User started a new job at SmartEquip as an AI Engineer.
scope: SmartEquip
scope_state: complete
valid_from: 2026-05-18
```

This is proposed in `memory/people/user.md` through a pending Transaction, not written directly to canonical memory.

## Current Extractor Shape

Main orchestrator:

```text
packages/core/src/ingest/index.ts
```

Candidate pipeline modules:

```text
packages/core/src/ingest/candidates.ts
packages/core/src/ingest/detectors.ts
packages/core/src/ingest/entity-resolution.ts
packages/core/src/ingest/transaction-builder.ts
```

`ingestNote()` currently:

1. normalizes the note;
2. creates Event and Transaction IDs;
3. infers simple observed dates;
4. runs detector proposals;
5. resolves entities and scope;
6. applies deterministic staging policy;
7. builds proposed transaction writes;
8. writes the Event;
9. writes a pending Transaction;
10. applies only if `options.apply === true`.

Current hard-coded detectors include:

- Joe role claim: `Joe is the DBA`.
- First-person employment claim: `I started ... job ... as ROLE at ORG`.
- MySQL usage claim: `We use MySQL`, staged because scope is unknown.
- Mike profile facts from the MVP fixtures.
- Discussion event: `Today I talked with PERSON about TOPIC...`.
- Follow-up detection through deterministic policy rules.

Known limitation:

- The extractor is not yet general-purpose natural-language extraction.
- Detector coverage is intentionally narrow and should be expanded with tests/evals first.

## V2 Foundation To Preserve

Implemented v2 foundation:

```text
Raw note / provider output
-> normalized candidate data
-> entity and scope resolution
-> deterministic policy/staging
-> transaction builder
-> pending transaction
-> explicit apply
```

Important behavior:

- Detectors emit candidate data only; they do not write markdown.
- Provider-ready LLM extraction in `packages/core/src/extraction/index.ts` converts provider output into the same candidate pipeline.
- `LlmExtractionProvider` remains provider-ready/stubbed unless a caller supplies a client; do not add live network/API-key behavior without a separate plan.
- Provider hints can only increase caution; deterministic resolver/policy remains authoritative.
- Existing Context exact/alias matches can scope claims; new, near-match, ambiguous, or unknown contexts stage ReviewItems.
- Review item state changes are transaction-backed through `packages/core/src/review/index.ts`, CLI review commands, and Pi review tools.
- Retrieval remains lexical and alias-aware; vector search remains deferred.

CI:

```text
.github/workflows/ci.yml
```

The workflow uses Node 22 and pnpm 9.15.4, then runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
```

## Validation Baseline

Latest local validation passed with:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
```

In this WSL2 shell, commands may need temp/cache environment variables if Corepack tries to use Windows paths:

```bash
env COREPACK_HOME=/tmp/corepack LOCALAPPDATA=/tmp XDG_CACHE_HOME=/tmp TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm <script>
```

Repo-local Git email was set to the GitHub noreply address to avoid push rejection:

```text
931057+jcardonnet@users.noreply.github.com
```

## Operational Cautions

- Do not run destructive Git commands such as `git reset --hard`.
- Do not delete `memory/` files unless explicitly approved.
- Do not commit local runtime caches, `.codex/`, `.agents/`, `node_modules/`, or Pi runtime cache/session folders.
- `.gitignore` is intended to keep caches out while preserving `.pi/skills`, `.pi/prompts`, and `.pi/extensions`.
- If Pi reports extension-loader or autocomplete issues, inspect `.pi/extensions/work-memory/index.ts` and `packages/pi-extension/src/index.ts` before changing core semantics.
