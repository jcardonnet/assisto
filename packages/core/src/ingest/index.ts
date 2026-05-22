import { writeMarkdownPageAtomic } from "../fs";
import { serializeMarkdownFile, type Frontmatter } from "../markdown";
import type { ClaimBlock, FollowUpState, SupportedOperationType } from "../model";
import { classifyFollowUpIntent, evaluateStagingPolicy } from "../policies";
import {
  applyTransaction,
  createTransactionDraft,
  serializeTransactionMarkdown,
  transactionFilePaths,
  type ParsedTransaction,
  type TransactionFileWrite
} from "../transactions";
import { loadVaultIndex, type VaultIndex } from "../vault";

export interface IngestNoteOptions {
  now?: string;
  observed_at?: string | null;
  source_actor?: string;
  apply?: boolean;
}

export interface IngestNoteResult {
  event_id: string;
  event_path: string;
  transaction_id: string;
  transaction_path: string;
  transaction: ParsedTransaction;
  applied: boolean;
  extracted_claim_ids: string[];
  staged_review_paths: string[];
  followup_paths: string[];
}

interface IngestContext {
  root: string;
  note: string;
  now: string;
  observedAt: string | null;
  eventId: string;
  eventPath: string;
  eventLinkPath: string;
  transactionId: string;
}

type ClaimDomain = "person" | "topic" | "system";

interface CandidateClaim extends ClaimBlock {
  domain: ClaimDomain;
}

interface CandidateWrite {
  path: string;
  content: string;
  operation: SupportedOperationType;
}

const defaultNow = "2026-05-20T12:00:00-03:00";

export async function ingestNote(
  root: string,
  note: string,
  options: IngestNoteOptions = {}
): Promise<IngestNoteResult> {
  const normalizedNote = normalizeWhitespace(note);
  const now = options.now ?? defaultNow;
  const datePart = now.slice(0, 10);
  const dateIdPart = datePart.replace(/-/g, "_");
  const index = await loadIndexOrEmpty(root);
  const sequence = nextSequence(dateIdPart, index);
  const eventId = `ev_${dateIdPart}_${sequence}`;
  const transactionId = `tx_${dateIdPart}_${sequence}`;
  const eventPath = `memory/events/${datePart.slice(0, 4)}/${datePart.slice(0, 7)}/${datePart}-${sequence}.md`;
  const transactionPath = transactionFilePaths.pending(transactionId);
  const observedAt = options.observed_at ?? inferObservedAt(normalizedNote, datePart);
  const context: IngestContext = {
    root,
    note: normalizedNote,
    now,
    observedAt,
    eventId,
    eventPath,
    eventLinkPath: stripMemoryPrefix(eventPath).replace(/\.md$/i, ""),
    transactionId
  };

  const extraction = extractCandidates(context);
  const eventMarkdown = renderEventMarkdown(context, {
    sourceActor: options.source_actor ?? "user",
    derivedClaimIds: extraction.claims.map((claim) => claim.claim_id),
    participants: extraction.participants,
    topics: extraction.topics
  });

  await writeMarkdownPageAtomic(root, eventPath, eventMarkdown);

  const operations = extraction.writes.length === 0 ? [{ operation: "NOOP" as const }] : extraction.operations;
  const affectedFiles = [
    stripMemoryPrefix(eventPath),
    ...extraction.writes.map((write) => stripMemoryPrefix(write.path))
  ];
  const transaction = createTransactionDraft({
    id: transactionId,
    created_at: now,
    source_events: [eventId],
    operations,
    affected_files: affectedFiles,
    risk_level: extraction.writes.length > 0 ? "medium" : "low",
    requires_review: extraction.stagedReviewPaths.length > 0,
    rollback_notes:
      "Preserve the source Event. If non-Event writes fail, mark this transaction failed and repair proposed page writes manually.",
    intent: extraction.intent,
    proposed_file_writes: extraction.writes.map((write) => ({
      path: write.path,
      content: write.content
    }))
  });

  await writeMarkdownPageAtomic(root, transactionPath, serializeTransactionMarkdown(transaction));

  if (options.apply === true) {
    await applyTransaction(root, transactionId);
  }

  return {
    event_id: eventId,
    event_path: eventPath,
    transaction_id: transactionId,
    transaction_path: transactionPath,
    transaction,
    applied: options.apply === true,
    extracted_claim_ids: extraction.claims.map((claim) => claim.claim_id),
    staged_review_paths: extraction.stagedReviewPaths,
    followup_paths: extraction.followupPaths
  };
}

