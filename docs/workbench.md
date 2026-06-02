# Workbench

The Workbench is a local browser surface over Assisto's markdown memory. It is a derived UI first: it reads markdown snapshots, previews actions, and routes durable writes through Events and/or Transactions.

## Canonical/Derived Boundary

Workbench views are derived. They may guide, explain, preview, rank, and propose. They may not directly edit current pages.

Durable Workbench actions must use one of these paths:

- Event plus pending Transaction;
- pending Transaction;
- validated Transaction apply helper.

## Today Home / Daily Queue

Today Home is the daily cockpit. It surfaces the next one-at-a-time decision, pending Transactions, ReviewItems, stale NOOP Events, FollowUps, health warnings, recent activity, quick briefs, and dogfood status.

Completion state is derived from markdown and `.assisto-local/**`; it is not a canonical completion page.

## Capture

Capture writes raw notes as Events plus pending Transactions. It supports observed dates, source labels, provider choice, optional Context, and preview-first creation.

## Import

Import handles curated Markdown/text batches and curated transcript excerpts. It preserves raw text, uses `source_hash` for duplicate detection, previews review load, and creates one Event plus one pending Transaction per kept unit.

## Review

Review groups staged items and shows suggested manual actions. The Review Throughput panel is derived: it counts ready-now, needs-input, and risk-review work, names bottleneck lanes, and points to exactly one preview-first next action. Apply, contest, archive, reprocess, and supersede flows are transaction-backed.

## Transactions

The Transactions tab shows parsed transaction bodies, operations, source Events, affected files, proposed writes, validation result, and apply/reject notes. Apply/reject calls core helpers.

## Ask

Ask renders `CitedAnswerContract`: direct answers, cannot-confirm items, conflicts, stale signals, citation map, repair actions, inference paths, and `contextPack` compatibility.

## People / Topics / Contexts

Entity views show aliases, active/staged/superseded claims, identity risk, near duplicates, alias conflicts, role/reporting/ownership changes, stale claims, evidence Events, ReviewItems, FollowUps, and related Contexts.

## Context Operating Rooms

Context rooms show current state, owners, systems, decisions-as-claims, open questions-as-claims, risks, recent changes, stale claims, source timeline, answerable questions, missing-memory prompts, and quick repair actions.

## Health

Health surfaces deterministic findings. Staging a finding creates a pending Transaction; it does not directly write ReviewItems.

## Briefs

Briefs are disposable derived views. Copy/export does not persist memory unless the user separately captures source evidence.

## Personal Dogfood Eval

Dogfood eval reads local questions from `.assisto-local/**` and scores answerability, citations, irrelevant inclusion, review/follow-up surfacing, and missing-memory guidance. It does not write memory.

## Write Rules

No Workbench handler writes Person, Context, Topic, FollowUp, ReviewItem, or Transaction pages directly except through validated transaction helpers.
