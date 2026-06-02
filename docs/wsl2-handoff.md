# WSL2 Handoff

Use this file to restart Assisto work in `/home/jc/assisto`.

## Read First

```text
AGENTS.md
README.md
docs/project-architecture.md
docs/revised-design.md
docs/cited-work-memory.md
docs/use-assisto-tomorrow.md
docs/first-week-with-assisto.md
docs/dogfood-vault-hygiene.md
docs/implementation-plan.md
docs/decisions.md
docs/wsl2-handoff.md
```

Then inspect:

```bash
git fetch origin
git status --short --branch
git log --oneline -5
```

## Current Implementation Status

- deterministic ingestion and candidate pipeline;
- provider-ready optional extraction as candidate-only;
- transaction-backed review state changes;
- Event reprocessing and safe claim upserts;
- lexical retrieval and cited answer contracts;
- People/Topics/Contexts stewardship;
- Context dashboards, operating rooms, and timelines;
- local Workbench: Today, Capture, Import, Review, Transactions, Ask, Health, Briefs;
- personal dogfood evals;
- Pi adapter and CLI;
- MVP/v2/v3/retrieval/v4/v5/v6/v7/v8 evals.

## User Data Boundaries

Treat these as user dogfood data unless explicitly instructed otherwise:

```text
memory/events/**
memory/transactions/**
.assisto-local/**
```

Run before staging/committing:

```bash
pnpm check:memory-data
```

## Validation

Prefer:

```bash
pnpm validate:local
```

Useful gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:mvp
pnpm eval:v2
pnpm eval:v3
pnpm eval:retrieval
pnpm eval:v4
pnpm eval:v5
pnpm eval:v6
pnpm eval:dogfood-local
pnpm eval:v7
pnpm eval:answers
pnpm eval:v8
pnpm test:browser
```

## Mixedbread

Use Mixedbread for retrieval planning before non-trivial edits. Open local files before patching. Never patch from search snippets alone.

After merge:

```bash
pnpm mxbai:upload
pnpm mxbai:smoke
```

## Known Environment Issues

If WSL/UNC access is flaky, use:

```bash
wsl.exe -d Ubuntu --cd /home/jc/assisto -- <cmd>
```

Browser tests may need to run outside the sandbox when Chromium sandbox launch is blocked.
