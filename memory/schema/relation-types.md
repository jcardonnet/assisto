# Relation Types

The MVP uses readable markdown links and simple frontmatter lists before any graph database.

## Frontmatter Relations

- `source_events`: Event IDs that support the page or review item.
- `related`: wikilinks to related People, Contexts, Topics, FollowUps, ReviewItems, or Events.
- `participants`: Event-level Person IDs.
- `topics`: Event-level Topic IDs.
- `contexts`: Event-level Context IDs.
- `transactions`: Transaction IDs that created or changed the object.
- `affected_files`: ReviewItem or Transaction paths affected by the issue.
- `linked_transaction`: pending/applied Transaction ID related to a ReviewItem.

## Wikilinks

Use wikilinks for human navigation:

```markdown
[[people/joe]]
[[topics/mysql]]
[[contexts/inventory-project]]
[[events/2026/2026-05/2026-05-20-001]]
```

Wikilinks must resolve to markdown files. Broken links are lint issues.

## Deferred Relations

Do not add graph-specific relation schemas in the MVP. If a relationship is important, store it as an Event-backed claim first, for example:

```yaml
- claim_id: clm_kuastav_reports_to_jeff
  statement: Kuastav reports to Jeff.
  claim_kind: fact
  claim_state: active
  evidence_strength: explicit
  scope: current-work-context
  scope_state: partial
  evidence: [ev_2026_05_21_001]
  recorded_at: 2026-05-21T12:00:00-03:00
  observed_at: null
  valid_from: null
  valid_to: null
```
