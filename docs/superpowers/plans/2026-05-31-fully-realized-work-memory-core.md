# Fully Realized Work-Memory Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next ambitious Assisto program: safe source ingestion at real work scale, stronger cited answers, ontology-backed symbolic reasoning, richer context/entity operating surfaces, repair automation, maintenance cycles, dogfood evals, and portable cited context packs.

**Architecture:** Keep `memory/**/*.md` canonical and keep every durable write on the existing Event + Transaction path. Add new capability as derived, rebuildable, review-gated core modules in `packages/core`, then expose them through CLI, Workbench APIs, Pi instructions, tests, and evals. No vector/graph/MCP layer becomes canonical; semantic/symbolic/context-pack outputs stay disposable unless explicitly routed through Events and Transactions.

**Tech Stack:** TypeScript, Node stdlib, markdown files, existing core/CLI/Workbench/Pi packages, Playwright Chromium, deterministic eval runners, no new runtime dependencies unless a later PR proves parsing cannot be done safely with stdlib.

---

## Scope And Non-Negotiables

- Canonical mutation invariant remains:

  ```text
  Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
  ```

- Durable memory writes must go through Events and/or pending/applied Transactions.
- Existing untracked `memory/events/**` and `memory/transactions/**` are user dogfood data and must not be staged.
- `.assisto-local/**`, indexes, answer contracts, symbolic outputs, context packs, Workbench state, eval sessions, generated answers, and generated briefs are noncanonical.
- Source adapters may preserve raw text and source spans; they may not directly write current pages.
- Symbolic reasoning may infer, explain, route, and stage review; it may not write active canonical claims.
- Repair automation is preview-first and one-at-a-time unless a specific PR explicitly implements grouped preview without batch apply.
- Full meeting transcript ingestion remains out of scope. Use curated excerpts, source-span-aware sections, or reviewed import units only.

## Program Shape

Implement as **12 staged PRs**. Each PR should start from synced `main`, request review, address actionable review comments, pass CI, merge, sync local `main`, and refresh Mixedbread.

The PRs intentionally overlap the prior top-10 changes so each PR is large enough to move the product meaningfully while still having a testable boundary:

1. Source Adapter Fabric Core
2. Workday Capture Layer
3. Cited Answer Engine v3
4. Ontology Registry and Ontology-Aware Frames
5. Symbolic Reasoning and Proof Traces
6. Context Operating Rooms v3
7. Entity Stewardship Command Center v3
8. Review and Repair Autopilot
9. Maintenance / Dream Cycle
10. Personal Dogfood Eval Flywheel
11. Portable Cited Context Packs
12. Fully Realized Vision Hardening

## File Structure

### New Core Modules

- Create `packages/core/src/source-adapters/index.ts`
  - Owns adapter contracts, unit splitting, source spans, `source_hash`, duplicate detection helpers, and adapter import preview/create orchestration.
- Create `packages/core/src/source-adapters/markdown.ts`
  - Markdown/text adapter that splits files, pasted batches, frontmatter-like metadata, and curated excerpt boundaries.
- Create `packages/core/src/source-adapters/email.ts`
  - Email export adapter for `.eml`-like text, mailbox export snippets, sender/recipient/date metadata, and quoted-thread trimming.
- Create `packages/core/src/source-adapters/calendar.ts`
  - Calendar text/ICS-like adapter for event title, participants, observed time, and meeting-note attachment text.
- Create `packages/core/src/source-adapters/chat.ts`
  - Slack/Teams-style snippet adapter for channel, participants, timestamp, message permalink, and curated snippet text.
- Create `packages/core/src/workday-capture/index.ts`
  - Global capture presets, capture templates, source-label suggestions, context suggestions, and capture preview/create wrappers.
- Create `packages/core/src/answers/index.ts`
  - Cited Answer Engine v3 types and assembly helpers layered on current retrieval.
- Create `packages/core/src/ontology/index.ts`
  - Ontology registry loader, relation definitions, domain/range validation, scope requirements, inverse/transitive metadata, and version checks.
- Create `packages/core/src/symbolic/index.ts`
  - Derived symbolic index builder, proof traces, backward/forward inference, and symbolic review findings.
- Create `packages/core/src/contexts/index.ts`
  - Context operating room v3, timeline, answerable questions, missing-memory prompts, and quick action builders.
- Create `packages/core/src/repair/index.ts`
  - Repair action preview/stage dispatcher, risk ranking, target suggestions, and grouped preview models.
- Create `packages/core/src/maintenance/index.ts`
  - Dream-cycle audit runner, randomized lint plans, stale/duplicate/conflict/retrieval-miss clustering, and maintenance findings.
- Create `packages/core/src/context-packs/index.ts`
  - Portable pack builder for task/person/context/meeting/export packs with citations and warnings.

### Existing Core Modules To Modify

- Modify `packages/core/src/index.ts`
  - Export every new module.
- Modify `packages/core/src/retrieval/index.ts`
  - Delegate answer-contract assembly to `answers`, add ontology/symbolic hints without making them canonical.
- Modify `packages/core/src/capture/index.ts`
  - Accept richer capture options from workday capture while preserving Event + pending Transaction behavior.
- Modify `packages/core/src/import/index.ts`
  - Route curated Markdown/text import through source adapter contracts.
- Modify `packages/core/src/entities/index.ts`
  - Feed entity risk lanes from ontology and symbolic findings.
- Modify `packages/core/src/health/index.ts`
  - Include maintenance findings and dream-cycle summaries as derived health findings.
- Modify `packages/core/src/validators/index.ts`
  - Reject ontology-invalid relation frames, symbolic-output-only evidence, and active claims sourced only from generated artifacts.

### CLI / Workbench / Pi

- Modify `packages/cli/src/index.ts`
  - Add commands described per PR.
