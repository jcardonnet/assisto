import {
  createCaptureNote,
  previewCaptureNote,
  type CaptureCreateResult,
  type CaptureNoteOptions,
  type CapturePreviewResult,
  type CaptureResult
} from "../capture";
import { listMarkdownFiles, readMarkdownPage } from "../fs";
import { parseMarkdownFile, type FrontmatterValue } from "../markdown";
import type { ExtractionProvider } from "../extraction";

export type WorkdayCaptureProviderName = "rule" | "openai";

export interface WorkdayCapturePreset {
  preset_id: string;
  label: string;
  source_label: string;
  template: string;
  suggested_contexts: WorkdayCaptureContextSuggestion[];
  provider: WorkdayCaptureProviderName;
}

export interface WorkdayCaptureContextSuggestion {
  id: string;
  path: string;
  name: string;
  aliases: string[];
}

export interface WorkdayCaptureInput {
  preset_id?: string;
  note: string;
  observed_at?: string | null;
  source_label?: string;
  context?: string;
  provider?: WorkdayCaptureProviderName;
  extractionProvider?: ExtractionProvider;
}

export type WorkdayCapturePreview = CapturePreviewResult & WorkdayCaptureSummary;
export type WorkdayCaptureCreate = CaptureCreateResult & WorkdayCaptureSummary;

interface WorkdayCaptureSummary {
  note: string;
  preset?: WorkdayCapturePreset;
  candidate_claims: string[];
  likely_reviews: string[];
  validation_warnings: string[];
  event_preview: {
    source_label: string;
    observed_at: string | null;
  };
  pending_transaction_preview: {
    operation_count: number;
    affected_files: string[];
  };
}

interface BuiltInWorkdayCapturePreset {
  preset_id: string;
  label: string;
  source_label: string;
  template: string;
  suggested_context_ids: string[];
  provider: WorkdayCaptureProviderName;
}

const builtInPresets: BuiltInWorkdayCapturePreset[] = [
  {
    preset_id: "quick-note",
    label: "Quick note",
    source_label: "quick note",
    template: "",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "meeting-note",
    label: "Meeting note",
    source_label: "meeting note",
    template: "Meeting with ...\nKey facts:\nFollow-ups:",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "person-fact",
    label: "Person fact",
    source_label: "person fact",
    template: "Name is ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "project-context",
    label: "Project context",
    source_label: "project context",
    template: "Context/project ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "follow-up",
    label: "Follow-up",
    source_label: "follow-up note",
    template: "I need to ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "retrieval-miss",
    label: "Retrieval miss",
    source_label: "retrieval miss",
    template: "Assisto could not answer ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "correction",
    label: "Correction",
    source_label: "correction",
    template: "Correction: ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "decision-as-claim",
    label: "Decision",
    source_label: "decision note",
    template: "Decision: ...",
    suggested_context_ids: [],
    provider: "rule"
  },
  {
    preset_id: "open-question-as-claim",
    label: "Open question",
    source_label: "open question",
    template: "Open question: ...",
    suggested_context_ids: [],
    provider: "rule"
  }
];

export async function listWorkdayCapturePresets(root?: string): Promise<WorkdayCapturePreset[]> {
  const contexts = root ? await collectContextSuggestions(root) : [];

  return builtInPresets.map((preset) => ({
    preset_id: preset.preset_id,
    label: preset.label,
    source_label: preset.source_label,
    template: preset.template,
    suggested_contexts:
      preset.suggested_context_ids.length > 0
        ? contexts.filter((context) => preset.suggested_context_ids.includes(context.id))
        : contexts,
    provider: preset.provider
  }));
}

export async function previewWorkdayCapture(
  root: string,
  input: WorkdayCaptureInput
): Promise<WorkdayCapturePreview> {
  const resolved = await resolveWorkdayCaptureInput(root, input);
  const result = await previewCaptureNote(root, resolved.note, resolved.options);
  return enrichWorkdayCaptureResult(result, resolved.preset, resolved.sourceLabel, resolved.observedAt);
}

export async function createWorkdayCapture(root: string, input: WorkdayCaptureInput): Promise<WorkdayCaptureCreate> {
  const resolved = await resolveWorkdayCaptureInput(root, input);
  const result = await createCaptureNote(root, resolved.note, resolved.options);
  return enrichWorkdayCaptureResult(result, resolved.preset, resolved.sourceLabel, resolved.observedAt);
}

async function resolveWorkdayCaptureInput(root: string, input: WorkdayCaptureInput): Promise<{
  note: string;
  preset?: WorkdayCapturePreset;
  sourceLabel: string;
  observedAt: string | null;
  options: CaptureNoteOptions;
}> {
  const note = input.note.trim();

  if (!note) {
    throw new Error("Workday capture note must not be empty.");
  }

  const presets = await listWorkdayCapturePresets(root);
  const preset = presets.find((item) => item.preset_id === (input.preset_id ?? "quick-note"));

  if (input.preset_id && !preset) {
    throw new Error(`Unknown workday capture preset: ${input.preset_id}`);
  }

  const sourceLabel = input.source_label?.trim() || preset?.source_label || "quick note";
  const observedAt = input.observed_at ?? null;
  const providerName = input.provider ?? preset?.provider ?? "rule";

  return {
    note,
    preset,
    sourceLabel,
    observedAt,
    options: {
      observed_at: observedAt,
      source_label: sourceLabel,
      context: input.context?.trim() || undefined,
      provider: providerName === "openai" ? input.extractionProvider : undefined
    }
  };
}

function enrichWorkdayCaptureResult<T extends CaptureResult>(
  result: T,
  preset: WorkdayCapturePreset | undefined,
  sourceLabel: string,
  observedAt: string | null
): T & WorkdayCaptureSummary {
  return {
    ...result,
    note: result.event_raw_text,
    preset,
    candidate_claims: result.extracted_claim_ids,
    likely_reviews: result.staged_review_paths,
    validation_warnings: result.validation.errors.map((error) => error.message),
    event_preview: {
      source_label: sourceLabel,
      observed_at: observedAt
    },
    pending_transaction_preview: {
      operation_count: result.operations.length,
      affected_files: result.affected_files
    }
  };
}

async function collectContextSuggestions(root: string): Promise<WorkdayCaptureContextSuggestion[]> {
  const contexts: WorkdayCaptureContextSuggestion[] = [];

  const files = new Set([
    ...(await listFilesOrEmpty(root, "memory/contexts/*.md")),
    ...(await listFilesOrEmpty(root, "memory/contexts/**/*.md"))
  ]);

  for (const file of files) {
    try {
      const parsed = parseMarkdownFile(await readMarkdownPage(root, file));

      if (parsed.frontmatter.type !== "context" || parsed.frontmatter.object_state === "archived") {
        continue;
      }

      const id = stringValue(parsed.frontmatter.id);

      if (!id) {
        continue;
      }

      contexts.push({
        id,
        path: file,
        name: titleFromMarkdown(parsed.body) ?? id,
        aliases: stringArrayValue(parsed.frontmatter.aliases)
      });
    } catch {
      continue;
    }
  }

  return contexts.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

async function listFilesOrEmpty(root: string, pattern: string): Promise<string[]> {
  try {
    return await listMarkdownFiles(root, pattern);
  } catch {
    return [];
  }
}

function titleFromMarkdown(body: string): string | undefined {
  const match = /^#\s+(.+?)\s*$/m.exec(body);
  return match?.[1];
}

function stringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
