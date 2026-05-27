---
name: work-memory-retrieve
description: Build deterministic lexical context packs from local markdown work memory without GPT calls or generated persistence. Use when answering questions from existing memory pages or gathering context around people, topics, systems, contexts, staged review items, follow-ups, or recent relevant Events.
---

# work-memory-retrieve

## Description

Build a deterministic lexical context pack from local markdown work memory without calling GPT or saving generated explanations.

## When To Use

Use this skill when the user asks a question that should be answered from existing work-memory pages, or asks for context around people, topics, systems, or contexts.

Use it before answering from memory. The output is context only; any final answer must remain separate unless the user explicitly asks to save it.

## Setup And Check Commands

Run these from the repository root when checking retrieval behavior:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:mvp
```

Useful CLI commands:

```bash
pnpm --filter @assisto/cli wm ask --pack-context "<question>"
pnpm --filter @assisto/cli wm ask --answer-basis "<question>"
pnpm --filter @assisto/cli wm review inbox
pnpm --filter @assisto/cli wm validate
```

## Exact Workflow

1. Identify named people, topics, and contexts in the user question.
2. Run:

   ```bash
   pnpm --filter @assisto/cli wm ask --pack-context "<question>"
   ```

3. Read the structured result first, then the text pack:
   - `queryIntent`;
   - `plannedLookups`;
   - `answerCandidates`;
   - `supportingClaims`;
   - `matchedPages`;
   - `activeClaims`;
   - `uncertainClaims`;
   - `linkedReviewItems`;
   - `linkedFollowUps`;
   - `evidenceEvents`;
   - `missingInformation`;
   - `manualActions`;
   - `suggestedNextQuestions`;
   - `warnings`;
   - `contextPack`.
4. Prefer active claims.
5. Surface what memory cannot confirm from `missingInformation`, warnings, and claims marked staged, partial, unknown-scope, superseded, rejected, or contested.
6. If the user asks for an answer, answer from the context pack and structured fields only; distinguish facts from uncertainty and cite claim IDs/Event IDs when useful.
7. If the user wants the answer saved, use the ingest workflow to create an Event and pending Transaction. Do not save the generated explanation directly.

## Forbidden Behavior

- Never implement vector search.
- Never implement graph traversal beyond direct wikilinks and exact pages.
- Never call GPT from the retrieval workflow.
- Never persist generated explanations unless explicitly saved through ingestion and transaction review.
- Never treat context-pack output as canonical truth.
- Never auto-resolve contradictions surfaced in the pack.
- Never auto-merge entities that look similar.
- Never invent an answer when `warnings` says no deterministic match was found.

## Required Invariants

- Canonical state remains markdown under `memory/`.
- Retrieval output is derived and disposable.
- `answerCandidates` and `supportingClaims` are derived from loaded active claims, not generated explanations.
- `queryIntent`, `plannedLookups`, `manualActions`, and `suggestedNextQuestions` are derived planner metadata, not canonical memory.
- Active claims are preferred over staged, superseded, rejected, or contested claims.
- Unscoped, partial, staged, and contested claims must carry uncertainty in the answer.
- Every factual context claim should retain source Event citation coverage.
- Relation questions about managers, reporting, owners, and roles are handled deterministically from claim text and claim IDs, not vector search.

## References

- `wm ask --pack-context "<question>"`
- `wm ask --answer-basis "<question>"`
- `wm review inbox`
- `wm validate`
- `docs/revised-design.md`
- `docs/implementation-plan.md`
