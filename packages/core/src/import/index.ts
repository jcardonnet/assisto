import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ingestWithExtractionProvider, type ExtractionProvider, type ExtractionRunResult } from "../extraction";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type FrontmatterValue } from "../markdown";
import { validateTransaction, type ParsedTransaction, type TransactionFileWrite } from "../transactions";
import type { ValidationResult } from "../validators";

export interface ImportNotesInput {
  text?: string;
  path?: string;
  glob?: string;
  cwd?: string;
}

export interface ImportNotesOptions {
  now?: string;
  observed_at?: string | null;
  source_label?: string;
  context?: string;
  provider?: ExtractionProvider;
  limit?: number;
}

export interface ImportSourceUnit {
  raw_text: string;
  source_path?: string;
}

export interface ImportUnitResult {
  created: boolean;
  skipped: boolean;
  skip_reason?: "duplicate_source_hash" | "triage_skip";
  source_hash: string;
  source_path?: string;
  source_label?: string;
  existing_event_id?: string;
  existing_event_path?: string;
  event_id?: string;
  event_path?: string;
  transaction_id?: string;
  transaction_path?: string;
  transaction_state?: string;
  provider_name?: string;
  validation?: ValidationResult;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: TransactionFileWrite[];
  extracted_claim_ids: string[];
  staged_review_paths: string[];
  followup_paths: string[];
  event_raw_text: string;
  transaction?: ParsedTransaction;
}

export interface ImportNotesResult {
  action: "import_notes";
  created: boolean;
  units_total: number;
  units_imported: number;
  units_skipped: number;
  provider_name: string;
  units: ImportUnitResult[];
}

export type ImportPreviewResult = ImportNotesResult & { created: false };
export type ImportCreateResult = ImportNotesResult & { created: true };

export type ImportTriageUnitAction = "keep" | "skip";

export interface ImportTriageUnitInput {
  unit_id?: string;
  action?: ImportTriageUnitAction;
  raw_text: string;
  source_path?: string;
  source_label?: string;
  observed_at?: string | null;
  context?: string;
}

export interface ImportTriageInput extends ImportNotesInput {
  units?: ImportTriageUnitInput[];
}

export type ImportTriageUnitResult = ImportUnitResult & {
  unit_id: string;
  triage_action: ImportTriageUnitAction;
  observed_at?: string | null;
  context?: string;
};

export interface ImportTriageResult {
  action: "import_triage";
  created: boolean;
  units_total: number;
  units_kept: number;
  units_skipped: number;
  provider_name: string;
  units: ImportTriageUnitResult[];
}

export type ImportTriagePreviewResult = ImportTriageResult & { created: false };
export type ImportTriageCreateResult = ImportTriageResult & { created: true };

const defaultGlob = "*.md,*.txt";

export async function previewImportNotes(
  root: string,
  input: ImportNotesInput,
  options: ImportNotesOptions = {}
): Promise<ImportPreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runImportNotes(previewRoot, input, options, false);
    return result as ImportPreviewResult;
  });
}

export async function createImportNotes(
  root: string,
  input: ImportNotesInput,
  options: ImportNotesOptions = {}
): Promise<ImportCreateResult> {
  const result = await runImportNotes(root, input, options, true);
  return result as ImportCreateResult;
}

export async function previewImportTriage(
  root: string,
  input: ImportTriageInput,
  options: ImportNotesOptions = {}
): Promise<ImportTriagePreviewResult> {
  return withPreviewRoot(root, async (previewRoot) => {
    const result = await runImportTriage(previewRoot, input, options, false);
    return result as ImportTriagePreviewResult;
  });
}

export async function createImportTriage(
  root: string,
  input: ImportTriageInput,
  options: ImportNotesOptions = {}
): Promise<ImportTriageCreateResult> {
  const result = await runImportTriage(root, input, options, true);
  return result as ImportTriageCreateResult;
}

