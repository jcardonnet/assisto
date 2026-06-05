# Performance Baseline Design

Status: Wave 0 synthesis  
Date: 2026-06-02

This design defines benchmark and normalization expectations for later baseline runners. It does not add performance code or committed thresholds.

## Existing Hooks

- `package.json` exposes retrieval, answers, context pack, local validation, and memory-data checks.
- `tests/scenarios/run-retrieval.mjs` tracks recall, irrelevant inclusion, citation coverage, uncertainty, no-match guidance, answer-basis coverage, and generated persistence violations.
- `tests/scenarios/run-answers.mjs` tracks direct-answer coverage, unsupported answers, conflicts, stale signals, repair actions, proof paths, and citation checks.
- `tests/scenarios/run-context-packs.mjs` tracks pack citation coverage, unsupported pack claims, cannot-confirm coverage, and no generated persistence.
- `packages/core/src/retrieval/index.ts`, `packages/core/src/answers/index.ts`, and `packages/core/src/context-packs/index.ts` own the main semantic outputs that need normalization.

## Fixture Tiers

| Tier | Shape | Purpose |
|---|---|---|
| `tiny-deterministic` | Current manager/reporting, MySQL review, follow-up, no-match, and source-evidence cases | Fast semantic regression and snapshot checks |
| `scaled-synthetic` | Temp vaults with 10, 100, 500, and 1,000 markdown pages across people, contexts, topics, events, review items, and follow-ups | Latency and memory budgets for retrieval, answer contracts, context packs, and symbolic hydration |
| `dirty-realistic` | Duplicate aliases, stale/superseded claims, missing evidence, unknown scope, contested review items, many irrelevant pages, source-adapter-shaped events | Precision, irrelevant inclusion, safety, and repair-action budgets |

Fixtures must live outside real memory and write only temp vaults or committed test definitions. Benchmark output is derived and must not be stored under canonical memory.

## Normalization Plan

Normalize semantic reports before snapshotting or diffing:

- Sort arrays by stable keys such as `path`, `id`, `claim_id`, `event_id`, `action`, `code`, then statement text.
- Replace temp roots and process-specific paths with `<TMP_VAULT>`.
- Replace volatile timestamps with placeholders unless the test is specifically about time ordering.
- Keep deterministic semantic IDs, claim IDs, Event IDs, page paths, review IDs, follow-up IDs, and citation IDs.
- Preserve safety fields: `canonical_writes`, `generatedPersistenceViolations`, `unsafeCanonicalWrites`, `unsupportedAnswerCount`, `automaticEntityMerges`, and `eventRawTextRewrites`.
- Round latency and memory metrics for reports, but keep them out of semantic snapshots unless testing budget thresholds.
- Normalize markdown line endings and trailing whitespace while preserving derived-only warnings and citations.

## Metrics To Report

- Runtime: cold/warm wall time, p50/p95 per query, fixture setup time, files scanned, markdown pages loaded, events hydrated.
- Scale: total pages, total claims, total events, matched pages, planned lookups, citation index size.
- Quality: target recall, irrelevant inclusion count, citation coverage, unsupported answers, cannot-confirm quality, repair action coverage, stale/conflict surfacing.
- Safety: generated persistence violations, unsafe canonical writes, Event raw text rewrites, automatic merges/supersessions, non-empty `canonical_writes` count.
- Output stability: normalized snapshot diff count and changed semantic-key count.

## Proposed Paths

- `tests/fixtures/perf/`
- `tests/helpers/perf-fixtures.mjs`
- `tests/helpers/normalize-semantic-output.mjs`
- `scripts/perf-baseline.mjs`
- `scripts/baseline-local.mjs`
- `tests/baselines/perf/`
- `tests/golden/perf-baseline-thresholds.json`

## Open Questions

- Should W1 baseline reports commit normalized goldens, ignored local JSON reports, or both?
- Should initial scale targets be 100, 500, 1,000, or larger vault pages?
- Should symbolic v4 answer contracts be part of first perf budgets or characterized separately?
- Should thresholds be absolute milliseconds or relative regression against prior baseline?
