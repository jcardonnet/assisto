import {
  CLAIM_KINDS,
  CLAIM_STATES,
  EVIDENCE_STRENGTHS,
  FOLLOWUP_STATES,
  OBJECT_STATES,
  REVIEW_STATES,
  SCOPE_STATES,
  SUPPORTED_OPERATION_TYPES,
  TRANSACTION_STATES
} from "../model";
import {
  getSection,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseWikilinks,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord
} from "../markdown";
import { defaultOntologyRegistry, validateOntologyFrame } from "../ontology";

export type ValidationErrorCode =
  | "MISSING_FRONTMATTER_FIELD"
  | "INVALID_FRONTMATTER_ENUM"
  | "INVALID_OPERATION"
  | "MISSING_CLAIM_FIELD"
  | "INVALID_CLAIM_ENUM"
  | "INVALID_CLAIM_EVIDENCE"
  | "ACTIVE_CLAIM_MISSING_EVENT_EVIDENCE"
  | "SOURCE_EVENT_NOT_FOUND"
  | "WIKILINK_UNRESOLVED"
  | "DUPLICATE_PAGE_ID"
  | "DUPLICATE_CLAIM_ID"
  | "DUPLICATE_EVENT_ID"
  | "DUPLICATE_TRANSACTION_ID"
  | "COMMITTED_FOLLOWUP_MISSING_TRIGGER"
  | "ACTIVE_SYSTEM_CLAIM_UNKNOWN_SCOPE"
  | "SUMMARY_BASIS_MISSING"
  | "SUMMARY_BASIS_NON_ACTIVE_CLAIM"
  | "AMBIGUOUS_ENTITY_AUTO_UPDATE"
  | "TRANSACTION_ROLLBACK_MISSING"
  | "TRANSACTION_WRITESET_MISSING"
  | "TRANSACTION_WRITE_PATH_INVALID"
  | "TRANSACTION_AFFECTED_FILE_MISMATCH"
  | "ONTOLOGY_FRAME_INVALID";

export type ValidationWarningCode = "SUMMARY_OMITTED" | "NO_CLAIM_BLOCKS";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  path?: string;
  field?: string;
  id?: string;
  line?: number;
}

export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  path?: string;
  field?: string;
  id?: string;
  line?: number;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationDocument {
  path: string;
  frontmatter: Frontmatter;
  body: string;
}

export interface ValidationContext {
  documents: ValidationDocument[];
  existingEventIds?: string[];
  existingPaths?: string[];
  newlyCreatedPaths?: string[];
  reviewedTransactionIds?: string[];
}

const allowedTypes = [
  "event",
  "person",
  "context",
  "topic",
  "followup",
  "review_item",
  "transaction",
  "log_entry"
] as const;

const frontmatterRequiredFields: Record<string, string[]> = {
  event: [
    "id",
    "type",
    "object_state",
    "review_state",
    "recorded_at",
    "observed_at",
    "source_type",
    "source_actor",
    "derived_claims"
  ],
  person: [
    "id",
    "type",
    "object_state",
    "review_state",
    "created_at",
    "updated_at",
    "aliases",
    "source_events",
    "related"
  ],
  context: [
    "id",
    "type",
    "object_state",
    "review_state",
    "created_at",
    "updated_at",
    "source_events",
    "related"
  ],
  topic: [
    "id",
    "type",
    "object_state",
    "review_state",
    "created_at",
    "updated_at",
    "aliases",
    "source_events",
    "related"
  ],
  followup: [
    "id",
    "type",
    "object_state",
    "review_state",
    "followup_state",
    "created_at",
    "updated_at",
    "owner",
    "source_events",
    "related"
  ],
  review_item: [
    "id",
    "type",
    "object_state",
    "review_state",
    "review_reason",
    "created_at",
    "source_events",
    "affected_files"
  ],
  transaction: [
    "id",
    "type",
    "transaction_state",
    "created_at",
    "source_events",
    "operations",
    "affected_files"
  ],
  log_entry: ["id", "type", "object_state", "review_state", "recorded_at", "message"]
};

const claimRequiredFields = [
  "claim_id",
  "statement",
  "claim_kind",
  "claim_state",
  "evidence_strength",
  "scope_state",
  "evidence",
  "recorded_at",
  "observed_at",
  "valid_from",
  "valid_to"
] as const;

const committedFollowUpTriggers = [
  /\bremind me to\b/i,
  /\bi need to\b/i,
  /\bi have to\b/i,
  /\bi will\b/i,
  /\bi'll\b/i,
  /\bplease track\b/i,
  /\badd a follow-up\b/i,
  /\basked me to\b/i,
  /\bdue by\b/i,
  /\bby\s+\S+.*\bi need to\b/i
];

