import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function makeTempVault(prefix = "assisto-test-") {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, "memory", "transactions", "pending"), { recursive: true });
  return root;
}

export async function readVaultFile(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

export async function writeVaultFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
