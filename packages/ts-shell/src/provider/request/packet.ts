import type { ContextSelection } from "../../context/selection/model.js";
import type { ExecutionPlan } from "../../planning/execution/model.js";

export type RequestPacketState = "ready" | "blocked";

export interface TaskRequestPacketInput {
  readonly shortPrompt: string;
  readonly taskKind: string;
  readonly context: ContextSelection;
  readonly plan: ExecutionPlan;
}

export interface TaskRequestPacket {
  readonly state: RequestPacketState;
  readonly goalSummary: string;
  readonly contextPaths: readonly string[];
  readonly contextPacketSummary: string;
  readonly verificationCandidates: readonly string[];
  readonly omittedContextCount: number;
  readonly planSteps: readonly string[];
  readonly outputContract: string;
  readonly blockers: readonly string[];
  readonly redactionRules: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildTaskRequestPacket(input: TaskRequestPacketInput): TaskRequestPacket {
  const blockers = [
    ...input.context.blockers,
    ...input.plan.blockers,
  ];

  return freeze({
    state: blockers.length > 0 ? "blocked" : "ready",
    goalSummary: input.shortPrompt,
    contextPaths: input.context.selectedPaths,
    contextPacketSummary: input.context.contextPacketSummary,
    verificationCandidates: input.context.verificationPaths,
    omittedContextCount: input.context.omittedPaths.length,
    planSteps: input.plan.steps,
    outputContract: outputContractFor(input.taskKind),
    blockers,
    redactionRules: [
      "exclude raw transcript",
      "exclude provider output",
      "exclude command output",
      "exclude edit text",
      "exclude secrets",
    ],
    terminalSuccessClaim: false,
  });
}

function outputContractFor(taskKind: string): string {
  if (taskKind === "debug-repair") {
    return "bounded repair with post-repair verification";
  }
  if (taskKind === "docs-report") {
    return "source-scoped report artifact";
  }
  if (taskKind === "data-artifact") {
    return "validated structured artifact";
  }
  if (taskKind === "continuation") {
    return "fresh continuation facts";
  }
  return "task-relevant verified result";
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
