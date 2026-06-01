import { validateOntologyFrame, type OntologyRegistry } from "../ontology";
import type {
  FrameEntityKind,
  MemoryFrame,
  MemoryFrameEvidenceStrength,
  MemoryFrameKind,
  MemoryFrameScopeState,
  MemoryFrameValidationErrorCode,
  MemoryFrameValidationIssue,
  MemoryFrameValidationResult
} from "./types";

const FRAME_KINDS: MemoryFrameKind[] = [
  "relation",
  "attribute",
  "decision",
  "open_question",
  "risk",
  "followup_signal"
];

const ENTITY_KINDS: FrameEntityKind[] = ["Person", "Context", "Topic", "System", "Service", "Repository", "Artifact", "Incident", "Risk", "Meeting", "Decision", "OpenQuestion", "Commitment", "DueDate", "Team", "Role"];
const EVIDENCE_STRENGTHS: MemoryFrameEvidenceStrength[] = ["explicit", "inferred", "weak"];
const SCOPE_STATES: MemoryFrameScopeState[] = ["complete", "partial", "unknown"];

export interface MemoryFrameValidationOptions {
  ontology?: OntologyRegistry;
}

export function validateMemoryFrame(
  frame: MemoryFrame,
  options: MemoryFrameValidationOptions = {}
): MemoryFrameValidationResult {
  const errors: MemoryFrameValidationIssue[] = [];
  const reviewReasons: MemoryFrameValidationErrorCode[] = [];

  if (!hasText(frame.frame_id)) {
    errors.push(issue("FRAME_MISSING_ID", "Typed memory frames require a stable frame_id.", "frame_id"));
  }

  if (!FRAME_KINDS.includes(frame.frame_kind)) {
    errors.push(issue("FRAME_KIND_INVALID", `Unsupported memory frame kind: ${String(frame.frame_kind)}.`, "frame_kind"));
  }

  if (!frame.subject || !hasText(frame.subject.entity_id)) {
    errors.push(issue("FRAME_MISSING_SUBJECT", "Typed memory frames require a subject entity reference.", "subject"));
  } else if (!ENTITY_KINDS.includes(frame.subject.entity_kind)) {
    errors.push(
      issue(
        "FRAME_SUBJECT_KIND_INVALID",
        `Unsupported subject entity kind: ${String(frame.subject.entity_kind)}.`,
        "subject.entity_kind"
      )
    );
  }

  if (frame.object && !ENTITY_KINDS.includes(frame.object.entity_kind)) {
    errors.push(
      issue(
        "FRAME_OBJECT_KIND_INVALID",
        `Unsupported object entity kind: ${String(frame.object.entity_kind)}.`,
        "object.entity_kind"
      )
    );
  }

  if (!Array.isArray(frame.source_events) || frame.source_events.length === 0 || frame.source_events.some((item) => !hasText(item))) {
    errors.push(
      issue("FRAME_MISSING_SOURCE_EVENT", "Typed memory frames require at least one source Event ID.", "source_events")
    );
  }

  if (!EVIDENCE_STRENGTHS.includes(frame.evidence_strength)) {
    errors.push(
      issue(
        "FRAME_EVIDENCE_STRENGTH_INVALID",
        `Unsupported evidence strength: ${String(frame.evidence_strength)}.`,
        "evidence_strength"
      )
    );
  }

  if (!SCOPE_STATES.includes(frame.scope_state)) {
    errors.push(
      issue("FRAME_SCOPE_STATE_INVALID", `Unsupported scope state: ${String(frame.scope_state)}.`, "scope_state")
    );
  } else if (frame.scope_state === "unknown") {
    errors.push(issue("FRAME_UNKNOWN_SCOPE", "Unknown-scope frames must be staged for review.", "scope_state"));
  }

  addKindSpecificIssues(frame, errors);
  addOntologyIssues(frame, options, errors, reviewReasons);

  const allReviewReasons = unique([...errors.map((error) => error.code), ...reviewReasons]);

  return {
    passed: errors.length === 0,
    errors,
    requires_review: allReviewReasons.length > 0,
    review_reasons: allReviewReasons
  };
}

function addKindSpecificIssues(frame: MemoryFrame, errors: MemoryFrameValidationIssue[]): void {
  if (frame.frame_kind === "relation") {
    if (!hasText(frame.relation)) {
      errors.push(issue("FRAME_RELATION_MISSING_RELATION", "Relation frames require a relation name.", "relation"));
    }

    if (!frame.object || !hasText(frame.object.entity_id)) {
      errors.push(issue("FRAME_RELATION_MISSING_OBJECT", "Relation frames require an object entity reference.", "object"));
    }

    return;
  }

  if (frame.frame_kind === "attribute") {
    if (!hasText(frame.attribute)) {
      errors.push(issue("FRAME_ATTRIBUTE_MISSING_ATTRIBUTE", "Attribute frames require an attribute name.", "attribute"));
    }

    if (!hasText(frame.value)) {
      errors.push(issue("FRAME_VALUE_REQUIRED", "Attribute frames require a value.", "value"));
    }

    return;
  }

  if (["decision", "open_question", "risk", "followup_signal"].includes(frame.frame_kind) && !hasText(frame.value) && !hasText(frame.statement)) {
    errors.push(
      issue(
        "FRAME_VALUE_REQUIRED",
        `${frame.frame_kind} frames require either a value or statement.`,
        hasText(frame.statement) ? "statement" : "value"
      )
    );
  }
}

function addOntologyIssues(
  frame: MemoryFrame,
  options: MemoryFrameValidationOptions,
  errors: MemoryFrameValidationIssue[],
  reviewReasons: MemoryFrameValidationErrorCode[]
): void {
  if (
    !options.ontology ||
    frame.frame_kind !== "relation" ||
    !hasText(frame.relation) ||
    !frame.subject ||
    !frame.object
  ) {
    return;
  }

  const ontology = validateOntologyFrame(
    {
      subject_id: frame.subject.entity_id,
      subject_kind: frame.subject.entity_kind,
      relation: frame.relation,
      object_id: frame.object.entity_id,
      object_kind: frame.object.entity_kind,
      statement: frame.statement ?? frame.value ?? frame.relation,
      scope: frame.scope ?? (frame.scope_state === "unknown" ? null : frame.scope_state),
      evidence: frame.source_events,
      change_type: frame.change_type
    },
    options.ontology
  );

  for (const error of ontology.errors) {
    errors.push(issue(error.code as MemoryFrameValidationErrorCode, error.message, error.field));
  }

  for (const reason of ontology.review_reasons) {
    reviewReasons.push(reason as MemoryFrameValidationErrorCode);
  }
}

function issue(
  code: MemoryFrameValidationErrorCode,
  message: string,
  field?: string
): MemoryFrameValidationIssue {
  return { code, message, field };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
