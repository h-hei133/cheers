import type { ToolExecutionResult } from "../../tools/types.js";
import {
  buildApprovalDeniedResult,
  buildCompletedToolResult,
  buildExecutionFailedResult,
  buildPolicyBlockedResult,
  buildUnavailableResult,
} from "./toolPolicyResult.js";
import {
  deriveToolExecutionProvenance,
  type ToolExecutionProvenance,
} from "./toolExecutionProvenance.js";

export type ToolLifecycleProjectionKind =
  | "success"
  | "approval-denied"
  | "tool-unavailable"
  | "mcp-unavailable"
  | "mcp-tool-is-error"
  | "mcp-protocol-failed"
  | "mcp-process-failed"
  | "mcp-execution-failed"
  | "tool-execution-failed"
  | "permission-blocked"
  | "environment-blocked";

export type ToolLifecycleVerificationBlockerKind =
  | "approval-denied"
  | "environment-not-ready";

export interface ToolLifecycleProjection {
  readonly kind: ToolLifecycleProjectionKind;
  readonly legacySuccess: boolean;
  readonly reason?: string;
  readonly failureBoundary?: string;
  readonly executionPath?: string;
  readonly serverName?: string;
  readonly toolName?: string;
  readonly verificationBlockerKind?: ToolLifecycleVerificationBlockerKind;
  readonly nextAction?: string;
  readonly mcpFailureClass?: string;
  readonly mcpFailurePlane?: string;
}

export interface ToolLifecycleProjectionInput extends ToolExecutionResult {
  readonly toolName: string;
  readonly requireApprovalEvent?: boolean;
}

