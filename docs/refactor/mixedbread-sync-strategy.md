# Mixedbread Sync Strategy

Status: Wave 0 synthesis  
Date: 2026-06-02

Use Mixedbread as a retrieval wayfinder before non-trivial edits, then open local files before patching. Do not patch from search snippets.

## Current Best Strategy

For Assisto, the safest refresh path is manifest-scoped upload after validation, not broad ad hoc sync:

1. Run the validation matrix for the changed area.
2. Run a manifest-scoped dry run.
3. Inspect the dry run for unrelated untracked files, guarded memory data, generated artifacts, or unexpected scope.
4. Refresh the `assisto` store only after the branch is merged onto a clean/synced `main`, or after every untracked file in manifest scope is explicitly approved for indexing.
5. Run the smoke search.

Current repo automation:

```bash
pnpm mxbai:upload
pnpm mxbai:smoke
```

## Why Upload, Not Sync, For This Repo

The checked-in upload manifest preserves per-area metadata for docs, schema, source, runtime prompts, and tests. It also avoids real user-memory event and transaction data.

`mxbai store sync --from-git` is useful for future automation where pattern-level metadata is sufficient and the sync scope has been explicitly reviewed. It should not replace the manifest path until metadata and exclusion behavior are equivalent.

## Dry-Run Finding From Wave 0

The Wave 0 dry run resolved 238 files. It included the new Wave 0 docs and an unrelated pre-existing untracked doc under `docs/superpowers/plans/`.

Therefore, do not run a real Mixedbread refresh from this dirty worktree. Refresh after merge from clean/synced `main`, or explicitly approve every untracked file in the manifest scope before uploading.
