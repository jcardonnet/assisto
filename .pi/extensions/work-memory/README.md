# Work Memory Pi Extension

Thin Pi wrapper for the deterministic work-memory core.

The extension exposes work-memory tools and slash commands, and installs a write guard that preserves the MVP transaction invariants:

- direct writes to `memory/people/`, `memory/topics/`, `memory/contexts/`, and `memory/followups/` are blocked unless invoked by `wm_apply_transaction`;
- writes to `.obsidian/` are blocked;
- writes outside `memory/` and `.pi/` return a warning.

Review apply and Event reprocess tools only create pending Transactions; they do not edit canonical pages directly.

It does not implement separate memory semantics, MCP, vector search, or autonomous background linting.
