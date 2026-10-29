/**
 * A draft set aside while something else is typed.
 *
 * The prompt holds one draft at a time, and there are moments — a question you
 * cannot answer yet, an aside you want to ask first — where the draft is not
 * finished but is also in the way. Stashing puts it aside without losing it and
 * without turning the prompt into a notebook: one slot, restored by the same
 * key that set it aside.
 *
 * One slot rather than a stack because the second press has to mean something
 * definite. With a stack, "restore" would need a second gesture and the user
 * would have to remember how many drafts are hidden; with one slot the key is a
 * toggle, and pressing it twice returns exactly where it started.
 *
 * A stashed draft keeps its placeholders alive. The paste store evicts entries
 * by age, and a restored draft whose placeholder no longer resolves cannot be
 * sent — the text is gone and the draft says so at submit time, long after the
 * cause. So the ids a draft names are pinned for as long as it is held.
 */

import type { PasteStore } from "../pastes.js";

export interface StashedDraft {
  readonly text: string;
  readonly cursor: number;
}

export class DraftStash {
  private held: StashedDraft | undefined;

  constructor(private readonly pastes: PasteStore) {}

  /** Whether a draft is waiting. */
  get hasDraft(): boolean {
    return this.held !== undefined;
  }

  /**
   * Put `draft` aside and report whether anything was stashed.
   *
   * An empty draft is not stashed: there would be nothing to restore, and the
   * press that did it would silently consume a slot the user thought was free.
   */
  stash(draft: StashedDraft): boolean {
    if (!draft.text.trim() || this.held !== undefined) return false;
    const ids = this.pastes.idsIn(draft.text, true);
    // Captures the ids rather than reading through the stash: the predicate is
    // installed for one draft, and a later stash must not change what it
    // answers for the draft already set aside.
    this.pastes.protector = id => ids.includes(id);
    this.held = draft;
    return true;
  }

  /**
   * Take the stashed draft back, releasing what kept it alive.
   *
   * The caller decides what to do with a draft already in the prompt; this
   * hands back what was stored and leaves the slot empty either way, so a
   * restore that cannot happen does not leave the stash stuck.
   */
  restore(): StashedDraft | undefined {
    const draft = this.held;
    if (draft === undefined) return undefined;
    this.held = undefined;
    this.pastes.protector = undefined;
    return draft;
  }

}
