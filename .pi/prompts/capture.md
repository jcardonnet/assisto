---
description: Capture a short work-memory note by previewing or creating an Event plus pending Transaction.
argument-hint: <note>
tool: wm_capture_note
command: /wm-capture
---

# /capture <note>

Use `wm_capture_note` with the provided note. Prefer `dry_run: true` when the note contains new people, systems, follow-ups, or context-sensitive facts.

After capture, report:

- Event ID and path.
- Pending Transaction ID and path.
- Provider name.
- Any staged ReviewItems.
- Whether canonical pages are still only proposed writes.

Safety constraints:

- Do not edit canonical pages directly.
- Route durable writes through Transactions.
- Do not apply the pending Transaction unless explicitly asked.
- Do not promote unscoped system/context claims.
- Do not create committed FollowUps without explicit trigger language.
- Do not auto-merge entities.
- Do not auto-resolve contradictions.
- Do not persist generated explanations unless explicitly saved.
- Use `provider: "openai"` only when explicitly requested or configured; provider output is candidate data only.
