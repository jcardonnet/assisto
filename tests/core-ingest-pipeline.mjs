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

function index(input = []) {
  const entries = Array.isArray(input) ? input : input.entries ?? [];

  return {
    entries,
    ids: new Map(entries.flatMap((entry) => (entry.id ? [[entry.id, entry.path]] : []))),
    paths: new Set(entries.map((entry) => entry.path)),
    wikilinks: new Map(entries.map((entry) => [entry.path, entry.wikilinks ?? []])),
    eventIds: new Set(),
    claimIds:
      Array.isArray(input) || !input.claimIds
        ? new Map(
            entries.flatMap((entry) =>
              (entry.claimIds ?? []).map((claimId) => [claimId, entry.path])
            )
          )
        : input.claimIds,
    transactionIds: new Set()
  };
}

function operationsOf(draft) {
  return draft.operations.map((operation) => operation.operation);
}

function writeFor(draft, path) {
  return draft.writes.find((write) => write.path === path);
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

  const scopedContext = context("In Warehouse Project, we use Redis.");
  const scopedProposals = detectors.detectCandidateProposals(scopedContext);

  assert.deepEqual(
    scopedProposals.map((proposal) => proposal.kind),
    ["claim"]
  );
  assert.equal(scopedProposals.some((proposal) => "content" in proposal || "path" in proposal), false);
  assert.equal(scopedProposals[0].entity_name, "Redis");
  assert.equal(scopedProposals[0].scope, "Warehouse Project");
  assert.equal(scopedProposals[0].scope_state, "complete");

  const scopedResolved = entityResolution.resolveDetectorProposals(
    scopedProposals,
    index([
      {
        path: "memory/contexts/inventory-project.md",
        id: "ctx_inventory_project",
        type: "context",
        aliases: ["Warehouse Project"],
        wikilinks: [],
        claimIds: []
      }
    ])
  );
  const scopedDraft = builder.buildIngestExtractionDraft(scopedContext, scopedResolved);
  const redisWrite = writeFor(scopedDraft, "memory/topics/redis.md");

  assert.equal(scopedResolved[0].scope, "ctx_inventory_project");
  assert.equal(scopedResolved[0].scope_resolution.resolution_state, "alias_match");
  assert.deepEqual(operationsOf(scopedDraft), ["UPSERT_CLAIM"]);
  assert.ok(redisWrite);
  assert.match(redisWrite.content, /scope: ctx_inventory_project/);
  assert.equal(scopedDraft.writes.some((write) => write.path.startsWith("memory/review/")), false);

  const newScopeContext = context("In New Warehouse Project, we use Redis.");
  const newScopeResolved = entityResolution.resolveDetectorProposals(
    detectors.detectCandidateProposals(newScopeContext),
    index()
  );
  const newScopeDraft = builder.buildIngestExtractionDraft(newScopeContext, newScopeResolved);

  assert.deepEqual(operationsOf(newScopeDraft), ["STAGE_REVIEW"]);
  assert.equal(newScopeDraft.writes.some((write) => write.path === "memory/topics/redis.md"), false);
  assert.equal(newScopeDraft.writes.some((write) => write.path.startsWith("memory/review/")), true);
  assert.match(newScopeDraft.writes.map((write) => write.content).join("\n"), /review_reason: context_scope_new/);

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

  const orgChartContext = context(
    "Kuastav, the Sr. Director of Software Engineering, is my manager. He reports to Jeff, the CTO."
  );
  const orgChartProposals = detectors.detectCandidateProposals(orgChartContext);

  assert.deepEqual(
    orgChartProposals
      .filter((proposal) => proposal.kind === "claim")
      .map((proposal) => proposal.claim_id),
    [
      "clm_kuastav_manager",
      "clm_kuastav_role_sr_director_of_software_engineering",
      "clm_kuastav_reports_to_jeff",
      "clm_jeff_role_cto"
    ]
  );

  const orgChartDraft = builder.buildIngestExtractionDraft(
    orgChartContext,
    entityResolution.resolveDetectorProposals(orgChartProposals, index())
  );
  const kuastavPage = orgChartDraft.writes.find((write) => write.path === "memory/people/kuastav.md")?.content ?? "";
  const jeffPage = orgChartDraft.writes.find((write) => write.path === "memory/people/jeff.md")?.content ?? "";

  assert.match(kuastavPage, /Kuastav is my manager\./);
  assert.match(kuastavPage, /Kuastav is the Sr\. Director of Software Engineering\./);
  assert.match(kuastavPage, /Kuastav reports to Jeff\./);
  assert.match(kuastavPage, /evidence: \[ev_2026_05_20_001\]/);
  assert.match(jeffPage, /Jeff is the CTO\./);

  const reportingConflictIndex = index({
    entries: [
      {
        path: "memory/people/kuastav.md",
        id: "per_kuastav",
        type: "person",
        aliases: [],
        wikilinks: [],
        claimIds: ["clm_kuastav_reports_to_jeff"]
      }
    ],
    claimIds: new Map([["clm_kuastav_reports_to_jeff", "memory/people/kuastav.md"]])
  });
  const reportingConflictContext = context("Kuastav reports to Alice.");
  const reportingConflictDraft = builder.buildIngestExtractionDraft(
    reportingConflictContext,
    entityResolution.resolveDetectorProposals(
      detectors.detectCandidateProposals(reportingConflictContext),
      reportingConflictIndex
    )
  );

  assert.equal(reportingConflictDraft.writes.some((write) => write.path === "memory/people/kuastav.md"), false);
  assert.match(
    reportingConflictDraft.writes.map((write) => write.content).join("\n"),
    /review_reason: reporting_change/
  );

  const claimIdConflictContext = context("Joe is the DBA.");
  const claimIdConflictIndex = index({
    entries: [
      {
        path: "memory/people/joe.md",
        id: "per_joe",
        type: "person",
        aliases: [],
        wikilinks: [],
        claimIds: []
      },
      {
        path: "memory/topics/mysql.md",
        id: "top_mysql",
        type: "topic",
        aliases: [],
        wikilinks: [],
        claimIds: ["clm_joe_role_dba"]
      }
    ],
    claimIds: new Map([["clm_joe_role_dba", "memory/topics/mysql.md"]])
  });
  const claimIdConflictDraft = builder.buildIngestExtractionDraft(
    claimIdConflictContext,
    entityResolution.resolveDetectorProposals(
      detectors.detectCandidateProposals(claimIdConflictContext),
      claimIdConflictIndex
    )
  );

  assert.equal(claimIdConflictDraft.writes.some((write) => write.path === "memory/people/joe.md"), false);
  assert.match(
    claimIdConflictDraft.writes.map((write) => write.content).join("\n"),
    /review_reason: claim_id_conflict/
  );
}
