import {
  getSection,
  parseMarkdownFile,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue
} from "../markdown";
import {
  assertInsideMemory,
  assertNotObsidianPath,
  readMarkdownPage,
  writeMarkdownPageAtomic
} from "../fs";
import {
  SUPPORTED_OPERATION_TYPES,
  TRANSACTION_STATES,
  UNSUPPORTED_OPERATION_TYPES,
  type SupportedOperationType,
  type Transaction,
  type TransactionOperation,
  type TransactionState
} from "../model";
import {
  toValidationDocument,
  validateDocuments,
  validateFrontmatter,
  validateTransactionRollback,
  type ValidationDocument,
  type ValidationError,
  type ValidationResult
} from "../validators";
import { loadVaultIndex } from "../vault";

export class TransactionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionParseError";
  }
}

export class TransactionValidationError extends Error {
  constructor(readonly result: ValidationResult) {
    super(`Transaction validation failed with ${result.errors.length} error(s).`);
    this.name = "TransactionValidationError";
  }
}

export interface TransactionFileWrite {
  path: string;
  content: string;
}

export type ParsedTransaction = Transaction & {
  proposed_file_writes: TransactionFileWrite[];
};

export interface CreateTransactionDraftInput {
  id: string;
  created_at: string;
  source_events: string[];
  operations: Array<SupportedOperationType | TransactionOperation>;
  affected_files: string[];
  intent?: string;
  rollback_notes: string;
  risk_level?: "low" | "medium" | "high";
  requires_review?: boolean;
  validation_errors?: string[];
  application_log?: string;
  proposed_file_writes?: TransactionFileWrite[];
}

export const transactionFilePaths = {
  pending: (id: string): string => transactionPath("pending", id),
  applied: (id: string): string => transactionPath("applied", id),
  rejected: (id: string): string => transactionPath("rejected", id),
  failed: (id: string): string => transactionPath("failed", id)
} as const;

export function pendingTransactionPath(id: string): string {
  return transactionFilePaths.pending(id);
}

export function appliedTransactionPath(id: string): string {
  return transactionFilePaths.applied(id);
}

export function rejectedTransactionPath(id: string): string {
  return transactionFilePaths.rejected(id);
}

export function failedTransactionPath(id: string): string {
  return transactionFilePaths.failed(id);
}

export function createTransactionDraft(input: CreateTransactionDraftInput): ParsedTransaction {
  const operations = input.operations.map(normalizeOperation);
  assertSupportedOperations(operations.map((operation) => operation.operation));

  return {
    id: input.id,
    type: "Transaction",
    transaction_state: "pending",
    created_at: input.created_at,
    source_events: input.source_events,
    operations,
    affected_files: input.affected_files,
    risk_level: input.risk_level,
    requires_review: input.requires_review,
    validation_errors: input.validation_errors,
    rollback_notes: input.rollback_notes,
    intent: input.intent,
    application_log: input.application_log,
    proposed_file_writes: input.proposed_file_writes ?? []
  };
}

export function parseTransactionMarkdown(content: string): ParsedTransaction {
  const parsed = parseMarkdownFile(content);
  const frontmatter = parsed.frontmatter;

  if (frontmatter.type !== "transaction") {
    throw new TransactionParseError("Transaction markdown must have type: transaction.");
  }

  const id = requiredString(frontmatter, "id");
  const transactionState = requiredString(frontmatter, "transaction_state");

  if (!isAllowed(transactionState, TRANSACTION_STATES)) {
    throw new TransactionParseError(`Unsupported transaction_state: ${transactionState}.`);
  }

  const frontmatterOperations = requiredStringArray(frontmatter, "operations");
  const sectionOperations = parseProposedOperationsSection(parsed.body);
  const operationDescriptions = new Map(
    sectionOperations.map((operation) => [operation.operation, operation.description])
  );

  assertSupportedOperations(frontmatterOperations);
  assertSupportedOperations(sectionOperations.map((operation) => operation.operation));

  return {
    id,
    type: "Transaction",
    transaction_state: transactionState as TransactionState,
    created_at: requiredString(frontmatter, "created_at"),
    source_events: requiredStringArray(frontmatter, "source_events"),
    operations: frontmatterOperations.map((operation) => ({
      operation: operation as SupportedOperationType,
      description: operationDescriptions.get(operation as SupportedOperationType)
    })),
    affected_files: requiredStringArray(frontmatter, "affected_files"),
    risk_level: optionalRiskLevel(frontmatter.risk_level),
    requires_review: optionalBoolean(frontmatter.requires_review),
    validation_errors: optionalStringArray(frontmatter.validation_errors),
    rollback_notes: getSection(parsed.body, "Rollback / repair notes") ?? undefined,
    intent: getSection(parsed.body, "Intent") ?? undefined,
    application_log: getSection(parsed.body, "Application log") ?? undefined,
    proposed_file_writes: parseProposedFileWrites(parsed.body)
  };
}

