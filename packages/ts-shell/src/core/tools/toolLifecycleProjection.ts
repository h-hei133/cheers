import type { ToolExecutionResult } from "../../tools/types.js";
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
    return {
      kind: "success",
      legacySuccess: true,
      ...(executionPath ? { executionPath } : {}),
      ...(serverName ? { serverName } : {}),
      ...(projectedToolName ? { toolName: projectedToolName } : {}),
    };
  }

  if (provenance.kind === "approval-denied") {
    return {
      kind: "approval-denied",
      ...base,
      failureBoundary: "approval-denied",
      verificationBlockerKind: "approval-denied",
      nextAction: "Re-run and approve escalation for verify command execution.",
    };
  }

  if (provenance.kind === "sandbox-preflight-blocked") {
    return {
      kind: "environment-blocked",
      ...base,
      failureBoundary: "sandbox-preflight-blocked",
      verificationBlockerKind: "environment-not-ready",
      nextAction:
        "Resolve environment/network readiness (dependencies, connectivity, shell), then rerun verify.",
    };
  }

  if (provenance.kind === "permission-blocked") {
    return {
      kind: "permission-blocked",
      ...base,
      failureBoundary: "permission-blocked",
    };
  }

  if (provenance.kind === "unavailable-tool") {
    const kind = isMcpExecutionPath(executionPath)
      ? "mcp-unavailable"
      : "tool-unavailable";
    return {
      kind,
      ...base,
      failureBoundary: kind,
      verificationBlockerKind: isMcpExecutionPath(executionPath)
        ? "environment-not-ready"
        : undefined,
      nextAction: isMcpExecutionPath(executionPath)
        ? "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool."
        : undefined,
    };
  }

  if (isMcpExecutionPath(executionPath)) {
    if (mcpFailureClass === "tool-is-error") {
      return {
        kind: "mcp-tool-is-error",
        ...base,
        failureBoundary: "mcp-tool-is-error",
      };
    }
    if (mcpFailureClass === "protocol" || mcpFailureClass === "malformed-result") {
      return {
        kind: "mcp-protocol-failed",
        ...base,
        failureBoundary: "mcp-protocol-failed",
      };
    }
    if (
      mcpFailureClass === "stdio-process" ||
      mcpFailureClass === "server-unavailable"
    ) {
      return {
        kind: "mcp-process-failed",
        ...base,
        failureBoundary: "mcp-process-failed",
      };
    }
    return {
      kind: "mcp-execution-failed",
      ...base,
      failureBoundary: "mcp-execution-failed",
    };
  }

  return {
    kind: "tool-execution-failed",
    ...base,
    failureBoundary: normalizeFailureBoundary(provenance),
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
