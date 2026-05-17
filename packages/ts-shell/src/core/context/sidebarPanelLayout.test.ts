import { describe, expect, it } from "vitest";
import { createSidebarEvent } from "./sidebarEventModel.js";
import { buildSidebarPanel } from "./sidebarPanelLayout.js";
import { checkSidebarPanelQuality } from "./sidebarPanelQuality.js";
import { renderSidebarPanel } from "./sidebarPanelRenderer.js";
import { projectSidebarState } from "./sidebarStateProjection.js";

describe("sidebar panel layout and renderer", () => {
  it("renders default panel sections with live activity and safety boundaries", () => {
    const snapshot = completeSnapshot();
    const panel = buildSidebarPanel(snapshot, { density: "normal" });
    const output = renderSidebarPanel(panel);
    const quality = checkSidebarPanelQuality({ panel, renderedOutput: output });

    expect(panel.sections.map((section) => section.id)).toEqual(
      expect.arrayContaining([
        "header",
        "task-route",
        "edit",
        "compact",
        "memory",
        "warmup",
        "tools",
        "validation",
        "activity",
        "blockers",
        "next-action",
        "footer",
      ]),
    );
    expect(output).toContain("[Task]");
    expect(output).toContain("[Edit]");
    expect(output).toContain("[Compact]");
    expect(output).toContain("[Memory]");
    expect(output).toContain("[Warmup]");
    expect(output).toContain("[Tools]");
    expect(output).toContain("[Validation]");
    expect(output).toContain("[Recent activity]");
    expect(output).toContain("Memory saved");
    expect(output).toContain("Dynamic discovery is out of scope.");
    expect(output).toContain("Run focused Route 91 tests.");
    expect(output).toContain("No provider/model calls");
    expect(output).not.toContain("Project memory raw text");
    expect(quality.qualityStatus).toBe("pass");
  });

  it("hides empty noisy sections in compact mode while preserving blockers and next action", () => {
    const snapshot = projectSidebarState({
      blockers: [{ id: "route-blocker", message: "Panel stays explicit only." }],
      nextAction: "Use /sidebar panel when a panel is needed.",
    });
    const panel = buildSidebarPanel(snapshot, { density: "compact" });
    const output = renderSidebarPanel(panel);

    expect(panel.sections.some((section) => section.id === "edit")).toBe(false);
    expect(panel.sections.some((section) => section.id === "compact")).toBe(false);
    expect(panel.sections.some((section) => section.id === "blockers")).toBe(true);
    expect(panel.sections.some((section) => section.id === "next-action")).toBe(true);
    expect(output).toContain("Panel stays explicit only.");
    expect(output).toContain("Use /sidebar panel");
  });

  it("respects activity and terminal budgets with safe truncation", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      createSidebarEvent({
        id: `event:${index}`,
        kind: "command",
        severity: "info",
        visibility: "user-visible",
        source: "slash-command",
        timestamp: `2026-05-17T00:00:0${index}.000Z`,
        title: `Activity ${index}`,
        summary: `A very long terminal activity summary with aSuperLongWordThatMustBeTruncatedWithoutGrowingThePanel ${index}`,
      }),
    );
    const snapshot = projectSidebarState({
      task: { title: "panel budget", objective: "Bound terminal output." },
      events,
      maxVisibleActivityEvents: 6,
      nextAction: "Keep output bounded.",
    });
    const panel = buildSidebarPanel(snapshot, {
      density: "compact",
      budget: { maxWidth: 48, maxActivityItems: 2, maxLines: 28 },
    });
    const output = renderSidebarPanel(panel);

    const activity = panel.sections.find((section) => section.id === "activity");
    expect(activity?.lines.filter((line) => !line.text.includes("hidden by budget"))).toHaveLength(2);
    expect(output.split("\n").every((line) => line.length <= 48)).toBe(true);
    expect(output.split("\n").length).toBeLessThanOrEqual(panel.budget.maxLines);
    expect(output).toContain("...");
    expect(panel.warnings.some((warning) => warning.id === "activity-budget")).toBe(true);
  });

  it("hides developer-only events and redacts raw content, secrets, and hidden reasoning", () => {
    const snapshot = projectSidebarState({
      task: {
        title: "secret sk-123456789",
        objective: "RAW_SECRET raw file content hidden reasoning should not leak.",
      },
      events: [
        createSidebarEvent({
          id: "developer-only",
          kind: "route",
          severity: "info",
          visibility: "developer-only",
          source: "route",
          title: "developer-only raw event",
          summary: "hidden reasoning sk-123456789",
          rawContent: "RAW_SECRET raw event content",
        }),
        createSidebarEvent({
          id: "visible",
          kind: "command",
          severity: "success",
          visibility: "user-visible",
          source: "slash-command",
          title: "Visible event",
          summary: "safe summary",
        }),
      ],
      blockers: [{ id: "secret-blocker", message: "token sk-123456789 blocked" }],
      nextAction: "Do not expose chain-of-thought.",
    });
    const panel = buildSidebarPanel(snapshot, { density: "detail" });
    const output = renderSidebarPanel(panel);

    expect(output).toContain("Visible event");
    expect(output).not.toContain("developer-only raw event");
    expect(output).not.toContain("RAW_SECRET");
    expect(output).not.toContain("sk-123456789");
    expect(output).not.toContain("hidden reasoning");
    expect(output).not.toContain("chain-of-thought");
    expect(output).toContain("[REDACTED_SECRET]");
    expect(output).toContain("[REDACTED_REASONING]");
  });
});