- Modify `packages/workbench/src/index.ts`
  - Add local endpoints and UI panels described per PR. If this file exceeds practical size during implementation, split into `packages/workbench/src/routes/*.ts` and `packages/workbench/src/client/*.ts` in the PR that first needs it.
- Modify `packages/pi-extension/src/index.ts`
  - Add Pi tools for source adapters, answer contract v3, context packs, repair previews, and maintenance plans.
- Modify `.pi/prompts/ask.md`
  - Teach Pi to prefer the v3 answer contract and cite proof traces.
- Modify `.pi/skills/work-memory-ingest/SKILL.md`
  - Teach Pi source adapter boundaries and curated excerpt handling.
- Modify `.pi/skills/work-memory-retrieve/SKILL.md`
  - Teach Pi ontology/symbolic hints and portable context packs.
- Modify `.pi/skills/work-memory-review/SKILL.md`
  - Teach Pi repair-autopilot preview/stage behavior.
- Modify `.pi/skills/work-memory-lint/SKILL.md`
  - Teach Pi maintenance/dream-cycle output boundaries.

### Schema / Docs / Tests

- Create `memory/schema/ontology/registry.json`
  - Versioned starter ontology.
- Create `memory/schema/ontology/relation-rules.md`
  - Human-readable policy for relation meanings and review gates.
- Modify `memory/schema/conventions.md`
  - Add source adapter, ontology, symbolic, and context-pack conventions.
- Modify `memory/schema/relation-types.md`
  - Align with registry relation names.
- Modify `memory/schema/validators.md`
  - Add implemented/designed validation rules for these PRs.
- Create or modify tests:
  - `tests/core-source-adapters.mjs`
  - `tests/core-workday-capture.mjs`
  - `tests/core-answer-contract-v3.mjs`
  - `tests/core-ontology.mjs`
  - `tests/core-symbolic.mjs`
  - `tests/core-contexts.mjs`
  - `tests/core-repair-autopilot.mjs`
  - `tests/core-maintenance.mjs`
  - `tests/core-context-packs.mjs`
  - `tests/browser/workbench-source-adapters.spec.mjs`
  - `tests/browser/workbench-answer-engine.spec.mjs`
  - `tests/browser/workbench-symbolic-context.spec.mjs`
  - `tests/browser/workbench-repair-maintenance.spec.mjs`
- Create evals:
  - `tests/scenarios/run-source-adapters.mjs`
  - `tests/scenarios/run-symbolic.mjs`
  - `tests/scenarios/run-context-packs.mjs`
  - `tests/scenarios/run-vision.mjs`
- Add thresholds:
  - `tests/golden/source-adapters-eval-thresholds.json`
  - `tests/golden/symbolic-eval-thresholds.json`
  - `tests/golden/context-packs-eval-thresholds.json`
  - `tests/golden/vision-eval-thresholds.json`
- Modify `package.json`
  - Add `eval:source-adapters`, `eval:symbolic`, `eval:context-packs`, `eval:vision`.

---

## PR 1: Source Adapter Fabric Core

**Branch:** `codex/source-adapter-fabric-core`

**Goal:** Add a generic adapter contract and concrete Markdown/text/email/calendar/chat adapters that all produce source-preserving Event + pending Transaction previews.

**Files:**
- Create: `packages/core/src/source-adapters/index.ts`
- Create: `packages/core/src/source-adapters/markdown.ts`
- Create: `packages/core/src/source-adapters/email.ts`
- Create: `packages/core/src/source-adapters/calendar.ts`
- Create: `packages/core/src/source-adapters/chat.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/import/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Create: `tests/core-source-adapters.mjs`
- Create: `tests/scenarios/run-source-adapters.mjs`
- Create: `tests/golden/source-adapters-eval-thresholds.json`
- Modify: `package.json`
- Modify: `docs/source-adapters.md`
- Modify: `memory/schema/conventions.md`

- [ ] **Step 1: Define adapter types with no side effects**

  Add these public shapes in `packages/core/src/source-adapters/index.ts`:

  ```ts
  export type SourceAdapterKind = "markdown" | "text" | "email" | "calendar" | "chat";

  export interface SourceSpan {
    source_path?: string;
    start_line?: number;
    end_line?: number;
    start_offset?: number;
    end_offset?: number;
    label?: string;
  }

  export interface SourceAdapterInput {
    kind: SourceAdapterKind;
    root: string;
    path?: string;
    rawText?: string;
    source_label?: string;
    observed_at?: string;
    context?: string;
    limit?: number;
    dryRun?: boolean;
  }

  export interface SourceAdapterUnit {
    unit_id: string;
    adapter_kind: SourceAdapterKind;
    raw_text: string;
    source_label: string;
    source_hash: string;
    observed_at: string | null;
    contexts: string[];
    source_spans: SourceSpan[];
    metadata: Record<string, string>;
    duplicate_state: "new" | "duplicate";
    skip_reason?: string;
  }

  export interface SourceAdapterPreviewResult {
    adapter_kind: SourceAdapterKind;
    units: SourceAdapterUnit[];
    review_load_forecast: {
      total_units: number;
      likely_safe: number;
      likely_staged: number;
      likely_conflict: number;
      duplicates: number;
    };
    warnings: string[];
  }

  export interface SourceAdapterCreateResult extends SourceAdapterPreviewResult {
    created_events: string[];
    pending_transactions: string[];
  }
  ```

- [ ] **Step 2: Write failing adapter tests**

  Add `tests/core-source-adapters.mjs` cases:

  ```js
  test("markdown adapter splits curated units and hashes raw text", async () => {
    const preview = await previewSourceAdapterImport({
      kind: "markdown",
      root,
      rawText: "Jeff is my manager.\\n---\\nInventory Project uses MySQL.",
      source_label: "import:curated-notes"
    });
    assert.equal(preview.units.length, 2);
    assert.match(preview.units[0].source_hash, /^sha256:/);
    assert.equal(preview.units[0].duplicate_state, "new");
  });

  test("adapter create writes only Events and pending Transactions", async () => {
    const beforePeople = await safeRead(root, "memory/people/jeff.md");
    const result = await createSourceAdapterImport({
      kind: "markdown",
      root,
      rawText: "Jeff is my manager.",
      source_label: "import:curated-notes"
    });
    assert.equal(result.created_events.length, 1);
    assert.equal(result.pending_transactions.length, 1);
    assert.equal(await safeRead(root, "memory/people/jeff.md"), beforePeople);
  });
  ```

- [ ] **Step 3: Implement hashing and duplicate scan**

  Implement `sha256:<hex>` using Node `crypto.createHash("sha256")`.
  Detect duplicates by scanning existing Event frontmatter for matching `source_hash`.

- [ ] **Step 4: Implement concrete adapters**

  - Markdown/text: split pasted batches on lines containing only `---`; skip empty units.
  - Email: parse `From:`, `To:`, `Date:`, `Subject:` headers when present; strip quoted lines beginning with `>`.
  - Calendar: parse `SUMMARY:`, `DTSTART:`, `ATTENDEE:` when present; store as metadata.
  - Chat: parse lines shaped like `[2026-05-31 09:10] Name: message`; preserve channel/permalink metadata when supplied.

- [ ] **Step 5: Route create through existing ingest/import helpers**

  Use existing capture/import functions to create Event + pending Transaction per kept unit. Do not apply Transactions.

- [ ] **Step 6: Add CLI**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm source import --kind markdown --path <file-or-dir> --dry-run
  pnpm --filter @assisto/cli wm source import --kind email --file <path> --source-label <label>
  ```

