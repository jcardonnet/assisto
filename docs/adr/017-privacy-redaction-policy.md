# ADR-017: Privacy And Redaction Policy

Status: Proposed  
Date: 2026-06-02

## Context

Assisto handles raw notes, Events, source imports, provider prompts and responses, personal questions, proposed markdown writes, Workbench form bodies, and `.assisto-local/**` session state. Observability, typed errors, provider diagnostics, Workbench responses, debug CLI output, and local run files will increase the number of places that can accidentally expose this content.

## Decision

Adopt a shared privacy and redaction policy before observability, provider instrumentation, debug CLI, or broader typed error integration.

By default, logs, spans, metrics, debug output, typed errors, Workbench error bodies, provider diagnostics, local run JSONL, and derived cache diagnostics may include only structural data:

- counts;
- durations;
- bounded enum codes;
- operation types;
- route templates;
- transaction states;
- validation issue codes;
- provider name/model;
- response status class;
- redacted or truncated safe summaries.

They must not include raw notes, Event raw text, imported source text, source inbox units, provider prompts, provider responses, cited answer text, generated drafts, context packs, briefs, proposed markdown writes, API keys, bearer headers, environment variable values, absolute filesystem roots, or user/person names by default.

Hashes may be used only for explicit correlation needs. Hashes must not be metric labels.

## Consequences

- Debugging is safer and reviewable by default.
- Some local debugging will require an explicit future opt-in reveal mode.
- W1 privacy utilities become a dependency for observability contracts, provider logging, Workbench error bodies, and debug CLI output.

## Open Questions

- Should file paths be fully redacted, basename-only, or repo-relative with sensitive segment filtering?
- Are Event IDs allowed in debug detail views, or only redacted references?
- Who can opt into raw local debug capture, and how is that mode visibly marked?
