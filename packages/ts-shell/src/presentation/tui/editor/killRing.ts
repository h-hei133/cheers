/**
 * The cuts made so far, newest last.
 *
 * A ring rather than a single slot, because consecutive cuts are usually not what
 * someone wants back — the word before the last one often is. Cycling walks back
 * through them and wraps around, so the key is never a dead end.
 *
 * Two cuts in a row from the same caret are one entry: pressing the kill key
 * repeatedly is cutting one passage, not several, and splitting them would make
 * the ring fill with fragments. Moving the caret ends the run, so the next cut
 * starts its own entry.
 */
export class KillRing {
  private readonly entries: string[] = [];
  /**
   * Where the last cut of each kind finished.
   *
   * Pressing the kill key again from the same place is cutting one passage, so the
   * new text joins the previous entry rather than starting one. Moving the caret
   * ends the run, which is why the position is recorded and compared.
   */
  private readonly lastAt = new Map<string, { readonly row: number; readonly column: number }>();

  constructor(private readonly limit: number) {}

  /**
   * Whether a cut of `kind` continues the previous one: same kind, and the caret
   * has not moved since.
   */
  continues(kind: string, at: { readonly row: number; readonly column: number }): boolean {
    const last = this.lastAt.get(kind);
    return last !== undefined && last.row === at.row && last.column === at.column;
  }

  /** Record where a cut finished, so the next press can tell whether it continues. */
  endedAt(kind: string, at: { readonly row: number; readonly column: number }): void {
    this.lastAt.set(kind, at);
  }

  /**
   * Record a cut.
   *
   * `continuing` merges with the newest entry instead of adding one; `prepend`
   * says the new text came before what is already there, which is what a backward
   * kill produces.
   */
  push(text: string, options: { readonly continuing: boolean; readonly prepend: boolean }): void {
    if (text === "") return;
    const newest = this.entries.length - 1;
    if (options.continuing && newest >= 0) {
      this.entries[newest] = options.prepend ? text + this.entries[newest]! : this.entries[newest]! + text;
      return;
    }
    this.entries.push(text);
    if (this.entries.length > this.limit) this.entries.shift();
  }

  /** The newest cut, or nothing when there has not been one. */
  newest(): string | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** How many entries there are, which is what decides whether cycling can go anywhere. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Move the newest entry to the oldest position, returning what is now newest.
   *
   * Cycling is done by rotating rather than by tracking an index: the ring is
   * then always read from the same end, and there is no cursor to keep in step
   * with pushes.
   */
  rotate(): string | undefined {
    if (this.entries.length < 2) return this.newest();
    const moved = this.entries.pop()!;
    this.entries.unshift(moved);
    return this.newest();
  }
}
