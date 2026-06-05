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

## Smart Validation Planner

Use the validation planner before deciding which local gates to run:

```bash
pnpm agent:validate --plan --json
```

The plan includes:

- `commands`: required validation commands with reason, cost, and required metadata;
- `skipped`: known commands that are not required for the current changed-file mode, with skip reasons;
- `file_reasons`: deterministic path classifications that explain why each changed file selected a validation mode.

Docs-only work can request the lighter docs process:

```bash
pnpm agent:validate --plan --json --docs-only
```

Use `--docs-only` only for branches whose intentional changes are docs/process files; it is an explicit override.

Use `--full` or `--ci-parity` when the branch has cross-cutting risk or when local evidence must mirror CI.
