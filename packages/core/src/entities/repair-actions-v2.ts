export type EntityRepairActionV2Kind = "alias" | "role" | "reporting" | "ownership" | "identity_review";

export interface EntityRepairActionV2Input {
  kind: EntityRepairActionV2Kind;
  entityId: string;
  newTargetId?: string;
  statement?: string;
  alias?: string;
  supersedeClaimId?: string;
  note?: string;
}

export interface EntityRepairActionV2Error {
  code: string;
  message: string;
}

export interface EntityRepairActionV2Operation {
  op: "UPSERT_CLAIM" | "STAGE_REVIEW" | "SUPERSEDE_CLAIM";
  target: string;
  note: string;
}

export interface EntityRepairActionV2Preview {
  version: "entity-repair-action-v2";
  allowed: boolean;
  errors: EntityRepairActionV2Error[];
  canonical_writes: string[];
  transaction: {
    state: "pending";
    operations: EntityRepairActionV2Operation[];
  } | null;
}

export function previewEntityRepairActionV2(input: EntityRepairActionV2Input): EntityRepairActionV2Preview {
  const errors = validateEntityRepairActionV2(input);

  if (errors.length > 0) {
    return {
      version: "entity-repair-action-v2",
      allowed: false,
      errors,
      canonical_writes: [],
      transaction: null
    };
  }

  return {
    version: "entity-repair-action-v2",
    allowed: true,
    errors: [],
    canonical_writes: [],
    transaction: {
      state: "pending",
      operations: repairOperations(input)
    }
  };
}

function validateEntityRepairActionV2(input: EntityRepairActionV2Input): EntityRepairActionV2Error[] {
  const errors: EntityRepairActionV2Error[] = [];

  if (!input.entityId.trim()) {
    errors.push({ code: "entity_id_required", message: "Repair action requires an entity id or path." });
  }

  if ((input.kind === "role" || input.kind === "reporting" || input.kind === "ownership") && !input.supersedeClaimId) {
    errors.push({
      code: "supersede_claim_required",
      message: "Role, reporting, and ownership repairs require an explicit supersede claim id."
    });
  }

  if (input.kind === "alias" && !(input.alias ?? input.newTargetId)?.trim()) {
    errors.push({ code: "alias_required", message: "Alias repair requires an alias value." });
  }

  return errors;
}

function repairOperations(input: EntityRepairActionV2Input): EntityRepairActionV2Operation[] {
  if (input.kind === "identity_review") {
    return [
      {
        op: "STAGE_REVIEW",
        target: input.entityId,
        note: input.note ?? ""
      }
    ];
  }

  const operations: EntityRepairActionV2Operation[] = [];

  if (input.supersedeClaimId) {
    operations.push({
      op: "SUPERSEDE_CLAIM",
      target: input.supersedeClaimId,
      note: "Explicit human-selected supersession."
    });
  }

  operations.push({
    op: "UPSERT_CLAIM",
    target: input.entityId,
    note: input.note ?? ""
  });

  return operations;
}
