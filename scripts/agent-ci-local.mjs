#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const defaultImage = "assisto-agent-ci-local:node22";
const credentialEnv = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "MXBAI_API_KEY",
  "OPENAI_API_KEY",
  "ASSISTO_OPENAI_MODEL",
  "ASSISTO_OPENAI_BASE_URL"
];

function usage() {
  console.log(`Usage: pnpm agent:ci-local --plan
       pnpm agent:ci-local

Runs the reproducible local CI capsule. GitHub Actions remains the authoritative remote CI gate.
`);
}

export function buildCiLocalPlan({
  root = process.cwd(),
  image = defaultImage
} = {}) {
  const dockerfile = ".devcontainer/Dockerfile";
  const script = ".devcontainer/ci-local.sh";
  const runArgs = [
    "run",
    "--rm",
    "-t",
    "-v",
    `${root}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    "TMPDIR=/tmp",
    "-e",
    "TEMP=/tmp",
    "-e",
    "TMP=/tmp",
    "-e",
    "COREPACK_HOME=/tmp/corepack",
    "-e",
    "XDG_CACHE_HOME=/tmp/xdg-cache",
    "-e",
    "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
    ...credentialEnv.flatMap((name) => ["-e", name]),
    image,
    "bash",
    script
  ];

  return {
    image,
    root,
    dockerfile,
    script,
    credential_env: credentialEnv,
    temp_env: {
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp",
      COREPACK_HOME: "/tmp/corepack",
      XDG_CACHE_HOME: "/tmp/xdg-cache",
      PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright"
    },
    steps: [
      {
        name: "docker_available",
        command: ["docker", "--version"],
        reason: "The local CI capsule runs in Docker/devcontainer-compatible infrastructure."
      },
      {
        name: "build_image",
        command: ["docker", "build", "-f", dockerfile, "-t", image, "."],
        reason: "Build a Node 22 image with the repo CI prerequisites."
      },
      {
        name: "run_ci",
        command: ["docker", ...runArgs],
        reason: "Run install, Chromium setup, and validate:ci-parity in a WSL-safe environment."
      }
    ]
  };
}

function parseArgs(argv) {
  const options = { plan: false, json: false, image: defaultImage };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--plan") {
      options.plan = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--image") {
      options.image = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function commandLine(command) {
  return command.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ");
}

function printPlan(plan, json) {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Local CI capsule image: ${plan.image}`);
  console.log(`Workspace: ${plan.root}`);
  for (const step of plan.steps) {
    console.log(`- ${step.name}: ${commandLine(step.command)}`);
    console.log(`  reason: ${step.reason}`);
  }
  console.log(`Credential pass-through: ${plan.credential_env.join(", ")}`);
}

function runStep(step) {
  console.log(`\n$ ${commandLine(step.command)}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp",
      COREPACK_HOME: "/tmp/corepack",
      XDG_CACHE_HOME: "/tmp/xdg-cache"
    }
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const plan = buildCiLocalPlan({ root: path.resolve(process.cwd()), image: options.image });
  if (options.plan) {
    printPlan(plan, options.json);
    return;
  }
  for (const step of plan.steps) {
    runStep(step);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
