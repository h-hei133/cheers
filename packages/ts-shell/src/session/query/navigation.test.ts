import { describe, expect, it } from "vitest";
import { projectSessionNavigation } from "./navigation.js";
import { readSessionTree } from "./sessionEntries.js";
import { sessionThreadPath, type SessionThreadSnapshot } from "../schema/sessionThread.js";

describe("session navigation projection", () => {
  it("shows damaged entries without granting navigation through repaired display edges", () => {
    const thread: SessionThreadSnapshot = {
      schemaVersion: 1, branches: [], compactions: [], activeLeafId: "safe",
      entries: [
        { id: "root", kind: "session-root", order: 0 },
        { id: "safe", parentId: "root", kind: "turn-message", role: "user", order: 1 },
        { id: "a", parentId: "b", kind: "turn-message", role: "user", order: 2 },
        { id: "b", parentId: "a", kind: "turn-message", role: "user", order: 3 },
        { id: "orphan", parentId: "missing", kind: "turn-message", role: "user", order: 4 },
        { id: "self", parentId: "self", kind: "turn-message", role: "user", order: 5 },
      ],
    };
    const before = structuredClone(thread);
    const points = projectSessionNavigation(thread, thread.entries.map((entry) => ({
      id: entry.id, role: "user", content: entry.id,
    })));
    expect(readSessionTree(thread.entries)).not.toEqual([]);
    expect(points.map((point) => point.entryId)).toEqual(["root", "safe", "a", "b", "orphan", "self"]);
    for (const point of points) {
      expect(point.unavailable === undefined).toBe(sessionThreadPath(thread, point.entryId).resolved);
    }
    expect(points.find((point) => point.entryId === "safe")).toMatchObject({ current: true, depth: 1 });
    expect(thread).toEqual(before);
  });

  it("marks an unreadable message unavailable and preserves full user text for editing", () => {
    const points = projectSessionNavigation({
      schemaVersion: 1, branches: [], compactions: [], activeLeafId: "missing",
      entries: [
        { id: "u", kind: "turn-message", role: "user", order: 0 },
        { id: "missing", parentId: "u", kind: "turn-message", role: "assistant", order: 1 },
      ],
    }, [{ id: "u", role: "user", content: "First line\n  second line" }]);
    expect(points[0]).toMatchObject({ label: "user: First line second line", prompt: "First line\n  second line" });
    expect(points[1]?.unavailable).toBe("message unavailable");
  });
});
