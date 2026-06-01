import { createHash } from "node:crypto";

export function computeSourceHash(rawText: string): string {
  return `sha256:${createHash("sha256").update(rawText, "utf8").digest("hex")}`;
}
