import type { ParsedKeyEvent } from "../input/keys.js";
import type { MouseReport } from "../input/mouse.js";
import {
  clearOccludedImageLines,
  compositeTuiLine,
  resolveOverlayLayout,
  type OverlayBounds,
  type OverlayHandle,
  type OverlayOptions,
} from "./overlayLayout.js";

export {
  compositeTuiLine,
  resolveOverlayLayout,
  type OverlayAnchor,
  type OverlayBounds,
  type OverlayHandle,
  type OverlayMargin,
  type OverlayOptions,
  type ResolvedOverlayLayout,
  type SizeValue,
} from "./overlayLayout.js";

/**
 * Composable floating overlay stack managing z-order, focus restoration,
 * pointer hit-testing, and non-capturing toast overlays.
 */

export interface OverlayComponent {
  focused?: boolean;
  render(width: number): readonly string[];
  handleKey?(event: ParsedKeyEvent): boolean | void;
  handlePointer?(report: MouseReport, bounds: OverlayBounds): boolean | void;
  handlePaste?(text: string): boolean | void;
}

interface OverlayEntry {
  readonly component: OverlayComponent;
  readonly options: OverlayOptions;
  hidden: boolean;
  preFocus: OverlayComponent | undefined;
  bounds: OverlayBounds | undefined;
}

export class OverlayStack {
  private readonly entries: OverlayEntry[] = [];
  private focusedComponent: OverlayComponent | undefined;

  constructor(
    private readonly onChanged?: () => void,
    private readonly onRestoreHostFocus?: (component: OverlayComponent | undefined) => void,
  ) {}

  push(component: OverlayComponent, options: OverlayOptions = {}): OverlayHandle {
    const entry: OverlayEntry = {
      component,
      options,
      hidden: false,
      preFocus: this.focusedComponent,
      bounds: undefined,
    };
    this.entries.push(entry);
    if (!options.nonCapturing) {
      this.setFocus(component);
    }
    this.onChanged?.();

    const stack = this;
    return {
      hide(): void { stack.removeEntry(entry); },
      setHidden(hidden: boolean): void { stack.setEntryHidden(entry, hidden); },
      isHidden(): boolean { return entry.hidden; },
      focus(): void {
        if (!stack.entries.includes(entry) || entry.hidden || entry.options.nonCapturing) return;
        stack.setFocus(entry.component);
        stack.onChanged?.();
      },
      unfocus(): void {
        if (stack.focusedComponent === entry.component) {
          stack.restoreFocusFrom(entry);
          stack.onChanged?.();
        }
      },
      isFocused(): boolean { return stack.focusedComponent === entry.component; },
      getBounds(): OverlayBounds | undefined { return entry.bounds; },
    };
  }

  hasVisible(termWidth: number, termHeight: number): boolean {
    return this.entries.some((entry) => !entry.hidden && (entry.options.visible ? entry.options.visible(termWidth, termHeight) : true));
  }

