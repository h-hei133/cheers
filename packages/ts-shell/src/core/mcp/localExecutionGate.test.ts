import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CodingResultSummary,
  OrchestrationResult,
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
import { SandboxEnforcer } from "../../sandbox/sandboxEnforcer.js";
import { SessionManager } from "../../session/SessionManager.js";
import { deriveStoppedSessionContinuitySurface } from "../../session/continuation/stoppedSessionContinuity.js";
import { ShellSessionRuntime } from "../shell/sessionRuntime.js";
import { ToolRuntime } from "../tools/runtime.js";
import { deriveToolExecutionProvenance } from "../tools/toolExecutionProvenance.js";
import { projectToolLifecycle } from "../tools/toolLifecycleProjection.js";
import { CoreMcpGateway } from "./gateway.js";

const SERVER_NAME = "stdioEcho";
const TOOL_NAME = "echo_message";
const QUALIFIED_TOOL_NAME = "mcp__stdioEcho__echo_message";

describe("local MCP execution gate", () => {
  let fakeHome = "";
  let workspaceRoot = "";
  let auditLogPath = "";
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-mcp-local-home-"));
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-mcp-local-workspace-"));
    auditLogPath = path.join(os.tmpdir(), `private-agents-mcp-local-audit-${Date.now()}.jsonl`);
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    writeLocalMcpConfig(workspaceRoot);
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(auditLogPath, { force: true });
  });

  it("executes the local stdio MCP fixture through gateway, ToolRuntime, and lifecycle projection", async () => {
    const { runtime, gateway } = await createRuntime(workspaceRoot, auditLogPath);

    const snapshot = await gateway.snapshot();
    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tools[0]).toMatchObject({
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
      qualifiedName: QUALIFIED_TOOL_NAME,
    });

    const result = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "hello" },
      { taskId: "task_mcp_local_success", workspaceRoot },
    );

    expect(result).toMatchObject({
      success: true,
      output: "echo:hello",
      metadata: {
        executionPath: "mcp-stdio",
        serverName: SERVER_NAME,
        toolName: TOOL_NAME,
      },
    });

    const provenance = deriveToolExecutionProvenance(result);
    expect(provenance).toEqual({
      kind: "executed-succeeded",
      source: "tool-runtime",
      legacySuccess: true,
    });

    expect(projectToolLifecycle({ toolName: QUALIFIED_TOOL_NAME, ...result })).toEqual({
      kind: "success",
      legacySuccess: true,
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
    });
  }, 15000);

  it("keeps local stdio MCP isError and thrown failures on the MCP execution boundary", async () => {
    const { runtime } = await createRuntime(workspaceRoot, auditLogPath);

    const isErrorResult = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "mcp-error" },
      { taskId: "task_mcp_local_is_error", workspaceRoot },
    );

    expect(isErrorResult.success).toBe(false);
    expect(isErrorResult.error).toBe("MCP tool rejected request: invalid message");
    expect(isErrorResult.output).toBeUndefined();
    expect(isErrorResult.metadata).toMatchObject({
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
      status: "failed",
      failureKind: "execution_failure",
      reason: "MCP tool rejected request: invalid message",
    });
    expect(projectToolLifecycle({ toolName: QUALIFIED_TOOL_NAME, ...isErrorResult })).toMatchObject({
      kind: "mcp-tool-is-error",
      legacySuccess: false,
      failureBoundary: "mcp-tool-is-error",
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
    });

    const thrownResult = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "mcp-throw" },
      { taskId: "task_mcp_local_throw", workspaceRoot },
    );

    expect(thrownResult.success).toBe(false);
    expect(thrownResult.error).toBe("MCP stdio execution failed");
    expect(thrownResult.metadata).toMatchObject({
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
      status: "failed",
      failureKind: "execution_failure",
      reason: "MCP stdio execution failed",
    });
    expect(projectToolLifecycle({ toolName: QUALIFIED_TOOL_NAME, ...thrownResult })).toMatchObject({
      kind: "mcp-process-failed",
      legacySuccess: false,
      failureBoundary: "mcp-process-failed",
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
    });
  }, 15000);

  it("rejects unknown MCP execution without fabricating file mutation state", async () => {
    const runtime = new ToolRuntime(
      new SandboxEnforcer({ workspaceRoot, auditLogPath }),
      { runtimeConfig: runtimeConfig() },
    );

    const result = await runtime.execute(
      "mcp__missingServer__search",
      {},
      { taskId: "task_mcp_unknown", workspaceRoot },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("MCP tool 'mcp__missingServer__search' is not registered");
    expect(result.metadata).toMatchObject({
      executionPath: "mcp-stdio",
      serverName: "missingServer",
      blockerKind: "unknown",
      reason: "MCP tool 'mcp__missingServer__search' is not registered",
    });
    expect(projectToolLifecycle({ toolName: "mcp__missingServer__search", ...result })).toMatchObject({
      kind: "mcp-unavailable",
      legacySuccess: false,
      failureBoundary: "mcp-unavailable",
      verificationBlockerKind: "environment-not-ready",
    });
  });

  it("renders MCP execution success and failure as user-visible non-mutation results", async () => {
    const successResult = makeOrchestrationResult({
      sessionId: "sess_mcp_local_success_surface",
      terminalReason: "completed",
      terminalClassification: "success",
      finalOutput: "MCP tool result: echo:hello",
      codingResult: makeCodingResult({
        taskId: "task_mcp_surface_success",
        toolResult: {
          success: true,
          output: "echo:hello",
          metadata: {
            executionPath: "mcp-stdio",
            serverName: SERVER_NAME,
            toolName: TOOL_NAME,
          },
        },
      }),
    });
    const successLines = await renderPromptWithResult(successResult);

    expect(successLines).toContain("Result");
    expect(successLines).toContain("- Outcome: success");
    expect(successLines).toContain("Action result");
    expect(successLines).toContain("- Task: run-command");
    expect(successLines).toContain("- Changed: none");
    expect(successLines).toContain("- Verification: not-requested");
    expect(successLines.some((line) => line.includes(QUALIFIED_TOOL_NAME))).toBe(true);
    expect(successLines).not.toContain("- Changed files: note.txt");
    expect(successLines).not.toContain("- Outcome: stopped");

    const failureReason = "MCP tool rejected request: invalid message";
    const failureResult = makeOrchestrationResult({
      sessionId: "sess_mcp_local_failure_surface",
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason: failureReason,
      finalOutput: "",
      codingResult: makeCodingResult({
        taskId: "task_mcp_surface_failure",
        toolResult: {
          success: false,
          error: failureReason,
          metadata: {
            executionPath: "mcp-stdio",
            serverName: SERVER_NAME,
            toolName: TOOL_NAME,
            status: "failed",
            failureKind: "execution_failure",
            reason: failureReason,
          },
        },
      }),
    });
    const failureLines = await renderPromptWithResult(failureResult);

    expect(failureLines).toContain("Result");
    expect(failureLines).toContain("- Outcome: stopped");
    expect(failureLines).toContain("Action result");
    expect(failureLines).toContain("- Changed: none");
    expect(failureLines).toContain(`- Failure reason: ${failureReason}`);
    expect(failureLines.some((line) => line.includes(QUALIFIED_TOOL_NAME))).toBe(true);
    expect(failureLines).not.toContain("- Outcome: success");
    expect(failureLines.some((line) => line.includes("Changed files:"))).toBe(false);
  });

  it("persists MCP execution provenance through follow-up continuity without changedFiles leakage", () => {
    const successManager = new SessionManager();
    const successSession = successManager.createNew(workspaceRoot);
    const successResult = makeOrchestrationResult({
      sessionId: successSession.id,
      terminalReason: "completed",
      terminalClassification: "success",
      finalOutput: "MCP tool result: echo:hello",
      codingResult: makeCodingResult({
        taskId: "task_mcp_continuity_success",
        toolResult: {
          success: true,
          output: "echo:hello",
          metadata: {
            executionPath: "mcp-stdio",
            serverName: SERVER_NAME,
            toolName: TOOL_NAME,
          },
        },
      }),
    });
    persistResult(successManager, successSession.id, "use local mcp", successResult);
    successManager.saveCompleted(successSession.id);

    const freshSuccessManager = new SessionManager();
    const successSnapshot = freshSuccessManager.buildContinuitySnapshot(successSession.id);
    const successContext = freshSuccessManager.buildPromptContinuityContext(
      successSession.id,
      "/continue what did the MCP tool do?",
    );

    expect(successSnapshot.lastToolExecutionProvenanceKind).toBe("executed-succeeded");
    expect(successSnapshot.lastToolExecutionProvenanceSource).toBe("tool-runtime");
    expect(successSnapshot.lastToolExecutionProvenanceToolName).toBe(QUALIFIED_TOOL_NAME);
    expect(successSnapshot.lastToolExecutionProvenanceTaskId).toBe("task_mcp_continuity_success");
    expect(successSnapshot.recentChangedFiles).toEqual([]);
    expect(successSnapshot.recentFailedFiles).toEqual([]);
    expect(successContext).toContain("- last-tool-execution-provenance-kind: executed-succeeded");
    expect(successContext).toContain(`- last-tool-execution-provenance-tool: ${QUALIFIED_TOOL_NAME}`);
    expect(successContext).not.toContain("- recent-changed-files:");

    const failureReason = "MCP stdio execution failed";
    const failureManager = new SessionManager();
    const failureSession = failureManager.createNew(workspaceRoot);
    const failureResult = makeOrchestrationResult({
      sessionId: failureSession.id,
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason: failureReason,
      finalOutput: "",
      codingResult: makeCodingResult({
        taskId: "task_mcp_continuity_failure",
        toolResult: {
          success: false,
          error: failureReason,
          metadata: {
            executionPath: "mcp-stdio",
            serverName: SERVER_NAME,
            toolName: TOOL_NAME,
            status: "failed",
            failureKind: "execution_failure",
            reason: failureReason,
          },
        },
      }),
    });
    persistResult(failureManager, failureSession.id, "use failing local mcp", failureResult);
    failureManager.saveError(failureSession.id, failureReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const freshFailureManager = new SessionManager();
    const failureSnapshot = freshFailureManager.buildContinuitySnapshot(failureSession.id);
    const failureContext = freshFailureManager.buildPromptContinuityContext(
      failureSession.id,
      "/continue what failed?",
    );
    const stoppedSurface = deriveStoppedSessionContinuitySurface(failureResult.codingResult);

    expect(stoppedSurface?.kind).toBe("tool-execution-failed");
    expect(failureSnapshot.lastTerminalClassification).toBe("stopped");
    expect(failureSnapshot.lastToolExecutionProvenanceKind).toBe("executed-failed");
    expect(failureSnapshot.lastToolExecutionProvenanceSource).toBe("tool-runtime");
    expect(failureSnapshot.lastToolExecutionProvenanceToolName).toBe(QUALIFIED_TOOL_NAME);
    expect(failureSnapshot.lastToolExecutionFailureBoundary).toBe("tool-execution-failed");
    expect(failureSnapshot.lastFailure).toBe(failureReason);
    expect(failureSnapshot.recentChangedFiles).toEqual([]);
    expect(failureSnapshot.recentFailedFiles).toEqual([]);
    expect(failureContext).toContain("- last-terminal: stopped (stopped_error)");
    expect(failureContext).toContain(`- last-failure: ${failureReason}`);
    expect(failureContext).toContain("- last-tool-execution-provenance-kind: executed-failed");
    expect(failureContext).toContain("- last-tool-execution-failure-boundary: tool-execution-failed");
    expect(failureContext).not.toContain("- recent-changed-files:");
  });
});

