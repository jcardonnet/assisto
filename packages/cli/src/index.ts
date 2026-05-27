import { mkdtemp, rm } from "node:fs/promises";
import { writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  buildSessionBrief,
  buildTodayWorkbenchResult,
  checkMemoryHealth,
  createCaptureNote,
  createHealthReviewTransaction,
  createImportNotes,
  previewCaptureNote,
  previewImportNotes,
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listMarkdownFiles,
  listReviewItems,
  parseTransactionMarkdown,
  readMarkdownPage,
  rejectTransaction,
  showReviewItem,
  toValidationDocument,
  transactionFilePaths,
  validateDocuments,
  validateTransaction,
  type FrontmatterValue,
  type ImportNotesResult,
  type ParsedTransaction,
  type ReviewActionState,
  type SessionBriefKind,
  type ValidationDocument,
  type ValidationResult
} from "@assisto/core";
import {
  createOpenAiExtractionProvider,
  ingestWithExtractionProvider,
  LlmExtractionProvider,
  type ExtractionProvider
} from "../../core/src/extraction";
import { reprocessEvent } from "../../core/src/ingest";
import { lintVault } from "../../core/src/lint";
import { retrieveContextForAnswer } from "../../core/src/retrieval";
import { startWorkbenchServer } from "@assisto/workbench";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin?: () => Promise<string>;
}

interface ParsedArgs {
  root: string;
  args: string[];
}

const transactionStates = ["pending", "applied", "rejected", "failed"] as const;

export async function main(
  argv: string[] = process.argv.slice(2),
  io: CliIo = defaultIo(),
  cwd = process.cwd()
): Promise<number> {
  try {
    const parsed = parseGlobalArgs(argv, cwd);
    const [command, ...rest] = parsed.args;

    if (!command || command === "--help" || command === "-h") {
      writeHelp(io.stdout);
      return 0;
    }

    if (command === "validate") {
      return await commandValidate(parsed.root, io);
    }

    if (command === "lint") {
      return await commandLint(parsed.root, io);
    }

    if (command === "tx") {
      return await commandTransaction(parsed.root, rest, io);
    }

    if (command === "ingest") {
      return await commandIngest(parsed.root, rest, io);
    }

    if (command === "capture") {
      return await commandCapture(parsed.root, rest, io, cwd);
    }

    if (command === "import") {
      return await commandImport(parsed.root, rest, io, cwd);
    }

    if (command === "today") {
      return await commandToday(parsed.root, rest, io);
    }

    if (command === "review") {
      return await commandReview(parsed.root, rest, io);
    }

    if (command === "events") {
      return await commandEvents(parsed.root, rest, io);
    }

    if (command === "ask") {
      return await commandAsk(parsed.root, rest, io);
    }

    if (command === "health") {
      return await commandHealth(parsed.root, rest, io);
    }

    if (command === "brief") {
      return await commandBrief(parsed.root, rest, io);
    }

    if (command === "workbench") {
      return await commandWorkbench(parsed.root, rest, io);
    }

    io.stderr(`Unknown command: ${command}\n\n`);
    writeHelp(io.stderr);
    return 1;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function commandValidate(root: string, io: CliIo): Promise<number> {
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

  const result = combineValidationResults([canonicalResult, ...transactionResults]);
  printValidationResult(result, io);

  return result.passed ? 0 : 1;
}

async function commandLint(root: string, io: CliIo): Promise<number> {
  const result = await lintVault(root);

  if (result.issues.length === 0) {
    io.stdout("No lint issues found.\n");
    return 0;
  }

  io.stdout(`Staged ${result.review_items.length} lint review item(s).\n`);

  for (const item of result.review_items) {
    io.stdout(`- ${item.issue.code}: ${item.path}\n`);
  }

  return 0;
}

async function commandTransaction(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand, id] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm tx <list|show|apply|reject> [id]\n");
    return 0;
  }

  if (subcommand === "list") {
    return await commandTransactionList(root, io);
  }

  if (!id) {
    throw new Error(`wm tx ${subcommand} requires a transaction id.`);
  }

  if (subcommand === "show") {
    const found = await findTransaction(root, id);

    if (!found) {
      throw new Error(`Transaction not found: ${id}`);
    }

    io.stdout(found.content);
    return 0;
  }

  if (subcommand === "apply") {
    await applyTransaction(root, id);
    io.stdout(`Applied transaction ${id}\n`);
    return 0;
  }

  if (subcommand === "reject") {
    const reason = optionValue(args.slice(2), "--reason");

    if (!reason) {
      throw new Error("wm tx reject requires --reason <text>.");
    }

    await rejectTransaction(root, id, reason);
    io.stdout(`Rejected transaction ${id}: ${reason}\n`);
    return 0;
  }

  throw new Error(`Unknown tx subcommand: ${subcommand}`);
}

