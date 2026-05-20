import type {
  ToolAvailabilityState,
  ToolExecutionState,
  ToolPolicyState,
  ToolRedactionState,
  ToolResultState,
} from "../tools/toolPolicyResult.js";

export type RuntimeKind =
  | "local-command"
  | "sandbox"
  | "daemon"
  | "browser"
  | "mcp-process"
  | "unknown";

export type RuntimeCleanupState =
  | "not-started"
  | "not-needed"
  | "succeeded"
  | "failed"
  | "unknown";

export interface RuntimeReceipt {
  readonly receiptId: string;
  readonly runtimeKind: RuntimeKind;
  readonly availability: ToolAvailabilityState;
  readonly policy: ToolPolicyState;
  readonly execution: ToolExecutionState;
  readonly result: ToolResultState;
  readonly reasonCode: string;
  readonly reason: string;
  readonly doNext: string;
  readonly targetSummary?: string;
  readonly commandSummary?: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly durationMs?: number;
  readonly timeoutMs?: number;
  readonly cleanup: RuntimeCleanupState;
  readonly redaction: ToolRedactionState;
  readonly evidence: readonly string[];
  readonly stdoutSummary?: string;
  readonly stderrSummary?: string;
  readonly transcriptSafeSummary: string;
}

export interface RuntimeReceiptInput {
  readonly receiptId?: string;
  readonly runtimeKind: RuntimeKind;
  readonly availability?: ToolAvailabilityState;
  readonly policy?: ToolPolicyState;
  readonly execution: ToolExecutionState;
  readonly result: ToolResultState;
  readonly reasonCode: string;
  readonly reason: string;
  readonly doNext: string;
  readonly targetSummary?: string;
  readonly commandSummary?: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly durationMs?: number;
  readonly timeoutMs?: number;
  readonly cleanup?: RuntimeCleanupState;
  readonly redaction?: ToolRedactionState;
  readonly evidence?: readonly string[];
  readonly stdoutSummary?: string;
  readonly stderrSummary?: string;
}

export type CommandRuntimeStatus = "completed" | "failed" | "timeout" | "cancelled";

export interface CommandRuntimeReceiptInput {
  readonly runtimeKind?: Extract<RuntimeKind, "local-command" | "daemon">;
  readonly command: string;
  readonly status: CommandRuntimeStatus;
  readonly executionPath: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly durationMs?: number;
  readonly timeoutMs?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly reason?: string;
  readonly evidence?: readonly string[];
}

export interface SandboxPolicyRuntimeReceiptInput {
  readonly toolName: string;
  readonly operation: string;
  readonly target: string;
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiresEscalation: boolean;
  readonly policyRule?: string;
  readonly wasEscalated?: boolean;
}

export interface BrowserRuntimeReceiptInput {
  readonly status: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly cleanup?: RuntimeCleanupState;
  readonly evidence?: readonly string[];
  readonly warnings?: readonly string[];
  readonly targetSummary?: string;
}

export interface McpRuntimeFailureReceiptInput {
  readonly serverName: string;
  readonly toolName?: string;
  readonly failureClass: string;
  readonly failurePlane: string;
  readonly safeDetail: string;
  readonly doNext: string;
  readonly protocolFailure?: boolean;
}

export function createRuntimeReceipt(input: RuntimeReceiptInput): RuntimeReceipt {
  const receiptId = input.receiptId ?? deterministicRuntimeReceiptId(input);
  const evidence = normalizeEvidence(input.evidence ?? []);
  const reason = normalizeText(input.reason);
  const doNext = normalizeText(input.doNext);
  const commandSummary = optionalText(input.commandSummary, 180);
  const targetSummary = optionalText(input.targetSummary, 180);
  const stdoutSummary = optionalText(input.stdoutSummary, 240);
  const stderrSummary = optionalText(input.stderrSummary, 240);
  const transcriptSafeSummary = normalizeText(
    [
      `${input.runtimeKind}:${input.result}:${normalizeCode(input.reasonCode)}`,
      commandSummary ? `command=${commandSummary}` : undefined,
      targetSummary ? `target=${targetSummary}` : undefined,
      `evidence=${evidence.length}`,
    ]
      .filter(Boolean)
      .join("; "),
    300,
  );

  return {
    receiptId,
    runtimeKind: input.runtimeKind,
    availability: input.availability ?? "available",
    policy: input.policy ?? "allowed",
    execution: input.execution,
    result: input.result,
    reasonCode: normalizeCode(input.reasonCode),
    reason,
    doNext,
    targetSummary,
    commandSummary,
    exitCode: input.exitCode,
    signal: input.signal,
    durationMs: finiteNumber(input.durationMs),
    timeoutMs: finiteNumber(input.timeoutMs),
    cleanup: input.cleanup ?? "unknown",
    redaction: input.redaction ?? "clean",
    evidence,
    stdoutSummary,
    stderrSummary,
    transcriptSafeSummary,
  };
}

