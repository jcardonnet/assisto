# Agent Acceleration

## No-Copilot PR Closeout

Copilot reviews are disabled for this repository. The default closeout path does not wait for Copilot and does not require review-thread state.

Use:

```bash
pnpm agent:pr closeout <pr-number> --merge --yes --refresh-mxbai
```

This still requires:

- green GitHub checks;
- mergeable non-draft PR;
- active agent run with validation recorded as passed;
- `pnpm check:memory-data` with no blocking guarded changes;
- explicit `--merge --yes`.

Use the legacy review-thread gate only when a human explicitly asks for it:

```bash
pnpm agent:pr closeout <pr-number> --with-review-check
```

That opt-in path runs the review wait helper, stores a review-thread snapshot, and refuses unresolved review threads.