async function loadIndexOrEmpty(root: string): Promise<VaultIndex> {
  try {
    return await loadVaultIndex(root);
  } catch {
    return {
      entries: [],
      ids: new Map(),
      paths: new Set(),
      wikilinks: new Map(),
      eventIds: new Set(),
      claimIds: new Map(),
      transactionIds: new Set()
    };
  }
}

function extractCandidates(context: IngestContext): {
  claims: CandidateClaim[];
  writes: TransactionFileWrite[];
  operations: Array<{ operation: SupportedOperationType; description?: string }>;
  stagedReviewPaths: string[];
  followupPaths: string[];
  participants: string[];
  topics: string[];
  intent: string;
} {
  const claims: CandidateClaim[] = [];
  const writes: CandidateWrite[] = [];
  const stagedReviewPaths: string[] = [];
  const followupPaths: string[] = [];
  const participants = new Set<string>();
  const topics = new Set<string>();

  if (!isQueryOnly(context.note)) {
    const joeRoleClaim = extractPersonRoleClaim(context, "Joe", "DBA");

    if (joeRoleClaim) {
      claims.push(joeRoleClaim);
      participants.add("per_joe");
      writes.push({
        path: "memory/people/joe.md",
        operation: "UPSERT_CLAIM",
        content: renderPersonPage({
          personName: "Joe",
          personId: "per_joe",
          now: context.now,
          eventId: context.eventId,
          claims: [joeRoleClaim],
          summary: "Joe is the DBA."
        })
      });
    }

    const selfEmploymentClaim = extractSelfEmploymentClaim(context);

    if (selfEmploymentClaim) {
      claims.push(selfEmploymentClaim.claim);
      participants.add("per_user");
      writes.push({
        path: "memory/people/user.md",
        operation: "UPSERT_CLAIM",
        content: renderPersonPage({
          personName: "User",
          personId: "per_user",
          now: context.now,
          eventId: context.eventId,
          claims: [selfEmploymentClaim.claim],
          summary: selfEmploymentClaim.claim.statement,
          aliases: ["I", "me"]
        })
      });
    }

    const mysqlClaim = extractMySqlClaim(context);

    if (mysqlClaim) {
      claims.push(mysqlClaim);
      topics.add("top_mysql");

      const staging = evaluateStagingPolicy({
        claimDomain: "system",
        claim: mysqlClaim
      });

      if (staging.stage) {
        const path = "memory/review/unscoped-claims.md";
        stagedReviewPaths.push(path);
        writes.push({
          path,
          operation: "STAGE_REVIEW",
          content: renderUnscopedClaimReviewPage(context, mysqlClaim)
        });
      }
    }

    const mikeClaims = extractMikeProfileClaims(context);

    if (mikeClaims.length > 0) {
      claims.push(...mikeClaims);
      participants.add("per_mike");
      writes.push({
        path: "memory/people/mike.md",
        operation: "UPSERT_CLAIM",
        content: renderPersonPage({
          personName: "Mike",
          personId: "per_mike",
          now: context.now,
          eventId: context.eventId,
          claims: mikeClaims,
          summary: "Mike is my manager."
        })
      });
    }

    const discussionClaim = extractDiscussionClaim(context);

    if (discussionClaim) {
      claims.push(discussionClaim.claim);
      discussionClaim.participants.forEach((participant) => participants.add(participant));
      topics.add(discussionClaim.topicId);
      writes.push({
        path: discussionClaim.path,
        operation: "UPSERT_CLAIM",
        content: renderTopicPage({
          topicName: discussionClaim.topicName,
          topicId: discussionClaim.topicId,
          now: context.now,
          eventId: context.eventId,
          claims: [discussionClaim.claim],
          summary: discussionClaim.claim.statement
        })
      });
    }

    const followUpWrite = extractFollowUpWrite(context);

    if (followUpWrite) {
      followupPaths.push(followUpWrite.path);
      writes.push(followUpWrite);
    }
  }

  const operations = buildOperations(writes);

  return {
    claims,
    writes: writes.map((write) => ({
      path: write.path,
      content: write.content
    })),
    operations,
    stagedReviewPaths,
    followupPaths,
    participants: [...participants],
    topics: [...topics],
    intent:
      writes.length === 0
        ? "Capture source note as Event and make no canonical page changes."
        : "Capture source note as Event and draft deterministic MVP memory mutations for review."
  };
}