- [ ] **Step 7: Add Workbench endpoints**

  Add:

  ```text
  POST /api/source-adapters/preview
  POST /api/source-adapters/import
  ```

- [ ] **Step 8: Add eval**

  Add `pnpm eval:source-adapters` with gates:

  ```json
  {
    "unsafeCanonicalWritesMax": 0,
    "eventRawTextRewriteMax": 0,
    "duplicateImportPreventionMin": 1,
    "sourceHashCoverageMin": 1,
    "sourceSpanCoverageMin": 0.9
  }
  ```

- [ ] **Step 9: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:source-adapters
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/source-adapters packages/core/src/index.ts packages/core/src/import/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts tests/core-source-adapters.mjs tests/scenarios/run-source-adapters.mjs tests/golden/source-adapters-eval-thresholds.json package.json docs/source-adapters.md memory/schema/conventions.md
  git commit -m "feat: add source adapter fabric core"
  ```

---

## PR 2: Workday Capture Layer

**Branch:** `codex/workday-capture-layer`

**Goal:** Make capture ambient and context-aware: global Workbench capture, templates, source-label presets, context suggestions, and CLI parity.

**Files:**
- Create: `packages/core/src/workday-capture/index.ts`
- Modify: `packages/core/src/capture/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `packages/pi-extension/src/index.ts`
- Modify: `.pi/skills/work-memory-ingest/SKILL.md`
- Create: `tests/core-workday-capture.mjs`
- Modify: `tests/browser/workbench-capture-console.spec.mjs`
- Modify: `docs/use-assisto-tomorrow.md`

- [ ] **Step 1: Define capture presets**

  Implement:

  ```ts
  export interface WorkdayCapturePreset {
    preset_id: string;
    label: string;
    source_label: string;
    template: string;
    suggested_contexts: string[];
    provider: "rule" | "openai";
  }

  export interface WorkdayCapturePreview {
    note: string;
    preset?: WorkdayCapturePreset;
    candidate_claims: string[];
    likely_reviews: string[];
    validation_warnings: string[];
    event_preview: { source_label: string; observed_at: string | null };
    pending_transaction_preview: { operation_count: number; affected_files: string[] };
  }
  ```

- [ ] **Step 2: Add presets**

  Include these built-in presets:

  ```text
  quick-note
  meeting-note
  person-fact
  project-context
  follow-up
  retrieval-miss
  correction
  decision-as-claim
  open-question-as-claim
  ```

- [ ] **Step 3: Add tests for preview-first global capture**

  Verify preview does not write Event, Transaction, or current pages.

- [ ] **Step 4: Add Workbench global capture modal**

  Add a button available on every tab. The modal fields are:

  ```text
  note
  preset
  observed_at
  source_label
  context
  provider
  preview
  create
  ```

- [ ] **Step 5: Add CLI**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm capture quick --preset meeting-note --context ctx_inventory_project --stdin
  pnpm --filter @assisto/cli wm capture presets --json
  ```

- [ ] **Step 6: Add Pi tool**

  Add `wm_capture_quick` with the same argument shape as CLI. It must preview by default unless `create: true` is explicit.

- [ ] **Step 7: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/workday-capture packages/core/src/capture/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts packages/pi-extension/src/index.ts .pi/skills/work-memory-ingest/SKILL.md tests/core-workday-capture.mjs tests/browser/workbench-capture-console.spec.mjs docs/use-assisto-tomorrow.md
  git commit -m "feat: add workday capture layer"
  ```

---

## PR 3: Cited Answer Engine v3

**Branch:** `codex/cited-answer-engine-v3`

**Goal:** Split answer assembly from retrieval and make answers stricter: direct answers must be individually cited, cannot-confirm items must be explicit, and repair actions must point to safe next steps.

**Files:**
- Create: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/retrieval/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `.pi/prompts/ask.md`
- Modify: `.pi/skills/work-memory-retrieve/SKILL.md`
- Create: `tests/core-answer-contract-v3.mjs`
- Modify: `tests/scenarios/run-answers.mjs`
- Modify: `tests/golden/answers-eval-thresholds.json`
- Modify: `docs/cited-work-memory.md`

