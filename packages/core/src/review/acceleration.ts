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


export interface ReviewThroughputLane {
  lane_id: ReviewAccelerationLaneId;
  label: string;
  item_count: number;
  ready_count: number;
  blocked_count: number;
  required_inputs: string[];
  action_checklist: string[];
  item_ids: string[];
}

export interface ReviewThroughputNextAction {
  item_id: string;
  lane_id: ReviewAccelerationLaneId;
  label: string;
  endpoint: string;
  preview_endpoint: string;
  required_inputs: string[];
  checklist: string[];
}

export interface ReviewThroughputResult {
  version: "review-throughput-v1";
  total_items: number;
  ready_now_count: number;
  needs_input_count: number;
  risk_review_count: number;
  lanes: ReviewThroughputLane[];
  bottlenecks: ReviewThroughputLane[];
  next_action: ReviewThroughputNextAction | null;
  batchApplyAllowed: false;
  warnings: string[];
}

export interface ReviewAutopilotLaneSummary {
  lane_id: ReviewAccelerationLaneId;
  label: string;
  risk_rank: number;
  item_ids: string[];
  item_count: number;
  risk_factors: string[];
  suggested_action: string;
}

export interface ReviewAutopilotResult {
  version: "review-autopilot-v1";
  lanes: ReviewAutopilotLaneSummary[];
  next_item_id: string | null;
  total_items: number;
  batchApplyAllowed: false;
  warnings: string[];
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


export function buildReviewThroughputResult(queue: ReviewAccelerationQueue): ReviewThroughputResult {
  const lanes = queue.lanes.map((lane) => {
    const requiredInputs = requiredInputsForLane(lane.id);

    return {
      lane_id: lane.id,
      label: lane.label,
      item_count: lane.items.length,
      ready_count: lane.items.filter((item) => throughputReadinessFor(item.lane_id) === "ready").length,
      blocked_count: lane.items.filter((item) => throughputReadinessFor(item.lane_id) !== "ready").length,
      required_inputs: requiredInputs,
      action_checklist: actionChecklistForLane(lane.id),
      item_ids: lane.items.map((item) => item.id)
    };
  });

  return {
    version: "review-throughput-v1",
    total_items: queue.items.length,
    ready_now_count: queue.items.filter((item) => throughputReadinessFor(item.lane_id) === "ready").length,
    needs_input_count: queue.items.filter((item) => throughputReadinessFor(item.lane_id) === "needs_input").length,
    risk_review_count: queue.items.filter((item) => throughputReadinessFor(item.lane_id) === "risk_review").length,
    lanes,
    bottlenecks: [...lanes].sort(compareThroughputLanes).slice(0, 3),
    next_action: queue.nextItem ? nextThroughputAction(queue.nextItem) : null,
    batchApplyAllowed: false,
    warnings: ["Review throughput is derived and one-item-at-a-time; it never batch applies, supersedes, or edits memory directly."]
  };
}

export function buildReviewAutopilotResult(queue: ReviewAccelerationQueue): ReviewAutopilotResult {
  return {
    version: "review-autopilot-v1",
    lanes: queue.lanes.map((lane) => ({
      lane_id: lane.id,
      label: lane.label,
      risk_rank: reviewPriorityFor(lane.id),
      item_ids: lane.items.map((item) => item.id),
      item_count: lane.items.length,
      risk_factors: riskFactorsForLane(lane.id),
      suggested_action: lane.suggested_action
    })),
    next_item_id: queue.nextItem?.id ?? null,
    total_items: queue.items.length,
    batchApplyAllowed: false,
    warnings: ["Autopilot is preview-only; durable apply, reject, reprocess, and supersede actions remain one item at a time."]
  };
}


function throughputReadinessFor(laneId: ReviewAccelerationLaneId): "ready" | "needs_input" | "risk_review" {
  switch (laneId) {
    case "safe_apply":
    case "stale_noop":
      return "ready";
    case "needs_context":
    case "identity_ambiguity":
      return "needs_input";
    case "needs_ontology_review":
    case "conflict_or_change":
    case "other":
      return "risk_review";
  }
}

function requiredInputsForLane(laneId: ReviewAccelerationLaneId): string[] {
  switch (laneId) {
    case "needs_context":
      return ["context"];
    case "identity_ambiguity":
      return ["identity_choice"];
    case "conflict_or_change":
      return ["target", "optional_supersede_claim_id"];
    case "needs_ontology_review":
      return ["ontology_or_frame_validation_review"];
    case "safe_apply":
      return ["target"];
    case "stale_noop":
      return ["event_id"];
    case "other":
      return ["human_review_decision"];
  }
}

function actionChecklistForLane(laneId: ReviewAccelerationLaneId): string[] {
  switch (laneId) {
    case "needs_context":
      return ["Choose existing Context or create Context through review", "Preview apply-staged", "Create one pending Transaction"];
    case "identity_ambiguity":
      return ["Inspect near matches", "Stage identity review or alias correction", "Keep false-merge risk staged"];
    case "conflict_or_change":
      return ["Compare staged claim against current active claims", "Select supersede claim only if explicit", "Preview apply-staged"];
    case "needs_ontology_review":
      return ["Inspect ontology/frame violation", "Stage correction or contest ReviewItem", "Do not promote unsafe frame"];
    case "safe_apply":
      return ["Preview apply-staged", "Confirm target page", "Create one pending Transaction"];
    case "stale_noop":
      return ["Preview stage-only Event reprocess", "Create one pending Transaction", "Preserve raw Event text"];
    case "other":
      return ["Open ReviewItem", "Preview mark/apply action", "Leave staged if uncertain"];
  }
}

function nextThroughputAction(item: ReviewAccelerationItem): ReviewThroughputNextAction {
  const staleNoop = item.lane_id === "stale_noop";

  return {
    item_id: item.id,
    lane_id: item.lane_id,
    label: staleNoop ? "Preview stage-only Event reprocess" : "Preview one review action",
    endpoint: staleNoop ? "/api/events/reprocess" : "/api/review/apply-staged",
    preview_endpoint: staleNoop ? "/api/events/reprocess/preview" : "/api/review/apply-staged/preview",
    required_inputs: requiredInputsForLane(item.lane_id),
    checklist: actionChecklistForLane(item.lane_id)
  };
}

function compareThroughputLanes(left: ReviewThroughputLane, right: ReviewThroughputLane): number {
  return (
    right.item_count - left.item_count ||
    right.blocked_count - left.blocked_count ||
    reviewPriorityFor(left.lane_id) - reviewPriorityFor(right.lane_id) ||
    left.lane_id.localeCompare(right.lane_id)
  );
}

function riskFactorsForLane(laneId: ReviewAccelerationLaneId): string[] {
  switch (laneId) {
    case "needs_ontology_review":
      return ["ontology_or_frame_validation", "scope_or_domain_range_may_be_unsafe"];
    case "conflict_or_change":
      return ["possible_claim_conflict", "explicit_supersession_required"];
    case "needs_context":
      return ["unknown_or_partial_scope", "context_selection_required"];
    case "identity_ambiguity":
      return ["ambiguous_or_near_match_entity", "false_merge_risk"];
    case "stale_noop":
      return ["stale_noop_event", "stage_only_reprocess_required"];
    case "safe_apply":
      return ["staged_claim_present", "single_item_validation_required"];
    case "other":
      return ["manual_review_required"];
  }
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
