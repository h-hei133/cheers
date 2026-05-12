import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SandboxEnforcer } from "../../sandbox/sandboxEnforcer.js";
import { ToolRuntime } from "../tools/runtime.js";
import { deriveToolExecutionProvenance } from "../tools/toolExecutionProvenance.js";
import { projectToolLifecycle } from "../tools/toolLifecycleProjection.js";
import { McpClassifiedError } from "./errorTaxonomy.js";
import { CoreMcpGateway, McpGatewayBlockedError } from "./gateway.js";
import type { McpToolDescriptor } from "./types.js";

const SERVER_NAME = "stdioEcho";
const TOOL_NAME = "echo_message";
const QUALIFIED_TOOL_NAME = "mcp__stdioEcho__echo_message";
let workspaceRoot = "";
let auditLogPath = "";
let fakeHome = "";

describe("MCP error taxonomy", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-mcp-taxonomy-workspace-"));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-mcp-taxonomy-home-"));
    auditLogPath = path.join(os.tmpdir(), `private-agents-mcp-taxonomy-audit-${Date.now()}.jsonl`);
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(auditLogPath, { force: true });
  });

  it("keeps local deterministic MCP success classified as success", async () => {
    writeMcpConfig({ args: [fixturePath()] });
    const { runtime, gateway } = await createRuntime();

    const snapshot = await gateway.snapshot();
    expect(snapshot.tools).toHaveLength(1);
    const result = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "hello" },
      { taskId: "task_mcp_taxonomy_success", workspaceRoot },
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("echo:hello");
    expect(result.metadata).toMatchObject({
      executionPath: "mcp-stdio",
      serverName: SERVER_NAME,
      toolName: TOOL_NAME,
    });
    expect(projectToolLifecycle({ toolName: QUALIFIED_TOOL_NAME, ...result })).toMatchObject({
      kind: "success",
      legacySuccess: true,
    });
  });

  it("classifies invalid MCP config as config without tool success", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".private-agents.mcp.json"), "{broken", "utf8");
    const gateway = new CoreMcpGateway(workspaceRoot);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpGatewayBlockedError",
      mcpFailureClass: "config",
      mcpFailurePlane: "user-config",
    });
  });

  it("classifies missing stdio command and spawn failures as safe non-success", async () => {
    writeMcpConfig({ command: "/missing/private-agents-mcp-command" });
    const gateway = new CoreMcpGateway(workspaceRoot);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpClassifiedError",
      failureClass: "stdio-process",
      failurePlane: "server-availability",
    });
  });

  it("classifies auth-required MCP execution as permission denied", async () => {
    writeMcpConfig({
      authRequired: true,
      mockTools: [descriptor()],
    });
    const result = await createRuntimeWithTools([descriptor()]).execute(
      QUALIFIED_TOOL_NAME,
      { message: "hello" },
      { taskId: "task_mcp_taxonomy_auth", workspaceRoot },
    );

    expectNonSuccess(result, {
      mcpFailureClass: "permission-denied",
      mcpFailurePlane: "permission",
      lifecycleKind: "mcp-unavailable",
      provenanceKind: "unavailable-tool",
    });
  });

  it("classifies unknown MCP tools as tool unavailable", async () => {
    const result = await createRuntimeWithTools([]).execute(
      "mcp__missing__search",
      {},
      { taskId: "task_mcp_taxonomy_unknown_tool", workspaceRoot },
    );

    expectNonSuccess(result, {
      mcpFailureClass: "tool-unavailable",
      mcpFailurePlane: "tool-level",
      lifecycleKind: "mcp-unavailable",
      provenanceKind: "unavailable-tool",
    });
  });

  it("classifies MCP isError, process throw, and malformed result separately", async () => {
    writeMcpConfig({ args: [fixturePath()] });
    const { runtime } = await createRuntime();

    const isErrorResult = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "mcp-error" },
      { taskId: "task_mcp_taxonomy_is_error", workspaceRoot },
    );
    expectNonSuccess(isErrorResult, {
      mcpFailureClass: "tool-is-error",
      mcpFailurePlane: "tool-level",
      lifecycleKind: "mcp-tool-is-error",
      provenanceKind: "executed-failed",
    });

    const processFailureResult = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "mcp-throw" },
      { taskId: "task_mcp_taxonomy_throw", workspaceRoot },
    );
    expectNonSuccess(processFailureResult, {
      mcpFailureClass: "stdio-process",
      mcpFailurePlane: "server-availability",
      lifecycleKind: "mcp-process-failed",
      provenanceKind: "executed-failed",
    });

    const malformedResult = await runtime.execute(
      QUALIFIED_TOOL_NAME,
      { message: "mcp-malformed" },
      { taskId: "task_mcp_taxonomy_malformed", workspaceRoot },
    );
    expectNonSuccess(malformedResult, {
      mcpFailureClass: "malformed-result",
      mcpFailurePlane: "protocol-level",
      lifecycleKind: "mcp-protocol-failed",
      provenanceKind: "executed-failed",
    });
  });

  it("classifies malformed list-tools response as a protocol failure", async () => {
    writeMcpConfig({ args: [fixturePath(), "--invalid-tools-list"] });
    const gateway = new CoreMcpGateway(workspaceRoot);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpClassifiedError",
      failureClass: "protocol",
      failurePlane: "protocol-level",
    });
  });
});

