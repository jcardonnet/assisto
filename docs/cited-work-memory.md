# Cited Work Memory

Assisto's cited work-memory surface follows:

ASCII shorthand: `Ask -> Entity -> Context -> Repair`.
```text
Ask → Entity → Context → Repair
```

Generated answers stay disposable; cited answer contracts and briefs are derived reading surfaces, not memory truth.
The loop is deterministic. It turns markdown memory into cited answer contracts, entity risk views, and Context operating rooms. It does not persist generated answers, create canonical graph/vector state, merge entities, resolve contradictions, or write canonical pages directly from UI/API handlers.

## CitedAnswerContract v3

Use:

```bash
wm ask --contract-v3 "Who is my manager?"
```

Conceptual shape:

```ts
type CitedAnswerContractV3 = {
  version: "answer-contract-v3";
  question: string;
  directAnswers: Array<{
    text: string;
    answer_kind: string;
    confidence_label: string;
    citations: AnswerCitation[];
    inference_paths: string[];
  }>;
  cannotConfirm: Array<{
    item_id: string;
    code: string;
    text: string;
    missing_evidence: string[];
    repair_action_ids: string[];
  }>;
  conflicts: ConflictSignal[];
  staleSignals: StaleSignal[];
  citationMap: AnswerCitationMap;
  citationIndex: Record<string, AnswerCitation>;
  repairActions: Array<RepairAction & { action_id: string }>;
  contextPack: string;
};
```

`contextPack` remains available for compatibility. The older `wm ask --answer-contract` and `/api/ask/answer-contract` surfaces are preserved; v3 is the stricter Ask/Pi/UI contract. The contract is derived output, not memory.

## Evidence hydration

Before emitting a direct answer, Assisto hydrates the source Events for cited claims when the answer is high-impact, contested, stale, sparse, temporal, or used for repair.

## Ask → Entity → Context

1. Ask the question and inspect what memory can say plus what it cannot confirm.
2. Open the cited Person, Topic, or Context.
3. Check entity stewardship for alias conflicts, near duplicates, role/reporting changes, stale claims, ReviewItems, and FollowUps.
4. Open the Context operating room for project-state questions.
5. Use repair actions to capture missing evidence, log a retrieval miss, stage identity review, or stage role/reporting/context correction.

## Repair action boundary

Repair actions are previews. Durable repair writes use Events and/or pending Transactions. No repair action edits current pages directly.

## Semantic search boundary

Semantic search may find candidate pages. It does not supply direct answers unless backed by canonical claims and source Events.

## Saved explanations

A saved explanation is evidence that the explanation was saved, not evidence that every fact inside it is true. Any factual claims inside it need independent Event evidence or must remain generated/explanatory.

## Entity Stewardship

Entity stewardship risk lanes are read-only until a human explicitly stages a repair. They may surface near duplicates, alias conflicts, role/reporting/ownership changes, stale claims, and conflicting claims. They do not merge, split, delete, or supersede without explicit staged Transactions.

## Context Operating Rooms

Context rooms are derived project views. They show current state, owners, systems, decisions-as-claims, open questions-as-claims, risks, recent changes, stale claims, ReviewItems, FollowUps, answerable questions, missing-memory prompts, quick actions, and source timeline.

## Safety Checks

```bash
pnpm eval:answers
pnpm eval:v8
```

These gates check unsupported answers, no-match guidance, entity risk read-only behavior, repair staging, Context room derivation, no generated persistence, and no Event raw-text rewrites.
