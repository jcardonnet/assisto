export type SymbolicFact = {
  fact_id: string;
  relation: string;
  subject_id: string;
  object_id?: string;
  value?: string;
  source_claim_ids: string[];
  source_events: string[];
  inference_rule: "canonical_frame" | "inverse_relation";
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
