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
  addOwnershipFrames(input, frames);
  addDependencyFrames(input, frames);
  addBlockerAndRiskFrames(input, frames);
  addMeetingFrames(input, frames);
  addCommitmentFrames(input, frames);
  addDecisionAndQuestionFrames(input, frames);
  addRoleChangeFrames(input, frames);

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

function addOwnershipFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const scoped = scopeFor(extractGeneralContextName(input.text));
  const ownerPattern =
    /\b(?<owner>Team\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*|[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+(?<verb>owns|maintains)\s+(?:the\s+)?(?<target>[^.?!]+?)(?:[.?!]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = ownerPattern.exec(input.text)) !== null) {
    const owner = normalizePhrase(match.groups?.owner ?? "");
    const verb = normalizePhrase(match.groups?.verb ?? "").toLowerCase();
    const target = cleanObjectPhrase(match.groups?.target ?? "");

    if (!owner || !target || isQuestionPhrase(owner)) {
      continue;
    }

    frames.push(
      relationFrame(
        input,
        verb === "maintains" ? "maintains" : "owns",
        actorRef(owner),
        workObjectRef(target),
        `${owner} ${verb} ${target}.`,
        scoped.scopeState,
        scoped.scope
      )
    );
  }

  const ownedByPattern =
    /\b(?:the\s+)?(?<target>[A-Z][A-Za-z0-9&.'/-]*(?:\s+[A-Za-z0-9&.'/-]+){0,5})\s+is\s+(?<verb>owned|maintained)\s+by\s+(?<owner>Team\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*|[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)(?:[.?!]|$)/gi;

  while ((match = ownedByPattern.exec(input.text)) !== null) {
    const target = cleanObjectPhrase(match.groups?.target ?? "");
    const verb = normalizePhrase(match.groups?.verb ?? "").toLowerCase();
    const owner = normalizePhrase(match.groups?.owner ?? "");

    if (!owner || !target) {
      continue;
    }

    frames.push(
      relationFrame(
        input,
        verb === "maintained" ? "maintained_by" : "owned_by",
        workObjectRef(target),
        actorRef(owner),
        `${target} is ${verb} by ${owner}.`,
        scoped.scopeState,
        scoped.scope
      )
    );
  }
}

function addDependencyFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const scoped = scopeFor(extractGeneralContextName(input.text));
  const dependsPattern =
    /\b(?<subject>[A-Z][A-Za-z0-9&'/-]*(?:\s+[A-Za-z0-9&'/-]+){0,5})\s+(?:depends\s+on|requires|needs)\s+(?:the\s+)?(?<object>[^.?!]+?)(?:[.?!]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = dependsPattern.exec(input.text)) !== null) {
    const subject = cleanObjectPhrase(match.groups?.subject ?? "");
    const object = cleanObjectPhrase(match.groups?.object ?? "");

    if (!subject || !object || isQuestionPhrase(subject)) {
      continue;
    }

    frames.push(
      relationFrame(
        input,
        "depends_on",
        workObjectRef(subject),
        workObjectRef(object),
        `${subject} depends on ${object}.`,
        scoped.scopeState,
        scoped.scope
      )
    );
  }
}

function addBlockerAndRiskFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const context = extractGeneralContextName(input.text);
  const subject = context ? contextRef(context) : { entity_id: "context_unknown", entity_kind: "Context" as const };
  const scoped = scopeFor(context);

  for (const risk of extractLabeledSegments(input.text, "risk")) {
    frames.push(valueFrame(input, "risk", subject, risk, scoped.scopeState, scoped.scope));
    addRiskRelationFromStatement(input, frames, risk, scoped);
  }

  const blockerPattern = /\b(?<risk>[A-Z][A-Za-z0-9&.'/-]*(?:\s+[A-Za-z0-9&.'/-]+){0,5})\s+(?:blocks|is\s+blocking)\s+(?:the\s+)?(?<target>[^.?!]+?)(?:[.?!]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = blockerPattern.exec(input.text)) !== null) {
    const risk = cleanObjectPhrase(match.groups?.risk ?? "");
    const target = cleanObjectPhrase(match.groups?.target ?? "");

    if (!risk || !target || isQuestionPhrase(risk)) {
      continue;
    }

    frames.push(
      relationFrame(input, "blocks", riskRef(risk), workObjectRef(target), `${risk} blocks ${target}.`, scoped.scopeState, scoped.scope)
    );
  }
}

function addMeetingFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const meetingPattern =
    /\bMeeting\s*:\s*(?<meeting>[^.?!]+?)\s+with\s+(?<participants>[^.?!]+?)(?:\s+about\s+(?<subject>[^.?!]+?))?(?:[.?!]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = meetingPattern.exec(input.text)) !== null) {
    const meeting = normalizePhrase(match.groups?.meeting ?? "");
    const meetingEntity = meetingRef(meeting || input.sourceEventId);
    const subject = cleanObjectPhrase(match.groups?.subject ?? "");

    for (const participant of extractPeopleList(match.groups?.participants ?? "")) {
      frames.push(
        relationFrame(
          input,
          "participant_in",
          personRef(participant),
          meetingEntity,
          `${participant} participated in ${meeting || "the meeting"}.`
        )
      );
    }

    if (subject) {
      frames.push(
        relationFrame(input, "discussed_in", workObjectRef(subject), meetingEntity, `${subject} was discussed in ${meeting || "the meeting"}.`)
      );
    }
  }

  const metWithPattern =
    /\b(?:I|We)\s+met\s+with\s+(?<participants>[^.?!]+?)(?:\s+about\s+(?<subject>[^.?!]+?))?(?:[.?!]|$)/gi;

  while ((match = metWithPattern.exec(input.text)) !== null) {
    const subject = cleanObjectPhrase(match.groups?.subject ?? "");
    const meetingEntity = meetingRef(subject ? `${subject} meeting` : input.sourceEventId);

    for (const participant of extractPeopleList(match.groups?.participants ?? "")) {
      frames.push(
        relationFrame(input, "participant_in", personRef(participant), meetingEntity, `${participant} participated in the meeting.`)
      );
    }

    if (subject) {
      frames.push(relationFrame(input, "discussed_in", workObjectRef(subject), meetingEntity, `${subject} was discussed in the meeting.`));
    }
  }
}

function addCommitmentFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const scoped = scopeFor(extractGeneralContextName(input.text));
  const commitmentPattern =
    /\b(?<actor>I|[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*)*|Team\s+[A-Z][A-Za-z0-9&'-]*(?:\s+[A-Z][A-Za-z0-9&'-]*)*)\s+(?:committed\s+to|will)\s+(?<action>[^.?!]*?)(?:\s+by\s+(?<due>\d{4}-\d{2}-\d{2}|[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?))?(?:[.?!]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = commitmentPattern.exec(input.text)) !== null) {
    const actor = normalizePhrase(match.groups?.actor ?? "");
    const action = cleanObjectPhrase(match.groups?.action ?? "");
    const due = normalizePhrase(match.groups?.due ?? "");

    if (!actor || !action || action.length < 3) {
      continue;
    }

    const commitment = commitmentRef(action);
    const owner = /^I$/i.test(actor) ? personRef("User") : actorRef(actor);

    frames.push(
      relationFrame(input, "committed_to", owner, commitment, `${actor} committed to ${action}.`, scoped.scopeState, scoped.scope)
    );

    if (due) {
      frames.push(
        relationFrame(input, "due_on", commitment, dueDateRef(due), `${action} is due on ${due}.`, scoped.scopeState, scoped.scope)
      );
    }
  }
}

function addDecisionAndQuestionFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const context = extractDecisionContextName(input.text) ?? extractGeneralContextName(input.text);
  const subject = context ? contextRef(context) : { entity_id: "context_unknown", entity_kind: "Context" as const };
  const scopeState: MemoryFrameScopeState = context ? "partial" : "unknown";

  for (const decision of extractLabeledSegments(input.text, "decision")) {
    frames.push(valueFrame(input, "decision", subject, decision, scopeState, context));
    frames.push(relationFrame(input, "has_decision", subject, decisionRef(decision), decision, scopeState, context));
  }

  for (const question of extractLabeledSegments(input.text, "open question")) {
    frames.push(valueFrame(input, "open_question", subject, question, scopeState, context));
    frames.push(relationFrame(input, "has_open_question", subject, openQuestionRef(question), question, scopeState, context));
  }
}

