import type { QueryRuntimeStateSeed } from "../../core/query/runtime/state.js";
import {
  buildResumeReplayInput,
  type RuntimeSeedOptions,
} from "./builder.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";

export function buildSessionRuntimeStateSeed(input: {
  readonly sessionId: string;
  readonly snapshot: RecoverySnapshot;
  readonly options?: RuntimeSeedOptions;
}): QueryRuntimeStateSeed {
  return buildResumeReplayInput(input);
}
