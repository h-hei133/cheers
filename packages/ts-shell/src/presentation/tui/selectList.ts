import { visibleWidth } from "./compositor.js";

export interface SelectListItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export class SelectList {
  private items: SelectListItem[] = [];
  private selectedIndex = 0;
  private maxVisible = 6;

  setItems(items: readonly SelectListItem[]): void {
    this.items = [...items];
    this.selectedIndex = Math.min(Math.max(0, this.selectedIndex), Math.max(0, this.items.length - 1));
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
  }

  moveDown(): void {
    if (this.items.length === 0) return;
    this.selectedIndex = this.selectedIndex < this.items.length - 1 ? this.selectedIndex + 1 : 0;
  }

  render(width: number = 60): string[] {
    if (this.items.length === 0) return [];
    const safeWidth = Math.max(30, width);
    const lines: string[] = [];

    lines.push(`\x1b[90m┌─ Suggestions (${this.items.length}) ${"─".repeat(Math.max(0, safeWidth - 21))}┐\x1b[0m`);

    const count = Math.min(this.items.length, this.maxVisible);
    for (let i = 0; i < count; i++) {
      const item = this.items[i];
      const isSelected = i === this.selectedIndex;
      const cursor = isSelected ? "\x1b[36m❯\x1b[0m" : " ";
      const labelStr = isSelected ? `\x1b[1m\x1b[36m${item.label.padEnd(12)}\x1b[0m` : `\x1b[37m${item.label.padEnd(12)}\x1b[0m`;
      const descStr = item.description ? `\x1b[90m${item.description}\x1b[0m` : "";

      const rowText = `${cursor} ${labelStr} ${descStr}`;
      const rowWidth = visibleWidth(rowText);
      const pad = Math.max(0, safeWidth - 2 - rowWidth);

      lines.push(`\x1b[90m│\x1b[0m ${rowText}${" ".repeat(pad)}\x1b[90m│\x1b[0m`);
    }

    lines.push(`\x1b[90m└${"─".repeat(safeWidth)}┘\x1b[0m`);
    return lines;
  }
}