  getTopmostCapturing(termWidth?: number, termHeight?: number): OverlayComponent | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (entry.hidden || entry.options.nonCapturing) continue;
      if (termWidth !== undefined && termHeight !== undefined && entry.options.visible && !entry.options.visible(termWidth, termHeight)) {
        continue;
      }
      return entry.component;
    }
    return undefined;
  }

  getFocused(): OverlayComponent | undefined {
    return this.focusedComponent;
  }

  setFocus(component: OverlayComponent | undefined): void {
    if (this.focusedComponent === component) return;
    if (this.focusedComponent) this.focusedComponent.focused = false;
    this.focusedComponent = component;
    if (component) component.focused = true;
    else this.onRestoreHostFocus?.(undefined);
  }

  composite(baseLines: readonly string[], termWidth: number, termHeight: number): string[] {
    const visibleEntries = this.entries.filter(
      (entry) => !entry.hidden && (entry.options.visible ? entry.options.visible(termWidth, termHeight) : true),
    );
    if (visibleEntries.length === 0) {
      for (const entry of this.entries) entry.bounds = undefined;
      return [...baseLines];
    }

    const result = [...baseLines];
    while (result.length < termHeight) result.push("");

    for (const entry of this.entries) {
      if (!visibleEntries.includes(entry)) entry.bounds = undefined;
    }

    for (const entry of visibleEntries) {
      const initialLayout = resolveOverlayLayout(entry.options, 0, termWidth, termHeight);
      let rendered = entry.component.render(initialLayout.width);
      const layout = resolveOverlayLayout(entry.options, rendered.length, termWidth, termHeight);
      const maxViewportRows = Math.max(0, termHeight - layout.row);
      const maxAllowedRows = layout.maxHeight !== undefined
        ? Math.min(layout.maxHeight, maxViewportRows)
        : Math.min(maxViewportRows, Math.max(1, termHeight - layout.marginBottom - layout.row));
      if (rendered.length > maxAllowedRows) {
        rendered = rendered.slice(0, maxAllowedRows);
      }
      const height = rendered.length;
      entry.bounds = { row: layout.row, col: layout.col, width: layout.width, height };
      if (height === 0) continue;

      clearOccludedImageLines(result, layout.row, height);
      for (let i = 0; i < height; i++) {
        const targetRow = layout.row + i;
        if (targetRow < 0 || targetRow >= termHeight) continue;
        result[targetRow] = compositeTuiLine(
          result[targetRow]!,
          rendered[i]!,
          layout.col,
          layout.width,
          termWidth,
        );
      }
    }

    return result;
  }

  handleKey(event: ParsedKeyEvent, termWidth?: number, termHeight?: number): boolean {
    const target = this.resolveInputTarget(termWidth, termHeight);
    if (!target) return false;
    target.handleKey?.(event);
    this.onChanged?.();
    return true;
  }

  handlePointer(report: MouseReport): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      const bounds = entry.bounds;
      if (entry.hidden || entry.options.nonCapturing || !bounds) continue;
      const inBounds =
        report.row >= bounds.row &&
        report.row < bounds.row + bounds.height &&
        report.column >= bounds.col &&
        report.column < bounds.col + bounds.width;
      if (!inBounds) continue;
      if (entry.component.handlePointer) {
        const handled = entry.component.handlePointer(report, bounds);
        if (handled === false) continue;
      }
      this.onChanged?.();
      return true;
    }
    return false;
  }

  handlePaste(text: string, termWidth?: number, termHeight?: number): boolean {
    const target = this.resolveInputTarget(termWidth, termHeight);
    if (!target) return false;
    target.handlePaste?.(text);
    this.onChanged?.();
    return true;
  }

  private resolveInputTarget(termWidth?: number, termHeight?: number): OverlayComponent | undefined {
    const focused = this.focusedComponent;
    if (focused) {
      const entry = this.entries.find((e) => e.component === focused);
      if (
        entry &&
        !entry.hidden &&
        !entry.options.nonCapturing &&
        (termWidth === undefined || termHeight === undefined || !entry.options.visible || entry.options.visible(termWidth, termHeight))
      ) {
        return focused;
      }
    }
    return this.getTopmostCapturing(termWidth, termHeight);
  }

  private setEntryHidden(entry: OverlayEntry, hidden: boolean): void {
    if (entry.hidden === hidden) return;
    entry.hidden = hidden;
    if (hidden) {
      if (this.focusedComponent === entry.component) this.restoreFocusFrom(entry);
    } else if (!entry.options.nonCapturing) {
      entry.preFocus = this.focusedComponent;
      this.setFocus(entry.component);
    }
    this.onChanged?.();
  }

  private removeEntry(entry: OverlayEntry): void {
    const index = this.entries.indexOf(entry);
    if (index === -1) return;
    this.entries.splice(index, 1);
    entry.bounds = undefined;
    for (const candidate of this.entries) {
      if (candidate.preFocus === entry.component) candidate.preFocus = entry.preFocus;
    }
    if (this.focusedComponent === entry.component) this.restoreFocusFrom(entry);
    this.onChanged?.();
  }

  private restoreFocusFrom(entry: OverlayEntry): void {
    const fallback =
      entry.preFocus && this.entries.some((e) => e.component === entry.preFocus && !e.hidden && !e.options.nonCapturing)
        ? entry.preFocus
        : this.getTopmostCapturing();
    this.setFocus(fallback);
  }
}
