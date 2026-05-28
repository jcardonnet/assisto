# Assisto Agent Control Plane

`.assisto-agent/` stores local development-agent state for this repository.

Tracked files define schemas and documentation. Runtime files are ignored:

- `.assisto-agent/runs/**`
- `.assisto-agent/logs/**`
- `.assisto-agent/cache/**`

This control plane is development infrastructure only. It must not be used as product memory, and it must not write guarded user memory data under `memory/events/**` or `memory/transactions/**`.

## Failure Memory

Use `pnpm agent:run -- <command...>` when a validation or workflow command is likely to need later diagnosis. The command records:

- command arguments;
- exit code and duration;
- stdout/stderr summaries;
- environment hints such as temp directories and CI flags;
- deterministic failure diagnosis and rerun guidance;
- a link from the active run ledger when one exists.

Use `pnpm agent:diagnose:last` or `pnpm agent:diagnose <log-id>` to revisit the most recent or a specific command result.

## PR State

Use `pnpm agent:pr advance <state> <pr>` to record explicit PR transitions on the active run. Use `pnpm agent:pr comments <pr> --write` to snapshot review threads into ignored run state, and `pnpm agent:pr status <pr>` to inspect readiness gates.

`pnpm agent:pr closeout <pr> --merge --yes --refresh-mxbai` refuses to merge unless review waiting has elapsed, review threads are checked and resolved, CI is green, the PR is non-draft and mergeable, guarded memory data is unchanged, and the active run records validation as passed.
