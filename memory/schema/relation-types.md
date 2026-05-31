# Relation types

The MVP uses readable markdown links and Event-backed claim blocks before any graph database.

## MVP Relations

- `source_events`: Event IDs that support the page or review item.
- `related`: fallback wikilinks to related objects.
- `participants`: Event-level Person IDs.
- `topics`: Event-level Topic IDs.
- `contexts`: Event-level Context IDs.
- `transactions`: Transaction IDs that created or changed the object.
- `affected_files`: ReviewItem or Transaction paths affected by an issue.
- `linked_transaction`: Transaction ID related to a ReviewItem.

## Event-backed claims, not graph edges

If a relationship matters, store it as an Event-backed claim first:

```yaml
- claim_id: clm_kuastav_reports_to_jeff
  statement: Kuastav reports to Jeff.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_21_001]
```

## Post-MVP relation registry

The derived ontology registry lives under `memory/schema/ontology/`. Relation examples:

- `reports_to`
- `manages`
- `owns`
- `part_of`
- `depends_on`
- `supersedes`
- `contradicts`
- `evidenced_by`
- `has_open_followup`
- `review_risk_for`

`related` is fallback only when no more specific relation applies.

derived inverse or transitive relations require inference paths. They are not active canonical claims unless explicitly captured and transaction-backed.