function completeSnapshot() {
  return projectSidebarState({
    task: {
      routeId: "Route 91",
      title: "sidebar panel",
      objective: "Render an explicit terminal panel.",
    },
    editCloseout: { status: "ready", readiness: "read-only panel prototype" },
    compactInjectionState: {
      sessionScopeId: "session:test",
      injectionStatus: "pending",
      checkpointId: "checkpoint-panel",
      injectionCount: 0,
      supersededCheckpointIds: [],
      warnings: [],
      persistence: "none",
      providerCall: "none",
      evidence: ["test:compact"],
    },
    projectMemoryRecords: [{
      id: "pmr:active",
      version: 1,
      createdAt: "2026-05-17T00:00:00.000Z",
      candidateId: "pmc:active",
      candidateKind: "project-fact",
      retentionClass: "project-scoped-candidate",
      approvedAt: "2026-05-17T00:00:00.000Z",
      approvedBySourceCommand: "/memory",
      memoryText: "Project memory raw text must not appear.",
      evidence: ["test:memory"],
      source: "system-derived",
      routeReferences: ["route91"],
      safety: "safe",
      redactions: [],
    }],
    startupWarmHealth: {
      mode: "test-only",
      ok: true,
      writable: false,
      found: true,
      staleness: "fresh",
      detail: "Warm cache ready.",
      evidence: ["test:warmup"],
    },
    validation: {
      testsRun: ["sidebarPanelLayout.test.ts"],
      verifierResults: [{ command: "focused", status: "passed" }],
      buildStatus: "passed",
      resultContractStatus: "passed",
    },
    toolAvailability: {
      localCommands: [{ id: "sidebar", status: "available" }],
      mcpServers: [{ id: "playwright", status: "unknown" }],
      skills: [{ id: "visual-verdict", status: "deferred" }],
    },
    events: [
      createSidebarEvent({
        id: "memory-saved",
        kind: "memory",
        severity: "success",
        visibility: "user-visible",
        source: "memory",
        timestamp: "2026-05-17T00:00:00.000Z",
        title: "Memory saved",
        summary: "status: saved; raw content excluded",
      }),
    ],
    blockers: [{ id: "dynamic-discovery", message: "Dynamic discovery is out of scope." }],
    nextAction: "Run focused Route 91 tests.",
  });
}
