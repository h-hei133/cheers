import { describe, expect, it } from "vitest";
import { parseSidebarLivePanelCommandArgs } from "./sidebarLivePanelCommandContract.js";
import { runSidebarLivePanelCommand } from "./sidebarLivePanelCommandRunner.js";
import { checkSidebarLivePanelQuality } from "./sidebarLivePanelQuality.js";
import { renderSidebarLivePanelFrame } from "./sidebarLivePanelRenderer.js";
import { createSidebarLivePanelRuntime } from "./sidebarLivePanelRuntime.js";
import { createSidebarLiveEventStore } from "./sidebarLiveEventStore.js";
import { projectSidebarState } from "./sidebarStateProjection.js";

describe("sidebar live panel runtime", () => {
  it("produces deterministic bounded frames from the session event store", () => {
    const store = createSidebarLiveEventStore({
      now: () => "2026-05-17T01:00:00.000Z",
      nextId: () => "event-1",
    });
    store.append({
      sessionScopeId: "session:live-panel",
      event: {
        kind: "memory",
        severity: "success",
        visibility: "user-visible",
        source: "memory",
        title: "Memory use staged",
        summary: "status: pending; raw content excluded",
        nextAction: "Continue with explicit future-turn injection only.",
      },
    });
    const runtime = createSidebarLivePanelRuntime({
      snapshot: projectSidebarState({
        task: { title: "live panel", objective: "Render watch frames." },
        nextAction: "Inspect live frame.",
      }),
      sessionScopeId: "session:live-panel",
      eventStore: store,
      now: () => "2026-05-17T01:00:01.000Z",
      maxFrameHistory: 1,
    });

    const first = runtime.tick();
    store.append({
      sessionScopeId: "session:live-panel",
      event: {
        id: "event-2",
        kind: "tool",
        severity: "warning",
        visibility: "user-visible",
        source: "tool-availability",
        timestamp: "2026-05-17T01:00:02.000Z",
        title: "Tool warning",
        summary: "status: blocked until explicit approval",
      },
    });
    const second = runtime.tick({ updatedAt: "2026-05-17T01:00:03.000Z" });

    expect(first.frameNumber).toBe(1);
    expect(second.frameNumber).toBe(2);
    expect(second.metadata.eventCount).toBe(2);
    expect(second.metadata.warningCount).toBe(1);
    expect(runtime.frames()).toHaveLength(1);
    expect(runtime.frames()[0]?.frameNumber).toBe(2);
    expect(second.evidence).toContain("sidebar-live-panel-runtime:no-indefinite-loop");
  });

  it("renders frame metadata and passes live quality checks", () => {
    const store = createSidebarLiveEventStore({
      now: () => "2026-05-17T02:00:00.000Z",
    });
    store.appendMany({
      sessionScopeId: "session:quality",
      events: [
        {
          kind: "command",
          severity: "success",
          visibility: "user-visible",
          source: "slash-command",
          title: "Compact checkpoint",
          summary: "status: generated; provider/model call none",
        },
        {
          kind: "blocker",
          severity: "blocked",
          visibility: "user-visible",
          source: "route",
          title: "Route blocker",
          summary: "watch remains bounded; no lifecycle rewrite",
        },
        {
          kind: "warning",
          severity: "warning",
          visibility: "developer-only",
          source: "route",
          title: "developer-only raw event",
          summary: "hidden by default",
        },
      ],
    });
    const runtime = createSidebarLivePanelRuntime({
      snapshot: projectSidebarState({
        task: { title: "quality", objective: "Check live panel quality." },
        nextAction: "Keep watch output bounded.",
      }),
      sessionScopeId: "session:quality",
      eventStore: store,
      density: "compact",
      now: () => "2026-05-17T02:00:01.000Z",
    });
    const frame = runtime.tick();
    const output = renderSidebarLivePanelFrame(frame);
    const quality = checkSidebarLivePanelQuality({ frame, renderedOutput: output });

    expect(output).toContain("Sidebar live/watch preview");
    expect(output).toContain("[Live frame]");
    expect(output).toContain("Frame: #1");
    expect(output).toContain("Events: visible 2; stored 3");
    expect(output).toContain("Route blocker");
    expect(output).toContain("Developer-only sidebar events are hidden by default.");
    expect(output).not.toContain("developer-only raw event");
    expect(output.split("\n").length).toBeLessThanOrEqual(frame.panel.budget.maxLines);
    expect(quality.qualityStatus).toBe("pass");
    expect(quality.checks.watchOutputBounded).toBe("pass");
    expect(quality.checks.blockersWarningsVisible).toBe("pass");
  });

  it("redacts raw content, secrets, and hidden reasoning from live output", () => {
    const store = createSidebarLiveEventStore({
      now: () => "2026-05-17T03:00:00.000Z",
    });
    store.append({
      sessionScopeId: "session:redaction",
      event: {
        kind: "tool",
        severity: "warning",
        visibility: "user-visible",
        source: "tool-availability",
        title: "Tool status",
        summary: "raw event content includes sk-testsecret123 and hidden reasoning",
        rawContent: "RAW_SECRET_CONTENT with chain of thought",
      },
    });
    const runtime = createSidebarLivePanelRuntime({
      snapshot: projectSidebarState({
        task: { title: "redaction", objective: "Protect live output." },
      }),
      sessionScopeId: "session:redaction",
      eventStore: store,
      now: () => "2026-05-17T03:00:01.000Z",
    });
    const frame = runtime.tick();
    const output = renderSidebarLivePanelFrame(frame);
    const quality = checkSidebarLivePanelQuality({ frame, renderedOutput: output });

    expect(output).toContain("[REDACTED_RAW_CONTENT]");
    expect(output).toContain("[REDACTED_SECRET]");
    expect(output).toContain("[REDACTED_REASONING]");
    expect(output).not.toContain("sk-testsecret123");
    expect(output).not.toContain("RAW_SECRET_CONTENT");
    expect(output).not.toContain("hidden reasoning");
    expect(quality.checks.noRawContentLeak).toBe("pass");
    expect(quality.checks.noSecretLeak).toBe("pass");
    expect(quality.checks.noHiddenReasoningLeak).toBe("pass");
  });

  it("parses and runs the watch command as a bounded read-only command", () => {
    const parsed = parseSidebarLivePanelCommandArgs(["watch"]);
    expect(parsed.contract).toEqual({
      mode: "watch",
      density: "normal",
      frameCount: 1,
    });
    expect(parseSidebarLivePanelCommandArgs(["live"]).contract?.mode).toBe("watch");

    const result = runSidebarLivePanelCommand({
      snapshot: projectSidebarState({
        task: { title: "runner", objective: "Run watch command." },
        nextAction: "Keep /sidebar panel unchanged.",
      }),
      sessionScopeId: "session:runner",
      contract: parsed.contract!,
      now: () => "2026-05-17T04:00:00.000Z",
    });

    expect(result.output).toContain("Sidebar live/watch preview");
    expect(result.output).toContain("Live/watch preview: explicit bounded frames");
    expect(result.output).toContain("Frame: #1");
    expect(result.evidence).toContain("sidebar-live-panel-command-runner:no-provider-call");
    expect(result.evidence).toContain("sidebar-live-panel-command-runner:no-persistence");
  });
});
