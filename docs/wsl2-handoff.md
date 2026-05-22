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
- Core domain types, markdown parsing, validators, safe fs/vault utilities, transactions, deterministic policies, ingestion, CLI, lexical retrieval, lint, eval harness, Pi extension, Pi skills/prompts, and optional LLM extraction boundary exist.
- Pi extension entrypoint exports a default factory function and native Pi command/tool adapter.
- Skill files have required YAML frontmatter.
- Rule-based ingestion now recognizes first-person job utterances like "I started new job this monday as a AI Engineer at SmartEquip".

Before changing behavior, inspect the current git status and preserve unrelated user changes.
Run validation after code changes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm eval:mvp when touching ingestion, validation, transactions, follow-ups, retrieval, entity resolution, linting, or evals.

Recommended next feature:
Refactor extraction into a candidate pipeline: sentence/span detection -> detector proposals -> entity resolution -> policy/staging -> transaction builder. Detectors should emit candidate data, not markdown writes.
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
pnpm eval:mvp
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

At handoff time, the Windows working tree had these relevant modified files:

```text
README.md
packages/core/src/ingest/index.ts
tests/core-ingest.mjs
tests/scenarios/run-mvp.mjs
```

It also had untracked runtime memory files:

```text
memory/events/2026/
memory/transactions/pending/tx_2026_05_20_001.md
memory/transactions/pending/tx_2026_05_20_002.md
```

Treat those memory files as user data until inspected. Do not delete or revert them without explicit approval.

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

Main path:

```text
packages/core/src/ingest/index.ts
```

`ingestNote()` currently:

1. normalizes the note;
2. creates Event and Transaction IDs;
3. infers simple observed dates;
4. runs `extractCandidates()`;
5. writes the Event;
6. writes a pending Transaction;
7. applies only if `options.apply === true`.

Current hard-coded detectors include:

- Joe role claim: `Joe is the DBA`.
- First-person employment claim: `I started ... job ... as ROLE at ORG`.
- MySQL usage claim: `We use MySQL`, staged because scope is unknown.
- Mike profile facts from the MVP fixtures.
- Discussion event: `Today I talked with PERSON about TOPIC...`.
- Follow-up detection through deterministic policy rules.

Known limitation:

- Extraction, policy, page rendering, and transaction draft creation are still coupled inside `ingest/index.ts`.
- The extractor is not yet general-purpose natural-language extraction.

## Recommended Next Extractor Refactor

Refactor toward this pipeline:

```text
Raw note
-> normalized spans
-> detector proposals
-> entity resolution
-> deterministic policy/staging
-> transaction draft builder
-> validation/application
```

Suggested new modules:

```text
packages/core/src/ingest/candidates.ts
packages/core/src/ingest/detectors.ts
packages/core/src/ingest/entity-resolution.ts
packages/core/src/ingest/transaction-builder.ts
```

Detector output should be neutral candidate data, for example:

```ts
interface ExtractedClaimCandidate {
  source_text: string;
  entity_kind: "person" | "topic" | "context" | "system";
  entity_name: string;
  statement: string;
  claim_kind: "fact" | "inference" | "assumption" | "preference" | "commitment";
  evidence_strength: "explicit" | "inferred" | "weak";
  scope: string | null;
  scope_state: "complete" | "partial" | "unknown";
  observed_at: string | null;
  valid_from: string | null;
}
```

Rules:

- Detectors must not write markdown.
- Detectors must not create canonical pages.
- LLM output, when enabled, should emit the same candidate shape.
- Deterministic validators and staging policies remain authoritative.

## Validation Baseline

The latest Windows validation passed with:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

On Windows, `pnpm` was invoked through:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" lint
```

In WSL2, use normal `pnpm` after enabling Corepack.

## Operational Cautions

- Do not run destructive Git commands such as `git reset --hard`.
- Do not delete `memory/` files unless explicitly approved.
- Do not commit local runtime caches, `.codex/`, `.agents/`, `node_modules/`, or Pi runtime cache/session folders.
- `.gitignore` is intended to keep caches out while preserving `.pi/skills`, `.pi/prompts`, and `.pi/extensions`.
- If Pi reports extension-loader or autocomplete issues, inspect `.pi/extensions/work-memory/index.ts` and `packages/pi-extension/src/index.ts` before changing core semantics.
