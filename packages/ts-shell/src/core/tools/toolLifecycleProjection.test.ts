import { describe, expect, it } from "vitest";
import { projectToolLifecycle } from "./toolLifecycleProjection.js";

describe("tool lifecycle projection", () => {
  it("projects successful execution without failure state", () => {
    expect(
      projectToolLifecycle({
        toolName: "read",
        success: true,
        output: "file content",
      }),
    ).toEqual({
      kind: "success",
      legacySuccess: true,
      toolName: "read",
    });
  });

  it("keeps approval denial separate from execution failure", () => {
    expect(
      projectToolLifecycle({
        toolName: "bash",
        success: false,
        error: "Approval denied by user for bash",
        metadata: { wasEscalated: true },
        requireApprovalEvent: true,
      }),
    ).toEqual({
      kind: "approval-denied",
      legacySuccess: false,
      reason: "Approval denied by user for bash",
      failureBoundary: "approval-denied",
      toolName: "bash",
      verificationBlockerKind: "approval-denied",
      nextAction: "Re-run and approve escalation for verify command execution.",
    });
  });

  it("projects unavailable non-MCP tools separately", () => {
    expect(
      projectToolLifecycle({
        toolName: "missing-tool",
        success: false,
        error: "Tool 'missing-tool' is not registered",
      }),
    ).toEqual({
      kind: "tool-unavailable",
      legacySuccess: false,
      reason: "Tool 'missing-tool' is not registered",
      failureBoundary: "tool-unavailable",
      toolName: "missing-tool",
    });
  });

  it("projects MCP unavailable and stale invocation as MCP unavailable", () => {
    expect(
      projectToolLifecycle({
        toolName: "mcp__localSdk__search",
        success: false,
        error: "MCP server localSdk requires authentication",
        metadata: {
          executionPath: "mcp-stdio",
          serverName: "localSdk",
          toolName: "search",
          blockerKind: "environment-not-ready",
          reason: "MCP server localSdk requires authentication",
        },
      }),
    ).toEqual({
      kind: "mcp-unavailable",
      legacySuccess: false,
      reason: "MCP server localSdk requires authentication",
      failureBoundary: "mcp-unavailable",
      executionPath: "mcp-stdio",
      serverName: "localSdk",
      toolName: "search",
      verificationBlockerKind: "environment-not-ready",
      nextAction:
        "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool.",
    });
  });

  it("projects MCP isError as MCP execution failure", () => {
    expect(
      projectToolLifecycle({
        toolName: "mcp__stdioEcho__echo_message",
        success: false,
        error: "MCP tool rejected request: invalid message",
        metadata: {
          executionPath: "mcp-stdio",
          serverName: "stdioEcho",
          toolName: "echo_message",
          status: "failed",
          failureKind: "execution_failure",
          reason: "MCP tool rejected request: invalid message",
        },
      }),
    ).toEqual({
      kind: "mcp-execution-failed",
      legacySuccess: false,
      reason: "MCP tool rejected request: invalid message",
      failureBoundary: "mcp-execution-failed",
      executionPath: "mcp-stdio",
      serverName: "stdioEcho",
      toolName: "echo_message",
    });
  });

  it("projects MCP stdio throw as MCP execution failure", () => {
    expect(
      projectToolLifecycle({
        toolName: "mcp__stdioEcho__echo_message",
        success: false,
        error: "MCP stdio execution failed",
        metadata: {
          executionPath: "mcp-stdio",
          serverName: "stdioEcho",
          toolName: "echo_message",
          status: "failed",
          failureKind: "execution_failure",
          reason: "MCP stdio execution failed",
        },
      }),
    ).toMatchObject({
      kind: "mcp-execution-failed",
      legacySuccess: false,
      reason: "MCP stdio execution failed",
      failureBoundary: "mcp-execution-failed",
      executionPath: "mcp-stdio",
      serverName: "stdioEcho",
      toolName: "echo_message",
    });
  });

  it("projects generic execution failure without MCP or approval semantics", () => {
    expect(
      projectToolLifecycle({
        toolName: "bash",
        success: false,
        error: "command failed",
        metadata: {
          executionPath: "ts-local",
          failureKind: "execution_failure",
        },
      }),
    ).toEqual({
      kind: "tool-execution-failed",
      legacySuccess: false,
      reason: "command failed",
      failureBoundary: "tool-execution-failed",
      executionPath: "ts-local",
      toolName: "bash",
    });
  });

  it("does not synthesize file mutation fields", () => {
    const projection = projectToolLifecycle({
      toolName: "mcp__localSdk__search",
      success: false,
      error: "MCP tool 'mcp__localSdk__search' is not registered",
      metadata: { executionPath: "mcp-stdio" },
    });

    expect(projection).not.toHaveProperty("changedFiles");
    expect(projection).not.toHaveProperty("failedFiles");
  });
});
