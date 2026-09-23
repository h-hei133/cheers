import { describe, expect, it } from "vitest";
import {
  extractFileFootprint,
  formatFileFootprintXml,
  mergeFileFootprints,
  parseFileFootprintXml,
} from "./fileFootprint.js";

/**
 * The footprint exists so the model does not re-read what it has already seen.
 * That only holds if it survives a compaction: a list describing just the
 * messages in front of the summarizer forgets everything read before the last
 * checkpoint, which is most of a long session.
 */

function assistantCall(name: string, args: Record<string, unknown>) {
  return {
    role: "assistant",
    tool_calls: [{ id: `call-${name}`, function: { name, arguments: JSON.stringify(args) } }],
  };
}

describe("extractFileFootprint", () => {
  it("separates files read from files changed", () => {
    const footprint = extractFileFootprint([
      assistantCall("read", { path: "src/a.ts" }),
      assistantCall("write", { path: "src/b.ts" }),
    ]);
    expect(footprint.readFiles).toEqual(["src/a.ts"]);
    expect(footprint.modifiedFiles).toEqual(["src/b.ts"]);
  });

  it("counts a changed file as changed only", () => {
    // Listing it under both headings says the same thing twice in a prompt that
    // is already tight for room.
    const footprint = extractFileFootprint([
      assistantCall("read", { path: "src/a.ts" }),
      assistantCall("edit", { path: "src/a.ts" }),
    ]);
    expect(footprint.readFiles).toEqual([]);
    expect(footprint.modifiedFiles).toEqual(["src/a.ts"]);
  });

  it("ignores a call that names no file", () => {
    expect(extractFileFootprint([assistantCall("bash", { command: "ls" })])).toEqual({
      readFiles: [],
      modifiedFiles: [],
    });
  });
});

describe("parseFileFootprintXml", () => {
  it("reads back what formatFileFootprintXml wrote", () => {
    const written = formatFileFootprintXml({
      readFiles: ["src/a.ts"],
      modifiedFiles: ["src/b.ts"],
    });
    expect(parseFileFootprintXml(written)).toEqual({
      readFiles: ["src/a.ts"],
      modifiedFiles: ["src/b.ts"],
    });
  });

  it("returns nothing for text that carries no footprint", () => {
    // An older checkpoint, a hand-edited one, or a truncated one. Losing
    // nothing that was not already lost.
    expect(parseFileFootprintXml(undefined)).toEqual({ readFiles: [], modifiedFiles: [] });
    expect(parseFileFootprintXml("just a summary")).toEqual({ readFiles: [], modifiedFiles: [] });
  });
});

describe("mergeFileFootprints", () => {
  it("keeps a file the earlier compaction saw", () => {
    // The whole point: after two compactions the list still names the file read
    // before the first one.
    const merged = mergeFileFootprints(
      { readFiles: ["early.ts"], modifiedFiles: [] },
      { readFiles: ["late.ts"], modifiedFiles: [] },
    );
    expect(merged.readFiles).toEqual(["early.ts", "late.ts"]);
  });

  it("lets a later change promote a file out of the read list", () => {
    const merged = mergeFileFootprints(
      { readFiles: ["a.ts"], modifiedFiles: [] },
      { readFiles: [], modifiedFiles: ["a.ts"] },
    );
    expect(merged.readFiles).toEqual([]);
    expect(merged.modifiedFiles).toEqual(["a.ts"]);
  });

  it("does not repeat a file seen by both", () => {
    const merged = mergeFileFootprints(
      { readFiles: ["a.ts"], modifiedFiles: ["b.ts"] },
      { readFiles: ["a.ts"], modifiedFiles: ["b.ts"] },
    );
    expect(merged.readFiles).toEqual(["a.ts"]);
    expect(merged.modifiedFiles).toEqual(["b.ts"]);
  });

  it("caps a list that would grow without bound", () => {
    // A long session touches hundreds of files, and a checkpoint naming all of
    // them spends the context it was written to save. The newest are kept.
    const many = Array.from({ length: 250 }, (_, index) => `file-${index}.ts`);
    const merged = mergeFileFootprints(
      { readFiles: [], modifiedFiles: [] },
      { readFiles: many, modifiedFiles: [] },
    );
    expect(merged.readFiles).toHaveLength(200);
    expect(merged.readFiles).toContain("file-249.ts");
    expect(merged.readFiles).not.toContain("file-0.ts");
  });

  it("ignores blank entries", () => {
    const merged = mergeFileFootprints(
      { readFiles: ["", "  "], modifiedFiles: [] },
      { readFiles: ["a.ts"], modifiedFiles: [] },
    );
    expect(merged.readFiles).toEqual(["a.ts"]);
  });
});
