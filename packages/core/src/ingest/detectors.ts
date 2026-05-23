import { classifyFollowUpIntent } from "../policies";
import {
  articleFor,
  escapeRegExp,
  idSlug,
  inferObservedAt,
  normalizePhrase,
  slugify,
  type CandidateSpan,
  type DetectorProposal,
  type ExtractedClaimCandidate,
  type ExtractedFollowUpCandidate,
  type IngestPipelineContext
} from "./candidates";

export function detectCandidateSpans(note: string): CandidateSpan[] {
  const spans: CandidateSpan[] = [];
  const pattern = /[^.!?]+[.!?]?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(note)) !== null) {
    const text = match[0]?.trim();

    if (!text) {
      continue;
    }

    spans.push({
      text,
      start: match.index,
      end: match.index + match[0]!.length,
      index: spans.length
    });
  }

  return spans.length > 0
    ? spans
    : [
        {
          text: note,
          start: 0,
          end: note.length,
          index: 0
        }
      ];
}

export function detectCandidateProposals(context: IngestPipelineContext): DetectorProposal[] {
  if (isQueryOnly(context.note)) {
    return [];
  }

  const spans = detectCandidateSpans(context.note);
  const proposals: DetectorProposal[] = [];

  const joeRoleClaim = detectPersonRoleClaim(context, spans, "Joe", "DBA");

  if (joeRoleClaim) {
    proposals.push(joeRoleClaim);
  }

  const selfEmploymentClaim = detectSelfEmploymentClaim(context, spans);

  if (selfEmploymentClaim) {
    proposals.push(selfEmploymentClaim);
  }

  const mysqlClaim = detectMySqlClaim(context, spans);

  if (mysqlClaim) {
    proposals.push(mysqlClaim);
  }

  proposals.push(...detectMikeProfileClaims(context, spans));

  const discussionClaim = detectDiscussionClaim(context, spans);

  if (discussionClaim) {
    proposals.push(discussionClaim);
  }

  const followUp = detectFollowUp(context);

  if (followUp) {
    proposals.push(followUp);
  }

  return proposals;
}

function detectPersonRoleClaim(
  context: IngestPipelineContext,
  spans: CandidateSpan[],
  personName: string,
  role: string
): ExtractedClaimCandidate | null {
  const pattern = new RegExp(`\\b${personName}\\s+is\\s+the\\s+${role}\\b`, "i");

  if (!pattern.test(context.note)) {
    return null;
  }

  return {
    kind: "claim",
    source_text: sourceTextForPattern(spans, pattern),
    entity_kind: "person",
    entity_name: personName,
    claim_id: `clm_${personName.toLowerCase()}_role_${role.toLowerCase()}`,
    statement: `${personName} is the ${role}.`,
    claim_kind: "fact",
    evidence_strength: "explicit",
    scope: "current-work-context",
    scope_state: "partial",
    page_summary: `${personName} is the ${role}.`
  };
}

