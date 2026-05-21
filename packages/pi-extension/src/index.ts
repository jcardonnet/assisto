import {
  applyTransaction,
  listMarkdownFiles,
  parseMarkdownFile,
  parseTransactionMarkdown,
  readMarkdownPage,
  rejectTransaction,
  toValidationDocument,
  transactionFilePaths,
  validateDocuments,
  validateTransaction,
  type FrontmatterValue,
  type ParsedTransaction,
  type ValidationDocument,
  type ValidationResult
} from "@assisto/core";
import { ingestWithExtractionProvider, LlmExtractionProvider } from "../../core/src/extraction";
import { lintVault } from "../../core/src/lint";
import { retrieveContextForAnswer } from "../../core/src/retrieval";

export type WorkMemoryToolName =
  | "wm_validate"
  | "wm_ingest_note"
  | "wm_list_transactions"
  | "wm_show_transaction"
  | "wm_apply_transaction"
  | "wm_reject_transaction"
  | "wm_review_inbox"
  | "wm_pack_context"
  | "wm_lint";

export type WorkMemoryCommandName =
  | "/wm-ingest"
  | "/wm-review"
  | "/wm-apply"
  | "/wm-ask"
  | "/wm-validate"
  | "/wm-lint";

export interface PiExtensionApi {
  registerTool?: (tool: WorkMemoryToolDefinition) => void;
  registerCommand?: (command: WorkMemoryCommandDefinition) => void;
  registerWriteGuard?: (guard: WorkMemoryWriteGuard) => void;
  onBeforeWrite?: (guard: WorkMemoryWriteGuard) => void;
}

export interface WorkMemoryExtensionOptions {
  vaultRoot?: string;
}

export interface WorkMemoryToolDefinition {
  name: WorkMemoryToolName;
  description: string;
  run: (input?: Record<string, unknown>) => Promise<unknown>;
}

export interface WorkMemoryCommandDefinition {
  name: WorkMemoryCommandName;
  description: string;
  run: (input?: string | Record<string, unknown>) => Promise<unknown>;
}

export interface WorkMemoryWriteRequest {
  path: string;
  invokedBy?: string;
}

export interface WorkMemoryWriteGuardResult {
  allowed: boolean;
  warnings: string[];
  reason?: string;
}

export type WorkMemoryWriteGuard = (request: WorkMemoryWriteRequest) => WorkMemoryWriteGuardResult;

interface ValidationSummary {
  passed: boolean;
  errors: Array<{ code: string; message: string; path?: string; id?: string }>;
  warnings: Array<{ code: string; message: string; path?: string; id?: string }>;
}

const transactionStates = ["pending", "applied", "rejected", "failed"] as const;
const canonicalWritePrefixes = [
  "memory/people/",
  "memory/topics/",
  "memory/contexts/",
  "memory/followups/"
];
const allowedWriteRoots = ["memory/", ".pi/"];

export function createWorkMemoryExtension(options: WorkMemoryExtensionOptions = {}): {
  tools: WorkMemoryToolDefinition[];
  commands: WorkMemoryCommandDefinition[];
  writeGuard: WorkMemoryWriteGuard;
} {
  const vaultRoot = options.vaultRoot ?? process.cwd();
  const tools = createTools(vaultRoot);

  return {
    tools,
    commands: createCommands(tools),
    writeGuard: checkWorkMemoryWrite
  };
}

export function registerWorkMemoryExtension(
  api: PiExtensionApi,
  options: WorkMemoryExtensionOptions = {}
): ReturnType<typeof createWorkMemoryExtension> {
  const extension = createWorkMemoryExtension(options);

  for (const tool of extension.tools) {
    api.registerTool?.(tool);
  }

  for (const command of extension.commands) {
    api.registerCommand?.(command);
  }

  api.registerWriteGuard?.(extension.writeGuard);
  api.onBeforeWrite?.(extension.writeGuard);

  return extension;
}

