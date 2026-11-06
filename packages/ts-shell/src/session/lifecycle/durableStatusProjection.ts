import type { TerminalClassification } from "../../result/types.js";

export type SessionLifecycleStatus =
  | "active"
  | "interrupted"
  | "completed"
  | "completed_unproven"
  | "error"
  | "terminated";

export type DurableSessionStatus = "success" | "stopped" | "error" | "completed_unproven";

export function projectDurableStatus(
  terminalClassification: TerminalClassification | undefined,
  status: SessionLifecycleStatus,
): DurableSessionStatus | undefined {
  if (terminalClassification === 'completed_unproven' || status === 'completed_unproven') return 'completed_unproven';
  if (terminalClassification === "success" || status === "completed") {
    return "success";
  }

  if (terminalClassification === "stopped") {
    return "stopped";
  }

  if (terminalClassification === "error" || status === "error") {
    return "error";
  }

  return undefined;
}
