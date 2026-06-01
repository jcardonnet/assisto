import { readFile } from "node:fs/promises";
import path from "node:path";

export type OntologyEntityKind = "Person" | "Context" | "Topic" | "System" | "Service" | "Repository" | "Artifact" | "Incident" | "Risk" | "Meeting" | "Decision" | "OpenQuestion" | "Commitment" | "DueDate" | "Team" | "Role";
export type OntologyReviewRisk = "low" | "medium" | "high";
export type OntologyRelationCardinality = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
export type OntologyReviewLane = "none" | "role_change" | "reporting_change" | "ownership_change" | "identity_risk" | "technology_change" | "dependency_change" | "blocker_change" | "risk_change" | "commitment_change" | "discussion_change" | "decision_change" | "open_question_change" | "meeting_change" | "structure_change";
export type OntologyFrameChangeType = "new" | "change";

export interface OntologyRelationDefinition {
  relation: string;
  domain: OntologyEntityKind | OntologyEntityKind[];
  range: OntologyEntityKind | OntologyEntityKind[];
  inverse?: string;
  requires_scope?: boolean;
  review_risk?: OntologyReviewRisk;
  review_lane?: OntologyReviewLane;
  cardinality?: OntologyRelationCardinality;
  transitive?: boolean;
  symmetric?: boolean;
}

export interface OntologyRegistry {
  ontology_version: string;
  entity_kinds: OntologyEntityKind[];
  relations: OntologyRelationDefinition[];
}

export interface OntologyAwareFrame {
  subject_id?: string;
  subject_kind: string;
  relation: string;
  object_id?: string;
  object_kind: string;
  statement: string;
  scope?: string | null;
  evidence: string[];
  change_type?: OntologyFrameChangeType;
}

export type OntologyFrameErrorCode =
  | "ONTOLOGY_RELATION_UNKNOWN"
  | "ONTOLOGY_DOMAIN_INVALID"
  | "ONTOLOGY_RANGE_INVALID"
  | "ONTOLOGY_SCOPE_REQUIRED"
  | "ONTOLOGY_FRAME_MISSING_EVIDENCE";

export interface OntologyFrameValidationIssue {
  code: OntologyFrameErrorCode;
  message: string;
  field?: string;
}

export interface OntologyFrameValidationResult {
  passed: boolean;
  errors: OntologyFrameValidationIssue[];
  relation?: OntologyRelationDefinition;
  review_risk: OntologyReviewRisk;
  requires_review: boolean;
  review_reasons: string[];
}