export function projectToolLifecycle(
  input: ToolLifecycleProjectionInput,
): ToolLifecycleProjection {
  const provenance = deriveToolExecutionProvenance(input);
  const metadata = input.metadata;
  const executionPath = readString(metadata?.executionPath);
  const projectedToolName = readString(metadata?.toolName) ?? input.toolName;
  const serverName = readString(metadata?.serverName);
  const mcpFailureClass = readString(metadata?.mcpFailureClass);
  const mcpFailurePlane = readString(metadata?.mcpFailurePlane);
  const reason = firstText(
    input.error,
    readString(metadata?.reason),
    input.output,
  );
  const base = {
    legacySuccess: provenance.legacySuccess,
    ...(reason ? { reason } : {}),
    ...(executionPath ? { executionPath } : {}),
    ...(serverName ? { serverName } : {}),
    ...(projectedToolName ? { toolName: projectedToolName } : {}),
    ...(mcpFailureClass ? { mcpFailureClass } : {}),
    ...(mcpFailurePlane ? { mcpFailurePlane } : {}),
  };

  if (provenance.kind === "executed-succeeded") {
    const receipt = buildCompletedToolResult({
      capability: isMcpExecutionPath(executionPath) ? "mcp" : "tool",
      label: projectedToolName,
      reasonCode: "tool-succeeded",
      reason: "Tool execution completed.",
    });
    return {
      kind: "success",
      legacySuccess: true,
      ...(executionPath ? { executionPath } : {}),
      ...(serverName ? { serverName } : {}),
      toolName: receipt.label,
    };
  }

  if (provenance.kind === "approval-denied") {
    const receipt = buildApprovalDeniedResult({
      capability: input.toolName === "bash" ? "command" : "tool",
      label: projectedToolName,
      reason,
      doNext: "Re-run and approve escalation for verify command execution.",
    });
    return {
      kind: "approval-denied",
      ...base,
      failureBoundary: "approval-denied",
      verificationBlockerKind: "approval-denied",
      nextAction: receipt.doNext,
    };
  }

  if (provenance.kind === "sandbox-preflight-blocked") {
    const receipt = buildPolicyBlockedResult({
      capability: "command",
      label: projectedToolName,
      reasonCode: "sandbox-preflight-blocked",
      reason,
      doNext:
        "Resolve environment/network readiness (dependencies, connectivity, shell), then rerun verify.",
    });
    return {
      kind: "environment-blocked",
      ...base,
      failureBoundary: "sandbox-preflight-blocked",
      verificationBlockerKind: "environment-not-ready",
      nextAction: receipt.doNext,
    };
  }

  if (provenance.kind === "permission-blocked") {
    const receipt = buildPolicyBlockedResult({
      capability: "tool",
      label: projectedToolName,
      reasonCode: "permission-blocked",
      reason,
    });
    return {
      kind: "permission-blocked",
      ...base,
      failureBoundary: receipt.reasonCode,
    };
  }

  if (provenance.kind === "unavailable-tool") {
    const kind = isMcpExecutionPath(executionPath)
      ? "mcp-unavailable"
      : "tool-unavailable";
    const receipt = buildUnavailableResult({
      capability: isMcpExecutionPath(executionPath) ? "mcp" : "tool",
      label: projectedToolName,
      availability: isMcpExecutionPath(executionPath)
        ? "not-configured"
        : "unavailable",
      reasonCode: kind,
      reason,
      doNext: isMcpExecutionPath(executionPath)
        ? "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool."
        : undefined,
    });
    return {
      kind,
      ...base,
      failureBoundary: kind,
      verificationBlockerKind: isMcpExecutionPath(executionPath)
        ? "environment-not-ready"
        : undefined,
      nextAction: isMcpExecutionPath(executionPath) ? receipt.doNext : undefined,
    };
  }

  if (isMcpExecutionPath(executionPath)) {
    if (mcpFailureClass === "tool-is-error") {
      const receipt = buildExecutionFailedResult({
        capability: "mcp",
        label: projectedToolName,
        reasonCode: "mcp-tool-is-error",
        reason,
      });
      return {
        kind: "mcp-tool-is-error",
        ...base,
        failureBoundary: receipt.reasonCode,
      };
    }
    if (mcpFailureClass === "protocol" || mcpFailureClass === "malformed-result") {
      const receipt = buildExecutionFailedResult({
        capability: "mcp",
        label: projectedToolName,
        reasonCode: "mcp-protocol-failed",
        reason,
        execution: "invalid-result",
      });
      return {
        kind: "mcp-protocol-failed",
        ...base,
        failureBoundary: receipt.reasonCode,
      };
    }
    if (
      mcpFailureClass === "stdio-process" ||
      mcpFailureClass === "server-unavailable"
    ) {
      const receipt = buildExecutionFailedResult({
        capability: "mcp",
        label: projectedToolName,
        reasonCode: "mcp-process-failed",
        reason,
      });
      return {
        kind: "mcp-process-failed",
        ...base,
        failureBoundary: receipt.reasonCode,
      };
    }
    const receipt = buildExecutionFailedResult({
      capability: "mcp",
      label: projectedToolName,
      reasonCode: "mcp-execution-failed",
      reason,
    });
    return {
      kind: "mcp-execution-failed",
      ...base,
      failureBoundary: receipt.reasonCode,
    };
  }

  const receipt = buildExecutionFailedResult({
    capability: input.toolName === "bash" ? "command" : "tool",
    label: projectedToolName,
    reason,
    reasonCode: "tool-execution-failed",
  });
  return {
    kind: "tool-execution-failed",
    ...base,
    failureBoundary: normalizeFailureBoundary(provenance) ?? receipt.reasonCode,
  };
}

function normalizeFailureBoundary(
  provenance: ToolExecutionProvenance,
): string | undefined {
  return provenance.failureBoundary === "tool-execution-failed"
    ? "tool-execution-failed"
    : provenance.failureBoundary;
}

function isMcpExecutionPath(value: string | undefined): boolean {
  return value?.toLowerCase().startsWith("mcp") ?? false;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function firstText(
  ...values: ReadonlyArray<string | undefined>
): string | undefined {
  return values.find((value): value is string => Boolean(value?.trim()));
}
