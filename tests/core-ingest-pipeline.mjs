import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

function context(note) {
  return {
    root: "/tmp/assisto-pipeline-test",
    note,
    now: "2026-05-20T12:00:00-03:00",
    observedAt: null,
    eventId: "ev_2026_05_20_001",
    eventPath: "memory/events/2026/2026-05/2026-05-20-001.md",
    eventLinkPath: "events/2026/2026-05/2026-05-20-001",
    transactionId: "tx_2026_05_20_001"
  };
}

function index(entries = []) {
  return {
    entries,
    ids: new Map(entries.flatMap((entry) => (entry.id ? [[entry.id, entry.path]] : []))),
    paths: new Set(entries.map((entry) => entry.path)),
    wikilinks: new Map(entries.map((entry) => [entry.path, entry.wikilinks ?? []])),
    eventIds: new Set(),
    claimIds: new Map(),
    transactionIds: new Set()
  };
}

function operationsOf(draft) {
  return draft.operations.map((operation) => operation.operation);
}

export async function runCoreIngestPipelineTests() {
  const detectors = await loadTsModule("packages/core/src/ingest/detectors.ts");
  const entityResolution = await loadTsModule("packages/core/src/ingest/entity-resolution.ts");
  const builder = await loadTsModule("packages/core/src/ingest/transaction-builder.ts");

  const noteContext = context("Joe is the DBA. We use MySQL.");
  const spans = detectors.detectCandidateSpans(noteContext.note);
  const proposals = detectors.detectCandidateProposals(noteContext);

  assert.equal(spans.length, 2);
  assert.deepEqual(
    proposals.map((proposal) => proposal.kind),
    ["claim", "claim"]
  );
  assert.equal(proposals.some((proposal) => "content" in proposal || "path" in proposal), false);
  assert.match(proposals[0].source_text, /Joe is the DBA/);
  assert.match(proposals[1].source_text, /We use MySQL/);

  const resolved = entityResolution.resolveDetectorProposals(proposals, index());
  assert.equal(resolved[0].entity.path, "memory/people/joe.md");
  assert.equal(resolved[1].entity.path, "memory/topics/mysql.md");

  const draft = builder.buildIngestExtractionDraft(noteContext, resolved);
  assert.deepEqual(operationsOf(draft), ["UPSERT_CLAIM", "STAGE_REVIEW"]);
  assert.equal(draft.writes.some((write) => write.path === "memory/people/joe.md"), true);
  assert.equal(draft.writes.some((write) => write.path === "memory/review/unscoped-claims.md"), true);

  const ambiguousContext = context("Joe is the DBA.");
  const ambiguousProposals = detectors.detectCandidateProposals(ambiguousContext);
  const ambiguousResolved = entityResolution.resolveDetectorProposals(
    ambiguousProposals,
    index([
      {
        path: "memory/people/joe-dba.md",
        id: "per_joe_dba",
        type: "person",
        wikilinks: [],
        claimIds: []
      },
      {
        path: "memory/people/joe-sales.md",
        id: "per_joe_sales",
        type: "person",
        wikilinks: [],
        claimIds: []
      }
    ])
  );
  const ambiguousDraft = builder.buildIngestExtractionDraft(ambiguousContext, ambiguousResolved);

  assert.equal(ambiguousResolved[0].entity.resolution_state, "ambiguous");
  assert.deepEqual(operationsOf(ambiguousDraft), ["STAGE_REVIEW"]);
  assert.equal(ambiguousDraft.writes.some((write) => write.path === "memory/people/joe.md"), false);
  assert.equal(ambiguousDraft.writes.some((write) => write.path.startsWith("memory/review/")), true);
  assert.match(ambiguousDraft.writes.map((write) => write.content).join("\n"), /ambiguous entity resolution/);
}