export function serializeTransactionMarkdown(transaction: Transaction): string {
  const operations = transaction.operations.map((operation) => operation.operation);
  assertSupportedOperations(operations);

  const frontmatter: Frontmatter = {
    id: transaction.id,
    type: "transaction",
    transaction_state: transaction.transaction_state,
    created_at: transaction.created_at,
    source_events: transaction.source_events,
    operations,
    affected_files: transaction.affected_files,
    risk_level: transaction.risk_level ?? null,
    requires_review: transaction.requires_review ?? false,
    validation_errors: transaction.validation_errors ?? []
  };
  const body = [
    `# Transaction ${transaction.id}`,
    "",
    "## Intent",
    "",
    transaction.intent?.trim() ?? "",
    "",
    "## Proposed operations",
    "",
    ...serializeOperations(transaction.operations),
    "",
    "## Proposed changes",
    "",
    "### Create",
    "",
    ...serializeProposedFileWrites(transaction),
    "",
    "### Modify",
    "",
    "### Stage",
    "",
    "## Validation checklist",
    "",
    "- [ ] All new IDs are unique",
    "- [ ] All wikilinks resolve",
    "- [ ] All active claims cite Event IDs",
    "- [ ] No committed follow-up exists without explicit trigger",
    "- [ ] No active system/context claim has `scope_state: unknown`",
    "- [ ] No ambiguous entity update bypasses review",
    "- [ ] Summaries are generated from active claims only",
    "- [ ] Transaction risk level is set",
    "- [ ] Rollback/repair notes are present",
    "",
    "## Rollback / repair notes",
    "",
    transaction.rollback_notes?.trim() ?? "",
    "",
    "## Application log",
    "",
    transaction.application_log?.trim() ?? "Pending."
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function serializeTransactionForValidation(transaction: Transaction): string {
  const frontmatter: Frontmatter = {
    id: transaction.id,
    type: "transaction",
    transaction_state: transaction.transaction_state,
    created_at: transaction.created_at,
    source_events: transaction.source_events,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    risk_level: transaction.risk_level ?? null,
    requires_review: transaction.requires_review ?? false,
    validation_errors: transaction.validation_errors ?? []
  };
  const body = [
    `# Transaction ${transaction.id}`,
    "",
    "## Intent",
    "",
    transaction.intent?.trim() ?? "",
    "",
    "## Proposed operations",
    "",
    ...transaction.operations.map((operation) =>
      operation.description
        ? `- ${operation.operation}: ${operation.description}`
        : `- ${operation.operation}`
    ),
    "",
    "## Rollback / repair notes",
    "",
    transaction.rollback_notes?.trim() ?? "",
    "",
    "## Application log",
    "",
    transaction.application_log?.trim() ?? "Pending.",
    "",
    ...serializeProposedFileWrites(transaction)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

export async function validateTransaction(
  root: string,
  transaction: Transaction
): Promise<ValidationResult> {
  const result = emptyValidationResult();
  const operations = transaction.operations.map((operation) => operation.operation);

  for (const operation of operations) {
    if (UNSUPPORTED_OPERATION_TYPES.includes(operation as never)) {
      addValidationError(result, {
        code: "INVALID_OPERATION",
        message: `Unsupported MVP transaction operation: ${operation}.`,
        field: "operations",
        id: transaction.id
      });
      continue;
    }

    if (!isAllowed(operation, SUPPORTED_OPERATION_TYPES)) {
      addValidationError(result, {
        code: "INVALID_OPERATION",
        message: `Unknown transaction operation: ${operation}.`,
        field: "operations",
        id: transaction.id
      });
    }
  }

  const transactionDocument = toValidationDocument(
    transactionFilePaths.pending(transaction.id),
    serializeTransactionForValidation(transaction)
  );
  mergeValidationResult(result, validateFrontmatter(transactionDocument));
  mergeValidationResult(result, validateTransactionRollback(transactionDocument));

  const proposedWrites = getProposedFileWrites(transaction);
  const mutatingOperations = operations.filter((operation) => operation !== "NOOP");

  if (mutatingOperations.length > 0 && proposedWrites.length === 0) {
    addValidationError(result, {
      code: "TRANSACTION_WRITESET_MISSING",
      message: "Mutating transactions must include explicit proposed markdown file writes.",
      id: transaction.id
    });
  }

  const proposedDocuments: ValidationDocument[] = [];
  const newlyCreatedPaths: string[] = [];

  for (const write of proposedWrites) {
    try {
      assertNotObsidianPath(write.path);
      assertInsideMemory(root, normalizeWritePath(write.path));
    } catch (error) {
      addValidationError(result, {
        code: "TRANSACTION_WRITE_PATH_INVALID",
        message: error instanceof Error ? error.message : String(error),
        id: transaction.id,
        path: write.path
      });
      continue;
    }

    const canonicalPath = toCanonicalMemoryPath(write.path);
    newlyCreatedPaths.push(stripMemoryPrefix(canonicalPath));
    proposedDocuments.push(toValidationDocument(stripMemoryPrefix(canonicalPath), write.content));
  }

  const affectedFiles = new Set(transaction.affected_files.map(stripMemoryPrefix));

  for (const proposedPath of newlyCreatedPaths) {
    if (!affectedFiles.has(proposedPath)) {
      addValidationError(result, {
        code: "TRANSACTION_AFFECTED_FILE_MISMATCH",
        message: `Proposed write is missing from affected_files: ${proposedPath}.`,
        id: transaction.id,
        path: proposedPath
      });
    }
  }

  const vaultIndex = await loadVaultIndex(root);
  const existingPaths = [...vaultIndex.paths].map(stripMemoryPrefix);
  const existingEventIds = [...vaultIndex.eventIds];

  mergeValidationResult(
    result,
    validateDocuments({
      documents: proposedDocuments,
      existingEventIds,
      existingPaths,
      newlyCreatedPaths
    })
  );
  mergeValidationResult(result, validateNoDuplicateExistingIds(proposedDocuments, vaultIndex));

  return finalizeValidationResult(result);
}

export async function applyTransaction(root: string, transactionId: string): Promise<void> {
  const pendingPath = transactionFilePaths.pending(transactionId);
  const transaction = parseTransactionMarkdown(await readMarkdownPage(root, pendingPath));
  const validation = await validateTransaction(root, transaction);

  if (!validation.passed) {
    throw new TransactionValidationError(validation);
  }

  const orderedWrites = orderWritesForEventPreservation(transaction.proposed_file_writes);

  try {
    for (const write of orderedWrites) {
      await writeMarkdownPageAtomic(root, toCanonicalMemoryPath(write.path), ensureTrailingNewline(write.content));
    }

    const appliedTransaction: ParsedTransaction = {
      ...transaction,
      transaction_state: "applied",
      application_log: `Applied successfully at ${new Date().toISOString()}.`
    };
    const content = serializeTransactionMarkdown(appliedTransaction);

    await writeMarkdownPageAtomic(root, transactionFilePaths.applied(transaction.id), content);
    await writeMarkdownPageAtomic(root, pendingPath, content);
    await appendIngestLog(root, `Applied transaction ${transaction.id}.`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markTransactionFailed(
      root,
      transaction.id,
      reason,
      transaction.rollback_notes ?? "Preserve any Event files already written and repair manually."
    );
    throw error;
  }
}

export async function rejectTransaction(
  root: string,
  transactionId: string,
  reason: string
): Promise<void> {
  const pendingPath = transactionFilePaths.pending(transactionId);
  const transaction = parseTransactionMarkdown(await readMarkdownPage(root, pendingPath));
  const rejectedTransaction: ParsedTransaction = {
    ...transaction,
    transaction_state: "rejected",
    rejected_reason: reason,
    application_log: `Rejected: ${reason}`
  };
  const content = serializeTransactionMarkdown(rejectedTransaction);

  await writeMarkdownPageAtomic(root, transactionFilePaths.rejected(transactionId), content);
  await writeMarkdownPageAtomic(root, pendingPath, content);
  await appendIngestLog(root, `Rejected transaction ${transactionId}: ${reason}`);
}

export async function markTransactionFailed(
  root: string,
  transactionId: string,
  reason: string,
  repairNotes: string
): Promise<void> {
  const pendingPath = transactionFilePaths.pending(transactionId);
  const transaction = parseTransactionMarkdown(await readMarkdownPage(root, pendingPath));
  const failedTransaction: ParsedTransaction = {
    ...transaction,
    transaction_state: "failed",
    validation_errors: [...(transaction.validation_errors ?? []), reason],
    rollback_notes: repairNotes,
    application_log: `Failed: ${reason}\n\nRepair notes: ${repairNotes}`
  };
  const content = serializeTransactionMarkdown(failedTransaction);

  await writeMarkdownPageAtomic(root, transactionFilePaths.failed(transactionId), content);
  await writeMarkdownPageAtomic(root, pendingPath, content);
  await appendIngestLog(root, `Failed transaction ${transactionId}: ${reason}\nRepair notes: ${repairNotes}`);
}

export async function appendIngestLog(root: string, entry: string): Promise<void> {
  const path = "memory/logs/ingest-log.md";
  let current = "# Ingest Log\n";

  try {
    current = await readMarkdownPage(root, path);
  } catch {
    // Create the ingest log if the vault scaffold has not created it yet.
  }

  const timestamp = new Date().toISOString();
  const next = `${current.trimEnd()}\n\n- ${timestamp}: ${entry.trim()}\n`;

  await writeMarkdownPageAtomic(root, path, next);
}

function transactionPath(state: TransactionState, id: string): string {
  return `memory/transactions/${state}/${id}.md`;
}

function normalizeOperation(operation: SupportedOperationType | TransactionOperation): TransactionOperation {
  if (typeof operation === "string") {
    return { operation };
  }

  return operation;
}

function parseProposedOperationsSection(body: string): TransactionOperation[] {
  const section = getSection(body, "Proposed operations");

  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => /^-\s+([A-Z_]+)(?::\s*(.*))?$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => {
      const operation = match[1] ?? "";
      assertSupportedOperations([operation]);

      return {
        operation: operation as SupportedOperationType,
        description: match[2]?.trim()
      };
    });
}

function parseProposedFileWrites(body: string): TransactionFileWrite[] {
  const writes: TransactionFileWrite[] = [];
  const fencePattern = /```markdown\s+(?:path=)?([^\s`]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(body)) !== null) {
    const path = match[1]?.trim();
    const content = match[2] ?? "";

    if (path) {
      writes.push({
        path,
        content: ensureTrailingNewline(content.trimEnd())
      });
    }
  }

  return writes;
}

function serializeOperations(operations: TransactionOperation[]): string[] {
  if (operations.length === 0) {
    return ["- NOOP: no proposed operation"];
  }

  return operations.map((operation) =>
    operation.description
      ? `- ${operation.operation}: ${operation.description}`
      : `- ${operation.operation}`
  );
}

function serializeProposedFileWrites(transaction: Transaction): string[] {
  const writes = getProposedFileWrites(transaction);

  if (writes.length === 0) {
    return [];
  }

  return writes.flatMap((write) => [
    `\`\`\`markdown path=${toCanonicalMemoryPath(write.path)}`,
    write.content.trimEnd(),
    "```",
    ""
  ]);
}

function assertSupportedOperations(operations: readonly string[]): void {
  for (const operation of operations) {
    if (UNSUPPORTED_OPERATION_TYPES.includes(operation as never)) {
      throw new TransactionParseError(`Unsupported MVP operation: ${operation}.`);
    }

    if (!isAllowed(operation, SUPPORTED_OPERATION_TYPES)) {
      throw new TransactionParseError(`Unknown transaction operation: ${operation}.`);
    }
  }
}

function requiredString(frontmatter: Frontmatter, field: string): string {
  const value = frontmatter[field];

  if (typeof value !== "string") {
    throw new TransactionParseError(`Transaction frontmatter is missing string field: ${field}.`);
  }

  return value;
}

function requiredStringArray(frontmatter: Frontmatter, field: string): string[] {
  const value = frontmatter[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TransactionParseError(`Transaction frontmatter is missing string list field: ${field}.`);
  }

  return value as string[];
}

function optionalStringArray(value: FrontmatterValue | undefined): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TransactionParseError("Transaction validation_errors must be a string list.");
  }

  return value as string[];
}

