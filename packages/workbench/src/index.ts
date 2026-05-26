import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  createReviewApplyTransaction,
  createReviewStateTransaction,
  listMarkdownFiles,
  listReviewItems,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseTransactionMarkdown,
  readMarkdownPage,
  reprocessEvent,
  showReviewItem,
  retrieveContextForAnswer,
  type ContextPackResult,
  type Frontmatter,
  type FrontmatterValue,
  type IngestNoteResult,
  type ParsedTransaction,
  type ReviewActionState,
  type ReviewStateTransactionResult,
  type ReviewItemSummary
} from "@assisto/core";

export interface WorkbenchSnapshotOptions {
  query?: string;
  includeHealth?: boolean;
  now?: string;
}

export interface WorkbenchSnapshot {
  generated_at: string;
  review: WorkbenchReviewInbox;
  transactions: WorkbenchTransactionList;
  followups: WorkbenchFollowupList;
  health: WorkbenchHealthSummary | null;
  ask: ContextPackResult | null;
}

export interface WorkbenchReviewInbox {
  items: WorkbenchReviewItem[];
  grouped_by_reason: WorkbenchReviewReasonGroup[];
}

export interface WorkbenchReviewReasonGroup {
  review_reason: string;
  count: number;
}

export interface WorkbenchReviewItem extends ReviewItemSummary {
  source_events: string[];
  affected_files: string[];
  staged_claim_ids: string[];
}

export interface WorkbenchTransactionList {
  items: WorkbenchTransactionSummary[];
}

export interface WorkbenchTransactionSummary {
  id: string;
  path: string;
  transaction_state: string;
  created_at?: string;
  source_events: string[];
  operations: string[];
  affected_files: string[];
  risk_level?: string;
  requires_review?: boolean;
}

export interface WorkbenchFollowupList {
  items: WorkbenchFollowupSummary[];
  warnings: WorkbenchReadWarning[];
}

export interface WorkbenchFollowupSummary {
  id: string;
  path: string;
  object_state: string;
  review_state: string;
  followup_state: string;
  owner?: string;
  due_at?: string;
  source_events: string[];
  related: string[];
}

export interface WorkbenchHealthSummary {
  counts: {
    staged_review_items: number;
    pending_transactions: number;
    open_followups: number;
    contested_pages: number;
    archived_pages: number;
  };
  review_reasons: WorkbenchReviewReasonGroup[];
  affected_files: string[];
  warnings: string[];
}

export interface WorkbenchReadWarning {
  path: string;
  message: string;
}

export interface WorkbenchServerOptions {
  root: string;
  host?: string;
  port?: number;
}

export interface WorkbenchRouteRequest {
  method?: string;
  url: string;
  body?: string;
}

export interface WorkbenchRouteResponse {
  status: number;
  content_type: string;
  body: string;
}

