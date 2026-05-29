# First week with Assisto

This guide is for dogfooding Assisto as a daily work-memory loop. Assisto remains local-first: canonical memory is markdown under `memory/`, capture/import create Events and pending Transactions, and review/apply actions stay explicit.

## Day 1: Start the Workbench

Run the local Workbench:

```bash
wm workbench serve --host 127.0.0.1 --port 3721
```

Open the printed URL. Start on the Today tab. It is a derived dashboard; it does not write a completion marker.

The Today tab is now the Dogfood Home. Treat it as the cockpit for the loop: it starts with a Daily Queue for the next one-at-a-time decision, then shows the first-run Activation Wizard, next recommended manual action, pending Transactions, staged ReviewItems, stale NOOP Events, open FollowUps, recent activity, health warnings, quick briefs, and recent friction logs. All of those sections are derived from markdown.

Check the same activation state from the CLI:

```bash
wm activate status
wm daily queue
```

## Daily capture

Use Quick capture from any Workbench tab, or use the Capture tab for larger notes. The Capture tab also shows a Capture Inbox with recent Events, pending capture Transactions, source-label presets, observed-at shortcuts, recent Context suggestions, and reusable templates. Keep notes small and real:

```text
Jeff is my manager for Inventory Project.
Kuastav reports to Jeff.
I need to ask Jeff about onboarding.
```

Preview first. Create only when the Event text looks right. Create writes the raw Event plus a pending Transaction; it does not apply claims to Person, Topic, Context, or FollowUp pages.

After preview, check the “why staged,” “needs context,” and “likely next review action” fields. They are guidance only; the write path is still Event plus pending Transaction.

CLI parity:

```bash
wm capture --observed-at 2026-05-27 --source-label "daily note" "I need to ask Jeff about onboarding."
```

For first-day setup, use the Personal Seed Kit in the Capture tab or start from `docs/seed-kit-template.md`:

```bash
wm seed kit --file docs/seed-kit-template.md --dry-run
```

If the optional OpenAI provider is configured, use it only for candidate extraction. Deterministic validation still decides whether candidates become pending Transactions or staged review, and no Transaction is applied automatically.

## Review pending work

Use Today and Transactions to decide what to apply or reject. Use Review for staged claims that need scope, context, contradiction, or entity judgment.

The fastest path is the Daily Queue at the top of Today. It prioritizes pending Transactions first, then staged ReviewItems, stale NOOP Events, open FollowUps, and high-severity health findings. Use the preview button before any write action. The queue is intentionally one item at a time.

Good first-week rhythm:

- apply low-risk pending Transactions after preview;
- leave ambiguous people/topics split rather than merging them;
- use explicit Context selection for staged claims;
- use explicit supersession only when you know the old claim should stop being active.

The Review tab also has Review Turbo lanes. Use them to decide what kind of manual judgment is needed: safe apply, needs context, identity ambiguity, conflict/change, stale NOOP, or other. The lanes are navigation, not batch approval. Work one item at a time.

## Import 20-50 curated notes

Import only hand-picked Markdown or text notes. Avoid full meeting transcript dumps.

```bash
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 50 --dry-run
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 50
```

For pasted batches, split units with a line containing only `---`. Duplicate raw imports are skipped with `source_hash`.

In the Workbench Import tab, use triage before create when a batch is messy. Triage lets you split, merge, skip, set observed dates, set source labels, and assign Context per unit. The preview shows duplicate groups, likely safe/staged/conflict counts, estimated review load, and per-unit extraction summaries so you can tell how much review you are creating before writing anything. Kept units still create one Event plus one pending Transaction each. Skipped and duplicate units do not write Events.

Use the Import Assistant before each batch. It starts with an "import 10 curated notes" recipe, then uses local triage sessions to show duplicate groups, review-load forecast, likely safe/staged/conflict counts, and the suggested next batch size. From the CLI, `wm import assistant` prints the same derived guidance.

Import triage previews are stored as local sessions under `.assisto-local/import-sessions/` so you can reload the same derived triage view while using the Workbench. `.assisto-local/**` is not canonical memory and can be deleted without corrupting `memory/`.

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

Use pinned questions for the small set of real work questions you keep asking. Pins live under `.assisto-local/retrieval/questions.json`, so they are local UI/session state rather than canonical memory. The Ask tab also shows a citation explorer plus matched-page and source-Event previews so you can inspect the basis without opening files by hand.

If Ask cannot answer something important, use the “Log retrieval miss” action. This creates an Event plus a pending NOOP Transaction so the miss becomes reviewable without inventing a fact or creating a standalone friction page.

Use “Preview missing-memory action” before logging a miss when you want to inspect the Event/Transaction shape without writing anything.

Optional answer drafts are ephemeral. They can use only the deterministic answer basis, must cite claims or Events, and are not saved to memory.

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

## Work context pages

Use People/Topics/Contexts to inspect project surfaces. Context detail pages include active facts, decisions-as-claims, open questions-as-claims, owners, roles, related people/topics, FollowUps, ReviewItems, source Events, and quick links to briefs.

Corrections belong in the Context note/correction form. Preview first. Stage only when the raw text is right. This writes an Event plus a pending Transaction; it does not edit the Context page directly and it does not create standalone Decision or OpenQuestion pages.

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

## Weekly cleanup

Once or twice a week:

- review Context operating pages for stale facts and open questions;
- log retrieval misses that keep recurring;
- import only the most useful curated notes;
- reprocess stale NOOP Events when newer detectors can extract better candidates;
- reject pending Transactions you no longer trust;
- run `pnpm eval:v7` before relying on a new local build for dogfooding.
