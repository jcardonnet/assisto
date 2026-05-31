import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  applyTransaction,
  buildActivationStatusResult,
  buildDailyQueueResult,
  buildDogfoodHomeResult,
  buildContextDashboardResult,
  buildContextOperatingRoomResult,
  buildContextTimelineResult,
  buildEntityStewardshipResult,
  buildImportAssistantResult,
  buildUseAssistoTomorrowResult,
  createCaptureFeedback,
  buildWorkdayModeResult,
  readDailySession,
  runPersonalDogfoodEval,
  buildSessionBrief,
  buildTodayWorkbenchResult,
  checkMemoryHealth,
  createCaptureNote,
  createHealthReviewTransaction,
  createFrictionLog,
  createImportNotes,
  createSeedKit,
  createSourceAdapterImport,
  createWorkdayCapture,
  listWorkdayCapturePresets,
  previewCaptureNote,
  previewWorkdayCapture,
  previewCaptureFeedback,
  previewFrictionLog,
  previewImportNotes,
  previewSeedKit,
  previewSourceAdapterImport,
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
  type ImportAssistantResult,
  type ImportNotesResult,
  type ParsedTransaction,
  type ReviewActionState,
  type SeedKitInput,
  type SeedKitResult,
  type SourceAdapterCreateResult,
  type SourceAdapterKind,
  type SourceAdapterPreviewResult,
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
import { previewAnswerDraft, retrieveCitedAnswerContract, retrieveContextForAnswer } from "../../core/src/retrieval";
import { startWorkbenchServer } from "@assisto/workbench";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin?: () => Promise<string>;
  now?: string;
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

    if (command === "source") {
      return await commandSource(parsed.root, rest, io, cwd);
    }

    if (command === "seed") {
      return await commandSeed(parsed.root, rest, io, cwd);
    }

    if (command === "today") {
      return await commandToday(parsed.root, rest, io);
    }

    if (command === "daily") {
      return await commandDaily(parsed.root, rest, io);
    }

    if (command === "mode") {
      return await commandMode(parsed.root, rest, io);
    }

    if (command === "context") {
      return await commandContext(parsed.root, rest, io);
    }

    if (command === "entities") {
      return await commandEntities(parsed.root, rest, io);
    }

    if (command === "activate") {
      return await commandActivate(parsed.root, rest, io);
    }

    if (command === "use-tomorrow") {
      return await commandUseTomorrow(parsed.root, rest, io);
    }

    if (command === "dogfood") {
      return await commandDogfood(parsed.root, rest, io);
    }

    if (command === "doctor") {
      return await commandDoctor(parsed.root, rest, io, cwd);
    }

    if (command === "friction") {
      return await commandFriction(parsed.root, rest, io);
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
  if (args[0] === "feedback") {
    return await commandCaptureFeedback(root, args.slice(1), io);
  }

  if (args[0] === "presets") {
    return await commandCapturePresets(root, args.slice(1), io);
  }

  if (args[0] === "quick") {
    return await commandCaptureQuick(root, args.slice(1), io, cwd);
  }

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

async function commandCapturePresets(root: string, args: string[], io: CliIo): Promise<number> {
  if (args.some((arg) => arg !== "--json")) {
    throw new Error("Usage: wm capture presets [--json]");
  }

  const presets = await listWorkdayCapturePresets(root);

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(presets, null, 2)}\n`);
    return 0;
  }

  for (const preset of presets) {
    io.stdout(`${preset.preset_id}: ${preset.label} (${preset.source_label})\n`);
  }

  return 0;
}

async function commandCaptureQuick(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const create = args.includes("--create");
  const json = args.includes("--json");
  const providerName = optionValue(args, "--provider") ?? "rule";
  const note = await captureNoteFromArgs(args, io, cwd);
  const input = {
    preset_id: optionValue(args, "--preset") ?? undefined,
    note,
    observed_at: optionValue(args, "--observed-at") ?? undefined,
    source_label: optionValue(args, "--source-label") ?? undefined,
    context: optionValue(args, "--context") ?? undefined,
    provider: providerName === "openai" ? ("openai" as const) : ("rule" as const),
    extractionProvider: captureProvider(providerName)
  };
  const result = create ? await createWorkdayCapture(root, input) : await previewWorkdayCapture(root, input);

  if (json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return result.validation.passed ? 0 : 1;
  }

  if (!create) {
    io.stdout(`Preview only. No changes written to ${root}.\n`);
  }

  io.stdout(`Preset: ${result.preset?.preset_id ?? "quick-note"}\n`);
  io.stdout(`Event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending transaction: ${result.transaction_id} (${result.transaction_path})\n`);
  io.stdout(`Provider: ${result.provider_name}\n`);
  io.stdout(`Validation: ${result.validation.passed ? "passed" : "failed"}\n`);

  if (result.pending_transaction_preview.affected_files.length > 0) {
    io.stdout(`Affected files: ${result.pending_transaction_preview.affected_files.join(", ")}\n`);
  }

  if (result.likely_reviews.length > 0) {
    io.stdout(`Likely reviews: ${result.likely_reviews.join(", ")}\n`);
  }

  return result.validation.passed ? 0 : 1;
}

async function commandCaptureFeedback(root: string, args: string[], io: CliIo): Promise<number> {
  const kind = optionValue(args, "--kind");
  const note = optionValue(args, "--note");
  const dryRun = args.includes("--dry-run");

  if (!kind || !note) {
    throw new Error(
      'Usage: wm capture feedback --kind <wrong_person|missing_context|bad_followup|bad_role_reporting|other_extraction_issue> --note "<text>" [--event <id|path>] [--transaction <id|path>] [--dry-run]'
    );
  }

  const result = dryRun
    ? await previewCaptureFeedback(root, {
        kind,
        note,
        event: optionValue(args, "--event") ?? undefined,
        transaction: optionValue(args, "--transaction") ?? undefined
      })
    : await createCaptureFeedback(root, {
        kind,
        note,
        event: optionValue(args, "--event") ?? undefined,
        transaction: optionValue(args, "--transaction") ?? undefined
      });

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  io.stdout(`Capture feedback event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending capture feedback transaction: ${result.transaction_id} (${result.transaction_path})\n`);
  io.stdout(`Kind: ${result.kind}\n`);
  io.stdout(`Validation: ${result.validation.passed ? "passed" : "failed"}\n`);
  io.stdout(`Operations: ${result.operations.join(", ") || "NOOP"}\n`);

  if (result.linked_event) {
    io.stdout(`Linked Event: ${result.linked_event}\n`);
  }

  if (result.linked_transaction) {
    io.stdout(`Linked Transaction: ${result.linked_transaction}\n`);
  }

  return result.validation.passed ? 0 : 1;
}

async function commandImport(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const [subcommand] = args;

  if (subcommand === "assistant") {
    if (args.some((arg, index) => index > 0 && !["--json"].includes(arg))) {
      throw new Error("Usage: wm import assistant [--json]");
    }

    const result = await buildImportAssistantResult(root, { now: io.now });

    if (args.includes("--json")) {
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    printImportAssistantResult(result, io);
    return 0;
  }

  if (subcommand !== "notes") {
    throw new Error(
      'Usage: wm import <assistant|notes> [--json] | wm import notes (--path <file-or-dir> | --stdin) [--glob "*.md,*.txt"] [--provider rule|openai] [--limit <n>] [--dry-run]'
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

async function commandSource(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const [subcommand] = args;

  if (subcommand !== "import") {
    throw new Error("Usage: wm source import --kind <markdown|text|email|calendar|chat> (--path <file> | --stdin) [--source-label <text>] [--observed-at <date>] [--context <id|path|name>] [--limit <n>] [--dry-run] [--json]");
  }

  const kind = parseSourceAdapterKind(optionValue(args, "--kind"));
  const fromPath = optionValue(args, "--path");
  const fromStdin = args.includes("--stdin");
  const dryRun = args.includes("--dry-run");

  if (fromPath && fromStdin) {
    throw new Error("wm source import accepts either --path or --stdin, not both.");
  }

  if (!fromPath && !fromStdin) {
    throw new Error("wm source import requires --path <file> or --stdin.");
  }

  const input = {
    kind,
    root,
    path: fromPath ? path.resolve(cwd, fromPath) : undefined,
    rawText: fromStdin ? (io.stdin ? await io.stdin() : await readProcessStdin()) : undefined,
    source_label: optionValue(args, "--source-label") ?? undefined,
    observed_at: optionValue(args, "--observed-at") ?? undefined,
    context: optionValue(args, "--context") ?? undefined,
    limit: parseOptionalPositiveInt(optionValue(args, "--limit"), "--limit"),
    dryRun
  };
  const result = dryRun ? await previewSourceAdapterImport(input) : await createSourceAdapterImport(input);

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  printSourceAdapterResult(result, io);
  return 0;
}

async function commandSeed(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm seed kit --file <json|md> [--dry-run]\n");
    return 0;
  }

  if (subcommand !== "kit") {
    throw new Error("Usage: wm seed kit --file <json|md> [--dry-run]");
  }

  const fromFile = optionValue(args, "--file");

  if (!fromFile) {
    throw new Error("wm seed kit requires --file <json|md>.");
  }

  const dryRun = args.includes("--dry-run");
  const input = parseSeedKitFile(await readFile(path.resolve(cwd, fromFile), "utf8"), fromFile);
  const result = dryRun ? await previewSeedKit(root, input, { now: io.now }) : await createSeedKit(root, input, { now: io.now });

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  printSeedKitResult(result, io);
  return result.validation.passed ? 0 : 1;
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

async function commandDaily(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm daily <queue|session> [--json]\n");
    return 0;
  }

  if (subcommand === "session") {
    if (args.some((arg, index) => index > 0 && !["--json"].includes(arg))) {
      throw new Error("Usage: wm daily session [--json]");
    }

    const session = await readDailySession(root, { now: io.now });

    if (args.includes("--json")) {
      io.stdout(`${JSON.stringify(session, null, 2)}\n`);
      return 0;
    }

    io.stdout(`Daily session (${session.generated_at})\n`);
    io.stdout(`State: ${session.exists ? "saved" : "empty"}\n`);
    io.stdout(`Path: ${session.path}\n\n`);
    io.stdout("Session\n");
    io.stdout(`dismissed_prompts\t${session.state.dismissed_prompts.length}\n`);
    io.stdout(`pinned_daily_questions\t${session.state.pinned_daily_questions.length}\n`);
    io.stdout(`last_selected_mode\t${session.state.last_selected_mode ?? ""}\n`);
    io.stdout(`last_completed_derived_step\t${session.state.last_completed_derived_step ?? ""}\n`);
    return 0;
  }

  if (subcommand !== "queue") {
    throw new Error("Usage: wm daily <queue|session> [--json]");
  }

  const queue = await buildDailyQueueResult(root);

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(queue, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Daily queue (${queue.generated_at})\n`);
  io.stdout(`State: ${queue.queue_complete ? "complete" : "needs action"}\n`);

  if (queue.current_item) {
    io.stdout(
      `Current: ${queue.current_item.label} (${queue.current_item.target_id}) - ${queue.current_item.suggested_action}\n\n`
    );
  } else {
    io.stdout("Current: no pending daily queue item\n\n");
  }

  io.stdout("Counts\n");
  for (const [key, value] of Object.entries(queue.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  if (queue.items.length > 0) {
    io.stdout("\nQueue\n");
    for (const item of queue.items) {
      io.stdout(`- ${item.item_type}\t${item.target_id}\t${item.label}\n`);
    }
  }

  if (queue.warnings.length > 0) {
    io.stdout("\nWarnings\n");
    for (const warning of queue.warnings) {
      io.stdout(`- ${warning}\n`);
    }
  }

  return 0;
}

async function commandUseTomorrow(root: string, args: string[], io: CliIo): Promise<number> {
  if (args.some((arg) => !["--json", "--help", "-h"].includes(arg))) {
    throw new Error("Usage: wm use-tomorrow [--json]");
  }

  if (args.includes("--help") || args.includes("-h")) {
    io.stdout("Usage: wm use-tomorrow [--json]\n");
    return 0;
  }

  const result = await buildUseAssistoTomorrowResult(root, { now: io.now });

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Use Assisto Tomorrow (${result.generated_at})\n`);
  io.stdout(`State: ${result.memory_state}${result.complete ? " (complete)" : " (in progress)"}\n`);
  io.stdout(`Next step: ${result.next_step.label}\n`);
  io.stdout(`Next action: ${result.next_step.detail}\n\n`);
  io.stdout("Counts\n");

  for (const [key, value] of Object.entries(result.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  io.stdout("\nSteps\n");
  for (const step of result.steps) {
    io.stdout(`- ${step.state}\t${step.step_id}\t${step.label}\n`);
  }

  if (result.suggested_actions.length > 0) {
    io.stdout("\nSuggested actions\n");
    for (const action of result.suggested_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  if (result.warnings.length > 0) {
    io.stdout("\nWarnings\n");
    for (const warning of result.warnings) {
      io.stdout(`- ${warning}\n`);
    }
  }

  return 0;
}

async function commandMode(root: string, args: string[], io: CliIo): Promise<number> {
  const [mode, ...rest] = args;

  if (!mode || mode === "--help" || mode === "-h") {
    io.stdout("Usage: wm mode <morning|end-day|meeting|after-meeting> [id|path] [--json]\n");
    return 0;
  }

  if (mode !== "morning" && mode !== "end-day" && mode !== "meeting" && mode !== "after-meeting") {
    throw new Error("Usage: wm mode <morning|end-day|meeting|after-meeting> [id|path] [--json]");
  }

  const json = rest.includes("--json");
  const positional = rest.filter((arg) => arg !== "--json");

  if ((mode === "meeting" || mode === "after-meeting") && positional.length !== 1) {
    throw new Error(`Usage: wm mode ${mode} <id|path> [--json]`);
  }

  if ((mode === "morning" || mode === "end-day") && positional.length > 0) {
    throw new Error("Usage: wm mode <morning|end-day> [--json]");
  }

  if (rest.filter((arg) => arg === "--json").length > 1) {
    throw new Error("Usage: wm mode <morning|end-day|meeting|after-meeting> [id|path] [--json]");
  }

  const result = await buildWorkdayModeResult(root, mode, { now: io.now, target: positional[0] });

  if (json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Workday mode: ${result.title} (${result.generated_at})\n`);
  if (result.target) {
    io.stdout(`Target: ${result.target.name}\n`);
  }
  io.stdout(`${result.summary}\n`);
  io.stdout(`Next queue item: ${result.next_queue_item?.label ?? "none"}\n`);
  io.stdout(`Pinned questions: ${result.pinned_questions.length}\n`);
  io.stdout(`Open follow-ups: ${result.open_followups.length}\n`);
  io.stdout(`Unresolved transactions: ${result.unresolved_transactions.length}\n`);
  io.stdout(`Logged misses: ${result.logged_misses.length}\n`);
  io.stdout(`Health warnings: ${result.health_warnings.length}\n`);

  if (result.suggested_captures.length > 0) {
    io.stdout("\nSuggested captures\n");
    for (const capture of result.suggested_captures) {
      io.stdout(`- ${capture}\n`);
    }
  }

  return 0;
}

