export type RuntimePhase =
  | "idle"
  | "prompt"
  | "turn"
  | "tool_result_batch"
  | "save_point"
  | "compact"
  | "retry"
  | "continue"
  | "aborted";

export type RuntimePhaseTransitionStatus = "accepted" | "rejected";

export interface RuntimePhaseTransition {
  readonly from: RuntimePhase;
  readonly to: RuntimePhase;
  readonly status: RuntimePhaseTransitionStatus;
  readonly reason?: string;
}

const allowedTransitions: Readonly<Record<RuntimePhase, readonly RuntimePhase[]>> = {
  idle: ["prompt", "continue", "aborted"],
  prompt: ["turn", "aborted"],
  turn: ["tool_result_batch", "save_point", "retry", "continue", "aborted"],
  tool_result_batch: ["turn", "save_point", "aborted"],
  save_point: ["turn", "continue", "compact", "idle", "aborted"],
  compact: ["continue", "idle", "aborted"],
  retry: ["turn", "aborted"],
  continue: ["prompt", "turn", "idle", "aborted"],
  aborted: ["idle"],
};

export function transitionRuntimePhase(
  from: RuntimePhase,
  to: RuntimePhase,
): RuntimePhaseTransition {
  if (from === to || allowedTransitions[from].includes(to)) {
    return {
      from,
      to,
      status: "accepted",
    };
  }
  return {
    from,
    to,
    status: "rejected",
    reason: `invalid runtime phase transition: ${from}->${to}`,
  };
}

