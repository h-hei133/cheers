/**
 * 2D Terminal Viewport Compositor & Layer Mixer
 * (Benchmarked against Pi Agent's `packages/tui/src/tui.ts` 2D compositing)
 *
 * Implements:
 * 1. ANSI-aware visible column slicing
 * 2. Non-destructive floating overlay blending over differential background buffer
 * 3. 2D boundary clamping and pad normalization
 */

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;
const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

export interface ExtractedSegments {
  readonly before: string;
  readonly beforeWidth: number;
  readonly after: string;
  readonly afterWidth: number;
}

export function sliceWithWidth(
  text: string,
  startCol: number,
  targetWidth: number,
): { readonly text: string; readonly width: number } {
  let currentWidth = 0;
  let inAnsi = false;
  let ansiBuf = "";
  let result = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\x1b") {
      inAnsi = true;
      ansiBuf += char;
      continue;
    }
    if (inAnsi) {
      ansiBuf += char;
      if (char === "m" || char === "\x07" || char === "\\") {
        inAnsi = false;
        if (currentWidth >= startCol && currentWidth < startCol + targetWidth) {
          result += ansiBuf;
        }
        ansiBuf = "";
      }
      continue;
    }

    if (currentWidth >= startCol && currentWidth < startCol + targetWidth) {
      result += char;
    }
    currentWidth += 1;
    if (currentWidth >= startCol + targetWidth) {
      break;
    }
  }

  return {
    text: result,
    width: Math.min(targetWidth, Math.max(0, currentWidth - startCol)),
  };
}

/**
 * Composites a floating overlay line onto a base line at a specific start column.
 */
export function compositeTuiLine(
  baseLine: string,
  overlayLine: string,
  startCol: number,
  overlayWidth: number,
  totalWidth: number,
): string {
  const cleanBase = baseLine || "";
  const cleanOverlay = overlayLine || "";

  const beforeSlice = sliceWithWidth(cleanBase, 0, startCol);
  const overlaySlice = sliceWithWidth(cleanOverlay, 0, overlayWidth);
  const afterStart = startCol + overlayWidth;
  const afterSlice = sliceWithWidth(cleanBase, afterStart, Math.max(0, totalWidth - afterStart));

  const beforePad = Math.max(0, startCol - beforeSlice.width);
  const overlayPad = Math.max(0, overlayWidth - overlaySlice.width);

  return (
    beforeSlice.text +
    " ".repeat(beforePad) +
    SEGMENT_RESET +
    overlaySlice.text +
    " ".repeat(overlayPad) +
    SEGMENT_RESET +
    afterSlice.text
  );
}