export function checkWorkMemoryWrite(request: WorkMemoryWriteRequest): WorkMemoryWriteGuardResult {
  const normalizedPath = normalizePath(request.path);
  const warnings: string[] = [];

  if (isObsidianPath(normalizedPath)) {
    return {
      allowed: false,
      warnings,
      reason: "Writes to .obsidian/ are forbidden."
    };
  }

  if (canonicalWritePrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    if (request.invokedBy === "wm_apply_transaction") {
      return {
        allowed: true,
        warnings
      };
    }

    return {
      allowed: false,
      warnings,
      reason: "Direct canonical memory writes must go through wm_apply_transaction."
    };
  }

  if (!allowedWriteRoots.some((prefix) => normalizedPath.startsWith(prefix))) {
    warnings.push("Write is outside memory/ and .pi/; this is allowed but outside canonical extension scope.");
  }

  return {
    allowed: true,
    warnings
  };
}

function createTools(vaultRoot: string): WorkMemoryToolDefinition[] {
  return [
    {
      name: "wm_validate",
      description: "Validate the work-memory vault.",
      run: async (input) => validateTool(rootFromInput(input, vaultRoot))
    },
    {
      name: "wm_ingest_note",
      description: "Create an Event and pending Transaction for a note.",
      run: async (input) => {
        const note = stringInput(input, "note");
        const provider = input?.provider === "llm" ? new LlmExtractionProvider() : undefined;

        return ingestWithExtractionProvider(rootFromInput(input, vaultRoot), note, { provider });
      }
    },
    {
      name: "wm_list_transactions",
      description: "List work-memory transactions.",
      run: async (input) => listTransactions(rootFromInput(input, vaultRoot))
    },
    {
      name: "wm_show_transaction",
      description: "Show one transaction markdown file.",
      run: async (input) => showTransaction(rootFromInput(input, vaultRoot), stringInput(input, "id"))
    },
    {
      name: "wm_apply_transaction",
      description: "Validate and apply a pending transaction.",
      run: async (input) => {
        const root = rootFromInput(input, vaultRoot);
        const id = stringInput(input, "id");
        await applyTransaction(root, id);

        return {
          applied: true,
          id
        };
      }
    },
    {
      name: "wm_reject_transaction",
      description: "Reject a pending transaction with a reason.",
      run: async (input) => {
        const root = rootFromInput(input, vaultRoot);
        const id = stringInput(input, "id");
        const reason = stringInput(input, "reason");
        await rejectTransaction(root, id, reason);

        return {
          rejected: true,
          id,
          reason
        };
      }
    },
    {
      name: "wm_review_inbox",
      description: "List staged work-memory ReviewItems.",
      run: async (input) => reviewInbox(rootFromInput(input, vaultRoot))
    },
    {
      name: "wm_pack_context",
      description: "Pack deterministic lexical context for a question.",
      run: async (input) => retrieveContextForAnswer(rootFromInput(input, vaultRoot), stringInput(input, "question"))
    },
    {
      name: "wm_lint",
      description: "Run manual MVP lint checks and stage ReviewItems.",
      run: async (input) => lintVault(rootFromInput(input, vaultRoot))
    }
  ];
}

function createCommands(tools: WorkMemoryToolDefinition[]): WorkMemoryCommandDefinition[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return [
    {
      name: "/wm-ingest",
      description: "Ingest a note into a pending work-memory transaction.",
      run: async (input) => byName.get("wm_ingest_note")!.run({ note: commandText(input) })
    },
    {
      name: "/wm-review",
      description: "Show staged work-memory review items.",
      run: async () => byName.get("wm_review_inbox")!.run()
    },
    {
      name: "/wm-apply",
      description: "Apply a pending work-memory transaction by id.",
      run: async (input) => byName.get("wm_apply_transaction")!.run({ id: commandText(input) })
    },
    {
      name: "/wm-ask",
      description: "Pack deterministic context for a question.",
      run: async (input) => byName.get("wm_pack_context")!.run({ question: commandText(input) })
    },
    {
      name: "/wm-validate",
      description: "Validate the work-memory vault.",
      run: async () => byName.get("wm_validate")!.run()
    },
    {
      name: "/wm-lint",
      description: "Run manual work-memory lint checks.",
      run: async () => byName.get("wm_lint")!.run()
    }
  ];
}