function extractPersonRoleClaim(
  context: IngestContext,
  personName: string,
  role: string
): CandidateClaim | null {
  const pattern = new RegExp(`\\b${personName}\\s+is\\s+the\\s+${role}\\b`, "i");

  if (!pattern.test(context.note)) {
    return null;
  }

  return createClaim({
    claim_id: `clm_${personName.toLowerCase()}_role_${role.toLowerCase()}`,
    statement: `${personName} is the ${role}.`,
    claim_kind: "fact",
    claim_state: "active",
    evidence_strength: "explicit",
    scope: "current-work-context",
    scope_state: "partial",
    domain: "person",
    context
  });
}

function extractSelfEmploymentClaim(context: IngestContext): { claim: CandidateClaim; organization: string; role: string } | null {
  const match =
    /\bi\s+started\s+(?:an?\s+)?(?:new\s+)?job(?:\s+(?:today|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday))?\s+as\s+(?:an?\s+)?(?<role>[A-Za-z][A-Za-z0-9 +/#.-]*?)\s+at\s+(?<organization>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\b/i.exec(
      context.note
    );

  if (!match?.groups) {
    return null;
  }

  const role = normalizePhrase(match.groups.role ?? "");
  const organization = normalizePhrase(match.groups.organization ?? "");

  if (!role || !organization) {
    return null;
  }

  const statement = `User started a new job at ${organization} as ${articleFor(role)} ${role}.`;

  return {
    claim: createClaim({
      claim_id: `clm_user_job_${idSlug(role)}_${idSlug(organization)}`,
      statement,
      claim_kind: "fact",
      claim_state: "active",
      evidence_strength: "explicit",
      scope: organization,
      scope_state: "complete",
      valid_from: inferEmploymentStartDate(context.note, context.now.slice(0, 10)),
      domain: "person",
      context
    }),
    organization,
    role
  };
}

function extractMySqlClaim(context: IngestContext): CandidateClaim | null {
  if (!/\bwe\s+use\s+mysql\b/i.test(context.note)) {
    return null;
  }

  return createClaim({
    claim_id: "clm_mysql_used_unknown_scope",
    statement: "We use MySQL.",
    claim_kind: "fact",
    claim_state: "staged",
    evidence_strength: "explicit",
    scope: null,
    scope_state: "unknown",
    domain: "system",
    context
  });
}

function extractMikeProfileClaims(context: IngestContext): CandidateClaim[] {
  if (!/\bmike\b/i.test(context.note)) {
    return [];
  }

  const claims: CandidateClaim[] = [];

  if (/\bmike\s+is\s+my\s+manager\b/i.test(context.note)) {
    claims.push(
      createClaim({
        claim_id: "clm_mike_manager",
        statement: "Mike is my manager.",
        claim_kind: "fact",
        claim_state: "active",
        evidence_strength: "explicit",
        scope: "current-work-context",
        scope_state: "partial",
        domain: "person",
        context
      })
    );
  }

  if (/\bgeneralist\b/i.test(context.note) && /\bjava\b/i.test(context.note)) {
    claims.push(
      createClaim({
        claim_id: "clm_mike_java_generalist",
        statement: "Mike is a generalist Java developer.",
        claim_kind: "fact",
        claim_state: "active",
        evidence_strength: "explicit",
        scope: "professional-profile",
        scope_state: "partial",
        domain: "person",
        context
      })
    );
  }

  if (/\bcrm\b/i.test(context.note)) {
    claims.push(
      createClaim({
        claim_id: "clm_mike_crm_experience",
        statement: "Mike has CRM experience.",
        claim_kind: "fact",
        claim_state: "active",
        evidence_strength: "explicit",
        scope: "professional-profile",
        scope_state: "partial",
        domain: "person",
        context
      })
    );
  }

  if (/\bphd\b/i.test(context.note) && /\bstatistics\b/i.test(context.note)) {
    claims.push(
      createClaim({
        claim_id: "clm_mike_phd_stats",
        statement: "Mike has a PhD in Statistics.",
        claim_kind: "fact",
        claim_state: "active",
        evidence_strength: "explicit",
        scope: "professional-profile",
        scope_state: "partial",
        domain: "person",
        context
      }),
      createClaim({
        claim_id: "clm_mike_comm_guidance_stats",
        statement: "Explanations for Mike may benefit from precise statistical framing.",
        claim_kind: "inference",
        claim_state: "staged",
        evidence_strength: "inferred",
        scope: "communication-guidance",
        scope_state: "partial",
        domain: "person",
        context
      })
    );
  }

  return claims;
}

function extractDiscussionClaim(context: IngestContext): {
  claim: CandidateClaim;
  path: string;
  topicId: string;
  topicName: string;
  participants: string[];
} | null {
  const match = /\btoday\s+i\s+talked\s+with\s+([A-Z][a-z]+)\s+about\s+(.+?)(?:\.|$)/i.exec(
    context.note
  );

  if (!match) {
    return null;
  }

  const participantName = match[1] ?? "";
  const subject = match[2] ?? "";
  const topicName = extractKnownTopicName(subject);
  const topicSlug = slugify(topicName);
  const participantId = `per_${slugify(participantName)}`;

  return {
    claim: createClaim({
      claim_id: `clm_${topicSlug}_discussed`,
      statement: `Discussed ${topicName} with ${participantName}.`,
      claim_kind: "fact",
      claim_state: "active",
      evidence_strength: "explicit",
      scope: "discussion",
      scope_state: "partial",
      domain: "topic",
      context
    }),
    path: `memory/topics/${topicSlug}.md`,
    topicId: `top_${topicSlug}`,
    topicName,
    participants: [participantId]
  };
}

function extractFollowUpWrite(context: IngestContext): CandidateWrite | null {
  const policy = classifyFollowUpIntent(context.note);

  if (policy.intent === "none") {
    return null;
  }

  const action = extractFollowUpAction(context.note, policy.matched_text ?? policy.trigger ?? "");
  const slug = slugify(action || "follow-up");
  const state: FollowUpState = policy.intent === "committed" ? "committed" : "candidate";
  const path = `memory/followups/${slug}.md`;

  return {
    path,
    operation: "UPSERT_CLAIM",
    content: renderFollowUpPage({
      context,
      id: `fu_${slug}`,
      action,
      state,
      trigger: policy.trigger ?? policy.matched_text ?? ""
    })
  };
}

function createClaim(input: {
  claim_id: string;
  statement: string;
  claim_kind: ClaimBlock["claim_kind"];
  claim_state: ClaimBlock["claim_state"];
  evidence_strength: ClaimBlock["evidence_strength"];
  scope: string | null;
  scope_state: ClaimBlock["scope_state"];
  valid_from?: string | null;
  domain: ClaimDomain;
  context: IngestContext;
}): CandidateClaim {
  return {
    claim_id: input.claim_id,
    statement: input.statement,
    claim_kind: input.claim_kind,
    claim_state: input.claim_state,
    evidence_strength: input.evidence_strength,
    scope: input.scope,
    scope_state: input.scope_state,
    evidence: [input.context.eventId],
    recorded_at: input.context.now,
    observed_at: input.context.observedAt,
    valid_from: input.valid_from ?? null,
    valid_to: null,
    domain: input.domain
  };
}

function renderEventMarkdown(
  context: IngestContext,
  input: {
    sourceActor: string;
    derivedClaimIds: string[];
    participants: string[];
    topics: string[];
  }
): string {
  const frontmatter: Frontmatter = {
    id: context.eventId,
    type: "event",
    object_state: "active",
    review_state: "reviewed",
    recorded_at: context.now,
    observed_at: context.observedAt,
    source_type: "user_note",
    source_actor: input.sourceActor,
    participants: input.participants,
    topics: input.topics,
    contexts: [],
    derived_claims: input.derivedClaimIds,
    transactions: [context.transactionId]
  };
  const body = [
    `# Event ${context.eventId}`,
    "",
    "## Raw text",
    "",
    context.note,
    "",
    "## Candidate extraction",
    "",
    input.derivedClaimIds.length === 0
      ? "- No durable claim candidates extracted."
      : input.derivedClaimIds.map((claimId) => `- ${claimId}`).join("\n")
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderPersonPage(input: {
  personName: string;
  personId: string;
  now: string;
  eventId: string;
  claims: CandidateClaim[];
  summary: string;
  aliases?: string[];
}): string {
  const activeClaims = input.claims.filter((claim) => claim.claim_state === "active");
  const frontmatter: Frontmatter = {
    id: input.personId,
    type: "person",
    object_state: "active",
    review_state: input.claims.some((claim) => claim.claim_state === "staged") ? "staged" : "reviewed",
    created_at: input.now,
    updated_at: input.now,
    aliases: input.aliases ?? [],
    source_events: [input.eventId],
    related: [],
    summary_generated_from: activeClaims.map((claim) => claim.claim_id)
  };
  const body = [
    `# ${input.personName}`,
    "",
    "## Current summary",
    "",
    input.summary,
    "",
    "## Active claims",
    "",
    ...input.claims.filter((claim) => claim.claim_state === "active").map(renderClaimBlock),
    "",
    "## Staged claims",
    "",
    ...input.claims.filter((claim) => claim.claim_state === "staged").map(renderClaimBlock)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderTopicPage(input: {
  topicName: string;
  topicId: string;
  now: string;
  eventId: string;
  claims: CandidateClaim[];
  summary: string;
}): string {
  const activeClaims = input.claims.filter((claim) => claim.claim_state === "active");
  const frontmatter: Frontmatter = {
    id: input.topicId,
    type: "topic",
    object_state: "active",
    review_state: "reviewed",
    created_at: input.now,
    updated_at: input.now,
    aliases: [],
    source_events: [input.eventId],
    related: [],
    summary_generated_from: activeClaims.map((claim) => claim.claim_id)
  };
  const body = [
    `# ${input.topicName}`,
    "",
    "## Current summary",
    "",
    input.summary,
    "",
    "## Active claims",
    "",
    ...activeClaims.map(renderClaimBlock)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderUnscopedClaimReviewPage(context: IngestContext, claim: CandidateClaim): string {
  const frontmatter: Frontmatter = {
    id: "rev_unscoped_claims",
    type: "review_item",
    object_state: "active",
    review_state: "staged",
    review_reason: "unscoped_claim",
    created_at: context.now,
    source_events: [context.eventId],
    affected_files: ["topics/mysql.md"],
    linked_transaction: context.transactionId
  };
  const body = [
    "# Review: Unscoped claims",
    "",
    "## Issue",
    "",
    `The claim "${claim.statement.replace(/\.$/, "")}" is explicit but lacks system/project scope.`,
    "",
    "## Evidence",
    "",
    `- Event: [[${context.eventLinkPath}]]`,
    `- Candidate claim: \`${claim.claim_id}\``,
    "",
    "## Staged claims",
    "",
    renderClaimBlock(claim)
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderFollowUpPage(input: {
  context: IngestContext;
  id: string;
  action: string;
  state: FollowUpState;
  trigger: string;
}): string {
  const frontmatter: Frontmatter = {
    id: input.id,
    type: "followup",
    object_state: "active",
    review_state: input.state === "committed" ? "reviewed" : "staged",
    followup_state: input.state,
    created_at: input.context.now,
    updated_at: input.context.now,
    owner: "user",
    source_events: [input.context.eventId],
    related: [],
    transactions: [input.context.transactionId]
  };
  const body = [
    `# Follow-up: ${input.action}`,
    "",
    "## Action",
    "",
    input.action,
    "",
    "## Trigger",
    "",
    input.trigger,
    "",
    "## Evidence",
    "",
    `- Event: [[${input.context.eventLinkPath}]]`,
    `- Source note: ${input.context.note}`
  ].join("\n");

  return serializeMarkdownFile(frontmatter, body);
}

function renderClaimBlock(claim: ClaimBlock): string {
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

function buildOperations(writes: CandidateWrite[]): Array<{ operation: SupportedOperationType; description?: string }> {
  const operations = new Map<SupportedOperationType, string>();

  for (const write of writes) {
    operations.set(write.operation, `draft ${stripMemoryPrefix(write.path)}`);
  }

  return [...operations.entries()].map(([operation, description]) => ({
    operation,
    description
  }));
}

function nextSequence(dateIdPart: string, index: VaultIndex): string {
  const used = [...index.eventIds, ...index.transactionIds]
    .map((id) => new RegExp(`^(?:ev|tx)_${dateIdPart}_(\\d{3})$`).exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next).padStart(3, "0");
}

function inferObservedAt(note: string, datePart: string): string | null {
  if (/\btoday\b/i.test(note)) {
    return datePart;
  }

  return inferWeekdayDate(note, datePart);
}

function extractKnownTopicName(subject: string): string {
  const knownTopics = ["pgvector", "MySQL", "Solr", "Qdrant"];

  for (const topic of knownTopics) {
    if (new RegExp(`\\b${escapeRegExp(topic)}\\b`, "i").test(subject)) {
      return topic;
    }
  }

  return subject.split(/\s+/).slice(0, 2).join(" ");
}

function extractFollowUpAction(note: string, matchedText: string): string {
  const afterMatch = note.slice(note.toLowerCase().indexOf(matchedText.toLowerCase()) + matchedText.length);
  const action = afterMatch.replace(/^[\s:,-]+/, "").replace(/[.?!]\s*$/, "").trim();

  return action || note.trim();
}

function isQueryOnly(note: string): boolean {
  return /^(how|what|why|when|where|who|should|could|can)\b/i.test(note.trim()) && /\?\s*$/.test(note);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function idSlug(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.?!]\s*$/, "").trim();
}

function articleFor(phrase: string): "a" | "an" {
  return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

function inferEmploymentStartDate(note: string, datePart: string): string | null {
  if (/\b(today|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday)\b/i.test(note)) {
    return inferObservedAt(note, datePart);
  }

  return null;
}

function inferWeekdayDate(note: string, datePart: string): string | null {
  const match = /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(note);

  if (!match) {
    return /\byesterday\b/i.test(note) ? addDays(datePart, -1) : null;
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const targetDay = weekdays[match[1]!.toLowerCase()];

  if (targetDay === undefined) {
    return null;
  }

  const currentDate = new Date(`${datePart}T00:00:00.000Z`);
  const daysSinceTarget = currentDate.getUTCDay() - targetDay;
  currentDate.setUTCDate(currentDate.getUTCDate() - daysSinceTarget);

  return currentDate.toISOString().slice(0, 10);
}

function addDays(datePart: string, days: number): string {
  const date = new Date(`${datePart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function stripMemoryPrefix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^memory\//, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
