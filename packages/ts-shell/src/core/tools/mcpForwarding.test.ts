import { describe, expect, it } from "vitest";
import { createCoreToolRegistry } from "./registry.js";
import type { McpToolDescriptor } from "../mcp/types.js";
import type { CoreMcpGateway } from "../mcp/gateway.js";
import { McpGatewayBlockedError } from "../mcp/gateway.js";
import { McpClassifiedError, classifyMcpFailure } from "../mcp/errorTaxonomy.js";

/**
 * What an MCP tool call does when it actually works.
 *
 * The gateway type is the real one; the double records what reached it. That
 * recording is the test's whole point: this registry once answered every MCP
 * call with a canned string and a test that checked only the shape of the
 * answer passed with the forwarding deleted, because the gateway was never
 * asked. A test that records the ask cannot pass that way.
 */
function recordingGateway(answer: {
  content: string;
  isError?: boolean;
}): CoreMcpGateway & { calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> } {
  const calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> = [];
  const gateway = {
    async snapshot() {
      return { clients: [], tools: [] };
    },
    async refresh() {
      return { clients: [], tools: [] };
    },
    async invokeTool(server: string, tool: string, args: Record<string, unknown>) {
      calls.push({ server, tool, args });
      return answer;
    },
  } as unknown as CoreMcpGateway;
  return Object.assign(gateway, { calls });
}

function toolDescriptor(overrides: Partial<McpToolDescriptor> = {}): McpToolDescriptor {
  return {
    serverName: "notes",
    toolName: "append",
    qualifiedName: "notes__append",
    description: "Append a note",
    inputSchema: { type: "object" },
    ...overrides,
  };
}

/** The tools here read no filesystem and ask no permission; the context is
 * a shape, and the registry's MCP branch never looks at it. */
function minimalContext(): never {
  return undefined as never;
}

describe("mcp tools in the registry", () => {
  it.each([
    [new McpClassifiedError(classifyMcpFailure({ failureClass: "protocol", detail: "bad response token=hidden" })), "protocol", "protocol-level"],
    [new McpGatewayBlockedError({ message: "server unavailable", blockerKind: "environment-not-ready", doNext: "refresh", mcpFailureClass: "server-unavailable" }), "server-unavailable", "server-availability"],
    [new Error("unexpected token=hidden"), "unknown", "unknown"],
  ])("preserves and redacts classified failures in metadata and model-visible text", async (error, failureClass, failurePlane) => {
    const gateway = recordingGateway({ content: "unused" });
    gateway.invokeTool = async () => { throw error; };
    const tool = createCoreToolRegistry({ mcpTools: [toolDescriptor()], mcpGateway: gateway }).get("notes__append")!;
    const result = await tool.execute({}, minimalContext());
    expect(result.success).toBe(false);
    expect(result.metadata).toMatchObject({ mcpFailureClass: failureClass, mcpFailurePlane: failurePlane });
    expect(result.error).toContain(`[MCP ${failureClass}; ${failurePlane}]`);
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  it("forwards the call to the gateway and returns its content", async () => {
    const gateway = recordingGateway({ content: "note saved as #42" });
    const registry = createCoreToolRegistry({
      mcpTools: [toolDescriptor()],
      mcpGateway: gateway,
    });

    const tool = registry.get("notes__append");
    expect(tool).toBeDefined();
    const result = await tool!.execute({ text: "hello" }, minimalContext());

    // The ask reached the gateway with the split names and the model's args.
    expect(gateway.calls).toEqual([
      { server: "notes", tool: "append", args: { text: "hello" } },
    ]);
    expect(result.success).toBe(true);
    expect(result.output).toBe("note saved as #42");
  });

  it("carries a server-side error as a failure, not as a canned success", async () => {
    const gateway = recordingGateway({ content: "the disk is full", isError: true });
    const registry = createCoreToolRegistry({
      mcpTools: [toolDescriptor()],
      mcpGateway: gateway,
    });

    const result = await registry.get("notes__append")!.execute({ text: "hello" }, minimalContext());

    // An MCP isError answer is the server's own failure wording. Handed back
    // as success it would tell the model the append worked when it did not.
    expect(result.success).toBe(false);
    expect(result.error).toContain("the disk is full");
  });

  it("answers a transport failure with the gateway's own next step", async () => {
    const gateway = recordingGateway({ content: "unused" });
    gateway.invokeTool = async () => {
      throw new Error("Server exited before answering");
    };
    const registry = createCoreToolRegistry({
      mcpTools: [toolDescriptor()],
      mcpGateway: gateway,
    });

    const result = await registry.get("notes__append")!.execute({}, minimalContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Server exited before answering");
  });
});
