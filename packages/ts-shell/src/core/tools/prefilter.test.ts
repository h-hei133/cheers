import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import { buildVisibleToolPool, filterVisibleToolNames, type ToolVisibilityEntry } from "./prefilter.js";

/**
 * Which tools a run offers.
 *
 * The allowlist exists because every other filter here only subtracts, which
 * fails open: each tool added later is offered without anyone deciding to offer
 * it. The three cases below are the ones that make it usable rather than merely
 * present - absent, empty, and narrowing.
 */

const ALL_TOOLS = ["read", "write", "bash", "grep", "mcp__server__search"];

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    disabledTools: [],
    hiddenToolPrefixes: [],
    enableMcpTools: true,
    ...overrides,
  } as RuntimeConfig;
}

const reasonFor = (entries: readonly ToolVisibilityEntry[], name: string): string | undefined =>
  entries.find((entry) => entry.toolName === name)?.reason;

describe("buildVisibleToolPool allowlist", () => {
  it("offers every tool when no allowlist is set", () => {
    // Absent means unrestricted, matching how `disabledTools` already reads.
    expect(filterVisibleToolNames(ALL_TOOLS, config())).toEqual(ALL_TOOLS);
  });

  it("offers only the named tools when an allowlist is set", () => {
    const visible = filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: ["read", "grep"] }));
    expect(visible).toEqual(["read", "grep"]);
  });

  it("offers nothing when the allowlist is empty", () => {
    // An empty list is a user saying "offer nothing". It must not collapse into
    // the absent case, or that instruction becomes inexpressible.
    expect(filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: [] }))).toEqual([]);
  });

  it("hides a tool that is allowed and also disabled", () => {
    // Allowing is permission to offer, not an instruction to offer. A subtraction
    // still applies on top.
    const entries = buildVisibleToolPool(ALL_TOOLS, config({ allowedTools: ["read", "bash"], disabledTools: ["bash"] }));
    expect(filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: ["read", "bash"], disabledTools: ["bash"] })))
      .toEqual(["read"]);
    expect(reasonFor(entries, "bash")).toBe("disabled-tool");
  });

  it("reports why an unnamed tool was withheld", () => {
    const entries = buildVisibleToolPool(ALL_TOOLS, config({ allowedTools: ["read"] }));
    expect(reasonFor(entries, "write")).toBe("not-allowed");
  });

  it("requires an mcp tool to be named explicitly", () => {
    // The allowlist is checked first, so an MCP tool is offered only when the
    // user named it; enabling MCP is not itself permission to offer it.
    expect(filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: ["read"] }))).not.toContain(
      "mcp__server__search",
    );
    expect(
      filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: ["read", "mcp__server__search"] })),
    ).toContain("mcp__server__search");
  });

  it("still withholds MCP tools when MCP is off, even if named", () => {
    const visible = filterVisibleToolNames(
      ALL_TOOLS,
      config({ allowedTools: ["mcp__server__search"], enableMcpTools: false }),
    );
    expect(visible).toEqual([]);
  });

  it("ignores an allowlisted name that no tool has", () => {
    // Naming a tool that does not exist cannot conjure it; it simply matches
    // nothing. The unknown name is reported by the caller, not invented here.
    expect(filterVisibleToolNames(ALL_TOOLS, config({ allowedTools: ["read", "no-such-tool"] })))
      .toEqual(["read"]);
  });
});