export async function collectImportSourceUnits(input: ImportNotesInput): Promise<ImportSourceUnit[]> {
  const hasText = typeof input.text === "string";
  const hasPath = typeof input.path === "string" && input.path.trim().length > 0;

  if (hasText && hasPath) {
    throw new Error("Import accepts either text/stdin or path, not both.");
  }

  if (hasText) {
    return splitBatchText(input.text ?? "").map((rawText) => ({ raw_text: rawText }));
  }

  if (!hasPath) {
    throw new Error("Import requires text/stdin or --path <file-or-dir>.");
  }

  return collectPathUnits(input.path ?? "", input.cwd ?? process.cwd(), input.glob ?? defaultGlob);
}

export function sourceHashFor(rawText: string): string {
  return createHash("sha256").update(rawText).digest("hex");
}

async function collectImportTriageUnits(input: ImportTriageInput): Promise<ImportTriageUnitInput[]> {
  if (Array.isArray(input.units)) {
    return input.units
      .map((unit, index) => ({
        ...unit,
        unit_id: unit.unit_id?.trim() || `unit_${index + 1}`
      }))
      .filter((unit) => unit.raw_text.trim().length > 0 || normalizeTriageAction(unit.action) === "skip");
  }

  return (await collectImportSourceUnits(input)).map((unit, index) => ({
    unit_id: `unit_${index + 1}`,
    action: "keep",
    raw_text: unit.raw_text,
    source_path: unit.source_path
  }));
}

function normalizeTriageAction(action: ImportTriageUnitAction | undefined): ImportTriageUnitAction {
  if (!action || action === "keep") {
    return "keep";
  }

  if (action === "skip") {
    return "skip";
  }

  throw new Error(`Unsupported import triage action: ${action}`);
}

async function runImportNotes(
  root: string,
  input: ImportNotesInput,
  options: ImportNotesOptions,
  created: boolean
): Promise<ImportNotesResult> {
  const units = limitUnits(await collectImportSourceUnits(input), options.limit);

  if (units.length === 0) {
    throw new Error("Import did not find any non-empty Markdown/text units.");
  }

  const providerName = options.provider?.name ?? "rule-based";
  const seenSourceHashes = await loadSourceHashIndex(root);
  const results: ImportUnitResult[] = [];

  for (const unit of units) {
    const rawText = unit.raw_text.trim();
    const sourceHash = sourceHashFor(rawText);
    const sourceLabel = options.source_label ?? unit.source_path ?? "pasted import";
    const existing = seenSourceHashes.get(sourceHash);

    if (existing) {
      results.push({
        created: false,
        skipped: true,
        skip_reason: "duplicate_source_hash",
        source_hash: sourceHash,
        source_path: unit.source_path,
        source_label: sourceLabel,
        existing_event_id: existing.event_id,
        existing_event_path: existing.event_path,
        operations: [],
        affected_files: [],
        source_events: existing.event_id ? [existing.event_id] : [],
        proposed_file_writes: [],
        extracted_claim_ids: [],
        staged_review_paths: [],
        followup_paths: [],
        event_raw_text: rawText
      });
      continue;
    }

    const ingest = await ingestWithExtractionProvider(root, rawText, {
      ...options,
      source_label: sourceLabel,
      source_hash: sourceHash,
      raw_note: rawText,
      apply: false
    });
    const validation = await validateTransaction(root, ingest.transaction);
    const result = importResultFromIngest(ingest, {
      created,
      validation,
      sourceHash,
      sourcePath: unit.source_path,
      sourceLabel,
      rawText
    });

    results.push(result);
    seenSourceHashes.set(sourceHash, {
      event_id: ingest.event_id,
      event_path: ingest.event_path
    });
  }

  return {
    action: "import_notes",
    created,
    units_total: results.length,
    units_imported: results.filter((unit) => !unit.skipped).length,
    units_skipped: results.filter((unit) => unit.skipped).length,
    provider_name: providerName,
    units: results
  };
}