function createRuntimeWithTools(mcpTools: readonly McpToolDescriptor[]): ToolRuntime {
  return new ToolRuntime(
    new SandboxEnforcer({ workspaceRoot, auditLogPath }),
    {
      mcpTools,
      mcpGateway: new CoreMcpGateway(workspaceRoot),
      runtimeConfig,
    },
  );
}

async function createRuntime(): Promise<{
  readonly gateway: CoreMcpGateway;
  readonly runtime: ToolRuntime;
}> {
  const gateway = new CoreMcpGateway(workspaceRoot);
  const snapshot = await gateway.snapshot();
  return {
    gateway,
    runtime: new ToolRuntime(
      new SandboxEnforcer({ workspaceRoot, auditLogPath }),
      {
        mcpTools: snapshot.tools,
        mcpGateway: gateway,
        runtimeConfig,
      },
    ),
  };
}

const runtimeConfig = {
  provider: "openai",
  daemonEnabled: true,
  maxTurns: 6,
  disabledTools: [],
  hiddenToolPrefixes: [],
  enableMcpTools: true,
  configSources: [],
};

function writeMcpConfig(input: {
  readonly command?: string;
  readonly args?: string[];
  readonly authRequired?: boolean;
  readonly mockTools?: McpToolDescriptor[];
}): void {
  fs.writeFileSync(
    path.join(workspaceRoot, ".private-agents.mcp.json"),
    JSON.stringify({
      mcpServers: {
        [SERVER_NAME]: {
          transport: "stdio",
          command: input.command ?? process.execPath,
          args: input.args ?? [],
          ...(input.authRequired ? { authRequired: true } : {}),
          ...(input.mockTools ? { mockTools: input.mockTools } : {}),
        },
      },
    }),
    "utf8",
  );
}

function fixturePath(): string {
  return path.resolve(process.cwd(), "src/core/mcp/fixtures/mockMcpServer.mjs");
}

function descriptor(): McpToolDescriptor {
  return {
    serverName: SERVER_NAME,
    toolName: TOOL_NAME,
    qualifiedName: QUALIFIED_TOOL_NAME,
    description: "Echo from synthetic MCP fixture",
  };
}

function expectNonSuccess(
  result: Awaited<ReturnType<ToolRuntime["execute"]>>,
  expected: {
    readonly mcpFailureClass: string;
    readonly mcpFailurePlane: string;
    readonly lifecycleKind: string;
    readonly provenanceKind: string;
  },
): void {
  expect(result.success).toBe(false);
  expect(result.metadata).toMatchObject({
    executionPath: "mcp-stdio",
    mcpFailureClass: expected.mcpFailureClass,
    mcpFailurePlane: expected.mcpFailurePlane,
  });
  expect(result.output).toBeUndefined();
  expect(projectToolLifecycle({ toolName: QUALIFIED_TOOL_NAME, ...result })).toMatchObject({
    kind: expected.lifecycleKind,
    legacySuccess: false,
  });
  expect(deriveToolExecutionProvenance(result)).toMatchObject({
    kind: expected.provenanceKind,
    legacySuccess: false,
  });
  expect(result.metadata?.mcpSafeDetail).not.toContain("/home/wang/.private-agents-real");
}
