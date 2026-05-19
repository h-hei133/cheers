export type ToolCapabilityArea =
  | "command"
  | "mcp"
  | "browser"
  | "edit"
  | "provider"
  | "session"
  | "tool";

export type ToolAvailabilityState =
  | "available"
  | "unavailable"
  | "disabled"
  | "not-configured"
  | "not-installed"
  | "not-ready";

export type ToolPolicyState =
  | "allowed"
  | "blocked"
  | "requires-approval"
  | "approval-denied"
  | "not-applicable";

export type ToolExecutionState =
  | "not-run"
  | "running"
  | "succeeded"
  | "failed"
  | "timed-out"
  | "cancelled"
  | "invalid-result";

export type ToolResultState = "completed" | "stopped" | "failed";

export type ToolRedactionState = "clean" | "redacted" | "failed";

export interface ToolPolicyResultReceipt {
  readonly capability: ToolCapabilityArea;
  readonly label: string;
  readonly availability: ToolAvailabilityState;
  readonly policy: ToolPolicyState;
  readonly execution: ToolExecutionState;
  readonly result: ToolResultState;
  readonly reasonCode: string;
  readonly reason: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
  readonly redaction: ToolRedactionState;
}

export interface ToolPolicyResultInput {
  readonly capability: ToolCapabilityArea;
  readonly label?: string;
  readonly reasonCode?: string;
  readonly reason?: string;
  readonly doNext?: string;
  readonly evidence?: readonly string[];
  readonly redaction?: ToolRedactionState;
}

export function buildPolicyBlockedResult(
  input: ToolPolicyResultInput,
): ToolPolicyResultReceipt {
  return receipt(input, {
    availability: "available",
    policy: "blocked",
    execution: "not-run",
    result: "stopped",
    defaultReasonCode: "policy-blocked",
    defaultReason: "Tool execution was blocked by policy.",
    defaultDoNext: "Adjust the request to satisfy the active policy, then retry.",
  });
}

export function buildUnavailableResult(
  input: ToolPolicyResultInput & {
    readonly availability?: Exclude<ToolAvailabilityState, "available">;
  },
): ToolPolicyResultReceipt {
  return receipt(input, {
    availability: input.availability ?? "unavailable",
    policy: "not-applicable",
    execution: "not-run",
    result: "stopped",
    defaultReasonCode: "tool-unavailable",
    defaultReason: "Tool is unavailable.",
    defaultDoNext: "Check tool availability and retry with a visible tool.",
  });
}

export function buildApprovalDeniedResult(
  input: ToolPolicyResultInput,
): ToolPolicyResultReceipt {
  return receipt(input, {
    availability: "available",
    policy: "approval-denied",
    execution: "not-run",
    result: "stopped",
    defaultReasonCode: "approval-denied",
    defaultReason: "Tool approval was denied.",
    defaultDoNext: "Re-run and approve the requested tool if it is still needed.",
  });
}

export function buildExecutionFailedResult(
  input: ToolPolicyResultInput & {
    readonly execution?: Extract<
      ToolExecutionState,
      "failed" | "timed-out" | "cancelled" | "invalid-result"
    >;
    readonly result?: ToolResultState;
  },
): ToolPolicyResultReceipt {
  return receipt(input, {
    availability: "available",
    policy: "allowed",
    execution: input.execution ?? "failed",
    result: input.result ?? "failed",
    defaultReasonCode: "tool-execution-failed",
    defaultReason: "Tool execution failed.",
    defaultDoNext: "Inspect the tool result, then retry with a narrower request.",
  });
}

export function buildCompletedToolResult(
  input: ToolPolicyResultInput,
): ToolPolicyResultReceipt {
  return receipt(input, {
    availability: "available",
    policy: "allowed",
    execution: "succeeded",
    result: "completed",
    defaultReasonCode: "tool-succeeded",
    defaultReason: "Tool execution completed.",
    defaultDoNext: "Continue with the tool result.",
  });
}

export function terminalSafeCapabilityLabel(
  capability: ToolCapabilityArea,
): string {
  switch (capability) {
    case "command":
      return "command";
    case "mcp":
      return "MCP tool";
    case "browser":
      return "browser tool";
    case "edit":
      return "edit capability";
    case "provider":
      return "provider readiness";
    case "session":
      return "session replay";
    case "tool":
      return "tool";
  }
}

function receipt(
  input: ToolPolicyResultInput,
  defaults: {
    readonly availability: ToolAvailabilityState;
    readonly policy: ToolPolicyState;
    readonly execution: ToolExecutionState;
    readonly result: ToolResultState;
    readonly defaultReasonCode: string;
    readonly defaultReason: string;
    readonly defaultDoNext: string;
  },
): ToolPolicyResultReceipt {
  return {
    capability: input.capability,
    label: input.label ?? terminalSafeCapabilityLabel(input.capability),
    availability: defaults.availability,
    policy: defaults.policy,
    execution: defaults.execution,
    result: defaults.result,
    reasonCode: normalizeCode(input.reasonCode ?? defaults.defaultReasonCode),
    reason: normalizeText(input.reason ?? defaults.defaultReason),
    doNext: normalizeText(input.doNext ?? defaults.defaultDoNext),
    evidence: normalizeEvidence(input.evidence ?? []),
    redaction: input.redaction ?? "clean",
  };
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").slice(0, 120);
}

function normalizeText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 400) : "not supplied";
}

function normalizeEvidence(values: readonly string[]): readonly string[] {
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0)
    .slice(0, 20);
}
