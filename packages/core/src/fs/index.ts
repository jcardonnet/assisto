import { mkdir, readFile, rename, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultPathError";
  }
}

export function resolveVaultPath(root: string, relativePath: string): string {
  assertNotObsidianPath(relativePath);

  if (path.isAbsolute(relativePath)) {
    throw new VaultPathError(`Vault paths must be relative: ${relativePath}`);
  }

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);

  assertInsideRoot(resolvedRoot, resolvedPath);

  return resolvedPath;
}

export function assertInsideMemory(root: string, targetPath: string): void {
  assertNotObsidianPath(targetPath);

  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : resolveVaultPath(resolvedRoot, targetPath);
  const memoryRoot = path.resolve(resolvedRoot, "memory");

  assertInsideRoot(memoryRoot, resolvedTarget, `Path must stay inside memory/: ${targetPath}`);
}

export function assertNotObsidianPath(targetPath: string): void {
  const segments = targetPath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  if (segments.some((segment) => segment.toLowerCase() === ".obsidian")) {
    throw new VaultPathError(`Writes to .obsidian/ are forbidden: ${targetPath}`);
  }
}

export async function readMarkdownPage(root: string, relativePath: string): Promise<string> {
  assertMarkdownPath(relativePath);
  const resolvedPath = resolveVaultPath(root, relativePath);

  return readFile(resolvedPath, "utf8");
}

export async function writeMarkdownPageAtomic(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  assertMarkdownPath(relativePath);
  const resolvedPath = resolveVaultPath(root, relativePath);

  assertInsideMemory(root, resolvedPath);

  const directory = path.dirname(resolvedPath);
  const tempPath = path.join(directory, `.${path.basename(resolvedPath)}.${process.pid}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, resolvedPath);
}

export async function listMarkdownFiles(root: string, globPattern = "memory/**/*.md"): Promise<string[]> {
  assertNotObsidianPath(globPattern);

  if (path.isAbsolute(globPattern)) {
    throw new VaultPathError(`Glob patterns must be relative: ${globPattern}`);
  }

  const resolvedRoot = path.resolve(root);
  const searchRoot = resolveSearchRoot(resolvedRoot, globPattern);
  const relativeFiles = await walkMarkdownFiles(resolvedRoot, searchRoot);
  const matcher = globToRegExp(normalizePath(globPattern));

  return relativeFiles.filter((file) => matcher.test(file)).sort();
}

function assertInsideRoot(root: string, targetPath: string, message?: string): void {
  const relative = path.relative(root, targetPath);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }

  throw new VaultPathError(message ?? `Path escapes the vault root: ${targetPath}`);
}

function assertMarkdownPath(relativePath: string): void {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new VaultPathError(`Markdown page paths must end in .md: ${relativePath}`);
  }
}

function resolveSearchRoot(root: string, globPattern: string): string {
  const normalized = normalizePath(globPattern);
  const wildcardIndex = normalized.search(/[*?]/);
  const stablePrefix = wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex);
  const prefixDirectory = stablePrefix.endsWith("/")
    ? stablePrefix
    : stablePrefix.slice(0, stablePrefix.lastIndexOf("/") + 1);

  return resolveVaultPath(root, prefixDirectory || ".");
}

async function walkMarkdownFiles(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));

    assertNotObsidianPath(relativePath);

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(root, absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files;
}

function globToRegExp(globPattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < globPattern.length; index += 1) {
    const char = globPattern[index];
    const nextChar = globPattern[index + 1];

    if (char === "*" && nextChar === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

