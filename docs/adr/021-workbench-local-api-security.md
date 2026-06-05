# ADR-021: Workbench Local API Security

Status: Proposed  
Date: 2026-06-02

## Context

Workbench defaults to `127.0.0.1:3721` and is a derived browser operating surface. It also exposes mutating routes that create Events, create pending Transactions, apply/reject Transactions, update local sessions, run maintenance, and call providers. Loopback is useful but not enough as a complete browser security boundary.

## Decision

Workbench local APIs should remain loopback by default and protect mutating routes before broader observability or provider previews are added.

Required controls:

- Host allowlist for `127.0.0.1`, `localhost`, `[::1]`, and the actual bound host/port unless explicitly configured.
- Origin/Referer checks for mutating browser routes.
- CSRF token for mutating POST routes, including provider preview routes and `.assisto-local/**` writes.
- Request body size limits before JSON parsing.
- No permissive CORS.
- Typed `400`, `403`, and `413` errors that do not echo request bodies.
- GET/HEAD read routes remain no-store.

Durable POST routes must continue to call core capture, review, source, health, maintenance, or transaction helpers. They must not write canonical pages directly.

## Consequences

- Local web attack risk is reduced while preserving browser UX.
- Route classification becomes a contract: preview, derived-only local state, Event+Transaction creation, pending Transaction change, or validated apply.
- Browser and Workbench tests must cover Host/Origin/CSRF/body-limit behavior.

## Open Questions

- Should CSRF be cookie plus header, hidden boot token, or per-process token embedded in served HTML?
- Should non-browser local tools use an explicit token?
- What body size caps are appropriate for source import previews?
- Should CSRF checks live in HTTP request handling, route dispatch, or both for testability?
