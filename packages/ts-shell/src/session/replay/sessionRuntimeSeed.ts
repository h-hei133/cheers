import type { QueryRuntimeStateSeed } from "../../core/query/runtimeState.js";
import {
  buildResumeReplayInput,
  type RuntimeSeedOptions,
} from "../replay/builder.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";

export function buildSessionRuntimeStateSeed(input: {
  readonly sessionId: string;
  readonly snapshot: RecoverySnapshot;
  readonly options?: RuntimeSeedOptions;
}): QueryRuntimeStateSeed {
  return buildResumeReplayInput(input);
}
