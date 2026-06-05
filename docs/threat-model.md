# Assisto Threat Model

Status: Wave 0 synthesis  
Date: 2026-06-02

This threat model covers the first observability, reliability, error handling, performance, and refactoring waves. It is a docs-only planning artifact and does not authorize any new canonical writer.

## Protected Assets

- Canonical markdown under `memory/**`, especially Events, Transactions, current pages, ReviewItems, and Logs.
- Raw user notes, Event raw text, source adapter input, source inbox units, provider prompts, provider responses, answer bases, and Workbench form bodies.
- `.assisto-local/**`, which is derived but can still contain sensitive local state such as pinned questions, source inbox sessions, run traces, eval questions, maintenance runs, caches, and future observability JSONL.
- Provider credentials and environment configuration, including API keys, bearer headers, and base URLs with embedded credentials.
- Transaction integrity: validation-before-write, Event preservation, failed/pending/applied state clarity, and repair notes.

## P0 Threats

### Inference Laundering

Generated drafts, cited answers, context packs, briefs, symbolic facts, Workbench summaries, maintenance findings, or provider explanations could become canonical claims or ReviewItems without Event evidence and a validated Transaction.

Required controls:

- Generated or derived output may guide, explain, preview, rank, or propose only.
- Durable writes require Events, Transactions, validation, and review.
- Regression tests should prove answer contracts, context packs, briefs, maintenance plans, symbolic output, and Workbench derived views leave canonical pages unchanged unless an explicit transaction-backed helper is called.

### Raw Content And Secret Leakage

Future logs, spans, metrics, debug endpoints, JSONL runs, error bodies, provider warnings, and canonical logs can leak raw notes, source text, provider bodies, proposed markdown writes, personal names, absolute paths, or secrets.

Required controls:

- Privacy utilities must precede observability and provider instrumentation.
- Logs and telemetry default to structural data: counts, durations, phase names, bounded enum codes, operation types, route templates, transaction state, validation issue codes, provider name/model, and status class.
- Provider diagnostics should use stable error categories such as `missing_api_key`, `missing_model`, `http_error`, `invalid_json`, `missing_content`, `network_error`, or `parse_error`.
- Metric labels must be bounded enums and must not include IDs, paths, raw routes, query text, names, raw errors, or hashes.

### Workbench Local API Mutation

Workbench binds to loopback by default, but local browser and process access is still a meaningful threat. Mutating routes can create Events, pending Transactions, apply/reject transactions, run maintenance, or send note content to providers.

Required controls:

- Host allowlist for loopback-only use unless explicitly configured.
- Origin/Referer checks and CSRF for mutating routes, including provider-preview routes and `.assisto-local` writes.
- Request body size limits before JSON parsing.
- No permissive CORS.
- Typed `400`, `403`, and `413` errors that do not echo request bodies.

### Transaction Partial Failure

Writes are atomic per file, not fully transactional across all files. A failure after Event creation or after non-Event writes can leave explainable but partial state.

Required controls:

- Validate before apply.
- Preserve Events on partial failure.
- Mark failed state clearly, keep repair notes, and append safe log entries when possible.
- Add manifest/lock semantics before ambient runtimes, scheduled jobs, or multi-agent apply.
- Do not silently reapply a partially applied transaction.

## P1 Threats

### Provider Call Exposure

Provider calls include note content, answer bases, source excerpts, citations, and model configuration. Failures can echo sensitive response bodies.

Required controls:

- Log provider metadata only: provider name, model, duration, status class, parse result, candidate count, warning code.
- Do not log prompt text, raw JSON, answer basis, context pack, citations body, authorization headers, or provider response body.
- Treat untrusted base URLs as review-worthy configuration.

### Derived Cache Staleness

Caches and indexes can become stale, corrupt, or overtrusted.

Required controls:

- Keep caches under `.assisto-local/cache/**` or another ignored derived path.
- Deleting cache must be safe.
- Invalidate by schema/parser/cache version plus path, size, mtime, and optional hash for changed files.
- Do not use `fs.watch` as source-of-truth invalidation.
- Cache failure must not hide malformed canonical pages.

### User Memory Git Hygiene

Current checkout can contain untracked real memory files. PR work can accidentally stage or mutate canonical user data.

Required controls:

- Do not stage or edit real `memory/events/**`, `memory/transactions/**`, or `.assisto-local/**` unless explicitly requested.
- Use temp vaults and committed test fixtures outside real memory.
- Run `pnpm check:memory-data` before staging or committing.

## Required Review Gates

- Security reviewer signs off JSONL examples before broad observability merges.
- Observability reviewer rejects high-cardinality metric labels.
- Provider instrumentation snapshots prove prompts and responses are absent.
- Transaction instrumentation snapshots prove proposed writes are absent.
- Workbench security tests cover Host, Origin, CSRF, body limits, safe GET routes, and provider-preview route protection.

## Open Questions

- Should `.assisto-local/source-inbox` retain full raw source text after Event creation, or compact to hashes and excerpts?
- Should Workbench require a local token even on loopback?
- Should provider calls default to disabled in Workbench unless explicitly enabled per request?
- Should canonical logs reject arbitrary free-text failure reasons?
- What retention policy should apply to `.assisto-local/runs/**` and local caches?
