#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";

function usage() {
  console.log(`Usage: pnpm pr:closeout <pr-number-or-url> [options]

Checks delayed review threads, CI/mergeability, and optionally performs the authorized merge + post-merge sync.

Options:
  --repo <owner/name>               GitHub repository. Defaults to GH_REPO or origin remote.
  --skip-wait                       Skip pnpm pr:review-wait.
  --initial-wait-seconds <seconds>  Passed to pnpm pr:review-wait.
  --retry-wait-seconds <seconds>    Passed to pnpm pr:review-wait.
  --merge                           Merge after checks pass.
  --yes                             Required with --merge.
  --merge-method <method>           squash, merge, or rebase. Default: squash.
  --subject <text>                  Merge commit/squash title.
  --refresh-mxbai                   After merge, run pnpm mxbai:upload and pnpm mxbai:smoke.
  --dry-run                         Print planned steps without network or git writes.
  --help                            Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    pr: undefined,
    repo: process.env.GH_REPO,
    skipWait: false,
    initialWaitSeconds: undefined,
    retryWaitSeconds: undefined,
    merge: false,
    yes: false,
    mergeMethod: "squash",
    subject: undefined,
    refreshMxbai: false,
    dryRun: false
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
    if (arg === "--repo") {
      options.repo = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--skip-wait") {
      options.skipWait = true;
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
    if (arg === "--merge") {
      options.merge = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "--merge-method") {
      options.mergeMethod = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--subject") {
      options.subject = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--refresh-mxbai") {
      options.refreshMxbai = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
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
  if (!["squash", "merge", "rebase"].includes(options.mergeMethod)) {
    throw new Error("--merge-method must be squash, merge, or rebase.");
  }
  if (options.merge && !options.yes) {
    throw new Error("--merge requires --yes.");
  }

  return options;
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  if (options.dryRun) {
    console.log(`DRY-RUN $ ${printable}`);
    return "";
  }
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function inherit(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  if (options.dryRun) {
    console.log(`DRY-RUN $ ${printable}`);
    return;
  }
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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

function resolveRepo(repo, dryRun) {
  if (repo !== undefined && repo.trim() !== "") {
    return repo;
  }
  if (dryRun) {
    return "owner/repo";
  }
  return parseRepoFromRemote(run("git", ["remote", "get-url", "origin"]));
}

function checkStatusRollup(statusCheckRollup = []) {
  if (statusCheckRollup.length === 0) {
    return { passed: false, reason: "no status checks reported" };
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

  return failing.length === 0
    ? { passed: true, reason: "status checks passed" }
    : { passed: false, reason: `${failing.length} status checks are not successful` };
}

function waitForReview(options, repo, prNumber) {
  if (options.skipWait) {
    console.log("Skipping delayed review-thread check.");
    return;
  }

  const args = ["scripts/wait-for-pr-review.mjs", prNumber, "--repo", repo];
  if (options.initialWaitSeconds !== undefined) {
    args.push("--initial-wait-seconds", options.initialWaitSeconds);
  }
  if (options.retryWaitSeconds !== undefined) {
    args.push("--retry-wait-seconds", options.retryWaitSeconds);
  }
  inherit(process.execPath, args, options);
}

function fetchPrInfo(prNumber, repo, dryRun) {
  if (dryRun) {
    return {
      url: `https://github.com/owner/repo/pull/${prNumber}`,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      statusCheckRollup: [{ conclusion: "SUCCESS" }]
    };
  }

  const output = run("gh", [
    "pr",
    "view",
    prNumber,
    "--repo",
    repo,
    "--json",
    "url,isDraft,mergeable,reviewDecision,statusCheckRollup,title"
  ]);
  return JSON.parse(output);
}

function assertMergeReady(info) {
  const checks = checkStatusRollup(info.statusCheckRollup);
  if (info.isDraft) {
    throw new Error("PR is still draft.");
  }
  if (info.mergeable !== "MERGEABLE") {
    throw new Error(`PR is not mergeable: ${info.mergeable}`);
  }
  if (!checks.passed) {
    throw new Error(`PR checks are not green: ${checks.reason}`);
  }
}

function mergePr(options, repo, prNumber) {
  const args = ["pr", "merge", prNumber, "--repo", repo, `--${options.mergeMethod}`, "--delete-branch"];
  if (options.subject !== undefined) {
    args.push("--subject", options.subject);
  }
  inherit("gh", args, options);
}

function syncMainAndRefresh(options) {
  inherit("git", ["switch", "main"], options);
  inherit("git", ["pull", "--ff-only", "origin", "main"], options);
  inherit("git", ["status", "--short", "--branch"], options);

  if (options.refreshMxbai) {
    inherit("pnpm", ["mxbai:upload"], options);
    inherit("pnpm", ["mxbai:smoke"], options);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const prNumber = parsePrNumber(options.pr);
  const repo = resolveRepo(options.repo, options.dryRun);

  console.log(`PR closeout for ${repo}#${prNumber}`);
  waitForReview(options, repo, prNumber);

  const info = fetchPrInfo(prNumber, repo, options.dryRun);
  const checks = checkStatusRollup(info.statusCheckRollup);
  console.log(`url=${info.url}`);
  console.log(`draft=${info.isDraft} mergeable=${info.mergeable} reviewDecision=${info.reviewDecision ?? "UNKNOWN"}`);
  console.log(`checks=${checks.reason}`);

  if (options.merge) {
    assertMergeReady(info);
    mergePr(options, repo, prNumber);
    syncMainAndRefresh(options);
  } else {
    console.log("read-only closeout complete; pass --merge --yes to merge after checks pass");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
