import {
  applyTransaction,
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listMarkdownFiles,
  listReviewItems,
  parseClaimBlockRecords,
  parseTransactionMarkdown,
  parseMarkdownFile,
  readMarkdownPage,
  rejectTransaction,
  showReviewItem,
  toValidationDocument,
  transactionFilePaths,
  validateDocuments,
  validateTransaction,
  type FrontmatterValue,
  type ParsedTransaction,
  type ReviewActionState,
  type ValidationDocument,
  type ValidationResult
} from "@assisto/core";
import { ingestWithExtractionProvider, LlmExtractionProvider } from "../../core/src/extraction";
import { reprocessEvent } from "../../core/src/ingest";
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
  | "wm_list_review_items"
  | "wm_show_review_item"
  | "wm_mark_review_item"
  | "wm_review_apply_staged"
  | "wm_events_reprocess"
  | "wm_pack_context"
  | "wm_lint";

export type WorkMemoryCommandName =
  | "/wm-ingest"
  | "/wm-review"
  | "/wm-review-show"
  | "/wm-review-mark"
  | "/wm-review-apply"
  | "/wm-event-reprocess"
  | "/wm-apply"
  | "/wm-ask"
  | "/wm-validate"
  | "/wm-lint";

export interface PiExtensionApi {
  registerTool?: (tool: unknown) => void;
  registerCommand?: (...args: unknown[]) => void;
  registerWriteGuard?: (guard: WorkMemoryWriteGuard) => void;
  onBeforeWrite?: (guard: WorkMemoryWriteGuard) => void;
  on?: (eventName: string, handler: PiEventHandler) => void;
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

type PiEventHandler = (event: PiToolCallEvent, context: PiEventContext) => Promise<PiToolCallBlock | undefined> | PiToolCallBlock | undefined;

interface PiToolCallEvent {
  toolName?: unknown;
  input?: unknown;
}

interface PiEventContext {
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error" | "success") => void;
  };
}

interface PiToolCallBlock {
  block: true;
  reason: string;
}

interface PiToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

interface PiCommandOptions {
  description: string;
  getArgumentCompletions?: (prefix: string) => Promise<AutocompleteItem[]>;
  handler: (args: string, context: PiCommandContext) => Promise<unknown>;
}

interface PiCommandContext {
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error" | "success") => void;
  };
}

interface AutocompleteItem {
  value: string;
  label?: string;
  description?: string;
}

interface JsonSchema {
  type: "object" | "string" | "boolean";
  properties?: Record<string, JsonSchema | { type: "string" | "boolean"; description?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  enum?: string[];
}

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

