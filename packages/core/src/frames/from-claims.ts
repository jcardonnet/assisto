import type { MemoryFrame, MemoryFrameEntityRef, MemoryFrameScopeState } from "./types";

export interface ExtractCandidateFramesInput {
  text: string;
  sourceEventId: string;
}

export function extractCandidateFramesFromText(input: ExtractCandidateFramesInput): MemoryFrame[] {
  const frames: MemoryFrame[] = [];
  const recentPeople: string[] = [];

  addManagerFrames(input, frames, recentPeople);
  addReportingFrames(input, frames, recentPeople);
  addRoleFrames(input, frames);
  addTechnologyFrames(input, frames);
  addDecisionAndQuestionFrames(input, frames);

  return dedupeFrames(frames);
}

function addManagerFrames(
  input: ExtractCandidateFramesInput,
  frames: MemoryFrame[],
  recentPeople: string[]
): void {
  const managerPattern =
    /\b(?<name>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s*(?:,\s*the\s+(?<title>[^,.!?]+(?:\.[^,.!?]+)?[^,.!?]*?)\s*,)?\s+is\s+my\s+manager\b/g;
  let match: RegExpExecArray | null;

  while ((match = managerPattern.exec(input.text)) !== null) {
    const name = normalizePhrase(match.groups?.name ?? "");
    const title = normalizePhrase(match.groups?.title ?? "");

    if (!name) {
      continue;
    }

    recentPeople.push(name);
    frames.push(relationFrame(input, "manages", personRef(name), personRef("User"), `${name} is my manager.`));

    if (title) {
      frames.push(attributeFrame(input, "role_title", personRef(name), title, `${name} is the ${title}.`));
    }
  }
}

function addReportingFrames(
  input: ExtractCandidateFramesInput,
  frames: MemoryFrame[],
  recentPeople: string[]
): void {
  const reportsPattern =
    /\b(?<subject>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*|He|She|They|he|she|they)\s+reports\s+to\s+(?<manager>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s*(?:,\s*the\s+(?<managerTitle>[^,.!?]+(?:\.[^,.!?]+)?[^,.!?]*?))?(?:[.?!]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = reportsPattern.exec(input.text)) !== null) {
    const subject = resolvePronoun(match.groups?.subject ?? "", recentPeople);
    const manager = normalizePhrase(match.groups?.manager ?? "");
    const managerTitle = normalizePhrase(match.groups?.managerTitle ?? "");

    if (!subject || !manager) {
      continue;
    }

    recentPeople.push(subject, manager);
    frames.push(relationFrame(input, "reports_to", personRef(subject), personRef(manager), `${subject} reports to ${manager}.`));

    if (managerTitle) {
      frames.push(attributeFrame(input, "role_title", personRef(manager), managerTitle, `${manager} is the ${managerTitle}.`));
    }
  }
}

function addRoleFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const rolePattern =
    /\b(?<name>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+is\s+the\s+(?<title>DBA|CTO|CEO|CFO|COO|CIO|manager|director|engineer|architect|owner)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = rolePattern.exec(input.text)) !== null) {
    const name = normalizePhrase(match.groups?.name ?? "");
    const title = normalizePhrase(match.groups?.title ?? "");

    if (!name || !title || /\b(my|the)\b/i.test(name)) {
      continue;
    }

    frames.push(attributeFrame(input, "role_title", personRef(name), title, `${name} is the ${title}.`));
  }
}

function addTechnologyFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const scopedPattern =
    /\b(?:in|for)\s+(?:the\s+)?(?<scope>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\s*,?\s+we\s+use\s+(?<technology>[A-Za-z][A-Za-z0-9+/#.'-]*(?:\s+[A-Za-z][A-Za-z0-9+/#.'-]*){0,2})\b/gi;
  let scopedMatch: RegExpExecArray | null;

  while ((scopedMatch = scopedPattern.exec(input.text)) !== null) {
    const scope = normalizePhrase(scopedMatch.groups?.scope ?? "");
    const technology = normalizePhrase(scopedMatch.groups?.technology ?? "");

    if (!scope || !technology) {
      continue;
    }

    frames.push(
      relationFrame(
        input,
        "uses_technology",
        contextRef(scope),
        topicRef(technology),
        `We use ${technology} in ${scope}.`,
        "complete",
        scope
      )
    );
  }

  if (/\bwe\s+use\s+mysql\b/i.test(input.text) && !frames.some((frame) => frame.relation === "uses_technology")) {
    frames.push(
      relationFrame(
        input,
        "uses_technology",
        { entity_id: "context_unknown", entity_kind: "Context" },
        topicRef("MySQL"),
        "We use MySQL.",
        "unknown",
        null
      )
    );
  }
}

function addDecisionAndQuestionFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const context = extractContextName(input.text);
  const subject = context ? contextRef(context) : { entity_id: "context_unknown", entity_kind: "Context" as const };
  const scopeState: MemoryFrameScopeState = context ? "partial" : "unknown";

  for (const decision of extractLabeledSegments(input.text, "decision")) {
    frames.push(valueFrame(input, "decision", subject, decision, scopeState, context));
  }

  for (const question of extractLabeledSegments(input.text, "open question")) {
    frames.push(valueFrame(input, "open_question", subject, question, scopeState, context));
  }
}

function relationFrame(
  input: ExtractCandidateFramesInput,
  relation: string,
  subject: MemoryFrameEntityRef,
  object: MemoryFrameEntityRef,
  statement: string,
  scopeState: MemoryFrameScopeState = "complete",
  scope?: string | null
): MemoryFrame {
  return {
    frame_id: frameId("rel", input.sourceEventId, relation, subject.entity_id, object.entity_id),
    frame_kind: "relation",
    relation,
    subject,
    object,
    statement,
    scope,
    source_events: [input.sourceEventId],
    scope_state: scopeState,
    evidence_strength: "explicit"
  };
}

function attributeFrame(
  input: ExtractCandidateFramesInput,
  attribute: string,
  subject: MemoryFrameEntityRef,
  value: string,
  statement: string
): MemoryFrame {
  return {
    frame_id: frameId("attr", input.sourceEventId, attribute, subject.entity_id, value),
    frame_kind: "attribute",
    attribute,
    subject,
    value,
    statement,
    source_events: [input.sourceEventId],
    scope_state: "partial",
    evidence_strength: "explicit"
  };
}

function valueFrame(
  input: ExtractCandidateFramesInput,
  frameKind: Extract<MemoryFrame["frame_kind"], "decision" | "open_question">,
  subject: MemoryFrameEntityRef,
  value: string,
  scopeState: MemoryFrameScopeState,
  scope?: string | null
): MemoryFrame {
  return {
    frame_id: frameId(frameKind, input.sourceEventId, subject.entity_id, value),
    frame_kind: frameKind,
    subject,
    value,
    statement: value,
    scope,
    source_events: [input.sourceEventId],
    scope_state: scopeState,
    evidence_strength: "explicit"
  };
}

function personRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `person_${idSlug(name)}`,
    entity_kind: "Person"
  };
}

function contextRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `context_${idSlug(name)}`,
    entity_kind: "Context"
  };
}

function topicRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `topic_${idSlug(name)}`,
    entity_kind: "Topic"
  };
}

function frameId(prefix: string, ...parts: string[]): string {
  return `frame_${prefix}_${parts.map(idSlug).filter(Boolean).join("_")}`;
}

function extractContextName(text: string): string | null {
  const match = /\b(?:for|in)\s+(?:the\s+)?(?<context>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\s*,?\s+(?:decision|open question)\s*:/i.exec(text);
  return match?.groups?.context ? normalizePhrase(match.groups.context) : null;
}

function extractLabeledSegments(text: string, label: "decision" | "open question"): string[] {
  const escaped = label.replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`\\b${escaped}\\s*:\\s*(?<value>[^.?!]+(?:[.?!]|$))`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = normalizePhrase(match.groups?.value ?? "");

    if (value) {
      values.push(value);
    }
  }

  return values;
}

function resolvePronoun(value: string, recentPeople: string[]): string {
  if (/^(he|she|they)$/i.test(value)) {
    return recentPeople.at(-1) ?? "";
  }

  return /^[A-Z]/.test(value) ? normalizePhrase(value) : "";
}

function dedupeFrames(frames: MemoryFrame[]): MemoryFrame[] {
  const seen = new Set<string>();
  const deduped: MemoryFrame[] = [];

  for (const frame of frames) {
    if (seen.has(frame.frame_id)) {
      continue;
    }

    seen.add(frame.frame_id);
    deduped.push(frame);
  }

  return deduped;
}

function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.?!]\s*$/, "").trim();
}

function idSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
