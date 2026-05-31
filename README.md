# Assisto

Assisto is a local-first Work-Memory OS with a transaction-safe markdown compiler core.

Its safe path is:

```text
Raw input → Event → Candidate claims → Transaction → Validated mutation or staged review → Current pages
```

Markdown under `memory/` is canonical. Derived artifacts may guide, explain, preview, rank, and propose. Only Events, Transactions, validation, and review create durable memory.

## What Assisto is

Assisto compiles messy work traces into source-backed markdown memory that can be inspected, diffed, reviewed, and repaired. Higher-level surfaces such as Workbench, cited answers, entity stewardship, Context rooms, briefs, health, and dogfood loops are derived or transaction-backed; they do not silently rewrite memory.

## Canonical vs derived

| Canonical | Derived |
|---|---|
| Events | Cited answer contracts |
| People, Contexts, Topics, FollowUps | Context packs and briefs |
| ReviewItems | Workbench views |
| Transactions | Health summaries |
| Logs | Semantic/symbolic indexes |
| Schema/policy | `.assisto-local/**` |

## Main Workflows

- **Capture**: write a note as an Event plus pending Transaction.
- **Review**: inspect staged claims and pending Transactions before applying.
- **Ask**: produce cited answer contracts with direct answers, cannot-confirm items, conflicts, stale signals, citations, and repair actions.
- **Entity Stewardship**: inspect identity, alias, role, reporting, ownership, stale-claim, and conflict risk.
- **Context Rooms**: inspect project/system/team state, decisions-as-claims, open questions, risks, source timeline, and follow-ups.
- **Repair**: preview missing-memory, retrieval-miss, entity, role/reporting, scope, and health repairs before writing Events or Transactions.
- **Briefs**: generate disposable derived summaries for today, meetings, projects, review risk, follow-ups, and recent changes.
- **Health**: surface deterministic findings and stage review only when explicitly requested.

## Documentation map

| Need | Doc |
|---|---|
| Architecture | `docs/revised-design.md` |
| Cited answer workflow | `docs/cited-work-memory.md` |
| First-day usage | `docs/use-assisto-tomorrow.md` |
| First-week dogfood | `docs/first-week-with-assisto.md` |
| Vault/data hygiene | `docs/dogfood-vault-hygiene.md` |
| Workbench details | `docs/workbench.md` |
| Ontology/reasoning | `docs/ontology-and-symbolic-reasoning.md` |
| Source adapters | `docs/source-adapters.md` |
| Repair actions | `docs/repair-actions.md` |
| Implementation tracks | `docs/implementation-plan.md` |
| ADRs | `docs/decisions.md` |
| Schema policy | `memory/schema/*.md` |

## Setup And Validation

```bash
pnpm install
pnpm validate:local
```

Useful targeted commands:

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
pnpm check:memory-data
```

## Workbench Quickstart

```bash
wm workbench serve
```

The server binds to `127.0.0.1:3721` by default. Workbench views are derived. Durable actions route through Events and/or pending Transactions.

## CLI Examples

```bash
wm capture "Jeff is my manager for Inventory Project."
wm ask --answer-contract "Who is my manager?"
wm entities stewardship --kind person
wm context operating-room ctx_inventory_project
wm health check
wm brief today
```

## PR Workflow

Before opening or merging product PRs:

```bash
pnpm check:memory-data
```

Do not stage real user memory under `memory/events/**`, `memory/transactions/**`, or `.assisto-local/**`.
