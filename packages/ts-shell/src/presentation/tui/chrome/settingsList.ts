import type { ParsedKeyEvent } from "../input/keys.js";
import type { MouseReport } from "../input/mouse.js";
import type { OverlayBounds, OverlayComponent } from "../render/overlayStack.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { fuzzyFilter } from "../text/search.js";
import { defaultTheme } from "../../theme/theme.js";
import { SingleLineInput } from "./overlayWidgets.js";

/**
 * Composable SettingsList OverlayComponent (adopted from Pi `settings-list.ts`).
 *
 * Supports inline Enter/Space value cycling, live fuzzy search, and nested
 * submenu navigation with cursor restoration.
 */

export interface SettingItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  currentValue: string;
  readonly values?: readonly string[];
  readonly submenu?: (currentValue: string, done: (selectedValue?: string) => void) => OverlayComponent;
}

export interface SettingsListOptions {
  readonly enableSearch?: boolean;
  readonly maxVisible?: number;
}

export class SettingsList implements OverlayComponent {
  focused = false;
  private filteredItems: readonly SettingItem[];
  private selectedIndex = 0;
  private readonly maxVisible: number;
  private readonly searchInput?: SingleLineInput;
  private activeSubmenu: OverlayComponent | undefined;
  private submenuItemIndex: number | undefined;

  constructor(
    private readonly items: readonly SettingItem[],
    private readonly onChange: (id: string, newValue: string) => void,
    private readonly onCancel: () => void,
    options: SettingsListOptions = {},
  ) {
    this.filteredItems = items;
    this.maxVisible = options.maxVisible ?? 10;
    if (options.enableSearch) {
      this.searchInput = new SingleLineInput("Filter settings...");
      this.searchInput.focused = true;
      this.searchInput.onChange = (query) => this.applyFilter(query);
    }
  }

  updateValue(id: string, newValue: string): void {
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.currentValue = newValue;
  }

  render(width: number): string[] {
    if (this.activeSubmenu) {
      return [...this.activeSubmenu.render(width)];
    }

    const lines: string[] = [];
    if (this.searchInput) {
      this.searchInput.focused = this.focused;
      lines.push(...this.searchInput.render(width));
      lines.push("");
    }

    if (this.filteredItems.length === 0) {
      lines.push(defaultTheme.dim("  No matching settings"));
      return lines;
    }

    const { startIndex, endIndex } = this.getVisibleRange();
    const maxLabelWidth = Math.min(30, this.items.reduce((acc, item) => Math.max(acc, visibleWidth(item.label)), 0));

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredItems[i]!;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? defaultTheme.fg("accent", "→ ") : "  ";
      const label = truncateToWidth(item.label, maxLabelWidth);
      const pad = " ".repeat(Math.max(1, maxLabelWidth - visibleWidth(label) + 2));
      const valMax = Math.max(1, width - 2 - visibleWidth(label) - pad.length);
      const valueText = truncateToWidth(item.currentValue, valMax);
      const styledLabel = isSelected ? defaultTheme.fg("accent", label) : label;
      const styledValue = isSelected ? defaultTheme.fg("accent", valueText) : defaultTheme.dim(valueText);
      lines.push(`${prefix}${styledLabel}${pad}${styledValue}`);
    }

    if (startIndex > 0 || endIndex < this.filteredItems.length) {
      lines.push(defaultTheme.dim(`  (${this.selectedIndex + 1}/${this.filteredItems.length})`));
    }

    const current = this.filteredItems[this.selectedIndex];
    if (current?.description) {
      lines.push("");
      lines.push(defaultTheme.dim(`  ${truncateToWidth(current.description, Math.max(1, width - 2))}`));
    }

    return lines;
  }

  handleKey(event: ParsedKeyEvent): boolean {
    if (this.activeSubmenu) {
      return this.activeSubmenu.handleKey?.(event) ?? true;
    }

    const count = this.filteredItems.length;
    if (event.keyId === "up" && count > 0) {
      this.selectedIndex = this.selectedIndex === 0 ? count - 1 : this.selectedIndex - 1;
      return true;
    }
    if (event.keyId === "down" && count > 0) {
      this.selectedIndex = this.selectedIndex === count - 1 ? 0 : this.selectedIndex + 1;
      return true;
    }
    if (event.keyId === "enter" || event.keyId === "space") {
      this.activateSelected();
      return true;
    }
    if (event.keyId === "escape" || event.keyId === "ctrl+c") {
      if (this.searchInput && this.searchInput.getValue()) {
        this.searchInput.setValue("");
        return true;
      }
      this.onCancel();
      return true;
    }
    if (this.searchInput) {
      return this.searchInput.handleKey(event);
    }
    return false;
  }

  handlePaste(text: string): boolean {
    if (this.activeSubmenu) {
      return this.activeSubmenu.handlePaste?.(text) ?? true;
    }
    return this.searchInput ? this.searchInput.handlePaste(text) : false;
  }

  handlePointer(report: MouseReport, bounds: OverlayBounds): boolean {
    if (this.activeSubmenu) {
      return this.activeSubmenu.handlePointer?.(report, bounds) ?? true;
    }
    if (this.filteredItems.length === 0) return true;
    if (report.kind === "wheel") {
      const delta = report.button < 0 ? -1 : 1;
      this.selectedIndex = Math.max(0, Math.min(this.filteredItems.length - 1, this.selectedIndex + delta));
      return true;
    }
    if (report.kind === "press" && report.button === 0) {
      const headerRows = this.searchInput ? 2 : 0;
      const { startIndex, endIndex } = this.getVisibleRange();
      const index = startIndex + (report.row - bounds.row - headerRows);
      if (index >= startIndex && index < endIndex) {
        this.selectedIndex = index;
        this.activateSelected();
        return true;
      }
    }
    return true;
  }

  private activateSelected(): void {
    const item = this.filteredItems[this.selectedIndex];
    if (!item) return;
    if (item.submenu) {
      this.submenuItemIndex = this.selectedIndex;
      this.activeSubmenu = item.submenu(item.currentValue, (selectedValue) => {
        if (selectedValue !== undefined) {
          item.currentValue = selectedValue;
          this.onChange(item.id, selectedValue);
        }
        this.closeSubmenu();
      });
      this.activeSubmenu.focused = true;
      return;
    }
    if (item.values && item.values.length > 0) {
      const currentIdx = item.values.indexOf(item.currentValue);
      const nextIdx = (currentIdx + 1) % item.values.length;
      const nextValue = item.values[nextIdx]!;
      item.currentValue = nextValue;
      this.onChange(item.id, nextValue);
    }
  }

  private closeSubmenu(): void {
    this.activeSubmenu = undefined;
    if (this.submenuItemIndex !== undefined) {
      this.selectedIndex = this.submenuItemIndex;
      this.submenuItemIndex = undefined;
    }
  }

  private applyFilter(query: string): void {
    const trimmed = query.trim();
    this.filteredItems = trimmed
      ? fuzzyFilter(this.items, trimmed, (item) => `${item.label} ${item.currentValue} ${item.description ?? ""}`)
      : this.items;
    this.selectedIndex = 0;
  }

  private getVisibleRange(): { readonly startIndex: number; readonly endIndex: number } {
    const total = this.filteredItems.length;
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), total - this.maxVisible));
    const endIndex = Math.min(startIndex + this.maxVisible, total);
    return { startIndex, endIndex };
  }
}
