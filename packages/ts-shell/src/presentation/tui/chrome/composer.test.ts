import { describe, expect, it } from "vitest";
import { composerTextWidth, renderComposer } from "./composer.js";
import { newlineKeyFor, renderHints } from "./hints.js";
import { renderWelcome } from "./welcome.js";
import { Editor } from "../editor.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { CURSOR_MARKER } from "../render/paint.js";

const idle = { busy: false };

describe("prompt block", () => {
  it("marks the first row with the prompt cue and indents continuations", () => {
    const editor = new Editor();
    editor.insert("line1");
    editor.newline();
    editor.insert("line2");
    const rows = renderComposer(editor, idle, 40);
    expect(rows[0]).toContain("╰─");
    expect(rows[1]).not.toContain("╰─");
  });

  it("emits no trailing padding, so a copied region has no runs of spaces", () => {
    const editor = new Editor();
    editor.insert("你好");
    for (const row of renderComposer(editor, idle, 40)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(40);
      expect(stripAnsi(row)).toBe(stripAnsi(row).trimEnd());
    }
  });

  it("carries the cursor marker through for the renderer to place", () => {
    const editor = new Editor();
    editor.insert("hi");
    expect(renderComposer(editor, idle, 40).join("")).toContain(CURSOR_MARKER);
  });

  it("reserves the cue width from the text budget", () => {
    expect(composerTextWidth(40)).toBe(37);
  });

});

const quiet = { busy: false, suggesting: false, cancelArmed: false, queued: 0, newlineKey: "shift+enter" };
const nothing = { openTodos: 0, peerSessions: 0 };

describe("the row under the prompt", () => {
  it("is omitted entirely when there is nothing to say", () => {
    // An idle prompt with no pending work should not spend a screen row on filler.
    expect(renderHints(quiet, nothing, 80)).toEqual([]);
  });

  it("shows ambient facts that have a real source", () => {
    const row = renderHints(quiet, { openTodos: 3, peerSessions: 1 }, 80).join("");
    expect(row).toContain("3 open todos");
    expect(row).toContain("1 other session");
  });

  it("singularises counts of one", () => {
    const row = renderHints(quiet, { openTodos: 1, peerSessions: 0 }, 80).join("");
    expect(row).toContain("1 open todo");
    expect(row).not.toContain("todos");
  });

  it("lets a transient hint displace ambient facts", () => {
    const row = renderHints({ ...quiet, suggesting: true }, { openTodos: 3, peerSessions: 0 }, 80).join("");
    expect(row).toContain("tab complete");
    expect(row).not.toContain("open todo");
  });

  it("puts the exit confirmation above everything else", () => {
    const row = renderHints(
      { ...quiet, suggesting: true, cancelArmed: true },
      { openTodos: 3, peerSessions: 0 },
      80,
    ).join("");
    expect(row).toContain("ctrl+c again");
  });

  it("says what a queued prompt is waiting for", () => {
    const row = renderHints({ ...quiet, busy: true, queued: 2 }, nothing, 80).join("");
    expect(row).toContain("2 queued");
  });

  it("offers interruption while a turn runs", () => {
    expect(renderHints({ ...quiet, busy: true }, nothing, 80).join("")).toContain("esc interrupt");
  });

  it("fits the width", () => {
    const row = renderHints(quiet, { openTodos: 12, peerSessions: 4 }, 24).join("");
    expect(visibleWidth(row)).toBeLessThanOrEqual(24);
  });
});

describe("newline key", () => {
  it("advertises shift+enter only when a protocol can report it", () => {
    expect(newlineKeyFor("enhanced")).toBe("shift+enter");
    expect(newlineKeyFor("modify-other-keys")).toBe("shift+enter");
  });

  it("falls back to the key every terminal can express", () => {
    expect(newlineKeyFor("legacy")).toBe("ctrl+j");
  });
});

describe("welcome", () => {
  it("names the model and the working directory", () => {
    const rows = renderWelcome({ model: "opus-5", directory: "~/project", branch: "main" }, 60).join("\n");
    expect(rows).toContain("opus-5");
    expect(rows).toContain("~/project");
    expect(rows).toContain("main");
  });

  it("shortens a long path from the middle rather than overflowing", () => {
    const rows = renderWelcome({ model: "m", directory: "/very/long/".repeat(12) }, 40);
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(40);
  });

  it("adds a resume hint only when a session can be resumed", () => {
    expect(renderWelcome({ model: "m", directory: "d" }, 60)).toHaveLength(2);
    expect(renderWelcome({ model: "m", directory: "d", resumeHint: "/resume" }, 60)).toHaveLength(3);
  });
});
