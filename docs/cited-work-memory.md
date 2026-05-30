# Cited Work Memory

Assisto's v8 work-memory surface is built around a single loop:

```text
Ask -> Entity -> Context -> Repair
```

The loop is intentionally deterministic. It turns markdown memory into cited answer
basis, entity risk views, and Context operating rooms. It does not persist generated
answers, create graph/vector state, merge entities, resolve contradictions, or write
canonical pages directly from UI/API handlers.

Generated answers stay disposable, and cited markdown remains the source of record.

## Answer contract

Use the cited answer contract when the question needs a grounded answer instead of a
raw context pack:

```bash
wm ask --answer-contract "Who is my manager?"
```

The contract separates:

- `directAnswers`: claims the current memory can support;
- `cannotConfirm`: missing or unsupported facts;
- `conflicts`: contested, superseded, staged, or otherwise conflicting signals;
- `staleSignals`: claims with stale states or temporal endings;
- `citationMap`: claim, Event, and page citations keyed by ID;
- `repairActions`: safe manual next steps such as capture, friction logging,
  opening ReviewItems, opening FollowUps, or inspecting an entity/Context page;
- `contextPack`: the backward-compatible text pack.

Each direct answer carries its own claim IDs, Event IDs, and page paths. The Ask tab
renders those citations beside the answer and includes a citation explorer with source
Event previews. Optional draft answers may read this deterministic basis, but generated
answers stay disposable and must not become memory.

## Ask -> Entity -> Context

When an answer is incomplete or risky, follow the trace instead of guessing:

1. Ask the question and inspect "What memory can say" plus "What memory cannot confirm."
2. Open the cited Person, Topic, or Context page from the answer.
3. Check entity stewardship for alias conflicts, near duplicates, role/reporting
   changes, stale claims, linked ReviewItems, and FollowUps.
4. Open the Context operating room for project-state questions.
5. Use repair actions to capture missing evidence, log a retrieval miss, stage an
   identity review, or stage a role/reporting/context correction.

All durable repairs create pending Transactions or Events plus pending Transactions.
Preview actions run against derived or temporary state and must not edit canonical
memory.

## Entity stewardship

Entity stewardship is a command center for identity and relationship risk:

```bash
wm entities stewardship --kind person
wm entities stewardship --kind context --json
```

Risk lanes are read-only until a human explicitly stages a repair. The UI and API may
surface near duplicates, alias conflicts, role/reporting/ownership changes, stale
claims, and conflicting claims, but they do not merge, split, delete, or supersede
without an explicit staged Transaction. Identity ambiguity stays staged.

## Context operating rooms

Context operating rooms are derived project views:

```bash
wm context operating-room ctx_inventory_project
wm context timeline ctx_inventory_project --json
```

They show current state, owners, systems, decisions-as-claims, open
questions-as-claims, risks, recent changes, stale claims, ReviewItems, FollowUps,
answerable questions, missing-memory prompts, quick actions, and a source timeline.
The timeline uses existing `recorded_at`, `observed_at`, `valid_from`, and `valid_to`
fields without inventing new temporal meaning.

Use Context rooms to decide what to review or capture next. Treat the room itself as a
reading view, not canonical truth.

## Safety checks

The v8 hardening gate is:

```bash
pnpm eval:answers
pnpm eval:v8
```

It checks that cited answers do not claim unsupported facts, no-match queries surface
missing-memory guidance, entity risk detection remains read-only, repair actions stage
pending Transactions only, Context rooms/timelines stay derived, generated text is not
persisted, and canonical Event raw text is not rewritten.