export const defaultOntologyRegistry: OntologyRegistry = {
  "ontology_version": "2026-06-01.2",
  "entity_kinds": [
    "Person",
    "Context",
    "Topic",
    "System",
    "Service",
    "Repository",
    "Artifact",
    "Incident",
    "Risk",
    "Meeting",
    "Decision",
    "OpenQuestion",
    "Commitment",
    "DueDate",
    "Team",
    "Role"
  ],
  "relations": [
    {
      "relation": "reports_to",
      "domain": "Person",
      "range": "Person",
      "inverse": "manages",
      "requires_scope": false,
      "review_risk": "high",
      "review_lane": "reporting_change",
      "cardinality": "many_to_one"
    },
    {
      "relation": "manages",
      "domain": "Person",
      "range": "Person",
      "inverse": "reports_to",
      "requires_scope": false,
      "review_risk": "high",
      "review_lane": "reporting_change",
      "cardinality": "one_to_many"
    },
    {
      "relation": "role_in",
      "domain": "Person",
      "range": "Role",
      "requires_scope": true,
      "review_risk": "high",
      "review_lane": "role_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "owns",
      "domain": [
        "Person",
        "Team"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic"
      ],
      "inverse": "owned_by",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "ownership_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "owns_system",
      "domain": "Person",
      "range": [
        "System",
        "Service",
        "Topic"
      ],
      "inverse": "owned_by",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "ownership_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "owned_by",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic"
      ],
      "range": [
        "Person",
        "Team"
      ],
      "inverse": "owns",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "ownership_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "maintains",
      "domain": [
        "Person",
        "Team"
      ],
      "range": [
        "System",
        "Service",
        "Repository",
        "Artifact"
      ],
      "inverse": "maintained_by",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "ownership_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "maintained_by",
      "domain": [
        "System",
        "Service",
        "Repository",
        "Artifact"
      ],
      "range": [
        "Person",
        "Team"
      ],
      "inverse": "maintains",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "ownership_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "uses_technology",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact"
      ],
      "range": [
        "Topic",
        "System",
        "Service"
      ],
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "technology_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "depends_on",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic"
      ],
      "inverse": "depended_on_by",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "dependency_change",
      "cardinality": "many_to_many",
      "transitive": true
    },
    {
      "relation": "depended_on_by",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact"
      ],
      "inverse": "depends_on",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "dependency_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "blocks",
      "domain": [
        "Risk",
        "Incident",
        "OpenQuestion",
        "System",
        "Service",
        "Context",
        "Topic"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Commitment",
        "OpenQuestion"
      ],
      "inverse": "blocked_by",
      "requires_scope": true,
      "review_risk": "high",
      "review_lane": "blocker_change",
      "cardinality": "many_to_many",
      "transitive": true
    },
    {
      "relation": "blocked_by",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Commitment",
        "OpenQuestion"
      ],
      "range": [
        "Risk",
        "Incident",
        "OpenQuestion",
        "System",
        "Service",
        "Context",
        "Topic"
      ],
      "inverse": "blocks",
      "requires_scope": true,
      "review_risk": "high",
      "review_lane": "blocker_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "raises_risk",
      "domain": [
        "Person",
        "Team",
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Meeting"
      ],
      "range": "Risk",
      "inverse": "risk_affects",
      "requires_scope": true,
      "review_risk": "high",
      "review_lane": "risk_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "risk_affects",
      "domain": "Risk",
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Commitment"
      ],
      "inverse": "raises_risk",
      "requires_scope": true,
      "review_risk": "high",
      "review_lane": "risk_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "participant_in",
      "domain": [
        "Person",
        "Team"
      ],
      "range": "Meeting",
      "inverse": "has_participant",
      "requires_scope": false,
      "review_risk": "low",
      "review_lane": "meeting_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "has_participant",
      "domain": "Meeting",
      "range": [
        "Person",
        "Team"
      ],
      "inverse": "participant_in",
      "requires_scope": false,
      "review_risk": "low",
      "review_lane": "meeting_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "discussed_in",
      "domain": [
        "Person",
        "Team",
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic",
        "Decision",
        "OpenQuestion",
        "Risk",
        "Commitment"
      ],
      "range": "Meeting",
      "inverse": "has_discussion_subject",
      "requires_scope": false,
      "review_risk": "low",
      "review_lane": "discussion_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "has_discussion_subject",
      "domain": "Meeting",
      "range": [
        "Person",
        "Team",
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Topic",
        "Decision",
        "OpenQuestion",
        "Risk",
        "Commitment"
      ],
      "inverse": "discussed_in",
      "requires_scope": false,
      "review_risk": "low",
      "review_lane": "discussion_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "has_decision",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Meeting"
      ],
      "range": "Decision",
      "inverse": "decision_for",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "decision_change",
      "cardinality": "one_to_many"
    },
    {
      "relation": "decision_for",
      "domain": "Decision",
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Meeting"
      ],
      "inverse": "has_decision",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "decision_change",
      "cardinality": "many_to_one"
    },
    {
      "relation": "has_open_question",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Meeting"
      ],
      "range": "OpenQuestion",
      "inverse": "open_question_for",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "open_question_change",
      "cardinality": "one_to_many"
    },
    {
      "relation": "open_question_for",
      "domain": "OpenQuestion",
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Meeting"
      ],
      "inverse": "has_open_question",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "open_question_change",
      "cardinality": "many_to_one"
    },
    {
      "relation": "committed_to",
      "domain": [
        "Person",
        "Team"
      ],
      "range": "Commitment",
      "inverse": "commitment_owner",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "commitment_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "commitment_owner",
      "domain": "Commitment",
      "range": [
        "Person",
        "Team"
      ],
      "inverse": "committed_to",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "commitment_change",
      "cardinality": "many_to_many"
    },
    {
      "relation": "due_on",
      "domain": "Commitment",
      "range": "DueDate",
      "inverse": "due_for",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "commitment_change",
      "cardinality": "many_to_one"
    },
    {
      "relation": "due_for",
      "domain": "DueDate",
      "range": "Commitment",
      "inverse": "due_on",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "commitment_change",
      "cardinality": "one_to_many"
    },
    {
      "relation": "part_of",
      "domain": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Team"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Team"
      ],
      "inverse": "has_part",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "structure_change",
      "cardinality": "many_to_one"
    },
    {
      "relation": "has_part",
      "domain": [
        "Context",
        "System",
        "Service",
        "Team"
      ],
      "range": [
        "Context",
        "System",
        "Service",
        "Repository",
        "Artifact",
        "Team"
      ],
      "inverse": "part_of",
      "requires_scope": true,
      "review_risk": "medium",
      "review_lane": "structure_change",
      "cardinality": "one_to_many"
    }
  ]
};

