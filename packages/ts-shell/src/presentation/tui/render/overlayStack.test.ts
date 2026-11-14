import { describe, expect, it, vi } from "vitest";
import { parseKeyEvent } from "../input/keys.js";
import type { MouseReport } from "../input/mouse.js";
import { visibleWidth } from "../text/measure.js";
import { compositeTuiLine, OverlayStack, resolveOverlayLayout, type OverlayComponent } from "./overlayStack.js";
import { inlineImageRows, type ImageProtocol } from '../image.js';
import { pngImage } from '../../../test-utils/image.js';
import { setCellDimensions } from '../imageDimensions.js';
import { renderBlock } from '../transcript/blocks.js';
import { highlightSelection } from '../transcript/selection.js';

function makeOverlay(lines: readonly string[], label = "ov"): OverlayComponent & {
  keys: string[];
  pointers: MouseReport[];
  pastes: string[];
} {
  const keys: string[] = [];
  const pointers: MouseReport[] = [];
  const pastes: string[] = [];
  return {
    keys,
    pointers,
    pastes,
    render: (width) => lines.map((line) => `${label}:${line}`.slice(0, width)),
    handleKey: (event) => {
      keys.push(event.keyId);
      return true;
    },
    handlePointer: (report) => {
      pointers.push(report);
      return true;
    },
    handlePaste: (text) => {
      pastes.push(text);
      return true;
    },
  };
}

describe("resolveOverlayLayout", () => {
  it("positions all 9 anchors with percentage sizing and margins", () => {
    const topLeft = resolveOverlayLayout({ width: "50%", anchor: "top-left", margin: 2 }, 4, 80, 24);
    expect(topLeft).toMatchObject({ width: 40, row: 2, col: 2, maxHeight: undefined });

    const bottomRight = resolveOverlayLayout({ width: 20, anchor: "bottom-right", margin: { right: 3, bottom: 1 } }, 4, 80, 24);
    expect(bottomRight).toMatchObject({ width: 20, row: 19, col: 57, maxHeight: undefined });

    const centered = resolveOverlayLayout({ width: 20, anchor: "center", offsetX: 5, offsetY: -2 }, 4, 80, 24);
    expect(centered).toMatchObject({ width: 20, row: 8, col: 35, maxHeight: undefined });
  });

  it("clamps oversized overlays and explicit percentages inside margins", () => {
    const clamped = resolveOverlayLayout({ width: 200, maxHeight: "50%", row: "100%", col: "100%", margin: 1 }, 20, 40, 12);
    expect(clamped).toMatchObject({ width: 38, row: 5, col: 1, maxHeight: 6 });
  });

  it("clamps margins safely on tiny terminals", () => {
    const tiny = resolveOverlayLayout({ width: 10, margin: 4 }, 4, 6, 4);
    expect(tiny.col + tiny.width).toBeLessThanOrEqual(6);
    expect(tiny.row).toBeGreaterThanOrEqual(0);
  });
});

describe("compositeTuiLine", () => {
  it("resets SGR and OSC-8 hyperlinks at overlay edges and preserves base text", () => {
    const base = "\x1b[31m\x1b]8;;https://example.com\x07abcdefghij\x1b]8;;\x07\x1b[0m";
    const composited = compositeTuiLine(base, "XY", 3, 4, 10);
    expect(visibleWidth(composited)).toBe(10);
    expect(composited).toContain("\x1b[0m\x1b]8;;\x07XY  \x1b[0m\x1b]8;;\x07");
    expect(composited).toContain("abc");
    expect(composited).toContain("hij");
  });
  it("pads split double-width characters on right edge without shifting columns left", () => {
    const base = "ab界cd";
    const composited = compositeTuiLine(base, "X", 1, 2, 6);
    expect(visibleWidth(composited)).toBe(6);
    expect(composited).toContain("a\x1b[0m\x1b]8;;\x07X \x1b[0m\x1b]8;;\x07 cd");
  });

  it("leaves inline terminal image rows untouched", () => {
    const img = "\x1b_Ga=p,i=1;\x1b\\";
    expect(compositeTuiLine(img, "modal", 2, 5, 20)).toBe(img);
  });
});