async function createRuntime(
  workspaceRoot: string,
  auditLogPath: string,
): Promise<{ readonly gateway: CoreMcpGateway; readonly runtime: ToolRuntime }> {
  const gateway = new CoreMcpGateway(workspaceRoot);
  const snapshot = await gateway.snapshot();
  const runtime = new ToolRuntime(
    new SandboxEnforcer({ workspaceRoot, auditLogPath }),
    {
      mcpTools: snapshot.tools,
      mcpGateway: gateway,
      runtimeConfig: runtimeConfig(),
    },
  );
  return { gateway, runtime };
}

function runtimeConfig() {
  return {
    provider: "openai",
    daemonEnabled: true,
    maxTurns: 6,
    disabledTools: [],
    hiddenToolPrefixes: [],
    enableMcpTools: true,
    configSources: [],
  };
}

function writeLocalMcpConfig(workspaceRoot: string): void {
  fs.writeFileSync(
    path.join(workspaceRoot, ".private-agents.mcp.json"),
    JSON.stringify({
      mcpServers: {
        [SERVER_NAME]: {
          transport: "stdio",
          command: process.execPath,
          args: [path.resolve(process.cwd(), "src/core/mcp/fixtures/mockMcpServer.mjs")],
        },
      },
    }),
    "utf8",
  );
}