- [ ] **Step 1: Define strict answer contract**

  Add:

  ```ts
  export interface CitedAnswerV3 {
    question: string;
    queryIntent: RetrievalQueryIntent;
    directAnswers: Array<{
      answer_id: string;
      text: string;
      answer_kind: "fact" | "relationship" | "status" | "history" | "instruction";
      confidence_label: "source-backed" | "partial" | "contested";
      citations: AnswerCitation[];
      inference_paths: string[];
    }>;
    cannotConfirm: Array<{
      item_id: string;
      text: string;
      missing_evidence: string[];
      repair_action_ids: string[];
    }>;
    conflicts: AnswerConflict[];
    staleSignals: AnswerStaleSignal[];
    citationMap: AnswerCitationMap;
    repairActions: RetrievalManualAction[];
    contextPack: string;
    warnings: string[];
  }
  ```

- [ ] **Step 2: Add unit tests for unsupported answer refusal**

  Assert manager/reporting, role changes, source evidence, review risks, follow-ups, and no-match behavior.

- [ ] **Step 3: Implement answer assembly**

  Assembly order:

  ```text
  exact page claims
  relation claims
  linked review/followup items
  hydrated evidence Events
  ontology-expanded candidates if available
  symbolic hints if available
  cannotConfirm and repairActions
  ```

- [ ] **Step 4: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm ask --contract-v3 "Who owns inventory?"
  GET /api/ask/contract-v3?q=<question>
  ```

- [ ] **Step 5: Upgrade Ask UI**

  Render:

  ```text
  What memory can say
  What memory cannot confirm
  Conflicts and stale signals
  Citations
  Source Event preview
  Repair actions
  ContextPack export
  ```

- [ ] **Step 6: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:answers
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/answers packages/core/src/retrieval/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts .pi/prompts/ask.md .pi/skills/work-memory-retrieve/SKILL.md tests/core-answer-contract-v3.mjs tests/scenarios/run-answers.mjs tests/golden/answers-eval-thresholds.json docs/cited-work-memory.md
  git commit -m "feat: add cited answer engine v3"
  ```

---

## PR 4: Ontology Registry And Ontology-Aware Frames

**Branch:** `codex/ontology-registry`

**Goal:** Add a versioned relation registry and validate ontology-aware extraction frames without creating a graph database.

**Files:**
- Create: `memory/schema/ontology/registry.json`
- Create: `memory/schema/ontology/relation-rules.md`
- Create: `packages/core/src/ontology/index.ts`
- Modify: `packages/core/src/extraction/index.ts`
- Modify: `packages/core/src/ingest/transaction-builder.ts`
- Modify: `packages/core/src/validators/index.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/core-ontology.mjs`
- Modify: `memory/schema/relation-types.md`
- Modify: `memory/schema/validators.md`
- Modify: `docs/ontology-and-symbolic-reasoning.md`

- [ ] **Step 1: Add starter ontology**

  `memory/schema/ontology/registry.json`:

  ```json
  {
    "ontology_version": "2026-05-31.1",
    "entity_kinds": ["Person", "Context", "Topic", "System", "Team", "Role"],
    "relations": [
      {
        "relation": "reports_to",
        "domain": "Person",
        "range": "Person",
        "inverse": "manages",
        "requires_scope": true,
        "review_risk": "high"
      },
      {
        "relation": "owns",
        "domain": ["Person", "Team"],
        "range": ["Context", "System", "Topic"],
        "inverse": "owned_by",
        "requires_scope": true,
        "review_risk": "medium"
      },
      {
        "relation": "uses_technology",
        "domain": "Context",
        "range": "Topic",
        "requires_scope": true,
        "review_risk": "medium"
      },
      {
        "relation": "depends_on",
        "domain": ["Context", "System"],
        "range": ["Context", "System", "Topic"],
        "requires_scope": true,
        "review_risk": "medium"
      }
    ]
  }
  ```

- [ ] **Step 2: Implement loader and validator**

  Add `loadOntologyRegistry(root)` and `validateOntologyFrame(frame, registry)`.

- [ ] **Step 3: Add ontology-aware frame type**

  Add:

  ```ts
  export interface OntologyAwareFrame {
    subject_id?: string;
    subject_kind: string;
    relation: string;
    object_id?: string;
    object_kind: string;
    statement: string;
    scope?: string;
    evidence: string[];
  }
  ```

- [ ] **Step 4: Stage invalid frames**

  Invalid relation, invalid domain/range, missing scope, or high-risk relation changes must stage review instead of creating active claims.

- [ ] **Step 5: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:v8
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add memory/schema/ontology packages/core/src/ontology packages/core/src/extraction/index.ts packages/core/src/ingest/transaction-builder.ts packages/core/src/validators/index.ts packages/core/src/index.ts tests/core-ontology.mjs memory/schema/relation-types.md memory/schema/validators.md docs/ontology-and-symbolic-reasoning.md
  git commit -m "feat: add ontology registry and frame validation"
  ```

---

## PR 5: Symbolic Reasoning And Proof Traces

**Branch:** `codex/symbolic-reasoning-proof-traces`

**Goal:** Add derived forward/backward inference with proof traces, rebuildable symbolic indexes, and review findings.

**Files:**
- Create: `packages/core/src/symbolic/index.ts`
- Modify: `packages/core/src/ontology/index.ts`
- Modify: `packages/core/src/retrieval/index.ts`
- Modify: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/health/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Create: `tests/core-symbolic.mjs`
- Create: `tests/scenarios/run-symbolic.mjs`
- Create: `tests/golden/symbolic-eval-thresholds.json`
- Modify: `package.json`
- Modify: `docs/ontology-and-symbolic-reasoning.md`

- [ ] **Step 1: Define symbolic types**

  Add:

  ```ts
  export interface InferencePath {
    path_id: string;
    rule_id: string;
    derived_statement: string;
    source_claim_ids: string[];
    source_event_ids: string[];
    confidence_label: "derived" | "partial" | "contested";
    explanation: string;
  }

  export interface SymbolicReasoningResult {
    generated_at: string;
    ontology_version: string;
    input_hash: string;
    inference_paths: InferencePath[];
    review_findings: Array<{
      finding_id: string;
      reason: "missing_scope" | "conflict" | "stale_signal" | "invalid_relation" | "missing_evidence";
      statement: string;
      source_claim_ids: string[];
      suggested_repair: string;
    }>;
    warnings: string[];
  }
  ```

- [ ] **Step 2: Implement forward inference**

  Supported first rules:

  ```text
  reports_to(A, B) => manages(B, A)
  owns(A, Context) + depends_on(Context, System) => ownership_attention(A, System)
  active role claim + superseded role claim => role_change_history
  stale valid_to/observed_at signals => stale_signal
  ```

- [ ] **Step 3: Implement backward inference**

  For questions such as “Who owns X?” or “Why do we think X?”, return proof paths or cannot-confirm missing evidence.

- [ ] **Step 4: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm symbolic build --dry-run
  pnpm --filter @assisto/cli wm symbolic explain "Who owns inventory?"
  GET /api/symbolic/explain?q=<question>
  ```

