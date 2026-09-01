import { describe, expect, it } from "vitest";
import { renderBlock, textBlock } from "./blocks.js";
import { visibleWidth } from "../text/measure.js";

const WIDTH = 40;

describe("prompt echo", () => {
  it("shades the full width so turn boundaries are findable when scrolling back", () => {
    const rows = renderBlock(textBlock("user", "hello"), WIDTH);
    expect(rows[0]).toContain("\x1b[48;5;236m");
    expect(visibleWidth(rows[0]!)).toBe(WIDTH);
  });

  it("shades every wrapped row to the same width", () => {
    const rows = renderBlock(textBlock("user", "a".repeat(120)), WIDTH);
    for (const row of rows.slice(0, -1)) expect(visibleWidth(row)).toBe(WIDTH);
  });

  it("keeps the shading exact for wide characters", () => {
    const rows = renderBlock(textBlock("user", "你好世界"), WIDTH);
    expect(visibleWidth(rows[0]!)).toBe(WIDTH);
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
