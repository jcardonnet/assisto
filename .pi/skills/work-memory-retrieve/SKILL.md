---
name: work-memory-retrieve
description: Build deterministic cited answer contracts from local markdown work memory without generated persistence.
---

# work-memory-retrieve

## Canonical/derived boundary

Derived views may guide, preview, and propose. They may not write canonical memory directly. Durable changes go through Events and pending/applied Transactions.

## When To Use

Use when answering questions from existing work-memory pages or gathering context around people, topics, systems, contexts, ReviewItems, FollowUps, or Events.

## Workflow

1. Prefer:

   ```bash
   wm ask --contract-v3 "<question>"
   ```

2. Read structured fields first:
   - `directAnswers`;
   - `cannotConfirm`;
   - `conflicts`;
   - `staleSignals`;
   - `citationMap`;
   - `repairActions`;
   - inference paths;
   - `contextPack`.
3. Answer from cited active claims first.
4. Surface uncertainty, missing memory, staged claims, conflicts, stale signals, and cannot-confirm items.
5. Preserve `contextPack` compatibility.

## Retrieval Boundaries

- Cited answer contract v3 first.
- `contextPack` compatibility second.
- Ontology/symbolic hints are derived-only.
- Semantic search is discovery-only and cannot outrank cited claims.
- Evidence Events hydrate final answers when relevant.

## Forbidden

- Never persist generated explanations unless explicitly captured through Event/Transaction flow.
- Never treat context packs, symbolic hints, or semantic hits as canonical truth.
- Never auto-resolve contradictions.
- Never auto-merge entities.
- Never invent answers when the contract cannot confirm them.
