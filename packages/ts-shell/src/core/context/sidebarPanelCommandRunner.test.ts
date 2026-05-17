import { describe, expect, it } from "vitest";
import { parseSidebarPanelCommandArgs } from "./sidebarPanelCommandContract.js";
import { runSidebarPanelCommand } from "./sidebarPanelCommandRunner.js";
import { projectSidebarState } from "./sidebarStateProjection.js";

describe("sidebar panel command contract and runner", () => {
  it("parses explicit panel modes and rejects invalid args", () => {
    expect(parseSidebarPanelCommandArgs([])).toEqual({
      ok: true,
      contract: { mode: "preview", density: "normal" },
    });
    expect(parseSidebarPanelCommandArgs(["panel"]).contract).toEqual({
      mode: "panel",
      density: "normal",
    });
    expect(parseSidebarPanelCommandArgs(["compact"]).contract).toEqual({
      mode: "panel",
      density: "compact",
    });
    expect(parseSidebarPanelCommandArgs(["detail"]).contract).toEqual({
      mode: "panel",
      density: "detail",
    });

    const invalid = parseSidebarPanelCommandArgs(["always-on"]);
    expect(invalid.ok).toBe(false);
    expect(invalid.errorOutput).toContain("invalid-sidebar-args");
    expect(invalid.errorOutput).toContain("/sidebar panel");
  });

  it("runs the panel command as a pure read-only renderer over a snapshot", () => {
    const snapshot = projectSidebarState({
      task: { title: "panel runner", objective: "Render panel." },
      nextAction: "Inspect the panel output.",
    });
    const result = runSidebarPanelCommand({
      snapshot,
      contract: { mode: "panel", density: "normal" },
    });

    expect(result.output).toContain("Sidebar");
    expect(result.output).toContain("[Next]");
    expect(result.output).toContain("Inspect the panel output.");
    expect(result.output).toContain("No provider/model calls");
    expect(result.evidence).toContain("sidebar-panel-command-runner:read-only");
  });
});
