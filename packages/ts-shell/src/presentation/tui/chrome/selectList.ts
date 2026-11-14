import type { ParsedKeyEvent } from "../input/keys.js";
import type { MouseReport } from "../input/mouse.js";
import type { OverlayBounds, OverlayComponent } from "../render/overlayStack.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { fuzzyFilter } from "../text/search.js";
import { defaultTheme } from "../../theme/theme.js";

/**
 * Reusable themed SelectList OverlayComponent (adopted from Pi `select-list.ts`).
 */

export interface SelectListItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface SelectListTheme {
  readonly selectedPrefix: (text: string) => string;
  readonly selectedText: (text: string) => string;
  readonly description: (text: string) => string;
  readonly scrollInfo: (text: string) => string;
  readonly noMatch: (text: string) => string;
}

export interface SelectListTruncatePrimaryContext {
  readonly text: string;
  readonly maxWidth: number;
  readonly columnWidth: number;
  readonly item: SelectListItem;
  readonly isSelected: boolean;
}

export interface SelectListLayoutOptions {
  readonly minPrimaryColumnWidth?: number;
  readonly maxPrimaryColumnWidth?: number;
  readonly truncatePrimary?: (context: SelectListTruncatePrimaryContext) => string;
}

const DEFAULT_PRIMARY_COLUMN_WIDTH = 32;
const PRIMARY_COLUMN_GAP = 2;
const MIN_DESCRIPTION_WIDTH = 10;

function defaultSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (text) => defaultTheme.fg("accent", text),
    selectedText: (text) => defaultTheme.fg("accent", text),
    description: (text) => defaultTheme.dim(text),
    scrollInfo: (text) => defaultTheme.dim(text),
    noMatch: (text) => defaultTheme.dim(text),
  };
}

function normalizeToSingleLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

export class SelectList implements OverlayComponent {
  focused = false;
  private items: readonly SelectListItem[];
  private filteredItems: readonly SelectListItem[];
  private selectedIndex = 0;

  onSelect?: (item: SelectListItem) => void;
  onCancel?: () => void;
  onSelectionChange?: (item: SelectListItem) => void;

  constructor(
    items: readonly SelectListItem[],
    private readonly maxVisible = 8,
    private readonly theme: SelectListTheme = defaultSelectListTheme(),
    private readonly layout: SelectListLayoutOptions = {},
  ) {
    this.items = items;
    this.filteredItems = items;
  }

  setItems(items: readonly SelectListItem[]): void {
    this.items = items;
    this.filteredItems = items;
    this.selectedIndex = 0;
  }

  setFilter(filter: string, fuzzy = true): void {
    const query = filter.trim();
    if (!query) {
      this.filteredItems = this.items;
    } else if (fuzzy) {
      this.filteredItems = fuzzyFilter(
        this.items,
        query,
        (item) => `${item.label} ${item.value} ${item.description ?? ""}`,
      );
    } else {
      const lower = query.toLowerCase();
      this.filteredItems = this.items.filter((item) => item.value.toLowerCase().startsWith(lower));
    }
    this.selectedIndex = 0;
  }

