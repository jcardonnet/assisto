export type SymbolicFact = {
  fact_id: string;
  relation: string;
  subject_id: string;
  object_id?: string;
  value?: string;
  source_claim_ids: string[];
  source_events: string[];
  inference_rule: "canonical_frame" | "inverse_relation" | "transitive_relation";
};

export type SymbolicProof = {
  proof_id: string;
  derived_fact_id: string;
  rule: string;
  source_fact_ids: string[];
  source_claim_ids: string[];
  source_events: string[];
};

export type SymbolicIndexResult = {
  derived_facts: SymbolicFact[];
  proofs: SymbolicProof[];
  canonical_writes: string[];
  index_paths: string[];
};

export type SymbolicProofTree = {
  proof_id: string;
  derived_fact_id: string;
  rule: string;
  source_fact_ids: string[];
  source_claim_ids: string[];
  source_events: string[];
  children: SymbolicProofTree[];
};

export type SymbolicQueryIntent =
  | "relation_lookup"
  | "reporting_lookup"
  | "ownership_lookup"
  | "dependency_chain"
  | "blocker_chain"
  | "meeting_participation"
  | "open_question_lookup"
  | "commitment_due_lookup"
  | "changed_recently"
  | "proof_lookup";

export type SymbolicQueryPlan = {
  query?: string;
  intent: SymbolicQueryIntent;
  planned_relations: string[];
  target_terms: string[];
};

export type SymbolicReasoningResultV2 = {
  version: "symbolic-reasoning-v2";
  query?: string;
  query_plan: SymbolicQueryPlan;
  matches: Array<{
    fact: SymbolicFact;
    proof: SymbolicProof;
    proof_tree: SymbolicProofTree;
  }>;
  missing: string[];
  reasoning_steps: string[];
  proof_trees: SymbolicProofTree[];
};
