import path from "node:path";
import { createHash } from "node:crypto";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseClaimBlocks, parseMarkdownFile } from "../markdown";
import type { ClaimBlock } from "../model";
import { extractCandidateFramesFromText, type MemoryFrame } from "../frames";
import { findOntologyRelation, loadOntologyRegistry, type OntologyRegistry } from "../ontology";
import { writeJsonl } from "./jsonl";
import type { SymbolicFact, SymbolicIndexResult, SymbolicProof } from "./types";

interface PageEntity {
  id: string;
  type: string;
  path: string;
}

export async function buildSymbolicIndex(options: { root: string; write?: boolean }): Promise<SymbolicIndexResult> {
  const files = await listMarkdownFiles(options.root, "memory/**/*.md");
  const entities = new Map<string, PageEntity>();
  const pages: Array<{ path: string; id?: string; type?: string; claims: ClaimBlock[] }> = [];

  for (const filePath of files) {
    if (filePath.startsWith("memory/indexes/")) {
      continue;
    }

    const parsed = parseMarkdownFile(await readMarkdownPage(options.root, filePath));
    const id = stringValue(parsed.frontmatter.id);
    const type = stringValue(parsed.frontmatter.type);
    const claims = parseClaimBlocks(parsed.body);

    pages.push({ path: filePath, id, type, claims });

    if (id && type) {
      indexPageEntity(entities, { id, type, path: filePath });
    }
  }

  const ontology = await loadOntologyRegistry(options.root);
  const facts: SymbolicFact[] = [];
  const proofs: SymbolicProof[] = [];

  for (const page of pages) {
    for (const claim of page.claims) {
      if (claim.claim_state !== "active") {
        continue;
      }

      const frames = extractCandidateFramesFromText({
        text: claim.statement,
        sourceEventId: claim.evidence[0] ?? "event_unknown"
      });

      for (const frame of frames) {
        const fact = factFromFrame(frame, claim, entities);

        if (!fact) {
          continue;
        }

        if (!facts.some((candidate) => candidate.fact_id === fact.fact_id)) {
          facts.push(fact);
          proofs.push(canonicalProof(fact));
        }

        const relation = frame.relation ? findOntologyRelation(ontology, frame.relation) : undefined;
        if (!relation?.inverse || !fact.object_id) {
          continue;
        }

        const inverseFact = inverseFactFrom(fact, relation.inverse);
        if (facts.some((candidate) => candidate.fact_id === inverseFact.fact_id)) {
          continue;
        }

        facts.push(inverseFact);
        proofs.push(inverseProof(inverseFact, fact));
      }
    }
  }

  addTransitiveFacts(facts, proofs, ontology);

  facts.sort(compareById);
  proofs.sort(compareById);

  const indexDir = path.join(options.root, "memory/indexes/symbolic");
  const indexPaths = [path.join(indexDir, "facts.jsonl"), path.join(indexDir, "proofs.jsonl")];

  if (options.write === true) {
    await writeJsonl(indexPaths[0] ?? "", facts);
    await writeJsonl(indexPaths[1] ?? "", proofs);
  }

  return {
    derived_facts: facts,
    proofs,
    canonical_writes: [],
    index_paths: indexPaths
  };
}

function factFromFrame(
  frame: MemoryFrame,
  claim: ClaimBlock,
  entities: Map<string, PageEntity>
): SymbolicFact | undefined {
  if (frame.frame_kind === "relation" && frame.relation && frame.object) {
    const subjectId = resolveEntityId(frame.subject.entity_id, entities);
    const objectId = resolveEntityId(frame.object.entity_id, entities);

    return {
      fact_id: symbolicId("fact", ["canonical_frame", frame.relation, subjectId, objectId, claim.claim_id]),
      relation: frame.relation,
      subject_id: subjectId,
      object_id: objectId,
      source_claim_ids: [claim.claim_id],
      source_events: claim.evidence,
      inference_rule: "canonical_frame"
    };
  }

  if (frame.frame_kind === "attribute" && frame.attribute && frame.value) {
    const subjectId = resolveEntityId(frame.subject.entity_id, entities);

    return {
      fact_id: symbolicId("fact", ["canonical_frame", frame.attribute, subjectId, frame.value, claim.claim_id]),
      relation: frame.attribute,
      subject_id: subjectId,
      value: frame.value,
      source_claim_ids: [claim.claim_id],
      source_events: claim.evidence,
      inference_rule: "canonical_frame"
    };
  }

  if ((frame.frame_kind === "decision" || frame.frame_kind === "open_question" || frame.frame_kind === "risk" || frame.frame_kind === "followup_signal") && frame.value) {
    const subjectId = resolveEntityId(frame.subject.entity_id, entities);

    return {
      fact_id: symbolicId("fact", ["canonical_frame", frame.frame_kind, subjectId, frame.value, claim.claim_id]),
      relation: frame.frame_kind,
      subject_id: subjectId,
      value: frame.value,
      source_claim_ids: [claim.claim_id],
      source_events: claim.evidence,
      inference_rule: "canonical_frame"
    };
  }

  return undefined;
}

