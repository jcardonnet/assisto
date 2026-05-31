---
description: Produce a deterministic cited answer contract for a question without saving generated prose.
argument-hint: <question>
tool: wm_pack_context
command: /wm-ask
---

# /wm-ask <question>

Prefer `wm ask --contract-v3 "<question>"`.

Surface:

- `directAnswers`;
- `cannotConfirm`;
- `conflicts`;
- `staleSignals`;
- `citationMap`;
- `repairActions`;
- inference paths;
- `contextPack` compatibility.

Canonical/derived boundary:

Derived views may guide, preview, and propose. They may not write canonical memory directly. Durable changes go through Events and pending/applied Transactions.

Safety:

- Do not call GPT from this prompt.
- Answer only from the returned contract and context pack.
- Generated prose is disposable.
- Do not save generated explanations.
- Do not edit canonical pages directly.
- Do not route retrieval through vector/graph state as canonical truth.
- If a claim is missing, staged, contested, superseded, stale, or unsupported, say so.
- If the user wants an answer saved, route it through capture/ingestion and a Transaction.