async function validateTool(root: string): Promise<ValidationSummary> {
  const files = await listVaultMarkdownFiles(root);
  const transactionFiles = files.filter((file) => file.startsWith("memory/transactions/"));
  const canonicalFiles = files.filter((file) => !file.startsWith("memory/transactions/"));
  const canonicalDocuments = await loadValidationDocuments(root, canonicalFiles);
  const canonicalResult = validateDocuments({
    documents: canonicalDocuments,
    existingEventIds: eventIds(canonicalDocuments),
    existingPaths: canonicalFiles
  });
  const transactionResults: ValidationResult[] = [];

  for (const file of transactionFiles) {
    const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));
    transactionResults.push(await validateTransaction(root, transaction));
  }

  return summarizeValidation(combineValidationResults([canonicalResult, ...transactionResults]));
}

async function listTransactions(root: string): Promise<Array<{ id: string; state: string; path: string; operations: string[] }>> {
  const files = await listVaultMarkdownFiles(root, "memory/transactions/**/*.md");
  const transactions: Array<{ id: string; state: string; path: string; operations: string[] }> = [];

  for (const file of files) {
    const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));
    transactions.push({
      id: transaction.id,
      state: transaction.transaction_state,
      path: file,
      operations: transaction.operations.map((operation) => operation.operation)
    });
  }

  return transactions;
}

async function showTransaction(
  root: string,
  id: string
): Promise<{ path: string; transaction: ParsedTransaction; content: string }> {
  const found = await findTransaction(root, id);

  if (!found) {
    throw new Error(`Transaction not found: ${id}`);
  }

  return found;
}

async function reviewInbox(root: string): Promise<Array<{ id?: string; path: string; review_reason?: string }>> {
  const files = await listVaultMarkdownFiles(root, "memory/review/*.md");
  const staged: Array<{ id?: string; path: string; review_reason?: string }> = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

    if (parsed.frontmatter.type === "review_item" && parsed.frontmatter.review_state === "staged") {
      staged.push({
        id: stringValue(parsed.frontmatter.id),
        path: file,
        review_reason: stringValue(parsed.frontmatter.review_reason)
      });
    }
  }

  return staged;
}

async function findTransaction(
  root: string,
  id: string
): Promise<{ path: string; content: string; transaction: ParsedTransaction } | null> {
  for (const state of transactionStates) {
    const txPath = transactionFilePaths[state](id);

    try {
      const content = await readMarkdownPage(root, txPath);

      return {
        path: txPath,
        content,
        transaction: parseTransactionMarkdown(content)
      };
    } catch {
      // Try the next transaction state folder.
    }
  }

  return null;
}

async function listVaultMarkdownFiles(root: string, globPattern = "memory/**/*.md"): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

async function loadValidationDocuments(root: string, files: string[]): Promise<ValidationDocument[]> {
  const documents: ValidationDocument[] = [];

  for (const file of files) {
    documents.push(toValidationDocument(file, await readMarkdownPage(root, file)));
  }

  return documents;
}

function combineValidationResults(results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => result.errors);
  const warnings = results.flatMap((result) => result.warnings);

  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}

function summarizeValidation(result: ValidationResult): ValidationSummary {
  return {
    passed: result.passed,
    errors: result.errors.map((error) => ({
      code: error.code,
      message: error.message,
      path: error.path,
      id: error.id
    })),
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      path: warning.path,
      id: warning.id
    }))
  };
}

function eventIds(documents: ValidationDocument[]): string[] {
  return documents
    .filter((document) => document.frontmatter.type === "event")
    .map((document) => stringValue(document.frontmatter.id))
    .filter((id): id is string => Boolean(id));
}

function rootFromInput(input: Record<string, unknown> | undefined, fallbackRoot: string): string {
  return typeof input?.root === "string" && input.root.trim() ? input.root : fallbackRoot;
}

function stringInput(input: Record<string, unknown> | undefined, key: string): string {
  const value = input?.[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string input: ${key}`);
  }

  return value.trim();
}

function commandText(input: string | Record<string, unknown> | undefined): string {
  if (typeof input === "string") {
    return input.trim();
  }

  if (typeof input?.text === "string") {
    return input.text.trim();
  }

  if (typeof input?.note === "string") {
    return input.note.trim();
  }

  if (typeof input?.question === "string") {
    return input.question.trim();
  }

  if (typeof input?.id === "string") {
    return input.id.trim();
  }

  return "";
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isObsidianPath(path: string): boolean {
  return path
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.toLowerCase() === ".obsidian");
}
