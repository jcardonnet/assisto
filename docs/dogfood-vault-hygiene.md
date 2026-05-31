# Dogfood Vault Hygiene

Assisto can be developed from the same checkout that contains personal dogfood memory, but product code/docs and user memory need a hard boundary.

## Development Repo

Product PRs should not stage or commit real user-memory files.

Before opening or merging a product PR:

```bash
pnpm check:memory-data
```

The current automated guard focuses on high-risk Event and Transaction data. Also inspect `git status --short` for other canonical user-memory paths listed below before staging a product PR.

## Memory path classes

### Product schema/policy paths

These may be changed in product PRs:

- `memory/schema/**`
- `memory/indexes/README.md`

### Canonical user-memory paths

These should not be changed in product PRs unless explicitly approved:

- `memory/events/**`
- `memory/people/**`
- `memory/contexts/**`
- `memory/topics/**`
- `memory/followups/**`
- `memory/review/**`
- `memory/transactions/**`
- `memory/logs/**`

### Derived/local/generated paths

These should normally be ignored or regenerated:

- `memory/indexes/**`
- `.assisto-local/**`

## Personal Dogfood Data

During real use, capture/import/feedback/review flows may create untracked files under `memory/events/**` and `memory/transactions/**`. Treat them as local dogfood data unless the user explicitly says otherwise.

Maintenance logs and domain events are operational evidence about Assisto behavior. They are not source Events for work-memory claims.

## Useful Commands

```bash
pnpm check:memory-data -- --json
wm doctor memory-data --json
```


Future guard work should add a strict mode:

```bash
pnpm check:memory-data --strict
```

