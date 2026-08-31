import { visibleWidth } from "./utils.js";

export interface SelectListItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export class SelectList {
  private items: SelectListItem[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private maxVisible = 5;

  setItems(items: readonly SelectListItem[]): void {
    this.items = [...items];
    this.selectedIndex = Math.min(Math.max(0, this.selectedIndex), Math.max(0, this.items.length - 1));
    this.adjustScroll();
  }

  getItems(): readonly SelectListItem[] {
    return this.items;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedItem(): SelectListItem | undefined {
    return this.items[this.selectedIndex];
  }

  moveUp(): void {
    if (this.items.length === 0) return;
    this.selectedIndex = this.selectedIndex > 0 ? this.selectedIndex - 1 : this.items.length - 1;
    this.adjustScroll();
  }

  moveDown(): void {
    if (this.items.length === 0) return;
    this.selectedIndex = this.selectedIndex < this.items.length - 1 ? this.selectedIndex + 1 : 0;
    this.adjustScroll();
  }

  private adjustScroll(): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
      this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
    }
  }

  render(width: number = 60): string[] {
    if (this.items.length === 0) return [];
    const safeWidth = Math.max(30, width);
    const lines: string[] = [];

    lines.push(`\x1b[90m┌─ Suggestions (${this.items.length}) ${"─".repeat(Math.max(0, safeWidth - 21))}┐\x1b[0m`);

    const visibleItems = this.items.slice(this.scrollOffset, this.scrollOffset + this.maxVisible);
    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const itemGlobalIdx = this.scrollOffset + i;
      const isSelected = itemGlobalIdx === this.selectedIndex;
      const cursor = isSelected ? "\x1b[36m❯\x1b[0m" : " ";
      const labelStr = isSelected ? `\x1b[1m\x1b[36m${item.label.padEnd(12)}\x1b[0m` : `\x1b[37m${item.label.padEnd(12)}\x1b[0m`;
      const descStr = item.description ? `\x1b[90m${item.description}\x1b[0m` : "";

      const rowText = `${cursor} ${labelStr} ${descStr}`;
      const rowWidth = visibleWidth(rowText);
      const pad = Math.max(0, safeWidth - 2 - rowWidth);

      lines.push(`\x1b[90m│\x1b[0m ${rowText}${" ".repeat(pad)}\x1b[90m│\x1b[0m`);
    }

    if (this.items.length > this.maxVisible) {
      const remainingBelow = Math.max(0, this.items.length - (this.scrollOffset + this.maxVisible));
      const remainingAbove = this.scrollOffset;
      const indicators: string[] = [];
      if (remainingAbove > 0) indicators.push(`↑ ${remainingAbove}`);
      if (remainingBelow > 0) indicators.push(`↓ ${remainingBelow}`);

      const indicatorText = indicators.join("  ");
      const indicatorWidth = visibleWidth(indicatorText);
      const pad = Math.max(0, safeWidth - 4 - indicatorWidth);
      lines.push(`\x1b[90m│\x1b[0m  \x1b[36m${indicatorText}\x1b[0m${" ".repeat(pad)}\x1b[90m│\x1b[0m`);
    }

    lines.push(`\x1b[90m└${"─".repeat(safeWidth - 2)}┘\x1b[0m`);
    return lines;
  }
}