describe("OverlayStack", () => {
  it("manages focus stack across push, middle hide, and nonCapturing overlays", () => {
    const changed = vi.fn();
    const stack = new OverlayStack(changed);
    const first = makeOverlay(["one"], "A");
    const second = makeOverlay(["two"], "B");
    const toast = makeOverlay(["toast"], "T");

    const h1 = stack.push(first, { width: 10 });
    const h2 = stack.push(second, { width: 10 });
    const hToast = stack.push(toast, { width: 12, anchor: "top-right", nonCapturing: true });

    expect(stack.getFocused()).toBe(second);
    expect(second.focused).toBe(true);
    expect(first.focused).toBe(false);
    expect(toast.focused).toBeUndefined();

    // Non-capturing toast never intercepts keys even though it is topmost
    expect(stack.handleKey(parseKeyEvent("a"))).toBe(true);
    expect(second.keys).toEqual(["a"]);
    expect(toast.keys).toEqual([]);

    h2.hide();
    expect(stack.getFocused()).toBe(first);
    expect(first.focused).toBe(true);

    h1.hide();
    expect(stack.getFocused()).toBeUndefined();
    expect(stack.handleKey(parseKeyEvent("b"))).toBe(false);
    expect(stack.handlePaste("hello")).toBe(false);

    hToast.hide();
    expect(changed).toHaveBeenCalled();
  });

  it("routes pointer hits top-to-bottom and suppresses occluded kitty image lines", () => {
    const stack = new OverlayStack();
    const lower = makeOverlay(["111111", "222222"], "L");
    const upper = makeOverlay(["UU", "VV"], "U");
    const toast = makeOverlay(["TOAST"], "T");

    stack.push(lower, { width: 8, row: 1, col: 2 });
    stack.push(upper, { width: 4, row: 1, col: 3 });
    stack.push(toast, { width: 6, row: 1, col: 3, nonCapturing: true });

    const base = [
      "000000000000",
      "\x1b_Ga=p,i=7;\x1b\\",
      "222222222222",
      "333333333333",
    ];
    const composited = stack.composite(base, 12, 4);
    expect(composited[1]).not.toContain("\x1b_G");
    expect(composited[1]).toContain("T:TOAS");

    // Click inside upper overlay skips nonCapturing toast and hits upper, not lower
    const hit: MouseReport = { kind: "press", button: 0, row: 1, column: 3, shift: false, alt: false, ctrl: false };
    expect(stack.handlePointer(hit)).toBe(true);
    expect(upper.pointers).toHaveLength(1);
    expect(lower.pointers).toHaveLength(0);
    // Returning false from handlePointer falls through to lower overlays
    upper.handlePointer = () => false;
    expect(stack.handlePointer(hit)).toBe(true);
    expect(lower.pointers).toHaveLength(1);

    // Click outside all overlays returns false so host/transcript can handle it
    const miss: MouseReport = { kind: "press", button: 0, row: 3, column: 0, shift: false, alt: false, ctrl: false };
    expect(stack.handlePointer(miss)).toBe(false);
  });

  it.each<ImageProtocol>(['kitty', 'iterm2'])('suppresses a %s image when an overlay covers a reserved row away from its anchor', protocol => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const rows = [...inlineImageRows(pngImage(320, 161), protocol, 40)!, 'following text'];
    const original = [...rows];
    const stack = new OverlayStack();
    stack.push(makeOverlay(['covered'], 'overlay'), { width: 12, row: 2, col: 2 });
    const composited = stack.composite(rows, 40, rows.length);
    expect(composited.join('')).not.toContain('\x1b_G');
    expect(composited.join('')).not.toContain('\x1b]1337;File=');
    expect(composited.join('')).not.toContain('\x1b7');
    expect(composited.join('')).not.toContain('\x1b8');
    expect(composited[2]).toContain('overlay:');
    expect(composited.at(-1)).toBe('following text');
    expect(rows).toEqual(original);
  });

  it('removes the user image carriage return before compositing an overlay on its anchor row', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const rows = [...renderBlock({ kind: 'user', text: '', finalized: true, images: [pngImage(320, 161)] }, 40, { imageProtocol: 'kitty' })].map(row => `${row}|`);
    const stack = new OverlayStack();
    stack.push(makeOverlay(['covered'], 'overlay'), { width: 12, row: 0, col: 2 });
    const composited = stack.composite(rows, 41, rows.length);
    expect(composited[0]).toContain('overlay:');
    expect(composited[0]).not.toContain('\x1b_G');
    expect(composited[0]).not.toContain('\r');
    expect(visibleWidth(composited[0]!)).toBe(41);
    expect(composited[0]).toMatch(/\|$/);
  });

  it('preserves overlay and scrollbar on selected user image rows', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const rows = [...renderBlock({ kind: 'user', text: '', finalized: true, images: [pngImage(320, 161)] }, 40, { imageProtocol: 'kitty' })];
    const shaded = highlightSelection(rows, { from: { row: 0, column: 0 }, to: { row: 0, column: 38 } }).map(row => `${row}|`);
    const stack = new OverlayStack();
    stack.push(makeOverlay(['covered'], 'overlay'), { width: 12, row: 0, col: 2 });
    const composited = stack.composite(shaded, 41, rows.length);
    expect(composited[0]).not.toContain('\x1b_G');
    expect(composited[0]).not.toContain('\r');
    expect(visibleWidth(composited[0]!)).toBe(41);
    expect(composited[0]).toMatch(/\|$/);
  });
});