async function commandTransactionList(root: string, io: CliIo): Promise<number> {
  const files = await listVaultMarkdownFiles(root, "memory/transactions/**/*.md");

  if (files.length === 0) {
    io.stdout("No transactions found.\n");
    return 0;
  }

  for (const file of files) {
    const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));
    io.stdout(
      `${transaction.id}\t${transaction.transaction_state}\t${file}\t${transaction.operations
        .map((operation) => operation.operation)
        .join(",")}\n`
    );
  }

  return 0;
}

async function commandIngest(root: string, args: string[], io: CliIo): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const providerName = optionValue(args, "--provider") ?? "rule";
  const note = args
    .filter((arg, index) => arg !== "--dry-run" && arg !== "--provider" && args[index - 1] !== "--provider")
    .join(" ")
    .trim();

  if (!note) {
    throw new Error('wm ingest requires a note, for example: wm ingest "Joe is the DBA"');
  }

  if (dryRun) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "wm-dry-run-"));

    try {
      const result = await ingestWithExtractionProvider(tempRoot, note, {
        provider: extractionProviderFromName(providerName, {
          allowLlmStub: true,
          command: "wm ingest"
        })
      });
      const transaction = await readMarkdownPage(tempRoot, result.transaction_path);
      io.stdout(`Dry run. No changes written to ${root}.\n`);
      io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
      io.stdout(`Transaction: ${result.transaction_id} (${result.transaction_path})\n\n`);
      io.stdout(transaction);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }

    return 0;
  }

  const result = await ingestWithExtractionProvider(root, note, {
    provider: extractionProviderFromName(providerName, {
      allowLlmStub: true,
      command: "wm ingest"
    })
  });
  io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(
    `${dryRun ? "Proposed transaction" : "Pending transaction"}: ${result.transaction_id} (${result.transaction_path})\n`
  );

  if (result.staged_review_paths.length > 0) {
    io.stdout(`Staged review proposals: ${result.staged_review_paths.join(", ")}\n`);
  }

  return 0;
}

