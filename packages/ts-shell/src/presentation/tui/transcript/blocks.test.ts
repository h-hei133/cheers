import { describe, expect, it } from "vitest";
import { renderBlock, textBlock } from "./blocks.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";

const WIDTH = 40;

describe("prompt echo", () => {
  it("marks the turn with a rail rather than a full-width shade", () => {
    // Shading has to pad every row to the frame width, and that padding is what
    // a terminal hands over when the user copies several rows at once.
    const rows = renderBlock(textBlock("user", "hello"), WIDTH);
    expect(rows[0]).toContain("\u258c");
    expect(rows[0]).not.toContain("48;5;236");
  });

  it("emits no trailing whitespace on any row", () => {
    const rows = renderBlock(textBlock("user", "a".repeat(120)), WIDTH);
    for (const row of rows.filter((candidate) => candidate.length > 0)) {
      expect(stripAnsi(row)).toBe(stripAnsi(row).trimEnd());
    }
  });

  it("wraps within the frame for wide characters too", () => {
    for (const row of renderBlock(textBlock("user", "\u4f60\u597d\u4e16\u754c".repeat(20)), WIDTH)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(WIDTH);
    }
  });
});

describe("tool invocation", () => {
  it("marks a running tool differently from a finished one", () => {
    const running = renderBlock({ kind: "tool", title: "read", text: "", status: "running", finalized: false }, WIDTH);
    const done = renderBlock({ kind: "tool", title: "read", text: "", status: "ok", finalized: true }, WIDTH);
    expect(running[0]).not.toBe(done[0]);
    expect(done[0]).toContain("✔");
  });

  it("marks a failure and shows why", () => {
    const rows = renderBlock(
      { kind: "tool", title: "bash", text: "exit status 1", status: "failed", finalized: true },
      WIDTH,
    ).join("\n");
    expect(rows).toContain("✗");
    expect(rows).toContain("exit status 1");
  });

  it("renders an attached diff", () => {
    const rows = renderBlock(
      { kind: "tool", title: "edit", text: "", diff: "-old\n+new", status: "ok", finalized: true },
      WIDTH,
    ).join("\n");
    expect(rows).toContain("old");
    expect(rows).toContain("new");
  });
});

describe("width discipline", () => {
  it("never emits a row wider than the frame", () => {
    const long = "word ".repeat(60);
    for (const kind of ["notice", "assistant", "command", "error"] as const) {
      for (const row of renderBlock(textBlock(kind, long, "title"), WIDTH)) {
        expect(visibleWidth(row)).toBeLessThanOrEqual(WIDTH);
      }
    }
  });

  it("wraps rather than truncating, so nothing is lost", () => {
    const rows = renderBlock(textBlock("assistant", "alpha beta gamma delta epsilon zeta"), 16).join("");
    expect(rows).toContain("epsilon");
    expect(rows).toContain("zeta");
  });
});
