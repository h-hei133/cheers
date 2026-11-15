import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderBlock, textBlock } from "./blocks.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { defaultTheme } from "../../theme/theme.js";
import { getDefaultTheme } from "../../themes/index.js";
import { pngImage } from '../../../test-utils/image.js';
import { setCellDimensions } from '../imageDimensions.js';

// Color assertions run under an explicit capability, independent of NO_COLOR.
const originalColorMode = defaultTheme.colorMode;
beforeEach(() => defaultTheme.apply(getDefaultTheme(), "256"));
afterEach(() => { defaultTheme.apply(getDefaultTheme(), originalColorMode); setCellDimensions({ widthPx: 9, heightPx: 18 }); });

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

  it.each([true, false])("marks an unknown outcome with a warning question mark (collapsed=%s)", collapsed => {
    const rows = renderBlock({
      kind: "tool", title: "bash", text: "Outcome unknown", status: "unknown", collapsed, finalized: true,
    }, WIDTH);
    expect(rows[0]).toContain(defaultTheme.fg("warning", "?"));
    expect(stripAnsi(rows[0]!)).not.toMatch(/[✔✗◐]/);
    if (!collapsed) expect(rows.map(stripAnsi).join("\n")).toContain("Outcome unknown");
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
  const IMG = pngImage();

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
    expect(imageRows[0]).toContain(IMG.data);
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

  it("draws no blank board above a prompt that was only a picture", () => {
    const rows = renderBlock({ ...textBlock("user", ""), images: [IMG] }, WIDTH, { imageProtocol: undefined });
    // One row for the picture and the block separator; an empty prompt has no
    // words, and a full-width blank board would read as a stray gap.
    expect(rows.filter((row) => stripAnsi(row).trim() === "").length).toBe(1);
    expect(rows[0]).toContain("image attachment: image/png");
  });
});

describe("pictures a tool returned", () => {
  const IMG = pngImage();

  it("draws a screenshot result even while the card is folded", () => {
    // The picture is the result; folding the card's prose away must not hide it.
    const rows = renderBlock(
      { kind: "tool", title: "browser", text: "captured", status: "ok", collapsed: true, finalized: true, images: [IMG] },
      WIDTH,
      { imageProtocol: "kitty" },
    );
    expect(rows.filter((row) => row.includes("\x1b_G")).length).toBe(1);
  });

  it("names the picture on a terminal that cannot draw it", () => {
    const rows = renderBlock(
      { kind: "tool", title: "browser", text: "", status: "ok", collapsed: false, finalized: true, images: [IMG] },
      WIDTH,
      { imageProtocol: undefined },
    );
    expect(rows.some((row) => row.includes("\x1b_G"))).toBe(false);
    expect(rows.some((row) => row.includes("image result: image/png"))).toBe(true);
  });
});

