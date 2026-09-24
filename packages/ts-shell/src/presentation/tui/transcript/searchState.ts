import { buildSearchIndex, clampPosition, highlightRowMatches, matchRow, stepPosition, type SearchIndex } from "../transcript/search.js";

/**
 * A key as the search needs to read it.
 *
 * Narrower than the terminal's event on purpose: the search only ever asks which
 * key it was and whether it carried printable text, and taking the whole event
 * would tie this module to the input layer for no gain.
 */
export interface SearchKey {
  readonly keyId: string;
  readonly text: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/**
 * What the search had the host do about a key.
 *
 * Returned rather than performed, so the mode keeps ownership of redrawing and
 * scrolling while the decision about what the key means stays here.
 */
export interface SearchKeyOutcome {
  /** True when the key belonged to the search and must not reach the editor. */
  readonly handled: boolean;
  /** True when the frame needs redrawing. */
  readonly redraw?: boolean;
  /** True when the query or the current match moved, so it should be revealed. */
  readonly moved?: boolean;
}

/**
 * The state of an open search.
 *
 * Kept apart from the surface that renders it and the mode that receives keys,
 * because both need to agree about the same three things — what was typed, which
 * match is current, and whether the bar is open — and a copy in each would be a
 * copy that can disagree.
 */
export class TranscriptSearch {
  private index: SearchIndex = { matches: [], query: "" };
  private draft = "";
  private position = -1;
  private capturing = false;

  /** Whether the bar is capturing keys. */
  get active(): boolean {
    return this.capturing;
  }

  /** What the user has typed so far. */
  get query(): string {
    return this.draft;
  }

  get matchCount(): number {
    return this.index.matches.length;
  }

  /** Which match the user is on, one-based for display; 0 when there are none. */
  get currentNumber(): number {
    return this.position < 0 ? 0 : this.position + 1;
  }

  /** The row the current match begins on, for scrolling it into view. */
  get currentRow(): number | undefined {
    return this.position < 0 ? undefined : matchRow(this.index, this.position);
  }

  /**
   * The index for a set of rendered rows.
   *
   * Recomputed per frame rather than cached across them: the transcript grows while
   * a search is open, and an index built before the newest answer would point at
   * rows that have since moved.
   */
  indexFor(rows: readonly string[]): SearchIndex {
    if (!this.capturing) return this.index;
    this.index = buildSearchIndex(rows, this.draft);
    if (this.index.matches.length === 0) this.position = -1;
    else if (this.position < 0) this.position = 0;
    else this.position = clampPosition(this.index, this.position);
    return this.index;
  }

  /** The match the user is on, for the style that distinguishes it. */
  get currentMatch() {
    return this.position < 0 ? undefined : this.index.matches[this.position];
  }

  begin(): void {
    this.capturing = true;
  }

  /** Close and forget, so reopening does not restore a query nobody asked for. */
  close(): void {
    this.capturing = false;
    this.draft = "";
    this.position = -1;
    this.index = { matches: [], query: "" };
  }

  append(text: string): boolean {
    if (!this.capturing || !text) return false;
    this.draft += text;
    return true;
  }

  backspace(): boolean {
    if (!this.capturing || this.draft.length === 0) return false;
    this.draft = this.draft.slice(0, -1);
    return true;
  }

  /** Move to the next or previous match, wrapping at either end. */
  step(direction: -1 | 1): boolean {
    if (!this.capturing) return false;
    const next = stepPosition(this.index, this.position, direction);
    if (next < 0 || next === this.position) return false;
    this.position = next;
    return true;
  }

  /**
   * Take a key while the bar is open.
   *
   * Every key is consumed, including ones with no meaning here: a character that
   * fell through to the editor would be typed into the prompt behind the query the
   * user is trying to type.
   */
  handleKey(event: SearchKey): SearchKeyOutcome {
    if (!this.capturing) return { handled: false };

    // The parser names a modified key as `shift+enter`, not as `enter` with a
    // shift flag, so the modifier and the name are both part of the key id. Reading
    // only `enter` is what left the reverse step unreachable however it was pressed:
    // the branch matched nothing and the key fell through to "consumed, no meaning".
    const name = event.keyId.startsWith("shift+")
      ? event.keyId.slice("shift+".length)
      : event.keyId;

    if (name === "escape" || name === "ctrl+c") {
      this.close();
      return { handled: true, redraw: true };
    }
    if (name === "enter") {
      return { handled: true, moved: this.step(event.shift ? -1 : 1) };
    }
    if (name === "down" || name === "up") {
      return { handled: true, moved: this.step(name === "down" ? 1 : -1) };
    }
    if (event.keyId === "backspace" || event.keyId === "delete") {
      return this.backspace() ? { handled: true, redraw: true, moved: true } : { handled: true };
    }
    if (event.text && !event.ctrl && !event.alt) {
      return this.append(event.text) ? { handled: true, redraw: true, moved: true } : { handled: true };
    }
    return { handled: true };
  }

  /**
   * One rendered row with the current matches styled.
   *
   * The two styles are distinct so the position the user has reached is visible at
   * a glance while the remaining hits still show where they are.
   */
  styleRow(
    row: string,
    contentRow: number,
    style: (text: string, current: boolean) => string,
  ): string {
    if (!this.capturing) return row;
    const hits = this.index.matches.filter((match) => match.row === contentRow);
    if (hits.length === 0) return row;
    return highlightRowMatches(row, hits, this.currentMatch, style);
  }

  /** What the bar should show, or nothing when no search is open. */
  bar(): { readonly query: string; readonly matchCount: number; readonly currentNumber: number } | undefined {
    if (!this.capturing) return undefined;
    return {
      query: this.draft,
      matchCount: this.index.matches.length,
      currentNumber: this.currentNumber,
    };
  }
}
