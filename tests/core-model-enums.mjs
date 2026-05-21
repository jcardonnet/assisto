import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import ts from "typescript";

async function loadEnumModule() {
  const source = readFileSync("packages/core/src/model/enums.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true
    }
  }).outputText;
  const encoded = Buffer.from(output).toString("base64");

  return import(`data:text/javascript;base64,${encoded}`);
}

export async function runCoreModelEnumTests() {
  const enums = await loadEnumModule();

  assert.deepEqual(enums.OBJECT_STATES, ["active", "archived"]);
  assert.deepEqual(enums.REVIEW_STATES, ["none", "staged", "reviewed", "contested"]);
  assert.deepEqual(enums.CLAIM_STATES, ["active", "staged", "superseded", "rejected"]);
  assert.deepEqual(enums.CLAIM_KINDS, [
    "fact",
    "inference",
    "assumption",
    "preference",
    "commitment"
  ]);
  assert.deepEqual(enums.EVIDENCE_STRENGTHS, ["explicit", "inferred", "weak"]);
  assert.deepEqual(enums.SCOPE_STATES, ["complete", "partial", "unknown"]);
  assert.deepEqual(enums.FOLLOWUP_STATES, [
    "candidate",
    "committed",
    "waiting",
    "closed",
    "rejected"
  ]);
  assert.deepEqual(enums.TRANSACTION_STATES, ["pending", "applied", "rejected", "failed"]);
  assert.deepEqual(enums.SUPPORTED_OPERATION_TYPES, [
    "ADD_EVENT",
    "UPSERT_CLAIM",
    "STAGE_REVIEW",
    "NOOP",
    "SUPERSEDE_CLAIM",
    "CLOSE_FOLLOWUP"
  ]);
  assert.deepEqual(enums.UNSUPPORTED_OPERATION_TYPES, [
    "MERGE",
    "SPLIT",
    "DELETE",
    "AUTO_RESOLVE_CONTRADICTION"
  ]);
  assert.deepEqual(enums.ENTITY_RESOLUTION_STATES, [
    "exact_match",
    "alias_match",
    "near_match",
    "new_entity",
    "ambiguous"
  ]);

  assert.equal(enums.OBJECT_STATES.includes("deleted"), false);
  assert.equal(enums.REVIEW_STATES.includes("pending"), false);
  assert.equal(enums.CLAIM_STATES.includes("committed"), false);
  assert.equal(enums.CLAIM_KINDS.includes("decision"), false);
  assert.equal(enums.EVIDENCE_STRENGTHS.includes("confidence"), false);
  assert.equal(enums.SCOPE_STATES.includes("global"), false);
  assert.equal(enums.FOLLOWUP_STATES.includes("open"), false);
  assert.equal(enums.TRANSACTION_STATES.includes("open"), false);
  assert.equal(enums.ENTITY_RESOLUTION_STATES.includes("merged"), false);

  for (const unsupportedOperation of enums.UNSUPPORTED_OPERATION_TYPES) {
    assert.equal(enums.SUPPORTED_OPERATION_TYPES.includes(unsupportedOperation), false);
  }
}