export function loadDefaultOntologyRegistry(): OntologyRegistry {
  return defaultOntologyRegistry;
}

export function findOntologyRelation(
  registry: OntologyRegistry,
  relationName: string
): OntologyRelationDefinition | undefined {
  return registry.relations.find((candidate) => candidate.relation === relationName);
}

export async function loadOntologyRegistry(root: string): Promise<OntologyRegistry> {
  const registryPath = path.join(root, "memory", "schema", "ontology", "registry.json");

  try {
    return parseOntologyRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) {
      return defaultOntologyRegistry;
    }

    throw error;
  }
}

export function parseOntologyRegistry(value: unknown): OntologyRegistry {
  if (!isRecord(value)) {
    throw new Error("Ontology registry must be an object.");
  }

  const ontologyVersion = requiredString(value.ontology_version, "ontology_version");
  const entityKinds = stringList(value.entity_kinds, "entity_kinds").map(parseEntityKind);
  const relationsValue = value.relations;

  if (!Array.isArray(relationsValue)) {
    throw new Error("Ontology registry relations must be a list.");
  }

  const relations = relationsValue.map(parseRelationDefinition);
  const seenRelations = new Set<string>();

  for (const relation of relations) {
    if (seenRelations.has(relation.relation)) {
      throw new Error(`Duplicate ontology relation: ${relation.relation}.`);
    }

    seenRelations.add(relation.relation);
  }

  return {
    ontology_version: ontologyVersion,
    entity_kinds: entityKinds,
    relations
  };
}

export function validateOntologyFrame(
  frame: OntologyAwareFrame,
  registry: OntologyRegistry = defaultOntologyRegistry
): OntologyFrameValidationResult {
  const errors: OntologyFrameValidationIssue[] = [];
  const relation = findOntologyRelation(registry, frame.relation);
  const subjectKind = safeNormalizeEntityKind(frame.subject_kind);
  const objectKind = safeNormalizeEntityKind(frame.object_kind);

  if (!relation) {
    errors.push({
      code: "ONTOLOGY_RELATION_UNKNOWN",
      field: "relation",
      message: `Ontology relation is not registered: ${frame.relation}.`
    });
  } else {
    if (!subjectKind) {
      errors.push({
        code: "ONTOLOGY_DOMAIN_INVALID",
        field: "subject_kind",
        message: `Relation ${frame.relation} has unknown subject kind ${frame.subject_kind}.`
      });
    } else if (!kindAllowed(subjectKind, relation.domain)) {
      errors.push({
        code: "ONTOLOGY_DOMAIN_INVALID",
        field: "subject_kind",
        message: `Relation ${frame.relation} does not allow subject kind ${frame.subject_kind}.`
      });
    }

    if (!objectKind) {
      errors.push({
        code: "ONTOLOGY_RANGE_INVALID",
        field: "object_kind",
        message: `Relation ${frame.relation} has unknown object kind ${frame.object_kind}.`
      });
    } else if (!kindAllowed(objectKind, relation.range)) {
      errors.push({
        code: "ONTOLOGY_RANGE_INVALID",
        field: "object_kind",
        message: `Relation ${frame.relation} does not allow object kind ${frame.object_kind}.`
      });
    }

    if (relation.requires_scope === true && !hasScope(frame.scope)) {
      errors.push({
        code: "ONTOLOGY_SCOPE_REQUIRED",
        field: "scope",
        message: `Relation ${frame.relation} requires an explicit scope.`
      });
    }
  }

  if (!Array.isArray(frame.evidence) || frame.evidence.length === 0 || frame.evidence.some((item) => !item.trim())) {
    errors.push({
      code: "ONTOLOGY_FRAME_MISSING_EVIDENCE",
      field: "evidence",
      message: "Ontology frames require at least one source evidence marker."
    });
  }

  const reviewRisk = relation?.review_risk ?? "high";
  const reviewReasons = [
    ...errors.map((error) => error.code),
    ...(frame.change_type === "change" && reviewRisk === "high" ? ["ONTOLOGY_HIGH_RISK_RELATION_CHANGE"] : [])
  ];

  return {
    passed: errors.length === 0,
    errors,
    relation,
    review_risk: reviewRisk,
    requires_review: reviewReasons.length > 0,
    review_reasons: reviewReasons
  };
}

