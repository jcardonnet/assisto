# Source-To-Reasoning Dogfood

This guide describes the v10 loop for turning local exported work sources into cited, proof-backed answers without changing Assisto's canonical safety model.

```text
Local export -> Source Inbox -> triage -> Event + pending Transaction -> review -> symbolic proof -> cited answer
```

The loop is local/export-only. There is no live OAuth sync, background connector, vector search, graph database, MCP server, autonomous merge, autonomous contradiction resolution, direct canonical page write, or full transcript ingestion.

## 1. Collect Local Exports

Use small, curated exports first:

- email snippets as EML or MBOX;
- calendar items as ICS;
- chat excerpts as Slack or Teams JSON;
- GitHub issue or comment JSON;
- tracker CSV rows;
- repository or project Markdown.

Prefer source material that can answer a real work question tomorrow: owner, dependency, blocker, decision, open question, meeting participant, role/reporting change, or commitment.

## 2. Preview In Source Inbox

Use Workbench Source Inbox or CLI preview before creating memory objects:

```bash
wm source preview --kind repo_markdown --path ./exports/project-notes.md --json
```

Preview is read-only. It creates or updates only noncanonical session state under `.assisto-local/source-inbox/**` when run through Workbench. Each unit preserves raw text, source hash, source spans, observed time, source label, participants or context hints, and adapter metadata.

## 3. Triage Units

For each unit, explicitly choose keep, skip, split, merge, metadata edits, Context assignment, observed date, and source label. Duplicates are skipped by `source_hash`.

Triage state is not memory truth. It is local session state that can be deleted without corrupting memory.

## 4. Create Events And Pending Transactions

The create step writes only:

- one Event per kept nonduplicate unit;
- one pending Transaction per Event.

It does not apply Transactions and does not edit Person, Topic, Context, FollowUp, or ReviewItem pages directly. If extraction is uncertain, unsafe, ambiguous, or scoped poorly, the pending Transaction stages review.

## 5. Review One Item At A Time

Use Review Autopilot as a prioritization and preview console. It may group related ReviewItems and explain risk, but durable apply/reject/reprocess remains one item at a time through existing validated helpers.

Never batch apply source imports.

## 6. Build Or Query Symbolic Proofs

`wm indexes query-symbolic "<query>" --json` builds an in-memory proof view. `wm indexes rebuild-symbolic --json` writes rebuildable derived JSONL under `memory/indexes/symbolic/`.

Symbolic proofs must cite source facts, claim IDs, and Event IDs. Derived facts are not canonical claims.

## 7. Ask With Contract v4

Use the v4 answer contract when a question needs source reasoning:

```bash
wm ask --contract-v4 "What does Search API depend on?"
```

The contract returns direct answers only when supported, plus query plan, reasoning steps, proof tree, source excerpts, missing-memory diagnostics, and suggested source imports. Generated prose remains disposable.

## 8. Repair Missing Memory

When a question cannot be answered, log a missing-memory action or capture/import the underlying source. The repair path creates Event plus pending Transaction only. Do not save generated answers as evidence.

## Daily Control Room

Use the Dogfood Control Room to decide what to do next:

```bash
wm dogfood control-room --json
```

It combines Source Inbox backlog, import progress, personal dogfood question gaps, review bottlenecks, proof coverage, stale/missing source warnings, and one recommended next action. It is derived and read-only.

## Quality Bar

A good source-to-reasoning loop has:

- zero unsafe canonical writes;
- zero generated answer persistence;
- zero Event raw-text rewrites;
- no autonomous merges or supersessions;
- proof-backed answers with Event citations;
- explicit missing-source guidance when memory cannot answer.