export function toValidationDocument(path: string, content: string): ValidationDocument {
  const parsed = parseMarkdownFile(content);

  return {
    path,
    frontmatter: parsed.frontmatter,
    body: parsed.body
  };
}

export function validateFrontmatter(document: ValidationDocument): ValidationResult {
  const result = emptyResult();
  const type = stringValue(document.frontmatter.type);
  const requiredFields = type ? frontmatterRequiredFields[type] : undefined;

  if (!hasField(document.frontmatter, "type")) {
    addError(result, {
      code: "MISSING_FRONTMATTER_FIELD",
      message: "Frontmatter is missing required field: type.",
      path: document.path,
      field: "type"
    });
  } else if (!isAllowed(type, allowedTypes)) {
    addError(result, {
      code: "INVALID_FRONTMATTER_ENUM",
      message: `Frontmatter type is not an MVP object type: ${String(type)}.`,
      path: document.path,
      field: "type"
    });
  }

  if (requiredFields) {
    for (const field of requiredFields) {
      if (!hasField(document.frontmatter, field)) {
        addError(result, {
          code: "MISSING_FRONTMATTER_FIELD",
          message: `Frontmatter is missing required field: ${field}.`,
          path: document.path,
          field
        });
      }
    }
  }

  validateEnumField(result, document, "object_state", OBJECT_STATES);
  validateEnumField(result, document, "review_state", REVIEW_STATES);
  validateEnumField(result, document, "followup_state", FOLLOWUP_STATES);
  validateEnumField(result, document, "transaction_state", TRANSACTION_STATES);

  const operations = document.frontmatter.operations;

  if (operations !== undefined) {
    if (!Array.isArray(operations)) {
      addError(result, {
        code: "INVALID_OPERATION",
        message: "Transaction operations must be a list.",
        path: document.path,
        field: "operations"
      });
    } else {
      for (const operation of operations) {
        if (typeof operation !== "string" || !isAllowed(operation, SUPPORTED_OPERATION_TYPES)) {
          addError(result, {
            code: "INVALID_OPERATION",
            message: `Unsupported MVP transaction operation: ${String(operation)}.`,
            path: document.path,
            field: "operations"
          });
        }
      }
    }
  }

  return finalize(result);
}

export function validateClaimBlocks(document: ValidationDocument): ValidationResult {
  const result = emptyResult();
  const claimRecords = parseClaimBlockRecords(document.body);

  for (const claim of claimRecords) {
    for (const field of claimRequiredFields) {
      if (!hasField(claim.fields, field)) {
        addError(result, {
          code: "MISSING_CLAIM_FIELD",
          message: `Claim block is missing required field: ${field}.`,
          path: document.path,
          field,
          id: stringValue(claim.fields.claim_id),
          line: claim.line
        });
      }
    }

    validateClaimEnumField(result, document, claim, "claim_kind", CLAIM_KINDS);
    validateClaimEnumField(result, document, claim, "claim_state", CLAIM_STATES);
    validateClaimEnumField(result, document, claim, "evidence_strength", EVIDENCE_STRENGTHS);
    validateClaimEnumField(result, document, claim, "scope_state", SCOPE_STATES);

    if (hasField(claim.fields, "evidence") && !isStringArray(claim.fields.evidence)) {
      addError(result, {
        code: "INVALID_CLAIM_EVIDENCE",
        message: "Claim evidence must be a list of Event IDs.",
        path: document.path,
        field: "evidence",
        id: stringValue(claim.fields.claim_id),
        line: claim.line
      });
    }

    if (hasOntologyFrameFields(claim.fields)) {
      validateOntologyClaimFrame(result, document, claim);
    }
  }

  return finalize(result);
}

export function validateSourceEventLinks(context: ValidationContext): ValidationResult {
  const result = emptyResult();
  const eventIds = new Set(context.existingEventIds ?? []);

  for (const document of context.documents) {
    if (stringValue(document.frontmatter.type) === "event") {
      const id = stringValue(document.frontmatter.id);

      if (id) {
        eventIds.add(id);
      }
    }
  }

  for (const document of context.documents) {
    for (const claim of parseClaimBlockRecords(document.body)) {
      if (claim.fields.claim_state !== "active") {
        continue;
      }

      const evidence = claim.fields.evidence;

      if (!Array.isArray(evidence) || evidence.length === 0) {
        addError(result, {
          code: "ACTIVE_CLAIM_MISSING_EVENT_EVIDENCE",
          message: "Active durable claims must cite at least one Event ID.",
          path: document.path,
          field: "evidence",
          id: stringValue(claim.fields.claim_id),
          line: claim.line
        });
        continue;
      }

      for (const eventId of evidence) {
        if (typeof eventId !== "string" || !eventIds.has(eventId)) {
          addError(result, {
            code: "SOURCE_EVENT_NOT_FOUND",
            message: `Claim cites a missing Event ID: ${String(eventId)}.`,
            path: document.path,
            field: "evidence",
            id: stringValue(claim.fields.claim_id),
            line: claim.line
          });
        }
      }
    }
  }

  return finalize(result);
}

