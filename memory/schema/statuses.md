# Statuses

These are the only durable state values allowed in the MVP memory vault.

## Object State

Use on canonical memory objects, review items, events, and logs.

```yaml
object_state: active | archived
```

- `active`: current durable object.
- `archived`: retained but no longer part of current working memory.

Do not delete MVP memory objects. Archive objects or reject/supersede individual claims instead.

## Review State

Use on objects that may need human inspection.

```yaml
review_state: none | staged | reviewed | contested
```

- `none`: no review workflow applies.
- `staged`: waiting for review.
- `reviewed`: accepted by deterministic policy or human review.
- `contested`: retained but disputed.

## Claim State

Every claim block must use exactly one claim state.

```yaml
claim_state: active | staged | superseded | rejected
```

- `active`: current durable claim.
- `staged`: candidate claim awaiting review.
- `superseded`: retained for history but no longer current.
- `rejected`: reviewed and not accepted.

## Claim Kind

```yaml
claim_kind: fact | inference | assumption | preference | commitment
```

Do not store inferences, assumptions, preferences, or commitments as facts.

## Evidence Strength

```yaml
evidence_strength: explicit | inferred | weak
```

Active durable facts should normally be `explicit`. Inferred or weak claims should stage unless the review workflow accepts them.

## Scope State

```yaml
scope_state: complete | partial | unknown
```

- `complete`: a reviewed or deterministic scope is attached.
- `partial`: scoped enough to avoid false global truth, but not fully bounded.
- `unknown`: scope is missing.

Active system/context claims must not use `scope_state: unknown`; they must stage review.