function detectSelfEmploymentClaim(
  context: IngestPipelineContext,
  spans: CandidateSpan[]
): ExtractedClaimCandidate | null {
  const pattern =
    /\bi\s+started\s+(?:an?\s+)?(?:new\s+)?job(?:\s+(?:today|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday))?\s+as\s+(?:an?\s+)?(?<role>[A-Za-z][A-Za-z0-9 +/#.-]*?)\s+at\s+(?<organization>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\b/i;
  const match = pattern.exec(context.note);

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
    kind: "claim",
    source_text: sourceTextForPattern(spans, pattern),
    entity_kind: "person",
    entity_name: "User",
    claim_id: `clm_user_job_${idSlug(role)}_${idSlug(organization)}`,
    statement,
    claim_kind: "fact",
    evidence_strength: "explicit",
    scope: organization,
    scope_state: "complete",
    valid_from: inferEmploymentStartDate(context.note, context.now.slice(0, 10)),
    aliases: ["I", "me"],
    page_summary: statement
  };
}

function detectMySqlClaim(
  context: IngestPipelineContext,
  spans: CandidateSpan[]
): ExtractedClaimCandidate | null {
  const pattern = /\bwe\s+use\s+mysql\b/i;

  if (!pattern.test(context.note)) {
    return null;
  }

  return {
    kind: "claim",
    source_text: sourceTextForPattern(spans, pattern),
    entity_kind: "system",
    entity_name: "MySQL",
    claim_id: "clm_mysql_used_unknown_scope",
    statement: "We use MySQL.",
    claim_kind: "fact",
    evidence_strength: "explicit",
    scope: null,
    scope_state: "unknown"
  };
}

function detectMikeProfileClaims(
  context: IngestPipelineContext,
  spans: CandidateSpan[]
): ExtractedClaimCandidate[] {
  if (!/\bmike\b/i.test(context.note)) {
    return [];
  }

  const claims: ExtractedClaimCandidate[] = [];
  const mikePattern = /\bmike\b/i;

  if (/\bmike\s+is\s+my\s+manager\b/i.test(context.note)) {
    claims.push({
      kind: "claim",
      source_text: sourceTextForPattern(spans, /\bmike\s+is\s+my\s+manager\b/i),
      entity_kind: "person",
      entity_name: "Mike",
      claim_id: "clm_mike_manager",
      statement: "Mike is my manager.",
      claim_kind: "fact",
      evidence_strength: "explicit",
      scope: "current-work-context",
      scope_state: "partial",
      page_summary: "Mike is my manager."
    });
  }

  if (/\bgeneralist\b/i.test(context.note) && /\bjava\b/i.test(context.note)) {
    claims.push({
      kind: "claim",
      source_text: sourceTextForPattern(spans, mikePattern),
      entity_kind: "person",
      entity_name: "Mike",
      claim_id: "clm_mike_java_generalist",
      statement: "Mike is a generalist Java developer.",
      claim_kind: "fact",
      evidence_strength: "explicit",
      scope: "professional-profile",
      scope_state: "partial",
      page_summary: "Mike is my manager."
    });
  }

  if (/\bcrm\b/i.test(context.note)) {
    claims.push({
      kind: "claim",
      source_text: sourceTextForPattern(spans, mikePattern),
      entity_kind: "person",
      entity_name: "Mike",
      claim_id: "clm_mike_crm_experience",
      statement: "Mike has CRM experience.",
      claim_kind: "fact",
      evidence_strength: "explicit",
      scope: "professional-profile",
      scope_state: "partial",
      page_summary: "Mike is my manager."
    });
  }

  if (/\bphd\b/i.test(context.note) && /\bstatistics\b/i.test(context.note)) {
    claims.push(
      {
        kind: "claim",
        source_text: sourceTextForPattern(spans, mikePattern),
        entity_kind: "person",
        entity_name: "Mike",
        claim_id: "clm_mike_phd_stats",
        statement: "Mike has a PhD in Statistics.",
        claim_kind: "fact",
        evidence_strength: "explicit",
        scope: "professional-profile",
        scope_state: "partial",
        page_summary: "Mike is my manager."
      },
      {
        kind: "claim",
        source_text: sourceTextForPattern(spans, mikePattern),
        entity_kind: "person",
        entity_name: "Mike",
        claim_id: "clm_mike_comm_guidance_stats",
        statement: "Explanations for Mike may benefit from precise statistical framing.",
        claim_kind: "inference",
        evidence_strength: "inferred",
        scope: "communication-guidance",
        scope_state: "partial",
        page_summary: "Mike is my manager."
      }
    );
  }

  return claims;
}

function detectDiscussionClaim(
  context: IngestPipelineContext,
  spans: CandidateSpan[]
): ExtractedClaimCandidate | null {
  const pattern = /\btoday\s+i\s+talked\s+with\s+([A-Z][a-z]+)\s+about\s+(.+?)(?:\.|$)/i;
  const match = pattern.exec(context.note);

  if (!match) {
    return null;
  }

  const participantName = match[1] ?? "";
  const subject = match[2] ?? "";
  const topicName = extractKnownTopicName(subject);

  return {
    kind: "claim",
    source_text: sourceTextForPattern(spans, pattern),
    entity_kind: "topic",
    entity_name: topicName,
    claim_id: `clm_${slugify(topicName)}_discussed`,
    statement: `Discussed ${topicName} with ${participantName}.`,
    claim_kind: "fact",
    evidence_strength: "explicit",
    scope: "discussion",
    scope_state: "partial",
    participant_names: [participantName],
    page_summary: `Discussed ${topicName} with ${participantName}.`
  };
}

function detectFollowUp(context: IngestPipelineContext): ExtractedFollowUpCandidate | null {
  const policy = classifyFollowUpIntent(context.note);

  if (policy.intent === "none") {
    return null;
  }

  const action = extractFollowUpAction(context.note, policy.matched_text ?? policy.trigger ?? "");

  return {
    kind: "followup",
    source_text: context.note,
    action,
    followup_state: policy.intent === "committed" ? "committed" : "candidate",
    trigger: policy.trigger ?? policy.matched_text ?? ""
  };
}

function sourceTextForPattern(spans: CandidateSpan[], pattern: RegExp): string {
  return spans.find((span) => pattern.test(span.text))?.text ?? spans[0]?.text ?? "";
}

function inferEmploymentStartDate(note: string, datePart: string): string | null {
  if (/\b(today|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday)\b/i.test(note)) {
    return inferObservedAt(note, datePart);
  }

  return null;
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
