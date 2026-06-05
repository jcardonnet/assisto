import type { CapabilityDefinition } from "./schema";

export { validateCapabilityRegistry } from "./schema";
export type {
  CapabilityDefinition,
  CapabilityMutationKind,
  CapabilityValidationGroup,
  CapabilityValidationResult
} from "./schema";

export const capabilityRegistry = [
  {
    id: "capture",
    title: "Capture note",
    mutationKind: "transaction_backed",
    cliCommands: ["wm capture", "wm capture quick"],
    workbenchRoutes: ["/api/capture/preview", "/api/capture", "/api/capture/quick/preview", "/api/capture/quick"],
    piTools: ["wm_capture_note", "wm_capture_quick", "/wm-capture", "/wm-capture-quick"],
    docs: ["docs/use-assisto-tomorrow.md"],
    validationGroups: ["core", "workbench", "browser"],
    invariants: ["Writes Event plus pending Transaction only."]
  },
  {
    id: "ask-answer-contract",
    title: "Cited answer contract",
    mutationKind: "read_only",
    cliCommands: ["wm ask --answer-contract", "wm ask --answer-contract-v3", "wm ask --answer-contract-v4"],
    workbenchRoutes: [
      "/api/ask/answer-contract",
      "/api/ask/contract-v3",
      "/api/ask/answer-contract-v3",
      "/api/ask/contract-v4",
      "/api/ask/answer-contract-v4"
    ],
    piTools: ["wm_answer_contract_v3", "/wm-ask"],
    docs: ["docs/cited-work-memory.md"],
    validationGroups: ["retrieval", "answers"],
    invariants: ["Derived output only; cited claims must remain evidence-backed."]
  },
  {
    id: "entity-stewardship",
    title: "Entity stewardship",
    mutationKind: "transaction_backed",
    cliCommands: ["wm entities stewardship", "wm entities command-center", "wm entities repair-v2"],
    workbenchRoutes: [
      "/api/entities/stewardship",
      "/api/entities/stewardship-v2",
      "/api/entities/command-center",
      "/api/entities/identity-review/stage",
      "/api/entities/repair-v2/stage"
    ],
    piTools: [],
    docs: ["docs/revised-design.md", "docs/evidence-to-reasoning-work-memory.md"],
    validationGroups: ["core", "workbench"],
    invariants: ["Risk detection is derived; durable repair actions create pending Transactions."]
  },
  {
    id: "context-operating-room",
    title: "Context operating room",
    mutationKind: "transaction_backed",
    cliCommands: ["wm context operating-room", "wm context operating-room-v3"],
    workbenchRoutes: ["/api/contexts/operating-room", "/api/contexts/operating-room-v3"],
    piTools: [],
    docs: ["docs/revised-design.md", "docs/evidence-to-reasoning-work-memory.md"],
    validationGroups: ["core", "workbench", "browser"],
    invariants: ["Room output is derived; corrections route through capture or pending Transactions."]
  }
] as const satisfies readonly CapabilityDefinition[];
