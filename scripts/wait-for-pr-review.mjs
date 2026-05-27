#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_INITIAL_WAIT_SECONDS = 300;
const DEFAULT_RETRY_WAIT_SECONDS = 300;

function usage() {
  console.log(`Usage: pnpm pr:review-wait <pr-number-or-url> [options]

Options:
  --repo <owner/name>               GitHub repository. Defaults to GH_REPO or origin remote.
  --initial-wait-seconds <seconds>  Delay before first check. Default: ${DEFAULT_INITIAL_WAIT_SECONDS}.
  --retry-wait-seconds <seconds>    Delay before retry after Copilot error/no threads. Default: ${DEFAULT_RETRY_WAIT_SECONDS}.
  --json                            Print machine-readable JSON.
  --help                            Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    initialWaitSeconds: DEFAULT_INITIAL_WAIT_SECONDS,
    retryWaitSeconds: DEFAULT_RETRY_WAIT_SECONDS,
    pr: undefined,
    repo: process.env.GH_REPO
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--repo") {
      options.repo = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--initial-wait-seconds") {
      options.initialWaitSeconds = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }

    if (arg === "--retry-wait-seconds") {
      options.retryWaitSeconds = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.pr !== undefined) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    options.pr = arg;
  }

  if (options.pr === undefined) {
    throw new Error("Missing PR number or URL.");
  }

  if (!Number.isFinite(options.initialWaitSeconds) || options.initialWaitSeconds < 0) {
    throw new Error("--initial-wait-seconds must be a non-negative integer.");
  }

  if (!Number.isFinite(options.retryWaitSeconds) || options.retryWaitSeconds < 0) {
    throw new Error("--retry-wait-seconds must be a non-negative integer.");
  }

  return options;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function parsePrNumber(pr) {
  const match = pr.match(/(?:\/pull\/|^)(\d+)(?:$|[/?#])/u);
  if (!match) {
    throw new Error(`Could not parse PR number from ${pr}`);
  }
  return Number.parseInt(match[1], 10);
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
  const normalized = login.toLowerCase();
  return normalized.includes("copilot");
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
  const copilotErrorReviews = reviews.filter((review) => {
    return isCopilotAuthor(review.author?.login ?? "") && isTransientCopilotError(review.body ?? "");
  });

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
    copilotErrorReviews: copilotErrorReviews.map((review) => {
      return {
        author: review.author?.login,
        submittedAt: review.submittedAt,
        url: review.url
      };
    })
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

function formatSummary(summary, label) {
  const lines = [
    `${label}: ${summary.url}`,
    `reviewDecision=${summary.reviewDecision ?? "UNKNOWN"} mergeable=${summary.mergeable ?? "UNKNOWN"} draft=${summary.isDraft}`,
    `reviewThreads=${summary.threadCount} unresolved=${summary.unresolvedThreadCount}`,
    `transientCopilotErrors=${summary.copilotErrorReviewCount}`
  ];

  for (const thread of summary.unresolvedThreads) {
    lines.push(`- unresolved ${thread.id} ${thread.path ?? ""}${thread.line === null ? "" : `:${thread.line}`} ${thread.url ?? ""}`);
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prNumber = parsePrNumber(options.pr);
  const repo = resolveRepo(options.repo);
  const [owner, name] = repo.split("/");

  if (!owner || !name) {
    throw new Error(`Invalid repo: ${repo}`);
  }

  if (!options.json) {
    console.log(`Waiting ${options.initialWaitSeconds}s before checking PR #${prNumber} review threads...`);
  }
  await sleep(options.initialWaitSeconds * 1000);

  const first = fetchReviewSummary(owner, name, prNumber);
  let final = first;
  let retried = false;

  const shouldRetry = first.unresolvedThreadCount === 0 && (first.threadCount === 0 || first.copilotErrorReviewCount > 0);
  if (shouldRetry) {
    retried = true;
    if (!options.json) {
      console.log(formatSummary(first, "First check"));
      console.log(`Waiting ${options.retryWaitSeconds}s for a second review-thread check...`);
    }
    await sleep(options.retryWaitSeconds * 1000);
    final = fetchReviewSummary(owner, name, prNumber);
  }

  const result = {
    repo,
    prNumber,
    retried,
    first,
    final,
    recommendation:
      final.unresolvedThreadCount > 0
        ? "address_unresolved_threads"
        : "no_unresolved_threads_after_wait"
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (!retried) {
      console.log(formatSummary(first, "Review check"));
    } else {
      console.log(formatSummary(final, "Second check"));
    }
    console.log(`recommendation=${result.recommendation}`);
  }

  if (final.unresolvedThreadCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
