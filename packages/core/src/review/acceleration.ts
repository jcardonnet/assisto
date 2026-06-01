import type { SymbolicProof } from "../symbolic";

export type ReviewAccelerationLaneId =
  | "needs_ontology_review"
  | "safe_apply"
  | "needs_context"
  | "identity_ambiguity"
  | "conflict_or_change"
  | "stale_noop"
  | "other";

export interface ReviewAccelerationInput {
  reviewItems: ReviewAccelerationInputItem[];
  proofPaths?: ReviewAccelerationProofPath[];
}

export type ReviewAccelerationProofPath = SymbolicProof & {
  source_event_ids?: string[];
};

export interface ReviewAccelerationInputItem {
  id: string;
  review_reason: string;
  source_events: string[];
  staged_claim_ids?: string[];
  path?: string;
}

export interface ReviewAccelerationItem extends ReviewAccelerationInputItem {
  lane_id: ReviewAccelerationLaneId;
  review_priority: number;
  proof_previews: ReviewAccelerationProofPath[];
  suggested_action: string;
}

export interface ReviewAccelerationLane {
  id: ReviewAccelerationLaneId;
  label: string;
  suggested_action: string;
  items: ReviewAccelerationItem[];
}

export interface ReviewAccelerationQueue {
  lanes: ReviewAccelerationLane[];
  items: ReviewAccelerationItem[];
  nextItem: ReviewAccelerationItem | null;
  batchApplyAllowed: false;
}

const laneDefinitions: Array<Omit<ReviewAccelerationLane, "items">> = [
  {
    id: "needs_ontology_review",
    label: "Needs ontology review",
    suggested_action: "Inspect ontology or frame validation evidence before staging a correction."
  },
  {
    id: "conflict_or_change",
    label: "Conflict/change",
    suggested_action: "Compare current and staged claims before any explicit supersession."
  },
  {
    id: "needs_context",
    label: "Needs context",
    suggested_action: "Select or create a Context through review before applying."
  },
  {
    id: "safe_apply",
    label: "Safe apply",
    suggested_action: "Preview and apply one staged claim only after validation passes."
  },
  {
    id: "identity_ambiguity",
    label: "Identity ambiguity",
    suggested_action: "Keep identity ambiguity staged until a human selects alias or context repair."
  },
  {
    id: "stale_noop",
    label: "Stale NOOP",
    suggested_action: "Reprocess the source Event with stage-only semantics."
  },
  {
    id: "other",
    label: "Other",
    suggested_action: "Inspect the ReviewItem, then preview a single allowed action."
  }
];

export function buildReviewAccelerationQueue(input: ReviewAccelerationInput): ReviewAccelerationQueue {
  const proofPaths = input.proofPaths ?? [];
  const items = input.reviewItems.map((item) => {
    const laneId = accelerationLaneFor(item);

    return {
      ...item,
      lane_id: laneId,
      review_priority: reviewPriorityFor(laneId),
      proof_previews: proofPathsFor(item, proofPaths),
      suggested_action: laneDefinition(laneId).suggested_action
    };
  });

  items.sort(compareReviewAccelerationItems);

  const lanes = laneDefinitions
    .map((definition) => ({
      ...definition,
      items: items.filter((item) => item.lane_id === definition.id)
    }))
    .filter((lane) => lane.items.length > 0);

  return {
    lanes,
    items,
    nextItem: items[0] ?? null,
    batchApplyAllowed: false
  };
}

function accelerationLaneFor(item: ReviewAccelerationInputItem): ReviewAccelerationLaneId {
  const reason = item.review_reason.toLowerCase();

  if (reason === "ontology_violation" || reason.includes("ontology") || reason.includes("frame_validation")) {
    return "needs_ontology_review";
  }

  if (reason === "unscoped_claim" || reason.includes("scope") || reason.includes("context")) {
    return "needs_context";
  }

  if (reason.includes("ambiguous") || reason.includes("near_match") || reason.includes("identity")) {
    return "identity_ambiguity";
  }

  if (reason === "role_change" || reason === "reporting_change" || reason === "claim_id_conflict" || /change|conflict/iu.test(reason)) {
    return "conflict_or_change";
  }

  if (reason === "stale_noop_event" || reason.includes("stale_noop")) {
    return "stale_noop";
  }

  if ((item.staged_claim_ids ?? []).length > 0) {
    return "safe_apply";
  }

  return "other";
}

function proofPathsFor(item: ReviewAccelerationInputItem, proofPaths: ReviewAccelerationProofPath[]): ReviewAccelerationProofPath[] {
  const sourceEvents = new Set(item.source_events);
  const stagedClaims = new Set(item.staged_claim_ids ?? []);

  return proofPaths.filter((proof) => {
    return (
      proofEventIds(proof).some((eventId) => sourceEvents.has(eventId)) ||
      proofClaimIds(proof).some((claimId) => stagedClaims.has(claimId))
    );
  });
}

function proofEventIds(proof: ReviewAccelerationProofPath): string[] {
  return proof.source_events ?? proof.source_event_ids ?? [];
}

function proofClaimIds(proof: ReviewAccelerationProofPath): string[] {
  return proof.source_claim_ids ?? [];
}

function reviewPriorityFor(laneId: ReviewAccelerationLaneId): number {
  switch (laneId) {
    case "needs_ontology_review":
      return 5;
    case "conflict_or_change":
      return 10;
    case "needs_context":
      return 20;
    case "safe_apply":
      return 30;
    case "identity_ambiguity":
      return 40;
    case "stale_noop":
      return 50;
    case "other":
      return 60;
  }
}

function laneDefinition(laneId: ReviewAccelerationLaneId): Omit<ReviewAccelerationLane, "items"> {
  return laneDefinitions.find((definition) => definition.id === laneId) ?? laneDefinitions[laneDefinitions.length - 1]!;
}

function compareReviewAccelerationItems(left: ReviewAccelerationItem, right: ReviewAccelerationItem): number {
  return (
    left.review_priority - right.review_priority ||
    (left.path ?? "").localeCompare(right.path ?? "") ||
    left.id.localeCompare(right.id)
  );
}