- [ ] **Step 5: Add eval**

  Gates:

  ```json
  {
    "canonicalWriteViolationsMax": 0,
    "proofTraceCoverageMin": 0.95,
    "unsupportedInferenceMax": 0,
    "missingEvidenceSurfacedMin": 1
  }
  ```

- [ ] **Step 6: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:symbolic
  TMPDIR=/tmp pnpm eval:answers
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/symbolic packages/core/src/ontology/index.ts packages/core/src/retrieval/index.ts packages/core/src/answers/index.ts packages/core/src/health/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts tests/core-symbolic.mjs tests/scenarios/run-symbolic.mjs tests/golden/symbolic-eval-thresholds.json package.json docs/ontology-and-symbolic-reasoning.md
  git commit -m "feat: add symbolic reasoning proof traces"
  ```

---

## PR 6: Context Operating Rooms v3

**Branch:** `codex/context-operating-rooms-v3`

**Goal:** Make Contexts the daily project operating surface with state, owners, decisions, open questions, risk, timeline, symbolic proof paths, and quick repair/capture actions.

**Files:**
- Create: `packages/core/src/contexts/index.ts`
- Modify: `packages/core/src/entities/index.ts`
- Modify: `packages/core/src/briefs/index.ts`
- Modify: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Create: `tests/core-contexts.mjs`
- Modify: `tests/browser/workbench-entities.spec.mjs`
- Modify: `docs/cited-work-memory.md`
- Modify: `docs/workbench.md`

- [ ] **Step 1: Define context room result**

  Add:

  ```ts
  export interface ContextOperatingRoomV3 {
    context: { id: string; path: string; name: string };
    currentState: PackedClaim[];
    owners: PackedClaim[];
    systems: PackedClaim[];
    decisions: PackedClaim[];
    openQuestions: PackedClaim[];
    risks: PackedClaim[];
    recentChanges: PackedEvidenceEvent[];
    staleClaims: PackedClaim[];
    reviewQueue: PackedLinkedItem[];
    followupQueue: PackedLinkedItem[];
    symbolicPaths: InferencePath[];
    answerableQuestions: string[];
    missingMemoryPrompts: string[];
    quickActions: RetrievalManualAction[];
    contextPack: string;
    warnings: string[];
  }
  ```

- [ ] **Step 2: Implement section builders**

  Build decisions/open questions as claim-pattern sections, not standalone pages.

- [ ] **Step 3: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm context room <id|path> --json
  GET /api/contexts/room?id=<id|path>
  ```

- [ ] **Step 4: Upgrade Workbench context UI**

  Render tabs:

  ```text
  Overview
  Facts
  Owners/Roles
  Decisions
  Open Questions
  Risks
  Timeline
  Reviews
  Follow-ups
  Proofs
  Brief
  Repair
  ```

- [ ] **Step 5: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:v8
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/contexts packages/core/src/entities/index.ts packages/core/src/briefs/index.ts packages/core/src/answers/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts tests/core-contexts.mjs tests/browser/workbench-entities.spec.mjs docs/cited-work-memory.md docs/workbench.md
  git commit -m "feat: add context operating rooms v3"
  ```

---

## PR 7: Entity Stewardship Command Center v3

**Branch:** `codex/entity-stewardship-command-center`

**Goal:** Make People/Topics/Contexts stewardship a serious risk command center with identity risk, relation history, symbolic findings, and one-at-a-time repair staging.

**Files:**
- Modify: `packages/core/src/entities/index.ts`
- Modify: `packages/core/src/ontology/index.ts`
- Modify: `packages/core/src/symbolic/index.ts`
- Modify: `packages/core/src/repair/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Create: `tests/core-entity-stewardship-v3.mjs`
- Modify: `tests/browser/workbench-entities.spec.mjs`
- Modify: `docs/cited-work-memory.md`
- Modify: `docs/repair-actions.md`

- [ ] **Step 1: Extend risk model**

  Add fields:

  ```text
  identityRisk
  nearDuplicates
  aliasConflicts
  roleChanges
  reportingChanges
  ownershipChanges
  staleClaims
  conflictingClaims
  symbolicFindings
  recommendedReviewLane
  repairActions
  ```

- [ ] **Step 2: Add repair previews**

  Supported previews:

  ```text
  stage_alias_correction
  stage_role_correction
  stage_reporting_correction
  stage_ownership_correction
  stage_identity_review
  ```