async function commandCapture(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const note = await captureNoteFromArgs(args, io, cwd);
  const provider = captureProvider(optionValue(args, "--provider") ?? "rule");
  const options = {
    observed_at: optionValue(args, "--observed-at") ?? undefined,
    source_label: optionValue(args, "--source-label") ?? undefined,
    context: optionValue(args, "--context") ?? undefined,
    provider
  };
  const result = dryRun
    ? await previewCaptureNote(root, note, options)
    : await createCaptureNote(root, note, options);

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending transaction: ${result.transaction_id} (${result.transaction_path})\n`);
  io.stdout(`Provider: ${result.provider_name}\n`);
  io.stdout(`Validation: ${result.validation.passed ? "passed" : "failed"}\n`);

  if (result.operations.length > 0) {
    io.stdout(`Operations: ${result.operations.join(", ")}\n`);
  }

  if (result.affected_files.length > 0) {
    io.stdout(`Affected files: ${result.affected_files.join(", ")}\n`);
  }

  if (result.staged_review_paths.length > 0) {
    io.stdout(`Staged review proposals: ${result.staged_review_paths.join(", ")}\n`);
  }

  if (result.proposed_file_writes.length > 0) {
    io.stdout(`Proposed file writes: ${result.proposed_file_writes.map((write) => write.path).join(", ")}\n`);
  }

  return result.validation.passed ? 0 : 1;
}

async function commandImport(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const [subcommand] = args;

  if (subcommand !== "notes") {
    throw new Error(
      'Usage: wm import notes (--path <file-or-dir> | --stdin) [--glob "*.md,*.txt"] [--provider rule|openai] [--limit <n>] [--dry-run]'
    );
  }

  const dryRun = args.includes("--dry-run");
  const fromPath = optionValue(args, "--path");
  const fromStdin = args.includes("--stdin");

  if (fromPath && fromStdin) {
    throw new Error("wm import notes accepts either --path or --stdin, not both.");
  }

  if (!fromPath && !fromStdin) {
    throw new Error("wm import notes requires --path <file-or-dir> or --stdin.");
  }

  const options = {
    observed_at: optionValue(args, "--observed-at") ?? undefined,
    source_label: optionValue(args, "--source-label") ?? undefined,
    provider: captureProvider(optionValue(args, "--provider") ?? "rule"),
    limit: parseOptionalPositiveInt(optionValue(args, "--limit"), "--limit")
  };
  const input = fromStdin
    ? {
        text: io.stdin ? await io.stdin() : await readProcessStdin(),
        cwd
      }
    : {
        path: fromPath ?? undefined,
        glob: optionValue(args, "--glob") ?? undefined,
        cwd
      };
  const result = dryRun
    ? await previewImportNotes(root, input, options)
    : await createImportNotes(root, input, options);

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  printImportResult(result, io);
  return importValidationPassed(result) ? 0 : 1;
}

async function commandToday(root: string, args: string[], io: CliIo): Promise<number> {
  const today = await buildTodayWorkbenchResult(root);

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(today, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Today (${today.generated_at})\n`);
  io.stdout(`Daily review: ${today.daily_review_complete ? "complete" : "needs attention"}\n\n`);
  io.stdout("Counts\n");

  for (const [key, value] of Object.entries(today.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  if (today.pending_transactions.length > 0) {
    io.stdout("\nPending transactions\n");
    for (const transaction of today.pending_transactions) {
      io.stdout(`- ${transaction.id} [${transaction.operations.join(",") || "NOOP"}] ${transaction.path}\n`);
    }
  }

  if (today.staged_review_groups.length > 0) {
    io.stdout("\nStaged reviews\n");
    for (const group of today.staged_review_groups) {
      io.stdout(`- ${group.review_reason}: ${group.count} (${group.suggested_action})\n`);
    }
  }

  if (today.stale_noop_events.length > 0) {
    io.stdout("\nStale NOOP Events\n");
    for (const event of today.stale_noop_events) {
      io.stdout(`- ${event.event_id}${event.transaction_id ? ` via ${event.transaction_id}` : ""}\n`);
    }
  }

  if (today.open_followups.length > 0) {
    io.stdout("\nOpen follow-ups\n");
    for (const followup of today.open_followups) {
      io.stdout(`- ${followup.id}${followup.due_at ? ` due ${followup.due_at}` : ""} ${followup.path}\n`);
    }
  }

  if (today.suggested_manual_actions.length > 0) {
    io.stdout("\nSuggested manual actions\n");
    for (const action of today.suggested_manual_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  return 0;
}

async function commandReview(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand, idOrPath] = args;

  if (!subcommand || subcommand === "inbox" || subcommand === "list") {
    const includeAll = args.includes("--all");
    const items = await listReviewItems(root, includeAll);

    if (items.length === 0) {
      io.stdout(includeAll ? "No review items.\n" : "No staged review items.\n");
      return 0;
    }

    io.stdout(includeAll ? "Review items:\n" : "Staged review items:\n");

    for (const item of items) {
      io.stdout(`- ${item.id} [${item.review_reason}] ${item.review_state} ${item.path}\n`);
    }

    return 0;
  }

  if (subcommand === "show") {
    if (!idOrPath) {
      throw new Error("wm review show requires a review id or path.");
    }

    const item = await showReviewItem(root, idOrPath);
    io.stdout(item.content);
    return 0;
  }

  if (subcommand === "apply-staged") {
    if (!idOrPath) {
      throw new Error(
        'Usage: wm review apply-staged <id|path> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note <text>]'
      );
    }

    const target = optionValue(args, "--target");

    if (!target) {
      throw new Error("wm review apply-staged requires --target <id|path>.");
    }

    const result = await createReviewApplyTransaction(root, idOrPath, {
      target,
      context: optionValue(args, "--context") ?? undefined,
      createContext: optionValue(args, "--create-context") ?? undefined,
      supersede: optionValue(args, "--supersede") ?? undefined,
      note: optionValue(args, "--note") ?? undefined
    });
    io.stdout(`Pending review apply transaction: ${result.transaction_id} (${result.transaction_path})\n`);
    io.stdout(`Review item: ${result.review_id} (${result.review_path})\n`);
    return 0;
  }

  if (subcommand === "mark" || isReviewActionState(subcommand)) {
    const target = subcommand === "mark" ? idOrPath : idOrPath;
    const state = subcommand === "mark" ? optionValue(args, "--state") : subcommand;
    const note = optionValue(args, "--note") ?? undefined;

    if (!target || !state || !isReviewActionState(state)) {
      throw new Error("Usage: wm review mark <id|path> --state <reviewed|contested|archived> [--note <text>]");
    }

    const result = await createReviewStateTransaction(root, target, state, { note });
    io.stdout(`Pending review transaction: ${result.transaction_id} (${result.transaction_path})\n`);
    io.stdout(`Review item: ${result.review_id} (${result.review_path})\n`);
    return 0;
  }

  throw new Error(
    "Usage: wm review <list|inbox|show|mark|apply-staged|reviewed|contested|archived> [id|path] [--state <state>] [--note <text>]"
  );
}

async function commandEvents(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand, idOrPath] = args;

  if (subcommand !== "reprocess" || !idOrPath || !args.includes("--stage-only")) {
    throw new Error("Usage: wm events reprocess <event-id|path> --stage-only");
  }

  const result = await reprocessEvent(root, idOrPath);

  io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending reprocess transaction: ${result.transaction_id} (${result.transaction_path})\n`);

  if (result.staged_review_paths.length > 0) {
    io.stdout(`Staged review proposals: ${result.staged_review_paths.join(", ")}\n`);
  }

  return 0;
}

async function commandAsk(root: string, args: string[], io: CliIo): Promise<number> {
  const packContextQuestion = optionValue(args, "--pack-context");
  const answerBasisQuestion = optionValue(args, "--answer-basis");

  if (packContextQuestion && answerBasisQuestion) {
    throw new Error('Usage: wm ask --pack-context "<question>" | --answer-basis "<question>"');
  }

  const question = packContextQuestion ?? answerBasisQuestion;

  if (!question) {
    throw new Error('Usage: wm ask --pack-context "<question>" | --answer-basis "<question>"');
  }

  const result = await retrieveContextForAnswer(root, question);
  io.stdout(answerBasisQuestion ? `${JSON.stringify(result, null, 2)}\n` : result.contextPack);

  return 0;
}

async function commandHealth(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm health check [--stage-review] [--note <text>]\n");
    return 0;
  }

  if (subcommand !== "check") {
    throw new Error("Usage: wm health check [--stage-review] [--note <text>]");
  }

  const health = await checkMemoryHealth(root);

  io.stdout("Memory health\n");
  for (const [key, value] of Object.entries(health.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  if (health.review_reasons.length > 0) {
    io.stdout("\nReview reasons\n");
    for (const reason of health.review_reasons) {
      io.stdout(`${reason.review_reason}\t${reason.count}\n`);
    }
  }

  if (health.suggested_actions.length > 0) {
    io.stdout("\nSuggested manual actions\n");
    for (const action of health.suggested_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  if (health.warnings.length > 0) {
    io.stdout("\nWarnings\n");
    for (const warning of health.warnings) {
      io.stdout(`- ${warning}\n`);
    }
  }

  if (args.includes("--stage-review")) {
    const staged = await createHealthReviewTransaction(root, health, {
      note: optionValue(args, "--note") ?? undefined
    });
    io.stdout(`\nPending health review transaction: ${staged.transaction_id} (${staged.transaction_path})\n`);
    io.stdout(`Review proposals: ${staged.review_paths.join(", ")}\n`);
  }

  return 0;
}

async function commandBrief(root: string, args: string[], io: CliIo): Promise<number> {
  const [rawKind] = args;

  if (!rawKind || rawKind === "--help" || rawKind === "-h") {
    io.stdout("Usage: wm brief <today|person|context|review|followups|recent> [id|path]\n");
    io.stdout("       wm brief recent [person|context] [id|path]\n");
    return 0;
  }

  const kind = parseBriefKind(rawKind);
  const briefOptions = parseBriefOptions(kind, args.slice(1));
  const result = await buildSessionBrief(root, briefOptions);
  io.stdout(result.contextPack);

  return 0;
}

async function commandWorkbench(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm workbench serve [--host 127.0.0.1] [--port 3721]\n");
    return 0;
  }

  if (subcommand !== "serve") {
    throw new Error("Usage: wm workbench serve [--host 127.0.0.1] [--port 3721]");
  }

  const host = optionValue(args, "--host") ?? "127.0.0.1";
  const port = parsePort(optionValue(args, "--port") ?? "3721");
  const running = await startWorkbenchServer({ root, host, port });

  io.stdout(`Assisto Workbench listening at ${running.url}\n`);
  io.stdout("Press Ctrl+C to stop.\n");

  return 0;
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

function parseGlobalArgs(argv: string[], cwd: string): ParsedArgs {
  const args: string[] = [];
  let root = cwd;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--root" || arg === "--vault-root") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error(`${arg} requires a path.`);
      }

      root = path.resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg) {
      args.push(arg);
    }
  }

  return { root, args };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function captureNoteFromArgs(args: string[], io: CliIo, cwd: string): Promise<string> {
  const fromFile = optionValue(args, "--file");
  const fromStdin = args.includes("--stdin");

  if (fromFile && fromStdin) {
    throw new Error("wm capture accepts either --file or --stdin, not both.");
  }

  if (fromFile) {
    return readFile(path.resolve(cwd, fromFile), "utf8");
  }

  if (fromStdin) {
    return io.stdin ? io.stdin() : readProcessStdin();
  }

  const note = positionalCaptureArgs(args).join(" ").trim();

  if (!note) {
    throw new Error(
      'wm capture requires a note, --stdin, or --file <path>, for example: wm capture "Joe is the DBA"'
    );
  }

  return note;
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function positionalCaptureArgs(args: string[]): string[] {
  const valueOptions = new Set(["--file", "--observed-at", "--source-label", "--context", "--provider"]);
  const booleanOptions = new Set(["--stdin", "--dry-run"]);
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }

    if (booleanOptions.has(arg)) {
      continue;
    }

    values.push(arg);
  }

  return values;
}

function captureProvider(name: string): ExtractionProvider | undefined {
  return extractionProviderFromName(name, {
    allowLlmStub: false,
    command: "wm capture"
  });
}

function extractionProviderFromName(
  name: string,
  options: { allowLlmStub: boolean; command: string }
): ExtractionProvider | undefined {
  if (name === "rule") {
    return undefined;
  }

  if (name === "openai") {
    return createOpenAiExtractionProvider();
  }

  if (options.allowLlmStub && name === "llm-stub") {
    return new LlmExtractionProvider();
  }

  throw new Error(
    `${options.command} provider must be ${options.allowLlmStub ? "rule, llm-stub, or openai" : "rule or openai"}.`
  );
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

function parseOptionalPositiveInt(value: string | null, optionName: string): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

function parseBriefKind(value: string): SessionBriefKind {
  if (value === "today" || value === "person" || value === "context" || value === "review" || value === "followups" || value === "recent") {
    return value;
  }

  throw new Error("Usage: wm brief <today|person|context|review|followups|recent> [id|path]");
}

function parseBriefOptions(kind: SessionBriefKind, args: string[]): { kind: SessionBriefKind; targetKind?: "person" | "context"; target?: string } {
  if (kind !== "recent") {
    return { kind, target: args[0] };
  }

  const [targetKind, target] = args;

  if (!targetKind) {
    return { kind };
  }

  if (targetKind !== "person" && targetKind !== "context") {
    throw new Error("Usage: wm brief recent [person|context] [id|path]");
  }

  return { kind, targetKind, target };
}

function printImportResult(result: ImportNotesResult, io: CliIo): void {
  io.stdout(`Import units: ${result.units_total}\n`);
  io.stdout(`Imported: ${result.units_imported}\n`);
  io.stdout(`Skipped: ${result.units_skipped}\n`);
  io.stdout(`Provider: ${result.provider_name}\n`);

  for (const unit of result.units) {
    if (unit.skipped) {
      io.stdout(
        `Skipped duplicate source_hash: ${unit.source_hash}${
          unit.existing_event_id ? ` (${unit.existing_event_id} ${unit.existing_event_path})` : ""
        }\n`
      );
      continue;
    }

    io.stdout(`Event: ${unit.event_id} (${unit.event_path})\n`);
    io.stdout(`Pending transaction: ${unit.transaction_id} (${unit.transaction_path})\n`);
    io.stdout(`Validation: ${unit.validation?.passed ? "passed" : "failed"}\n`);

    if (unit.staged_review_paths.length > 0) {
      io.stdout(`Staged review proposals: ${unit.staged_review_paths.join(", ")}\n`);
    }
  }
}

function importValidationPassed(result: ImportNotesResult): boolean {
  return result.units.every((unit) => unit.skipped || unit.validation?.passed === true);
}

function printValidationResult(result: ValidationResult, io: CliIo): void {
  if (result.passed) {
    io.stdout("Validation passed.\n");
    return;
  }

  io.stdout(`Validation failed with ${result.errors.length} error(s).\n`);

  for (const error of result.errors) {
    io.stdout(
      `ERROR ${error.code}${error.path ? ` ${error.path}` : ""}${error.id ? ` ${error.id}` : ""}: ${
        error.message
      }\n`
    );
  }
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

function eventIds(documents: ValidationDocument[]): string[] {
  return documents
    .filter((document) => document.frontmatter.type === "event")
    .map((document) => stringValue(document.frontmatter.id))
    .filter((id): id is string => Boolean(id));
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isReviewActionState(value: string | null | undefined): value is ReviewActionState {
  return value === "reviewed" || value === "contested" || value === "archived";
}

function writeHelp(write: (text: string) => void): void {
  write(
    [
      "wm - local markdown work-memory MVP",
      "",
      "Usage:",
      "  wm [--root <path>] validate",
      "  wm [--root <path>] lint",
      "  wm [--root <path>] tx list",
      "  wm [--root <path>] tx show <id>",
      "  wm [--root <path>] tx apply <id>",
      "  wm [--root <path>] tx reject <id> --reason <text>",
      '  wm [--root <path>] ingest [--dry-run] [--provider rule|llm-stub|openai] "<note>"',
      '  wm [--root <path>] capture [--stdin|--file <path>] [--observed-at <date>] [--source-label <text>] [--context <id|path|name>] [--provider rule|openai] [--dry-run] "<note>"',
      '  wm [--root <path>] import notes (--path <file-or-dir> | --stdin) [--glob "*.md,*.txt"] [--provider rule|openai] [--limit <n>] [--dry-run]',
      "  wm [--root <path>] today [--json]",
      '  wm [--root <path>] review list [--all]',
      "  wm [--root <path>] review show <id|path>",
      "  wm [--root <path>] review mark <id|path> --state <reviewed|contested|archived> [--note <text>]",
      '  wm [--root <path>] review apply-staged <id|path> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note <text>]',
      "  wm [--root <path>] events reprocess <event-id|path> --stage-only",
      '  wm [--root <path>] ask --pack-context "<question>"',
      '  wm [--root <path>] ask --answer-basis "<question>"',
      "  wm [--root <path>] health check [--stage-review] [--note <text>]",
      "  wm [--root <path>] brief <today|person|context|review|followups|recent> [id|path]",
      "  wm [--root <path>] brief recent [person|context] [id|path]",
      "  wm [--root <path>] workbench serve [--host 127.0.0.1] [--port 3721]",
      ""
    ].join("\n")
  );
}

function defaultIo(): CliIo {
  return {
    stdout: (text) => writeSync(1, text),
    stderr: (text) => writeSync(2, text)
  };
}