function makeCodingResult(input: {
  readonly taskId: string;
  readonly toolResult: {
    readonly success: boolean;
    readonly output?: string;
    readonly error?: string;
    readonly metadata?: Record<string, unknown>;
  };
}): CodingResultSummary {
  const lifecycle = projectToolLifecycle({
    toolName: QUALIFIED_TOOL_NAME,
    ...input.toolResult,
  });
  const provenance = deriveToolExecutionProvenance(input.toolResult);
  const reason =
    input.toolResult.error ??
    input.toolResult.output ??
    "MCP local stdio tool execution completed.";
  const verificationStatus = input.toolResult.success ? "not-requested" : "failed";
  const taskSatisfied = input.toolResult.success ? "satisfied" : "insufficient-evidence";

  return {
    taskKind: "run-command",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: input.toolResult.success ? "not-needed" : "failed",
      attempts: input.toolResult.success ? 0 : 1,
      recoveredItems: [],
      failedItems: [],
      notes: input.toolResult.success ? [] : [reason],
    },
    continuation: {
      status: input.toolResult.success
        ? "first-pass-success"
        : "failed-after-bounded-continuation",
      attempts: input.toolResult.success ? 0 : 1,
      evidence: [
        "mcp-local-execution",
        `mcp-server:${SERVER_NAME}`,
        `mcp-tool:${TOOL_NAME}`,
        `mcp-lifecycle-kind:${lifecycle.kind}`,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: taskSatisfied,
      reasons: input.toolResult.success
        ? ["MCP local stdio tool returned a successful result without file mutation."]
        : [reason],
      requiredEvidence: ["local stdio MCP tool execution result"],
      observedEvidence: [
        `executionPath:${String(input.toolResult.metadata?.executionPath ?? "unknown")}`,
        `server:${SERVER_NAME}`,
        `tool:${TOOL_NAME}`,
      ],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: verificationStatus,
      reason: input.toolResult.success ? undefined : reason,
      nextAction: input.toolResult.success
        ? "Use the MCP tool output for the follow-up; no file mutation occurred."
        : "Inspect MCP tool error output, refresh the local MCP server, and retry only if still needed.",
    },
    evidence: [
      "mcp-local-execution",
      `executionPath:${String(input.toolResult.metadata?.executionPath ?? "unknown")}`,
      `server:${SERVER_NAME}`,
      `tool:${TOOL_NAME}`,
      "changedFiles:none",
      "failedFiles:none",
    ],
    failureBoundary: input.toolResult.success ? undefined : lifecycle.failureBoundary,
    provenance: {
      toolExecutions: [
        {
          kind: provenance.kind,
          source: provenance.source,
          legacySuccess: provenance.legacySuccess,
          toolName: QUALIFIED_TOOL_NAME,
          taskId: input.taskId,
          ...(provenance.failureBoundary
            ? { failureBoundary: provenance.failureBoundary }
            : {}),
        },
      ],
    },
  };
}

