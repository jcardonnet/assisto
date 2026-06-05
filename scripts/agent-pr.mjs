#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const prStates = [
  "branch_created",
  "implementation_done",
  "validation_passed",
  "memory_guard_passed",
  "pr_opened",
  "review_requested",
  "wait_elapsed",
  "review_threads_checked",
  "fixes_applied",
  "ci_green",
  "merge_ready",
  "merged",
  "main_synced",
  "mixedbread_refreshed",
  "closed_out"
];

function usage() {
  console.log(`Usage: pnpm agent:pr status <pr> [--json]
       pnpm agent:pr advance <state> <pr>
       pnpm agent:pr comments <pr> [--write]
       pnpm agent:pr closeout <pr> [--merge --yes --refresh-mxbai] [--with-review-check]

Tracks explicit PR state transitions and refuses unsafe closeout.
`);
}

function iso(now = new Date()) {
  return now.toISOString();
}

function runsDir(root) {
  return path.join(root, ".assisto-agent", "runs");
}

function activeRunPath(root) {
  return path.join(runsDir(root), "active-run");
}

function runPath(root, id) {
  return path.join(runsDir(root), `${id}.json`);
}

function snapshotPath(root, runId, pr) {
  return path.join(runsDir(root), `${runId}-pr-${pr}-review-threads.json`);
}

