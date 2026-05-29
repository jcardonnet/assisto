# Dogfood Vault Hygiene

Assisto can be developed from the same checkout that contains personal dogfood memory, but the two roles need a hard boundary.

## Development repo

Use the development repo for product code, tests, docs, scripts, and Workbench UI changes. Product PRs should not stage or commit real user-memory files.

Before opening or merging a product PR, run:

```bash
pnpm check:memory-data
```

The guard blocks staged, unstaged, or committed changes under:

```text
memory/events/**
memory/transactions/**
```

These folders contain source Events and pending/applied Transactions. Treat them as user data, not fixture data.

## Personal dogfood data

During real use, `wm capture`, imports, feedback logging, and review flows may create untracked files under `memory/events/**` and `memory/transactions/**`. The guard reports those files as `untracked_user_memory_paths` so you can see they exist without blocking product development.

Do not stage `memory/events/**` or `memory/transactions/**` during product PRs. If a PR truly needs fixture-like memory data, place it under `tests/` or a documented scenario fixture instead.

## Useful commands

```bash
pnpm check:memory-data -- --json
wm doctor memory-data --json
```

`wm doctor memory-data` is a read-only CLI wrapper for the same guard. Both commands separate:

- `tracked_diff_paths`
- `staged_paths`
- `unstaged_paths`
- `untracked_user_memory_paths`

`--allow` and `ASSISTO_ALLOW_MEMORY_DATA_CHANGES=1` remain explicit escape hatches for rare intentional memory-data edits. Prefer not to use them during product implementation PRs.