function optionalBoolean(value: FrontmatterValue | undefined): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new TransactionParseError("Transaction requires_review must be boolean.");
  }

  return value;
}

function optionalRiskLevel(value: FrontmatterValue | undefined): "low" | "medium" | "high" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new TransactionParseError(`Invalid transaction risk_level: ${String(value)}.`);
}

function isAllowed(value: string | undefined, allowedValues: readonly string[]): boolean {
  return value !== undefined && allowedValues.includes(value);
}

function getProposedFileWrites(transaction: Transaction): TransactionFileWrite[] {
  const maybeTransaction = transaction as Partial<ParsedTransaction>;
  return maybeTransaction.proposed_file_writes ?? [];
}

function toCanonicalMemoryPath(path: string): string {
  const normalized = normalizePath(path).replace(/^\/+/, "");
  return normalized.startsWith("memory/") ? normalized : `memory/${normalized}`;
}

function normalizeWritePath(path: string): string {
  return toCanonicalMemoryPath(path);
}

function stripMemoryPrefix(path: string): string {
  return normalizePath(path).replace(/^memory\//, "");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function orderWritesForEventPreservation(writes: TransactionFileWrite[]): TransactionFileWrite[] {
  return [...writes].sort((left, right) => {
    const leftIsEvent = stripMemoryPrefix(left.path).startsWith("events/");
    const rightIsEvent = stripMemoryPrefix(right.path).startsWith("events/");

    if (leftIsEvent === rightIsEvent) {
      return 0;
    }

    return leftIsEvent ? -1 : 1;
  });
}

function emptyValidationResult(): ValidationResult {
  return {
    passed: true,
    errors: [],
    warnings: []
  };
}

function addValidationError(result: ValidationResult, error: ValidationError): void {
  result.errors.push(error);
  result.passed = false;
}

function mergeValidationResult(result: ValidationResult, next: ValidationResult): void {
  result.errors.push(...next.errors);
  result.warnings.push(...next.warnings);
  result.passed = result.errors.length === 0;
}

function finalizeValidationResult(result: ValidationResult): ValidationResult {
  return {
    ...result,
    passed: result.errors.length === 0
  };
}

function validateNoDuplicateExistingIds(
  documents: ValidationDocument[],
  vaultIndex: Awaited<ReturnType<typeof loadVaultIndex>>
): ValidationResult {
  const result = emptyValidationResult();

  for (const document of documents) {
    const id = stringFrontmatterValue(document.frontmatter.id);

    if (id) {
      const existingPath = vaultIndex.ids.get(id);

      if (existingPath && stripMemoryPrefix(existingPath) !== document.path) {
        addValidationError(result, {
          code: "DUPLICATE_PAGE_ID",
          message: `Duplicate page ID already exists in vault: ${id}.`,
          path: document.path,
          id
        });
      }
    }

    const type = stringFrontmatterValue(document.frontmatter.type);

    if (type === "event" && id && vaultIndex.eventIds.has(id)) {
      addValidationError(result, {
        code: "DUPLICATE_EVENT_ID",
        message: `Duplicate Event ID already exists in vault: ${id}.`,
        path: document.path,
        id
      });
    }
  }

  return finalizeValidationResult(result);
}

function stringFrontmatterValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
