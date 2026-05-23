import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseClaimBlockRecords, parseMarkdownFile, parseWikilinks } from "../markdown";

export interface VaultIndexEntry {
  path: string;
  id?: string;
  type?: string;
  aliases: string[];
  wikilinks: string[];
  claimIds: string[];
}

export interface VaultIndex {
  entries: VaultIndexEntry[];
  ids: Map<string, string>;
  paths: Set<string>;
  wikilinks: Map<string, string[]>;
  eventIds: Set<string>;
  claimIds: Map<string, string>;
  transactionIds: Set<string>;
}

export async function loadVaultIndex(root: string): Promise<VaultIndex> {
  const markdownFiles = await listMarkdownFiles(root, "memory/**/*.md");
  const entries: VaultIndexEntry[] = [];
  const ids = new Map<string, string>();
  const paths = new Set<string>();
  const wikilinks = new Map<string, string[]>();
  const eventIds = new Set<string>();
  const claimIds = new Map<string, string>();
  const transactionIds = new Set<string>();

  for (const filePath of markdownFiles) {
    const content = await readMarkdownPage(root, filePath);
    const parsed = parseMarkdownFile(content);
    const id = stringValue(parsed.frontmatter.id);
    const type = stringValue(parsed.frontmatter.type);
    const links = parseWikilinks(`${frontmatterToText(parsed.frontmatter)}\n${parsed.body}`);
    const claims = parseClaimBlockRecords(parsed.body)
      .map((claim) => stringValue(claim.fields.claim_id))
      .filter((claimId): claimId is string => Boolean(claimId));

    paths.add(filePath);
    wikilinks.set(filePath, links);

    if (id) {
      ids.set(id, filePath);
    }

    if (id && type === "event") {
      eventIds.add(id);
    }

    if (id && type === "transaction") {
      transactionIds.add(id);
    }

    for (const claimId of claims) {
      claimIds.set(claimId, filePath);
    }

    entries.push({
      path: filePath,
      id,
      type,
      aliases: stringArrayValue(parsed.frontmatter.aliases),
      wikilinks: links,
      claimIds: claims
    });
  }

  return {
    entries,
    ids,
    paths,
    wikilinks,
    eventIds,
    claimIds,
    transactionIds
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function frontmatterToText(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValueToText(value)}`)
    .join("\n");
}

function frontmatterValueToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(frontmatterValueToText).join("\n");
  }

  return String(value);
}
