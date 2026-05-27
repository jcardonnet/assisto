# Assisto Agent Control Plane

`.assisto-agent/` stores local development-agent state for this repository.

Tracked files define schemas and documentation. Runtime files are ignored:

- `.assisto-agent/runs/**`
- `.assisto-agent/logs/**`
- `.assisto-agent/cache/**`

This control plane is development infrastructure only. It must not be used as product memory, and it must not write guarded user memory data under `memory/events/**` or `memory/transactions/**`.
