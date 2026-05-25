import { readMarkdownPage } from "../fs";
import {
  getSection,
  parseClaimBlocks,
  parseMarkdownFile,
  serializeMarkdownFile,
  type Frontmatter,
  type FrontmatterValue
} from "../markdown";
import type { ClaimBlock } from "../model";
import type { TransactionFileWrite } from "../transactions";

export interface MergeExistingPageOptions {
  supersedeClaimIds?: string[];
}

export async function mergeProposedWritesWithExistingPages(
  root: string,
  writes: TransactionFileWrite[],
  options: MergeExistingPageOptions = {}
): Promise<TransactionFileWrite[]> {
  const merged: TransactionFileWrite[] = [];

  for (const write of writes) {
    merged.push(await mergeProposedWriteWithExistingPage(root, write, options));
  }

  return merged;
}

export async function mergeProposedWriteWithExistingPage(
  root: string,
  write: TransactionFileWrite,
  options: MergeExistingPageOptions = {}
): Promise<TransactionFileWrite> {
  const proposed = parseMarkdownFile(write.content);
  const proposedType = stringValue(proposed.frontmatter.type);

  if (proposedType !== "person" && proposedType !== "topic") {
    return write;
  }

  let existingContent: string;

  try {
    existingContent = await readMarkdownPage(root, write.path);
  } catch {
    return write;
  }

  const existing = parseMarkdownFile(existingContent);
  const existingType = stringValue(existing.frontmatter.type);

  if (existingType !== proposedType) {
    return write;
  }

  const existingClaims = parseClaimBlocks(existing.body).map((claim) =>
    options.supersedeClaimIds?.includes(claim.claim_id)
      ? { ...claim, claim_state: "superseded" as const }
      : claim
  );
  const existingClaimIds = new Set(existingClaims.map((claim) => claim.claim_id));
  const proposedClaims = parseClaimBlocks(proposed.body).filter((claim) => !existingClaimIds.has(claim.claim_id));
  const claims = [...existingClaims, ...proposedClaims];
  const activeClaimIds = claims
    .filter((claim) => claim.claim_state === "active")
    .map((claim) => claim.claim_id);
  const frontmatter: Frontmatter = {
    ...existing.frontmatter,
    id: existing.frontmatter.id ?? proposed.frontmatter.id ?? null,
    type: existing.frontmatter.type ?? proposed.frontmatter.type ?? proposedType,
    object_state: existing.frontmatter.object_state ?? "active",
    review_state: claims.some((claim) => claim.claim_state === "staged") ? "staged" : existing.frontmatter.review_state ?? "reviewed",
    created_at: existing.frontmatter.created_at ?? proposed.frontmatter.created_at ?? null,
    updated_at: proposed.frontmatter.updated_at ?? existing.frontmatter.updated_at ?? null,
    aliases: uniqueStrings([
      ...stringArrayValue(existing.frontmatter.aliases),
      ...stringArrayValue(proposed.frontmatter.aliases)
    ]),
    source_events: uniqueStrings([
      ...stringArrayValue(existing.frontmatter.source_events),
      ...stringArrayValue(proposed.frontmatter.source_events),
      ...claims.flatMap((claim) => claim.evidence)
    ]),
    related: uniqueStrings([
      ...stringArrayValue(existing.frontmatter.related),
      ...stringArrayValue(proposed.frontmatter.related)
    ]),
    summary_generated_from: activeClaimIds
  };
  const title = firstHeading(existing.body) ?? firstHeading(proposed.body) ?? "# Memory page";
  const summary = getSection(existing.body, "Current summary") ?? getSection(proposed.body, "Current summary") ?? firstActiveStatement(claims);
  const body = renderClaimPageBody(title, summary, claims);

  return {
    path: write.path,
    content: serializeMarkdownFile(frontmatter, body)
  };
}

export function renderClaimPageBody(title: string, summary: string, claims: ClaimBlock[]): string {
  const activeClaims = claims.filter((claim) => claim.claim_state === "active");
  const stagedClaims = claims.filter((claim) => claim.claim_state === "staged");
  const supersededClaims = claims.filter((claim) => claim.claim_state === "superseded");
  const rejectedClaims = claims.filter((claim) => claim.claim_state === "rejected");
  const sections = [
    title,
    "",
    "## Current summary",
    "",
    summary,
    "",
    "## Active claims",
    "",
    ...activeClaims.map(renderClaimBlock)
  ];

  if (stagedClaims.length > 0) {
    sections.push("", "## Staged claims", "", ...stagedClaims.map(renderClaimBlock));
  }

  if (supersededClaims.length > 0) {
    sections.push("", "## Superseded claims", "", ...supersededClaims.map(renderClaimBlock));
  }

  if (rejectedClaims.length > 0) {
    sections.push("", "## Rejected claims", "", ...rejectedClaims.map(renderClaimBlock));
  }

  return sections.join("\n");
}

export function renderClaimBlock(claim: ClaimBlock): string {
  return [
    `- claim_id: ${claim.claim_id}`,
    `  statement: ${claim.statement}`,
    `  claim_kind: ${claim.claim_kind}`,
    `  claim_state: ${claim.claim_state}`,
    `  evidence_strength: ${claim.evidence_strength}`,
    `  scope: ${claim.scope ?? "null"}`,
    `  scope_state: ${claim.scope_state}`,
    `  evidence: [${claim.evidence.join(", ")}]`,
    `  recorded_at: ${claim.recorded_at}`,
    `  observed_at: ${claim.observed_at ?? "null"}`,
    `  valid_from: ${claim.valid_from ?? "null"}`,
    `  valid_to: ${claim.valid_to ?? "null"}`
  ].join("\n");
}

function firstHeading(body: string): string | null {
  return /^#\s+.+$/m.exec(body)?.[0] ?? null;
}

function firstActiveStatement(claims: ClaimBlock[]): string {
  return claims.find((claim) => claim.claim_state === "active")?.statement ?? "";
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
