import { closeTerminalHyperlink } from "../text/link.js";
import { lineCells, sliceWithWidth } from "../text/measure.js";

/**
 * Pure layout math, ANSI/OSC-8-safe line compositing, wide-char boundary
 * padding, and inline image occlusion for floating overlays.
 */

export type SizeValue = number | `${number}%`;

export type OverlayAnchor =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "left-center"
  | "right-center";

export interface OverlayMargin {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

export interface OverlayOptions {
  readonly width?: SizeValue;
  readonly minWidth?: number;
  readonly maxHeight?: SizeValue;
  readonly anchor?: OverlayAnchor;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly row?: SizeValue;
  readonly col?: SizeValue;
  readonly margin?: number | OverlayMargin;
  readonly visible?: (termWidth: number, termHeight: number) => boolean;
  readonly nonCapturing?: boolean;
}

export interface OverlayBounds {
  readonly row: number;
  readonly col: number;
  readonly width: number;
  readonly height: number;
}

export interface OverlayHandle {
  hide(): void;
  setHidden(hidden: boolean): void;
  isHidden(): boolean;
  focus(): void;
  unfocus(): void;
  isFocused(): boolean;
  getBounds(): OverlayBounds | undefined;
}

export interface ResolvedOverlayLayout {
  readonly width: number;
  readonly row: number;
  readonly col: number;
  readonly maxHeight: number | undefined;
  readonly marginBottom: number;
}

const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";
const CURSOR_MARKER = "\x1b_c\x07";
const DEFAULT_OVERLAY_WIDTH = 80;

export function isImageLine(line: string): boolean {
  return line.includes("\x1b_G") || line.includes("\x1b]1337;File=");
}

function parseSizeValue(value: SizeValue | undefined, referenceSize: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : undefined;
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (!match) return undefined;
  return Math.floor((referenceSize * Number.parseFloat(match[1]!)) / 100);
}

export function resolveOverlayMargins(margin: number | OverlayMargin | undefined): Required<OverlayMargin> {
  if (margin === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof margin === "number") {
    const m = Math.max(0, Math.floor(margin));
    return { top: m, right: m, bottom: m, left: m };
  }
  return {
    top: Math.max(0, Math.floor(margin.top ?? 0)),
    right: Math.max(0, Math.floor(margin.right ?? 0)),
    bottom: Math.max(0, Math.floor(margin.bottom ?? 0)),
    left: Math.max(0, Math.floor(margin.left ?? 0)),
  };
}

export function resolveOverlayLayout(
  options: OverlayOptions | undefined,
  overlayHeight: number,
  termWidth: number,
  termHeight: number,
): ResolvedOverlayLayout {
  const opt = options ?? {};
  const m = resolveOverlayMargins(opt.margin);
  const availWidth = Math.max(1, termWidth - m.left - m.right);
  const availHeight = Math.max(1, termHeight - m.top - m.bottom);

  let width = parseSizeValue(opt.width, termWidth) ?? Math.min(DEFAULT_OVERLAY_WIDTH, availWidth);
  if (opt.minWidth !== undefined) width = Math.max(width, opt.minWidth);
  width = Math.max(1, Math.min(width, Math.min(availWidth, Math.max(1, termWidth))));

  let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
  if (maxHeight !== undefined) maxHeight = Math.max(1, Math.min(maxHeight, availHeight));

  const effectiveHeight = maxHeight !== undefined ? Math.min(overlayHeight, maxHeight) : overlayHeight;
  const anchor = opt.anchor ?? "center";

  let row: number;
  if (opt.row !== undefined) {
    if (typeof opt.row === "string") {
      const pct = /^(\d+(?:\.\d+)?)%$/.exec(opt.row.trim());
      const maxRow = Math.max(0, termHeight - effectiveHeight);
      row = pct ? Math.floor((maxRow * Number.parseFloat(pct[1]!)) / 100) : m.top;
    } else {
      row = opt.row;
    }
  } else {
    switch (anchor) {
      case "top-left":
      case "top-center":
      case "top-right":
        row = m.top;
        break;
      case "bottom-left":
      case "bottom-center":
      case "bottom-right":
        row = termHeight - m.bottom - effectiveHeight;
        break;
      case "left-center":
      case "center":
      case "right-center":
        row = m.top + Math.floor((availHeight - effectiveHeight) / 2);
        break;
    }
  }

  let col: number;
  if (opt.col !== undefined) {
    if (typeof opt.col === "string") {
      const pct = /^(\d+(?:\.\d+)?)%$/.exec(opt.col.trim());
      const maxCol = Math.max(0, termWidth - width);
      col = pct ? Math.floor((maxCol * Number.parseFloat(pct[1]!)) / 100) : m.left;
    } else {
      col = opt.col;
    }
  } else {
    switch (anchor) {
      case "top-left":
      case "left-center":
      case "bottom-left":
        col = m.left;
        break;
      case "top-right":
      case "right-center":
      case "bottom-right":
        col = termWidth - m.right - width;
        break;
      case "top-center":
      case "center":
      case "bottom-center":
        col = m.left + Math.floor((availWidth - width) / 2);
        break;
    }
  }

  row += opt.offsetY ?? 0;
  col += opt.offsetX ?? 0;

  const hardMaxRow = Math.max(0, termHeight - effectiveHeight);
  const hardMinRow = Math.min(m.top, hardMaxRow);
  const maxRowBound = Math.max(hardMinRow, Math.min(hardMaxRow, termHeight - m.bottom - effectiveHeight));
  row = Math.max(hardMinRow, Math.min(row, maxRowBound));

  const hardMaxCol = Math.max(0, termWidth - width);
  const hardMinCol = Math.min(m.left, hardMaxCol);
  const maxColBound = Math.max(hardMinCol, Math.min(hardMaxCol, termWidth - m.right - width));
  col = Math.max(hardMinCol, Math.min(col, maxColBound));

  return { width, row, col, maxHeight, marginBottom: m.bottom };
}

function extractBaseSegments(
  baseLine: string,
  beforeEnd: number,
  afterStart: number,
  afterMaxWidth: number,
): {
  readonly beforeText: string;
  readonly beforeWidth: number;
  readonly afterText: string;
  readonly afterLeadPad: number;
  readonly afterWidth: number;
} {
  let col = 0;
  let beforeText = "";
  let beforeWidth = 0;
  let afterText = "";
  let afterWidth = 0;
  let afterLeadPad = 0;
  let afterStarted = false;

  for (const cell of lineCells(baseLine)) {
    if (col < beforeEnd) beforeText += cell.prefix;
    else if (col >= afterStart && afterMaxWidth > 0) afterText += cell.prefix;
    if (cell.cluster === "") continue;
    const next = col + cell.width;
    if (next <= beforeEnd) {
      beforeText += cell.cluster;
      beforeWidth += cell.width;
    } else if (col >= afterStart && afterWidth + cell.width <= afterMaxWidth) {
      if (!afterStarted && col > afterStart) {
        afterLeadPad = col - afterStart;
      }
      afterStarted = true;
      afterText += cell.cluster;
      afterWidth += cell.width;
    } else if (col < afterStart && next > afterStart && afterMaxWidth > 0) {
      afterLeadPad = Math.max(afterLeadPad, next - afterStart);
    }
    col = next;
    if (afterMaxWidth <= 0 && col >= beforeEnd) break;
    if (col >= afterStart + afterMaxWidth) break;
  }

  return {
    beforeText: closeTerminalHyperlink(beforeText),
    beforeWidth,
    afterText: closeTerminalHyperlink(afterText),
    afterLeadPad,
    afterWidth,
  };
}

/** Composite an overlay row onto `baseLine` at `startCol` without bleeding SGR, OSC-8 links, or wide-char shifts. */
export function compositeTuiLine(
  baseLine: string,
  overlayLine: string,
  startCol: number,
  overlayWidth: number,
  totalWidth: number,
): string {
  if (isImageLine(baseLine)) return baseLine;

  const safeOverlayWidth = Math.max(0, Math.min(overlayWidth, totalWidth - startCol));
  const afterStart = startCol + safeOverlayWidth;
  const afterMaxWidth = Math.max(0, totalWidth - afterStart);
  const base = extractBaseSegments(baseLine, startCol, afterStart, afterMaxWidth);

  const slicedOverlay = sliceWithWidth(overlayLine, 0, safeOverlayWidth);
  let overlayText = closeTerminalHyperlink(slicedOverlay.text);
  if (overlayLine.includes(CURSOR_MARKER) && !overlayText.includes(CURSOR_MARKER)) {
    overlayText += CURSOR_MARKER;
  }

  const beforePad = Math.max(0, startCol - base.beforeWidth);
  const overlayPad = Math.max(0, safeOverlayWidth - slicedOverlay.width);
  const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
  const actualOverlayWidth = Math.max(safeOverlayWidth, slicedOverlay.width);
  const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
  const afterLead = Math.min(base.afterLeadPad, afterTarget);
  const afterTrailPad = Math.max(0, afterTarget - afterLead - base.afterWidth);

  return (
    base.beforeText +
    " ".repeat(beforePad) +
    SEGMENT_RESET +
    overlayText +
    " ".repeat(overlayPad) +
    SEGMENT_RESET +
    " ".repeat(afterLead) +
    base.afterText +
    " ".repeat(afterTrailPad)
  );
}

/** Suppress inline terminal image rows occluded by a floating overlay's vertical span. */
export function clearOccludedImageLines(lines: string[], startRow: number, rowCount: number): void {
  const endRow = Math.min(lines.length, startRow + rowCount);
  for (let row = Math.max(0, startRow); row < endRow; row++) {
    if (isImageLine(lines[row]!)) {
      lines[row] = "";
    }
  }
}
