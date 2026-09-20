import { describe, expect, it } from "vitest";
import { createSidebarEvent } from "./sidebarEventModel.js";
import { projectSidebarState } from "./sidebarStateProjection.js";
import { renderSidebarStateSurface } from "./sidebarStateSurface.js";

describe("sidebar state surface", () => {
  it("renders a concise preview with safety boundaries and no UI claim", () => {
    const events = [
      createSidebarEvent({
        kind: "command",
        severity: "info",
        visibility: "user-visible",
        source: "slash-command",
        title: "/sidebar",
        summary: "Rendered.",
        evidence: ["sidebar:command"],
      }),
    ];
    const output = renderSidebarStateSurface(projectSidebarState({
      task: { routeId: "Route 88", title: "sidebar state", objective: "Preview state." },
      toolAvailability: {},
      blockers: [{ id: "blocked-dynamic-discovery", message: "Dynamic MCP discovery is deferred." }],
      events,
      nextAction: "Keep projection read-only.",
    }));

    expect(output).toContain("State preview only: no actual sidebar UI exists yet.");
    expect(output).toContain("no provider/model call");
    expect(output).toContain("no dynamic MCP/skills discovery");
    expect(output).toContain("no automatic memory/startup injection");
    expect(output).toContain("Tools / MCP / Skills");
    expect(output).toContain("Recent activity");
    expect(output).toContain("/sidebar");
    expect(output).toContain("unknown/deferred");
    expect(output).toContain("Dynamic MCP discovery is deferred.");
    expect(output).toContain("Keep projection read-only.");
    expect(output.length).toBeLessThan(3200);
  });
});
