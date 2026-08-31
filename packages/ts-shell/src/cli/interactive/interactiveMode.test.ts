import { describe, it, expect, beforeEach } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";

describe("InteractiveMode Orchestrator", () => {
  let mode: InteractiveMode;

  beforeEach(() => {
    const dummySessionManager = {
      describeSessionReentry: () => ({ id: "sess_1", status: "active", resumeDisposition: "ready" }),
    } as unknown as SessionManager;

    const dummySessionRuntime = {
      getAgentMode: () => "build",
      cancelCurrentRun: () => {},
      terminate: () => {},
    } as unknown as ShellSessionRuntime;

    const dummyRuntimeContext = {
      projectRoot: "/workspace",
      session: { id: "sess_1" },
      gitContext: { branch: "main" },
      runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000 },
    } as unknown as ShellRuntimeContext;

    mode = new InteractiveMode({
      runtimeContext: dummyRuntimeContext,
      sessionRuntime: dummySessionRuntime,
      sessionManager: dummySessionManager,
      renderer: { renderLine: () => {}, render: () => {} } as unknown as StreamingRenderer,
      logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
      approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
      initialMcpGateway: {} as unknown as CliMcpGateway,
    });
  });

  it("renders frame with bottom-pinned box composer and welcome header", () => {
    const plan = mode.renderFrame({ rows: 24, cols: 80 });
    expect(plan.viewport.length).toBeGreaterThanOrEqual(4);
    expect(plan.viewport.some((l) => l.includes("Coding Agent"))).toBe(true);
    expect(plan.viewport.some((l) => l.includes("/workspace"))).toBe(true);
  });
});
