# Use Assisto Tomorrow

This is a 60-minute activation recipe for turning an empty or thin Assisto vault into something useful for tomorrow's workday. It keeps the same safety model as the rest of the repo: capture and import create Events plus pending Transactions, generated answers and briefs stay disposable, and `.assisto-local/**` is only local UI/session state.

## 0-5 minutes: Start clean

1. Run `wm doctor memory-data` and confirm any `memory/events/**` or `memory/transactions/**` files shown as untracked are intentional personal dogfood data.
2. Start the Workbench with `wm workbench serve`.
3. Open the Today tab and read the Use-Assisto-Tomorrow card. Completion is derived; Assisto does not create a canonical completion page.

## 5-15 minutes: Seed the basics

Use the Capture tab or Seed Kit for only the facts you would want cited tomorrow:

- your role;
- your manager and immediate team;
- current projects or Contexts;
- important people and systems;
- open loops you explicitly need to track;
- things you keep forgetting.

Seed creation and capture both write source Events plus pending Transactions only. Review before applying.

## 15-25 minutes: Review one thing

Use the Today Daily Queue or Review tab. Pick one item, preview the action, then decide:

- apply a staged claim only with an explicit target and Context when needed;
- contest or archive unclear ReviewItems;
- reprocess stale NOOP Events with stage-only semantics;
- reject pending Transactions that are wrong.

Do not batch apply. The Review queue navigator exists to make one-at-a-time review faster, not automatic.

## 25-35 minutes: Ask one cited question

Ask a real question such as:

- "Who is my manager?"
- "What project is MySQL tied to?"
- "What do I need to review?"

Use the answer basis and citations. If memory cannot answer, preview a missing-memory action or log a retrieval miss. Miss logging creates an Event plus pending NOOP Transaction.

## 35-45 minutes: Import 10 curated notes

Use the Import Assistant before importing:

```bash
wm import assistant
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 10 --dry-run
```

In the Workbench Import tab, prepare triage for messy batches. Skip duplicates, split mixed notes, set source labels, set observed dates, and assign Context per unit. Kept units create one Event plus one pending Transaction each. Duplicates and skipped units do not write Events.

## 45-55 minutes: Make a disposable brief

Generate one Today or Context brief. Treat it as a reading view, not memory truth. If the brief reveals missing or wrong memory, capture the correction separately so it has source evidence and a pending Transaction.

## 55-60 minutes: Health and next loop

Run Health and look at high-severity findings. Stage one finding only if you are ready to review the resulting pending Transaction.

Tomorrow morning, use:

```bash
wm use-tomorrow
wm mode morning
wm dogfood eval
```

The goal is not to import everything. The goal is to create enough cited, reviewed memory that one real question, one review decision, and one brief are useful the next day.
