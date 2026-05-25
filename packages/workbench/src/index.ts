import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  listMarkdownFiles,
  listReviewItems,
  parseClaimBlockRecords,
  parseMarkdownFile,
  parseTransactionMarkdown,
  readMarkdownPage,
  showReviewItem,
  type Frontmatter,
  type FrontmatterValue,
  type ParsedClaimBlockRecord,
  type ReviewItemSummary
} from "../../core/src/index";
import {
  retrieveContextForAnswer,
  type ContextPackResult
} from "../../core/src/retrieval";

export interface WorkbenchSnapshotOptions {
  query?: string;
}

export interface WorkbenchSnapshot {
  generated_at: string;
  review: WorkbenchReviewInbox;
  transactions: WorkbenchTransactionList;
  followups: WorkbenchFollowupList;
  health: WorkbenchHealthSummary;
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

export interface WorkbenchServerOptions {
  root: string;
  host?: string;
  port?: number;
}

export interface WorkbenchRouteRequest {
  method?: string;
  url: string;
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

interface ParsedPageSummary {
  path: string;
  frontmatter: Frontmatter;
  claims: ParsedClaimBlockRecord[];
}

const defaultGeneratedAt = "2026-05-25T00:00:00.000Z";

export async function createWorkbenchSnapshot(
  root: string,
  options: WorkbenchSnapshotOptions = {}
): Promise<WorkbenchSnapshot> {
  const [review, transactions, followups, pageSummaries, ask] = await Promise.all([
    collectReviewInbox(root),
    collectTransactions(root),
    collectFollowups(root),
    collectPageSummaries(root),
    options.query ? retrieveContextForAnswer(root, options.query) : Promise.resolve(null)
  ]);

  return {
    generated_at: defaultGeneratedAt,
    review,
    transactions,
    followups,
    health: summarizeHealth(review, transactions, followups, pageSummaries),
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
    const route = await handleWorkbenchRoute(root, {
      method: request.method,
      url: request.url ?? "/"
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

  if (method !== "GET" && method !== "HEAD") {
    return jsonRoute(405, { error: "Workbench PR1 is read-only." });
  }

  const requestUrl = new URL(request.url, "http://127.0.0.1");

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
    return jsonRoute(200, await createWorkbenchSnapshot(root, { query: optionalQuery(requestUrl) }));
  }

  if (requestUrl.pathname === "/api/review") {
    return jsonRoute(200, await collectReviewInbox(root));
  }

  if (requestUrl.pathname === "/api/transactions") {
    return jsonRoute(200, await collectTransactions(root));
  }

  if (requestUrl.pathname === "/api/ask") {
    const query = optionalQuery(requestUrl);
    return jsonRoute(200, query ? await retrieveContextForAnswer(root, query) : { query: "", warnings: [] });
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

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

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

  return { items };
}

async function collectPageSummaries(root: string): Promise<ParsedPageSummary[]> {
  const files = await listFilesOrEmpty(root, "memory/**/*.md");
  const pages: ParsedPageSummary[] = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(await readMarkdownPage(root, file));
    pages.push({
      path: file,
      frontmatter: parsed.frontmatter,
      claims: parseClaimBlockRecords(parsed.body)
    });
  }

  return pages;
}

function summarizeHealth(
  review: WorkbenchReviewInbox,
  transactions: WorkbenchTransactionList,
  followups: WorkbenchFollowupList,
  pages: ParsedPageSummary[]
): WorkbenchHealthSummary {
  const pendingTransactions = transactions.items.filter((transaction) => transaction.transaction_state === "pending");
  const openFollowups = followups.items.filter(
    (followup) => !["closed", "rejected"].includes(followup.followup_state) && followup.object_state !== "archived"
  );
  const contestedPages = pages.filter((page) => page.frontmatter.review_state === "contested");
  const archivedPages = pages.filter((page) => page.frontmatter.object_state === "archived");
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
    warnings: healthWarnings(review, pendingTransactions, contestedPages)
  };
}

function healthWarnings(
  review: WorkbenchReviewInbox,
  pendingTransactions: WorkbenchTransactionSummary[],
  contestedPages: ParsedPageSummary[]
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
input {
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

.toolbar {
  align-items: center;
  display: flex;
  gap: 8px;
}

.toolbar input {
  border: 1px solid var(--line);
  border-radius: 6px;
  flex: 1;
  min-height: 38px;
  padding: 8px 10px;
}

.toolbar button {
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  min-height: 38px;
  padding: 8px 14px;
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
  .toolbar {
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

function render() {
  if (!snapshot) {
    view.innerHTML = "";
    return;
  }

  if (activeTab === "review") {
    renderCards(
      snapshot.review.items,
      (item) => item.id,
      (item) => \`\${item.review_reason} · \${item.review_state}\`,
      (item) => [item.path, item.source_events.join(", "), item.affected_files.join(", ")]
    );
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
      document.querySelector("#ask-result").innerHTML = cardsHtml(
        [...result.activeClaims, ...result.uncertainClaims],
        (claim) => claim.claim_id,
        (claim) => claim.statement,
        (claim) => [claim.page_path, claim.evidence.join(", "), claim.claim_state]
      );
    });
    return;
  }

  if (activeTab === "health") {
    const counts = snapshot.health.counts;
    renderCards(
      Object.keys(counts).map((key) => ({ key, count: counts[key] })),
      (item) => item.key.replaceAll("_", " "),
      (item) => String(item.count),
      () => snapshot.health.warnings
    );
    return;
  }

  view.innerHTML = \`<article class="item"><h2>Briefs</h2><p class="meta">Scheduled for PR5.</p></article>\`;
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