export function validateWikilinks(context: ValidationContext): ValidationResult {
  const result = emptyResult();
  const resolvablePaths = new Set<string>();

  for (const path of [...(context.existingPaths ?? []), ...(context.newlyCreatedPaths ?? [])]) {
    resolvablePaths.add(normalizeResolvablePath(path));
  }

  for (const document of context.documents) {
    resolvablePaths.add(normalizeResolvablePath(document.path));
  }

  for (const document of context.documents) {
    const wikilinks = parseWikilinks(`${frontmatterText(document.frontmatter)}\n${document.body}`);

    for (const wikilink of wikilinks) {
      if (!resolvablePaths.has(normalizeResolvablePath(wikilink))) {
        addError(result, {
          code: "WIKILINK_UNRESOLVED",
          message: `Wikilink does not resolve to an existing or newly created path: [[${wikilink}]].`,
          path: document.path,
          id: wikilink
        });
      }
    }
  }

  return finalize(result);
}

export function validateUniqueIds(documents: ValidationDocument[]): ValidationResult {
  const result = emptyResult();
  const pageIds = new Map<string, string>();
  const eventIds = new Map<string, string>();
  const transactionIds = new Map<string, string>();
  const claimIds = new Map<string, string>();

  for (const document of documents) {
    const id = stringValue(document.frontmatter.id);
    const type = stringValue(document.frontmatter.type);

    if (id) {
      checkDuplicate(result, pageIds, id, document.path, "DUPLICATE_PAGE_ID", "Duplicate page ID.");

      if (type === "event") {
        checkDuplicate(result, eventIds, id, document.path, "DUPLICATE_EVENT_ID", "Duplicate Event ID.");
      }

      if (type === "transaction") {
        checkDuplicate(
          result,
          transactionIds,
          id,
          document.path,
          "DUPLICATE_TRANSACTION_ID",
          "Duplicate transaction ID."
        );
      }
    }

    for (const claim of parseClaimBlockRecords(document.body)) {
      const claimId = stringValue(claim.fields.claim_id);

      if (claimId) {
        checkDuplicate(
          result,
          claimIds,
          claimId,
          document.path,
          "DUPLICATE_CLAIM_ID",
          "Duplicate claim ID.",
          claim.line
        );
      }
    }
  }

  return finalize(result);
}

export function validateNoCommittedFollowupWithoutTrigger(
  document: ValidationDocument,
  context: Pick<ValidationContext, "reviewedTransactionIds"> = {}
): ValidationResult {
  const result = emptyResult();

  if (
    stringValue(document.frontmatter.type) !== "followup" ||
    document.frontmatter.followup_state !== "committed"
  ) {
    return finalize(result);
  }

  const text = `${frontmatterText(document.frontmatter)}\n${document.body}`;
  const hasExplicitTrigger = committedFollowUpTriggers.some((trigger) => trigger.test(text));
  const hasReviewedState = document.frontmatter.review_state === "reviewed";
  const sourceTransactions = stringArrayValue(document.frontmatter.transactions);
  const hasReviewedTransaction = sourceTransactions.some((transactionId) =>
    (context.reviewedTransactionIds ?? []).includes(transactionId)
  );

  if (!hasExplicitTrigger && !hasReviewedState && !hasReviewedTransaction) {
    addError(result, {
      code: "COMMITTED_FOLLOWUP_MISSING_TRIGGER",
      message: "Committed follow-ups require an explicit trigger phrase or reviewed transaction.",
      path: document.path,
      field: "followup_state",
      id: stringValue(document.frontmatter.id)
    });
  }

  return finalize(result);
}

export function validateNoActiveSystemClaimWithScopeUnknown(
  document: ValidationDocument
): ValidationResult {
  const result = emptyResult();
  const type = stringValue(document.frontmatter.type);

  if (type !== "context" && type !== "topic") {
    return finalize(result);
  }

  for (const claim of parseClaimBlockRecords(document.body)) {
    if (claim.fields.claim_state === "active" && claim.fields.scope_state === "unknown") {
      addError(result, {
        code: "ACTIVE_SYSTEM_CLAIM_UNKNOWN_SCOPE",
        message: "Active Context/Topic claims cannot have scope_state: unknown.",
        path: document.path,
        field: "scope_state",
        id: stringValue(claim.fields.claim_id),
        line: claim.line
      });
    }
  }

  return finalize(result);
}

