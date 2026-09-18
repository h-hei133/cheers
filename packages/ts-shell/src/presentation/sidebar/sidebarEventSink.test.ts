import { describe, expect, it } from "vitest";
import {
  NOOP_SIDEBAR_EVENT_SINK,
  createSidebarEventSink,
} from "./sidebarEventSink.js";
import { createSidebarLiveEventStore } from "./sidebarLiveEventStore.js";

describe("sidebar event sink", () => {
  it("emits user-visible, developer-only, warning, and blocker events to the session store", () => {
    const store = createSidebarLiveEventStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "sink-event",
    });
    const sink = createSidebarEventSink({
      sessionScopeId: "session:sink",
      store,
    });

    sink.emitUserVisible({ title: "Command", summary: "completed" });
    sink.emitDeveloperOnly({ title: "Trace", summary: "debug only" });
    sink.emitWarning({ title: "Warning", summary: "watch this" });
    sink.emitBlocker({ title: "Blocker", summary: "blocked" });

    const visible = store.listRecent({ sessionScopeId: "session:sink" }).events;
    expect(visible.map((event) => event.title)).toEqual([
      "Command",
      "Warning",
      "Blocker",
    ]);
    expect(
      store.listRecent({
        sessionScopeId: "session:sink",
        includeDeveloperOnly: true,
      }).events.map((event) => event.title),
    ).toContain("Trace");
  });

  it("no-op sink is safe for default tests", () => {
    expect(() =>
      NOOP_SIDEBAR_EVENT_SINK.emitUserVisible({
        title: "Noop",
        summary: "ignored",
      }),
    ).not.toThrow();
  });
});
