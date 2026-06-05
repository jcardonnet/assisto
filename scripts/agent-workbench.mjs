#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { buildPolicyResult } from "./agent-policy.mjs";
import { buildRepoMap } from "./agent-map.mjs";

function usage() {
  console.log(`Usage: pnpm agent:workbench serve [--host 127.0.0.1] [--port 3731]

Starts the local-only Agent Workbench for run state, validation, diagnostics, PR state, repo map, and handoff.
`);
}

function parseArgs(argv) {
  const options = { host: "127.0.0.1", port: 3731 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--host") {
      options.host = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("Invalid port.");
  }
  return options;
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

async function readJsonOrNull(filePath) {
  const text = await readTextOrNull(filePath);
  return text === null ? null : JSON.parse(text);
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function changedFiles(root) {
  return [
    ...runGit(root, ["diff", "--name-only", "origin/main...HEAD"]).split("\n"),
    ...runGit(root, ["status", "--porcelain"]).split("\n").map((line) => line.replace(/^.{2}\s?/u, "").trim())
  ].filter(Boolean).sort();
}

async function loadActiveRun(root) {
  const runId = (await readTextOrNull(path.join(root, ".assisto-agent", "runs", "active-run")))?.trim();
  return runId ? await readJsonOrNull(path.join(root, ".assisto-agent", "runs", `${runId}.json`)) : null;
}

async function loadLastCommand(root) {
  const commandId = (await readTextOrNull(path.join(root, ".assisto-agent", "logs", "last-command")))?.trim();
  return commandId ? await readJsonOrNull(path.join(root, ".assisto-agent", "logs", `${commandId}.json`)) : null;
}

async function loadRepoMap(root) {
  return (await readJsonOrNull(path.join(root, ".assisto-agent", "cache", "repo-map.json"))) ?? buildRepoMap();
}

export async function buildAgentWorkbenchSnapshot(root = process.cwd()) {
  const files = changedFiles(root);
  return {
    generated_at: new Date().toISOString(),
    run: await loadActiveRun(root),
    last_command: await loadLastCommand(root),
    policy: buildPolicyResult({ changedFiles: files }),
    repo_map: await loadRepoMap(root)
  };
}

export function previewAgentWorkbenchAction(kind) {
  if (kind === "validation_plan") {
    return {
      kind,
      mutating: false,
      command: ["pnpm", "agent:validate", "--", "--plan", "--json"]
    };
  }
  if (kind === "handoff") {
    return {
      kind,
      mutating: false,
      command: ["pnpm", "agent:handoff"]
    };
  }
  if (kind === "note_next") {
    return {
      kind,
      mutating: true,
      command: ["pnpm", "agent:note", "--", "--kind", "next", "--text", "Review Agent Workbench output."]
    };
  }
  throw new Error(`Unknown action kind: ${kind}`);
}

function runAction(root, action) {
  const result = spawnSync(action.command[0], action.command.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp"
    }
  });
  return {
    command: action.command,
    exit_code: result.error === undefined ? (result.status ?? 0) : 1,
    stdout: result.stdout ?? "",
    stderr: result.error === undefined ? (result.stderr ?? "") : `${result.stderr ?? ""}\n${result.error.message}`
  };
}

function json(value, status = 200) {
  return globalThis.Response.json(value, { status });
}

function jsonError(message, status = 500) {
  return json({ error: message }, status);
}

function defaultCommandRunner(root) {
  return async (command) => {
    const result = spawnSync(command[0], command.slice(1), {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        TMPDIR: "/tmp",
        TEMP: "/tmp",
        TMP: "/tmp"
      }
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error((result.stderr ?? "").trim() || `Command failed: ${command.join(" ")}`);
    }
    return result.stdout ?? "";
  };
}

async function runJsonCommand(command, commandRunner) {
  return JSON.parse(await commandRunner(command));
}

