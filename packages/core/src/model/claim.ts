import type {
  ClaimKind,
  ClaimState,
  EvidenceStrength,
  ScopeState
} from "./enums";
import type { IsoDate, IsoDateTime } from "./common";
import type { ClaimId, ContextId, EventId } from "./ids";

export interface ClaimBlock {
  claim_id: ClaimId;
  statement: string;
  claim_state: ClaimState;
  claim_kind: ClaimKind;
  evidence_strength: EvidenceStrength;
  scope_state: ScopeState;
  evidence: EventId[];
  scope?: ContextId | string | null;
  recorded_at: IsoDateTime;
  observed_at?: IsoDateTime | IsoDate | null;
  valid_from?: IsoDate | null;
  valid_to?: IsoDate | null;
}

