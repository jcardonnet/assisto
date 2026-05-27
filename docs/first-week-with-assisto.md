# First week with Assisto

This guide is for dogfooding Assisto as a daily work-memory loop. Assisto remains local-first: canonical memory is markdown under `memory/`, capture/import create Events and pending Transactions, and review/apply actions stay explicit.

## Day 1: Start the Workbench

Run the local Workbench:

```bash
wm workbench serve --host 127.0.0.1 --port 3721
```

Open the printed URL. Start on the Today tab. It is a derived dashboard; it does not write a completion marker.

## Daily capture

Use the Capture tab for small, real notes:

```text
Jeff is my manager for Inventory Project.
Kuastav reports to Jeff.
I need to ask Jeff about onboarding.
```

Preview first. Create only when the Event text looks right. Create writes the raw Event plus a pending Transaction; it does not apply claims to Person, Topic, Context, or FollowUp pages.

CLI parity:

```bash
wm capture --observed-at 2026-05-27 --source-label "daily note" "I need to ask Jeff about onboarding."
```

## Review pending work

Use Today and Transactions to decide what to apply or reject. Use Review for staged claims that need scope, context, contradiction, or entity judgment.

Good first-week rhythm:

- apply low-risk pending Transactions after preview;
- leave ambiguous people/topics split rather than merging them;
- use explicit Context selection for staged claims;
- use explicit supersession only when you know the old claim should stop being active.

## Import 20-50 curated notes

Import only hand-picked Markdown or text notes. Avoid full meeting transcript dumps.

```bash
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 50 --dry-run
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 50
```

For pasted batches, split units with a line containing only `---`. Duplicate raw imports are skipped with `source_hash`.

## Ask cited questions

Use Ask for questions where source-backed memory matters:

```text
Who is my manager?
Who reports to Jeff?
What changed recently?
What do I need to review about MySQL?
What source Event supports this claim?
```

Trust citations, uncertainty, and missing-memory guidance more than prose. Ask output is derived and disposable.

## Use briefs before work

Use Briefs from the Workbench or CLI:

```bash
wm brief today
wm brief person per_jeff
wm brief context ctx_inventory_project
wm brief review
wm brief followups
wm brief recent
wm brief recent person per_jeff
```

Briefs are compact derived views. Copy/export does not persist anything unless you separately route text through capture or import.

## End-of-day health

Run health after each dogfood session:

```bash
wm health check
```

If a finding matters, stage review through the Workbench Health tab or:

```bash
wm health check --stage-review --note "End-of-day triage"
```

Keep the loop boring and safe: capture, review, apply, ask with citations, brief, then health-check.