async function commandContext(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand, target, ...rest] = args;
  const usage = "Usage: wm context <dashboard|operating-room|timeline> <id|path> [--json]";

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout(`${usage}\n`);
    return 0;
  }

  if ((subcommand !== "dashboard" && subcommand !== "operating-room" && subcommand !== "timeline") || !target) {
    throw new Error(usage);
  }

  if (rest.some((arg) => arg !== "--json") || rest.filter((arg) => arg === "--json").length > 1) {
    throw new Error(usage);
  }

  if (subcommand === "operating-room") {
    const result = await buildContextOperatingRoomResult(root, target, { now: io.now });

    if (rest.includes("--json")) {
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    io.stdout(`Context operating room: ${result.context.name} (${result.generated_at})\n`);
    io.stdout(`Current facts: ${result.currentState.length}\n`);
    io.stdout(`Owners: ${result.owners.length}\n`);
    io.stdout(`Systems: ${result.systems.length}\n`);
    io.stdout(`Decisions: ${result.decisions.length}\n`);
    io.stdout(`Open questions: ${result.openQuestions.length}\n`);
    io.stdout(`Risks: ${result.risks.length}\n`);
    io.stdout(`Open follow-ups: ${result.followupQueue.length}\n`);
    io.stdout(`Review items: ${result.reviewQueue.length}\n`);

    if (result.quickActions.length > 0) {
      io.stdout("\nQuick actions\n");
      for (const action of result.quickActions) {
        io.stdout(`- ${action.label}\n`);
      }
    }

    return 0;
  }

  if (subcommand === "timeline") {
    const result = await buildContextTimelineResult(root, target, { now: io.now });

    if (rest.includes("--json")) {
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    io.stdout(`Context timeline: ${result.context.name} (${result.generated_at})\n`);
    io.stdout(`Timeline items: ${result.items.length}\n`);
    io.stdout(`Claim citations: ${result.citations.claim_ids.length}\n`);
    io.stdout(`Event citations: ${result.citations.event_ids.length}\n`);

    if (result.items.length > 0) {
      io.stdout("\nRecent timeline\n");
      for (const item of result.items.slice(0, 10)) {
        io.stdout(`- ${item.occurred_at ?? "unknown"}\t${item.item_type}\t${item.title}\n`);
      }
    }

    return 0;
  }

  const result = await buildContextDashboardResult(root, target, { now: io.now });

  if (rest.includes("--json")) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Context dashboard: ${result.context.name} (${result.generated_at})\n`);
  io.stdout(`Active facts: ${result.active_facts.length}\n`);
  io.stdout(`Role claims: ${result.role_claims.length}\n`);
  io.stdout(`Decisions: ${result.decision_claims.length}\n`);
  io.stdout(`Open questions: ${result.open_question_claims.length}\n`);
  io.stdout(`Open follow-ups: ${result.followups.length}\n`);
  io.stdout(`Review items: ${result.review_items.length}\n`);
  io.stdout(`Evidence Events: ${result.evidence_events.length}\n`);

  if (result.suggested_actions.length > 0) {
    io.stdout("\nSuggested actions\n");
    for (const action of result.suggested_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  return 0;
}

async function commandEntities(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm entities stewardship [--kind person|topic|context] [--json]\n");
    return 0;
  }

  if (subcommand !== "stewardship") {
    throw new Error("Usage: wm entities stewardship [--kind person|topic|context] [--json]");
  }

  const kind = optionValue(rest, "--kind") ?? "person";
  const json = rest.includes("--json");
  const allowed = new Set(["person", "topic", "context"]);
  const allowedArgs = new Set(["--kind", kind, "--json"]);

  if (!allowed.has(kind) || rest.some((arg) => !allowedArgs.has(arg))) {
    throw new Error("Usage: wm entities stewardship [--kind person|topic|context] [--json]");
  }

  const result = await buildEntityStewardshipResult(root, kind as "person" | "topic" | "context", { now: io.now });

  if (json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Entity stewardship: ${result.kind} (${result.generated_at})\n`);
  io.stdout(`Total: ${result.summary.total}\n`);
  io.stdout(`High risk: ${result.summary.high_risk}\n`);
  io.stdout(`Medium risk: ${result.summary.medium_risk}\n`);
  io.stdout(`Identity ambiguity: ${result.summary.identity_ambiguity}\n`);
  io.stdout(`Conflict/change: ${result.summary.conflict_change}\n`);

  for (const item of result.items.slice(0, 10)) {
    io.stdout(
      `- ${item.name} (${item.id ?? item.path}): ${item.identityRisk.level} risk, lane ${item.recommendedReviewLane}\n`
    );
  }

  return 0;
}

