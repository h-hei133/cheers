import { scrollWindow, type ListWindow } from "./window.js";

/**
 * Selection model behind every picker.
 *
 * One model serves both presentations — the inline panel and the full-screen
 * modal — so filtering, cursor movement, and multi-select behave identically
 * whichever shell is drawn around them. Filtering is substring-on-anything: a
 * picker's rows carry a label, a detail, and a note, and a user typing `gpt`
 * means "the row mentioning gpt", not "the label starting with gpt".
 */

export interface Option {
  /** Value handed back on accept. */
  readonly id: string;
  readonly label: string;
  /** Secondary text on the same row. */
  readonly detail?: string;
  /** Third field, rendered dimmer still: status, version, timestamp. */
  readonly note?: string;
  /** Pre-selected in a multi-select picker. */
  readonly selected?: boolean;
  /** Shown but not choosable. */
  readonly disabled?: boolean;
}

export class OptionModel {
  private all: readonly Option[] = [];
  private matches: readonly Option[] = [];
  private cursor = 0;
  private offset = 0;
  private query = "";
  private readonly chosen = new Set<string>();

  /** Replace the option set, keeping any prior multi-select state. */
  setOptions(options: readonly Option[]): void {
    this.all = options;
    for (const option of options) {
      if (option.selected) this.chosen.add(option.id);
    }
    this.applyFilter();
  }

  get filter(): string {
    return this.query;
  }

  get total(): number {
    return this.matches.length;
  }

  get selectedIndex(): number {
    return this.cursor;
  }

  /** Options matching the current filter. */
  get visible(): readonly Option[] {
    return this.matches;
  }

  current(): Option | undefined {
    return this.matches[this.cursor];
  }

  /** Focus a named, choosable option without accepting it. */
  focus(id: string): void {
    const index = this.matches.findIndex((option) => option.id === id && !option.disabled);
    if (index >= 0) this.cursor = index;
  }

  /** Ids toggled on, in the order the options were supplied. */
  chosenIds(): readonly string[] {
    return this.all.filter((option) => this.chosen.has(option.id)).map((option) => option.id);
  }

  isChosen(id: string): boolean {
    return this.chosen.has(id);
  }

  setFilter(query: string): void {
    this.query = query;
    this.applyFilter();
  }

  /** Append to the filter; returns false when the character changed nothing. */
  appendFilter(text: string): void {
    this.setFilter(this.query + text);
  }

  backspaceFilter(): void {
    if (this.query.length === 0) return;
    this.setFilter(this.query.slice(0, -1));
  }

  /** Move the cursor over choosable rows, wrapping at both ends. */
  step(delta: 1 | -1): void {
    const count = this.matches.length;
    if (count === 0) return;
    for (let attempt = 0; attempt < count; attempt++) {
      this.cursor = (this.cursor + delta + count) % count;
      if (!this.matches[this.cursor]?.disabled) break;
    }
  }

  /** Toggle the row under the cursor, for a multi-select picker. */
  toggle(): void {
    const option = this.current();
    if (!option || option.disabled) return;
    if (this.chosen.has(option.id)) this.chosen.delete(option.id);
    else this.chosen.add(option.id);
  }

  /** Window into the filtered options for a given row budget. */
  window(capacity: number): ListWindow {
    const result = scrollWindow(this.cursor, this.matches.length, capacity, this.offset);
    this.offset = result.offset;
    return result;
  }

  private applyFilter(): void {
    const needle = this.query.trim().toLowerCase();
    this.matches = needle
      ? this.all.filter((option) => haystack(option).includes(needle))
      : this.all;
    this.cursor = Math.max(0, Math.min(this.cursor, this.matches.length - 1));
    if (this.matches[this.cursor]?.disabled) this.step(1);
  }
}

function haystack(option: Option): string {
  return `${option.label} ${option.detail ?? ""} ${option.note ?? ""}`.toLowerCase();
}
