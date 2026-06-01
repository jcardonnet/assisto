import type { SourceFacadeInput, SourceFacadeResult } from "./types";
import { parseSingleSourceUnit } from "./text";

export function parseMarkdownSource(input: SourceFacadeInput): SourceFacadeResult {
  return parseSingleSourceUnit(input, "markdown");
}