  if (isNativePiApi(api)) {
    registerNativePiExtension(api, extension, options);
  } else {
    for (const tool of extension.tools) {
      api.registerTool?.(tool);
    }

    for (const command of extension.commands) {
      api.registerCommand?.(command);
    }
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
      name: "wm_list_review_items",
      description: "List work-memory ReviewItems.",
      run: async (input) => listReviewItems(rootFromInput(input, vaultRoot), input?.include_all === true)
    },
    {
      name: "wm_show_review_item",
      description: "Show one ReviewItem markdown file.",
      run: async (input) => showReviewItem(rootFromInput(input, vaultRoot), stringInput(input, "id"))
    },
    {
      name: "wm_mark_review_item",
      description: "Create a pending Transaction to mark a ReviewItem reviewed, contested, or archived.",
      run: async (input) =>
        createReviewStateTransaction(
          rootFromInput(input, vaultRoot),
          stringInput(input, "id"),
          reviewStateInput(input, "state"),
          { note: optionalStringInput(input, "note") }
        )
    },
    {
      name: "wm_review_apply_staged",
      description: "Create a pending Transaction that applies a staged ReviewItem claim.",
      run: async (input) =>
        createReviewApplyTransaction(rootFromInput(input, vaultRoot), stringInput(input, "id"), {
          target: stringInput(input, "target"),
          context: optionalStringInput(input, "context"),
          createContext: optionalStringInput(input, "create_context") ?? optionalStringInput(input, "createContext"),
          supersede: optionalStringInput(input, "supersede"),
          note: optionalStringInput(input, "note")
        })
    },
    {
      name: "wm_events_reprocess",
      description: "Create a pending stage-only Transaction by reprocessing an existing Event.",
      run: async (input) => {
        if (input?.stage_only !== true && input?.stageOnly !== true) {
          throw new Error("wm_events_reprocess requires stage_only true.");
        }

        return reprocessEvent(rootFromInput(input, vaultRoot), stringInput(input, "id"));
      }
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
      name: "/wm-review-show",
      description: "Show one work-memory review item.",
      run: async (input) => byName.get("wm_show_review_item")!.run({ id: commandText(input) })
    },
    {
      name: "/wm-review-mark",
      description: "Create a pending review-state transaction. Args: <id> <reviewed|contested|archived>",
      run: async (input) => {
        const [id, state, ...noteParts] = commandText(input).split(/\s+/);

        return byName.get("wm_mark_review_item")!.run({ id, state, note: noteParts.join(" ") });
      }
    },
    {
      name: "/wm-review-apply",
      description:
        'Create a pending review-apply transaction. Args: <id> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note <text>]',
      run: async (input) => {
        const tokens = commandTokens(input);
        const id = tokens[0];

        if (!id) {
          throw new Error("Usage: /wm-review-apply <id|path> --target <id|path> [--context <id|path> | --create-context <name>]");
        }

        return byName.get("wm_review_apply_staged")!.run({
          id,
          target: commandOption(tokens, "--target"),
          context: commandOption(tokens, "--context"),
          create_context: commandOption(tokens, "--create-context"),
          supersede: commandOption(tokens, "--supersede"),
          note: commandOption(tokens, "--note")
        });
      }
    },
    {
      name: "/wm-event-reprocess",
      description: "Create a pending stage-only reprocess transaction. Args: <event-id|path> --stage-only",
      run: async (input) => {
        const tokens = commandTokens(input);
        const id = tokens[0];

        if (!id) {
          throw new Error("Usage: /wm-event-reprocess <event-id|path> --stage-only");
        }

        return byName.get("wm_events_reprocess")!.run({
          id,
          stage_only: tokens.includes("--stage-only")
        });
      }
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

function registerNativePiExtension(
  api: PiExtensionApi,
  extension: ReturnType<typeof createWorkMemoryExtension>,
  options: WorkMemoryExtensionOptions
): void {
  const vaultRoot = options.vaultRoot ?? process.cwd();

  for (const tool of extension.tools) {
    api.registerTool?.(toNativeTool(tool));
  }

  for (const command of extension.commands) {
    api.registerCommand?.(nativeCommandName(command.name), toNativeCommand(command, vaultRoot));
  }

  api.on?.("tool_call", async (event, context) => protectNativeWriteToolCall(event, context));
}

function toNativeTool(tool: WorkMemoryToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    label: toolLabel(tool.name),
    description: toText(tool.description),
    parameters: toolParameters(tool.name),
    async execute(_toolCallId: unknown, params: unknown): Promise<PiToolResult> {
      const result = await tool.run(recordInput(params));

      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { result }
      };
    }
  };
}

function toNativeCommand(command: WorkMemoryCommandDefinition, vaultRoot: string): PiCommandOptions {
  return {
    description: toText(command.description),
    getArgumentCompletions: async (prefix) => getCommandArgumentCompletions(command.name, vaultRoot, prefix),
    handler: async (args, context) => {
      const result = await command.run(args);
      context.ui?.notify?.(`${nativeCommandName(command.name)} completed`, "info");

      return result;
    }
  };
}

async function getCommandArgumentCompletions(
  commandName: WorkMemoryCommandName,
  vaultRoot: string,
  prefix: string
): Promise<AutocompleteItem[]> {
  const normalizedPrefix = toText(prefix);

  if (commandName === "/wm-apply") {
    const transactions = await listTransactions(vaultRoot);
    const pendingTransactions = transactions.filter((transaction) => transaction.state === "pending");

    return filterCompletions(
      pendingTransactions.map((transaction) => ({
        value: transaction.id,
        label: transaction.id,
        description: `${transaction.state} transaction`
      })),
      normalizedPrefix
    );
  }

  if (commandName === "/wm-review-show" || commandName === "/wm-review-mark") {
    return filterCompletions(await reviewItemCompletions(vaultRoot), normalizedPrefix);
  }

  if (commandName === "/wm-review-apply") {
    return filterCompletions(
      [
        ...(await reviewItemCompletions(vaultRoot)),
        ...(await targetPageCompletions(vaultRoot)),
        ...(await contextCompletions(vaultRoot))
      ],
      normalizedPrefix
    );
  }

  if (commandName === "/wm-event-reprocess") {
    return filterCompletions(await eventCompletions(vaultRoot), normalizedPrefix);
  }

  return [];
}

function filterCompletions(items: unknown, prefix: string): AutocompleteItem[] {
  return normalizeCompletions(items).filter((item) => item.value.startsWith(prefix));
}

function normalizeCompletions(items: unknown): AutocompleteItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(normalizeCompletion).filter((item) => item.value.length > 0);
}

function normalizeCompletion(item: unknown): AutocompleteItem {
  if (!isRecord(item)) {
    const value = toText(item);

    return {
      value,
      label: value
    };
  }

  const value = toText(item.value);

  return {
    value,
    label: item.label == null ? value : toText(item.label),
    description: item.description == null ? undefined : toText(item.description)
  };
}