async function runImportTriage(
  root: string,
  input: ImportTriageInput,
  options: ImportNotesOptions,
  created: boolean
): Promise<ImportTriageResult> {
  const units = limitTriageUnits(await collectImportTriageUnits(input), options.limit);

  if (units.length === 0) {
    throw new Error("Import triage did not find any units.");
  }

  const providerName = options.provider?.name ?? "rule-based";
  const seenSourceHashes = await loadSourceHashIndex(root);
  const results: ImportTriageUnitResult[] = [];

  for (const [index, unit] of units.entries()) {
    const unitId = unit.unit_id?.trim() || `unit_${index + 1}`;
    const rawText = unit.raw_text.trim();
    const triageAction = normalizeTriageAction(unit.action);
    const sourceHash = sourceHashFor(rawText);
    const sourceLabel = unit.source_label?.trim() || options.source_label || unit.source_path || "pasted import";
    const observedAt = unit.observed_at ?? options.observed_at;
    const context = unit.context?.trim() || options.context;

    if (!rawText || triageAction === "skip") {
      results.push(
        triageSkippedUnit({
          unit,
          unitId,
          sourceHash,
          sourceLabel,
          observedAt,
          context,
          reason: "triage_skip",
          triageAction: "skip"
        })
      );
      continue;
    }

    const existing = seenSourceHashes.get(sourceHash);

    if (existing) {
      results.push({
        ...triageSkippedUnit({
          unit,
          unitId,
          sourceHash,
          sourceLabel,
          observedAt,
          context,
          reason: "duplicate_source_hash",
          triageAction
        }),
        existing_event_id: existing.event_id,
        existing_event_path: existing.event_path,
        source_events: existing.event_id ? [existing.event_id] : []
      });
      continue;
    }

    const ingest = await ingestWithExtractionProvider(root, rawText, {
      ...options,
      observed_at: observedAt,
      source_label: sourceLabel,
      source_hash: sourceHash,
      context,
      raw_note: rawText,
      apply: false
    });
    const validation = await validateTransaction(root, ingest.transaction);
    const result = importResultFromIngest(ingest, {
      created,
      validation,
      sourceHash,
      sourcePath: unit.source_path,
      sourceLabel,
      rawText
    });

    results.push({
      ...result,
      unit_id: unitId,
      triage_action: triageAction,
      observed_at: observedAt,
      context
    });
    seenSourceHashes.set(sourceHash, {
      event_id: ingest.event_id,
      event_path: ingest.event_path
    });
  }

  return {
    action: "import_triage",
    created,
    units_total: results.length,
    units_kept: results.filter((unit) => !unit.skipped).length,
    units_skipped: results.filter((unit) => unit.skipped).length,
    provider_name: providerName,
    units: results
  };
}

function importResultFromIngest(
  ingest: ExtractionRunResult,
  input: {
    created: boolean;
    validation: ValidationResult;
    sourceHash: string;
    sourcePath?: string;
    sourceLabel?: string;
    rawText: string;
  }
): ImportUnitResult {
  return {
    created: input.created,
    skipped: false,
    source_hash: input.sourceHash,
    source_path: input.sourcePath,
    source_label: input.sourceLabel,
    event_id: ingest.event_id,
    event_path: ingest.event_path,
    transaction_id: ingest.transaction_id,
    transaction_path: ingest.transaction_path,
    transaction_state: ingest.transaction.transaction_state,
    provider_name: ingest.provider_name,
    validation: input.validation,
    operations: ingest.transaction.operations.map((operation) => operation.operation),
    affected_files: ingest.transaction.affected_files,
    source_events: ingest.transaction.source_events,
    proposed_file_writes: ingest.transaction.proposed_file_writes,
    extracted_claim_ids: ingest.extracted_claim_ids,
    staged_review_paths: ingest.staged_review_paths,
    followup_paths: ingest.followup_paths,
    event_raw_text: input.rawText,
    transaction: ingest.transaction
  };
}

async function collectPathUnits(inputPath: string, cwd: string, glob: string): Promise<ImportSourceUnit[]> {
  const resolvedPath = path.resolve(cwd, inputPath);
  const info = await stat(resolvedPath);

  if (info.isFile()) {
    return [
      {
        raw_text: await readFile(resolvedPath, "utf8"),
        source_path: displayPath(resolvedPath, cwd)
      }
    ].filter((unit) => unit.raw_text.trim().length > 0);
  }

  if (!info.isDirectory()) {
    throw new Error(`Import path is not a file or directory: ${inputPath}`);
  }

  const patterns = parseGlobList(glob);
  const files = await walkImportFiles(resolvedPath, resolvedPath, patterns);
  const units: ImportSourceUnit[] = [];

  for (const file of files) {
    const rawText = await readFile(file, "utf8");

    if (rawText.trim()) {
      units.push({
        raw_text: rawText,
        source_path: displayPath(file, cwd)
      });
    }
  }

  return units;
}

