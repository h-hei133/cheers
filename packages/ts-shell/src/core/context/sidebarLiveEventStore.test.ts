import { describe, expect, it } from "vitest";
import { createSidebarEvent } from "./sidebarEventModel.js";
import {
  SidebarEventSafetyError,
  createSidebarLiveEventStore,
} from "./sidebarLiveEventStore.js";

describe("sidebar live event store", () => {
  it("keeps events session-scoped and in memory only", () => {
    let index = 0;
    const store = createSidebarLiveEventStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => `event-${++index}`,
    });

    store.append({
      sessionScopeId: "session:one",
      event: {
        kind: "command",
        severity: "success",
        visibility: "user-visible",
        source: "slash-command",
        title: "Command one",
        summary: "completed",
      },
    });
    store.append({
      sessionScopeId: "session:two",
      event: {
        kind: "command",
        severity: "success",
        visibility: "user-visible",
        source: "slash-command",
        title: "Command two",
        summary: "completed",
      },
    });

    expect(store.listRecent({ sessionScopeId: "session:one" }).events).toEqual([
      expect.objectContaining({
        id: "event-1",
        title: "Command one",
        timestamp: "2026-05-16T00:00:00.000Z",
      }),
    ]);
    expect(store.listRecent({ sessionScopeId: "session:two" }).events).toEqual([
      expect.objectContaining({ id: "event-2", title: "Command two" }),
    ]);
  });

  it("caps normal events while preserving warning and blocker events", () => {
    let index = 0;
    const store = createSidebarLiveEventStore({
      maxEventsPerSession: 4,
      now: () => `2026-05-16T00:00:0${++index}.000Z`,
      nextId: () => `event-${index}`,
    });

    for (const title of ["one", "two", "three", "four", "five"]) {
      store.append({
        sessionScopeId: "session:budget",
        event: {
          kind: "command",
          severity: "info",
          visibility: "user-visible",
          source: "slash-command",
          title,
          summary: "normal",
        },
      });
    }
    store.append({
      sessionScopeId: "session:budget",
      event: {
        kind: "warning",
        severity: "warning",
        visibility: "user-visible",
        source: "route",
        title: "Warning",
        summary: "preserve this",
      },
    });

    const recent = store.listRecent({
      sessionScopeId: "session:budget",
      maxEvents: 3,
    });

    expect(recent.events.map((event) => event.title)).toContain("Warning");
    expect(recent.events).toHaveLength(3);
    expect(recent.droppedEventCount).toBe(1);
    expect(recent.totalStoredEventCount).toBe(4);
  });

  it("hides developer-only events unless explicitly requested", () => {
    const store = createSidebarLiveEventStore();
    store.append({
      sessionScopeId: "session:dev",
      event: createSidebarEvent({
        kind: "command",
        severity: "info",
        visibility: "developer-only",
        source: "slash-command",
        title: "Sidebar rendered",
        summary: "developer trace",
      }),
    });

    expect(store.listRecent({ sessionScopeId: "session:dev" }).events).toEqual([]);
    expect(
      store.listRecent({
        sessionScopeId: "session:dev",
        includeDeveloperOnly: true,
      }).events,
    ).toEqual([expect.objectContaining({ title: "Sidebar rendered" })]);
  });

  it("redacts raw content and rejects unsanitized forbidden ids", () => {
    const store = createSidebarLiveEventStore();
    const event = store.append({
      sessionScopeId: "session:redact",
      event: {
        kind: "memory",
        severity: "info",
        visibility: "user-visible",
        source: "memory",
        title: "Memory saved",
        summary: "token sk-testsecret1234567890 hidden reasoning RAW_SECRET",
        rawContent: "raw memory content should not be retained",
      },
    });

    expect(JSON.stringify(event)).not.toContain("sk-testsecret");
    expect(JSON.stringify(event)).not.toContain("hidden reasoning");
    expect(JSON.stringify(event)).not.toContain("RAW_SECRET");
    expect(event.redactions).toEqual(
      expect.arrayContaining([
        "secret-looking-token",
        "hidden-reasoning-label",
        "raw-marker",
        "raw-event-content-excluded",
      ]),
    );

    expect(() =>
      store.append({
        sessionScopeId: "session:redact",
        event: {
          id: "sk-unsafeid1234567890",
          kind: "command",
          severity: "info",
          visibility: "user-visible",
          source: "slash-command",
          title: "Unsafe",
          summary: "id still leaks",
        },
      }),
    ).toThrow(SidebarEventSafetyError);
  });
});
