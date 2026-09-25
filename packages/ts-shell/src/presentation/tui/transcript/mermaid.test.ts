import { afterEach, describe, expect, it } from "vitest";
import { DIAGRAM_LANGUAGE, diagramMode, renderDiagram, setDiagramMode } from "./mermaid.js";

/**
 * Diagrams in the transcript.
 *
 * What matters here is not that a diagram looks right — that is the library's
 * job and it is tested where it lives. It is that this never makes the
 * transcript worse: a diagram that cannot be drawn has to come back as the code
 * block it already was, and a drawing that is expensive has to be refused before
 * it costs anything rather than after.
 */

const CHART = "flowchart TD\n  A[Start] --> B[End]";

afterEach(() => setDiagramMode("streaming"));

describe("drawing a diagram", () => {
  it("returns rows of box-drawing characters", () => {
    const rows = renderDiagram(CHART, 80);
    expect(rows).toBeDefined();
    const plain = rows!.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(plain).toContain("Start");
    expect(plain).toContain("End");
    expect(plain).toMatch(/[┌└│─]/);
  });

  it("does not return the source it was given", () => {
    // The whole point is that the reader sees a picture rather than the code
    // that describes one.
    const rows = renderDiagram(CHART, 80);
    expect(rows!.join("")).not.toContain("flowchart");
  });

  it("colours its parts with tokens this renderer actually reads", () => {
    const rows = renderDiagram(CHART, 80)!.join("");
    // An escape sequence, so the diagram is not one flat colour.
    expect(rows).toMatch(/\x1b\[[0-9;]*m/);
  });
});

describe("a diagram that cannot be drawn", () => {
  it("is refused when the setting is off", () => {
    setDiagramMode("off");
    expect(renderDiagram(CHART, 80)).toBeUndefined();
    expect(diagramMode()).toBe("off");
  });

  it("is refused when it does not fit the space", () => {
    // Returning rows wider than the terminal would wrap the picture and destroy
    // the alignment it exists to show.
    expect(renderDiagram(CHART, 4)).toBeUndefined();
  });

  it("is refused when the source cannot be parsed", () => {
    expect(renderDiagram("flowchart TD\n  ???not a diagram", 80)).toBeUndefined();
  });

  it("is refused when there is nothing to draw", () => {
    expect(renderDiagram("", 80)).toBeUndefined();
    expect(renderDiagram("   \n  ", 80)).toBeUndefined();
  });

  it("is refused before it is attempted when the source is too large", () => {
    // Bounded before the call rather than after: the cost being avoided is the
    // call itself.
    const huge = `flowchart TD\n${"  A --> B\n".repeat(2000)}`;
    expect(renderDiagram(huge, 80)).toBeUndefined();
  });
});

describe("repeated rendering", () => {
  it("answers a repeated request without drawing again", () => {
    // Assistant text is re-rendered on every delta, so the same diagram arrives
    // many times while an answer streams. The cache is what keeps that from
    // being a drawing per keystroke.
    const first = renderDiagram(CHART, 80);
    const second = renderDiagram(CHART, 80);
    expect(second).toBe(first);
  });

  it("keeps a drawing made for a different width apart", () => {
    // The width is part of the question: a diagram that fits one terminal may
    // not fit another, and reusing the first answer would return rows that do
    // not fit.
    const wide = renderDiagram(CHART, 80);
    const narrow = renderDiagram(CHART, 12);
    expect(wide).not.toBe(narrow);
  });

  it("forgets its drawings when the setting changes", () => {
    // A cache keyed only by source would answer a request made under a new
    // setting with the previous setting's result.
    renderDiagram(CHART, 80);
    setDiagramMode("off");
    expect(renderDiagram(CHART, 80)).toBeUndefined();
    setDiagramMode("streaming");
    expect(renderDiagram(CHART, 80)).toBeDefined();
  });
});

describe("the fence language", () => {
  it("is the one a user writes", () => {
    // Named for the marker in the document rather than for this module, because
    // it is what the author typed and what the parser matches.
    expect(DIAGRAM_LANGUAGE).toBe("mermaid");
  });
});