async function readTextOrNull(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${filePath}.tmp`, filePath);
}

async function loadActiveRun(root) {
  const id = (await readTextOrNull(activeRunPath(root)))?.trim();
  if (!id) {
    throw new Error("No active agent run exists.");
  }
  return await readJson(runPath(root, id));
}

async function saveActiveRun(root, run) {
  await writeJson(runPath(root, run.id), run);
  await writeFile(activeRunPath(root), `${run.id}\n`);
}

function stateRank(state) {
  return prStates.indexOf(state);
}

function assertKnownState(state) {
  if (!prStates.includes(state)) {
    throw new Error(`Unknown PR state: ${state}`);
  }
}

export async function advancePrState({
  root = process.cwd(),
  pr,
  state,
  now = new Date()
}) {
  assertKnownState(state);
  if (!pr) {
    throw new Error("PR number or URL is required.");
  }
  const run = await loadActiveRun(root);
  const current = run.pr_state ?? {
    pr,
    state: "branch_created",
    transitions: [],
    review_threads_path: null
  };
  current.pr = pr;
  current.state = state;
  current.transitions.push({
    state,
    pr,
    changed_at: iso(now)
  });
  run.pr_state = current;
  run.updated_at = iso(now);
  if (state === "validation_passed") {
    run.validation_status = "passed";
  }
  if (state === "review_requested") {
    run.review_state = "requested";
  }
  await saveActiveRun(root, run);
  return run;
}

export async function storePrReviewSnapshot({
  root = process.cwd(),
  pr,
  summary,
  now = new Date()
}) {
  const run = await loadActiveRun(root);
  const filePath = snapshotPath(root, run.id, pr);
  await writeJson(filePath, {
    schema_version: 1,
    pr,
    recorded_at: iso(now),
    summary
  });
  run.pr_state = run.pr_state ?? {
    pr,
    state: "branch_created",
    transitions: [],
    review_threads_path: null
  };
  run.pr_state.pr = pr;
  run.pr_state.review_threads_path = path.relative(root, filePath);
  run.updated_at = iso(now);
  await saveActiveRun(root, run);
  return filePath;
}

export function checkStatusRollup(statusCheckRollup = []) {
  if (statusCheckRollup.length === 0) {
    return { passed: false, reason: "no_status_checks" };
  }
  const failing = statusCheckRollup.filter((check) => {
    if (check.conclusion !== undefined && check.conclusion !== null) {
      return !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion);
    }
    if (check.status !== undefined && check.status !== null) {
      return check.status !== "COMPLETED";
    }
    return false;
  });
  return failing.length === 0 ? { passed: true, reason: "status_checks_passed" } : { passed: false, reason: "status_checks_not_green" };
}

export function evaluatePrCloseoutReadiness({
  prInfo,
  reviewSummary,
  memoryGuard,
  run,
  options = {}
}) {
  const blockers = [];
  const checks = checkStatusRollup(prInfo.statusCheckRollup);
  const skipReviewCheck = options.skipReviewCheck === true;

  if (!skipReviewCheck && (reviewSummary?.unresolvedThreadCount ?? 0) > 0) {
    blockers.push("unresolved_review_threads");
  }
  if (!skipReviewCheck && stateRank(run?.pr_state?.state ?? "branch_created") < stateRank("wait_elapsed")) {
    blockers.push("review_wait_not_elapsed");
  }
  if (prInfo.isDraft) {
    blockers.push("pr_is_draft");
  }
  if (prInfo.mergeable !== "MERGEABLE") {
    blockers.push("pr_not_mergeable");
  }
  if (!checks.passed) {
    blockers.push("ci_not_green");
  }
  if ((memoryGuard?.changed ?? []).length > 0) {
    blockers.push("memory_guard_failed");
  }
  if (run?.validation_status !== "passed") {
    blockers.push("validation_not_recorded_passed");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    checks,
    review_check: skipReviewCheck ? "skipped_copilot_disabled" : "required"
  };
}

function parseArgs(argv) {
  const options = { _: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--merge") {
      options.merge = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "--refresh-mxbai") {
      options.refreshMxbai = true;
      continue;
    }
    if (arg === "--with-review-check") {
      options.withReviewCheck = true;
      continue;
    }
    if (arg === "--skip-wait") {
      options.skipWait = true;
      continue;
    }
    if (arg === "--repo") {
      options.repo = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--initial-wait-seconds") {
      options.initialWaitSeconds = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--retry-wait-seconds") {
      options.retryWaitSeconds = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options._.push(arg);
  }
  return options;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function inherit(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" } });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function buildMxbaiCloseoutRefreshCommand() {
  return {
    command: "pnpm",
    args: ["agent:mxbai", "refresh"]
  };
}

function parsePrNumber(pr) {
  const match = pr.match(/(?:\/pull\/|^)(\d+)(?:$|[/?#])/u);
  if (!match) {
    throw new Error(`Could not parse PR number from ${pr}`);
  }
  return match[1];
}

function parseRepoFromRemote(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/u);
  if (!match) {
    throw new Error("Could not infer GitHub repo from origin remote. Pass --repo owner/name.");
  }
  return `${match[1]}/${match[2]}`;
}

function resolveRepo(repo) {
  if (repo !== undefined && repo.trim() !== "") {
    return repo;
  }
  return parseRepoFromRemote(run("git", ["remote", "get-url", "origin"]));
}

function isCopilotAuthor(login) {
  return login.toLowerCase().includes("copilot");
}

function isTransientCopilotError(body) {
  const normalized = body.toLowerCase();
  return normalized.includes("encountered an error") && normalized.includes("unable to review");
}

function summarizeReviewData(data) {
  const pullRequest = data.data.repository.pullRequest;
  const threads = pullRequest.reviewThreads.nodes;
  const reviews = pullRequest.reviews.nodes;
  const unresolvedThreads = threads.filter((thread) => !thread.isResolved);
  const copilotErrorReviews = reviews.filter((review) => isCopilotAuthor(review.author?.login ?? "") && isTransientCopilotError(review.body ?? ""));
  return {
    url: pullRequest.url,
    reviewDecision: pullRequest.reviewDecision,
    isDraft: pullRequest.isDraft,
    mergeable: pullRequest.mergeable,
    threadCount: threads.length,
    unresolvedThreadCount: unresolvedThreads.length,
    unresolvedThreads: unresolvedThreads.map((thread) => {
      const firstComment = thread.comments.nodes[0];
      return {
        id: thread.id,
        author: firstComment?.author?.login,
        path: firstComment?.path,
        line: firstComment?.line,
        url: firstComment?.url,
        body: firstComment?.body
      };
    }),
    copilotErrorReviewCount: copilotErrorReviews.length,
    copilotErrorReviews: copilotErrorReviews.map((review) => ({
      author: review.author?.login,
      submittedAt: review.submittedAt,
      url: review.url
    }))
  };
}

function fetchReviewSummary(owner, name, number) {
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          url
          reviewDecision
          isDraft
          mergeable
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 10) {
                nodes {
                  author { login }
                  body
                  path
                  line
                  url
                }
              }
            }
          }
          reviews(first: 100) {
            nodes {
              author { login }
              state
              body
              submittedAt
              url
            }
          }
        }
      }
    }
  `;
  const output = run("gh", [
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${number}`
  ]);
  return summarizeReviewData(JSON.parse(output));
}

function fetchPrInfo(prNumber, repo) {
  return JSON.parse(
    run("gh", [
      "pr",
      "view",
      prNumber,
      "--repo",
      repo,
      "--json",
      "url,isDraft,mergeable,reviewDecision,statusCheckRollup,title"
    ])
  );
}

function runMemoryGuard() {
  const output = run("pnpm", ["check:memory-data", "--", "--base", "origin/main", "--json"]);
  return JSON.parse(output.slice(output.indexOf("{")));
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.ready !== undefined) {
    console.log(`ready=${value.ready}`);
    console.log(`blockers=${value.blockers.join(",") || "none"}`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

async function commandStatus(pr, options) {
  const repo = resolveRepo(options.repo);
  const prNumber = parsePrNumber(pr);
  const [owner, name] = repo.split("/");
  const runState = await loadActiveRun(process.cwd());
  const reviewSummary = fetchReviewSummary(owner, name, Number.parseInt(prNumber, 10));
  const prInfo = fetchPrInfo(prNumber, repo);
  const memoryGuard = runMemoryGuard();
  const readiness = evaluatePrCloseoutReadiness({ prInfo, reviewSummary, memoryGuard, run: runState });
  print({ pr: prNumber, repo, pr_state: runState.pr_state ?? null, readiness, prInfo, reviewSummary, memoryGuard }, options.json);
}

async function commandComments(pr, options) {
  const repo = resolveRepo(options.repo);
  const prNumber = parsePrNumber(pr);
  const [owner, name] = repo.split("/");
  const summary = fetchReviewSummary(owner, name, Number.parseInt(prNumber, 10));
  if (options.write) {
    const filePath = await storePrReviewSnapshot({ pr: prNumber, summary });
    await advancePrState({ pr: prNumber, state: "review_threads_checked" });
    print({ pr: prNumber, reviewSummary: summary, path: filePath }, options.json);
    return;
  }
  print({ pr: prNumber, reviewSummary: summary }, options.json);
}

async function waitForReview(prNumber, repo, options) {
  if (options.skipWait) {
    return;
  }
  const args = ["pr:review-wait", "--", prNumber, "--repo", repo];
  if (options.initialWaitSeconds !== undefined) {
    args.push("--initial-wait-seconds", options.initialWaitSeconds);
  }
  if (options.retryWaitSeconds !== undefined) {
    args.push("--retry-wait-seconds", options.retryWaitSeconds);
  }
  inherit("pnpm", args);
  await advancePrState({ pr: prNumber, state: "wait_elapsed" });
}

async function commandCloseout(pr, options) {
  if (options.merge && !options.yes) {
    throw new Error("agent:pr closeout --merge requires --yes.");
  }
  const repo = resolveRepo(options.repo);
  const prNumber = parsePrNumber(pr);
  const [owner, name] = repo.split("/");
  const shouldCheckReviews = options.withReviewCheck === true;
  if (shouldCheckReviews) {
    await waitForReview(prNumber, repo, options);
  }
  const reviewSummary = shouldCheckReviews ? fetchReviewSummary(owner, name, Number.parseInt(prNumber, 10)) : null;
  if (reviewSummary !== null) {
    await storePrReviewSnapshot({ pr: prNumber, summary: reviewSummary });
    await advancePrState({ pr: prNumber, state: "review_threads_checked" });
  }
  const runState = await loadActiveRun(process.cwd());
  const prInfo = fetchPrInfo(prNumber, repo);
  const memoryGuard = runMemoryGuard();
  const readiness = evaluatePrCloseoutReadiness({
    prInfo,
    reviewSummary,
    memoryGuard,
    run: runState,
    options: { skipReviewCheck: !shouldCheckReviews }
  });
  if (!readiness.ready) {
    throw new Error(`PR is not merge-ready: ${readiness.blockers.join(", ")}`);
  }
  await advancePrState({ pr: prNumber, state: "merge_ready" });
  if (!options.merge) {
    print({ ready: true, blockers: [] }, options.json);
    return;
  }
  inherit("gh", ["pr", "merge", prNumber, "--repo", repo, "--squash", "--delete-branch"]);
  await advancePrState({ pr: prNumber, state: "merged" });
  inherit("git", ["switch", "main"]);
  inherit("git", ["pull", "--ff-only", "origin", "main"]);
  await advancePrState({ pr: prNumber, state: "main_synced" });
  if (options.refreshMxbai) {
    const refresh = buildMxbaiCloseoutRefreshCommand();
    inherit(refresh.command, refresh.args);
    await advancePrState({ pr: prNumber, state: "mixedbread_refreshed" });
  }
  await advancePrState({ pr: prNumber, state: "closed_out" });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  if (command === undefined || command === "--help" || command === "-h" || options.help) {
    usage();
    return;
  }
  if (command === "status") {
    const pr = options._[0];
    if (!pr) {
      throw new Error("agent:pr status requires a PR number or URL.");
    }
    await commandStatus(pr, options);
    return;
  }
  if (command === "advance") {
    const [state, pr] = options._;
    await advancePrState({ state, pr });
    console.log(`advanced ${pr} to ${state}`);
    return;
  }
  if (command === "comments") {
    const pr = options._[0];
    if (!pr) {
      throw new Error("agent:pr comments requires a PR number or URL.");
    }
    await commandComments(pr, options);
    return;
  }
  if (command === "closeout") {
    const pr = options._[0];
    if (!pr) {
      throw new Error("agent:pr closeout requires a PR number or URL.");
    }
    await commandCloseout(pr, options);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