export function validateSummaryBasis(document: ValidationDocument): ValidationResult {
  const result = emptyResult();
  const summary = getSection(document.body, "Current summary");

  if (!summary || isPlaceholder(summary)) {
    return finalize(result);
  }

  const activeClaimIds = new Set(
    parseClaimBlockRecords(document.body)
      .filter((claim) => claim.fields.claim_state === "active")
      .map((claim) => stringValue(claim.fields.claim_id))
      .filter((claimId): claimId is string => Boolean(claimId))
  );
  const summaryBasis = stringArrayValue(document.frontmatter.summary_generated_from);

  if (summaryBasis.length === 0) {
    addError(result, {
      code: "SUMMARY_BASIS_MISSING",
      message: "Current summary must list active claim IDs in summary_generated_from or be omitted.",
      path: document.path,
      field: "summary_generated_from",
      id: stringValue(document.frontmatter.id)
    });
    return finalize(result);
  }

  for (const claimId of summaryBasis) {
    if (!activeClaimIds.has(claimId)) {
      addError(result, {
        code: "SUMMARY_BASIS_NON_ACTIVE_CLAIM",
        message: `Current summary references a non-active or missing claim: ${claimId}.`,
        path: document.path,
        field: "summary_generated_from",
        id: claimId
      });
    }
  }

  return finalize(result);
}

export function validateNoAmbiguousEntityUpdate(document: ValidationDocument): ValidationResult {
  const result = emptyResult();

  if (stringValue(document.frontmatter.type) !== "transaction") {
    return finalize(result);
  }

  const text = `${frontmatterText(document.frontmatter)}\n${document.body}`;
  const hasAmbiguousResolution = /\b(entity_resolution|resolution_state):\s*(near_match|ambiguous)\b/i.test(
    text
  );

  if (!hasAmbiguousResolution || document.frontmatter.requires_review === true) {
    return finalize(result);
  }

  const operations = stringArrayValue(document.frontmatter.operations);
  const hasAutomaticMutation = operations.some((operation) =>
    ["UPSERT_CLAIM", "SUPERSEDE_CLAIM", "CLOSE_FOLLOWUP"].includes(operation)
  );

  if (hasAutomaticMutation) {
    addError(result, {
      code: "AMBIGUOUS_ENTITY_AUTO_UPDATE",
      message: "near_match and ambiguous entity updates must stage review.",
      path: document.path,
      field: "operations",
      id: stringValue(document.frontmatter.id)
    });
  }

  return finalize(result);
}

export function validateTransactionRollback(document: ValidationDocument): ValidationResult {
  const result = emptyResult();

  if (stringValue(document.frontmatter.type) !== "transaction") {
    return finalize(result);
  }

  const rollbackNotes =
    getSection(document.body, "Rollback / repair notes") ?? stringValue(document.frontmatter.rollback_notes);

  if (!rollbackNotes || isPlaceholder(rollbackNotes)) {
    addError(result, {
      code: "TRANSACTION_ROLLBACK_MISSING",
      message: "Transactions must include rollback/repair notes.",
      path: document.path,
      field: "rollback_notes",
      id: stringValue(document.frontmatter.id)
    });
  }

  return finalize(result);
}

export function validateDocuments(context: ValidationContext): ValidationResult {
  const results: ValidationResult[] = [];

  for (const document of context.documents) {
    results.push(validateFrontmatter(document));
    results.push(validateClaimBlocks(document));
    results.push(validateNoCommittedFollowupWithoutTrigger(document, context));
    results.push(validateNoActiveSystemClaimWithScopeUnknown(document));
    results.push(validateSummaryBasis(document));
    results.push(validateNoAmbiguousEntityUpdate(document));
    results.push(validateTransactionRollback(document));
  }

  results.push(validateSourceEventLinks(context));
  results.push(validateWikilinks(context));
  results.push(validateUniqueIds(context.documents));

  return combineResults(results);
}

function emptyResult(): ValidationResult {
  return {
    passed: true,
    errors: [],
    warnings: []
  };
}

function finalize(result: ValidationResult): ValidationResult {
  return {
    ...result,
    passed: result.errors.length === 0
  };
}

function combineResults(results: ValidationResult[]): ValidationResult {
  const combined = emptyResult();

  for (const result of results) {
    combined.errors.push(...result.errors);
    combined.warnings.push(...result.warnings);
  }

  return finalize(combined);
}

