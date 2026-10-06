import { describe, expect, it, vi } from "vitest";
import { createCatalogLoader, catalogIdentity } from "./catalog.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import { createShellRuntimeContext, type ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

function context(): ShellRuntimeContext {
  const root = process.cwd();
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: { id: 'catalog-fixture', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
    runtimeConfig: { ...getRuntimeConfig(), enableMcpTools: true, allowedTools: ['mcp__fixture__read'], disabledTools: [], hiddenToolPrefixes: [] } });
  context.skillOptions = { noSkills: true };
  return context;
}

describe("runtime catalog source", () => {
  it("honors disabled skills and current tool visibility, reusing a pending catalog without connecting", async () => {
    const ctx = context();
    const snapshot = vi.fn(() => { throw new Error("must not connect"); });
    const peekSnapshot = vi.fn(() => ({ clients: [], tools: [{ serverName: "fixture", toolName: "read", qualifiedName: "mcp__fixture__read", description: "Fixture read", inputSchema: { type: "object", properties: {} } }] }));
    const load = createCatalogLoader(() => ctx, { snapshot, peekSnapshot } as unknown as CliMcpGateway, []);
    expect(await load("skill", new AbortController().signal)).toEqual([]);
    const first = load("tools", new AbortController().signal);
    const second = load("tools", new AbortController().signal);
    expect(peekSnapshot).toHaveBeenCalledOnce();
    expect(snapshot).not.toHaveBeenCalled();
    expect((await first).map(item => item.value)).toEqual(["mcp__fixture__read"]);
    expect(await second).toEqual(await first);
    const before = catalogIdentity(ctx);
    const binding = ctx.configuration.current.binding;
    ctx.configuration.publish(ctx.configuration.begin(binding), { ...ctx.runtimeConfig, disabledTools: ["mcp__fixture__read"] }, binding);
    expect(catalogIdentity(ctx)).not.toBe(before);
  });

  it("does not reuse a read that predates explicit catalog invalidation", async () => {
    const ctx = context();
    const peekSnapshot = vi.fn(() => ({ clients: [], tools: [] }));
    const load = createCatalogLoader(() => ctx, { peekSnapshot } as unknown as CliMcpGateway, []);
    const first = load("tools", new AbortController().signal);
    load.invalidate();
    const second = load("tools", new AbortController().signal);
    await Promise.all([first, second]);
    expect(peekSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not silently turn an unavailable MCP catalog into a successful core-only list", async () => {
    const ctx = context();
    const load = createCatalogLoader(() => ctx, { snapshot: async () => { throw new Error("private upstream body"); } } as unknown as CliMcpGateway, []);
    await expect(load("tools", new AbortController().signal)).rejects.toThrow();
  });
});
