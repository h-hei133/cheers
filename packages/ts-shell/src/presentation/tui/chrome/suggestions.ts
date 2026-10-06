import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { DraftEdit } from "../editor/replacement.js";

/**
 * Completion candidates below the prompt.
 *
 * Matching is tiered rather than a single fuzzy score: an exact or prefix match
 * always outranks a subsequence match, so typing the first letters of a command
 * never has a stranger sitting above it. Scoring stays inside this module so the
 * ranking is one decision, not one per call site.
 */

export interface Suggestion {
  /** Text inserted when the candidate is accepted. */
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
  /** Snapshot-bound replacement; unbound display candidates cannot be accepted. */
  readonly edit?: DraftEdit;
}

const MAX_VISIBLE = 8;

const enum Tier {
  Exact = 1000,
  Prefix = 900,
  Substring = 700,
  Subsequence = 500,
  Detail = 200,
}

/**
 * Rank of one candidate against `query`, or 0 when it does not match at all.
 * Both sides drop a leading sigil so typing `/mo` prefix-matches `/model`
 * exactly as typing `mo` does.
 */
function score(query: string, candidate: Suggestion): number {
  if (!query) return Tier.Prefix;
  const label = stripSigil(candidate.label.toLowerCase());
  if (label === query) return Tier.Exact;
  if (label.startsWith(query)) return Tier.Prefix + (100 - Math.min(99, label.length));
  if (label.includes(query)) return Tier.Substring;
  let cursor = 0;
  let gaps = 0;
  let previous = -1;
  for (let index = 0; index < label.length && cursor < query.length; index++) {
    if (label[index] !== query[cursor]) continue;
    if (previous >= 0) gaps += index - previous - 1;
    previous = index;
    cursor += 1;
  }
  if (cursor === query.length) return Math.max(Tier.Subsequence - gaps * 5, Tier.Detail + 1);
  return candidate.detail?.toLowerCase().includes(query) ? Tier.Detail : 0;
}

function stripSigil(text: string): string {
  return text.startsWith("/") ? text.slice(1) : text;
}

/** Candidates matching `query`, best first. */
export function matchSuggestions(query: string, candidates: readonly Suggestion[]): Suggestion[] {
  const normalized = stripSigil(query.trim().toLowerCase());
  return candidates
    .map((candidate) => ({ candidate, rank: score(normalized, candidate) }))
    .filter((entry) => entry.rank > 0)
    .sort((left, right) => right.rank - left.rank)
    .map((entry) => entry.candidate);
}

export class SuggestionList {
  private items: readonly Suggestion[] = [];
  private selected = 0;
  private offset = 0;
  private moved = false;
  private renderedItems: readonly Suggestion[] = [];

  /** Replace the candidate set, keeping the selection in range. */
  setItems(items: readonly Suggestion[]): void {
    this.renderedItems = [];
    this.items = items;
    this.selected = Math.min(this.selected, Math.max(0, items.length - 1));
    this.moved = false;
    this.scrollToSelection();
  }

  /**
   * Whether the user has actively chosen a candidate rather than merely having
   * the list open. Enter submits the draft unless a candidate was chosen, so
   * typing a complete command never needs a second keypress.
   */
  get chosen(): boolean {
    return this.moved;
  }

  get length(): number {
    return this.items.length;
  }

  current(): Suggestion | undefined {
    return this.items[this.selected];
  }

  /** Move the selection, wrapping at either end. */
  step(delta: 1 | -1): void {
    if (this.items.length === 0) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.moved = true;
    this.scrollToSelection();
  }

  /** Select a row from the visible window without accepting its text. */
  selectRow(row: number): void {
    const item = Number.isInteger(row) ? this.renderedItems[row] : undefined;
    if (!item) return;
    const index = this.items.indexOf(item);
    if (index < 0) return;
    this.selected = index;
    this.moved = true;
    this.scrollToSelection();
  }

  reset(): void {
    this.renderedItems = [];
    this.items = [];
    this.selected = 0;
    this.offset = 0;
    this.moved = false;
  }

  /** Rows for the visible window, with an overflow count when clipped. */
  render(width: number, maxRows = MAX_VISIBLE + 1): string[] {
    const capacity = Math.max(0, Math.floor(maxRows));
    const showCount = capacity > 1 && this.items.length > Math.min(MAX_VISIBLE, capacity);
    const visible = Math.min(MAX_VISIBLE, this.items.length, capacity - Number(showCount));
    if (visible <= 0) { this.renderedItems = []; return []; }
    this.offset = Math.max(0, Math.min(this.offset, this.selected, this.items.length - visible));
    if (this.selected >= this.offset + visible) this.offset = this.selected - visible + 1;
    this.renderedItems = this.items.slice(this.offset, this.offset + visible);
    const labelWidth = Math.min(
      24,
      Math.max(...this.items.map((item) => visibleWidth(item.label))) + 2,
    );
    const rows: string[] = [];
    for (let index = this.offset; index < this.offset + visible; index++) {
      const item = this.items[index];
      if (!item) break;
      rows.push(this.renderRow(item, index === this.selected, labelWidth, width));
    }
    const hidden = this.items.length - visible;
    if (hidden > 0 && showCount) rows.push(defaultTheme.dim(truncateToWidth(`    ↓ ${hidden} more`, width)));
    return rows;
  }

  private renderRow(item: Suggestion, active: boolean, labelWidth: number, width: number): string {
    const marker = active ? defaultTheme.fg("accent", "❯") : " ";
    const label = active ? defaultTheme.bold(item.label) : item.label;
    const detail = item.detail ? defaultTheme.dim(item.detail) : "";
    const body = `  ${marker} ${padToWidth(label, labelWidth)}${detail}`;
    const fitted = truncateToWidth(body, width);
    return active ? `${defaultTheme.bgOpen("selectedBg")}${padToWidth(fitted, width)}\x1b[0m` : fitted;
  }

  private scrollToSelection(): void {
    if (this.selected < this.offset) this.offset = this.selected;
    else if (this.selected >= this.offset + MAX_VISIBLE) this.offset = this.selected - MAX_VISIBLE + 1;
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.items.length - MAX_VISIBLE)));
  }
}