async function commandDogfood(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm dogfood <status|eval> [--questions <path>] [--json]\n");
    return 0;
  }

  if (subcommand === "eval") {
    const questionsPath = optionValue(args, "--questions");
    const result = await runPersonalDogfoodEval(root, {
      questionsPath: questionsPath ? path.resolve(root, questionsPath) : undefined
    });

    if (args.includes("--json")) {
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    io.stdout(`Dogfood eval (${result.generated_at})\n`);
    io.stdout(`Questions: ${result.metrics.total_questions}\n`);
    io.stdout(`Answerability: ${formatPercent(result.metrics.answerability)}\n`);
    io.stdout(`Citation coverage: ${formatPercent(result.metrics.citation_coverage)}\n`);
    io.stdout(`Irrelevant inclusions: ${result.metrics.irrelevant_inclusion_count}\n`);
    io.stdout(`Missing-memory guidance: ${result.metrics.missing_memory_guidance_count}\n`);
    io.stdout(`Review/follow-up surfacing: ${result.metrics.review_followup_surfacing_count}\n`);
    io.stdout(`Generated persistence violations: ${result.metrics.generated_persistence_violations}\n`);

    if (result.warnings.length > 0) {
      io.stdout("\nWarnings\n");
      for (const warning of result.warnings) {
        io.stdout(`- ${warning}\n`);
      }
    }

    return 0;
  }

  if (subcommand !== "status") {
    throw new Error("Usage: wm dogfood <status|eval> [--questions <path>] [--json]");
  }

  const home = await buildDogfoodHomeResult(root);

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(home, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Dogfood Home (${home.generated_at})\n`);
  io.stdout(`Daily progress: ${home.daily_progress.completed ? "complete" : "needs attention"}\n`);
  io.stdout(
    `Next action: ${home.next_recommended_action.label}${
      home.next_recommended_action.target_id ? ` (${home.next_recommended_action.target_id})` : ""
    }\n\n`
  );
  io.stdout("Counts\n");

  for (const [key, value] of Object.entries(home.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  io.stdout(`\nCapture prompt: ${home.capture_prompt.prompt}\n`);

  if (home.suggested_manual_actions.length > 0) {
    io.stdout("\nSuggested manual actions\n");
    for (const action of home.suggested_manual_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  return 0;
}

async function commandDoctor(root: string, args: string[], io: CliIo, cwd: string): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm doctor memory-data [--json]\n");
    return 0;
  }

  if (subcommand !== "memory-data") {
    throw new Error("Usage: wm doctor memory-data [--json]");
  }

  const scriptPath = path.join(findRepoRoot(cwd), "scripts", "check-memory-data.mjs");
  const scriptArgs = [scriptPath, "--base", "origin/main"];

  if (args.includes("--json")) {
    scriptArgs.push("--json");
  }

  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env }
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.stdout) {
    io.stdout(result.stdout);
  }

  if (result.stderr) {
    io.stderr(result.stderr);
  }

  return result.status ?? 1;
}

async function commandActivate(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout("Usage: wm activate status [--json]\n");
    return 0;
  }

  if (subcommand !== "status") {
    throw new Error("Usage: wm activate status [--json]");
  }

  const status = await buildActivationStatusResult(root, { now: io.now });

  if (args.includes("--json")) {
    io.stdout(`${JSON.stringify(status, null, 2)}\n`);
    return 0;
  }

  io.stdout(`Activation (${status.generated_at})\n`);
  io.stdout(`State: ${status.memory_state}${status.activated ? " (activated)" : " (not activated)"}\n`);
  io.stdout(`Next step: ${status.next_wizard_step.label}\n`);
  io.stdout(`Next action: ${status.suggested_next_action}\n\n`);
  io.stdout("Counts\n");

  for (const [key, value] of Object.entries(status.counts)) {
    io.stdout(`${key}\t${value}\n`);
  }

  if (status.first_useful_ask.suggested_questions.length > 0) {
    io.stdout("\nSuggested questions\n");
    for (const question of status.first_useful_ask.suggested_questions) {
      io.stdout(`- ${question}\n`);
    }
  }

  if (status.first_useful_ask.blockers.length > 0) {
    io.stdout("\nAsk readiness blockers\n");
    for (const blocker of status.first_useful_ask.blockers) {
      io.stdout(`- ${blocker}\n`);
    }
  }

  return 0;
}

async function commandFriction(root: string, args: string[], io: CliIo): Promise<number> {
  const [subcommand] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    io.stdout(
      'Usage: wm friction log --kind <retrieval_miss|bad_answer|review_confusing|capture_wrong> --note "<text>" [--question "<q>"] [--dry-run]\n'
    );
    return 0;
  }

  if (subcommand !== "log") {
    throw new Error(
      'Usage: wm friction log --kind <retrieval_miss|bad_answer|review_confusing|capture_wrong> --note "<text>" [--question "<q>"] [--dry-run]'
    );
  }

  const kind = optionValue(args, "--kind");
  const note = optionValue(args, "--note");
  const dryRun = args.includes("--dry-run");

  if (!kind || !note) {
    throw new Error(
      'Usage: wm friction log --kind <retrieval_miss|bad_answer|review_confusing|capture_wrong> --note "<text>" [--question "<q>"] [--dry-run]'
    );
  }

  const result = dryRun
    ? await previewFrictionLog(root, {
        kind,
        note,
        question: optionValue(args, "--question") ?? undefined
      })
    : await createFrictionLog(root, {
        kind,
        note,
        question: optionValue(args, "--question") ?? undefined
      });

  if (dryRun) {
    io.stdout(`Dry run. No changes written to ${root}.\n`);
  }

  io.stdout(`Friction event: ${result.event_id} (${result.event_path})\n`);
  io.stdout(`Pending friction transaction: ${result.transaction_id} (${result.transaction_path})\n`);
  io.stdout(`Kind: ${result.kind}\n`);
  io.stdout(`Validation: ${result.validation.passed ? "passed" : "failed"}\n`);
  io.stdout(`Operations: ${result.operations.join(", ") || "NOOP"}\n`);

  return result.validation.passed ? 0 : 1;
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
  const answerContractQuestion = optionValue(args, "--answer-contract");
  const draftQuestion = optionValue(args, "--draft");

  if ([packContextQuestion, answerBasisQuestion, answerContractQuestion, draftQuestion].filter(Boolean).length > 1) {
    throw new Error(
      'Usage: wm ask --pack-context "<question>" | --answer-basis "<question>" | --answer-contract "<question>" | --draft "<question>"'
    );
  }

  const question = packContextQuestion ?? answerBasisQuestion ?? answerContractQuestion ?? draftQuestion;

  if (!question) {
    throw new Error(
      'Usage: wm ask --pack-context "<question>" | --answer-basis "<question>" | --answer-contract "<question>" | --draft "<question>"'
    );
  }

  if (draftQuestion) {
    io.stdout(`${JSON.stringify(await previewAnswerDraft(root, question), null, 2)}\n`);
    return 0;
  }

  if (answerContractQuestion) {
    io.stdout(`${JSON.stringify(await retrieveCitedAnswerContract(root, question), null, 2)}\n`);
    return 0;
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
  const result = await buildSessionBrief(root, { ...briefOptions, now: io.now });
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

function findRepoRoot(start: string): string {
  let current = path.resolve(start);

  while (true) {
    if (existsSync(path.join(current, "scripts", "check-memory-data.mjs"))) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error("Could not find scripts/check-memory-data.mjs. Run wm doctor memory-data from the Assisto repo.");
    }

    current = parent;
  }
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
  const valueOptions = new Set(["--file", "--observed-at", "--source-label", "--context", "--provider", "--preset"]);
  const booleanOptions = new Set(["--stdin", "--dry-run", "--create", "--json"]);
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

function parseSourceAdapterKind(value: string | null): SourceAdapterKind {
  if (value === "markdown" || value === "text" || value === "email" || value === "calendar" || value === "chat") {
    return value;
  }

  throw new Error("wm source import requires --kind <markdown|text|email|calendar|chat>.");
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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

function printSourceAdapterResult(result: SourceAdapterPreviewResult | SourceAdapterCreateResult, io: CliIo): void {
  io.stdout(`Source adapter: ${result.adapter_kind}\n`);
  io.stdout(`Units: ${result.review_load_forecast.total_units}\n`);
  io.stdout(`Likely safe: ${result.review_load_forecast.likely_safe}\n`);
  io.stdout(`Duplicates: ${result.review_load_forecast.duplicates}\n`);

  if ("created_events" in result) {
    io.stdout(`Created Events: ${result.created_events.length}\n`);
    io.stdout(`Pending Transactions: ${result.pending_transactions.length}\n`);
  }

  for (const warning of result.warnings) {
    io.stdout(`Warning: ${warning}\n`);
  }

  for (const unit of result.units) {
    if (unit.duplicate_state === "duplicate") {
      io.stdout(`Skipped duplicate source_hash: ${unit.source_hash} (${unit.unit_id})\n`);
      continue;
    }

    io.stdout(`Unit: ${unit.unit_id} ${unit.source_hash} ${unit.source_label}\n`);
  }
}

function printImportAssistantResult(result: ImportAssistantResult, io: CliIo): void {
  io.stdout(`Import assistant (${result.generated_at})\n`);
  io.stdout(`${result.recipe.title}\n`);
  io.stdout(`Suggested next batch size: ${result.suggested_next_batch_size}\n`);
  io.stdout(`Local sessions: ${result.session_count}\n`);
  io.stdout(`Review load: ${result.review_load_forecast.level} (${result.review_load_forecast.message})\n`);
  io.stdout(`Estimated review minutes: ${result.review_load_forecast.estimated_review_minutes}\n\n`);
  io.stdout("Likely counts\n");
  io.stdout(`safe\t${result.likely_counts.safe}\n`);
  io.stdout(`staged\t${result.likely_counts.staged}\n`);
  io.stdout(`conflicts\t${result.likely_counts.conflicts}\n`);
  io.stdout(`duplicates\t${result.likely_counts.duplicates}\n`);
  io.stdout(`skipped\t${result.likely_counts.skipped}\n`);

  if (result.duplicate_groups.length > 0) {
    io.stdout("\nDuplicate groups\n");
    for (const group of result.duplicate_groups) {
      io.stdout(`- ${group.source_hash.slice(0, 12)}: ${group.unit_ids.join(", ")}\n`);
    }
  }

  if (result.suggested_actions.length > 0) {
    io.stdout("\nSuggested actions\n");
    for (const action of result.suggested_actions) {
      io.stdout(`- ${action}\n`);
    }
  }

  if (result.warnings.length > 0) {
    io.stdout("\nWarnings\n");
    for (const warning of result.warnings) {
      io.stdout(`- ${warning}\n`);
    }
  }
}

function importValidationPassed(result: ImportNotesResult): boolean {
  return result.units.every((unit) => unit.skipped || unit.validation?.passed === true);
}

function parseSeedKitFile(content: string, filePath: string): SeedKitInput {
  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Seed kit JSON must be an object.");
    }

    return parsed as SeedKitInput;
  }

  const sections = markdownSeedSections(content);

  if (Object.keys(sections).length > 0) {
    return sections;
  }

  return {
    things_i_keep_forgetting: content
  };
}

function markdownSeedSections(content: string): SeedKitInput {
  const output: SeedKitInput = {};
  let current: keyof SeedKitInput | null = null;
  const buffers: Partial<Record<keyof SeedKitInput, string[]>> = {};

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+?)\s*$/)?.[1];

    if (heading) {
      current = seedSectionKey(heading);
      continue;
    }

    if (!current) {
      continue;
    }

    buffers[current] = [...(buffers[current] ?? []), line.replace(/^[-*]\s+/, "")];
  }

  for (const [key, lines] of Object.entries(buffers) as Array<[keyof SeedKitInput, string[]]>) {
    const value = lines.map((line) => line.trim()).filter(Boolean);

    if (value.length > 0) {
      output[key] = value;
    }
  }

  return output;
}

function seedSectionKey(label: string): keyof SeedKitInput | null {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (normalized === "my role" || normalized === "role") {
    return "my_role";
  }

  if (normalized === "manager team" || normalized === "team" || normalized === "manager") {
    return "manager_team";
  }

  if (normalized === "current projects" || normalized === "projects" || normalized === "contexts" || normalized === "current contexts") {
    return "current_projects";
  }

  if (normalized === "important people" || normalized === "people") {
    return "important_people";
  }

  if (normalized === "systems topics" || normalized === "systems" || normalized === "topics") {
    return "systems_topics";
  }

  if (normalized === "open loops" || normalized === "follow ups" || normalized === "followups") {
    return "open_loops";
  }

  if (normalized === "things i keep forgetting" || normalized === "memory gaps") {
    return "things_i_keep_forgetting";
  }

  return null;
}

function printSeedKitResult(result: SeedKitResult, io: CliIo): void {
  io.stdout(`Seed units: ${result.units.length}\n`);
  io.stdout(`Validation: ${result.validation.passed ? "passed" : "failed"}\n`);

  for (const unit of result.units) {
    io.stdout(`${unit.section_label}: ${unit.source_label}\n`);
    io.stdout(`Event: ${unit.event_id} (${unit.event_path})\n`);
    io.stdout(`Pending transaction: ${unit.transaction_id} (${unit.transaction_path})\n`);

    if (unit.staged_review_paths.length > 0) {
      io.stdout(`Staged review proposals: ${unit.staged_review_paths.join(", ")}\n`);
    }
  }
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
      '  wm [--root <path>] capture presets [--json]',
      '  wm [--root <path>] capture quick [--preset <id>] [--stdin|--file <path>] [--observed-at <date>] [--source-label <text>] [--context <id|path|name>] [--provider rule|openai] [--create] [--json] "<note>"',
      '  wm [--root <path>] capture feedback --kind <wrong_person|missing_context|bad_followup|bad_role_reporting|other_extraction_issue> --note "<text>" [--event <id|path>] [--transaction <id|path>] [--dry-run]',
      "  wm [--root <path>] import assistant [--json]",
      '  wm [--root <path>] import notes (--path <file-or-dir> | --stdin) [--glob "*.md,*.txt"] [--provider rule|openai] [--limit <n>] [--dry-run]',
      '  wm [--root <path>] source import --kind <markdown|text|email|calendar|chat> (--path <file> | --stdin) [--source-label <text>] [--observed-at <date>] [--context <id|path|name>] [--limit <n>] [--dry-run] [--json]',
      "  wm [--root <path>] seed kit --file <json|md> [--dry-run]",
      "  wm [--root <path>] today [--json]",
      "  wm [--root <path>] daily queue [--json]",
      "  wm [--root <path>] daily session [--json]",
      "  wm [--root <path>] mode <morning|end-day|meeting|after-meeting> [id|path] [--json]",
      "  wm [--root <path>] context dashboard <id|path> [--json]",
      "  wm [--root <path>] context operating-room <id|path> [--json]",
      "  wm [--root <path>] context timeline <id|path> [--json]",
      "  wm [--root <path>] entities stewardship [--kind person|topic|context] [--json]",
      "  wm [--root <path>] activate status [--json]",
      "  wm [--root <path>] use-tomorrow [--json]",
      "  wm [--root <path>] dogfood status [--json]",
      "  wm [--root <path>] dogfood eval [--questions <path>] [--json]",
      "  wm [--root <path>] doctor memory-data [--json]",
      '  wm [--root <path>] friction log --kind <retrieval_miss|bad_answer|review_confusing|capture_wrong> --note "<text>" [--question "<q>"] [--dry-run]',
      '  wm [--root <path>] review list [--all]',
      "  wm [--root <path>] review show <id|path>",
      "  wm [--root <path>] review mark <id|path> --state <reviewed|contested|archived> [--note <text>]",
      '  wm [--root <path>] review apply-staged <id|path> --target <id|path> [--context <id|path> | --create-context "<name>"] [--supersede <claim-id>] [--note <text>]',
      "  wm [--root <path>] events reprocess <event-id|path> --stage-only",
      '  wm [--root <path>] ask --pack-context "<question>"',
      '  wm [--root <path>] ask --answer-basis "<question>"',
      '  wm [--root <path>] ask --answer-contract "<question>"',
      '  wm [--root <path>] ask --draft "<question>"',
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