- [ ] **Step 3: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm entities command-center --kind person --json
  GET /api/entities/command-center?kind=person|topic|context
  GET /api/entities/command-center/detail?id=<id|path>
  ```

- [ ] **Step 4: Upgrade Workbench UI**

  Use risk lanes:

  ```text
  Identity Risk
  Role/Reporting Changes
  Ownership Changes
  Stale Claims
  Conflicts
  Missing Evidence
  Safe Repairs
  ```

- [ ] **Step 5: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:v8
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/entities/index.ts packages/core/src/ontology/index.ts packages/core/src/symbolic/index.ts packages/core/src/repair/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts tests/core-entity-stewardship-v3.mjs tests/browser/workbench-entities.spec.mjs docs/cited-work-memory.md docs/repair-actions.md
  git commit -m "feat: add entity stewardship command center"
  ```

---

## PR 8: Review And Repair Autopilot

**Branch:** `codex/review-repair-autopilot`

**Goal:** Turn review/repair into a fast, ranked, preview-first control surface that suggests safe next actions without autonomous mutation.

**Files:**
- Create: `packages/core/src/repair/index.ts` if not already created
- Modify: `packages/core/src/review/index.ts`
- Modify: `packages/core/src/health/index.ts`
- Modify: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/entities/index.ts`
- Modify: `packages/core/src/contexts/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `.pi/skills/work-memory-review/SKILL.md`
- Create: `tests/core-repair-autopilot.mjs`
- Modify: `tests/browser/workbench-review-console.spec.mjs`
- Modify: `docs/repair-actions.md`

- [ ] **Step 1: Define repair autopilot queue**

  Add:

  ```ts
  export interface RepairQueueItem {
    item_id: string;
    source: "answer" | "entity" | "context" | "health" | "review" | "maintenance";
    severity: "low" | "medium" | "high";
    reason: string;
    affected_files: string[];
    source_event_ids: string[];
    suggested_action: RetrievalManualAction;
    preview_required: true;
  }
  ```

- [ ] **Step 2: Implement ranking**

  Order:

  ```text
  P1 invariant risk
  unsafe canonical write risk
  identity false-merge risk
  role/reporting/ownership conflict
  missing evidence for direct answer
  stale current-state claim
  retrieval miss cluster
  low-risk hygiene
  ```

- [ ] **Step 3: Add grouped preview only**

  Grouped preview may show multiple related items. Apply remains one-at-a-time.

- [ ] **Step 4: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm repair queue --json
  pnpm --filter @assisto/cli wm repair preview <item-id>
  POST /api/repair/queue
  POST /api/repair/preview
  POST /api/repair/stage
  ```

- [ ] **Step 5: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:answers
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/repair packages/core/src/review/index.ts packages/core/src/health/index.ts packages/core/src/answers/index.ts packages/core/src/entities/index.ts packages/core/src/contexts/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts .pi/skills/work-memory-review/SKILL.md tests/core-repair-autopilot.mjs tests/browser/workbench-review-console.spec.mjs docs/repair-actions.md
  git commit -m "feat: add review repair autopilot"
  ```

---

## PR 9: Maintenance / Dream Cycle

**Branch:** `codex/maintenance-dream-cycle`

**Goal:** Add explicit, derived maintenance passes for stale claims, duplicate candidates, contradiction clusters, missing evidence, orphan pages, retrieval misses, and review backlog pressure.

**Files:**
- Create: `packages/core/src/maintenance/index.ts`
- Modify: `packages/core/src/health/index.ts`
- Modify: `packages/core/src/lint/index.ts`
- Modify: `packages/core/src/repair/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `.pi/skills/work-memory-lint/SKILL.md`
- Create: `tests/core-maintenance.mjs`
- Modify: `tests/browser/workbench-health-remediation.spec.mjs`
- Modify: `docs/workbench.md`
- Modify: `docs/revised-design.md`

- [ ] **Step 1: Define maintenance plan/result**

  Add:

  ```ts
  export interface MaintenanceRunPlan {
    run_id: string;
    mode: "changed" | "random" | "topic" | "full";
    sample_size: number;
    seed: string;
    target_paths: string[];
    created_at: string;
  }

  export interface MaintenanceFinding {
    finding_id: string;
    kind:
      | "duplicate_candidate"
      | "stale_claim"
      | "contradiction"
      | "missing_evidence"
      | "orphan_page"
      | "review_backlog"
      | "retrieval_miss_cluster";
    severity: "low" | "medium" | "high";
    affected_files: string[];
    source_event_ids: string[];
    recommended_repair: string;
  }
  ```

- [ ] **Step 2: Store run state locally only**

  Use `.assisto-local/lint-runs/<run-id>.json`. Do not write canonical ReviewItems unless the user stages a repair Transaction.

- [ ] **Step 3: Add CLI/API**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm maintenance plan --mode random --sample 8 --json
  pnpm --filter @assisto/cli wm maintenance run --mode changed --stage-finding <finding-id>
  GET /api/maintenance/plan
  POST /api/maintenance/run
  POST /api/maintenance/stage-finding
  ```

