export type ToolExecutionProvenanceKind =
  | "executed-succeeded"
  | "executed-failed"
  | "permission-blocked"
  | "approval-denied"
  | "sandbox-preflight-blocked"
  | "unavailable-tool";

export type ToolExecutionProvenanceSource =
  | "tool-result-metadata"
  | "tool-runtime"
  | "approval-flow"
  | "allowlist"
  | "mcp-registry"
  | "sandbox-enforcer";

export interface ToolExecutionProvenance {
  readonly kind: ToolExecutionProvenanceKind;
  readonly source: ToolExecutionProvenanceSource;
  readonly legacySuccess: boolean;
  readonly failureBoundary?: string;
}

export interface ToolExecutionProvenanceInput {
  readonly success: boolean;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export function deriveToolExecutionProvenance(
  input: ToolExecutionProvenanceInput,
): ToolExecutionProvenance {
  const explicitKind = normalizeToolExecutionKind(
    input.metadata?.toolExecutionKind,
  );
  if (explicitKind) {
    return {
      kind: explicitKind,
      source: "tool-result-metadata",
      legacySuccess: toLegacyToolSuccess(explicitKind),
      failureBoundary: failureBoundaryForKind(explicitKind),
    };
  }

  if (input.success) {
    return {
      kind: "executed-succeeded",
      source: "tool-runtime",
      legacySuccess: true,
    };
  }

  if (input.metadata?.wasEscalated === true) {
    return {
      kind: "approval-denied",
      source: "approval-flow",
      legacySuccess: false,
      failureBoundary: "approval-denied",
    };
  }

  const failureKind = readLowerString(input.metadata?.failureKind);
  if (failureKind === "sandbox_preflight") {
    return {
      kind: "sandbox-preflight-blocked",
      source: "sandbox-enforcer",
      legacySuccess: false,
      failureBoundary: "sandbox-preflight-blocked",
    };
  }

  const error = input.error?.toLowerCase() ?? "";
  const reason = readLowerString(input.metadata?.reason) ?? "";
  const executionPath = readLowerString(input.metadata?.executionPath) ?? "";
  const mcpFailureClass = readLowerString(input.metadata?.mcpFailureClass);
  if (executionPath.startsWith("mcp") && isMcpUnavailableReason(error, reason)) {
    return {
      kind: "unavailable-tool",
      source: "mcp-registry",
      legacySuccess: false,
      failureBoundary: "unavailable-tool",
    };
  }

  if (executionPath.startsWith("mcp") && mcpFailureClass) {
    if (
      mcpFailureClass === "config" ||
      mcpFailureClass === "permission-denied" ||
      mcpFailureClass === "tool-unavailable"
    ) {
      return {
        kind: "unavailable-tool",
        source: "mcp-registry",
        legacySuccess: false,
        failureBoundary: "unavailable-tool",
      };
    }
    return {
      kind: "executed-failed",
      source: "tool-result-metadata",
      legacySuccess: false,
      failureBoundary: "tool-execution-failed",
    };
  }

  if (error.includes("not registered") || reason.includes("not registered")) {
    return {
      kind: "unavailable-tool",
      source: "mcp-registry",
      legacySuccess: false,
      failureBoundary: "unavailable-tool",
    };
  }

  if (
    error.includes("not in the mvp allowlist") ||
    error.includes("not allowed in the mvp allowlist")
  ) {
    return {
      kind: "permission-blocked",
      source: "allowlist",
      legacySuccess: false,
      failureBoundary: "permission-blocked",
    };
  }

  return {
    kind: "executed-failed",
    source: "tool-runtime",
    legacySuccess: false,
    failureBoundary: failureKind ? "tool-execution-failed" : undefined,
  };
}

export function toLegacyToolSuccess(kind: ToolExecutionProvenanceKind): boolean {
  return kind === "executed-succeeded";
}

function normalizeToolExecutionKind(
  value: unknown,
): ToolExecutionProvenanceKind | undefined {
  return value === "executed-succeeded" ||
    value === "executed-failed" ||
    value === "permission-blocked" ||
    value === "approval-denied" ||
    value === "sandbox-preflight-blocked" ||
    value === "unavailable-tool"
    ? value
    : undefined;
}

function failureBoundaryForKind(
  kind: ToolExecutionProvenanceKind,
): string | undefined {
  return kind === "executed-succeeded" ? undefined : kind;
}

function readLowerString(value: unknown): string | undefined {
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function isMcpUnavailableReason(error: string, reason: string): boolean {
  const combined = `${error} ${reason}`;
  return (
    combined.includes("mcp config is invalid") ||
    combined.includes("mcp server ") ||
    combined.includes("unknown mcp server") ||
    combined.includes("mcp tool ") && (
      combined.includes("not registered") ||
      combined.includes("unavailable")
    )
  );
}
