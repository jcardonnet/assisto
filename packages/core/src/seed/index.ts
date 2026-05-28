import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCaptureNote, type CaptureResult } from "../capture";
import type { ValidationResult } from "../validators";

export interface SeedKitInput {
  my_role?: SeedKitField;
  manager_team?: SeedKitField;
  current_projects?: SeedKitField;
  important_people?: SeedKitField;
  systems_topics?: SeedKitField;
  open_loops?: SeedKitField;
  things_i_keep_forgetting?: SeedKitField;
}

export type SeedKitField = string | string[] | null | undefined;

export interface SeedKitOptions {
  now?: string;
}

export interface SeedKitResult {
  action: "seed_kit";
  created: boolean;
  generated_at: string;
  units: SeedKitUnitResult[];
  validation: ValidationResult;
  warnings: string[];
}

export type SeedKitPreviewResult = SeedKitResult & { created: false };
export type SeedKitCreateResult = SeedKitResult & { created: true };

export interface SeedKitUnitResult {
  section_id: SeedKitSectionId;
  section_label: string;
  source_label: string;
  note: string;
  event_id: string;
  event_path: string;
  transaction_id: string;
  transaction_path: string;
  validation: ValidationResult;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  extracted_claim_ids: string[];
  staged_review_paths: string[];
  followup_paths: string[];
}

export type SeedKitSectionId =
  | "my_role"
  | "manager_team"
  | "current_projects"
  | "important_people"
  | "systems_topics"
  | "open_loops"
  | "things_i_keep_forgetting";

interface SeedKitSectionDefinition {
  id: SeedKitSectionId;
  label: string;
  sourceLabel: string;
}

interface SeedKitUnitInput extends SeedKitSectionDefinition {
  note: string;
}

const defaultNow = "2026-05-20T10:00:00.000Z";
const sectionDefinitions: SeedKitSectionDefinition[] = [
  { id: "my_role", label: "My role", sourceLabel: "seed:role" },
  { id: "manager_team", label: "Manager and team", sourceLabel: "seed:manager-team" },
  { id: "current_projects", label: "Current projects and contexts", sourceLabel: "seed:context" },
  { id: "important_people", label: "Important people", sourceLabel: "seed:person" },
  { id: "systems_topics", label: "Systems and topics", sourceLabel: "seed:topic" },
  { id: "open_loops", label: "Open loops", sourceLabel: "seed:open-loop" },
  { id: "things_i_keep_forgetting", label: "Things I keep forgetting", sourceLabel: "seed:memory-gap" }
];

export async function previewSeedKit(
  root: string,
  input: SeedKitInput,
  options: SeedKitOptions = {}
): Promise<SeedKitPreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runSeedKit(previewRoot, input, options, false);
    return result as SeedKitPreviewResult;
  });
}

export async function createSeedKit(
  root: string,
  input: SeedKitInput,
  options: SeedKitOptions = {}
): Promise<SeedKitCreateResult> {
  const result = await runSeedKit(root, input, options, true);
  return result as SeedKitCreateResult;
}

function compileSeedUnits(input: SeedKitInput): SeedKitUnitInput[] {
  const units = sectionDefinitions
    .map((definition) => {
      const note = normalizeSeedField(input[definition.id]);

      return note
        ? {
            ...definition,
            note
          }
        : null;
    })
    .filter((unit): unit is SeedKitUnitInput => Boolean(unit));

  if (units.length === 0) {
    throw new Error("Seed kit requires at least one non-empty section.");
  }

  return units;
}

async function runSeedKit(
  root: string,
  input: SeedKitInput,
  options: SeedKitOptions,
  created: boolean
): Promise<SeedKitResult> {
  const now = options.now ?? defaultNow;
  const units: SeedKitUnitResult[] = [];

  for (const unit of compileSeedUnits(input)) {
    units.push(seedUnitResult(unit, await createCaptureNote(root, unit.note, { now, source_label: unit.sourceLabel })));
  }

  return {
    action: "seed_kit",
    created,
    generated_at: now,
    units,
    validation: combineValidation(units.map((unit) => unit.validation)),
    warnings: []
  };
}

function seedUnitResult(unit: SeedKitUnitInput, capture: CaptureResult): SeedKitUnitResult {
  return {
    section_id: unit.id,
    section_label: unit.label,
    source_label: unit.sourceLabel,
    note: unit.note,
    event_id: capture.event_id,
    event_path: capture.event_path,
    transaction_id: capture.transaction_id,
    transaction_path: capture.transaction_path,
    validation: capture.validation,
    operations: capture.operations,
    affected_files: capture.affected_files,
    source_events: capture.source_events,
    extracted_claim_ids: capture.extracted_claim_ids,
    staged_review_paths: capture.staged_review_paths,
    followup_paths: capture.followup_paths
  };
}

function normalizeSeedField(value: SeedKitField): string {
  const lines = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function combineValidation(results: ValidationResult[]): ValidationResult {
  return {
    passed: results.every((result) => result.passed),
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings)
  };
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-seed-preview-"));

  try {
    await copyMemoryTree(root, previewRoot);
    return await action(previewRoot);
  } finally {
    await rm(previewRoot, { recursive: true, force: true });
  }
}

async function copyMemoryTree(root: string, previewRoot: string): Promise<void> {
  const source = path.join(root, "memory");
  const destination = path.join(previewRoot, "memory");

  try {
    await cp(source, destination, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await mkdir(destination, { recursive: true });
      return;
    }

    throw error;
  }
}
