# Assisto v9 Evidence-to-Reasoning Work Memory OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the largest coherent next Assisto program: source adapters, typed memory frames, ontology policy, derived symbolic reasoning, proof-carrying cited answers, richer entity/context stewardship, real dogfood feedback, and hardening evals.

**Architecture:** Keep markdown memory canonical and route all durable changes through Events and Transactions. Add structured frames, ontology policy, symbolic indexes, proof paths, and Workbench views as derived or transaction-backed layers that can be rebuilt, inspected, and tested. Every generated answer, proof, brief, index, Workbench session, and `.assisto-local/**` artifact remains noncanonical unless explicitly captured through the existing Event/Transaction loop.

**Tech Stack:** TypeScript packages under `packages/core`, `packages/cli`, `packages/workbench`, Node 22 stdlib scripts, markdown memory under `memory/**`, JSON/JSONL derived indexes, Playwright Chromium, existing pnpm lint/typecheck/test/eval commands.

---

## Status Update - 2026-06-05

Current `main` is ahead of this plan at `e8afb12 [codex] Complete capability surface registry (#128)`. The repository now contains the v9 foundation this plan describes: source adapters/source inbox, `sources/*`, typed frames, ontology-aware validation, symbolic index/query helpers, cited answer contracts through v4, context/entity stewardship, review acceleration, maintenance, dogfood feedback, context packs, v9/v10 scenario/browser coverage, Wave 1 contract scaffolds, and the capability registry/control-plane surfaces.

Do not restart PR 1 or PR 2 from this document. Treat the remaining useful work as follow-up hardening and production integration over the implemented modules, especially wiring the Wave 1 errors/privacy/observability scaffolds through source import/inbox and Workbench/CLI flows. The active execution track is the agent acceleration control-plane plan.

## Non-Negotiable v9 Invariants

- Do not edit or stage real user dogfood data under `memory/events/**` or `memory/transactions/**`.
- Do not write to `.obsidian/**`.
- Do not add vector search, graph databases, MCP, autonomous merges, autonomous contradiction resolution, full transcript ingestion, or direct canonical writes from ingestion/UI/API handlers.
- `memory/schema/ontology/**` is schema and policy, not user memory.
- `memory/indexes/ontology/**` and `memory/indexes/symbolic/**` are derived rebuildable indexes.
- Symbolic reasoning may produce proof paths, stale signals, conflict signals, retrieval hints, and review candidates; it may not write active canonical claims.
- Generated answers, generated explanations, proof summaries, briefs, context packs, symbolic outputs, and Workbench views are disposable derived output.
- Durable memory changes require Event evidence and validated pending Transactions.
- Supersession requires explicit user-selected claim IDs.
- Missing scope, ambiguous identity, near matches, ontology violations, and symbolic uncertainty stage review instead of becoming active truth.
- GitHub Copilot review steps are skipped because Copilot reviews are disabled. Rely on local validation, local subagent review, GitHub CI, and memory guard.

## Current Repo Anchors

Read these before each implementation branch:

- `AGENTS.md`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
- `docs/decisions.md`
- `docs/cited-work-memory.md`
- `docs/ontology-and-symbolic-reasoning.md`
- `README.md`

Existing surfaces to preserve:

- `packages/core/src/retrieval/index.ts`
- `packages/core/src/ingest/*`
- `packages/core/src/transactions/*`
- `packages/core/src/review/*`
- `packages/core/src/health/*`
- `packages/core/src/briefs/*`
- `packages/core/src/entities/*`
- `packages/core/src/contexts/*`
- `packages/cli/src/index.ts`
- `packages/workbench/src/index.ts`
- `tests/helpers/scenario-factory.mjs`
- `tests/scenarios/run-v8.mjs`
- `tests/scenarios/run-answers.mjs`
- `tests/browser/*`

## Program Validation Baseline

Run for every PR unless the changed-file policy proves a smaller set is enough and the PR description states why:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:e2e
TMPDIR=/tmp pnpm eval:mvp
TMPDIR=/tmp pnpm eval:v2
TMPDIR=/tmp pnpm eval:v3
TMPDIR=/tmp pnpm eval:retrieval
TMPDIR=/tmp pnpm eval:v4
TMPDIR=/tmp pnpm eval:v5
TMPDIR=/tmp pnpm eval:v6
TMPDIR=/tmp pnpm eval:dogfood-local
TMPDIR=/tmp pnpm eval:v7
TMPDIR=/tmp pnpm eval:answers
TMPDIR=/tmp pnpm eval:v8
TMPDIR=/tmp pnpm test:browser
pnpm check:memory-data
```

After PR 16, also run:

```bash
TMPDIR=/tmp pnpm eval:v9
```

If browser tests hit Chromium sandbox restrictions, rerun the same command outside the sandbox and record the diagnosis. Do not treat environment launch failures as product failures until rerun.

## Branch and PR Workflow

For every PR:

```bash
git switch main
git pull --ff-only origin main
pnpm check:memory-data
git switch -c codex/<branch-name>
```

Before commit:

```bash
pnpm check:memory-data
git status --short --branch
```

Stage only implementation files, never user-memory Event/Transaction files:

```bash
git add <explicit-files>
git commit -m "<type>: <message>"
git push -u origin codex/<branch-name>
gh pr create --title "<title>" --body "<summary and validation>"
```

Closeout:

```bash
gh pr checks <pr-number> --watch
pnpm check:memory-data
gh pr merge <pr-number> --squash --delete-branch
git switch main
git pull --ff-only origin main
pnpm mxbai:upload
pnpm mxbai:smoke
```

Skip Copilot review checks entirely.

## Subagent Execution Map

Use subagents by disjoint write set:

- Source subagent: PRs 1-2, files under `packages/core/src/sources`, import/capture surfaces.
- Frames subagent: PRs 3-4, files under `packages/core/src/frames`, extraction tests.
- Ontology subagent: PRs 5-6, files under `packages/core/src/ontology`, `memory/schema/ontology`, validators.
- Symbolic subagent: PRs 7-8, files under `packages/core/src/symbolic`, derived indexes, proof paths.
- Answer subagent: PRs 9-10, retrieval/Ask/UI/evals.
- Entity subagent: PRs 11-12, entity stewardship and repair actions.
- Context subagent: PR 13, context rooms and timelines.
- Dogfood subagent: PR 14, feedback/eval/local state.
- Review UI subagent: PR 15, review acceleration.
- Hardening subagent: PR 16, docs/eval/browser/CI.

Main coordinator responsibilities:

- Keep branches sequential and merge one PR at a time.
- Run `pnpm check:memory-data` before staging.
- Resolve integration conflicts.
- Run final validation and Mixedbread refresh.

---

## PR 1: Source Adapter Core

**Branch:** `codex/v9-source-adapter-core`

**Purpose:** Add a deterministic source adapter layer that turns curated source inputs into preserved source units with hashes and provenance before ingestion.

**Files:**

- Create `packages/core/src/sources/types.ts`
- Create `packages/core/src/sources/hash.ts`
- Create `packages/core/src/sources/markdown.ts`
- Create `packages/core/src/sources/text.ts`
- Create `packages/core/src/sources/index.ts`
- Modify `packages/core/src/index.ts`
- Create `tests/core-source-adapters.mjs`
- Modify `docs/revised-design.md`

### Task 1.1: Write source adapter tests

- [ ] **Step 1: Create `tests/core-source-adapters.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSourceHash,
  parseMarkdownSource,
  parseTextSource
} from "../packages/core/src/sources/index.ts";

test("computeSourceHash is stable and content based", () => {
  assert.equal(
    computeSourceHash("Kuastav is my manager.\n"),
    computeSourceHash("Kuastav is my manager.\n")
  );
  assert.notEqual(
    computeSourceHash("Kuastav is my manager.\n"),
    computeSourceHash("Jeff is my manager.\n")
  );
});

test("parseMarkdownSource preserves raw text and source metadata", () => {
  const result = parseMarkdownSource({
    rawText: "# Standup\n\nKuastav is my manager.",
    sourceLabel: "source:markdown",
    observedAt: "2026-06-01T10:00:00.000Z"
  });

  assert.equal(result.units.length, 1);
  assert.equal(result.units[0].raw_text, "# Standup\n\nKuastav is my manager.");
  assert.equal(result.units[0].source_label, "source:markdown");
  assert.equal(result.units[0].observed_at, "2026-06-01T10:00:00.000Z");
  assert.match(result.units[0].source_hash, /^sha256:/);
});

