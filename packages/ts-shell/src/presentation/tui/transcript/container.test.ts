import { describe, expect, it } from "vitest";
import { Transcript } from "./container.js";
import { textBlock } from "./blocks.js";

const WIDTH = 40;

function withBlocks(...texts: string[]): Transcript {
  const transcript = new Transcript();
  for (const text of texts) transcript.append(textBlock("notice", text));
  return transcript;
}

describe("rendering", () => {
  it("renders every block, in order", () => {
    const rows = withBlocks("first", "second").render(WIDTH).rows.join("\n");

    expect(rows.indexOf("first")).toBeLessThan(rows.indexOf("second"));
  });

  it("keeps everything, since the surface decides what is on screen", () => {
    const transcript = withBlocks(...Array.from({ length: 50 }, (_, index) => `row ${index}`));
    const rows = transcript.render(WIDTH).rows.join("\n");

    expect(rows).toContain("row 0");
    expect(rows).toContain("row 49");
  });

  it("renders nothing for an empty transcript", () => {
    expect(new Transcript().render(WIDTH).rows).toEqual([]);
  });

  it("reports how many rows it occupies", () => {
    const transcript = withBlocks("one");

    expect(transcript.rowCount(WIDTH)).toBe(transcript.render(WIDTH).rows.length);
  });
});

describe("finding the block behind a row", () => {
  it("names the block every row came from", () => {
    const transcript = withBlocks("first", "second");
    const { rows, owners } = transcript.render(WIDTH);
    const secondRow = rows.findIndex((row) => row.includes("second"));

    expect(transcript.blockAt(owners[secondRow]!)?.text).toBe("second");
  });

  it("has no block for a row index that does not exist", () => {
    expect(withBlocks("only").blockAt(9)).toBeUndefined();
  });
});

describe("re-rendering", () => {
  it("reflows to a new width", () => {
    const transcript = withBlocks("a sentence long enough to wrap at a narrow width");

    expect(transcript.render(20).rows.length).toBeGreaterThan(transcript.render(80).rows.length);
  });

  it("reflects a change to a block that is still live", () => {
    const transcript = new Transcript();
    const block = transcript.append({ kind: "assistant", text: "partial", finalized: false });
    expect(transcript.render(WIDTH).rows.join("\n")).toContain("partial");

    block.text = "complete";
    expect(transcript.render(WIDTH).rows.join("\n")).toContain("complete");
  });

  it("marks every block finished, which is what makes rendering cacheable", () => {
    const transcript = new Transcript();
    transcript.append({ kind: "assistant", text: "streaming", finalized: false });
    transcript.finalizeAll();

    expect(transcript.last()?.finalized).toBe(true);
  });
});

describe("the newest blocks", () => {
  it("returns them newest first, for a chooser", () => {
    const recent = withBlocks("older", "newer").recent(5);

    expect(recent.map((block) => block.text)).toEqual(["newer", "older"]);
  });

  it("is bounded by the limit asked for", () => {
    expect(withBlocks("a", "b", "c").recent(2)).toHaveLength(2);
  });
});

describe("clearing", () => {
  it("forgets everything", () => {
    const transcript = withBlocks("gone");
    transcript.clear();

    expect(transcript.render(WIDTH).rows).toEqual([]);
    expect(transcript.last()).toBeUndefined();
  });
});