function addRoleChangeFrames(input: ExtractCandidateFramesInput, frames: MemoryFrame[]): void {
  const scoped = scopeFor(extractGeneralContextName(input.text));
  const reportsChangePattern =
    /\b(?<subject>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+now\s+reports\s+to\s+(?<manager>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)(?:[.?!]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = reportsChangePattern.exec(input.text)) !== null) {
    const subject = normalizePhrase(match.groups?.subject ?? "");
    const manager = normalizePhrase(match.groups?.manager ?? "");

    if (!subject || !manager) {
      continue;
    }

    frames.push(
      relationFrame(input, "reports_to", personRef(subject), personRef(manager), `${subject} now reports to ${manager}.`, "complete", null, "change")
    );
  }

  const roleChangePatterns = [
    /\b(?<name>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)[']s\s+role\s+changed\s+to\s+(?<role>[^.?!]+?)(?:[.?!]|$)/gi,
    /\b(?<name>[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+is\s+now\s+the\s+(?<role>[^.?!]+?)(?:[.?!]|$)/gi
  ];

  for (const pattern of roleChangePatterns) {
    while ((match = pattern.exec(input.text)) !== null) {
      const name = normalizePhrase(match.groups?.name ?? "");
      const role = cleanObjectPhrase(match.groups?.role ?? "");

      if (!name || !role) {
        continue;
      }

      frames.push(attributeFrame(input, "role_title", personRef(name), role, `${name} is now the ${role}.`, "change"));
      frames.push(
        relationFrame(input, "role_in", personRef(name), roleRef(role), `${name} is now in role ${role}.`, scoped.scopeState, scoped.scope, "change")
      );
    }
  }
}

function relationFrame(
  input: ExtractCandidateFramesInput,
  relation: string,
  subject: MemoryFrameEntityRef,
  object: MemoryFrameEntityRef,
  statement: string,
  scopeState: MemoryFrameScopeState = "complete",
  scope?: string | null,
  changeType?: MemoryFrame["change_type"]
): MemoryFrame {
  const frame: MemoryFrame = {
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

  if (changeType) {
    frame.change_type = changeType;
  }

  return frame;
}

function attributeFrame(
  input: ExtractCandidateFramesInput,
  attribute: string,
  subject: MemoryFrameEntityRef,
  value: string,
  statement: string,
  changeType?: MemoryFrame["change_type"]
): MemoryFrame {
  const frame: MemoryFrame = {
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

  if (changeType) {
    frame.change_type = changeType;
  }

  return frame;
}

function valueFrame(
  input: ExtractCandidateFramesInput,
  frameKind: Extract<MemoryFrame["frame_kind"], "decision" | "open_question" | "risk" | "followup_signal">,
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

function teamRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `team_${idSlug(name.replace(/^Team\s+/i, ""))}`,
    entity_kind: "Team"
  };
}

function serviceRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `service_${idSlug(name)}`,
    entity_kind: "Service"
  };
}

function systemRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `system_${idSlug(name)}`,
    entity_kind: "System"
  };
}

function repositoryRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `repo_${idSlug(name.replace(/\brepository\b/gi, ""))}`,
    entity_kind: "Repository"
  };
}

function artifactRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `artifact_${idSlug(name)}`,
    entity_kind: "Artifact"
  };
}

function riskRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `risk_${idSlug(name.replace(/\brisk\b/gi, ""))}`,
    entity_kind: "Risk"
  };
}

function meetingRef(name: string): MemoryFrameEntityRef {
  return {
    entity_id: `meeting_${idSlug(name)}`,
    entity_kind: "Meeting"
  };
}

function decisionRef(value: string): MemoryFrameEntityRef {
  return {
    entity_id: `decision_${idSlug(value)}`,
    entity_kind: "Decision"
  };
}

function openQuestionRef(value: string): MemoryFrameEntityRef {
  return {
    entity_id: `open_question_${idSlug(value)}`,
    entity_kind: "OpenQuestion"
  };
}