export function createAgentWorkbenchApp({ root = process.cwd(), commandRunner = defaultCommandRunner(root) } = {}) {
  return {
    async handle(request) {
      try {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/") {
          return new globalThis.Response(pageHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        if (request.method === "GET" && url.pathname === "/api/snapshot") {
          return json(await buildAgentWorkbenchSnapshot(root));
        }
        if (request.method === "GET" && url.pathname === "/api/validation/plan") {
          return json(await runJsonCommand(["pnpm", "agent:validate", "--", "--plan", "--json"], commandRunner));
        }
        if (request.method === "POST" && url.pathname === "/api/stage/classify") {
          const body = await request.json();
          const { classifyStageRequest } = await import("./agent-stage.mjs");
          return json(classifyStageRequest({
            paths: body.paths ?? [],
            allowMemoryData: body.allowMemoryData === true,
            root
          }));
        }
        if (request.method === "GET" && url.pathname === "/api/mxbai/plan") {
          const { buildMxbaiRefreshPlan } = await import("./agent-mxbai.mjs");
          return json(buildMxbaiRefreshPlan({}));
        }
        if (request.method === "POST" && url.pathname === "/api/action/preview") {
          return json(previewAgentWorkbenchAction((await request.json()).kind));
        }
        if (request.method === "POST" && url.pathname === "/api/action/run") {
          const body = await request.json();
          const action = previewAgentWorkbenchAction(body.kind);
          if (action.mutating && body.confirmed !== true) {
            return jsonError("Mutating action requires explicit confirmation.", 400);
          }
          return json(runAction(root, action));
        }
        return jsonError("Not found", 404);
      } catch (error) {
        return jsonError(error.message);
      }
    }
  };
}

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Assisto Agent Workbench</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #17202a; background: #f6f7f9; }
    body { margin: 0; }
    header { padding: 20px 28px; border-bottom: 1px solid #d8dde6; background: #fff; }
    h1 { margin: 0; font-size: 22px; }
    main { padding: 20px 28px 32px; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    button { border: 1px solid #bdc7d5; background: #fff; color: #17202a; border-radius: 6px; padding: 8px 11px; cursor: pointer; }
    button.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    section { display: none; max-width: 1100px; }
    section.active { display: block; }
    .panel { background: #fff; border: 1px solid #d8dde6; border-radius: 8px; padding: 16px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #111827; color: #f9fafb; border-radius: 6px; padding: 12px; max-height: 360px; overflow: auto; }
    .mutating { border-left: 4px solid #b42318; }
    label { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
  </style>
</head>
<body>
  <header>
    <h1>Assisto Agent Workbench</h1>
  </header>
  <main>
    <nav aria-label="Agent Workbench tabs">
      ${["Run", "Validation", "Diagnostics", "PR", "Staging", "Mixedbread", "Repo Map", "Handoff"].map((tab, index) => `<button class="${index === 0 ? "active" : ""}" data-tab="${tab}">${tab}</button>`).join("")}
    </nav>
    <section class="active" data-panel="Run"><div class="panel"><h2>Run</h2><div id="run"></div></div></section>
    <section data-panel="Validation"><div class="panel"><h2>Validation Plan</h2><button data-load="validation">Refresh validation plan</button><pre id="validation-output"></pre></div></section>
    <section data-panel="Diagnostics"><div class="panel"><h2>Diagnostics</h2><div id="diagnostics"></div></div></section>
    <section data-panel="PR"><div class="panel"><h2>PR</h2><div id="pr"></div><div class="panel"><h3>No-Copilot Closeout</h3><p>Closeout still requires green CI, mergeable non-draft PR, validation evidence, and memory-data guard pass.</p></div><div class="panel mutating"><h3>Confirmed Action</h3><label><input type="checkbox" id="confirm-note"> Confirm note write</label><button data-action="note_next" id="note-button" disabled>Record next-action note</button><pre id="note-output"></pre></div></div></section>
    <section data-panel="Staging"><div class="panel"><h2>Staging</h2><button data-load="stage">Check memory-data guard</button><pre id="stage-output"></pre></div></section>
    <section data-panel="Mixedbread"><div class="panel"><h2>Mixedbread</h2><button data-load="mxbai">Preview refresh plan</button><pre id="mxbai-output"></pre></div></section>
    <section data-panel="Repo Map"><div class="panel"><h2>Repo Map</h2><div id="repo-map"></div></div></section>
    <section data-panel="Handoff"><div class="panel"><h2>Handoff</h2><button data-action="handoff">Preview handoff command</button><pre id="handoff-output"></pre></div></section>
  </main>
  <script>
    const state = { snapshot: null };
    function text(value) { return value == null ? "none" : String(value); }
    function commandLine(command) { return command.join(" "); }
    async function jsonFetch(url, options) {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || response.statusText);
      return body;
    }
    async function load() {
      state.snapshot = await jsonFetch("/api/snapshot");
      document.querySelector("#run").innerHTML = "<div class='grid'><div><strong>Objective</strong><br>" + text(state.snapshot.run?.objective) + "</div><div><strong>Branch</strong><br>" + text(state.snapshot.run?.branch) + "</div><div><strong>Validation</strong><br>" + text(state.snapshot.run?.validation_status) + "</div></div>";
      document.querySelector("#diagnostics").innerHTML = "<pre>" + JSON.stringify(state.snapshot.last_command || { message: "No command logs yet." }, null, 2) + "</pre>";
      document.querySelector("#pr").innerHTML = "<pre>" + JSON.stringify(state.snapshot.run?.pr_state || { message: "No PR state recorded." }, null, 2) + "</pre>";
      document.querySelector("#repo-map").innerHTML = state.snapshot.repo_map.areas.map((area) => "<article class='panel'><strong>" + area.area + "</strong><br>Tests: " + area.tests.join(", ") + "<br>Commands: " + area.commands.join(", ") + "</article>").join("");
    }
    async function loadValidationPlan() {
      const body = await jsonFetch("/api/validation/plan");
      document.querySelector("#validation-output").textContent = JSON.stringify(body, null, 2);
    }
    async function loadStageGuard() {
      const body = await jsonFetch("/api/stage/classify", { method: "POST", body: JSON.stringify({ paths: ["memory/events/example.md"] }) });
      document.querySelector("#stage-output").textContent = JSON.stringify(body, null, 2);
    }
    async function loadMxbaiPlan() {
      const body = await jsonFetch("/api/mxbai/plan");
      document.querySelector("#mxbai-output").textContent = JSON.stringify(body, null, 2);
    }
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
        document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === button.dataset.tab));
      });
    });
    document.querySelector("#confirm-note").addEventListener("change", (event) => {
      document.querySelector("#note-button").disabled = !event.target.checked;
    });
    document.querySelectorAll("[data-load]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.dataset.load === "validation") await loadValidationPlan();
        if (button.dataset.load === "stage") await loadStageGuard();
        if (button.dataset.load === "mxbai") await loadMxbaiPlan();
      });
    });
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const kind = button.dataset.action;
        const output = document.querySelector(kind === "validation_plan" ? "#validation-output" : kind === "handoff" ? "#handoff-output" : "#note-output");
        const confirmed = kind === "note_next" && document.querySelector("#confirm-note").checked;
        const body = await jsonFetch("/api/action/preview", { method: "POST", body: JSON.stringify({ kind }) });
        if (kind !== "note_next") {
          output.textContent = commandLine(body.command);
          return;
        }
        const result = await jsonFetch("/api/action/run", { method: "POST", body: JSON.stringify({ kind, confirmed }) });
        output.textContent = JSON.stringify(result, null, 2);
        await load();
      });
    });
    load().catch((error) => { document.body.insertAdjacentHTML("beforeend", "<pre>" + error.message + "</pre>"); });
  </script>
</body>
</html>`;
}

async function requestFromNode(request, host) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const url = new URL(request.url ?? "/", `http://${host}`);
  const init = {
    method: request.method,
    headers: request.headers
  };
  if (body !== undefined) {
    init.body = body;
  }
  return new globalThis.Request(url, init);
}

export async function startAgentWorkbenchServer({ root = process.cwd(), host = "127.0.0.1", port = 3731, commandRunner } = {}) {
  const app = createAgentWorkbenchApp({ root, commandRunner });
  const server = createServer(async (request, response) => {
    const fetchResponse = await app.handle(await requestFromNode(request, host));
    response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers));
    response.end(Buffer.from(await fetchResponse.arrayBuffer()));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  if (command === undefined || command === "--help" || command === "-h" || options.help) {
    usage();
    return;
  }
  if (command !== "serve") {
    throw new Error(`Unknown command: ${command}`);
  }
  const server = await startAgentWorkbenchServer({ host: options.host, port: options.port });
  console.log(`Agent Workbench: ${server.url}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
