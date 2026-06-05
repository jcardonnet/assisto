# Assisto Test Gap Map

Status: Wave 0 synthesis  
Date: 2026-06-02

This map lists missing tests for the first parallel implementation waves. It does not add fixtures or change runtime behavior.

## Existing Coverage Anchors

- `tests/core-validators.mjs`: frontmatter enums, duplicate IDs, missing Event evidence, unknown-scope active claims, FollowUp triggers, ontology validation, rollback notes.
- `tests/core-transactions.mjs`: parse/serialize/draft, unsupported operations, rollback validation, transaction paths.
- `tests/core-transaction-apply.mjs`: valid apply, invalid transaction no-write, partial write failure, ontology failures, unsupported operations.
- `tests/core-ingest-pipeline.mjs`: detector proposals, scoped claims, ambiguous scope/person staging, reporting changes, claim conflicts.
- `tests/core-policies.mjs`: conservative FollowUp intent, entity ambiguity, unknown scope, high-impact staging, generated explanation persistence policy.
- `tests/core-capture.mjs` and `tests/core-source-adapters.mjs`: preview no-write behavior, Event plus pending Transaction creation, source hashes/spans, duplicate skip.
- `tests/core-answer-contract-v4.mjs` and scenario evals: cited answers, derived symbolic/source outputs, and no generated persistence.
- `tests/core-fs-vault.mjs` and `tests/pi-extension.mjs`: path guardrails and Pi direct-write blocking.

## Proposed Missing Tests

| Path | Purpose | Expected assertions |
|---|---|---|
| `tests/faults/transaction-apply-faults.mjs` | Inject write failures after Event write, non-Event write, applied transaction write, and ingest-log append | Events preserved, failed state visible, no unsupported applied+failed success, repair notes/log entries where possible |
| `tests/faults/transaction-validation-gap-faults.mjs` | Path traversal, outside-memory writes, `.assisto-local` writes, missing Event files, evidence/source mismatch, duplicate existing IDs | Validation fails before canonical writes with stable error codes |
| `tests/faults/derived-output-persistence-faults.mjs` | Snapshot before/after answer contracts, context packs, briefs, maintenance plans, symbolic build/query, entity stewardship, Context rooms | Derived APIs leave canonical files unchanged unless explicit transaction-backed create helper is called |
| `tests/faults/source-adapter-faults.mjs` | Malformed adapter inputs, empty units, duplicate source hashes, huge source input, quoted email-only body | Preview writes nothing; create writes only Events plus pending Transactions for valid kept units |
| `tests/faults/workbench-mutation-safety-faults.mjs` | Invalid apply/reject/stage payloads, non-pending apply, invalid health finding, preview vs create routes | Previews leave vault unchanged; invalid creates leave vault unchanged; successes route through core helpers |
| `tests/validators-regression.mjs` | Temporal fields, generic field rejection, summary basis, transaction-backed ReviewItem creation | Reject unsupported temporal inference, generic `status`/`classification`/`confidence`, invalid summary basis, direct ReviewItem writes where detectable |
| `tests/followup-trigger-regressions.mjs` | Explicit and casual trigger matrix | Casual phrases never commit; explicit triggers can commit only with source Event evidence |
| `tests/entity-resolution-regressions.mjs` | Alias collision, near match, ambiguous same-name people, role/reporting changes, false merge pressure | Only exact or already-canonical alias matches update automatically; near/ambiguous/high-impact changes stage review |
| `tests/fixtures/expected-failures/**` | Invalid memory page/transaction corpus | Fixture manifest maps each sample to expected validator codes and invariant category |

## Fixture Requirements

- Reusable temp vault builder with snapshot/diff helper.
- Faulty writer or injectable fs helper for deterministic write failures.
- Expected-failure fixture manifest with validator target and expected codes.
- Minimal valid Event, Person, Context, Topic, FollowUp, ReviewItem, Transaction, and LogEntry pages.
- Malformed adapter inputs for markdown, email, chat, calendar, JSON, and CSV-like sources.

## Expected-Failure Candidates

- Failure after writing applied transaction but before updating pending/log may expose inconsistent state.
- Ingest-log append failure after canonical writes may mark a successfully written transaction failed.
- Workbench Host/Origin/CSRF tests should fail until W2-B.
- Provider/log redaction tests should fail until W1-A privacy utilities land.
- Generic `status` or `confidence` field rejection may fail if validators currently ignore unknown fields.

## Open Questions

- Should fault tests initially block CI, or run as documented expected-failure characterization?
- Should unknown-field rejection apply to all MVP objects or only canonical memory pages?
- Should transaction apply tolerate log-write failure as recoverable, fatal, or warning-only?