function commitmentRef(value: string): MemoryFrameEntityRef {
  return {
    entity_id: `commitment_${idSlug(value)}`,
    entity_kind: "Commitment"
  };
}

function dueDateRef(value: string): MemoryFrameEntityRef {
  return {
    entity_id: `due_${idSlug(value)}`,
    entity_kind: "DueDate"
  };
}

function roleRef(value: string): MemoryFrameEntityRef {
  return {
    entity_id: `role_${idSlug(value)}`,
    entity_kind: "Role"
  };
}

function actorRef(name: string): MemoryFrameEntityRef {
  return /^Team\s+/i.test(name) ? teamRef(name) : personRef(name);
}

function workObjectRef(name: string): MemoryFrameEntityRef {
  if (/\b(repo|repository)\b/i.test(name)) {
    return repositoryRef(name);
  }

  if (/\b(api|service)\b/i.test(name)) {
    return serviceRef(name);
  }

  if (/\b(system|platform)\b/i.test(name)) {
    return systemRef(name);
  }

  if (/\b(project|context|initiative)\b/i.test(name)) {
    return contextRef(name);
  }

  if (/\b(dashboard|document|doc|report|artifact|runbook|playbook|rollout)\b/i.test(name)) {
    return artifactRef(name);
  }

  return topicRef(name);
}

function frameId(prefix: string, ...parts: string[]): string {
  return `frame_${prefix}_${parts.map(idSlug).filter(Boolean).join("_")}`;
}

function extractDecisionContextName(text: string): string | null {
  const match = /\b(?:for|in)\s+(?:the\s+)?(?<context>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\s*,?\s+(?:decision|open question)\s*:/i.exec(text);
  return match?.groups?.context ? normalizePhrase(match.groups.context) : null;
}

function extractGeneralContextName(text: string): string | null {
  const match = /\b(?:for|in)\s+(?:the\s+)?(?<context>[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)\s*,/i.exec(text);
  return match?.groups?.context ? normalizePhrase(match.groups.context) : null;
}

function extractLabeledSegments(text: string, label: "decision" | "open question" | "risk"): string[] {
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

function scopeFor(context: string | null): { scope: string | null; scopeState: MemoryFrameScopeState } {
  return context ? { scope: context, scopeState: "complete" } : { scope: null, scopeState: "unknown" };
}

function addRiskRelationFromStatement(
  input: ExtractCandidateFramesInput,
  frames: MemoryFrame[],
  statement: string,
  scoped: { scope: string | null; scopeState: MemoryFrameScopeState }
): void {
  const riskAffects = /^(?<risk>.+?)\s+affects\s+(?<target>.+)$/i.exec(statement);
  const riskBlocks = /^(?<risk>.+?)\s+blocks\s+(?<target>.+)$/i.exec(statement);
  const match = riskAffects ?? riskBlocks;

  if (!match?.groups) {
    return;
  }

  const risk = cleanObjectPhrase(match.groups.risk ?? "");
  const target = cleanObjectPhrase(match.groups.target ?? "");
  const relation = riskBlocks ? "blocks" : "risk_affects";

  if (!risk || !target) {
    return;
  }

  frames.push(
    relationFrame(
      input,
      relation,
      riskRef(risk),
      workObjectRef(target),
      `${risk} ${relation === "blocks" ? "blocks" : "affects"} ${target}.`,
      scoped.scopeState,
      scoped.scope
    )
  );
}

function extractPeopleList(value: string): string[] {
  return value
    .split(/\s*,\s*|\s+and\s+/i)
    .map((item) => normalizePhrase(item.replace(/\babout\b.*$/i, "")))
    .filter((item) => /^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*$/.test(item));
}

function cleanObjectPhrase(value: string): string {
  return normalizePhrase(
    value
      .replace(/^the\s+/i, "")
      .replace(/\s+\bin\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*$/i, "")
      .replace(/\s+\bfor\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*$/i, "")
  );
}

function isQuestionPhrase(value: string): boolean {
  return /\b(?:who|what|where|when|why|how)\b/i.test(value);
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
