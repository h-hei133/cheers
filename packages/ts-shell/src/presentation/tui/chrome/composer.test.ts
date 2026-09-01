import { describe, expect, it } from "vitest";
import { composerTextWidth, renderComposer } from "./composer.js";
import { renderHints } from "./hints.js";
import { renderWelcome } from "./welcome.js";
import { Editor } from "../editor.js";
import { visibleWidth } from "../text/measure.js";
import { CURSOR_MARKER } from "../render/paint.js";

const idle = { busy: false, queued: 0 };

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

  it("pads every row to the full width", () => {
    const editor = new Editor();
    editor.insert("你好");
    for (const row of renderComposer(editor, idle, 40)) {
      expect(visibleWidth(row)).toBe(40);
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

  it("shows how many prompts are waiting behind a running turn", () => {
    const editor = new Editor();
    expect(renderComposer(editor, { busy: true, queued: 2 }, 40).join("")).toContain("2 queued");
  });
});

describe("hints", () => {
  it("offers completion controls while the list is open", () => {
    const row = renderHints({ busy: false, hasDraft: true, suggesting: true, multiline: false }, 80).join("");
    expect(row).toContain("tab complete");
  });

  it("offers interruption while a turn runs", () => {
    const row = renderHints({ busy: true, hasDraft: false, suggesting: false, multiline: false }, 80).join("");
    expect(row).toContain("esc interrupt");
  });

  it("offers send only once there is something to send", () => {
    const empty = renderHints({ busy: false, hasDraft: false, suggesting: false, multiline: false }, 80).join("");
    const drafted = renderHints({ busy: false, hasDraft: true, suggesting: false, multiline: false }, 80).join("");
    expect(empty).not.toContain("enter send");
    expect(drafted).toContain("enter send");
  });

  it("fits the width", () => {
    const row = renderHints({ busy: false, hasDraft: true, suggesting: false, multiline: true }, 24).join("");
    expect(visibleWidth(row)).toBeLessThanOrEqual(24);
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
