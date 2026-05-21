---
description: Pack deterministic lexical context for a question without calling GPT or saving an answer.
argument-hint: <question>
tool: wm_pack_context
command: /wm-ask
---

# /ask <question>

Use `wm_pack_context` with the provided question.

If running through the CLI, use:

```bash
pnpm --filter @assisto/cli wm ask --pack-context "<question>"
```

Report the context pack and call out:

- Exact people, topics, and contexts loaded.
- Linked ReviewItems or FollowUps.
- Relevant Events included.
- Uncertainty markers for staged, contested, partial, unknown-scope, superseded, or rejected claims.

Safety constraints:

- Do not call GPT from this prompt.
- Do not save generated explanations.
- Do not edit canonical pages directly.
- Do not route retrieval through vector search or graph traversal beyond wikilinks.
- Do not implement MCP behavior.
- Prefer active claims, but surface uncertainty explicitly.
- If the user wants an answer saved, route it through ingestion and a Transaction.
