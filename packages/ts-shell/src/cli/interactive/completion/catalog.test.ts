import { describe, expect, it, vi } from "vitest";
import { createCatalogLoader, catalogIdentity } from "./catalog.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

function context(): ShellRuntimeContext {
  return { cwd: process.cwd(), projectRoot: process.cwd(), session: { id: "catalog-fixture" },
    skillOptions: { noSkills: true }, runtimeConfig: { ...getRuntimeConfig(), enableMcpTools: true,
      allowedTools: ["mcp__fixture__read"], disabledTools: [], hiddenToolPrefixes: [] } } as unknown as ShellRuntimeContext;
}

describe("runtime catalog source", () => {
  it("honors disabled skills and current tool visibility, reusing a pending snapshot", async () => {
    const ctx = context();
    let finish!: (value: unknown) => void;
    const snapshot = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const load = createCatalogLoader(() => ctx, { snapshot } as unknown as CliMcpGateway, []);
    expect(await load("skill", new AbortController().signal)).toEqual([]);
    const first = load("tools", new AbortController().signal);
    const second = load("tools", new AbortController().signal);
    expect(snapshot).toHaveBeenCalledOnce();
    finish({ clients: [], tools: [{ serverName: "fixture", toolName: "read", qualifiedName: "mcp__fixture__read", description: "Fixture read", inputSchema: { type: "object", properties: {} } }] });
    expect((await first).map(item => item.value)).toEqual(["mcp__fixture__read"]);
    expect(await second).toEqual(await first);
    const before = catalogIdentity(ctx);
    ctx.runtimeConfig = { ...ctx.runtimeConfig, disabledTools: ["mcp__fixture__read"] };
    expect(catalogIdentity(ctx)).not.toBe(before);
  });

  it("does not reuse a read that predates explicit catalog invalidation", async () => {
    const ctx = context();
    const snapshot = vi.fn(async () => ({ clients: [], tools: [] }));
    const load = createCatalogLoader(() => ctx, { snapshot } as unknown as CliMcpGateway, []);
    const first = load("tools", new AbortController().signal);
    load.invalidate();
    const second = load("tools", new AbortController().signal);
    await Promise.all([first, second]);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("does not silently turn an unavailable MCP catalog into a successful core-only list", async () => {
    const ctx = context();
    const load = createCatalogLoader(() => ctx, { snapshot: async () => { throw new Error("private upstream body"); } } as unknown as CliMcpGateway, []);
    await expect(load("tools", new AbortController().signal)).rejects.toThrow();
  });
});