export function createCommandRuntimeReceipt(input: CommandRuntimeReceiptInput): RuntimeReceipt {
  const execution = commandExecutionState(input.status);
  const result = commandResultState(input.status);
  const reasonCode = commandReasonCode(input.status);
  const failed = input.status !== "completed";
  return createRuntimeReceipt({
    runtimeKind: input.runtimeKind ?? "local-command",
    execution,
    result,
    reasonCode,
    reason: input.reason ?? (failed ? "Command execution did not complete successfully." : "Command execution completed."),
    doNext: failed ? "Inspect the command output and retry with a narrower command if needed." : "Continue with the command result.",
    commandSummary: input.command,
    exitCode: input.exitCode,
    signal: input.signal,
    durationMs: input.durationMs,
    timeoutMs: input.timeoutMs,
    cleanup: "not-needed",
    evidence: [
      `runtime-receipt:command:${input.executionPath}`,
      `runtime-receipt:command-status:${input.status}`,
      ...(input.evidence ?? []),
    ],
    stdoutSummary: input.stdout,
    stderrSummary: input.stderr,
  });
}

export function createSandboxPolicyRuntimeReceipt(input: SandboxPolicyRuntimeReceiptInput): RuntimeReceipt {
  return createRuntimeReceipt({
    runtimeKind: "sandbox",
    availability: "available",
    policy: input.allowed
      ? "allowed"
      : input.wasEscalated
        ? "approval-denied"
        : input.requiresEscalation
          ? "requires-approval"
          : "blocked",
    execution: "not-run",
    result: input.allowed ? "completed" : "stopped",
    reasonCode: input.allowed
      ? "sandbox-policy-allowed"
      : input.requiresEscalation
        ? "sandbox-escalation-required"
        : "sandbox-policy-blocked",
    reason: input.reason,
    doNext: input.allowed
      ? "Continue with the approved runtime operation."
      : "Review the sandbox policy decision and approve only if the target is intended.",
    targetSummary: `${input.operation} ${input.target}`,
    cleanup: "not-started",
    evidence: [
      "runtime-receipt:sandbox-policy",
      input.policyRule ? `runtime-receipt:policy-rule:${input.policyRule}` : undefined,
      input.requiresEscalation ? "runtime-receipt:requires-escalation" : undefined,
      `runtime-receipt:tool:${input.toolName}`,
    ].filter((value): value is string => !!value),
  });
}

export function createBrowserRuntimeStatusReceipt(input: BrowserRuntimeReceiptInput): RuntimeReceipt {
  const available = input.status === "ready";
  return createRuntimeReceipt({
    runtimeKind: "browser",
    availability: available ? "available" : browserAvailability(input.status),
    policy: "not-applicable",
    execution: available ? "not-run" : "not-run",
    result: available ? "completed" : "stopped",
    reasonCode: input.reasonCode,
    reason: input.reason,
    doNext: input.nextAction,
    targetSummary: input.targetSummary,
    cleanup: input.cleanup ?? "not-started",
    evidence: [
      "runtime-receipt:browser-runtime-status",
      `runtime-receipt:browser-status:${input.status}`,
      ...(input.evidence ?? []),
      ...(input.warnings ?? []).map((warning) => `runtime-receipt:browser-warning:${warning}`),
    ],
  });
}

export function createMcpRuntimeFailureReceipt(input: McpRuntimeFailureReceiptInput): RuntimeReceipt {
  return createRuntimeReceipt({
    runtimeKind: "mcp-process",
    availability: input.failurePlane === "server-availability" ? "unavailable" : "available",
    policy: input.failurePlane === "permission" ? "blocked" : "allowed",
    execution: input.protocolFailure ? "invalid-result" : "failed",
    result: "failed",
    reasonCode: input.protocolFailure ? "mcp-protocol-failed" : "mcp-execution-failed",
    reason: input.safeDetail,
    doNext: input.doNext,
    targetSummary: input.toolName ? `${input.serverName}/${input.toolName}` : input.serverName,
    cleanup: "unknown",
    evidence: [
      "runtime-receipt:mcp-runtime-failure",
      `runtime-receipt:mcp-failure-class:${input.failureClass}`,
      `runtime-receipt:mcp-failure-plane:${input.failurePlane}`,
    ],
  });
}

function commandExecutionState(status: CommandRuntimeStatus): ToolExecutionState {
  switch (status) {
    case "completed":
      return "succeeded";
    case "timeout":
      return "timed-out";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

function commandResultState(status: CommandRuntimeStatus): ToolResultState {
  return status === "completed" ? "completed" : "failed";
}

function commandReasonCode(status: CommandRuntimeStatus): string {
  switch (status) {
    case "completed":
      return "command-succeeded";
    case "timeout":
      return "command-timed-out";
    case "cancelled":
      return "command-cancelled";
    case "failed":
      return "command-failed";
  }
}

function browserAvailability(status: string): ToolAvailabilityState {
  if (status === "disabled") {
    return "disabled";
  }
  if (status === "package-missing" || status === "binary-missing") {
    return "not-installed";
  }
  return "not-ready";
}

function deterministicRuntimeReceiptId(input: RuntimeReceiptInput): string {
  const seed = `${input.runtimeKind}:${input.result}:${input.reasonCode}:${input.commandSummary ?? input.targetSummary ?? ""}`;
  return `runtime-receipt:${normalizeCode(seed).slice(0, 160) || "receipt"}`;
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160);
}

function normalizeText(value: string, maxLength = 400): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : "not supplied";
}

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeText(value, maxLength);
  return normalized === "not supplied" ? undefined : normalized;
}

function normalizeEvidence(values: readonly string[]): readonly string[] {
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0)
    .slice(0, 24);
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