async function walkImportFiles(root: string, directory: string, patterns: GlobPattern[]): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkImportFiles(root, absolutePath, patterns)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = normalizePath(path.relative(root, absolutePath));

    if (patterns.some((pattern) => matchesGlobPattern(pattern, relativePath, entry.name))) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function splitBatchText(text: string): string[] {
  const units: string[] = [];
  const current: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*---\s*$/.test(line)) {
      pushUnit(units, current);
      current.length = 0;
      continue;
    }

    current.push(line);
  }

  pushUnit(units, current);
  return units;
}

function pushUnit(units: string[], lines: string[]): void {
  const text = lines.join("\n").trim();

  if (text) {
    units.push(text);
  }
}

async function loadSourceHashIndex(root: string): Promise<Map<string, { event_id?: string; event_path: string }>> {
  const hashes = new Map<string, { event_id?: string; event_path: string }>();
  let files: string[];

  try {
    files = await listMarkdownFiles(root, "memory/events/**/*.md");
  } catch {
    files = [];
  }

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    const sourceHash = stringValue(parsed.frontmatter.source_hash);

    if (sourceHash) {
      hashes.set(sourceHash, {
        event_id: stringValue(parsed.frontmatter.id),
        event_path: file
      });
    }
  }

  return hashes;
}

function limitUnits(units: ImportSourceUnit[], limit: number | undefined): ImportSourceUnit[] {
  if (limit === undefined) {
    return units;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Import --limit must be a positive integer.");
  }

  return units.slice(0, limit);
}

function limitTriageUnits(units: ImportTriageUnitInput[], limit: number | undefined): ImportTriageUnitInput[] {
  if (limit === undefined) {
    return units;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Import --limit must be a positive integer.");
  }

  return units.slice(0, limit);
}

function triageSkippedUnit(input: {
  unit: ImportTriageUnitInput;
  unitId: string;
  sourceHash: string;
  sourceLabel: string;
  observedAt?: string | null;
  context?: string;
  reason: "duplicate_source_hash" | "triage_skip";
  triageAction: ImportTriageUnitAction;
}): ImportTriageUnitResult {
  return {
    created: false,
    skipped: true,
    skip_reason: input.reason,
    source_hash: input.sourceHash,
    source_path: input.unit.source_path,
    source_label: input.sourceLabel,
    operations: [],
    affected_files: [],
    source_events: [],
    proposed_file_writes: [],
    extracted_claim_ids: [],
    staged_review_paths: [],
    followup_paths: [],
    event_raw_text: input.unit.raw_text.trim(),
    unit_id: input.unitId,
    triage_action: input.triageAction,
    observed_at: input.observedAt,
    context: input.context
  };
}

interface GlobPattern {
  raw: string;
  hasSlash: boolean;
  regex: RegExp;
}

function parseGlobList(glob: string): GlobPattern[] {
  const patterns = glob
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  if (patterns.length === 0) {
    throw new Error("Import glob must include at least one pattern.");
  }

  return patterns.map((pattern) => ({
    raw: pattern,
    hasSlash: pattern.includes("/") || pattern.includes("\\"),
    regex: globToRegExp(normalizePath(pattern))
  }));
}

function matchesGlobPattern(pattern: GlobPattern, relativePath: string, basename: string): boolean {
  return pattern.regex.test(pattern.hasSlash ? relativePath : basename);
}

function globToRegExp(globPattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < globPattern.length; index += 1) {
    const char = globPattern[index];
    const nextChar = globPattern[index + 1];

    if (char === "*" && nextChar === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  source += "$";
  return new RegExp(source, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function displayPath(absolutePath: string, cwd: string): string {
  const relative = normalizePath(path.relative(cwd, absolutePath));

  if (relative && !relative.startsWith("../") && relative !== "..") {
    return relative;
  }

  return normalizePath(absolutePath);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(os.tmpdir(), "assisto-import-preview-"));

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
