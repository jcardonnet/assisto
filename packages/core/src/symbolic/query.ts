import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  SymbolicFact,
  SymbolicProof,
  SymbolicProofTree,
  SymbolicQueryIntent,
  SymbolicQueryPlan,
  SymbolicReasoningResultV2
} from "./types";

export type SymbolicQueryInput = {
  facts: SymbolicFact[];
  proofs: SymbolicProof[];
  relation?: string;
  subject_id?: string;
  object_id?: string;
  query?: string;
};

export type SymbolicQueryResult = SymbolicReasoningResultV2;

export type LoadedSymbolicIndex = {
  facts: SymbolicFact[];
  proofs: SymbolicProof[];
  index_paths: string[];
};

export function querySymbolicFacts(input: SymbolicQueryInput): SymbolicQueryResult {
  const proofByFact = new Map(input.proofs.map((proof) => [proof.derived_fact_id, proof]));
  const queryPlan = planSymbolicQuery(input.query, input.facts, input.relation);
  const relations = input.relation ? [input.relation] : queryPlan.planned_relations;
  const matches = input.facts
    .filter((fact) => relations.length === 0 || relations.includes(fact.relation))
    .filter((fact) => input.subject_id === undefined || fact.subject_id === input.subject_id)
    .filter((fact) => input.object_id === undefined || fact.object_id === input.object_id)
    .filter((fact) => queryPlan.target_terms.length === 0 || factMatchesAnyTerm(fact, queryPlan.target_terms))
    .map((fact) => ({
      fact,
      proof: proofByFact.get(fact.fact_id)
    }))
    .filter((item): item is { fact: SymbolicFact; proof: SymbolicProof } => item.proof !== undefined)
    .map((item) => ({
      ...item,
      proof_tree: proofTreeFor(item.proof, proofByFact)
    }));

  const missing = matches.length === 0 ? ["no_symbolic_fact_match"] : [];
  const reasoningSteps = reasoningStepsFor(queryPlan, matches.length);

  return {
    version: "symbolic-reasoning-v2",
    query: input.query,
    query_plan: queryPlan,
    matches,
    missing,
    reasoning_steps: reasoningSteps,
    proof_trees: matches.map((match) => match.proof_tree)
  };
}

export async function loadSymbolicIndex(root: string): Promise<LoadedSymbolicIndex> {
  const indexDir = path.join(root, "memory/indexes/symbolic");
  const factsPath = path.join(indexDir, "facts.jsonl");
  const proofsPath = path.join(indexDir, "proofs.jsonl");

  return {
    facts: await readJsonl<SymbolicFact>(factsPath),
    proofs: await readJsonl<SymbolicProof>(proofsPath),
    index_paths: [factsPath, proofsPath]
  };
}

function planSymbolicQuery(query: string | undefined, facts: SymbolicFact[], relation?: string): SymbolicQueryPlan {
  if (relation) {
    return {
      query,
      intent: "relation_lookup",
      planned_relations: [relation],
      target_terms: targetTermsFor(query, facts)
    };
  }

  const normalized = normalize(query ?? "");
  const intent = inferIntent(normalized);

  return {
    query,
    intent,
    planned_relations: relationsForIntent(intent),
    target_terms: targetTermsFor(query, facts)
  };
}

function inferIntent(normalizedQuery: string): SymbolicQueryIntent {
  if (/\b(report|reports|manager|manages)\b/.test(normalizedQuery)) {
    return "reporting_lookup";
  }

  if (/\b(owner|owns|owned|maintain|maintains|maintained)\b/.test(normalizedQuery)) {
    return "ownership_lookup";
  }

  if (/\b(depend|depends|dependency|dependencies|requires|needs)\b/.test(normalizedQuery)) {
    return "dependency_chain";
  }

  if (/\b(block|blocks|blocked|blocker|blocking)\b/.test(normalizedQuery)) {
    return "blocker_chain";
  }

  if (/\b(meeting|meet|met|participant|participants|discussed|discussion)\b/.test(normalizedQuery)) {
    return "meeting_participation";
  }

  if (/\b(open question|open questions|question|questions)\b/.test(normalizedQuery)) {
    return "open_question_lookup";
  }

  if (/\b(commitment|commitments|committed|due|deadline)\b/.test(normalizedQuery)) {
    return "commitment_due_lookup";
  }

  if (/\b(changed|change|recent|recently|new)\b/.test(normalizedQuery)) {
    return "changed_recently";
  }

  return "proof_lookup";
}

