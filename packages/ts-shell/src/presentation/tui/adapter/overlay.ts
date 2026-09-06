import { sliceWithWidth, visibleWidth } from "../text/measure.js";
import type { ViewComponent } from "./contract.js";

export type OverlayAnchor = "center" | "top" | "bottom" | "left" | "right";

export interface OverlayOptions {
  readonly width?: number;
  readonly maxHeight?: number;
  readonly anchor?: OverlayAnchor;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export interface OverlayHandle {
  hide(): void;
  setHidden(hidden: boolean): void;
  isHidden(): boolean;
  focus(): void;
  unfocus(): void;
  isFocused(): boolean;
}

interface OverlayEntry {
  readonly component: ViewComponent;
  readonly options: OverlayOptions;
  hidden: boolean;
  order: number;
  preFocus: ViewComponent | null;
}

const RESET = "\x1b[0m\x1b]8;;\x07";
export function compositeLine(
  baseLine: string,
  overlayLine: string,
  startCol: number,
  overlayWidth: number,
  totalWidth: number,
): string {
  const before = sliceWithWidth(baseLine, 0, startCol).text;
  const afterStart = startCol + overlayWidth;
  const after = sliceWithWidth(baseLine, afterStart, Math.max(0, totalWidth - afterStart));
  const overlay = sliceWithWidth(overlayLine, 0, overlayWidth);
  const overlayPad = Math.max(0, overlayWidth - overlay.width);
  const afterPad = Math.max(0, Math.max(0, totalWidth - startCol - overlayWidth) - after.width);
  const result =
    before + RESET + overlay.text + " ".repeat(overlayPad) + RESET + after.text + " ".repeat(afterPad);
  return visibleWidth(result) <= totalWidth ? result : sliceWithWidth(result, 0, totalWidth).text;
}

export class OverlayStack {
  private entries: OverlayEntry[] = [];
  private order = 0;
  private focused: ViewComponent | null = null;

  show(component: ViewComponent, options: OverlayOptions = {}): OverlayHandle {
    const entry: OverlayEntry = {
      component,
      options,
      hidden: false,
      order: ++this.order,
      preFocus: this.focused,
    };
    this.entries.push(entry);
    this.focused = component;
    const stack = this;
    return {
      hide() {
        const index = stack.entries.indexOf(entry);
        if (index === -1) return;
        stack.entries.splice(index, 1);
        if (stack.focused === component) stack.focused = entry.preFocus;
      },
      setHidden(hidden: boolean) {
        if (entry.hidden === hidden) return;
        entry.hidden = hidden;
        if (hidden && stack.focused === component) stack.focused = entry.preFocus;
        else if (!hidden) stack.focused = component;
      },
      isHidden: () => entry.hidden,
      focus() {
        entry.order = ++stack.order;
        stack.focused = component;
      },
      unfocus() {
        if (stack.focused === component) stack.focused = entry.preFocus;
      },
      isFocused: () => stack.focused === component,
    };
  }

  get count(): number {
    return this.entries.filter((entry) => !entry.hidden).length;
  }

  get focus(): ViewComponent | null {
    return this.focused;
  }

  setFocus(component: ViewComponent | null): void {
    this.focused = component;
  }

  composite(lines: string[], width: number, height: number): string[] {
    const visible = this.entries.filter((entry) => !entry.hidden);
    if (visible.length === 0) return lines;
    const result = [...lines];
    while (result.length < height) result.push("");
    const ordered = [...visible].sort((a, b) => a.order - b.order);
    for (const entry of ordered) {
      const overlayWidth = Math.max(1, Math.min(width, entry.options.width ?? Math.min(80, width)));
      let overlayLines = entry.component.render(overlayWidth);
      if (entry.options.maxHeight !== undefined && overlayLines.length > entry.options.maxHeight) {
        overlayLines = overlayLines.slice(0, entry.options.maxHeight);
      }
      const { row, col } = this.position(entry.options, overlayLines.length, width, height);
      for (let i = 0; i < overlayLines.length; i++) {
        const index = row + i;
        if (index < 0 || index >= result.length) continue;
        const overlayLine =
          visibleWidth(overlayLines[i]!) > overlayWidth
            ? sliceWithWidth(overlayLines[i]!, 0, overlayWidth).text
            : overlayLines[i]!;
        result[index] = compositeLine(result[index]!, overlayLine, col, overlayWidth, width);
      }
    }
    return result;
  }

  private position(
    options: OverlayOptions,
    overlayHeight: number,
    width: number,
    height: number,
  ): { readonly row: number; readonly col: number } {
    const overlayWidth = Math.max(1, Math.min(width, options.width ?? Math.min(80, width)));
    const anchor = options.anchor ?? "center";
    let row = Math.floor((height - overlayHeight) / 2);
    let col = Math.floor((width - overlayWidth) / 2);
    if (anchor === "top") row = 0;
    else if (anchor === "bottom") row = Math.max(0, height - overlayHeight);
    else if (anchor === "left") col = 0;
    else if (anchor === "right") col = Math.max(0, width - overlayWidth);
    row += options.offsetY ?? 0;
    col += options.offsetX ?? 0;
    return {
      row: Math.max(0, Math.min(row, Math.max(0, height - overlayHeight))),
      col: Math.max(0, Math.min(col, Math.max(0, width - overlayWidth))),
    };
  }
}
