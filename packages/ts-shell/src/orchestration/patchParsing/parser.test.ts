import { describe, expect, it } from "vitest";
import { parseApplyPatchText } from "./parser.js";

describe("parseApplyPatchText", () => {
  it("parses a single update operation without touching the filesystem", () => {
    const result = parseApplyPatchText(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@ function value",
        " const value = 1;",
        "-return value;",
        "+return value + 1;",
        "*** End Patch",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.operations).toHaveLength(1);
      const operation = result.patch.operations[0];
      expect(operation?.kind).toBe("update");
      if (operation?.kind === "update") {
        expect(operation.path).toBe("src/app.ts");
        expect(operation.hunks[0]?.changeContext).toBe("function value");
        expect(operation.hunks[0]?.lines.map((line) => line.kind)).toEqual([
          "context",
          "remove",
          "add",
        ]);
      }
    }
  });

  it("parses add, delete, and move operation shapes", () => {
    const result = parseApplyPatchText(
      [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+export const added = true;",
        "*** Delete File: src/old.ts",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.operations.map((operation) => operation.kind)).toEqual(
        ["add", "delete", "move"],
      );
      expect(result.patch.operations[0]).toMatchObject({
        kind: "add",
        path: "src/new.ts",
        content: "export const added = true;",
      });
      expect(result.patch.operations[1]).toMatchObject({
        kind: "delete",
        path: "src/old.ts",
      });
      expect(result.patch.operations[2]).toMatchObject({
        kind: "move",
        path: "src/from.ts",
        moveTo: "src/to.ts",
      });
    }
  });

  it("returns structured failure for missing begin/end markers", () => {
    const result = parseApplyPatchText("*** Update File: src/app.ts");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("patch-parse-invalid-format");
      expect(result.failure.nextAction).toContain("begin/end");
    }
  });

  it("returns structured failure for empty patches", () => {
    const result = parseApplyPatchText(
      ["*** Begin Patch", "*** End Patch"].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("patch-parse-empty");
      expect(result.failure.nextAction).toContain("at least one");
    }
  });

  it("returns structured failure for unsupported operation lines", () => {
    const result = parseApplyPatchText(
      [
        "*** Begin Patch",
        "*** Rename File: src/a.ts -> src/b.ts",
        "*** End Patch",
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("patch-parse-unsupported-operation");
      expect(result.failure.nextAction).toContain("Add File");
    }
  });

  it("rejects malformed update hunks before any verification or apply phase", () => {
    const result = parseApplyPatchText(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "no hunk marker",
        "*** End Patch",
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("patch-parse-invalid-format");
      expect(result.failure.nextAction).toContain("@@ hunk");
    }
  });
});
