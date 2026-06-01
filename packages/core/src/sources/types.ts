export type SourceFacadeKind = "markdown" | "text" | "pasted" | "manual";

export type SourceFacadeInput = {
  rawText: string;
  sourceLabel: string;
  observedAt?: string;
  path?: string;
};

export type SourceFacadeUnit = {
  adapter_kind: SourceFacadeKind;
  raw_text: string;
  source_label: string;
  source_hash: string;
  observed_at?: string;
  source_path?: string;
};

export type SourceFacadeSkippedUnit = {
  reason: "empty_unit";
  raw_text: string;
};

export type SourceFacadeResult = {
  units: SourceFacadeUnit[];
  skipped: SourceFacadeSkippedUnit[];
};