- [ ] **Step 4: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/maintenance packages/core/src/health/index.ts packages/core/src/lint/index.ts packages/core/src/repair/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts .pi/skills/work-memory-lint/SKILL.md tests/core-maintenance.mjs tests/browser/workbench-health-remediation.spec.mjs docs/workbench.md docs/revised-design.md
  git commit -m "feat: add maintenance dream cycle"
  ```

---

## PR 10: Personal Dogfood Eval Flywheel

**Branch:** `codex/personal-dogfood-eval-flywheel`

**Goal:** Make personal evals a first-class feedback loop that scores real private questions and turns misses into safe repair/capture suggestions.

**Files:**
- Modify: `packages/core/src/dogfood-eval/index.ts`
- Modify: `packages/core/src/friction/index.ts`
- Modify: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/repair/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `tests/core-dogfood-eval.mjs`
- Modify: `tests/scenarios/run-dogfood-local.mjs`
- Modify: `tests/browser/workbench-dogfood-eval.spec.mjs`
- Modify: `docs/first-week-with-assisto.md`
- Modify: `docs/use-assisto-tomorrow.md`

- [ ] **Step 1: Extend question schema**

  Support:

  ```json
  {
    "question": "Who owns Inventory?",
    "expected_claim_ids": ["clm_inventory_owner"],
    "expected_event_ids": ["ev_2026_05_20_001"],
    "expected_page_paths": ["memory/contexts/inventory.md"],
    "expected_cannot_confirm": ["deployment window"],
    "expected_repair_actions": ["capture_note"],
    "tags": ["inventory", "ownership"]
  }
  ```

- [ ] **Step 2: Score repair usefulness**

  Add metrics:

  ```text
  answerability
  citation_coverage
  irrelevant_inclusion_count
  cannot_confirm_quality
  repair_action_precision
  review_followup_surfacing
  generated_persistence_violations
  regression_since_last_run
  ```

- [ ] **Step 3: Add miss-to-repair flow**

  A failed expectation should offer:

  ```text
  capture missing evidence
  log retrieval miss
  stage entity review
  open context room
  add question to pinned set
  ```

- [ ] **Step 4: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:dogfood-local
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/dogfood-eval/index.ts packages/core/src/friction/index.ts packages/core/src/answers/index.ts packages/core/src/repair/index.ts packages/cli/src/index.ts packages/workbench/src/index.ts tests/core-dogfood-eval.mjs tests/scenarios/run-dogfood-local.mjs tests/browser/workbench-dogfood-eval.spec.mjs docs/first-week-with-assisto.md docs/use-assisto-tomorrow.md
  git commit -m "feat: strengthen personal dogfood eval flywheel"
  ```

---

## PR 11: Portable Cited Context Packs

**Branch:** `codex/portable-cited-context-packs`

**Goal:** Let Assisto produce portable, task-specific, cited memory packs for Codex, Pi, ChatGPT, meetings, people, contexts, and debugging sessions.

**Files:**
- Create: `packages/core/src/context-packs/index.ts`
- Modify: `packages/core/src/retrieval/index.ts`
- Modify: `packages/core/src/answers/index.ts`
- Modify: `packages/core/src/briefs/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/pi-extension/src/index.ts`
- Modify: `packages/workbench/src/index.ts`
- Modify: `.pi/skills/work-memory-retrieve/SKILL.md`
- Create: `tests/core-context-packs.mjs`
- Create: `tests/scenarios/run-context-packs.mjs`
- Create: `tests/golden/context-packs-eval-thresholds.json`
- Modify: `package.json`
- Modify: `docs/cited-work-memory.md`

- [ ] **Step 1: Define pack types**

  Add:

  ```ts
  export type ContextPackKind = "task" | "person" | "context" | "meeting" | "debugging" | "agent-handoff";

  export interface PortableContextPack {
    pack_id: string;
    kind: ContextPackKind;
    target?: string;
    generated_at: string;
    instructions: string;
    active_claims: PackedClaim[];
    uncertain_claims: PackedClaim[];
    evidence_events: PackedEvidenceEvent[];
    conflicts: AnswerConflict[];
    stale_signals: AnswerStaleSignal[];
    repair_actions: RetrievalManualAction[];
    cannot_confirm: AnswerCannotConfirm[];
    compact_markdown: string;
    warnings: string[];
  }
  ```

- [ ] **Step 2: Implement pack builder**

  Builders:

  ```text
  buildTaskPack(root, question)
  buildPersonPack(root, idOrPath)
  buildContextPack(root, idOrPath)
  buildMeetingPack(root, personOrContext)
  buildDebuggingPack(root, contextId)
  buildAgentHandoffPack(root, objective)
  ```

- [ ] **Step 3: Add CLI/API/Pi**

  Add:

  ```bash
  pnpm --filter @assisto/cli wm pack task "Prepare for Inventory review"
  pnpm --filter @assisto/cli wm pack context ctx_inventory_project --format markdown
  GET /api/context-packs/build?kind=context&target=<id>
  ```

  Pi tool: `wm_context_pack_build`.

- [ ] **Step 4: Add eval**

  Gates:

  ```json
  {
    "citationCoverageMin": 0.95,
    "unsupportedPackClaimsMax": 0,
    "generatedPersistenceViolationsMax": 0,
    "cannotConfirmCoverageMin": 0.8
  }
  ```

- [ ] **Step 5: Validate and commit**

  Run:

  ```bash
  pnpm lint
  pnpm typecheck
  TMPDIR=/tmp pnpm test
  TMPDIR=/tmp pnpm eval:context-packs
  TMPDIR=/tmp pnpm test:browser
  pnpm check:memory-data
  ```

  Commit:

  ```bash
  git add packages/core/src/context-packs packages/core/src/retrieval/index.ts packages/core/src/answers/index.ts packages/core/src/briefs/index.ts packages/core/src/index.ts packages/cli/src/index.ts packages/pi-extension/src/index.ts packages/workbench/src/index.ts .pi/skills/work-memory-retrieve/SKILL.md tests/core-context-packs.mjs tests/scenarios/run-context-packs.mjs tests/golden/context-packs-eval-thresholds.json package.json docs/cited-work-memory.md
  git commit -m "feat: add portable cited context packs"
  ```

---

## PR 12: Fully Realized Vision Hardening

**Branch:** `codex/fully-realized-vision-hardening`

**Goal:** Add final eval gates, docs, browser E2E, and policy checks that prove the ten bold changes preserve the core safety model.

**Files:**
- Create: `tests/scenarios/run-vision.mjs`
- Create: `tests/golden/vision-eval-thresholds.json`
- Modify: `package.json`
- Modify: `tests/browser/workbench-v7-first-day-flow.spec.mjs`
- Create: `tests/browser/workbench-vision-flow.spec.mjs`
- Modify: `docs/revised-design.md`
- Modify: `docs/implementation-plan.md`
- Modify: `docs/use-assisto-tomorrow.md`
- Modify: `docs/first-week-with-assisto.md`
- Modify: `docs/wsl2-handoff.md`
- Modify: `README.md`

