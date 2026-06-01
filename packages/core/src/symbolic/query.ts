import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SymbolicFact, SymbolicProof } from "./types";

export type SymbolicQueryInput = {
  facts: SymbolicFact[];
  proofs: SymbolicProof[];
  relation?: string;
  subject_id?: string;
  object_id?: string;
};

export type SymbolicQueryResult = {
  matches: Array<{
    fact: SymbolicFact;
    proof: SymbolicProof;
  }>;
  missing: string[];
};

export type LoadedSymbolicIndex = {
  facts: SymbolicFact[];
  proofs: SymbolicProof[];
  index_paths: string[];
};

export function querySymbolicFacts(input: SymbolicQueryInput): SymbolicQueryResult {
  const matches = input.facts
    .filter((fact) => input.relation === undefined || fact.relation === input.relation)
    .filter((fact) => input.subject_id === undefined || fact.subject_id === input.subject_id)
    .filter((fact) => input.object_id === undefined || fact.object_id === input.object_id)
    .map((fact) => ({
      fact,
      proof: input.proofs.find((proof) => proof.derived_fact_id === fact.fact_id)
    }))
    .filter((item): item is { fact: SymbolicFact; proof: SymbolicProof } => item.proof !== undefined);

  return {
    matches,
    missing: matches.length === 0 ? ["no_symbolic_fact_match"] : []
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
