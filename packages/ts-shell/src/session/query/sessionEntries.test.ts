import { describe, expect, it } from "vitest";
import { readSessionEntries, readSessionTree } from "./sessionEntries.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { SessionThreadEntry } from "../schema/sessionThread.js";

/**
 * The contract a client outside this process depends on.
 *
 * Both readers exist so a client does not have to know the directory layout or the
 * line format. The cases that matter are therefore about the contract rather than
 * the data: a cursor means one thing, an unknown cursor means another, and a tree
 * with a broken link still has to account for every entry.
 */

function message(id: string, content: string): TranscriptEvent {
  return { type: "message", id, role: "user", content, timestamp: "2026-09-24T00:00:00.000Z" };
}

const EVENTS: TranscriptEvent[] = [
  message("e1", "first"),
  { type: "lifecycle", id: "e2", event: "run-started", timestamp: "2026-09-24T00:00:01.000Z" },
  message("e3", "second"),
  message("e4", "third"),
];

describe("entries after a cursor", () => {
  it("returns everything when there is no cursor", () => {
    const result = readSessionEntries(EVENTS, "e4");
    expect(result).not.toBe("unknown-cursor");
    if (result === "unknown-cursor") return;
    expect(result.entries.map((entry) => entry.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(result.leafId).toBe("e4");
  });

  it("returns only what came after the cursor", () => {
    // Exclusive, so a client that passes the last id it handled does not see it
    // again. "Strictly after" is the difference between a client making progress
    // and one reprocessing the same entry forever.
    const result = readSessionEntries(EVENTS, "e4", "e2");
    if (result === "unknown-cursor") throw new Error("unexpected");
    expect(result.entries.map((entry) => entry.id)).toEqual(["e3", "e4"]);
  });

  it("returns nothing when the cursor is the last entry", () => {
    const result = readSessionEntries(EVENTS, "e4", "e4");
    if (result === "unknown-cursor") throw new Error("unexpected");
    expect(result.entries).toEqual([]);
    expect(result.leafId).toBe("e4");
  });

  it("refuses a cursor that is not in this session", () => {
    // An empty result would mean "nothing new"; a cursor from elsewhere means
    // "starting here would silently skip everything in between". Opposite things,
    // so they cannot share an answer.
    expect(readSessionEntries(EVENTS, "e4", "nope")).toBe("unknown-cursor");
  });

  it("skips entries with no id rather than inventing one", () => {
    // An id is the cursor. An entry without one cannot be pointed at, so including
    // it would make the cursor ambiguous.
    const withoutId: TranscriptEvent[] = [
      message("e1", "first"),
      { type: "message", role: "user", content: "no id", timestamp: "2026-09-24T00:00:02.000Z" },
      message("e3", "third"),
    ];
    const result = readSessionEntries(withoutId, "e3");
    if (result === "unknown-cursor") throw new Error("unexpected");
    expect(result.entries.map((entry) => entry.id)).toEqual(["e1", "e3"]);
  });

  it("reports a null leaf for a session with none", () => {
    const result = readSessionEntries([], null);
    if (result === "unknown-cursor") throw new Error("unexpected");
    expect(result.leafId).toBeNull();
    expect(result.entries).toEqual([]);
  });
});

function threadEntry(id: string, parentId: string | undefined, order: number): SessionThreadEntry {
  return { id, parentId, kind: "turn-message", role: "user", order };
}

describe("the session tree", () => {
  const linear = [threadEntry("a", undefined, 1), threadEntry("b", "a", 2), threadEntry("c", "b", 3)];

  it("links children to their parent", () => {
    const tree = readSessionTree(linear);
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.entry.id).toBe("a");
    expect(tree[0]!.children.map((node) => node.entry.id)).toEqual(["b"]);
    expect(tree[0]!.children[0]!.children.map((node) => node.entry.id)).toEqual(["c"]);
  });

  it("keeps both sides of a branch", () => {
    // The point of returning a tree rather than a path: a client asking what the
    // session contains wants the abandoned branch too.
    const branched = [
      threadEntry("a", undefined, 1),
      threadEntry("b", "a", 2),
      threadEntry("c", "a", 3),
    ];
    const tree = readSessionTree(branched);
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree[0]!.children.map((node) => node.entry.id)).toEqual(["b", "c"]);
  });

  it("keeps an orphan as a root rather than dropping it", () => {
    // A parent chain that no longer resolves must not make the entry invisible:
    // an entry silently omitted is worse than one shown in the wrong place.
    const orphaned = [threadEntry("b", "missing", 2), threadEntry("a", undefined, 1)];
    const tree = readSessionTree(orphaned);
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree.map((node) => node.entry.id).sort()).toEqual(["a", "b"]);
  });

  it("narrows to a subtree when given a cursor", () => {
    const branched = [
      threadEntry("a", undefined, 1),
      threadEntry("b", "a", 2),
      threadEntry("c", "a", 3),
    ];
    const tree = readSessionTree(branched, "c");
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree.map((node) => node.entry.id)).toEqual(["c"]);
  });

  it("refuses a cursor that is not in this session", () => {
    expect(readSessionTree(linear, "nope")).toBe("unknown-cursor");
  });

  it("orders siblings by append order", () => {
    const outOfOrder = [
      threadEntry("a", undefined, 1),
      threadEntry("later", "a", 9),
      threadEntry("earlier", "a", 2),
    ];
    const tree = readSessionTree(outOfOrder);
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree[0]!.children.map((node) => node.entry.id)).toEqual(["earlier", "later"]);
  });

  it("returns an empty list for a session with no entries", () => {
    expect(readSessionTree([])).toEqual([]);
  });

  it("treats an entry that names itself as its parent as a root", () => {
    // Walking the tree must terminate. Making the entry its own child would make
    // the walk below recurse until the stack ran out.
    const selfParented = [threadEntry("a", "a", 1), threadEntry("b", "a", 2)];
    const tree = readSessionTree(selfParented);
    if (tree === "unknown-cursor") throw new Error("unexpected");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.entry.id).toBe("a");
    expect(tree[0]!.children.map((node) => node.entry.id)).toEqual(["b"]);
  });
});
