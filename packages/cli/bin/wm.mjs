#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const moduleUrlCache = new Map();
const importSpecifierPattern = /((?:from\s+|import\s*\(\s*)["'])([^"']+)(["'])/g;

const cliModule = await import(await getModuleUrl(path.join(workspaceRoot, "packages/cli/src/index.ts")));
const exitCode = await cliModule.main(process.argv.slice(2));
process.exitCode = exitCode;

async function getModuleUrl(filePath) {
  const normalizedPath = path.resolve(filePath);
  const cached = moduleUrlCache.get(normalizedPath);

  if (cached) {
    return cached;
  }

  const promise = buildModuleUrl(normalizedPath);
  moduleUrlCache.set(normalizedPath, promise);

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

    if (!specifier || !shouldRewriteSpecifier(specifier)) {
      continue;
    }

    rewrites.set(specifier, await getModuleUrl(resolveSpecifier(filePath, specifier)));
  }

  for (const [specifier, moduleUrl] of rewrites) {
    output = output.replaceAll(`"${specifier}"`, `"${moduleUrl}"`);
    output = output.replaceAll(`'${specifier}'`, `'${moduleUrl}'`);
  }

  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

function shouldRewriteSpecifier(specifier) {
  return specifier.startsWith(".") || specifier === "@assisto/core";
}

function resolveSpecifier(fromPath, specifier) {
  if (specifier === "@assisto/core") {
    return path.join(workspaceRoot, "packages/core/src/index.ts");
  }

  const basePath = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [basePath, `${basePath}.ts`, path.join(basePath, "index.ts")];

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