function makeOrchestrationResult(input: {
  readonly sessionId: string;
  readonly terminalReason: TerminalReason;
  readonly terminalClassification: TerminalClassification;
  readonly finalOutput: string;
  readonly codingResult: CodingResultSummary;
  readonly stopReason?: string;
}): OrchestrationResult {
  return {
    status: input.terminalReason,
    terminalReason: input.terminalReason,
    terminalClassification: input.terminalClassification,
    ...(input.stopReason ? { stopReason: input.stopReason } : {}),
    transcript: [],
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: "use local MCP tool",
      notes: [],
      handoffs: [],
    },
    finalOutput: input.finalOutput,
    codingResult: input.codingResult,
  };
}

async function renderPromptWithResult(result: OrchestrationResult): Promise<string[]> {
  const renderedLines: string[] = [];
  const runtime = new ShellSessionRuntime({
    sessionManager: {
      markRunStarted() {},
      persistUserPromptBarrier() {},
      markTurnActive() {},
      appendQueryEvent() {},
      addTurn() {},
      saveCompleted() {},
      saveInterrupted() {},
      saveError() {},
      saveTerminated() {},
    } as never,
    renderer: {
      renderLine(line: string) {
        renderedLines.push(line);
      },
      renderChunk(chunk: string) {
        if (chunk.trim()) {
          renderedLines.push(chunk.trim());
        }
      },
    } as never,
    runPrompt: async function* () {
      yield {
        type: "tool.started",
        toolName: QUALIFIED_TOOL_NAME,
        taskId: result.codingResult?.provenance?.toolExecutions?.[0]?.taskId ?? "task_mcp",
      };
      yield {
        type: "tool.result",
        toolName: QUALIFIED_TOOL_NAME,
        taskId: result.codingResult?.provenance?.toolExecutions?.[0]?.taskId ?? "task_mcp",
        success: result.terminalClassification === "success",
      };
      yield {
        type: "query.completed",
        result,
      };
    },
  });
  await runtime.executePrompt(result.sharedContext.sessionId, "use local MCP tool");
  return renderedLines;
}

function persistResult(
  manager: SessionManager,
  sessionId: string,
  prompt: string,
  result: OrchestrationResult,
): void {
  const taskId = result.codingResult?.provenance?.toolExecutions?.[0]?.taskId ?? "task_mcp";
  manager.addTurn(sessionId, { role: "user", content: prompt });
  manager.markRunStarted(sessionId, prompt);
  manager.appendQueryEvent(sessionId, {
    type: "tool.started",
    toolName: QUALIFIED_TOOL_NAME,
    taskId,
  });
  manager.appendQueryEvent(sessionId, {
    type: "tool.result",
    toolName: QUALIFIED_TOOL_NAME,
    taskId,
    success: result.terminalClassification === "success",
  });
  manager.appendQueryEvent(sessionId, {
    type: "query.completed",
    result,
  });
}
