import { describe, expect, it } from "vitest";
import { createSidebarEvent } from "./sidebarEventModel.js";
import { projectSidebarActivity } from "./sidebarActivityProjection.js";
import { projectSidebarState } from "./sidebarStateProjection.js";

describe("sidebar activity projection", () => {
  it("dedupes events, caps normal events, and preserves warning/blocker events over budget", () => {
    const snapshot = projectSidebarState({
      task: { title: "sidebar", objective: "test" },
      nextAction: "Review activity.",
    });
    const activity = projectSidebarActivity({
      snapshot,
      maxVisibleEvents: 3,
      events: [
        event("command", "info", "Command", "same", "2026-05-16T00:00:00.000Z"),
        event("command", "info", "Command", "same", "2026-05-16T00:00:01.000Z"),
        event("memory", "info", "Memory", "normal", "2026-05-16T00:00:02.000Z"),
        event("validation", "success", "Validation", "passed", "2026-05-16T00:00:03.000Z"),
        event("warning", "warning", "Warning", "preserve me", "2026-05-16T00:00:04.000Z"),
        event("blocker", "blocked", "Blocker", "preserve me", "2026-05-16T00:00:05.000Z"),
      ],
    });

    expect(activity.dedupedEventCount).toBe(1);
    expect(activity.events.map((item) => item.title)).toContain("Warning");
    expect(activity.events.map((item) => item.title)).toContain("Blocker");
    expect(activity.events.length).toBe(3);
    expect(activity.droppedEventCount).toBeGreaterThan(0);
  });

  it("hides developer-only events by default and preserves latest next action", () => {
    const snapshot = projectSidebarState({
      task: { title: "sidebar", objective: "test" },
      nextAction: "Fallback next action.",
    });
    const activity = projectSidebarActivity({
      snapshot,
      events: [
        createSidebarEvent({
          kind: "route",
          severity: "info",
          visibility: "developer-only",
          source: "route",
          title: "Developer detail",
          summary: "hidden by default",
        }),
        createSidebarEvent({
          kind: "route",
          severity: "info",
          visibility: "user-visible",
          source: "route",
          title: "Route",
          summary: "visible",
          nextAction: "Latest event next action.",
        }),
      ],
    });

    expect(activity.hasHiddenDeveloperEvents).toBe(true);
    expect(activity.events.some((item) => item.title === "Developer detail")).toBe(false);
    expect(activity.latestNextAction).toBe("Latest event next action.");
  });
});

function event(
  kind: Parameters<typeof createSidebarEvent>[0]["kind"],
  severity: Parameters<typeof createSidebarEvent>[0]["severity"],
  title: string,
  summary: string,
  timestamp: string,
) {
  return createSidebarEvent({
    kind,
    severity,
    visibility: "user-visible",
    source: kind === "command" ? "slash-command" : "route",
    timestamp,
    title,
    summary,
  });
}
