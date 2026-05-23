import { runUnitTests } from "./run-unit.mjs";
import { runIntegrationTests } from "./run-integration.mjs";

await runUnitTests();
await runIntegrationTests();

console.log("unit and integration tests passed");
