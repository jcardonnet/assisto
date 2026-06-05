export type CapabilityMutationKind = "read_only" | "transaction_backed" | "local_noncanonical" | "external_sync";

export interface CapabilityDefinition {
  id: string;
  title: string;
  mutationKind: CapabilityMutationKind;
  cliCommands: readonly string[];
  workbenchRoutes: readonly string[];
  piTools: readonly string[];
  docs: readonly string[];
  validationGroups: readonly string[];
  invariants: readonly string[];
}

export interface CapabilityValidationResult {
  errors: string[];
}

const mutationKinds = new Set<string>(["read_only", "transaction_backed", "local_noncanonical", "external_sync"]);
const validationGroups = new Set<string>(["answers", "browser", "core", "retrieval", "workbench"]);
const idPattern = /^[a-z][a-z0-9-]*$/u;

export function validateCapabilityRegistry(
  items: readonly CapabilityDefinition[]
): CapabilityValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const [index, item] of items.entries()) {
    const label = item.id || `item ${index + 1}`;

    if (!idPattern.test(item.id)) {
      errors.push(`${label} has invalid id`);
    }
    if (ids.has(item.id)) {
      errors.push(`duplicate id: ${item.id}`);
    }
    ids.add(item.id);

    if (item.title.trim() === "") {
      errors.push(`${label} has empty title`);
    }
    if (!mutationKinds.has(item.mutationKind)) {
      errors.push(`${label} has invalid mutationKind: ${item.mutationKind}`);
    }

    validateArrayField(errors, label, "cliCommands", item.cliCommands);
    validateArrayField(errors, label, "workbenchRoutes", item.workbenchRoutes);
    validateArrayField(errors, label, "piTools", item.piTools);
    validateArrayField(errors, label, "docs", item.docs);
    validateArrayField(errors, label, "validationGroups", item.validationGroups);
    validateArrayField(errors, label, "invariants", item.invariants);
    validateRequiredArrayField(errors, label, "docs", item.docs);
    validateRequiredArrayField(errors, label, "validationGroups", item.validationGroups);
    validateRequiredArrayField(errors, label, "invariants", item.invariants);
    for (const group of item.validationGroups) {
      if (!validationGroups.has(group)) {
        errors.push(`${label} has unknown validation group: ${group}`);
      }
    }

    if (
      item.mutationKind === "transaction_backed" &&
      !item.invariants.some((value) => value.includes("Transaction"))
    ) {
      errors.push(`${item.id} is transaction_backed but does not name Transaction invariant`);
    }
    if (item.mutationKind === "read_only" && item.invariants.some((value) => /\bwrites?\b/iu.test(value))) {
      errors.push(`${item.id} is read_only but invariant text mentions writes`);
    }
  }

  return { errors };
}

function validateArrayField(
  errors: string[],
  itemLabel: string,
  field: keyof Pick<
    CapabilityDefinition,
    "cliCommands" | "workbenchRoutes" | "piTools" | "docs" | "validationGroups" | "invariants"
  >,
  values: readonly string[]
): void {
  for (const [index, value] of values.entries()) {
    if (value.trim() === "") {
      errors.push(`${itemLabel}.${field}[${index}] is empty`);
    }
  }
}

function validateRequiredArrayField(
  errors: string[],
  itemLabel: string,
  field: keyof Pick<CapabilityDefinition, "docs" | "validationGroups" | "invariants">,
  values: readonly string[]
): void {
  if (values.length === 0) {
    errors.push(`${itemLabel}.${field} must not be empty`);
  }
}
