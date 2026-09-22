/**
 * The history of edits, in both directions.
 *
 * Two stacks rather than one, because an undo that cannot be taken back is a key
 * that is dangerous to press: the way back from a mistake becomes a mistake with
 * no way back. A new edit forgets the redo side, since once the text has moved on
 * the undone branch is no longer where the user was heading — redoing into it
 * would land somewhere the text never was.
 *
 * Snapshots are cloned on push, so a later edit to the live state cannot reach
 * back into one already recorded.
 */
export class EditHistory<S> {
  private readonly past: S[] = [];
  private readonly future: S[] = [];

  constructor(
    private readonly clone: (state: S) => S,
    private readonly limit: number,
  ) {}

  /** Record the state about to be replaced, and begin a new branch. */
  record(state: S): void {
    if (this.past.length >= this.limit) this.past.shift();
    this.past.push(this.clone(state));
    // A new edit is a new branch: keeping the undone states would let a later
    // redo jump somewhere the text never was.
    this.future.length = 0;
  }

  /**
   * Undo: give back the state before the last edit, recording `current` so it can
   * be returned to.
   *
   * `current` is passed in rather than read from the stack because the stack holds
   * the state *before* each edit, and a redo has to restore the state *after* it.
   */
  back(current: S): S | undefined {
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    if (this.future.length >= this.limit) this.future.shift();
    this.future.push(this.clone(current));
    return previous;
  }

  /** Redo: the state that was left behind, recording `current` for a further undo. */
  forward(current: S): S | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    if (this.past.length >= this.limit) this.past.shift();
    this.past.push(this.clone(current));
    return next;
  }
}