function addError(result: ValidationResult, error: ValidationError): void {
  result.errors.push(error);
  result.passed = false;
}

function validateEnumField(
  result: ValidationResult,
  document: ValidationDocument,
  field: string,
  allowedValues: readonly string[]
): void {
  if (!hasField(document.frontmatter, field)) {
    return;
  }

  const value = document.frontmatter[field];

  if (typeof value !== "string" || !isAllowed(value, allowedValues)) {
    addError(result, {
      code: "INVALID_FRONTMATTER_ENUM",
      message: `Frontmatter field ${field} has invalid value: ${String(value)}.`,
      path: document.path,
      field,
      id: stringValue(document.frontmatter.id)
    });
  }
}

function validateClaimEnumField(
  result: ValidationResult,
  document: ValidationDocument,
  claim: ParsedClaimBlockRecord,
  field: string,
  allowedValues: readonly string[]
): void {
  if (!hasField(claim.fields, field)) {
    return;
  }

  const value = claim.fields[field];

  if (typeof value !== "string" || !isAllowed(value, allowedValues)) {
    addError(result, {
      code: "INVALID_CLAIM_ENUM",
      message: `Claim field ${field} has invalid value: ${String(value)}.`,
      path: document.path,
      field,
      id: stringValue(claim.fields.claim_id),
      line: claim.line
    });
  }
}

function hasOntologyFrameFields(fields: Record<string, FrontmatterValue>): boolean {
  return hasField(fields, "relation") || hasField(fields, "subject_kind") || hasField(fields, "object_kind");
}

function validateOntologyClaimFrame(
  result: ValidationResult,
  document: ValidationDocument,
  claim: ParsedClaimBlockRecord
): void {
  const relation = stringValue(claim.fields.relation);
  const subjectKind = stringValue(claim.fields.subject_kind);
  const objectKind = stringValue(claim.fields.object_kind);

  if (!relation || !subjectKind || !objectKind) {
    addError(result, {
      code: "ONTOLOGY_FRAME_INVALID",
      message: "Ontology-aware claim frames require relation, subject_kind, and object_kind.",
      path: document.path,
      field: "relation",
      id: stringValue(claim.fields.claim_id),
      line: claim.line
    });
    return;
  }

  const validation = validateOntologyFrame(
    {
      subject_id: stringValue(claim.fields.subject_id),
      subject_kind: subjectKind,
      relation,
      object_id: stringValue(claim.fields.object_id),
      object_kind: objectKind,
      statement: stringValue(claim.fields.statement) ?? "",
      scope: typeof claim.fields.scope === "string" ? claim.fields.scope : null,
      evidence: isStringArray(claim.fields.evidence) ? claim.fields.evidence : [],
      change_type: claim.fields.change_type === "change" ? "change" : "new"
    },
    defaultOntologyRegistry
  );

  if (validation.passed && !validation.requires_review) {
    return;
  }

  addError(result, {
    code: "ONTOLOGY_FRAME_INVALID",
    message: `Ontology-aware claim frame must stage review: ${validation.review_reasons.join(", ")}.`,
    path: document.path,
    field: "relation",
    id: stringValue(claim.fields.claim_id),
    line: claim.line
  });
}

function checkDuplicate(
  result: ValidationResult,
  seen: Map<string, string>,
  id: string,
  path: string,
  code: Extract<
    ValidationErrorCode,
    "DUPLICATE_PAGE_ID" | "DUPLICATE_CLAIM_ID" | "DUPLICATE_EVENT_ID" | "DUPLICATE_TRANSACTION_ID"
  >,
  message: string,
  line?: number
): void {
  const existingPath = seen.get(id);

  if (!existingPath) {
    seen.set(id, path);
    return;
  }

  addError(result, {
    code,
    message: `${message} ${id} appears in both ${existingPath} and ${path}.`,
    path,
    id,
    line
  });
}

function hasField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function isAllowed(value: string | undefined, allowedValues: readonly string[]): boolean {
  return value !== undefined && allowedValues.includes(value);
}

function isStringArray(value: FrontmatterValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return isStringArray(value) ? value : [];
}

function frontmatterText(frontmatter: Frontmatter): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValueText(value)}`)
    .join("\n");
}

function frontmatterValueText(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return value.map(frontmatterValueText).join("\n");
  }

  return String(value);
}

function normalizeResolvablePath(path: string): string {
  return path
    .split("#")[0]!
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/^memory\//, "")
    .replace(/^\/+/, "")
    .trim();
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || /^<.*>$/.test(trimmed);
}
