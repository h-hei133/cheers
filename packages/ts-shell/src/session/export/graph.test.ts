import { describe, expect, it } from "vitest";
import { projectExportTree } from "./graph.js";

const message = (id: string) => ({ id, role: "user", content: id, html: id });
const node = (id: string, order: number, parentId?: string) => ({ id, order, parentId, kind: "turn-message", role: "user" });

describe("export display graph", () => {
  it("flattens a long valid branch without recursive traversal or serialization", () => {
    const entries = Array.from({ length: 12000 }, (_, index) => node(`m${index}`, index, index > 0 ? `m${index - 1}` : undefined));
    const projected = projectExportTree({ entries, activeLeafId: "m11999" }, entries.map(entry => message(entry.id)));
    expect(projected.nodes).toHaveLength(12000);
    expect(projected.nodes.at(-1)?.depth).toBe(11999);
    expect(projected.warnings).toEqual([]);
    expect(() => JSON.stringify(projected)).not.toThrow();
  });

  it("exports repaired cycle edges instead of returning the damaged stored edges", () => {
    const entries = [node("a", 0, "b"), node("b", 1, "a")];
    const projected = projectExportTree({ entries, activeLeafId: "b" }, [message("a"), message("b")]);
    expect(projected.nodes.map(entry => [entry.id, entry.parentId])).toEqual([["a", undefined], ["b", "a"]]);
    expect(projected.warnings).toContain("Damaged branch links were repaired for display.");
    expect(entries[0]!.parentId).toBe("b");
  });

  it("reports an unavailable leaf and preserves unlinked transcript messages", () => {
    const projected = projectExportTree({ entries: [node("a", 0), node("missing", 1, "a")], activeLeafId: "gone" }, [message("a"), message("b")]);
    expect(projected.nodes.map(entry => entry.id)).toEqual(["a", "missing", "b"]);
    expect(projected.warnings).toEqual(expect.arrayContaining([
      "Some branch entries have no readable message.",
      "Some transcript messages could not be linked to a branch and are shown separately.",
      "The selected branch entry is unavailable.",
    ]));
  });
});
