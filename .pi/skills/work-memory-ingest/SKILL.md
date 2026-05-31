---
name: work-memory-ingest
description: Safely capture short work-memory notes as Event plus pending Transaction.
---

# work-memory-ingest

## Canonical/derived boundary

Derived views may guide, preview, and propose. They may not write canonical memory directly. Durable changes go through Events and pending/applied Transactions.

## Workflow

1. Confirm the input is a small work-memory note or curated excerpt, not a full transcript dump.
2. Preview first when people, systems, projects, follow-ups, or scope-sensitive claims are present:

   ```bash
   wm ingest --dry-run "<note>"
   ```

3. Confirm:
   - Event preserves raw text;
   - canonical page writes are proposed in a pending Transaction;
   - unscoped claims stage;
   - ambiguous entities stage;
   - casual discussion does not create committed FollowUps.
4. Create only when safe:

   ```bash
   wm ingest "<note>"
   ```

## Workday Quick Capture

Use quick capture for short ambient notes during the workday. It is preview-first by default:

```bash
wm capture quick --preset quick-note "Joe is the DBA."
wm capture quick --preset meeting-note --context ctx_inventory_project --stdin
```

Create only after the preview shows Event evidence plus a pending Transaction:

```bash
wm capture quick --preset follow-up --create "I need to ask Jeff about budgets."
```

Presets guide source labels and templates; they are not canonical memory objects.

## Source Adapter Boundaries

Source adapters may normalize Markdown/text, pasted notes, documents, and curated transcript excerpts. Candidate frames are not canonical claims. They become durable only through Event plus pending Transaction.

Full transcript ingestion is out of scope unless separately designed.

## Optional Provider

OpenAI or other LLM output is candidate data only. Malformed output, unsafe follow-ups, ambiguous entities, unscoped facts, generated explanations, and validation failures must stage review or fallback Transactions.

## Forbidden

- Never write directly to current pages from ingestion.
- Never bypass Transactions.
- Never promote unscoped claims.
- Never auto-merge entities.
- Never auto-resolve contradictions.
- Never persist generated explanations without explicit save and reviewed Transaction.
