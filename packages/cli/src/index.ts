import { mkdtemp, rm } from "node:fs/promises";
import { writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  checkMemoryHealth,
  createHealthReviewTransaction,
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
  type ParsedTransaction,
  type ReviewActionState,
  type ValidationDocument,
  type ValidationResult
} from "@assisto/core";
import { ingestWithExtractionProvider, LlmExtractionProvider } from "../../core/src/extraction";
import { reprocessEvent } from "../../core/src/ingest";
import { lintVault } from "../../core/src/lint";
import { retrieveContextForAnswer } from "../../core/src/retrieval";
import { startWorkbenchServer } from "@assisto/workbench";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
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
        provider: providerName === "llm-stub" ? new LlmExtractionProvider() : undefined
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
    provider: providerName === "llm-stub" ? new LlmExtractionProvider() : undefined
  });
  io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending transaction: ${result.transaction_id} (${result.transaction_path})\n`);

  if (result.staged_review_paths.length > 0) {
    io.stdout(`Staged review proposals: ${result.staged_review_paths.join(", ")}\n`);
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

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
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
      '  wm [--root <path>] ingest [--dry-run] [--provider rule|llm-stub] "<note>"',
      '  wm [--root <path>] review list [--all]',
      "  wm [--root <path>] review show <id|path>",
      "  wm [--root <path>] review mark <id|path> --state <reviewed|contested|archived> [--note <text>]",
      '  wm [--root <path>] review apply-staged <id|path> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note <text>]',
      "  wm [--root <path>] events reprocess <event-id|path> --stage-only",
      '  wm [--root <path>] ask --pack-context "<question>"',
      '  wm [--root <path>] ask --answer-basis "<question>"',
      "  wm [--root <path>] health check [--stage-review] [--note <text>]",
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