function relationsForIntent(intent: SymbolicQueryIntent): string[] {
  switch (intent) {
    case "reporting_lookup":
      return ["reports_to", "manages"];
    case "ownership_lookup":
      return ["owns", "owned_by", "maintains", "maintained_by"];
    case "dependency_chain":
      return ["depends_on", "depended_on_by"];
    case "blocker_chain":
      return ["blocks", "blocked_by", "risk_affects", "raises_risk"];
    case "meeting_participation":
      return ["participant_in", "has_participant", "discussed_in", "has_discussion_subject"];
    case "open_question_lookup":
      return ["open_question", "has_open_question", "open_question_for"];
    case "commitment_due_lookup":
      return ["committed_to", "commitment_owner", "due_on", "due_for"];
    case "changed_recently":
    case "proof_lookup":
      return [];
    case "relation_lookup":
      return [];
  }
}

function targetTermsFor(query: string | undefined, facts: SymbolicFact[]): string[] {
  const normalizedQuery = normalize(query ?? "");

  if (!normalizedQuery) {
    return [];
  }

  const terms = new Set<string>();

  for (const fact of facts) {
    for (const term of factTerms(fact)) {
      if (term.length >= 3 && normalizedQuery.includes(term)) {
        terms.add(term);
      }
    }
  }

  return Array.from(terms).sort();
}

function factMatchesAnyTerm(fact: SymbolicFact, terms: string[]): boolean {
  const searchable = factTerms(fact);
  return terms.some((term) => searchable.includes(term));
}

function factTerms(fact: SymbolicFact): string[] {
  return unique([
    ...entityTerms(fact.subject_id),
    ...(fact.object_id ? entityTerms(fact.object_id) : []),
    ...(fact.value ? [normalize(fact.value)] : [])
  ]).filter(Boolean);
}

function entityTerms(id: string): string[] {
  const label = normalize(id.replace(/^(person|context|topic|system|service|repo|artifact|risk|meeting|decision|open_question|commitment|due|team|role)_/, ""));
  const terms = [label];

  if (id.startsWith("repo_")) {
    terms.push(`${label} repository`);
  }

  if (id.startsWith("service_")) {
    terms.push(`${label} service`);
  }

  if (id.startsWith("context_")) {
    terms.push(`${label} project`);
  }

  return unique(terms);
}

function proofTreeFor(
  proof: SymbolicProof,
  proofByFact: Map<string, SymbolicProof>,
  seen = new Set<string>()
): SymbolicProofTree {
  if (seen.has(proof.derived_fact_id)) {
    return {
      proof_id: proof.proof_id,
      derived_fact_id: proof.derived_fact_id,
      rule: proof.rule,
      source_fact_ids: proof.source_fact_ids,
      source_claim_ids: proof.source_claim_ids,
      source_events: proof.source_events,
      children: []
    };
  }

  const nextSeen = new Set(seen);
  nextSeen.add(proof.derived_fact_id);

  return {
    proof_id: proof.proof_id,
    derived_fact_id: proof.derived_fact_id,
    rule: proof.rule,
    source_fact_ids: proof.source_fact_ids,
    source_claim_ids: proof.source_claim_ids,
    source_events: proof.source_events,
    children: proof.source_fact_ids
      .map((factId) => proofByFact.get(factId))
      .filter((candidate): candidate is SymbolicProof => candidate !== undefined)
      .map((sourceProof) => proofTreeFor(sourceProof, proofByFact, nextSeen))
  };
}

function reasoningStepsFor(plan: SymbolicQueryPlan, matchCount: number): string[] {
  const relationSummary = plan.planned_relations.length > 0 ? plan.planned_relations.join(", ") : "all proof-backed facts";
  const targetSummary = plan.target_terms.length > 0 ? plan.target_terms.join(", ") : "no target filter";

  return [
    `intent=${plan.intent}`,
    `relations=${relationSummary}`,
    `targets=${targetSummary}`,
    `matches=${matchCount}`
  ];
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    return (await readFile(filePath, "utf8"))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