export function normalizeEntityKind(value: string): OntologyEntityKind {
  return parseEntityKind(value.replace(/[^a-z0-9]+/gi, " ").trim());
}

function safeNormalizeEntityKind(value: string): OntologyEntityKind | undefined {
  try {
    return normalizeEntityKind(value);
  } catch {
    return undefined;
  }
}

function parseRelationDefinition(value: unknown): OntologyRelationDefinition {
  if (!isRecord(value)) {
    throw new Error("Ontology relation definitions must be objects.");
  }

  return {
    relation: requiredString(value.relation, "relation"),
    domain: parseKindOrKindList(value.domain, "domain"),
    range: parseKindOrKindList(value.range, "range"),
    inverse: optionalString(value.inverse),
    requires_scope: value.requires_scope === true,
    review_risk: optionalReviewRisk(value.review_risk),
    review_lane: optionalReviewLane(value.review_lane),
    cardinality: optionalCardinality(value.cardinality),
    transitive: value.transitive === true,
    symmetric: value.symmetric === true
  };
}

function parseKindOrKindList(value: unknown, field: string): OntologyEntityKind | OntologyEntityKind[] {
  if (typeof value === "string") {
    return parseEntityKind(value);
  }

  return stringList(value, field).map(parseEntityKind);
}

function parseEntityKind(value: string): OntologyEntityKind {
  const normalized = value.replace(/[^a-z0-9]+/gi, "").toLowerCase();

  switch (normalized) {
    case "person":
      return "Person";
    case "context":
      return "Context";
    case "topic":
      return "Topic";
    case "system":
      return "System";
    case "service":
      return "Service";
    case "repository":
      return "Repository";
    case "artifact":
      return "Artifact";
    case "incident":
      return "Incident";
    case "risk":
      return "Risk";
    case "meeting":
      return "Meeting";
    case "decision":
      return "Decision";
    case "openquestion":
      return "OpenQuestion";
    case "commitment":
      return "Commitment";
    case "duedate":
      return "DueDate";
    case "team":
      return "Team";
    case "role":
      return "Role";
    default:
      throw new Error(`Unknown ontology entity kind: ${value}.`);
  }
}

function kindAllowed(kind: OntologyEntityKind, allowed: OntologyEntityKind | OntologyEntityKind[]): boolean {
  return Array.isArray(allowed) ? allowed.includes(kind) : allowed === kind;
}

function hasScope(scope: string | null | undefined): boolean {
  return typeof scope === "string" && scope.trim().length > 0;
}

function optionalReviewRisk(value: unknown): OntologyReviewRisk | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid ontology review risk: ${String(value)}.`);
}

function optionalReviewLane(value: unknown): OntologyReviewLane | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const lanes: OntologyReviewLane[] = ["none", "role_change", "reporting_change", "ownership_change", "identity_risk", "technology_change", "dependency_change", "blocker_change", "risk_change", "commitment_change", "discussion_change", "decision_change", "open_question_change", "meeting_change", "structure_change"];
  if (lanes.includes(value as OntologyReviewLane)) {
    return value as OntologyReviewLane;
  }

  throw new Error("Invalid ontology review lane.");
}

function optionalCardinality(value: unknown): OntologyRelationCardinality | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "one_to_one" || value === "one_to_many" || value === "many_to_one" || value === "many_to_many") {
    return value;
  }

  throw new Error("Invalid ontology cardinality.");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Ontology registry field must be a non-empty string: ${field}.`);
  }

  return value.trim();
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Ontology registry field must be a list of non-empty strings: ${field}.`);
  }

  return value.map((item) => item.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