export interface RunningWorkbenchServer {
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export type WorkbenchReviewResolutionAction = "apply_staged_claim" | "mark_review_item" | "reprocess_event";

export interface ReviewResolutionPreview {
  action: WorkbenchReviewResolutionAction;
  created: boolean;
  transaction_id: string;
  transaction_path: string;
  transaction_state: string;
  operations: string[];
  affected_files: string[];
  source_events: string[];
  proposed_file_writes: string[];
  risk_level?: string;
  requires_review?: boolean;
  review_id?: string;
  review_path?: string;
  event_id?: string;
  event_path?: string;
}

interface PageSummary {
  path: string;
  frontmatter: Frontmatter;
}

interface PageSummaryResult {
  pages: PageSummary[];
  warnings: WorkbenchReadWarning[];
}

export async function createWorkbenchSnapshot(
  root: string,
  options: WorkbenchSnapshotOptions = {}
): Promise<WorkbenchSnapshot> {
  const [review, transactions, followups, ask] = await Promise.all([
    collectReviewInbox(root),
    collectTransactions(root),
    collectFollowups(root),
    options.query ? retrieveContextForAnswer(root, options.query) : Promise.resolve(null)
  ]);
  const health =
    options.includeHealth === false
      ? null
      : summarizeHealth(review, transactions, followups, await collectPageSummaries(root));

  return {
    generated_at: options.now ?? new Date().toISOString(),
    review,
    transactions,
    followups,
    health,
    ask
  };
}

export async function startWorkbenchServer(options: WorkbenchServerOptions): Promise<RunningWorkbenchServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3721;
  const server = http.createServer((request, response) => {
    void handleRequest(options.root, request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    host,
    port: resolvedPort,
    url: `http://${formatHostForUrl(host)}:${resolvedPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function handleRequest(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
    const route = await handleWorkbenchRoute(root, {
      method: request.method,
      url: request.url ?? "/",
      body
    });
    response.writeHead(route.status, {
      "content-type": route.content_type,
      "cache-control": "no-store"
    });
    response.end(request.method === "HEAD" ? "" : route.body);
  } catch (error) {
    const route = jsonRoute(500, { error: error instanceof Error ? error.message : String(error) });
    response.writeHead(route.status, {
      "content-type": route.content_type,
      "cache-control": "no-store"
    });
    response.end(route.body);
  }
}

export async function handleWorkbenchRoute(
  root: string,
  request: WorkbenchRouteRequest
): Promise<WorkbenchRouteResponse> {
  const method = request.method ?? "GET";
  const requestUrl = new URL(request.url, "http://127.0.0.1");

  if (method === "POST") {
    return handleWorkbenchPostRoute(root, requestUrl.pathname, request);
  }

  if (method !== "GET" && method !== "HEAD") {
    return jsonRoute(405, { error: "Unsupported method." });
  }

  if (requestUrl.pathname === "/") {
    return textRoute(200, workbenchHtml(), "text/html; charset=utf-8");
  }

  if (requestUrl.pathname === "/assets/workbench.css") {
    return textRoute(200, workbenchCss(), "text/css; charset=utf-8");
  }

  if (requestUrl.pathname === "/assets/workbench.js") {
    return textRoute(200, workbenchClientJs(), "text/javascript; charset=utf-8");
  }

  if (requestUrl.pathname === "/api/snapshot") {
    return jsonRoute(200, await createWorkbenchSnapshot(root, { query: optionalQuery(requestUrl), includeHealth: false }));
  }

  if (requestUrl.pathname === "/api/review") {
    return jsonRoute(200, await collectReviewInbox(root));
  }

  if (requestUrl.pathname === "/api/transactions") {
    return jsonRoute(200, await collectTransactions(root));
  }

  if (requestUrl.pathname === "/api/ask") {
    const query = optionalQuery(requestUrl);
    return query
      ? jsonRoute(200, await retrieveContextForAnswer(root, query))
      : jsonRoute(400, { error: "Missing required query parameter: q." });
  }

  if (requestUrl.pathname === "/api/followups") {
    return jsonRoute(200, await collectFollowups(root));
  }

  if (requestUrl.pathname === "/api/health") {
    const [review, transactions, followups, pages] = await Promise.all([
      collectReviewInbox(root),
      collectTransactions(root),
      collectFollowups(root),
      collectPageSummaries(root)
    ]);
    return jsonRoute(200, summarizeHealth(review, transactions, followups, pages));
  }

  return jsonRoute(404, { error: "Not found." });
}

async function handleWorkbenchPostRoute(
  root: string,
  pathname: string,
  request: WorkbenchRouteRequest
): Promise<WorkbenchRouteResponse> {
  let input: Record<string, unknown>;

  try {
    input = parseJsonBody(request.body);
  } catch (error) {
    return jsonRoute(400, { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    if (pathname === "/api/review/apply-staged/preview") {
      return jsonRoute(200, await createReviewApplyPreview(root, input, false));
    }

    if (pathname === "/api/review/apply-staged") {
      return jsonRoute(200, await createReviewApplyPreview(root, input, true));
    }

    if (pathname === "/api/review/mark/preview") {
      return jsonRoute(200, await createReviewMarkPreview(root, input, false));
    }

    if (pathname === "/api/review/mark") {
      return jsonRoute(200, await createReviewMarkPreview(root, input, true));
    }

    if (pathname === "/api/events/reprocess/preview") {
      return jsonRoute(200, await createEventReprocessPreview(root, input, false));
    }

    if (pathname === "/api/events/reprocess") {
      return jsonRoute(200, await createEventReprocessPreview(root, input, true));
    }

    return jsonRoute(405, { error: "Unsupported workbench write route." });
  } catch (error) {
    return jsonRoute(400, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function createReviewApplyPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const reviewId = requiredStringInput(input, "reviewId", "review_id", "id");
  const target = requiredStringInput(input, "target");
  const options = {
    target,
    context: optionalStringInput(input, "context"),
    createContext: optionalStringInput(input, "createContext", "create_context"),
    supersede: optionalStringInput(input, "supersede"),
    note: optionalStringInput(input, "note")
  };
  const result = created
    ? await createReviewApplyTransaction(root, reviewId, options)
    : await withPreviewRoot(root, (previewRoot) => createReviewApplyTransaction(previewRoot, reviewId, options));

  return reviewTransactionPreview("apply_staged_claim", result, created);
}

async function createReviewMarkPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  const reviewId = requiredStringInput(input, "reviewId", "review_id", "id");
  const state = reviewActionStateInput(input);
  const note = optionalStringInput(input, "note");
  const result = created
    ? await createReviewStateTransaction(root, reviewId, state, { note })
    : await withPreviewRoot(root, (previewRoot) => createReviewStateTransaction(previewRoot, reviewId, state, { note }));

  return reviewTransactionPreview("mark_review_item", result, created);
}

async function createEventReprocessPreview(
  root: string,
  input: Record<string, unknown>,
  created: boolean
): Promise<ReviewResolutionPreview> {
  if (input.stageOnly !== true && input.stage_only !== true) {
    throw new Error("Event reprocess requires stageOnly true.");
  }

  const eventId = requiredStringInput(input, "eventId", "event_id", "id");
  const result = created
    ? await reprocessEvent(root, eventId)
    : await withPreviewRoot(root, (previewRoot) => reprocessEvent(previewRoot, eventId));

  return ingestTransactionPreview("reprocess_event", result, created);
}

function reviewTransactionPreview(
  action: WorkbenchReviewResolutionAction,
  result: ReviewStateTransactionResult,
  created: boolean
): ReviewResolutionPreview {
  return {
    ...transactionPreviewFields(action, result.transaction, result.transaction_path, created),
    review_id: result.review_id,
    review_path: result.review_path
  };
}

function ingestTransactionPreview(
  action: WorkbenchReviewResolutionAction,
  result: IngestNoteResult,
  created: boolean
): ReviewResolutionPreview {
  return {
    ...transactionPreviewFields(action, result.transaction, result.transaction_path, created),
    event_id: result.event_id,
    event_path: result.event_path
  };
}

function transactionPreviewFields(
  action: WorkbenchReviewResolutionAction,
  transaction: ParsedTransaction,
  transactionPath: string,
  created: boolean
): ReviewResolutionPreview {
  return {
    action,
    created,
    transaction_id: transaction.id,
    transaction_path: transactionPath,
    transaction_state: transaction.transaction_state,
    operations: transaction.operations.map((operation) => operation.operation),
    affected_files: transaction.affected_files,
    source_events: transaction.source_events,
    proposed_file_writes: transaction.proposed_file_writes.map((write) => write.path),
    risk_level: transaction.risk_level,
    requires_review: transaction.requires_review
  };
}

async function withPreviewRoot<T>(root: string, action: (previewRoot: string) => Promise<T>): Promise<T> {
  const previewRoot = await mkdtemp(path.join(previewTempParent(), "assisto-workbench-preview-"));

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

async function collectReviewInbox(root: string): Promise<WorkbenchReviewInbox> {
  const summaries = await listReviewItems(root);
  const items: WorkbenchReviewItem[] = [];

  for (const summary of summaries) {
    items.push(await enrichReviewItem(root, summary));
  }

  return {
    items,
    grouped_by_reason: groupReviewReasons(items)
  };
}

async function enrichReviewItem(root: string, summary: ReviewItemSummary): Promise<WorkbenchReviewItem> {
  try {
    const detail = await showReviewItem(root, summary.id);

    return {
      ...summary,
      source_events: stringArrayValue(detail.parsed.frontmatter.source_events),
      affected_files: stringArrayValue(detail.parsed.frontmatter.affected_files),
      staged_claim_ids: parseClaimBlockRecords(detail.parsed.body)
        .map((claim) => stringValue(claim.fields.claim_id))
        .filter((claimId): claimId is string => Boolean(claimId))
    };
  } catch {
    return {
      ...summary,
      source_events: [],
      affected_files: [],
      staged_claim_ids: []
    };
  }
}

async function collectTransactions(root: string): Promise<WorkbenchTransactionList> {
  const files = await listFilesOrEmpty(root, "memory/transactions/**/*.md");
  const items: WorkbenchTransactionSummary[] = [];

  for (const file of files) {
    try {
      const transaction = parseTransactionMarkdown(await readMarkdownPage(root, file));
      items.push({
        id: transaction.id,
        path: file,
        transaction_state: transaction.transaction_state,
        created_at: transaction.created_at,
        source_events: transaction.source_events,
        operations: transaction.operations.map((operation) => operation.operation),
        affected_files: transaction.affected_files,
        risk_level: transaction.risk_level,
        requires_review: transaction.requires_review
      });
    } catch {
      // Broken transaction pages are surfaced by validation; the read-only workbench skips them.
    }
  }

  items.sort((left, right) => left.path.localeCompare(right.path));

  return { items };
}

async function collectFollowups(root: string): Promise<WorkbenchFollowupList> {
  const files = await uniqueSorted([
    ...(await listFilesOrEmpty(root, "memory/followups/*.md")),
    ...(await listFilesOrEmpty(root, "memory/followups/**/*.md"))
  ]);
  const items: WorkbenchFollowupSummary[] = [];
  const warnings: WorkbenchReadWarning[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch (error) {
      warnings.push(readWarning(file, error));
      continue;
    }

    if (parsed.frontmatter.type !== "followup") {
      continue;
    }

    items.push({
      id: stringValue(parsed.frontmatter.id) ?? file,
      path: file,
      object_state: stringValue(parsed.frontmatter.object_state) ?? "active",
      review_state: stringValue(parsed.frontmatter.review_state) ?? "none",
      followup_state: stringValue(parsed.frontmatter.followup_state) ?? "open",
      owner: stringValue(parsed.frontmatter.owner),
      due_at: stringValue(parsed.frontmatter.due_at),
      source_events: stringArrayValue(parsed.frontmatter.source_events),
      related: stringArrayValue(parsed.frontmatter.related)
    });
  }

  items.sort((left, right) => left.path.localeCompare(right.path));

  return { items, warnings };
}

async function collectPageSummaries(root: string): Promise<PageSummaryResult> {
  const files = await listFilesOrEmpty(root, "memory/**/*.md");
  const pages: PageSummary[] = [];
  const warnings: WorkbenchReadWarning[] = [];

  for (const file of files) {
    let parsed: ReturnType<typeof parseMarkdownFile>;

    try {
      parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    } catch (error) {
      warnings.push(readWarning(file, error));
      continue;
    }

    pages.push({
      path: file,
      frontmatter: parsed.frontmatter
    });
  }

  return { pages, warnings };
}

function summarizeHealth(
  review: WorkbenchReviewInbox,
  transactions: WorkbenchTransactionList,
  followups: WorkbenchFollowupList,
  pageSummaries: PageSummaryResult
): WorkbenchHealthSummary {
  const pendingTransactions = transactions.items.filter((transaction) => transaction.transaction_state === "pending");
  const openFollowups = followups.items.filter(
    (followup) => !["closed", "rejected"].includes(followup.followup_state) && followup.object_state !== "archived"
  );
  const contestedPages = pageSummaries.pages.filter((page) => page.frontmatter.review_state === "contested");
  const archivedPages = pageSummaries.pages.filter((page) => page.frontmatter.object_state === "archived");
  const affectedFiles = new Set<string>();

  for (const item of review.items) {
    for (const file of item.affected_files) {
      affectedFiles.add(file);
    }
  }

  return {
    counts: {
      staged_review_items: review.items.length,
      pending_transactions: pendingTransactions.length,
      open_followups: openFollowups.length,
      contested_pages: contestedPages.length,
      archived_pages: archivedPages.length
    },
    review_reasons: review.grouped_by_reason,
    affected_files: [...affectedFiles].sort(),
    warnings: [
      ...healthWarnings(review, pendingTransactions, contestedPages),
      ...formatReadWarnings("Skipped malformed follow-up", followups.warnings),
      ...formatReadWarnings("Skipped malformed memory page", pageSummaries.warnings)
    ]
  };
}

function healthWarnings(
  review: WorkbenchReviewInbox,
  pendingTransactions: WorkbenchTransactionSummary[],
  contestedPages: PageSummary[]
): string[] {
  const warnings: string[] = [];

  if (review.items.length > 0) {
    warnings.push(`${review.items.length} staged review item(s) need human resolution.`);
  }

  if (pendingTransactions.length > 0) {
    warnings.push(`${pendingTransactions.length} pending transaction(s) are awaiting apply/reject.`);
  }

  if (contestedPages.length > 0) {
    warnings.push(`${contestedPages.length} page(s) contain contested memory.`);
  }

  return warnings;
}

function readWarning(path: string, error: unknown): WorkbenchReadWarning {
  return {
    path,
    message: error instanceof Error ? error.message : String(error)
  };
}

function formatReadWarnings(prefix: string, warnings: WorkbenchReadWarning[]): string[] {
  return warnings.map((warning) => `${prefix}: ${warning.path} (${warning.message})`);
}

function groupReviewReasons(items: WorkbenchReviewItem[]): WorkbenchReviewReasonGroup[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.review_reason, (counts.get(item.review_reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reviewReason, count]) => ({ review_reason: reviewReason, count }))
    .sort((left, right) => left.review_reason.localeCompare(right.review_reason));
}

async function listFilesOrEmpty(root: string, globPattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, globPattern);
  } catch {
    return [];
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function optionalQuery(requestUrl: URL): string | undefined {
  const query = requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("query");
  const trimmed = query?.trim();

  return trimmed ? trimmed : undefined;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > 1_000_000) {
      throw new Error("Workbench request body is too large.");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body?.trim()) {
    return {};
  }

  const parsed: unknown = JSON.parse(body);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function requiredStringInput(input: Record<string, unknown>, ...keys: string[]): string {
  const value = optionalStringInput(input, ...keys);

  if (!value) {
    throw new Error(`Missing required field: ${keys[0]}.`);
  }

  return value;
}

function optionalStringInput(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function reviewActionStateInput(input: Record<string, unknown>): ReviewActionState {
  const value = requiredStringInput(input, "state");

  if (value === "reviewed" || value === "contested" || value === "archived") {
    return value;
  }

  throw new Error("Review state must be reviewed, contested, or archived.");
}

function previewTempParent(): string {
  if (process.env.TMPDIR?.trim()) {
    return process.env.TMPDIR.trim();
  }

  return process.platform === "win32" ? os.tmpdir() : "/tmp";
}

function jsonRoute(status: number, body: unknown): WorkbenchRouteResponse {
  return textRoute(status, `${JSON.stringify(body, null, 2)}\n`, "application/json; charset=utf-8");
}

function textRoute(status: number, body: string, contentType: string): WorkbenchRouteResponse {
  return {
    status,
    content_type: contentType,
    body
  };
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatHostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function workbenchHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Assisto Workbench</title>
    <link rel="stylesheet" href="/assets/workbench.css">
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Assisto</p>
          <h1>Memory Workbench</h1>
        </div>
        <output id="status" class="status">Loading</output>
      </header>
      <nav class="tabs" aria-label="Workbench">
        <button type="button" data-tab="review" aria-pressed="true">Review</button>
        <button type="button" data-tab="transactions" aria-pressed="false">Transactions</button>
        <button type="button" data-tab="ask" aria-pressed="false">Ask</button>
        <button type="button" data-tab="health" aria-pressed="false">Health</button>
        <button type="button" data-tab="briefs" aria-pressed="false">Briefs</button>
      </nav>
      <section id="view" class="view" aria-live="polite"></section>
    </main>
    <script type="module" src="/assets/workbench.js"></script>
  </body>
</html>
`;
}

function workbenchCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #f6f7f4;
  --panel: #ffffff;
  --ink: #1d2428;
  --muted: #68757d;
  --line: #d9ded8;
  --accent: #20746b;
  --accent-2: #9b4d27;
  --soft: #edf4f2;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

button,
input,
select {
  font: inherit;
}

.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 40px;
}

.topbar {
  align-items: end;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding-bottom: 16px;
}

.eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 4px;
  text-transform: uppercase;
}

h1 {
  font-size: 28px;
  line-height: 1.1;
  margin: 0;
}

.status {
  color: var(--muted);
  font-size: 13px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 0;
}

.tabs button {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  min-height: 36px;
  padding: 7px 12px;
}

.tabs button[aria-pressed="true"] {
  background: var(--soft);
  border-color: var(--accent);
  color: var(--accent);
}

.view {
  display: grid;
  gap: 12px;
}

.toolbar,
.action-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.toolbar input,
.action-row input,
.action-row select {
  border: 1px solid var(--line);
  border-radius: 6px;
  flex: 1;
  min-height: 38px;
  padding: 8px 10px;
}

.toolbar button,
.action-row button {
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  min-height: 38px;
  padding: 8px 14px;
}

.action-row button.secondary {
  background: transparent;
  color: var(--accent);
}

.action-stack {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
}

.action-output {
  margin-top: 12px;
}

.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.item {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}

.item h2,
.item h3 {
  font-size: 15px;
  line-height: 1.25;
  margin: 0 0 8px;
}

.meta {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

.pill {
  color: var(--accent-2);
  font-size: 12px;
  font-weight: 700;
}

pre {
  background: #172023;
  border-radius: 8px;
  color: #e8eeee;
  overflow: auto;
  padding: 12px;
}

@media (max-width: 640px) {
  .shell {
    width: min(100vw - 20px, 1180px);
    padding-top: 16px;
  }

  .topbar,
  .toolbar,
  .action-row {
    align-items: stretch;
    flex-direction: column;
  }
}
`;
}

function workbenchClientJs(): string {
  return `const view = document.querySelector("#view");
const status = document.querySelector("#status");
let snapshot = null;
let health = null;
let activeTab = "review";

for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    for (const tab of document.querySelectorAll("[data-tab]")) {
      tab.setAttribute("aria-pressed", String(tab === button));
    }
    render();
  });
}