- [ ] **Step 1: Add `eval:vision`**

  Add to `package.json`:

  ```json
  "eval:vision": "node tests/scenarios/run-vision.mjs"
  ```

- [ ] **Step 2: Add vision scenario**

  Scenario must cover:

  ```text
  source adapter import from curated notes
  ambient workday capture
  cited answer v3
  ontology frame validation
  symbolic proof trace
  context operating room
  entity stewardship command center
  repair autopilot preview and stage
  maintenance finding
  dogfood eval miss-to-repair
  portable context pack
  no generated persistence
  no direct canonical writes
  no Event raw rewrite
  ```

- [ ] **Step 3: Add thresholds**

  `tests/golden/vision-eval-thresholds.json`:

  ```json
  {
    "unsafeCanonicalWritesMax": 0,
    "generatedPersistenceViolationsMax": 0,
    "autonomousMergesMax": 0,
    "autonomousSupersessionsMax": 0,
    "eventRawTextRewritesMax": 0,
    "sourceAdapterSuccessMin": 1,
    "answerContractCoverageMin": 1,
    "proofTraceCoverageMin": 1,
    "contextRoomSuccessMin": 1,
    "repairPreviewSuccessMin": 1,
    "contextPackCitationCoverageMin": 0.95
  }
  ```

- [ ] **Step 4: Add browser end-to-end**

  `tests/browser/workbench-vision-flow.spec.mjs` should drive:

  ```text
  import curated note
  quick capture
  ask with answer contract
  open citation explorer
  open entity command center
  open context room
  preview repair
  run maintenance
  build context pack
  verify no canonical page changed outside validated transaction
  ```

- [ ] **Step 5: Update docs and handoff**

  README should state:

  ```text
  Assisto now has safe source adapters, ambient capture, cited answers, ontology-backed symbolic reasoning, entity/context command centers, repair autopilot, maintenance cycles, personal evals, and portable context packs.
  ```

  `docs/wsl2-handoff.md` must include:

  ```bash
  pnpm eval:source-adapters
  pnpm eval:symbolic
  pnpm eval:context-packs
  pnpm eval:vision
  ```

- [ ] **Step 6: Full validation**

  Run:

  ```bash
  pnpm validate:local
  TMPDIR=/tmp pnpm eval:source-adapters
  TMPDIR=/tmp pnpm eval:symbolic
  TMPDIR=/tmp pnpm eval:context-packs
  TMPDIR=/tmp pnpm eval:vision
  pnpm check:memory-data
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add tests/scenarios/run-vision.mjs tests/golden/vision-eval-thresholds.json package.json tests/browser/workbench-v7-first-day-flow.spec.mjs tests/browser/workbench-vision-flow.spec.mjs docs/revised-design.md docs/implementation-plan.md docs/use-assisto-tomorrow.md docs/first-week-with-assisto.md docs/wsl2-handoff.md README.md
  git commit -m "test: add fully realized vision hardening"
  ```

---

## PR Workflow For Every PR

- [ ] Sync:

  ```bash
  git switch main
  git pull
  git status --short --branch
  ```

- [ ] Create branch:

  ```bash
  git switch -c codex/<branch-name>
  ```

- [ ] Run relevant tests locally before pushing.

- [ ] Always run:

  ```bash
  pnpm check:memory-data
  ```

- [ ] Push and open PR:

  ```bash
  git push -u origin codex/<branch-name>
  gh pr create --base main --head codex/<branch-name> --title "<title>" --body "<summary, validation, invariants>"
  gh pr comment <pr-number> --body "@codex review"
  ```

- [ ] Wait/check review:

  ```bash
  pnpm pr:review-wait <pr-number>
  ```

- [ ] If Copilot review service errors with no actionable threads, follow the user instruction to treat it as non-actionable.

- [ ] If actionable review threads exist, fix them, reply with the fix commit and behavior/test, resolve threads, and rerun validation.

- [ ] Merge only when:

  ```text
  CI green
  no unresolved actionable review threads
  PR mergeable and non-draft
  pnpm check:memory-data passes
  ```

- [ ] After merge:

  ```bash
  git switch main
  git pull
  git status --short --branch
  pnpm mxbai:upload
  pnpm mxbai:smoke
  ```

---

## Final Validation Matrix

Run at the end of PR 12:

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
TMPDIR=/tmp pnpm eval:source-adapters
TMPDIR=/tmp pnpm eval:symbolic
TMPDIR=/tmp pnpm eval:context-packs
TMPDIR=/tmp pnpm eval:vision
TMPDIR=/tmp pnpm test:browser
pnpm check:memory-data
```

Preferred wrapper when possible:

```bash
pnpm validate:local
```

## Self-Review

- Spec coverage: all ten bold changes are mapped to PRs. Source adapters: PR 1. Cited answers: PR 3. Ontology and symbolic reasoning: PR 4 and PR 5. Context rooms: PR 6. Entity stewardship: PR 7. Repair autopilot: PR 8. Workday capture: PR 2. Maintenance cycles: PR 9. Dogfood eval: PR 10. Portable context packs: PR 11. Final hardening: PR 12.
- Placeholder scan: no intentionally open TBD/TODO items are present. The plan names exact files, commands, APIs, tests, evals, and commit messages.
- Type consistency: `CitedAnswerV3`, `InferencePath`, `PortableContextPack`, `RepairQueueItem`, `SourceAdapterUnit`, and related interfaces are defined before later tasks consume them.
- Safety check: every durable write remains Event/Transaction-backed; symbolic, ontology, adapter, answer, brief, eval, and context-pack outputs are derived unless staged through review.