function protectNativeWriteToolCall(event: PiToolCallEvent, context: PiEventContext): PiToolCallBlock | undefined {
  const toolName = toText(event.toolName);

  if (toolName !== "write" && toolName !== "edit") {
    return undefined;
  }

  const input = recordInput(event.input);
  const path = toText(input.path);
  const result = checkWorkMemoryWrite({ path, invokedBy: toolName });

  for (const warning of result.warnings) {
    context.ui?.notify?.(warning, "warning");
  }

  if (result.allowed) {
    return undefined;
  }

  const reason = result.reason ?? "Write blocked by work-memory path policy.";
  context.ui?.notify?.(reason, "warning");

  return {
    block: true,
    reason
  };
}

function isNativePiApi(api: PiExtensionApi): boolean {
  return typeof api.on === "function";
}

function nativeCommandName(name: WorkMemoryCommandName): string {
  return name.replace(/^\/+/, "");
}

function toolLabel(name: WorkMemoryToolName): string {
  const labels: Record<WorkMemoryToolName, string> = {
    wm_validate: "WM Validate",
    wm_ingest_note: "WM Ingest Note",
    wm_list_transactions: "WM List Transactions",
    wm_show_transaction: "WM Show Transaction",
    wm_apply_transaction: "WM Apply Transaction",
    wm_reject_transaction: "WM Reject Transaction",
    wm_review_inbox: "WM Review Inbox",
    wm_list_review_items: "WM List Review Items",
    wm_show_review_item: "WM Show Review Item",
    wm_mark_review_item: "WM Mark Review Item",
    wm_review_apply_staged: "WM Review Apply Staged",
    wm_events_reprocess: "WM Events Reprocess",
    wm_pack_context: "WM Pack Context",
    wm_lint: "WM Lint"
  };

  return labels[name];
}

function toolParameters(name: WorkMemoryToolName): JsonSchema {
  const root = {
    type: "string" as const,
    description: "Vault root. Defaults to the current working directory."
  };
  const note = { type: "string" as const, description: "Short note to ingest." };
  const id = { type: "string" as const, description: "Transaction ID." };
  const reviewId = { type: "string" as const, description: "Review item ID or path." };
  const reviewState = { type: "string" as const, enum: ["reviewed", "contested", "archived"] };
  const reason = { type: "string" as const, description: "Human-readable rejection reason." };
  const question = { type: "string" as const, description: "Question to pack context for." };
  const target = { type: "string" as const, description: "Target Person or Topic ID/path for a staged claim." };
  const context = { type: "string" as const, description: "Existing Context ID/path to scope a staged claim." };
  const createContext = { type: "string" as const, description: "New Context name to create through review." };
  const supersede = { type: "string" as const, description: "Existing claim ID to supersede through review." };
  const reviewNote = { type: "string" as const, description: "Optional human review note." };
  const stageOnly = { type: "boolean" as const, description: "Must be true; reprocessing only stages a transaction." };

  const baseProperties = { root };

  switch (name) {
    case "wm_ingest_note":
      return objectSchema({ ...baseProperties, note, provider: { type: "string", enum: ["rule", "llm"] } }, ["note"]);
    case "wm_show_transaction":
    case "wm_apply_transaction":
      return objectSchema({ ...baseProperties, id }, ["id"]);
    case "wm_reject_transaction":
      return objectSchema({ ...baseProperties, id, reason }, ["id", "reason"]);
    case "wm_show_review_item":
      return objectSchema({ ...baseProperties, id: reviewId }, ["id"]);
    case "wm_mark_review_item":
      return objectSchema(
        { ...baseProperties, id: reviewId, note: reviewNote, state: reviewState },
        ["id", "state"]
      );
    case "wm_review_apply_staged":
      return objectSchema(
        { ...baseProperties, id: reviewId, target, context, create_context: createContext, supersede, note: reviewNote },
        ["id", "target"]
      );
    case "wm_events_reprocess":
      return objectSchema({ ...baseProperties, id: reviewId, stage_only: stageOnly }, ["id", "stage_only"]);
    case "wm_pack_context":
      return objectSchema({ ...baseProperties, question }, ["question"]);
    case "wm_validate":
    case "wm_list_transactions":
    case "wm_review_inbox":
    case "wm_list_review_items":
    case "wm_lint":
      return objectSchema(baseProperties);
  }
}

