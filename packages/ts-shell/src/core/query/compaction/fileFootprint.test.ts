import { describe, expect, it } from "vitest";
import {
  extractFileFootprint,
  formatFileFootprintXml,
  mergeFileFootprints,
  parseFileFootprintXml,
} from "./fileFootprint.js";
import { formatCheckpointMessage } from "./summarizer.js";

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

  it("lists files in the order they were touched", () => {
    // Recency is what the cap keeps, so the order has to be the order things
    // happened. Sorting here would make "the newest 200" mean "the
    // alphabetically last 200" as soon as a list is read back and re-capped.
    const footprint = extractFileFootprint([
      assistantCall("read", { path: "z.ts" }),
      assistantCall("read", { path: "a.ts" }),
    ]);
    expect(footprint.readFiles).toEqual(["z.ts", "a.ts"]);
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

  it("keeps the newest across a second compaction, not the alphabetically last", () => {
    // The list is read back out of the checkpoint text before the next merge, so
    // this is what a long session actually does. Sorting on the way out makes the
    // cap drop files alphabetically, which is only the same as "oldest" until
    // someone touches a file whose name sorts early.
    const first = mergeFileFootprints(
      { readFiles: ["zzz.ts"], modifiedFiles: [] },
      { readFiles: Array.from({ length: 250 }, (_, i) => `a${String(i).padStart(3, "0")}.ts`), modifiedFiles: [] },
    );
    // zzz.ts was touched before every a-file, so it is the one to drop.
    expect(first.readFiles).not.toContain("zzz.ts");

    const second = mergeFileFootprints(
      parseFileFootprintXml(formatFileFootprintXml(first)),
      { readFiles: ["brand-new.ts"], modifiedFiles: [] },
    );
    // a000.ts is newer than zzz.ts, so it must survive where zzz.ts did not.
    expect(second.readFiles).toContain("brand-new.ts");
    expect(second.readFiles).toContain("a249.ts");
    expect(second.readFiles).not.toContain("a000.ts");
  });

  it("moves a file touched again to the recent end", () => {
    // A file read once long ago and read again now is recent, and a cap that
    // keeps the newest has to treat it that way rather than by its first sighting.
    // `early.ts` was seen before `other.ts`, then read again now, so it should
    // end up after it — the newest entry is last, which is the end the cap keeps.
    const merged = mergeFileFootprints(
      { readFiles: ["early.ts", "other.ts"], modifiedFiles: [] },
      { readFiles: ["early.ts"], modifiedFiles: [] },
    );
    expect(merged.readFiles).toEqual(["other.ts", "early.ts"]);
  });

  it("ignores blank entries", () => {
    const merged = mergeFileFootprints(
      { readFiles: ["", "  "], modifiedFiles: [] },
      { readFiles: ["a.ts"], modifiedFiles: [] },
    );
    expect(merged.readFiles).toEqual(["a.ts"]);
  });
});

describe("the checkpoint the model is handed", () => {
  it("says what the file lists are, because the paths do not carry their contents", () => {
    // A path with no explanation reads as a file the model already knows the
    // contents of — and the contents it would be recalling are the ones the
    // checkpoint just removed. The sentence is what makes the list a pointer
    // rather than a false memory.
    const checkpoint = formatCheckpointMessage(
      "the summary",
      formatFileFootprintXml({ readFiles: ["src/a.ts"], modifiedFiles: ["src/b.ts"] }),
    );

    expect(checkpoint).toContain("src/a.ts");
    expect(checkpoint).toContain("src/b.ts");
    expect(checkpoint).toMatch(/contents are not included/i);
    expect(checkpoint).toMatch(/read a file again/i);
  });

  it("adds no such sentence when there is no footprint", () => {
    // Nothing to explain, and a sentence about absent lists is noise in a prompt
    // that was just condensed to save room.
    const checkpoint = formatCheckpointMessage("the summary");

    expect(checkpoint).toContain("the summary");
    expect(checkpoint).not.toMatch(/contents are not included/i);
  });

  it("keeps the summary and the lists together", () => {
    const checkpoint = formatCheckpointMessage(
      "what happened",
      formatFileFootprintXml({ readFiles: ["a.ts"], modifiedFiles: [] }),
    );

    expect(checkpoint).toContain("what happened");
    expect(checkpoint.indexOf("what happened")).toBeLessThan(checkpoint.indexOf("a.ts"));
  });
});
