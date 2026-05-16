import { describe, expect, it } from "vitest";
import { createSidebarEvent } from "./sidebarEventModel.js";
import { bridgeSidebarEvents } from "./sidebarEventBridge.js";

describe("sidebar event bridge", () => {
  it("bridges command, compact, memory, warmup, validation, edit, tool, warning, blocker, and route events", () => {
    const result = bridgeSidebarEvents({
      commandResults: [{ command: "/sidebar", outcome: "status", summary: "Rendered preview." }],
      compact: { checkpointId: "checkpoint-1", checkpointStatus: "created", injectionStatus: "pending" },
      memory: [
        { action: "review", status: "available", recordCount: 2 },
        { action: "recall", status: "results", recordCount: 1, query: "route" },
        { action: "use", status: "pending", recordCount: 1 },
      ],
      warmup: { outcome: "status", found: true, staleness: "fresh" },
      validation: [{ command: "rtk npm run build -w packages/ts-shell", status: "passed" }],
      edit: { changedFileCount: 3, failedFileCount: 0 },
      tools: [{ label: "Playwright MCP", status: "unknown" }],
      warnings: [{ id: "warn", message: "Keep output concise." }],
      blockers: [{ id: "block", message: "No UI in this route." }],
      route: { status: "in-progress", nextAction: "Run focused tests." },
    });

    expect(result.providerCall).toBe("none");
    expect(result.modelCall).toBe("none");
    expect(result.persistence).toBe("none");
    expect(result.events.map((event) => event.kind)).toEqual([
      "blocker",
      "command",
      "compact",
      "edit",
      "memory",
      "memory",
      "memory",
      "route",
      "tool",
      "validation",
      "warmup",
      "warning",
    ]);
    expect(result.events.some((event) => event.summary.includes("auto-injected: no"))).toBe(true);
  });

  it("redacts raw content, secrets, and hidden reasoning from bridged events", () => {
    const result = bridgeSidebarEvents({
      commandResults: [{
        command: "/test",
        outcome: "success",
        summary: "Finished with token sk-123456789 and hidden reasoning marker.",
        rawOutput: "RAW_SECRET raw event content",
      }],
      memory: [{
        action: "save",
        status: "blocked",
        rawMemoryText: "raw memory content with chain of thought",
      }],
    });

    const encoded = JSON.stringify(result.events);
    expect(encoded).not.toContain("sk-123456789");
    expect(encoded).not.toContain("RAW_SECRET");
    expect(encoded).not.toContain("hidden reasoning");
    expect(encoded).not.toContain("chain of thought");
    expect(result.events.flatMap((event) => event.redactions)).toContain("raw-event-content-excluded");
  });

  it("keeps deterministic ordering and applies the bridge event budget", () => {
    const result = bridgeSidebarEvents({
      maxEvents: 2,
      events: [
        createSidebarEvent({ kind: "route", severity: "info", visibility: "user-visible", source: "route", timestamp: "2026-05-16T00:00:00.000Z", title: "old", summary: "old" }),
        createSidebarEvent({ kind: "route", severity: "info", visibility: "user-visible", source: "route", timestamp: "2026-05-16T00:00:02.000Z", title: "new", summary: "new" }),
        createSidebarEvent({ kind: "route", severity: "info", visibility: "user-visible", source: "route", timestamp: "2026-05-16T00:00:01.000Z", title: "mid", summary: "mid" }),
      ],
    });

    expect(result.droppedEventCount).toBe(1);
    expect(result.events.map((event) => event.title)).toEqual(["mid", "new"]);
  });
});
