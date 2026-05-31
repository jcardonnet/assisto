# First Week With Assisto

This guide is for dogfooding Assisto as a daily work-memory loop. Canonical memory is markdown under `memory/`; capture/import create Events and pending Transactions; review/apply actions stay explicit.

## Daily Capture

Use Quick Capture or the Capture tab for small, real notes. Preview first. Create writes raw Event text plus a pending Transaction, not active claims.

If you need transcript support, extract 5-10 curated excerpts first and inspect review load before importing more.

## Review Pending Work

Use Today, Transactions, and Review Turbo lanes. Work one item at a time. Prefer false splits over false merges.

## Ask Cited Questions

Trust citations, `cannotConfirm`, conflicts, and stale signals more than fluent prose.

Ask examples:

- Who is my manager?
- Who reports to Jeff?
- What changed recently?
- What source Event supports this claim?

If Ask includes derived inferences, inspect inference paths before trusting them.

If you ask the same explanation repeatedly, Assisto may stage an explanation candidate later, but it should not auto-create an Explanation page.

## Entity And Context Work

Use Entity Stewardship and Context Operating Rooms as reading and repair surfaces, not truth. Durable corrections route through capture or pending Transactions.

## Briefs

Briefs are compact derived views. Copy/export does not persist anything unless you separately route source text through capture/import.

## Weekly Cleanup

Once or twice a week:

- review Context operating pages;
- log recurring retrieval misses;
- import only useful curated notes;
- reprocess stale NOOP Events;
- reject untrusted pending Transactions;
- run:

```bash
pnpm eval:answers
pnpm eval:v8
pnpm eval:dogfood-local
```