async function loadSnapshot() {
  snapshot = await fetchJson("/api/snapshot");
  status.value = "Ready";
  render();
}

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload;
}

function render() {
  if (!snapshot) {
    view.innerHTML = "";
    return;
  }

  if (activeTab === "review") {
    renderReview();
    return;
  }

  if (activeTab === "transactions") {
    renderCards(
      snapshot.transactions.items,
      (item) => item.id,
      (item) => \`\${item.transaction_state} · \${item.operations.join(", ")}\`,
      (item) => [item.path, item.source_events.join(", "), item.affected_files.join(", ")]
    );
    return;
  }

  if (activeTab === "ask") {
    view.innerHTML = \`<form class="toolbar" id="ask-form">
      <input id="ask-input" name="q" value="Who is my manager?">
      <button type="submit">Ask</button>
    </form><div id="ask-result" class="grid"></div>\`;
    document.querySelector("#ask-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const question = document.querySelector("#ask-input").value.trim();
      const result = await fetchJson(\`/api/ask?q=\${encodeURIComponent(question)}\`);
      renderAnswerBasis(result);
    });
    return;
  }

  if (activeTab === "health") {
    void renderHealth();
    return;
  }

  view.innerHTML = \`<article class="item"><h2>Briefs</h2><p class="meta">Scheduled for PR5.</p></article>\`;
}

function renderReview() {
  const items = snapshot.review.items;
  const cards = items.length
    ? items.map((item) => reviewCardHtml(item)).join("")
    : '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';

  view.innerHTML = \`<article class="item">
    <h2>Event reprocess</h2>
    <form id="event-reprocess-form" class="action-row">
      <input name="eventId" placeholder="Event id or path">
      <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
      <button type="submit" name="mode" value="apply">Stage</button>
    </form>
  </article>
  <div class="grid">\${cards}</div>
  <div id="action-output" class="action-output"></div>\`;
  bindReviewActions();
}

function reviewCardHtml(item) {
  const defaultTarget = item.affected_files[0] ? memoryPath(item.affected_files[0]) : "";

  return \`<article class="item">
    <h2>\${escapeHtml(item.id)}</h2>
    <p class="pill">\${escapeHtml(item.review_reason)} · \${escapeHtml(item.review_state)}</p>
    <p class="meta">\${escapeHtml(item.path)}</p>
    <p class="meta">\${escapeHtml(item.source_events.join(", "))}</p>
    <p class="meta">\${escapeHtml(item.staged_claim_ids.join(", "))}</p>
    <div class="action-stack">
      <form class="review-apply-form" data-review-id="\${escapeHtml(item.id)}">
        <div class="action-row">
          <input name="target" value="\${escapeHtml(defaultTarget)}" placeholder="Target page">
          <input name="context" placeholder="Context id or path">
        </div>
        <div class="action-row">
          <input name="createContext" placeholder="Create context">
          <input name="supersede" placeholder="Supersede claim">
        </div>
        <div class="action-row">
          <input name="note" placeholder="Note">
          <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
          <button type="submit" name="mode" value="apply">Apply</button>
        </div>
      </form>
      <form class="review-mark-form" data-review-id="\${escapeHtml(item.id)}">
        <div class="action-row">
          <select name="state">
            <option value="reviewed">reviewed</option>
            <option value="contested">contested</option>
            <option value="archived">archived</option>
          </select>
          <input name="note" placeholder="Note">
          <button type="submit" name="mode" value="preview" class="secondary">Preview</button>
          <button type="submit" name="mode" value="apply">Mark</button>
        </div>
      </form>
    </div>
  </article>\`;
}

function bindReviewActions() {
  document.querySelector("#event-reprocess-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const preview = submitter?.value === "preview";
    await runAction(preview ? "/api/events/reprocess/preview" : "/api/events/reprocess", {
      eventId: form.elements.eventId.value,
      stageOnly: true
    });
  });

  for (const form of document.querySelectorAll(".review-apply-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/review/apply-staged/preview" : "/api/review/apply-staged", {
        reviewId: form.dataset.reviewId,
        target: form.elements.target.value,
        context: form.elements.context.value,
        createContext: form.elements.createContext.value,
        supersede: form.elements.supersede.value,
        note: form.elements.note.value
      });
    });
  }

  for (const form of document.querySelectorAll(".review-mark-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const preview = submitter?.value === "preview";
      await runAction(preview ? "/api/review/mark/preview" : "/api/review/mark", {
        reviewId: form.dataset.reviewId,
        state: form.elements.state.value,
        note: form.elements.note.value
      });
    });
  }
}

async function runAction(path, body) {
  const output = document.querySelector("#action-output");
  output.innerHTML = "<pre>Running</pre>";

  try {
    const result = await postJson(path, body);
    snapshot = await fetchJson("/api/snapshot");
    health = null;
    render();
    document.querySelector("#action-output").innerHTML = \`<pre>\${escapeHtml(JSON.stringify(result, null, 2))}</pre>\`;
  } catch (error) {
    output.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
  }
}

function renderAnswerBasis(result) {
  const sections = [
    sectionHtml(
      "What memory can say",
      result.answerCandidates,
      (candidate) => candidate.claim_id,
      (candidate) => candidate.statement,
      (candidate) => [candidate.page_path, candidate.evidence.join(", "), candidate.scope_state]
    ),
    sectionHtml(
      "What memory cannot confirm",
      [...result.missingInformation, ...result.uncertainClaims],
      (item) => item.code ?? item.claim_id,
      (item) => item.message ?? item.statement,
      (item) => item.page_path ? [item.page_path, item.uncertainty_markers.join(", ")] : []
    ),
    sectionHtml(
      "Evidence Events",
      result.evidenceEvents,
      (event) => event.id,
      (event) => event.path,
      (event) => [event.recorded_at, event.observed_at]
    )
  ];

  document.querySelector("#ask-result").innerHTML = sections.join("");
}

function sectionHtml(label, items, title, badge, details) {
  return \`<section><h2>\${escapeHtml(label)}</h2>\${cardsHtml(items, title, badge, details)}</section>\`;
}

function memoryPath(file) {
  return file.startsWith("memory/") ? file : \`memory/\${file}\`;
}

async function renderHealth() {
  if (!health) {
    view.innerHTML = '<article class="item"><h2>Loading health</h2><p class="meta">Reading markdown state.</p></article>';
    health = await fetchJson("/api/health");
  }

  const counts = health.counts;
  renderCards(
    Object.keys(counts).map((key) => ({ key, count: counts[key] })),
    (item) => item.key.replaceAll("_", " "),
    (item) => String(item.count),
    () => health.warnings
  );
}

function renderCards(items, title, badge, details) {
  view.innerHTML = cardsHtml(items, title, badge, details);
}

function cardsHtml(items, title, badge, details) {
  if (!items.length) {
    return '<article class="item"><h2>Empty</h2><p class="meta">No matching memory objects.</p></article>';
  }

  return \`<div class="grid">\${items.map((item) => \`<article class="item">
    <h2>\${escapeHtml(title(item))}</h2>
    <p class="pill">\${escapeHtml(badge(item))}</p>
    \${details(item).filter(Boolean).map((line) => \`<p class="meta">\${escapeHtml(line)}</p>\`).join("")}
  </article>\`).join("")}</div>\`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

loadSnapshot().catch((error) => {
  status.value = "Error";
  view.innerHTML = \`<pre>\${escapeHtml(error.message)}</pre>\`;
});
`;
}
