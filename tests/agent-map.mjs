import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRepoMap,
  queryRepoMap,
  writeRepoMap
} from "../scripts/agent-map.mjs";

export async function runAgentMapTests() {
  const repoMap = buildRepoMap({ generatedAt: "2026-05-28T02:30:00.000Z" });
  assert.equal(repoMap.schema_version, 1);
  assert.equal(repoMap.areas.some((area) => area.area === "agent-control-plane"), true);
  assert.equal(queryRepoMap(repoMap, "workbench")[0].area, "workbench-ui");
  assert.equal(queryRepoMap(repoMap, "memory-data writes")[0].area, "agent-control-plane");

  const root = await mkdtemp(join(tmpdir(), "assisto-agent-map-"));
  try {
    const written = await writeRepoMap({ root, generatedAt: "2026-05-28T02:31:00.000Z" });
    assert.match(written.filePath, /\.assisto-agent\/cache\/repo-map\.json$/);
    const fromDisk = JSON.parse(await readFile(written.filePath, "utf8"));
    assert.equal(fromDisk.areas.length, repoMap.areas.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
