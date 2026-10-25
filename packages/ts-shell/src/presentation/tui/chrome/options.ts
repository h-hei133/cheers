import { scrollWindow, type ListWindow } from "./window.js";
import { isFocusable } from './option.js';
export { isFocusable } from './option.js';

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
  readonly labelRole?: "command";
  /** Additional matching terms, such as aliases of a canonical entry. */
  readonly searchText?: string;
  /** Secondary text on the same row. */
  readonly detail?: string;
  /** Third field, rendered dimmer still: status, version, timestamp. */
  readonly note?: string;
  /** Pre-selected in a multi-select picker. */
  readonly selected?: boolean;
  /** Shown but not choosable. */
  readonly disabled?: boolean;
  /** Disabled activation may still expose a model's details or configuration. */
  readonly focusable?: boolean;
}

/** A picker may project its loaded options for a query without reloading them. */
export type OptionFilter = (query: string, options: readonly Option[]) => readonly Option[];

export class OptionModel {
  private all: readonly Option[] = [];
  private matches: readonly Option[] = [];
  private cursor = 0;
  private offset = 0;
  private query = "";
  private revision = 0;
  private haystacks = new WeakMap<Option, string>();
  private readonly chosen = new Set<string>();
  private selectionTouched = false;

  constructor(private readonly filterOptions?: OptionFilter,
    private readonly defaultSelection?: (options: readonly Option[]) => string | undefined) {}

  /** Replace the option set, keeping any prior multi-select state. */
  setOptions(options: readonly Option[]): void {
    const previous = new Set(this.all.map(option => option.id));
    this.all = options;
    this.haystacks = new WeakMap();
    const enabled = new Set(options.filter(option => !option.disabled).map(option => option.id));
    for (const id of this.chosen) if (!enabled.has(id)) this.chosen.delete(id);
    for (const option of options) {
      if (option.selected && !option.disabled && !previous.has(option.id)) this.chosen.add(option.id);
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

  /** Changes to candidates or query invalidate measurements; focus does not. */
  get optionsRevision(): number { return this.revision; }

  current(): Option | undefined {
    const option = this.matches[this.cursor];
    return isFocusable(option) ? option : undefined;
  }

  /** Focus a named, choosable option without accepting it. */
  focus(id: string, manual = false): void {
    const index = this.matches.findIndex((option) => option.id === id && isFocusable(option));
    if (index >= 0) {
      this.cursor = index;
      if (manual) this.selectionTouched = true;
    }
  }

  /** Ids toggled on, in the order the options were supplied. */
  chosenIds(): readonly string[] {
    return this.all.filter((option) => this.chosen.has(option.id)).map((option) => option.id);
  }

  isChosen(id: string): boolean {
    return this.chosen.has(id);
  }

  setFilter(query: string): void {
    if (query !== this.query && this.defaultSelection) this.selectionTouched = false;
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
    this.selectionTouched = true;
    for (let attempt = 0; attempt < count; attempt++) {
      this.cursor = (this.cursor + delta + count) % count;
      if (isFocusable(this.matches[this.cursor])) break;
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
    this.revision++;
    const focused = this.current()?.id;
    const needle = this.query.trim().toLowerCase();
    this.matches = this.filterOptions ? this.filterOptions(needle, this.all) : needle
      ? this.all.filter((option) => cachedHaystack(this.haystacks, option).includes(needle))
      : this.all;
    const preferred = !this.selectionTouched ? this.defaultSelection?.(this.matches) : undefined;
    const retained = this.matches.findIndex(option => option.id === (preferred ?? focused) && isFocusable(option));
    const fallback = retained < 0 ? this.defaultSelection?.(this.matches) : undefined;
    const replacement = this.matches.findIndex(option => option.id === fallback && isFocusable(option));
    this.cursor = Math.max(0, retained >= 0 ? retained : replacement >= 0 ? replacement : this.matches.findIndex(isFocusable));
  }
}

function haystack(option: Option): string {
  return `${option.label} ${option.detail ?? ""} ${option.note ?? ""} ${option.searchText ?? ""}`.toLowerCase();
}

function cachedHaystack(cache: WeakMap<Option, string>, option: Option): string {
  const cached = cache.get(option);
  if (cached !== undefined) return cached;
  const value = haystack(option);
  cache.set(option, value);
  return value;
}
