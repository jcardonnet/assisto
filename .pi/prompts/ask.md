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
pnpm --filter @assisto/cli wm ask --answer-basis "<question>"
```

Report the structured result and preserve the raw `contextPack` if the user asks for detail. Start with `queryIntent`, `plannedLookups`, `answerCandidates`, and `supportingClaims`, then call out:

- The deterministic retrieval intent, planned lookup types, and lookup result states.
- Exact people, topics, and contexts loaded.
- What memory can say from active `answerCandidates`.
- What memory cannot confirm from `missingInformation`, warnings, or uncertain claims.
- Active claims, including `claim_id`, `claim_kind`, `claim_state`, scope, `scope_state`, and Event evidence.
- Uncertain, staged, superseded, rejected, contested, partial, or unknown-scope claims.
- Linked ReviewItems or FollowUps from `linkedReviewItems` and `linkedFollowUps`.
- Relevant Events included.
- Suggested manual actions and next questions from `manualActions` and `suggestedNextQuestions`.
- No-match guidance when no page or relation claim matched.

Safety constraints:

- Do not call GPT from this prompt.
- If you answer the user, answer only from the returned context pack and structured fields.
- Do not save generated explanations.
- Do not edit canonical pages directly.
- Do not route retrieval through vector search or graph traversal beyond wikilinks.
- Do not implement MCP behavior.
- Prefer active claims, but surface uncertainty explicitly.
- If evidence is absent or a claim is staged/contested/superseded, say that plainly.
- If the user wants an answer saved, route it through ingestion and a Transaction.