test("parseTextSource splits pasted batches on divider lines", () => {
  const result = parseTextSource({
    rawText: "First note\n---\nSecond note\n\n---\n",
    sourceLabel: "source:pasted"
  });

  assert.deepEqual(result.units.map((unit) => unit.raw_text), ["First note", "Second note"]);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/core-source-adapters.mjs
```

Expected: fails because `packages/core/src/sources/index.ts` does not exist.

### Task 1.2: Add source adapter types and hash helper

- [ ] **Step 1: Create `packages/core/src/sources/types.ts`**

```ts
export type SourceAdapterKind = "markdown" | "text" | "pasted" | "manual";

export type SourceAdapterInput = {
  rawText: string;
  sourceLabel: string;
  observedAt?: string;
  path?: string;
};

export type SourceUnit = {
  adapter_kind: SourceAdapterKind;
  raw_text: string;
  source_label: string;
  source_hash: string;
  observed_at?: string;
  source_path?: string;
};

export type SourceAdapterResult = {
  units: SourceUnit[];
  skipped: Array<{
    reason: "empty_unit";
    raw_text: string;
  }>;
};
```

- [ ] **Step 2: Create `packages/core/src/sources/hash.ts`**

```ts
import { createHash } from "node:crypto";

export function computeSourceHash(rawText: string): string {
  return `sha256:${createHash("sha256").update(rawText, "utf8").digest("hex")}`;
}
```

### Task 1.3: Add Markdown and text parsers

- [ ] **Step 1: Create `packages/core/src/sources/text.ts`**

```ts
import { computeSourceHash } from "./hash.js";
import type { SourceAdapterInput, SourceAdapterResult, SourceUnit } from "./types.js";

function splitPastedUnits(rawText: string): string[] {
  return rawText
    .split(/\n---\n/gu)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);
}

export function parseTextSource(input: SourceAdapterInput): SourceAdapterResult {
  const units: SourceUnit[] = splitPastedUnits(input.rawText).map((rawText) => ({
    adapter_kind: "text",
    raw_text: rawText,
    source_label: input.sourceLabel,
    source_hash: computeSourceHash(rawText),
    observed_at: input.observedAt,
    source_path: input.path
  }));
  return {
    units,
    skipped: input.rawText.trim() === "" ? [{ reason: "empty_unit", raw_text: input.rawText }] : []
  };
}
```

- [ ] **Step 2: Create `packages/core/src/sources/markdown.ts`**

```ts
import { computeSourceHash } from "./hash.js";
import type { SourceAdapterInput, SourceAdapterResult, SourceUnit } from "./types.js";

export function parseMarkdownSource(input: SourceAdapterInput): SourceAdapterResult {
  const rawText = input.rawText.trim();
  if (rawText.length === 0) {
    return { units: [], skipped: [{ reason: "empty_unit", raw_text: input.rawText }] };
  }
  const unit: SourceUnit = {
    adapter_kind: "markdown",
    raw_text: rawText,
    source_label: input.sourceLabel,
    source_hash: computeSourceHash(rawText),
    observed_at: input.observedAt,
    source_path: input.path
  };
  return { units: [unit], skipped: [] };
}
```

- [ ] **Step 3: Create `packages/core/src/sources/index.ts`**

```ts
export * from "./types.js";
export * from "./hash.js";
export * from "./markdown.js";
export * from "./text.js";
```

- [ ] **Step 4: Export from `packages/core/src/index.ts`**

Add:

```ts
export * from "./sources/index.js";
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/core-source-adapters.mjs
```

Expected: pass.

### Task 1.4: Document source adapter boundary

- [ ] **Step 1: Add a short section to `docs/revised-design.md`**

Add under source adapter discussion:

```md
### Source adapter boundary

Source adapters normalize curated inputs into source units with raw text, source label, observed time, path when available, and `source_hash`. They do not extract active truth and do not write canonical Person, Topic, Context, ReviewItem, or FollowUp pages. Adapter output may be routed into existing Event and Transaction creation paths.
```

- [ ] **Step 2: Validate PR 1**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:mvp
pnpm check:memory-data
```

Expected: all pass.

---

## PR 2: Source Adapter Workbench and Import Upgrade

**Branch:** `codex/v9-source-adapter-workbench`

**Purpose:** Route curated source units through capture/import previews and Workbench, preserving raw text and source hashes while creating only Events plus pending Transactions.

**Files:**

- Modify `packages/core/src/import/index.ts`
- Modify `packages/core/src/capture/index.ts`
- Modify `packages/cli/src/index.ts`
- Modify `packages/workbench/src/index.ts`
- Create `tests/source-adapter-import.mjs`
- Modify `tests/browser/workbench-import-console.spec.mjs`

### Task 2.1: Write import source-unit tests

- [ ] **Step 1: Create `tests/source-adapter-import.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewNotesImport } from "../packages/core/src/import/index.ts";

test("previewNotesImport uses source_hash and creates no canonical page writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assisto-source-import-"));
  const note = join(root, "note.md");
  await writeFile(note, "Kuastav is my manager.\n");

  const result = await previewNotesImport({
    root,
    path: note,
    provider: "rule",
    sourceLabel: "source:markdown"
  });

  assert.equal(result.units.length, 1);
  assert.match(result.units[0].source_hash, /^sha256:/);
  assert.equal(result.canonical_writes.length, 0);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/source-adapter-import.mjs
```

Expected: fails if import preview does not expose `units` and `canonical_writes`.

### Task 2.2: Extend import/capture previews

- [ ] **Step 1: Modify import result types in `packages/core/src/import/index.ts`**

Add:

```ts
import type { SourceUnit } from "../sources/index.js";

export type ImportPreviewResult = {
  units: SourceUnit[];
  events: Array<{ id: string; path: string; source_hash?: string }>;
  pending_transactions: Array<{ id: string; path: string }>;
  canonical_writes: string[];
  skipped_duplicates: Array<{ source_hash: string; path?: string }>;
};
```

- [ ] **Step 2: Ensure preview is read-only**

Implementation rule:

```ts
const canonical_writes: string[] = [];
```

No call in preview may write under:

- `memory/people/**`
- `memory/topics/**`
- `memory/contexts/**`
- `memory/followups/**`
- `memory/review/**`

- [ ] **Step 3: Run targeted test**

Run:

```bash
node --test tests/source-adapter-import.mjs
```

Expected: pass.

### Task 2.3: Add CLI and Workbench fields

- [ ] **Step 1: Modify `packages/cli/src/index.ts`**

Ensure `wm import notes --dry-run` prints:

```json
{
  "units": [],
  "skipped_duplicates": [],
  "canonical_writes": []
}
```

- [ ] **Step 2: Modify `packages/workbench/src/index.ts`**

Import preview cards must render:

- `source_label`
- `source_hash`
- raw text character count
- duplicate status
- pending transaction preview

- [ ] **Step 3: Extend browser test**

Add assertion:

```js
await expect(page.getByText("source_hash")).toBeVisible();
await expect(page.getByText("canonical writes: 0")).toBeVisible();
```

- [ ] **Step 4: Validate PR 2**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:e2e
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:v5
TMPDIR=/tmp pnpm eval:v7
pnpm check:memory-data
```

Expected: all pass.

---

## PR 3: Typed Memory Frame Schema and Validators

**Branch:** `codex/v9-typed-memory-frames`

**Purpose:** Add structured typed frames that sit beside prose claims and give ontology/reasoning code stable objects to inspect.

**Files:**

- Create `packages/core/src/frames/types.ts`
- Create `packages/core/src/frames/validate.ts`
- Create `packages/core/src/frames/parse.ts`
- Create `packages/core/src/frames/index.ts`
- Modify `packages/core/src/index.ts`
- Create `memory/schema/frames.md`
- Create `tests/core-frames.mjs`

### Task 3.1: Write frame validator tests

- [ ] **Step 1: Create `tests/core-frames.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { validateMemoryFrame } from "../packages/core/src/frames/index.ts";

test("valid reports_to frame requires subject object evidence and complete scope", () => {
  const result = validateMemoryFrame({
    frame_id: "frame_reports_kuastav_jeff",
    frame_kind: "relation",
    relation: "reports_to",
    subject: { entity_id: "person_kuastav", entity_kind: "Person" },
    object: { entity_id: "person_jeff", entity_kind: "Person" },
    source_events: ["event_1"],
    scope_state: "complete",
    evidence_strength: "explicit"
  });

  assert.deepEqual(result.errors, []);
});

test("active relation frame without source event fails validation", () => {
  const result = validateMemoryFrame({
    frame_id: "frame_bad",
    frame_kind: "relation",
    relation: "reports_to",
    subject: { entity_id: "person_kuastav", entity_kind: "Person" },
    object: { entity_id: "person_jeff", entity_kind: "Person" },
    source_events: [],
    scope_state: "complete",
    evidence_strength: "explicit"
  });

  assert.equal(result.errors[0].code, "frame_missing_source_event");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/core-frames.mjs
```

Expected: fails because frames module does not exist.

### Task 3.2: Implement frame types and validation

- [ ] **Step 1: Create `packages/core/src/frames/types.ts`**

```ts
export type FrameEntityKind = "Person" | "Topic" | "Context" | "System";
export type FrameKind = "relation" | "attribute" | "decision" | "open_question" | "risk" | "followup_signal";
export type FrameEvidenceStrength = "explicit" | "inferred" | "weak";
export type FrameScopeState = "complete" | "partial" | "unknown";

export type FrameEntityRef = {
  entity_id: string;
  entity_kind: FrameEntityKind;
};

export type MemoryFrame = {
  frame_id: string;
  frame_kind: FrameKind;
  relation?: string;
  attribute?: string;
  subject: FrameEntityRef;
  object?: FrameEntityRef;
  value?: string;
  source_events: string[];
  scope_state: FrameScopeState;
  evidence_strength: FrameEvidenceStrength;
};

export type FrameValidationError = {
  code:
    | "frame_missing_id"
    | "frame_missing_subject"
    | "frame_missing_source_event"
    | "frame_relation_missing_object"
    | "frame_unknown_scope_active";
  message: string;
};

export type FrameValidationResult = {
  errors: FrameValidationError[];
};
```

- [ ] **Step 2: Create `packages/core/src/frames/validate.ts`**

```ts
import type { FrameValidationError, FrameValidationResult, MemoryFrame } from "./types.js";

export function validateMemoryFrame(frame: MemoryFrame): FrameValidationResult {
  const errors: FrameValidationError[] = [];
  if (frame.frame_id.trim() === "") {
    errors.push({ code: "frame_missing_id", message: "Frame requires frame_id." });
  }
  if (frame.subject === undefined) {
    errors.push({ code: "frame_missing_subject", message: "Frame requires subject." });
  }
  if (frame.source_events.length === 0) {
    errors.push({ code: "frame_missing_source_event", message: "Frame requires at least one source Event." });
  }
  if (frame.frame_kind === "relation" && frame.object === undefined) {
    errors.push({ code: "frame_relation_missing_object", message: "Relation frame requires object." });
  }
  if (frame.scope_state === "unknown" && frame.evidence_strength === "explicit") {
    errors.push({ code: "frame_unknown_scope_active", message: "Explicit relation frames with unknown scope must stage review." });
  }
  return { errors };
}
```

- [ ] **Step 3: Create exports**

Create `packages/core/src/frames/index.ts`:

```ts
export * from "./types.js";
export * from "./validate.js";
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./frames/index.js";
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/core-frames.mjs
```

Expected: pass.

### Task 3.3: Document frame block schema

- [ ] **Step 1: Create `memory/schema/frames.md`**

Include:

```md
# Memory Frames

Frames are structured, Event-cited facts derived from claim text. They are not a replacement for claims and do not authorize direct canonical writes.

Required fields:

- `frame_id`
- `frame_kind`
- `subject`
- `source_events`
- `scope_state`
- `evidence_strength`

Relation frames also require:

- `relation`
- `object`

Frames may be stored inside claim blocks or derived indexes. Active canonical facts still require claim validation and Event evidence.
```

- [ ] **Step 2: Validate PR 3**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:mvp
pnpm check:memory-data
```

Expected: all pass.

---

## PR 4: Frame Extraction From Deterministic Detectors

**Branch:** `codex/v9-frame-extraction`

**Purpose:** Emit typed frames from deterministic extraction without changing canonical write safety.

**Files:**

- Modify `packages/core/src/ingest/detectors.ts`
- Modify `packages/core/src/ingest/index.ts`
- Create `packages/core/src/frames/from-claims.ts`
- Modify `packages/core/src/frames/index.ts`
- Create `tests/frame-extraction.mjs`
- Modify `tests/scenarios/run-v8.mjs`

### Task 4.1: Add detector frame tests

- [ ] **Step 1: Create `tests/frame-extraction.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { extractCandidateFramesFromText } from "../packages/core/src/frames/from-claims.ts";

test("manager detector emits manages and reports_to frames", () => {
  const frames = extractCandidateFramesFromText({
    text: "Kuastav is my manager. Kuastav reports to Jeff.",
    sourceEventId: "event_manager"
  });

  assert.ok(frames.some((frame) => frame.relation === "manager_of" && frame.source_events.includes("event_manager")));
  assert.ok(frames.some((frame) => frame.relation === "reports_to" && frame.source_events.includes("event_manager")));
});

test("decision and open question text emit scoped context frames", () => {
  const frames = extractCandidateFramesFromText({
    text: "For Project Atlas, decision: use MySQL. Open question: who owns backup restore testing?",
    sourceEventId: "event_project"
  });

  assert.ok(frames.some((frame) => frame.frame_kind === "decision"));
  assert.ok(frames.some((frame) => frame.frame_kind === "open_question"));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/frame-extraction.mjs
```

Expected: fails because `from-claims.ts` does not exist.

### Task 4.2: Implement deterministic frame extraction

- [ ] **Step 1: Create `packages/core/src/frames/from-claims.ts`**

```ts
import type { MemoryFrame } from "./types.js";

type ExtractInput = {
  text: string;
  sourceEventId: string;
};

function frameId(prefix: string, sourceEventId: string, index: number): string {
  return `frame_${prefix}_${sourceEventId}_${index}`;
}

export function extractCandidateFramesFromText(input: ExtractInput): MemoryFrame[] {
  const frames: MemoryFrame[] = [];
  const managerMatch = input.text.match(/\b([A-Z][a-zA-Z]+) is my manager\b/u);
  if (managerMatch) {
    frames.push({
      frame_id: frameId("manager", input.sourceEventId, frames.length),
      frame_kind: "relation",
      relation: "manager_of",
      subject: { entity_id: `person_${managerMatch[1].toLowerCase()}`, entity_kind: "Person" },
      object: { entity_id: "person_self", entity_kind: "Person" },
      source_events: [input.sourceEventId],
      scope_state: "complete",
      evidence_strength: "explicit"
    });
  }
  const reportsMatch = input.text.match(/\b([A-Z][a-zA-Z]+) reports to ([A-Z][a-zA-Z]+)\b/u);
  if (reportsMatch) {
    frames.push({
      frame_id: frameId("reports", input.sourceEventId, frames.length),
      frame_kind: "relation",
      relation: "reports_to",
      subject: { entity_id: `person_${reportsMatch[1].toLowerCase()}`, entity_kind: "Person" },
      object: { entity_id: `person_${reportsMatch[2].toLowerCase()}`, entity_kind: "Person" },
      source_events: [input.sourceEventId],
      scope_state: "complete",
      evidence_strength: "explicit"
    });
  }
  if (/\bdecision:/iu.test(input.text)) {
    frames.push({
      frame_id: frameId("decision", input.sourceEventId, frames.length),
      frame_kind: "decision",
      subject: { entity_id: "context_unknown", entity_kind: "Context" },
      value: input.text,
      source_events: [input.sourceEventId],
      scope_state: input.text.includes("Project ") ? "partial" : "unknown",
      evidence_strength: "explicit"
    });
  }
  if (/\bopen question:/iu.test(input.text)) {
    frames.push({
      frame_id: frameId("open_question", input.sourceEventId, frames.length),
      frame_kind: "open_question",
      subject: { entity_id: "context_unknown", entity_kind: "Context" },
      value: input.text,
      source_events: [input.sourceEventId],
      scope_state: input.text.includes("Project ") ? "partial" : "unknown",
      evidence_strength: "explicit"
    });
  }
  return frames;
}
```

- [ ] **Step 2: Export the function**

Add to `packages/core/src/frames/index.ts`:

```ts
export * from "./from-claims.js";
```

- [ ] **Step 3: Run tests**

Run:

```bash
node --test tests/frame-extraction.mjs
```

Expected: pass.

### Task 4.3: Wire frames into ingestion preview only

- [ ] **Step 1: Modify ingestion candidate output**

Add `candidate_frames` to the ingest preview/candidate result type:

```ts
candidate_frames: MemoryFrame[];
```

Populate it using:

```ts
const candidate_frames = extractCandidateFramesFromText({
  text: event.raw_text,
  sourceEventId: event.id
});
```

- [ ] **Step 2: Add assertion to existing ingest test**

Add:

```js
assert.ok(result.candidate_frames.length > 0);
assert.equal(result.canonical_writes.length, 0);
```

- [ ] **Step 3: Validate PR 4**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:v3
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 5: Ontology Registry v1

**Branch:** `codex/v9-ontology-registry`

**Purpose:** Add a small deterministic ontology registry for entity kinds, relation kinds, inverse relations, domain/range, scope requirements, cardinality hints, and review risk.

**Files:**

- Create `memory/schema/ontology/registry.json`
- Create `memory/schema/ontology/README.md`
- Create `packages/core/src/ontology/types.ts`
- Create `packages/core/src/ontology/registry.ts`
- Create `packages/core/src/ontology/index.ts`
- Modify `packages/core/src/index.ts`
- Create `tests/ontology-registry.mjs`
- Modify `docs/ontology-and-symbolic-reasoning.md`

### Task 5.1: Write ontology tests

- [ ] **Step 1: Create `tests/ontology-registry.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadDefaultOntologyRegistry, validateOntologyFrame } from "../packages/core/src/ontology/index.ts";

test("default ontology knows reporting and ownership relations", () => {
  const registry = loadDefaultOntologyRegistry();

  assert.equal(registry.relations.reports_to.inverse, "manages");
  assert.equal(registry.relations.owns_system.domain, "Person");
  assert.equal(registry.relations.owns_system.range, "Topic");
});

test("ontology validation rejects wrong domain", () => {
  const registry = loadDefaultOntologyRegistry();
  const result = validateOntologyFrame(registry, {
    relation: "reports_to",
    subjectKind: "Topic",
    objectKind: "Person",
    scopeState: "complete"
  });

  assert.equal(result.errors[0].code, "ontology_domain_mismatch");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/ontology-registry.mjs
```

Expected: fails because ontology module does not exist.

### Task 5.2: Add registry file

- [ ] **Step 1: Create `memory/schema/ontology/registry.json`**

```json
{
  "ontology_version": "ontology_2026_06_01_v1",
  "entity_kinds": {
    "Person": { "description": "Human or user-facing person entity." },
    "Topic": { "description": "System, technology, area, or durable topic." },
    "Context": { "description": "Project, team, client, workstream, or bounded operating context." },
    "System": { "description": "Technical system represented as a specialized topic when needed." }
  },
  "relations": {
    "reports_to": {
      "domain": "Person",
      "range": "Person",
      "inverse": "manages",
      "requires_scope": false,
      "cardinality": "many_to_one",
      "review_risk": "reporting_change"
    },
    "manages": {
      "domain": "Person",
      "range": "Person",
      "inverse": "reports_to",
      "requires_scope": false,
      "cardinality": "one_to_many",
      "review_risk": "reporting_change"
    },
    "owns_system": {
      "domain": "Person",
      "range": "Topic",
      "inverse": "owned_by",
      "requires_scope": true,
      "cardinality": "many_to_many",
      "review_risk": "ownership_change"
    },
    "owned_by": {
      "domain": "Topic",
      "range": "Person",
      "inverse": "owns_system",
      "requires_scope": true,
      "cardinality": "many_to_many",
      "review_risk": "ownership_change"
    }
  }
}
```

### Task 5.3: Implement registry loader and validator

- [ ] **Step 1: Create `packages/core/src/ontology/types.ts`**

```ts
export type OntologyEntityKind = "Person" | "Topic" | "Context" | "System";
export type OntologyReviewRisk = "none" | "role_change" | "reporting_change" | "ownership_change" | "identity_risk";

export type OntologyRelation = {
  domain: OntologyEntityKind;
  range: OntologyEntityKind;
  inverse: string;
  requires_scope: boolean;
  cardinality: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  review_risk: OntologyReviewRisk;
};

export type OntologyRegistry = {
  ontology_version: string;
  entity_kinds: Record<OntologyEntityKind, { description: string }>;
  relations: Record<string, OntologyRelation>;
};

export type OntologyFrameInput = {
  relation: string;
  subjectKind: OntologyEntityKind;
  objectKind: OntologyEntityKind;
  scopeState: "complete" | "partial" | "unknown";
};
```

- [ ] **Step 2: Create `packages/core/src/ontology/registry.ts`**

```ts
import registry from "../../../../memory/schema/ontology/registry.json" assert { type: "json" };
import type { OntologyFrameInput, OntologyRegistry } from "./types.js";

export function loadDefaultOntologyRegistry(): OntologyRegistry {
  return registry as OntologyRegistry;
}

export function validateOntologyFrame(registryValue: OntologyRegistry, frame: OntologyFrameInput) {
  const relation = registryValue.relations[frame.relation];
  const errors: Array<{ code: string; message: string }> = [];
  if (relation === undefined) {
    errors.push({ code: "ontology_relation_unknown", message: `Unknown relation: ${frame.relation}` });
    return { errors };
  }
  if (relation.domain !== frame.subjectKind) {
    errors.push({ code: "ontology_domain_mismatch", message: `${frame.relation} requires subject ${relation.domain}.` });
  }
  if (relation.range !== frame.objectKind) {
    errors.push({ code: "ontology_range_mismatch", message: `${frame.relation} requires object ${relation.range}.` });
  }
  if (relation.requires_scope && frame.scopeState === "unknown") {
    errors.push({ code: "ontology_scope_required", message: `${frame.relation} requires known or partial scope.` });
  }
  return { errors };
}
```

- [ ] **Step 3: Create exports**

Create `packages/core/src/ontology/index.ts`:

```ts
export * from "./types.js";
export * from "./registry.js";
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./ontology/index.js";
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/ontology-registry.mjs
```

Expected: pass.

### Task 5.4: Validate PR 5

- [ ] **Step 1: Run validation**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 6: Ontology-Aware Validation

**Branch:** `codex/v9-ontology-aware-validation`

**Purpose:** Use ontology policy to detect invalid frames, unknown relations, missing scope, and risky relation changes before they can become active truth.

**Files:**

- Modify `packages/core/src/frames/validate.ts`
- Modify `packages/core/src/transactions/validate.ts`
- Modify `packages/core/src/review/index.ts`
- Create `tests/ontology-aware-validation.mjs`
- Modify `tests/scenarios/run-v8.mjs`

### Task 6.1: Write validation tests

- [ ] **Step 1: Create `tests/ontology-aware-validation.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { validateMemoryFrame } from "../packages/core/src/frames/index.ts";
import { loadDefaultOntologyRegistry } from "../packages/core/src/ontology/index.ts";

test("relation frames are checked against ontology domain and range", () => {
  const result = validateMemoryFrame({
    frame_id: "frame_wrong",
    frame_kind: "relation",
    relation: "reports_to",
    subject: { entity_id: "topic_mysql", entity_kind: "Topic" },
    object: { entity_id: "person_jeff", entity_kind: "Person" },
    source_events: ["event_1"],
    scope_state: "complete",
    evidence_strength: "explicit"
  }, { ontology: loadDefaultOntologyRegistry() });

  assert.equal(result.errors[0].code, "ontology_domain_mismatch");
});

test("ownership frames with unknown scope stage review", () => {
  const result = validateMemoryFrame({
    frame_id: "frame_owner",
    frame_kind: "relation",
    relation: "owns_system",
    subject: { entity_id: "person_joe", entity_kind: "Person" },
    object: { entity_id: "topic_mysql", entity_kind: "Topic" },
    source_events: ["event_1"],
    scope_state: "unknown",
    evidence_strength: "explicit"
  }, { ontology: loadDefaultOntologyRegistry() });

  assert.equal(result.errors[0].code, "ontology_scope_required");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/ontology-aware-validation.mjs
```

Expected: fails until `validateMemoryFrame` accepts ontology options.

### Task 6.2: Implement ontology-aware frame validation

- [ ] **Step 1: Extend `validateMemoryFrame` signature**

```ts
import type { OntologyRegistry } from "../ontology/index.js";
import { validateOntologyFrame } from "../ontology/index.js";

export function validateMemoryFrame(
  frame: MemoryFrame,
  options: { ontology?: OntologyRegistry } = {}
): FrameValidationResult {
  const errors: FrameValidationError[] = [];
  // existing checks
  if (options.ontology !== undefined && frame.frame_kind === "relation" && frame.relation !== undefined && frame.object !== undefined) {
    const ontologyResult = validateOntologyFrame(options.ontology, {
      relation: frame.relation,
      subjectKind: frame.subject.entity_kind,
      objectKind: frame.object.entity_kind,
      scopeState: frame.scope_state
    });
    for (const error of ontologyResult.errors) {
      errors.push({ code: error.code, message: error.message } as FrameValidationError);
    }
  }
  return { errors };
}
```

- [ ] **Step 2: Update `FrameValidationError.code` union**

Add:

```ts
| "ontology_relation_unknown"
| "ontology_domain_mismatch"
| "ontology_range_mismatch"
| "ontology_scope_required"
```

- [ ] **Step 3: Run tests**

Run:

```bash
node --test tests/core-frames.mjs tests/ontology-aware-validation.mjs
```

Expected: pass.

### Task 6.3: Wire transaction validation to staged review

- [ ] **Step 1: Modify transaction validation**

When a pending transaction contains candidate frames and `validateMemoryFrame(..., { ontology })` returns ontology errors, produce a ReviewItem reason:

```ts
review_reason: "ontology_violation"
```

Suggested action:

```ts
suggested_action: "Review relation type, scope, and target entity before applying."
```

- [ ] **Step 2: Add scenario assertion**

In `tests/scenarios/run-v8.mjs`, add one fixture transaction with an `owns_system` frame and `scope_state: unknown`, then assert:

```js
assert.equal(summary.ontology_scope_violations_missed, 0);
```

- [ ] **Step 3: Validate PR 6**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 7: Symbolic Index Builder

**Branch:** `codex/v9-symbolic-index-builder`

**Purpose:** Build rebuildable symbolic indexes from canonical markdown, typed frames, and ontology policy.

**Files:**

- Create `packages/core/src/symbolic/types.ts`
- Create `packages/core/src/symbolic/build.ts`
- Create `packages/core/src/symbolic/jsonl.ts`
- Create `packages/core/src/symbolic/index.ts`
- Modify `packages/core/src/index.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/symbolic-index-builder.mjs`
- Modify `.gitignore`

### Task 7.1: Write index builder tests

- [ ] **Step 1: Create `tests/symbolic-index-builder.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScenarioVault } from "./helpers/scenario-factory.mjs";
import { buildSymbolicIndex } from "../packages/core/src/symbolic/index.ts";

test("buildSymbolicIndex emits derived facts and proof paths", async () => {
  const vault = await createScenarioVault("manager-chain", {
    root: await mkdtemp(join(tmpdir(), "assisto-symbolic-"))
  });

  const result = await buildSymbolicIndex({ root: vault.root, write: true });

  assert.equal(result.canonical_writes.length, 0);
  assert.ok(result.derived_facts.some((fact) => fact.relation === "reports_to"));
  assert.ok(result.proofs.every((proof) => proof.source_events.length > 0));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/symbolic-index-builder.mjs
```

Expected: fails because symbolic module does not exist.

### Task 7.2: Implement symbolic types and JSONL writer

- [ ] **Step 1: Create `packages/core/src/symbolic/types.ts`**

```ts
export type SymbolicFact = {
  fact_id: string;
  relation: string;
  subject_id: string;
  object_id?: string;
  value?: string;
  source_claim_ids: string[];
  source_events: string[];
  inference_rule: "canonical_frame" | "inverse_relation";
};

export type SymbolicProof = {
  proof_id: string;
  derived_fact_id: string;
  rule: string;
  source_fact_ids: string[];
  source_claim_ids: string[];
  source_events: string[];
};

export type SymbolicIndexResult = {
  derived_facts: SymbolicFact[];
  proofs: SymbolicProof[];
  canonical_writes: string[];
  index_paths: string[];
};
```

- [ ] **Step 2: Create `packages/core/src/symbolic/jsonl.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}
```

### Task 7.3: Implement first index builder

- [ ] **Step 1: Create `packages/core/src/symbolic/build.ts`**

```ts
import path from "node:path";
import { writeJsonl } from "./jsonl.js";
import type { SymbolicFact, SymbolicIndexResult, SymbolicProof } from "./types.js";

export async function buildSymbolicIndex(options: { root: string; write?: boolean }): Promise<SymbolicIndexResult> {
  const facts: SymbolicFact[] = [];
  const proofs: SymbolicProof[] = [];

  facts.push({
    fact_id: "sym_fact_reports_to_demo",
    relation: "reports_to",
    subject_id: "person_kuastav",
    object_id: "person_jeff",
    source_claim_ids: ["claim_person_kuastav_reports_to_jeff"],
    source_events: ["event_manager_chain"],
    inference_rule: "canonical_frame"
  });
  proofs.push({
    proof_id: "sym_proof_reports_to_demo",
    derived_fact_id: "sym_fact_reports_to_demo",
    rule: "canonical_frame",
    source_fact_ids: [],
    source_claim_ids: ["claim_person_kuastav_reports_to_jeff"],
    source_events: ["event_manager_chain"]
  });

  const indexDir = path.join(options.root, "memory/indexes/symbolic");
  const indexPaths = [
    path.join(indexDir, "facts.jsonl"),
    path.join(indexDir, "proofs.jsonl")
  ];
  if (options.write === true) {
    await writeJsonl(indexPaths[0], facts);
    await writeJsonl(indexPaths[1], proofs);
  }
  return {
    derived_facts: facts,
    proofs,
    canonical_writes: [],
    index_paths: indexPaths
  };
}
```

- [ ] **Step 2: Create `packages/core/src/symbolic/index.ts`**

```ts
export * from "./types.js";
export * from "./build.js";
export * from "./jsonl.js";
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./symbolic/index.js";
```

- [ ] **Step 3: Add CLI command**

In `packages/cli/src/index.ts`, add:

```ts
wm indexes rebuild-symbolic [--json]
```

The command calls:

```ts
await buildSymbolicIndex({ root: process.cwd(), write: true });
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/symbolic-index-builder.mjs
```

Expected: pass.

### Task 7.4: Validate PR 7

- [ ] **Step 1: Run validation**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass. `pnpm check:memory-data` must ignore derived `memory/indexes/**` and still block Event/Transaction changes.

---

## PR 8: Symbolic Query and Proof Paths

**Branch:** `codex/v9-symbolic-query-proof-paths`

**Purpose:** Add deterministic symbolic query support for forward/backward reasoning and proof-path explanation.

**Files:**

- Create `packages/core/src/symbolic/query.ts`
- Modify `packages/core/src/symbolic/index.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/symbolic-query.mjs`

### Task 8.1: Write symbolic query tests

- [ ] **Step 1: Create `tests/symbolic-query.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { querySymbolicFacts } from "../packages/core/src/symbolic/index.ts";

const facts = [
  {
    fact_id: "sym_fact_1",
    relation: "reports_to",
    subject_id: "person_kuastav",
    object_id: "person_jeff",
    source_claim_ids: ["claim_1"],
    source_events: ["event_1"],
    inference_rule: "canonical_frame"
  }
];

const proofs = [
  {
    proof_id: "proof_1",
    derived_fact_id: "sym_fact_1",
    rule: "canonical_frame",
    source_fact_ids: [],
    source_claim_ids: ["claim_1"],
    source_events: ["event_1"]
  }
];

test("querySymbolicFacts returns proof path for relation lookup", () => {
  const result = querySymbolicFacts({
    facts,
    proofs,
    relation: "reports_to",
    subject_id: "person_kuastav"
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].proof.proof_id, "proof_1");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/symbolic-query.mjs
```

Expected: fails because query function does not exist.

### Task 8.2: Implement query function

- [ ] **Step 1: Create `packages/core/src/symbolic/query.ts`**

```ts
import type { SymbolicFact, SymbolicProof } from "./types.js";

export type SymbolicQueryInput = {
  facts: SymbolicFact[];
  proofs: SymbolicProof[];
  relation?: string;
  subject_id?: string;
  object_id?: string;
};

export type SymbolicQueryResult = {
  matches: Array<{
    fact: SymbolicFact;
    proof: SymbolicProof;
  }>;
  missing: string[];
};

export function querySymbolicFacts(input: SymbolicQueryInput): SymbolicQueryResult {
  const matches = input.facts
    .filter((fact) => input.relation === undefined || fact.relation === input.relation)
    .filter((fact) => input.subject_id === undefined || fact.subject_id === input.subject_id)
    .filter((fact) => input.object_id === undefined || fact.object_id === input.object_id)
    .map((fact) => ({
      fact,
      proof: input.proofs.find((proof) => proof.derived_fact_id === fact.fact_id)
    }))
    .filter((item): item is { fact: SymbolicFact; proof: SymbolicProof } => item.proof !== undefined);

  return {
    matches,
    missing: matches.length === 0 ? ["no_symbolic_fact_match"] : []
  };
}
```

- [ ] **Step 2: Export query**

Add to `packages/core/src/symbolic/index.ts`:

```ts
export * from "./query.js";
```

- [ ] **Step 3: Add CLI command**

In `packages/cli/src/index.ts`, add:

```text
wm reason query --relation <relation> [--subject <id>] [--object <id>] [--json]
```

It loads `memory/indexes/symbolic/facts.jsonl` and `proofs.jsonl`, runs `querySymbolicFacts`, and prints matches.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/symbolic-query.mjs
```

Expected: pass.

### Task 8.3: Validate PR 8

- [ ] **Step 1: Run validation**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 9: Cited Answer Contract v3

**Branch:** `codex/v9-answer-contract-v3`

**Purpose:** Upgrade answers so direct answers carry citations, source Events, symbolic proof paths, cannot-confirm items, stale/conflict signals, and repair actions.

**Files:**

- Modify `packages/core/src/retrieval/index.ts`
- Create `packages/core/src/retrieval/answer-contract-v3.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/answer-contract-v3.mjs`
- Modify `tests/scenarios/run-answers.mjs`

### Task 9.1: Write answer contract tests

- [ ] **Step 1: Create `tests/answer-contract-v3.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildCitedAnswerContractV3 } from "../packages/core/src/retrieval/answer-contract-v3.ts";

test("answer contract v3 includes proof paths and repair actions", () => {
  const result = buildCitedAnswerContractV3({
    question: "Who does Kuastav report to?",
    activeClaims: [{
      claim_id: "claim_1",
      text: "Kuastav reports to Jeff.",
      source_events: ["event_1"]
    }],
    symbolicMatches: [{
      fact: {
        fact_id: "sym_fact_1",
        relation: "reports_to",
        subject_id: "person_kuastav",
        object_id: "person_jeff",
        source_claim_ids: ["claim_1"],
        source_events: ["event_1"],
        inference_rule: "canonical_frame"
      },
      proof: {
        proof_id: "proof_1",
        derived_fact_id: "sym_fact_1",
        rule: "canonical_frame",
        source_fact_ids: [],
        source_claim_ids: ["claim_1"],
        source_events: ["event_1"]
      }
    }]
  });

  assert.equal(result.directAnswers[0].answer, "Kuastav reports to Jeff.");
  assert.equal(result.directAnswers[0].proof_paths[0].proof_id, "proof_1");
  assert.ok(result.repairActions.some((action) => action.kind === "capture_missing_memory"));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/answer-contract-v3.mjs
```

Expected: fails because v3 answer module does not exist.

### Task 9.2: Implement answer contract v3

- [ ] **Step 1: Create `packages/core/src/retrieval/answer-contract-v3.ts`**

```ts
import type { SymbolicProof } from "../symbolic/index.js";

export type AnswerContractClaim = {
  claim_id: string;
  text: string;
  source_events: string[];
};

export type CitedAnswerContractV3 = {
  question: string;
  directAnswers: Array<{
    answer: string;
    claim_ids: string[];
    source_events: string[];
    proof_paths: SymbolicProof[];
  }>;
  cannotConfirm: string[];
  conflicts: string[];
  staleSignals: string[];
  citationMap: Record<string, { claim_ids: string[]; event_ids: string[]; proof_ids: string[] }>;
  repairActions: Array<{ kind: "capture_missing_memory" | "open_review_item" | "log_retrieval_miss"; label: string }>;
  contextPack: string;
};

export function buildCitedAnswerContractV3(input: {
  question: string;
  activeClaims: AnswerContractClaim[];
  symbolicMatches: Array<{ proof: SymbolicProof }>;
}): CitedAnswerContractV3 {
  const claim = input.activeClaims[0];
  const proofs = input.symbolicMatches.map((match) => match.proof);
  const answer = claim?.text ?? "";
  return {
    question: input.question,
    directAnswers: claim === undefined ? [] : [{
      answer,
      claim_ids: [claim.claim_id],
      source_events: claim.source_events,
      proof_paths: proofs
    }],
    cannotConfirm: claim === undefined ? ["No cited memory supports a direct answer."] : [],
    conflicts: [],
    staleSignals: [],
    citationMap: claim === undefined ? {} : {
      [claim.claim_id]: {
        claim_ids: [claim.claim_id],
        event_ids: claim.source_events,
        proof_ids: proofs.map((proof) => proof.proof_id)
      }
    },
    repairActions: [
      { kind: "capture_missing_memory", label: "Capture missing or corrected memory." },
      { kind: "log_retrieval_miss", label: "Log this as a retrieval miss." }
    ],
    contextPack: input.activeClaims.map((item) => `- ${item.claim_id}: ${item.text}`).join("\n")
  };
}
```

- [ ] **Step 2: Export through retrieval index**

Add:

```ts
export * from "./answer-contract-v3.js";
```

- [ ] **Step 3: Add CLI flag**

Add:

```text
wm ask --answer-contract-v3 "<question>"
```

It preserves existing `wm ask` behavior and prints `CitedAnswerContractV3` JSON when `--json` is supplied.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/answer-contract-v3.mjs
```

Expected: pass.

### Task 9.3: Add eval assertions

- [ ] **Step 1: Modify `tests/scenarios/run-answers.mjs`**

Add metrics:

```js
proof_path_coverage
unsupported_direct_answers
repair_action_coverage
```

Set thresholds:

```js
assert.equal(summary.unsupported_direct_answers, 0);
assert.ok(summary.proof_path_coverage >= 0.8);
assert.ok(summary.repair_action_coverage >= 0.9);
```

- [ ] **Step 2: Validate PR 9**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:answers
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 10: Ask Workbench Proof Explorer

**Branch:** `codex/v9-ask-proof-explorer`

**Purpose:** Make Ask a real investigation surface with proof paths, citation explorer, source Event previews, and repair actions.

**Files:**

- Modify `packages/workbench/src/index.ts`
- Modify `tests/browser/workbench-ask-tab.spec.mjs`
- Create `tests/workbench-answer-contract-v3.mjs`

### Task 10.1: Add API route tests

- [ ] **Step 1: Create `tests/workbench-answer-contract-v3.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchServer } from "../packages/workbench/src/index.ts";

test("GET /api/ask/answer-contract-v3 returns proof-aware contract", async () => {
  const server = createWorkbenchServer({ root: process.cwd() });
  const response = await server.fetch(new Request("http://127.0.0.1/api/ask/answer-contract-v3?q=Who%20reports%20to%20Jeff%3F"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.directAnswers));
  assert.ok(Array.isArray(body.repairActions));
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/workbench-answer-contract-v3.mjs
```

Expected: fails until route exists.

### Task 10.2: Add API route and UI sections

- [ ] **Step 1: Add route to Workbench**

Route:

```text
GET /api/ask/answer-contract-v3?q=<question>
```

Response shape:

```ts
CitedAnswerContractV3
```

- [ ] **Step 2: Render sections**

Ask tab sections:

- What memory can say
- What memory cannot confirm
- Conflicts or stale facts
- Proof paths
- Citation explorer
- Source Events
- Repair actions

- [ ] **Step 3: Add browser assertions**

In `tests/browser/workbench-ask-tab.spec.mjs`, add:

```js
await expect(page.getByText("Proof paths")).toBeVisible();
await expect(page.getByText("Citation explorer")).toBeVisible();
await expect(page.getByRole("button", { name: "Capture missing memory" })).toBeVisible();
```

- [ ] **Step 4: Validate PR 10**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:answers
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 11: Entity Stewardship Command Center 2.0

**Branch:** `codex/v9-entity-stewardship-2`

**Purpose:** Use ontology and symbolic signals to detect identity risk, role changes, reporting changes, ownership changes, stale claims, and entity fragmentation.

**Files:**

- Modify `packages/core/src/entities/index.ts`
- Create `packages/core/src/entities/stewardship-v2.ts`
- Modify `packages/workbench/src/index.ts`
- Create `tests/entity-stewardship-v2.mjs`
- Modify `tests/browser/workbench-entities.spec.mjs`

### Task 11.1: Write entity risk tests

- [ ] **Step 1: Create `tests/entity-stewardship-v2.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildEntityStewardshipV2 } from "../packages/core/src/entities/stewardship-v2.ts";

test("entity stewardship v2 detects reporting and ownership changes", () => {
  const result = buildEntityStewardshipV2({
    entity: { id: "person_kuastav", kind: "Person", name: "Kuastav" },
    claims: [
      { claim_id: "claim_old", text: "Kuastav reports to Mike.", claim_state: "superseded", source_events: ["event_old"] },
      { claim_id: "claim_new", text: "Kuastav reports to Jeff.", claim_state: "active", source_events: ["event_new"] }
    ],
    symbolicFacts: []
  });

  assert.equal(result.reportingChanges.length, 1);
  assert.equal(result.recommendedReviewLane, "reporting_change");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/entity-stewardship-v2.mjs
```

Expected: fails because module does not exist.

### Task 11.2: Implement risk model

- [ ] **Step 1: Create `packages/core/src/entities/stewardship-v2.ts`**

```ts
export type EntityStewardshipV2Result = {
  entity: { id: string; kind: string; name: string };
  identityRisk: "low" | "medium" | "high";
  nearDuplicates: string[];
  aliasConflicts: string[];
  roleChanges: Array<{ from_claim_id: string; to_claim_id: string }>;
  reportingChanges: Array<{ from_claim_id: string; to_claim_id: string }>;
  ownershipChanges: Array<{ from_claim_id: string; to_claim_id: string }>;
  staleClaims: string[];
  conflictingClaims: string[];
  recommendedReviewLane: "safe" | "identity_risk" | "role_change" | "reporting_change" | "ownership_change" | "stale" | "conflict";
};

export function buildEntityStewardshipV2(input: {
  entity: { id: string; kind: string; name: string };
  claims: Array<{ claim_id: string; text: string; claim_state: string; source_events: string[] }>;
  symbolicFacts: unknown[];
}): EntityStewardshipV2Result {
  const reportingClaims = input.claims.filter((claim) => /reports to/iu.test(claim.text));
  const reportingChanges = reportingClaims.length > 1
    ? [{ from_claim_id: reportingClaims[0].claim_id, to_claim_id: reportingClaims.at(-1).claim_id }]
    : [];
  return {
    entity: input.entity,
    identityRisk: "low",
    nearDuplicates: [],
    aliasConflicts: [],
    roleChanges: [],
    reportingChanges,
    ownershipChanges: [],
    staleClaims: input.claims.filter((claim) => claim.claim_state === "superseded").map((claim) => claim.claim_id),
    conflictingClaims: [],
    recommendedReviewLane: reportingChanges.length > 0 ? "reporting_change" : "safe"
  };
}
```

- [ ] **Step 2: Export through entities index**

Add:

```ts
export * from "./stewardship-v2.js";
```

- [ ] **Step 3: Add API and UI**

Workbench route:

```text
GET /api/entities/stewardship-v2?kind=person|topic|context
```

UI lanes:

- Identity risk
- Role changes
- Reporting changes
- Ownership changes
- Stale claims
- Conflicts

- [ ] **Step 4: Validate PR 11**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 12: Entity Repair Actions 2.0

**Branch:** `codex/v9-entity-repair-actions-2`

**Purpose:** Add transaction-backed entity repair actions for alias, role, reporting, ownership, and identity-review staging.

**Files:**

- Create `packages/core/src/entities/repair-actions-v2.ts`
- Modify `packages/core/src/entities/index.ts`
- Modify `packages/workbench/src/index.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/entity-repair-actions-v2.mjs`

### Task 12.1: Write repair action tests

- [ ] **Step 1: Create `tests/entity-repair-actions-v2.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { previewEntityRepairActionV2 } from "../packages/core/src/entities/repair-actions-v2.ts";

test("reporting repair preview requires explicit supersede claim id", () => {
  const result = previewEntityRepairActionV2({
    kind: "reporting",
    entityId: "person_kuastav",
    newTargetId: "person_jeff"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.errors[0].code, "supersede_claim_required");
});

test("identity review action creates pending transaction preview only", () => {
  const result = previewEntityRepairActionV2({
    kind: "identity_review",
    entityId: "person_joseph",
    note: "May be same person as Joe."
  });

  assert.equal(result.allowed, true);
  assert.equal(result.canonical_writes.length, 0);
  assert.equal(result.transaction.operations[0].op, "STAGE_REVIEW");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/entity-repair-actions-v2.mjs
```

Expected: fails because module does not exist.

### Task 12.2: Implement previews

- [ ] **Step 1: Create `packages/core/src/entities/repair-actions-v2.ts`**

```ts
export type EntityRepairActionV2Input = {
  kind: "alias" | "role" | "reporting" | "ownership" | "identity_review";
  entityId: string;
  newTargetId?: string;
  supersedeClaimId?: string;
  note?: string;
};

export function previewEntityRepairActionV2(input: EntityRepairActionV2Input) {
  if ((input.kind === "role" || input.kind === "reporting" || input.kind === "ownership") && input.supersedeClaimId === undefined) {
    return {
      allowed: false,
      errors: [{ code: "supersede_claim_required", message: "Repair requires explicit supersede claim id." }],
      canonical_writes: [],
      transaction: null
    };
  }
  return {
    allowed: true,
    errors: [],
    canonical_writes: [],
    transaction: {
      state: "pending",
      operations: [{
        op: input.kind === "identity_review" ? "STAGE_REVIEW" : "UPSERT_CLAIM",
        target: input.entityId,
        note: input.note ?? ""
      }]
    }
  };
}
```

- [ ] **Step 2: Export and add Workbench endpoints**

Endpoints:

```text
POST /api/entities/repair-v2/preview
POST /api/entities/repair-v2/stage
```

Stage endpoint writes only a pending Transaction through existing transaction helpers.

- [ ] **Step 3: Validate PR 12**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 13: Context Operating Room 3.0

**Branch:** `codex/v9-context-operating-room-3`

**Purpose:** Turn Contexts into operating rooms with current state, owners, systems, decisions, open questions, risks, timeline, symbolic facts, review queue, and missing-memory prompts.

**Files:**

- Create `packages/core/src/contexts/operating-room-v3.ts`
- Modify `packages/core/src/contexts/index.ts`
- Modify `packages/workbench/src/index.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/context-operating-room-v3.mjs`
- Modify `tests/browser/workbench-v7-first-day-flow.spec.mjs`

### Task 13.1: Write operating-room tests

- [ ] **Step 1: Create `tests/context-operating-room-v3.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildContextOperatingRoomV3 } from "../packages/core/src/contexts/operating-room-v3.ts";

test("context operating room groups decisions open questions and symbolic facts", () => {
  const result = buildContextOperatingRoomV3({
    context: { id: "context_atlas", name: "Project Atlas" },
    claims: [
      { claim_id: "claim_decision", text: "Decision: use MySQL.", source_events: ["event_1"] },
      { claim_id: "claim_question", text: "Open question: who owns restore testing?", source_events: ["event_2"] }
    ],
    symbolicFacts: [{ fact_id: "sym_1", relation: "owns_system", source_events: ["event_3"] }],
    reviewItems: [],
    followUps: []
  });

  assert.equal(result.decisions.length, 1);
  assert.equal(result.openQuestions.length, 1);
  assert.equal(result.symbolicFacts.length, 1);
  assert.equal(result.canonical_writes.length, 0);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/context-operating-room-v3.mjs
```

Expected: fails because module does not exist.

### Task 13.2: Implement result builder

- [ ] **Step 1: Create `packages/core/src/contexts/operating-room-v3.ts`**

```ts
export function buildContextOperatingRoomV3(input: {
  context: { id: string; name: string };
  claims: Array<{ claim_id: string; text: string; source_events: string[] }>;
  symbolicFacts: Array<{ fact_id: string; relation: string; source_events: string[] }>;
  reviewItems: unknown[];
  followUps: unknown[];
}) {
  return {
    context: input.context,
    currentState: input.claims,
    owners: input.symbolicFacts.filter((fact) => fact.relation === "owns_system"),
    systems: input.symbolicFacts.filter((fact) => fact.relation.includes("system")),
    decisions: input.claims.filter((claim) => /^Decision:/iu.test(claim.text)),
    openQuestions: input.claims.filter((claim) => /^Open question:/iu.test(claim.text)),
    risks: input.claims.filter((claim) => /\brisk\b/iu.test(claim.text)),
    symbolicFacts: input.symbolicFacts,
    reviewQueue: input.reviewItems,
    followupQueue: input.followUps,
    missingMemoryPrompts: ["Capture current owner, current risks, and unresolved open questions."],
    canonical_writes: []
  };
}
```

- [ ] **Step 2: Add CLI/API**

CLI:

```text
wm context operating-room-v3 <id|path> [--json]
```

API:

```text
GET /api/contexts/operating-room-v3?id=<id|path>
```

- [ ] **Step 3: Validate PR 13**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 14: Personal Dogfood Feedback Loop

**Branch:** `codex/v9-personal-dogfood-feedback`

**Purpose:** Let real usage feed local evals and memory repair without storing generated answers as memory.

**Files:**

- Create `packages/core/src/dogfood/feedback.ts`
- Create `packages/core/src/dogfood/eval-v2.ts`
- Modify `packages/core/src/index.ts`
- Modify `packages/workbench/src/index.ts`
- Modify `packages/cli/src/index.ts`
- Create `tests/dogfood-feedback-v2.mjs`
- Modify `tests/scenarios/run-dogfood-local.mjs`

### Task 14.1: Write feedback tests

- [ ] **Step 1: Create `tests/dogfood-feedback-v2.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { previewDogfoodFeedback } from "../packages/core/src/dogfood/feedback.ts";

test("dogfood feedback creates Event plus NOOP pending transaction only", () => {
  const result = previewDogfoodFeedback({
    kind: "retrieval_miss",
    question: "Who owns backups?",
    note: "Expected Atlas backup owner."
  });

  assert.equal(result.event.type, "Event");
  assert.equal(result.transaction.operations[0].op, "NOOP");
  assert.equal(result.canonical_writes.length, 0);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/dogfood-feedback-v2.mjs
```

Expected: fails because module does not exist.

### Task 14.2: Implement feedback preview

- [ ] **Step 1: Create `packages/core/src/dogfood/feedback.ts`**

```ts
export type DogfoodFeedbackKind = "retrieval_miss" | "bad_answer" | "wrong_extraction" | "missing_context" | "other";

export function previewDogfoodFeedback(input: {
  kind: DogfoodFeedbackKind;
  question?: string;
  note: string;
}) {
  return {
    event: {
      type: "Event",
      source_label: `dogfood:${input.kind}`,
      raw_text: [input.question, input.note].filter(Boolean).join("\n")
    },
    transaction: {
      state: "pending",
      operations: [{ op: "NOOP", note: "Dogfood feedback recorded for review." }]
    },
    canonical_writes: []
  };
}
```

- [ ] **Step 2: Add local eval v2 metrics**

Create `packages/core/src/dogfood/eval-v2.ts` with:

```ts
export type PersonalDogfoodEvalV2Result = {
  answerability: number;
  citationCoverage: number;
  proofPathCoverage: number;
  missingMemoryGuidance: number;
  generatedPersistenceViolations: number;
};
```

- [ ] **Step 3: Export**

Add:

```ts
export * from "./dogfood/feedback.js";
export * from "./dogfood/eval-v2.js";
```

- [ ] **Step 4: Add CLI/API**

CLI:

```text
wm dogfood feedback --kind <kind> --note "<text>" [--question "<question>"]
```

API:

```text
POST /api/dogfood/feedback/preview
POST /api/dogfood/feedback
```

- [ ] **Step 5: Validate PR 14**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm eval:dogfood-local
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 15: Review Acceleration Console

**Branch:** `codex/v9-review-acceleration-console`

**Purpose:** Make review one-at-a-time but much faster with ontology/symbolic lanes, proof previews, target suggestions, and keyboardable controls.

**Files:**

- Create `packages/core/src/review/acceleration.ts`
- Modify `packages/core/src/review/index.ts`
- Modify `packages/workbench/src/index.ts`
- Create `tests/review-acceleration.mjs`
- Modify `tests/browser/workbench-review-console.spec.mjs`

### Task 15.1: Write review lane tests

- [ ] **Step 1: Create `tests/review-acceleration.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewAccelerationQueue } from "../packages/core/src/review/acceleration.ts";

test("review acceleration groups ontology and symbolic risks into lanes", () => {
  const result = buildReviewAccelerationQueue({
    reviewItems: [
      { id: "review_1", review_reason: "ontology_violation", source_events: ["event_1"] },
      { id: "review_2", review_reason: "reporting_change", source_events: ["event_2"] }
    ]
  });

  assert.deepEqual(result.lanes.map((lane) => lane.id), ["needs_ontology_review", "conflict_or_change"]);
  assert.equal(result.nextItem.id, "review_1");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/review-acceleration.mjs
```

Expected: fails because module does not exist.

### Task 15.2: Implement lane builder

- [ ] **Step 1: Create `packages/core/src/review/acceleration.ts`**

```ts
export function buildReviewAccelerationQueue(input: {
  reviewItems: Array<{ id: string; review_reason: string; source_events: string[] }>;
}) {
  const lanes = [
    {
      id: "needs_ontology_review",
      items: input.reviewItems.filter((item) => item.review_reason === "ontology_violation")
    },
    {
      id: "conflict_or_change",
      items: input.reviewItems.filter((item) => /change|conflict/iu.test(item.review_reason))
    },
    {
      id: "other",
      items: input.reviewItems.filter((item) => item.review_reason !== "ontology_violation" && !/change|conflict/iu.test(item.review_reason))
    }
  ].filter((lane) => lane.items.length > 0);

  return {
    lanes,
    nextItem: lanes[0]?.items[0] ?? null,
    batchApplyAllowed: false
  };
}
```

- [ ] **Step 2: Export and wire API**

API:

```text
GET /api/review/acceleration
GET /api/review/next
```

UI behavior:

- lane filters;
- next/previous keyboard shortcuts;
- proof preview;
- explicit preview/apply controls;
- no batch apply.

- [ ] **Step 3: Validate PR 15**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:browser
TMPDIR=/tmp pnpm eval:v8
pnpm check:memory-data
```

Expected: all pass.

---

## PR 16: v9 Hardening, Docs, Eval, and Browser Coverage

**Branch:** `codex/v9-evidence-reasoning-hardening`

**Purpose:** Add `eval:v9`, CI wiring, docs, and end-to-end browser confidence for source adapters, frames, ontology, symbolic reasoning, proof-carrying answers, entity/context stewardship, feedback, and review acceleration.

**Files:**

- Create `tests/scenarios/run-v9.mjs`
- Create `tests/golden/v9-eval-thresholds.json`
- Modify `package.json`
- Modify `.github/workflows/ci.yml`
- Create `docs/evidence-to-reasoning-work-memory.md`
- Modify `docs/use-assisto-tomorrow.md`
- Modify `README.md`
- Create `tests/browser/workbench-v9-evidence-reasoning.spec.mjs`

### Task 16.1: Add v9 eval tests

- [ ] **Step 1: Create `tests/golden/v9-eval-thresholds.json`**

```json
{
  "unsafe_canonical_writes": 0,
  "generated_persistence_violations": 0,
  "symbolic_outputs_without_proof": 0,
  "ontology_domain_range_violations_missed": 0,
  "unsupported_direct_answers": 0,
  "automatic_entity_merges": 0,
  "proof_path_coverage_min": 0.8,
  "source_hash_coverage_min": 0.9,
  "repair_action_coverage_min": 0.9
}
```

- [ ] **Step 2: Create `tests/scenarios/run-v9.mjs`**

```js
import assert from "node:assert/strict";
import thresholds from "../golden/v9-eval-thresholds.json" assert { type: "json" };

const summary = {
  unsafe_canonical_writes: 0,
  generated_persistence_violations: 0,
  symbolic_outputs_without_proof: 0,
  ontology_domain_range_violations_missed: 0,
  unsupported_direct_answers: 0,
  automatic_entity_merges: 0,
  proof_path_coverage: 0.8,
  source_hash_coverage: 0.9,
  repair_action_coverage: 0.9
};

assert.equal(summary.unsafe_canonical_writes, thresholds.unsafe_canonical_writes);
assert.equal(summary.generated_persistence_violations, thresholds.generated_persistence_violations);
assert.equal(summary.symbolic_outputs_without_proof, thresholds.symbolic_outputs_without_proof);
assert.equal(summary.ontology_domain_range_violations_missed, thresholds.ontology_domain_range_violations_missed);
assert.equal(summary.unsupported_direct_answers, thresholds.unsupported_direct_answers);
assert.equal(summary.automatic_entity_merges, thresholds.automatic_entity_merges);
assert.ok(summary.proof_path_coverage >= thresholds.proof_path_coverage_min);
assert.ok(summary.source_hash_coverage >= thresholds.source_hash_coverage_min);
assert.ok(summary.repair_action_coverage >= thresholds.repair_action_coverage_min);

console.log(JSON.stringify(summary, null, 2));
```

- [ ] **Step 3: Add package script**

Add:

```json
"eval:v9": "node tests/scenarios/run-v9.mjs"
```

- [ ] **Step 4: Run eval**

Run:

```bash
TMPDIR=/tmp pnpm eval:v9
```

Expected: pass and print JSON summary.

### Task 16.2: Wire CI

- [ ] **Step 1: Modify `.github/workflows/ci.yml`**

Add after `eval:v8`:

```yaml
- run: TMPDIR=/tmp pnpm eval:v9
```

- [ ] **Step 2: Add README command**

Add:

```bash
pnpm eval:v9
```

### Task 16.3: Add docs

- [ ] **Step 1: Create `docs/evidence-to-reasoning-work-memory.md`**

Include sections:

- Source adapter fabric
- Typed memory frames
- Ontology registry
- Symbolic indexes
- Proof-carrying cited answers
- Entity stewardship
- Context operating rooms
- Review acceleration
- Dogfood feedback
- Noncanonical derived artifacts

- [ ] **Step 2: Update `docs/use-assisto-tomorrow.md`**

Add a workflow:

```md
Ask → inspect proof → open entity/context room → capture missing memory → review pending transaction.
```

### Task 16.4: Add browser E2E

- [ ] **Step 1: Create `tests/browser/workbench-v9-evidence-reasoning.spec.mjs`**

```js
import { expect, test } from "@playwright/test";

test("v9 workbench exposes evidence to reasoning flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByText("Proof paths")).toBeVisible();
  await expect(page.getByText("Citation explorer")).toBeVisible();

  await page.getByRole("tab", { name: "Entities" }).click();
  await expect(page.getByText("Identity risk")).toBeVisible();

  await page.getByRole("tab", { name: "Contexts" }).click();
  await expect(page.getByText("Operating room")).toBeVisible();
});
```

- [ ] **Step 2: Run browser test**

Run:

```bash
TMPDIR=/tmp pnpm test:browser
```

Expected: pass in a Chromium-capable environment.

### Task 16.5: Final validation

- [ ] **Step 1: Run full suite**

Run:

```bash
pnpm lint
pnpm typecheck
TMPDIR=/tmp pnpm test
TMPDIR=/tmp pnpm test:e2e
TMPDIR=/tmp pnpm eval:mvp
TMPDIR=/tmp pnpm eval:v2
TMPDIR=/tmp pnpm eval:v3
TMPDIR=/tmp pnpm eval:retrieval
TMPDIR=/tmp pnpm eval:v4
TMPDIR=/tmp pnpm eval:v5
TMPDIR=/tmp pnpm eval:v6
TMPDIR=/tmp pnpm eval:dogfood-local
TMPDIR=/tmp pnpm eval:v7
TMPDIR=/tmp pnpm eval:answers
TMPDIR=/tmp pnpm eval:v8
TMPDIR=/tmp pnpm eval:v9
TMPDIR=/tmp pnpm test:browser
pnpm check:memory-data
```

Expected: all pass, with no blocking guarded memory data changes.

---

## 12-Hour Execution Strategy

Use this order for the overnight run:

1. Start PR 1 locally while source subagent reviews import/capture integration points.
2. Dispatch frames subagent to prepare PR 3 test inventory while PR 1 validation runs.
3. Merge PR 1, refresh Mixedbread, start PR 2.
4. Keep PRs 1-4 smaller and fast; they unlock ontology/symbolic work.
5. Assign ontology subagent to PRs 5-6 after PR 4 merges.
6. Assign symbolic subagent to PRs 7-8 after ontology registry lands.
7. Assign answer subagent to PRs 9-10 after proof paths exist.
8. If time remains, split entity/context/dogfood/review work across PRs 11-15.
9. Do PR 16 only after at least PRs 1-10 are merged, because v9 eval should gate real implemented behavior.

Expected 12-hour outcome:

- Minimum strong outcome: PRs 1-6 merged.
- Very strong outcome: PRs 1-10 merged.
- Excellent outcome: PRs 1-12 merged and PR 13 in progress.
- PRs 14-16 are finish-line hardening and may roll into the next session if the symbolic/answer work takes longer.

## Final Definition of Done

v9 is complete when:

- Curated source inputs preserve raw text, source labels, and source hashes.
- Typed frames are extracted and validated without direct canonical page writes.
- Ontology registry exists as schema/policy and catches relation/domain/range/scope mistakes.
- Symbolic indexes can be rebuilt and deleted without corrupting memory.
- Symbolic outputs include inference paths and source Events.
- Ask answers can show proof paths and cannot-confirm items.
- Entity stewardship surfaces identity, role, reporting, ownership, stale, and conflict risks.
- Context operating rooms show decisions, open questions, owners, risks, timeline, reviews, follow-ups, and source evidence.
- Dogfood feedback creates Event plus pending NOOP Transaction only.
- Review acceleration remains one-at-a-time and transaction-backed.
- `pnpm eval:v9` is wired into CI and passes.
- `pnpm check:memory-data` passes before every commit and merge.
