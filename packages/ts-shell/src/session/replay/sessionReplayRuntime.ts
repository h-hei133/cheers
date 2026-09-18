import type {
  QueryRuntimeStateSeed,
} from "../../core/query/runtime/state.js";
import type { RuntimeSeedOptions } from "./builder.js";
import {
  buildReplayPlan,
  type ReplayPlan,
} from "./sessionReplayFacade.js";
import { buildSessionRuntimeStateSeed } from "./sessionRuntimeSeed.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";

export function buildReplayPlanForSession(
  snapshot: RecoverySnapshot,
): ReplayPlan {
  return buildReplayPlan(snapshot);
}

export function buildRuntimeStateSeedForSession(input: {
  readonly sessionId: string;
  readonly snapshot: RecoverySnapshot;
  readonly options: RuntimeSeedOptions;
}): QueryRuntimeStateSeed {
  return buildSessionRuntimeStateSeed(input);
}
