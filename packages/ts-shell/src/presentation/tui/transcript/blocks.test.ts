import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderBlock, textBlock } from "./blocks.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { defaultTheme } from "../../theme/theme.js";
import { getDefaultTheme } from "../../themes/index.js";

// Color assertions run under an explicit capability, independent of NO_COLOR.
const originalColorMode = defaultTheme.colorMode;
beforeEach(() => defaultTheme.apply(getDefaultTheme(), "256"));
afterEach(() => defaultTheme.apply(getDefaultTheme(), originalColorMode));

const WIDTH = 40;

describe('thinking expansion hints', () => {
  it('shows the admitted keyboard shortcut alongside elapsed thinking time', () => {
    const block = { kind: 'thinking' as const, text: 'hidden reasoning', collapsed: true, finalized: true, elapsedMs: 1500 };
    const rows = renderBlock(block, WIDTH, { thinkingShortcut: 'ctrl+t' }).map(stripAnsi);
    expect(rows[0]).toBe('● thought 1.5s · ctrl+t to expand');
    expect(rows.join('\n')).not.toContain('click');
    expect(rows.join('\n')).not.toContain('hidden reasoning');
  });

  it('uses a rebound key and suppresses shortcut hints when none is admitted', () => {
    const block = { kind: 'thinking' as const, text: 'hidden reasoning', collapsed: true, finalized: true };
    expect(renderBlock(block, WIDTH, { thinkingShortcut: 'alt+t' }).map(stripAnsi).join('\n')).toContain('alt+t to expand');
    expect(renderBlock(block, WIDTH).map(stripAnsi)).toEqual(['● thought', '']);
    expect(renderBlock({ ...block, collapsed: false }, WIDTH, { thinkingShortcut: 'alt+t' }).map(stripAnsi).join('\n'))
      .toContain('hidden reasoning');
  });
});

describe("prompt echo", () => {
  it("paints the prompt as a full-width bubble", () => {
    // A shade that stops at the last character reads as a highlight, not as a
    // turn boundary; padding it to the frame width makes the prompt a board.
    const rows = renderBlock(textBlock("user", "hello"), WIDTH);
    expect(rows[0]).not.toContain("▌");
    expect(stripAnsi(rows[0]!)).toBe('hello' + ' '.repeat(WIDTH - 5));
    expect(rows[0]).toContain("\x1b[48;");
    expect(visibleWidth(rows[0]!)).toBe(WIDTH);
  });

  it('wraps against the whole width and retains source indentation without decoration', () => {
    const rows = renderBlock(textBlock('user', 'abcdefgh\n  中e\u0301👩‍💻'), 8).map(stripAnsi);
    expect(rows[0]).toBe('abcdefgh');
    expect(rows[1]).toBe('  中e\u0301👩‍💻 ');
  });

  it("wraps within the frame for wide characters too", () => {
    for (const row of renderBlock(textBlock("user", "\u4f60\u597d\u4e16\u754c".repeat(20)), WIDTH)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("restores the bubble background after nested colors and raw resets", () => {
    const nested = defaultTheme.bg("selectedBg", "inner");
    const [row] = renderBlock(textBlock("user", `${nested} after\x1b[0m final`), WIDTH);
    const background = defaultTheme.bgOpen("userMessageBg");
    expect(row).toContain(`\x1b[49m${background}`);
    expect(row).toContain(`\x1b[0m${background}`);
    expect(stripAnsi(row!)).toContain("inner after final");
    expect(visibleWidth(row!)).toBe(WIDTH);
  });

  it("keeps the body and padding on one background without mid-row global resets", () => {
    const [row] = renderBlock(textBlock("user", "hello"), WIDTH);
    expect(row!.indexOf("\x1b[0m")).toBe(row!.length - "\x1b[0m".length);
    expect(stripAnsi(row!).endsWith(" ")).toBe(true);
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

describe("image attachments in the prompt echo", () => {
  const IMG = { type: "image" as const, data: "QUJD", mimeType: "image/png" };

  it("renders the inline sequence on a protocol terminal, unwrapped", () => {
    // The sequence is carried through wrapping intact — escape sequences hold
    // zero cells, so the wrap never splits them — and the row keeps its width
    // from the surrounding styling, not from the payload.
    const rows = renderBlock(
      { ...textBlock("user", "what is this?"), images: [IMG] },
      WIDTH,
      { imageProtocol: "kitty" },
    );
    const imageRows = rows.filter((row) => row.includes("\x1b_G"));
    expect(imageRows.length).toBe(1);
    expect(imageRows[0]).toContain("a=T,f=100,q=2");
    expect(imageRows[0]).toContain("QUJD");
    // The sequence carries an image id, without which a redraw in alt-screen
    // cannot place the image and resends the whole payload every frame.
    expect(imageRows[0]).toMatch(/\x1b_G(?:[^;]*,)?i=\d+/);
  });

  it("falls back to the placeholder token when no protocol speaks", () => {
    const rows = renderBlock(
      { ...textBlock("user", "what is this?"), images: [IMG] },
      WIDTH,
      { imageProtocol: undefined },
    );
    expect(rows.some((row) => row.includes("\x1b_G") || row.includes("1337"))).toBe(false);
    // The row still says what the image is, so the bubble is honest on a
    // terminal that cannot draw it.
    expect(rows.some((row) => row.includes("image/png"))).toBe(true);
  });
});
