import { computeSourceHash } from "./hash";
import type { SourceFacadeInput, SourceFacadeResult, SourceFacadeUnit } from "./types";

function splitSourceUnits(rawText: string): string[] {
  return rawText
    .split(/\n\s*---\s*\n/gu)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);
}

function sourceUnit(input: SourceFacadeInput, rawText: string, adapterKind: SourceFacadeUnit["adapter_kind"]): SourceFacadeUnit {
  return {
    adapter_kind: adapterKind,
    raw_text: rawText,
    source_label: input.sourceLabel,
    source_hash: computeSourceHash(rawText),
    observed_at: input.observedAt,
    source_path: input.path
  };
}

export function parseTextSource(input: SourceFacadeInput): SourceFacadeResult {
  const units = splitSourceUnits(input.rawText).map((rawText) => sourceUnit(input, rawText, "text"));

  return {
    units,
    skipped: input.rawText.trim() === "" ? [{ reason: "empty_unit", raw_text: input.rawText }] : []
  };
}

export function parseSingleSourceUnit(input: SourceFacadeInput, adapterKind: SourceFacadeUnit["adapter_kind"]): SourceFacadeResult {
  const rawText = input.rawText.trim();

  if (rawText.length === 0) {
    return {
      units: [],
      skipped: [{ reason: "empty_unit", raw_text: input.rawText }]
    };
  }

  return {
    units: [sourceUnit(input, rawText, adapterKind)],
    skipped: []
  };
}