  setSelectedIndex(index: number): void {
    if (this.filteredItems.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    this.selectedIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
  }

  getSelectedItem(): SelectListItem | undefined {
    return this.filteredItems[this.selectedIndex];
  }

  render(width: number): string[] {
    if (this.filteredItems.length === 0) {
      return [this.theme.noMatch("  No matching items")];
    }

    const lines: string[] = [];
    const primaryColumnWidth = this.getPrimaryColumnWidth();
    const { startIndex, endIndex } = this.getVisibleRange();

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredItems[i]!;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.selectedPrefix("→ ") : "  ";
      const prefixWidth = 2;
      const displayValue = item.label || item.value;
      const desc = item.description ? normalizeToSingleLine(item.description) : undefined;

      if (desc && width > 40) {
        const maxPrimary = Math.max(1, width - prefixWidth - PRIMARY_COLUMN_GAP - MIN_DESCRIPTION_WIDTH);
        const colWidth = Math.min(primaryColumnWidth, maxPrimary);
        const maxLabelWidth = Math.max(1, colWidth - PRIMARY_COLUMN_GAP);
        const truncatedLabel = this.layout.truncatePrimary
          ? this.layout.truncatePrimary({ text: displayValue, maxWidth: maxLabelWidth, columnWidth: colWidth, item, isSelected })
          : truncateToWidth(displayValue, maxLabelWidth);
        const labelPad = " ".repeat(Math.max(1, colWidth - visibleWidth(truncatedLabel)));
        const remaining = Math.max(0, width - prefixWidth - visibleWidth(truncatedLabel) - labelPad.length);
        const truncatedDesc = remaining > 2 ? truncateToWidth(desc, remaining) : "";
        const body = isSelected
          ? this.theme.selectedText(`${truncatedLabel}${labelPad}`) + this.theme.description(truncatedDesc)
          : `${truncatedLabel}${labelPad}${this.theme.description(truncatedDesc)}`;
        lines.push(`${prefix}${body}`);
      } else {
        const fitted = truncateToWidth(displayValue, Math.max(1, width - prefixWidth));
        lines.push(`${prefix}${isSelected ? this.theme.selectedText(fitted) : fitted}`);
      }
    }

    if (startIndex > 0 || endIndex < this.filteredItems.length) {
      lines.push(this.theme.scrollInfo(truncateToWidth(`  (${this.selectedIndex + 1}/${this.filteredItems.length})`, Math.max(1, width - 2))));
    }

    return lines;
  }

  handleKey(event: ParsedKeyEvent): boolean {
    const count = this.filteredItems.length;
    if (event.keyId === "escape" || event.keyId === "ctrl+c") {
      this.onCancel?.();
      return true;
    }
    if (count === 0) return true;
    if (event.keyId === "up") {
      this.selectedIndex = this.selectedIndex === 0 ? count - 1 : this.selectedIndex - 1;
      this.onSelectionChange?.(this.filteredItems[this.selectedIndex]!);
      return true;
    }
    if (event.keyId === "down") {
      this.selectedIndex = this.selectedIndex === count - 1 ? 0 : this.selectedIndex + 1;
      this.onSelectionChange?.(this.filteredItems[this.selectedIndex]!);
      return true;
    }
    if (event.keyId === "pageup" || event.keyId === "pagedown") {
      const delta = event.keyId === "pageup" ? -this.maxVisible : this.maxVisible;
      const next = Math.max(0, Math.min(count - 1, this.selectedIndex + delta));
      if (next !== this.selectedIndex) {
        this.selectedIndex = next;
        this.onSelectionChange?.(this.filteredItems[this.selectedIndex]!);
      }
      return true;
    }
    if (event.keyId === "enter") {
      const selected = this.filteredItems[this.selectedIndex];
      if (selected) this.onSelect?.(selected);
      return true;
    }
    return false;
  }

  handlePointer(report: MouseReport, bounds: OverlayBounds): boolean {
    if (this.filteredItems.length === 0) return true;
    if (report.kind === "wheel") {
      const delta = report.button < 0 ? -1 : 1;
      const next = Math.max(0, Math.min(this.filteredItems.length - 1, this.selectedIndex + delta));
      if (next !== this.selectedIndex) {
        this.selectedIndex = next;
        this.onSelectionChange?.(this.filteredItems[this.selectedIndex]!);
      }
      return true;
    }
    if (report.kind === "press" && report.button === 0) {
      const { startIndex, endIndex } = this.getVisibleRange();
      const rowOffset = report.row - bounds.row;
      const itemIndex = startIndex + rowOffset;
      if (itemIndex >= startIndex && itemIndex < endIndex) {
        this.selectedIndex = itemIndex;
        const selected = this.filteredItems[itemIndex]!;
        this.onSelectionChange?.(selected);
        this.onSelect?.(selected);
        return true;
      }
    }
    return true;
  }

  private getPrimaryColumnWidth(): number {
    const min = Math.max(1, this.layout.minPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH);
    const max = Math.max(min, this.layout.maxPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH);
    const widest = this.filteredItems.reduce((acc, item) => Math.max(acc, visibleWidth(item.label || item.value) + PRIMARY_COLUMN_GAP), 0);
    return Math.max(min, Math.min(max, widest));
  }

  private getVisibleRange(): { readonly startIndex: number; readonly endIndex: number } {
    const total = this.filteredItems.length;
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), total - this.maxVisible));
    const endIndex = Math.min(startIndex + this.maxVisible, total);
    return { startIndex, endIndex };
  }
}
