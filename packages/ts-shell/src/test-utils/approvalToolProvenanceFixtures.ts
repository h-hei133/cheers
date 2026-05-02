import type {
  CodingVerificationBlockerKind,
  CodingVerificationStatus,
} from "../orchestration/types.js";

export type ApprovalDecisionProvenanceKind =
  | "approved"
  | "denied"
  | "skipped"
  | "not-required"
  | "escalation-denied";

export type ApprovalDecisionProvenanceSource =
  | "interactive-user"
  | "non-interactive-policy"
  | "cached-policy"
  | "sandbox-enforcer"
  | "compensated-lifecycle"
  | "not-required";

export interface ApprovalDecisionProvenanceFixture {
  readonly kind: ApprovalDecisionProvenanceKind;
  readonly source: ApprovalDecisionProvenanceSource;
  readonly toolName: string;
  readonly taskId: string;
  readonly wasEscalated?: boolean;
  readonly compensated?: boolean;
}

export type ToolExecutionProvenanceKind =
  | "executed-succeeded"
  | "executed-failed"
  | "permission-blocked"
  | "approval-denied"
  | "sandbox-preflight-blocked"
  | "unavailable-tool";

export type ToolExecutionProvenanceSource =
  | "tool-runtime"
  | "approval-flow"
  | "allowlist"
  | "mcp-registry"
  | "sandbox-enforcer"
  | "compensated-lifecycle";

export interface ToolExecutionProvenanceFixture {
  readonly kind: ToolExecutionProvenanceKind;
  readonly source: ToolExecutionProvenanceSource;
  readonly toolName: string;
  readonly taskId: string;
  readonly success: boolean;
  readonly failureBoundary?: string;
  readonly compensated?: boolean;
}

export interface LegacyCodingResultCompatibilityFixture {
  readonly evidence: readonly string[];
  readonly verification?: {
    readonly status: CodingVerificationStatus;
    readonly blockerKind?: CodingVerificationBlockerKind;
    readonly reason?: string;
  };
  readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
}

export interface ApprovalToolProvenanceContractFixture {
  readonly approval?: ApprovalDecisionProvenanceFixture;
  readonly toolExecution: ToolExecutionProvenanceFixture;
  readonly legacy: LegacyCodingResultCompatibilityFixture;
}

export function approvalDeniedProvenanceFixture(
  overrides: Partial<ApprovalToolProvenanceContractFixture> = {},
): ApprovalToolProvenanceContractFixture {
  return {
    approval: {
      kind: "denied",
      source: "interactive-user",
      toolName: "bash",
      taskId: "task_approval_denied",
      wasEscalated: true,
    },
    toolExecution: {
      kind: "approval-denied",
      source: "approval-flow",
      toolName: "bash",
      taskId: "task_approval_denied",
      success: false,
      failureBoundary: "approval-denied",
    },
    legacy: {
      evidence: ["verify-blocker-kind:approval-denied"],
      verification: {
        status: "blocked",
        blockerKind: "approval-denied",
        reason: "approval denied",
      },
      failedFiles: [],
    },
    ...overrides,
  };
}

export function approvedExecutionFailedProvenanceFixture(
  overrides: Partial<ApprovalToolProvenanceContractFixture> = {},
): ApprovalToolProvenanceContractFixture {
  return {
    approval: {
      kind: "approved",
      source: "interactive-user",
      toolName: "bash",
      taskId: "task_execution_failed",
      wasEscalated: false,
    },
    toolExecution: {
      kind: "executed-failed",
      source: "tool-runtime",
      toolName: "bash",
      taskId: "task_execution_failed",
      success: false,
      failureBoundary: "tool-execution-failed",
    },
    legacy: {
      evidence: ["current-permission-request-tool:bash"],
      verification: {
        status: "failed",
        reason: "bash execution failed after approval",
      },
      failedFiles: [
        {
          path: "(command)",
          reason: "npm run build failed with exit code 1",
        },
      ],
    },
    ...overrides,
  };
}

export function unavailableToolProvenanceFixture(
  overrides: Partial<ApprovalToolProvenanceContractFixture> = {},
): ApprovalToolProvenanceContractFixture {
  return {
    toolExecution: {
      kind: "unavailable-tool",
      source: "mcp-registry",
      toolName: "mcp__missing__tool",
      taskId: "task_unavailable_tool",
      success: false,
      failureBoundary: "unavailable-tool",
    },
    legacy: {
      evidence: ["actionable-blocker-kind:command-not-allowlisted"],
      verification: {
        status: "blocked",
        blockerKind: "unknown",
        reason: "tool is not registered",
      },
      failedFiles: [
        {
          path: "(tool)",
          reason: "MCP tool is not registered",
        },
      ],
    },
    ...overrides,
  };
}
