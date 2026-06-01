import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const moduleUrlCache = new Map();
const outputRoot = path.join(os.tmpdir(), `assisto-ts-loader-${process.pid}-${Date.now()}`);
const importSpecifierPattern = /(from\s+["'])([^"']+)(["'])/g;
const workspacePackages = new Map([
  ["@assisto/core", "packages/core/src/index.ts"],
  ["@assisto/cli", "packages/cli/src/index.ts"],
  ["@assisto/workbench", "packages/workbench/src/index.ts"]
]);

export async function loadTsModule(entryPath) {
  const moduleUrl = await getModuleUrl(path.resolve(entryPath));
  return import(moduleUrl);
}

async function getModuleUrl(filePath) {
  const cached = moduleUrlCache.get(filePath);

  if (cached) {
    return cached;
  }

  const promise = buildModuleUrl(filePath);
  moduleUrlCache.set(filePath, promise);

  return promise;
}

async function buildModuleUrl(filePath) {
  const source = readFileSync(filePath, "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: true
    }
  }).outputText;
  const rewrites = new Map();
  const matches = output.matchAll(importSpecifierPattern);

  for (const match of matches) {
    const specifier = match[2];

    if (!specifier || (!specifier.startsWith(".") && !workspacePackages.has(specifier))) {
      continue;
    }

    const resolvedPath = workspacePackages.has(specifier)
      ? path.resolve(workspacePackages.get(specifier))
      : resolveRelativeSpecifier(filePath, specifier);
    rewrites.set(specifier, await getModuleUrl(resolvedPath));
  }

  for (const [specifier, moduleUrl] of rewrites) {
    output = output.replaceAll(`"${specifier}"`, `"${moduleUrl}"`);
    output = output.replaceAll(`'${specifier}'`, `'${moduleUrl}'`);
  }

  const outputPath = transpiledOutputPath(filePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");

  return pathToFileURL(outputPath).href;
}

function transpiledOutputPath(filePath) {
  const hash = crypto.createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  const basename = path.basename(filePath).replace(/\.ts$/, ".mjs");
  return path.join(outputRoot, `${hash}-${basename}`);
}

function resolveRelativeSpecifier(fromPath, specifier) {
  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    path.join(basePath, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next TypeScript source candidate.
    }
  }

  throw new Error(`Unable to resolve ${specifier} from ${fromPath}.`);
}
