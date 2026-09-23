/**
 * The cuts made so far, newest last.
 *
 * A ring rather than a single slot, because consecutive cuts are usually not what
 * someone wants back — the word before the last one often is. Cycling walks back
 * through them and wraps around, so the key is never a dead end.
 *
 * Two cuts in a row are one entry: pressing the kill key repeatedly is cutting one
 * passage, not several, and splitting them would make the ring fill with
 * fragments. Whether two cuts are in a row is the editor's question — it is the
 * one that sees every key — so it passes `continuing` in rather than the ring
 * trying to infer it from where the caret ended up.
 */
export class KillRing {
  private readonly entries: string[] = [];

  constructor(private readonly limit: number) {}

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
