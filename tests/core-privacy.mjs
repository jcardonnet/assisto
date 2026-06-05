import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTsModule } from "./ts-module-loader.mjs";

const privacyModulePath = "packages/core/src/privacy/index.ts";

async function loadPrivacyModule() {
  try {
    return {
      ok: true,
      module: await loadTsModule(privacyModulePath)
    };
  } catch (error) {
    return {
      ok: false,
      error
    };
  }
}

async function requirePrivacyModule() {
  const loaded = await loadPrivacyModule();
  assert.equal(
    loaded.ok,
    true,
    "Expected " + privacyModulePath + " to exist and load: " + (loaded.error?.message ?? "unknown error")
  );
  return loaded.module;
}

export async function runCorePrivacyTests() {
  const privacy = await requirePrivacyModule();

  assert.equal(
    privacy.redactRawNote("Call Priya at 555-0100"),
    "[redacted:raw_note chars=22 lines=1]"
  );
  assert.equal(
    privacy.redactEventRawText("Jeff is the DBA.\nSecond line."),
    "[redacted:event_raw_text chars=29 lines=2]"
  );
  assert.equal(
    privacy.redactImportedSourceText("BEGIN:VCALENDAR\nSECRET\nEND:VCALENDAR"),
    "[redacted:imported_source_text chars=37 lines=3]"
  );
  assert.equal(
    privacy.redactProviderPrompt("Summarize Joe manager chain"),
    "[redacted:provider_prompt chars=27 lines=1]"
  );
  assert.equal(
    privacy.redactProviderResponse("{\"answer\":\"Priya manages Joe\"}"),
    "[redacted:provider_response chars=31 lines=1]"
  );
  assert.equal(
    privacy.redactProposedMarkdownWrite("---\ntitle: Priya\n---\nActive claim"),
    "[redacted:proposed_markdown_write chars=33 lines=4]"
  );
  assert.equal(
    privacy.redactUserString("Priya Patel"),
    "[redacted:user_string chars=11 lines=1]"
  );

  assert.equal(
    privacy.redactApiKey("sk-live-super-secret"),
    "[redacted:api_key chars=20]"
  );
  assert.equal(
    privacy.redactBearerToken("Bearer abc.def.ghi"),
    "[redacted:bearer_token chars=18]"
  );
  assert.equal(
    privacy.redactAbsolutePath("/home/jc/assisto/memory/events/2026/secret.md"),
    "[redacted:absolute_path chars=45 segments=6]"
  );
  assert.equal(
    privacy.redactAbsolutePath(String.raw`C:\Users\jc\assisto\memory\events\secret.md`),
    "[redacted:absolute_path chars=41 segments=6]"
  );

  assert.equal(privacy.safeCount(7.9), 7);
  assert.equal(privacy.safeCount(-4), 0);
  assert.equal(privacy.safeCount(Number.POSITIVE_INFINITY), 0);

  assert.equal(privacy.safeCode("Missing API Key!"), "missing_api_key");
  assert.equal(privacy.safeCode("sha256:" + "a".repeat(64)), "unknown");
  assert.equal(privacy.safeCode("  "), "unknown");

  assert.equal(privacy.safeKind(" Provider Prompt "), "provider_prompt");
  assert.equal(privacy.safeKind("route/template"), "route_template");

  assert.equal(privacy.safeStatusClass(204), "2xx");
  assert.equal(privacy.safeStatusClass(404), "4xx");
  assert.equal(privacy.safeStatusClass(999), "unknown");

  assert.equal(
    privacy.safeRouteTemplate("http://127.0.0.1:3721/api/events/evt_2026_06_02_001/apply?raw=true"),
    "/api/events/:id/apply"
  );
  assert.equal(
    privacy.safeRouteTemplate("/workbench/import/sessions/550e8400-e29b-41d4-a716-446655440000"),
    "/workbench/import/sessions/:id"
  );
  assert.equal(
    privacy.safeRouteTemplate("/api/claims/clm_joe_role_dba"),
    "/api/claims/:id"
  );
  assert.equal(
    privacy.safeRouteTemplate("/api/people/person_kuastav"),
    "/api/people/:id"
  );

  const first = privacy.explicitCorrelationHash("Priya Patel");
  const second = privacy.explicitCorrelationHash("Priya Patel");
  const third = privacy.explicitCorrelationHash("Jeff Harris");

  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, third);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCorePrivacyTests();
  console.log("core privacy tests passed");
}
