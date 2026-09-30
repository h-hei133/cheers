import { afterEach, beforeEach, describe, expect, it } from "vitest";
import darkJson from "../../themes/dark.json" with { type: "json" };
import { defaultTheme } from "../../theme/theme.js";
import { Transcript } from "./container.js";
import { textBlock, type Block } from "./blocks.js";
import { getDefaultTheme } from "../../themes/index.js";

// Color assertions run under an explicit capability, independent of NO_COLOR.
const originalColorMode = defaultTheme.colorMode;
beforeEach(() => defaultTheme.apply(getDefaultTheme(), "256"));
afterEach(() => defaultTheme.apply(getDefaultTheme(), originalColorMode));

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

describe("folding a finished block", () => {
  function toolBlock(): Block {
    return {
      kind: "tool",
      title: "bash",
      detail: "npm test",
      text: "line one\nline two",
      status: "ok",
      collapsed: true,
      finalized: true,
    };
  }

  it("redraws the block instead of serving the rows from before", () => {
    const transcript = new Transcript();
    const block = transcript.append(toolBlock());
    expect(transcript.render(WIDTH).rows.join("\n")).toContain("click to expand");

    transcript.setCollapsed(block, false);

    // The rows are memoised per finished block, keyed by width alone. Mutating
    // `collapsed` in place changed the model and left the screen as it was, which
    // is why clicking a card appeared to do nothing.
    const opened = transcript.render(WIDTH).rows.join("\n");
    expect(opened).toContain("line two");
    expect(opened).not.toContain("click to expand");
  });

  it("folds it back again", () => {
    const transcript = new Transcript();
    const block = transcript.append(toolBlock());
    transcript.setCollapsed(block, false);
    transcript.setCollapsed(block, true);

    expect(transcript.render(WIDTH).rows.join("\n")).toContain("2 lines · click to expand");
  });

  it("still owns every row it grew into, so a click on the body lands on it", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "before"));
    const block = transcript.append(toolBlock());
    transcript.setCollapsed(block, false);
    const rendered = transcript.render(WIDTH);
    const bodyRow = rendered.rows.findIndex((row) => row.includes("line two"));

    expect(rendered.owners[bodyRow]).toBe(1);
  });
});

describe("recoloring after a theme change", () => {
  it("re-renders a finalized block when the palette moved", () => {
    // Rows for a finalized block are memoised, and a theme is recolored in place,
    // so a cache keyed only on width kept the scrollback in the old theme until
    // something happened to resize. `/reload` and `/theme` both change the
    // palette under a transcript that is already rendered.
    const transcript = new Transcript();
    transcript.append(textBlock("error", "colored text"));

    const before = transcript.render(WIDTH).rows.join("\n");
    // A palette with a visibly different error color, then back to the original.
    defaultTheme.apply({ ...darkJson, name: "probe-recolor", colors: { ...darkJson.colors, error: "#ff00ff" } });
    const after = transcript.render(WIDTH).rows.join("\n");
    defaultTheme.apply({ ...darkJson, name: "dark" });

    // Same width, same block, different palette: the rows must differ. Equal rows
    // here mean the memo returned the pre-change render.
    expect(after).not.toBe(before);
    expect(before).toContain("colored text");
    expect(after).toContain("colored text");
  });
});