function canonicalProof(fact: SymbolicFact): SymbolicProof {
  return {
    proof_id: symbolicId("proof", ["canonical_frame", fact.fact_id]),
    derived_fact_id: fact.fact_id,
    rule: "canonical_frame",
    source_fact_ids: [],
    source_claim_ids: fact.source_claim_ids,
    source_events: fact.source_events
  };
}

function inverseFactFrom(fact: SymbolicFact, inverseRelation: string): SymbolicFact {
  const subjectId = fact.object_id ?? "";
  const objectId = fact.subject_id;

  return {
    fact_id: symbolicId("fact", ["inverse_relation", inverseRelation, subjectId, objectId, fact.fact_id]),
    relation: inverseRelation,
    subject_id: subjectId,
    object_id: objectId,
    source_claim_ids: fact.source_claim_ids,
    source_events: fact.source_events,
    inference_rule: "inverse_relation"
  };
}

function inverseProof(inverseFact: SymbolicFact, sourceFact: SymbolicFact): SymbolicProof {
  return {
    proof_id: symbolicId("proof", ["inverse_relation", inverseFact.fact_id, sourceFact.fact_id]),
    derived_fact_id: inverseFact.fact_id,
    rule: "inverse_relation",
    source_fact_ids: [sourceFact.fact_id],
    source_claim_ids: sourceFact.source_claim_ids,
    source_events: sourceFact.source_events
  };
}


function addTransitiveFacts(facts: SymbolicFact[], proofs: SymbolicProof[], ontology: OntologyRegistry): void {
  const transitiveRelations = new Set(
    ontology.relations.filter((relation) => relation.transitive === true).map((relation) => relation.relation)
  );
  let added = true;

  while (added) {
    added = false;
    const snapshot = [...facts];

    for (const left of snapshot) {
      if (!transitiveRelations.has(left.relation) || !left.object_id) {
        continue;
      }

      for (const right of snapshot) {
        if (left.relation !== right.relation || left.object_id !== right.subject_id || !right.object_id) {
          continue;
        }

        if (left.subject_id === right.object_id) {
          continue;
        }

        if (
          facts.some(
            (candidate) =>
              candidate.relation === left.relation &&
              candidate.subject_id === left.subject_id &&
              candidate.object_id === right.object_id
          )
        ) {
          continue;
        }

        const fact: SymbolicFact = {
          fact_id: symbolicId("fact", ["transitive_relation", left.relation, left.subject_id, right.object_id, left.fact_id, right.fact_id]),
          relation: left.relation,
          subject_id: left.subject_id,
          object_id: right.object_id,
          source_claim_ids: unique([...left.source_claim_ids, ...right.source_claim_ids]),
          source_events: unique([...left.source_events, ...right.source_events]),
          inference_rule: "transitive_relation"
        };

        facts.push(fact);
        proofs.push({
          proof_id: symbolicId("proof", ["transitive_relation", fact.fact_id, left.fact_id, right.fact_id]),
          derived_fact_id: fact.fact_id,
          rule: "transitive_relation",
          source_fact_ids: [left.fact_id, right.fact_id],
          source_claim_ids: fact.source_claim_ids,
          source_events: fact.source_events
        });
        added = true;
      }
    }
  }
}

function indexPageEntity(entities: Map<string, PageEntity>, entity: PageEntity): void {
  entities.set(entity.id, entity);

  const entityKind = entityKindForPageType(entity.type);
  if (!entityKind) {
    return;
  }

  const basename = path.basename(entity.path, ".md");
  entities.set(`${entityKind}_${slug(basename)}`, entity);
  entities.set(`${entityKind}_${slug(entity.id)}`, entity);
  entities.set(slug(entity.id), entity);
}

function entityKindForPageType(type: string): string | null {
  switch (type) {
    case "person":
      return "person";
    case "context":
      return "context";
    case "topic":
      return "topic";
    default:
      return null;
  }
}

function resolveEntityId(candidate: string, entities: Map<string, PageEntity>): string {
  return entities.get(candidate)?.id ?? entities.get(slug(candidate))?.id ?? candidate;
}

function compareById<T extends { fact_id?: string; proof_id?: string }>(left: T, right: T): number {
  return (left.fact_id ?? left.proof_id ?? "").localeCompare(right.fact_id ?? right.proof_id ?? "");
}

function symbolicId(prefix: string, parts: string[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 16);
  return `sym_${prefix}_${digest}`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
