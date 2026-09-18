import { describe, expect, it } from "vitest";
import {
  normalizeSidebarToolAvailability,
  sidebarToolAvailabilityFacts,
} from "./sidebarToolAvailability.js";

describe("sidebar tool availability", () => {
  it("normalizes explicit placeholders without discovery or calls", () => {
    const summary = normalizeSidebarToolAvailability({
      localCommands: [{ id: "sidebar", status: "available", summary: "Preview command." }],
      mcpServers: [{ id: "playwright", status: "unknown" }],
      skills: [{ id: "imagegen", status: "deferred" }],
      browserTooling: [{ id: "action-layer", status: "unavailable", summary: "Not configured." }],
    });

    expect(summary.discovery).toBe("not-run");
    expect(summary.providerCall).toBe("none");
    expect(summary.mcpCall).toBe("none");
    expect(summary.packageScriptExecution).toBe("none");
    expect(summary.items.map((item) => item.status)).toEqual([
      "available",
      "unknown",
      "deferred",
      "unavailable",
    ]);

    const facts = sidebarToolAvailabilityFacts(summary);
    expect(facts).toHaveLength(4);
    expect(facts.map((fact) => fact.summary).join("\n")).toContain("MCP servers: unknown");
    expect(facts.map((fact) => fact.summary).join("\n")).toContain("Skills: deferred");
  });

  it("uses deferred category facts when no explicit inputs are provided", () => {
    const summary = normalizeSidebarToolAvailability();
    const facts = sidebarToolAvailabilityFacts(summary);

    expect(summary.items).toHaveLength(4);
    expect(summary.items.every((item) => item.status === "deferred")).toBe(true);
    expect(facts.map((fact) => fact.summary).join("\n")).toContain("Not discovered");
  });
});
