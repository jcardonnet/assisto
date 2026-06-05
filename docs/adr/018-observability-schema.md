# ADR-018: Observability Schema

Status: Proposed  
Date: 2026-06-02

## Context

The parallel program adds OTel-shaped types, local JSONL sinks, run IDs, top-level CLI and Workbench spans, and later critical-path instrumentation. Observability is useful for debugging but can become a second source of truth or a data leak if not bounded.

## Decision

Observability artifacts are derived local artifacts. They may explain execution and support debugging, but they are not canonical memory and must not create, modify, rank above, or substitute for Events, Transactions, validation, or review.

The initial contract should define:

- `RunContext`;
- span start/end helpers;
- no-op sink by default;
- in-memory sink for tests;
- optional local JSONL sink under `.assisto-local/runs/**`;
- bounded metric and span attribute schemas;
- redaction hooks from ADR-017.

Metric labels must be bounded enums. Allowed label families include:

- `component`: `cli`, `workbench`, `core`;
- `domain`: `fs`, `vault`, `ingest`, `extraction`, `transaction`, `validation`, `retrieval`, `answer`, `workbench`, `provider`, `cache`;
- `operation`: stable operation enum;
- `result`: `ok`, `recoverable`, `validation_failed`, `failed`;
- `route`: normalized route template;
- `provider`: `rule`, `openai`, `llm_stub`, `unknown`;
- `status_class`: `2xx`, `4xx`, `5xx`, `network`, `parse`.

Metric labels must not include run IDs, file paths, query text, query hashes, Event IDs, claim IDs, transaction IDs, person names, raw routes with IDs or query strings, provider error text, raw exception messages, or arbitrary user strings.

## Consequences

- CLI and Workbench can expose run IDs and local debugging without changing durable memory semantics.
- W3 and W4 instrumentation must wait for privacy utilities and the observability contract.
- JSONL examples need security review before broad instrumentation merges.

## Open Questions

- Should run records live only under `.assisto-local/runs/**`, or may tests write fixture reports elsewhere?
- Should Workbench always return `x-assisto-run-id`, or only when observability is enabled?
- Should retention be count-based, age-based, or both?