describe('terminal image admission', () => {
  const png = pngImage();
  const gif = { type: 'image' as const, mimeType: 'image/gif', data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' };
  // Complete 320 × 160 lossless WebP, independently encoded and decoded with libwebp.
  const webp = { type: 'image' as const, mimeType: 'image/webp', data: 'UklGRiQAAABXRUJQVlA4TBcAAAAvP8EnAAcQUf/+BwQkif//UxH9T/vfPwA=' };
  const cases = [
    { name: 'unknown format', image: { ...png, mimeType: 'image/svg+xml' } },
    { name: 'invalid base64', image: { ...png, data: 'QUJD' } },
    { name: 'base64 escape injection', image: { ...png, data: `${png.data}\x1b[2J` } },
    { name: 'mismatched MIME', image: { ...png, mimeType: 'image/jpeg' } },
    { name: 'truncated PNG header', image: { ...png, data: Buffer.from(png.data, 'base64').subarray(0, 24).toString('base64') } },
    { name: 'oversized decoded image', image: (() => {
      const bytes = Buffer.from(png.data, 'base64');
      bytes.writeUInt32BE(5000, 16); bytes.writeUInt32BE(4000, 20);
      return { ...png, data: bytes.toString('base64') };
    })() },
  ];

  it.each(['user', 'tool'] as const)('refuses unknown or invalid graphics at the actual %s block boundary', kind => {
    for (const protocol of ['kitty', 'iterm2'] as const) {
      for (const { name, image } of cases) {
        const rows = renderBlock({ ...textBlock(kind, ''), title: 'read', images: [image] }, WIDTH, { imageProtocol: protocol });
        expect(rows.join('\n'), `${protocol}: ${name}`).not.toMatch(/\x1b_G|\x1b\]1337;/);
        expect(rows.map(stripAnsi).join('\n')).toContain(kind === 'user' ? 'image attachment:' : 'image result:');
      }
    }
  });

  it.each(['user', 'tool'] as const)('uses a text fallback for a non-PNG %s image on Kitty and preserves iTerm2 support', kind => {
    const block = { ...textBlock(kind, ''), title: 'read', images: [gif] };
    expect(renderBlock(block, WIDTH, { imageProtocol: 'kitty' }).join('\n')).not.toContain('\x1b_G');
    const iterm = renderBlock(block, WIDTH, { imageProtocol: 'iterm2' }).join('\n');
    expect(iterm).toContain('\x1b]1337;');
    expect(iterm).toContain(gif.data);
    expect(block.images[0]).toBe(gif);
  });

  it.each(['user', 'tool'] as const)('admits a complete WebP at the %s boundary and reserves its measured rows', kind => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const block = { ...textBlock(kind, ''), title: 'read', images: [webp], collapsed: true };
    const rows = renderBlock(block, WIDTH, { imageProtocol: 'iterm2' });
    expect(rows).toHaveLength((kind === 'user' ? 0 : 1) + 10 + 1);
    const graphics = rows.filter(row => row.includes('\x1b]1337;'));
    expect(graphics).toHaveLength(1);
    expect(graphics[0]).toContain('width=40;height=10:');
    expect(graphics[0]).toContain(webp.data);
    expect(rows.join('')).not.toContain('image/webp');
    const fallback = renderBlock(block, WIDTH, { imageProtocol: 'kitty' }).join('\n');
    expect(fallback).not.toMatch(/\x1b_G|\x1b\]1337;/);
    expect(stripAnsi(fallback)).toContain(`${kind === 'user' ? 'image attachment:' : 'image result:'} image/webp`);
    expect(block.images[0]).toBe(webp);
  });

  it.each(['user', 'tool'] as const)('refuses damaged WebP headers and decoded overflow at the %s boundary', kind => {
    const invalidSignature = Buffer.from(webp.data, 'base64');
    invalidSignature[20] = 0;
    const decodedOverflow = Buffer.from(webp.data, 'base64');
    decodedOverflow.writeUInt32LE((5000 - 1) | ((4000 - 1) << 14), 21);
    for (const image of [
      { ...webp, data: invalidSignature.toString('base64') },
      { ...webp, data: Buffer.from(webp.data, 'base64').subarray(0, 24).toString('base64') },
      { ...webp, data: decodedOverflow.toString('base64') },
      { ...webp, mimeType: 'image/png' },
    ]) {
      const rows = renderBlock({ ...textBlock(kind, ''), title: 'read', images: [image] }, WIDTH, { imageProtocol: 'iterm2' });
      expect(rows.join('')).not.toMatch(/\x1b_G|\x1b\]1337;/);
      expect(rows.map(stripAnsi).join('\n')).toContain(kind === 'user' ? 'image attachment:' : 'image result:');
    }
  });

  it.each(['user', 'tool'] as const)('does not emit terminal controls from a refused %s image MIME label', kind => {
    const control = '\x1b[2J';
    const block = { ...textBlock(kind, ''), title: 'read', images: [{ ...png, mimeType: `image/svg+xml${control}` }] };
    for (const imageProtocol of [undefined, 'kitty', 'iterm2'] as const) {
      const rows = renderBlock(block, WIDTH, { imageProtocol }).join('\n');
      expect(rows).not.toContain(control);
      expect(rows).not.toMatch(/\x1b_G|\x1b\]1337;/);
    }
  });
});

describe('terminal image row extent', () => {
  it.each(['user', 'tool'] as const)('reserves every cell row for a %s image on both protocols', kind => {
    const image = pngImage(320, 160);
    for (const imageProtocol of ['kitty', 'iterm2'] as const) {
      const block = { ...textBlock(kind, ''), title: 'read', images: [image], collapsed: true };
      const rows = renderBlock(block, 40, { imageProtocol });
      const prefix = kind === 'user' ? 0 : 1;
      expect(rows).toHaveLength(prefix + 10 + 1);
      const inline = rows.find(row => row.includes(imageProtocol === 'kitty' ? '\x1b_G' : '\x1b]1337;'))!;
      if (imageProtocol === 'kitty') expect(inline).toMatch(/(?:^|,)r=10(?:,|;)/);
      else expect(inline).toContain('height=10:');
      expect(rows.filter(row => row.includes(image.data))).toHaveLength(1);
    }
  });

  it('keeps tall images bounded and fits graphics inside a frame narrower than four columns', () => {
    for (const image of [pngImage(1, 5000), pngImage(320, 160)]) {
      const rows = renderBlock({ ...textBlock('user', ''), images: [image] }, 1, { imageProtocol: 'kitty' });
      const controls = /\x1b_G([^;]*);/.exec(rows.join(''))![1]!;
      expect(controls).toMatch(/(?:^|,)c=1(?:,|$)/);
      expect(rows.length).toBeLessThanOrEqual(49);
      expect(rows.every(row => visibleWidth(row) <= 1)).toBe(true);
    }
  });

  it.each(['kitty', 'iterm2'] as const)('paints the user background before %s graphics and anchors at the first column', imageProtocol => {
    const image = pngImage(320, 160);
    const rows = renderBlock({ ...textBlock('user', ''), images: [image] }, 40, { imageProtocol });
    const row = rows.find(row => row.includes(image.data))!;
    const end = row.indexOf(image.data) + image.data.length + (imageProtocol === 'kitty' ? 2 : 1);
    expect(stripAnsi(row.slice(end))).toBe('');
    expect(row.indexOf(' '.repeat(40))).toBeLessThan(row.indexOf(image.data));
    expect(row).toContain('\r' + (imageProtocol === 'kitty' ? '\x1b_G' : '\x1b7'));
  });
});
