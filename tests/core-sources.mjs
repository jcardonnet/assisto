import assert from "node:assert/strict";
import { loadTsModule } from "./ts-module-loader.mjs";

export async function runCoreSourcesTests() {
  const sources = await loadTsModule("packages/core/src/sources/index.ts");

  assert.equal(
    sources.computeSourceHash("Kuastav is my manager.\n"),
    sources.computeSourceHash("Kuastav is my manager.\n")
  );
  assert.notEqual(
    sources.computeSourceHash("Kuastav is my manager.\n"),
    sources.computeSourceHash("Jeff is my manager.\n")
  );

  const markdown = sources.parseMarkdownSource({
    rawText: "# Standup\n\nKuastav is my manager.",
    sourceLabel: "source:markdown",
    observedAt: "2026-06-01T10:00:00.000Z"
  });

  assert.equal(markdown.units.length, 1);
  assert.equal(markdown.units[0].raw_text, "# Standup\n\nKuastav is my manager.");
  assert.equal(markdown.units[0].source_label, "source:markdown");
  assert.equal(markdown.units[0].observed_at, "2026-06-01T10:00:00.000Z");
  assert.match(markdown.units[0].source_hash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(markdown.skipped, []);

  const text = sources.parseTextSource({
    rawText: "First note\n---\nSecond note\n\n---\n",
    sourceLabel: "source:pasted"
  });

  assert.deepEqual(text.units.map((unit) => unit.raw_text), ["First note", "Second note"]);
  assert.equal(text.units.every((unit) => unit.source_label === "source:pasted"), true);
}
