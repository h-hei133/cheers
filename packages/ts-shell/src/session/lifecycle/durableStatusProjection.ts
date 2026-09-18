import type { TerminalClassification } from "../../result/types.js";

export type SessionLifecycleStatus =
  | "active"
  | "interrupted"
  | "completed"
  | "error"
  | "terminated";

export type DurableSessionStatus = "success" | "stopped" | "error";

export function projectDurableStatus(
  terminalClassification: TerminalClassification | undefined,
  status: SessionLifecycleStatus,
): DurableSessionStatus | undefined {
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
