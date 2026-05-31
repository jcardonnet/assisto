# Use Assisto Tomorrow

This is a 60-minute activation recipe for turning an empty or thin Assisto vault into something useful for tomorrow's workday.

Assisto's safe path is:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Generated answers, briefs, Workbench views, and `.assisto-local/**` state are disposable derived artifacts.

## 0-5 Minutes: Start Clean

1. Run `wm doctor memory-data`.
2. Start Workbench with `wm workbench serve`.
3. Open Today / Dogfood Home.

## 5-15 Minutes: Seed The Basics

Use Capture or Seed Kit for facts you would want cited tomorrow:

- your role;
- manager and immediate team;
- current projects or Contexts;
- important people and systems;
- open loops with explicit commitments;
- things you keep forgetting.

Seed/capture writes Events plus pending Transactions only.

For fast dogfooding, use Workbench Quick capture from any tab or the CLI preview-first path:

```bash
wm capture presets
wm capture quick --preset quick-note "Jeff is my manager."
wm capture quick --preset follow-up --create "I need to ask Jeff about budgets."
```


Do not paste a generated answer back into memory as if it were evidence. If a generated answer reveals something useful, capture the underlying source note or an explicit user correction instead.
Ask -> Entity -> Context is the first-day workflow: ask a cited question, inspect the cited entity, then open the relevant Context.

## 15-25 Minutes: Review One Thing

Use Today Daily Queue or Review. Pick one item, preview the action, then apply, reject, contest, archive, or reprocess through transaction-backed helpers.

Do not batch apply.

## 25-35 Minutes: Ask One Cited Question

Ask:

- "Who is my manager?"
- "What project is MySQL tied to?"
- "What do I need to review?"

Use citations, `cannotConfirm`, conflicts, stale signals, and inference paths. Repair actions are previews until you confirm creation of an Event or pending Transaction.

## 35-45 Minutes: Import 10 Curated Notes

Do not import full meeting transcripts during this first-day loop. Use curated excerpts or reviewed sections only.

```bash
wm import assistant
wm import notes --path ~/notes/assisto-seed --glob "*.md,*.txt" --limit 10 --dry-run
```

Kept units create one Event plus one pending Transaction each. Duplicates and skipped units do not write Events.

## 45-55 Minutes: Make A Disposable Brief

Generate one Today or Context brief. Treat it as a reading view, not memory truth. Capture corrections separately.

## 55-60 Minutes: Health And Next Loop

Run Health and stage one finding only if ready to review the resulting pending Transaction.

Tomorrow morning:

```bash
wm use-tomorrow
wm mode morning
wm dogfood eval
```

The goal is enough cited, reviewed memory that one real question, one review decision, and one brief are useful.