function objectSchema(
  properties: Record<string, JsonSchema | { type: "string" | "boolean"; description?: string; enum?: string[] }>,
  required: string[] = []
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
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

async function reviewItemCompletions(root: string): Promise<AutocompleteItem[]> {
  const reviewItems = await listReviewItems(root, true);

  return reviewItems.map((item) => ({
    value: item.id,
    label: item.id,
    description: `${item.review_state} review: ${item.review_reason}`
  }));
}

async function targetPageCompletions(root: string): Promise<AutocompleteItem[]> {
  const files = await listVaultMarkdownFiles(root, "memory/**/*.md");
  const items: AutocompleteItem[] = [];

  for (const file of files) {
    if (!file.startsWith("memory/people/") && !file.startsWith("memory/topics/")) {
      continue;
    }

    items.push(...(await pageCompletions(root, file, "target")));
  }

  return items;
}

async function contextCompletions(root: string): Promise<AutocompleteItem[]> {
  const files = await listVaultMarkdownFiles(root, "memory/contexts/**/*.md");
  const items: AutocompleteItem[] = [];

  for (const file of files) {
    items.push(...(await pageCompletions(root, file, "context")));
  }

  return items;
}

async function eventCompletions(root: string): Promise<AutocompleteItem[]> {
  const files = await listVaultMarkdownFiles(root, "memory/events/**/*.md");
  const items: AutocompleteItem[] = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    const id = stringValue(parsed.frontmatter.id);

    if (id) {
      items.push({ value: id, label: id, description: `Event ${file}` });
    }

    items.push({ value: file, label: file, description: "Event path" });
  }

  return items;
}

async function pageCompletions(root: string, file: string, description: string): Promise<AutocompleteItem[]> {
  const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
  const id = stringValue(parsed.frontmatter.id);
  const items: AutocompleteItem[] = [{ value: file, label: file, description }];

  if (id) {
    items.unshift({ value: id, label: id, description: `${description} id` });
  }

  return items;
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

async function reviewInbox(root: string): Promise<{
  items: Array<{
    id: string;
    path: string;
    review_reason: string;
    review_state: string;
    affected_files: string[];
    source_events: string[];
    linked_transaction?: string;
    staged_claim_ids: string[];
    suggested_action: string;
  }>;
  groups: Array<{ review_reason: string; count: number; item_ids: string[]; suggested_action: string }>;
}> {
  const summaries = await listReviewItems(root);
  const items = [];

  for (const summary of summaries) {
    const detail = await showReviewItem(root, summary.id);
    const stagedClaimIds = parseClaimBlockRecords(detail.parsed.body)
      .filter((claim) => stringValue(claim.fields.claim_state) === "staged")
      .map((claim) => stringValue(claim.fields.claim_id))
      .filter((claimId): claimId is string => Boolean(claimId));

    items.push({
      id: summary.id,
      path: summary.path,
      review_reason: summary.review_reason,
      review_state: summary.review_state,
      affected_files: stringArrayValue(detail.parsed.frontmatter.affected_files),
      source_events: stringArrayValue(detail.parsed.frontmatter.source_events),
      linked_transaction: stringValue(detail.parsed.frontmatter.linked_transaction),
      staged_claim_ids: stagedClaimIds,
      suggested_action: suggestedReviewAction(summary.review_reason)
    });
  }

  const groupsByReason = new Map<string, { review_reason: string; count: number; item_ids: string[]; suggested_action: string }>();

  for (const item of items) {
    const group =
      groupsByReason.get(item.review_reason) ??
      {
        review_reason: item.review_reason,
        count: 0,
        item_ids: [],
        suggested_action: item.suggested_action
      };
    group.count += 1;
    group.item_ids.push(item.id);
    groupsByReason.set(item.review_reason, group);
  }

  return {
    items,
    groups: [...groupsByReason.values()].sort((left, right) => left.review_reason.localeCompare(right.review_reason))
  };
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

function optionalStringInput(input: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function reviewStateInput(input: Record<string, unknown> | undefined, key: string): ReviewActionState {
  const value = stringInput(input, key);

  if (value === "reviewed" || value === "contested" || value === "archived") {
    return value;
  }

  throw new Error(`Invalid review state: ${value}`);
}

function suggestedReviewAction(reviewReason: string): string {
  switch (reviewReason) {
    case "unscoped_claim":
      return "Use wm_review_apply_staged with --context or --create-context, or mark contested.";
    case "role_change":
      return "Use wm_review_apply_staged with --supersede only after human confirmation.";
    case "reporting_change":
      return "Use wm_review_apply_staged with --supersede only after human confirmation.";
    case "claim_id_conflict":
      return "Inspect the staged claim and target page before applying; do not auto-merge.";
    default:
      return "Inspect the ReviewItem, then apply staged, mark, or leave staged.";
  }
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

function commandTokens(input: string | Record<string, unknown> | undefined): string[] {
  const text = commandText(input);
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (!inQuote && /\s/.test(char ?? "")) {
      if (current) {
        tokens.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function commandOption(tokens: string[], name: string): string | undefined {
  const index = tokens.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = tokens[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function recordInput(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (value == null) {
    return "";
  }

  return typeof value === "string" ? value : String(value);
}

function formatResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "";
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
