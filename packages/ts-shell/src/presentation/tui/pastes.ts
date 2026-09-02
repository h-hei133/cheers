/**
 * Long pastes, held aside.
 *
 * A pasted file is not something anyone wants to scroll past to reach the end of
 * their own sentence — but it is also not something to truncate, because it is the
 * substance of the request. So the draft carries a short placeholder and the text
 * is kept here, expanded again only when the draft is sent.
 *
 * Placeholders are ordinary characters in the draft, which is what keeps the caret
 * honest: moving over one takes as many presses as it looks like it should, and
 * deleting it deletes the whole paste rather than half of it.
 */

/** Length past which a paste is held aside rather than shown in full. */
export const PASTE_PLACEHOLDER_THRESHOLD = 320;

const PLACEHOLDER = /\[#(\d+) [^\]]*\]/g;

export class PasteStore {
  private readonly held = new Map<number, string>();
  private nextId = 1;

  /** Whether `text` is long enough to be worth holding aside. */
  static shouldHold(text: string): boolean {
    return text.length >= PASTE_PLACEHOLDER_THRESHOLD || text.split("\n").length > 6;
  }

  /** Hold `text` and return the placeholder that stands for it. */
  hold(text: string): string {
    const id = this.nextId++;
    this.held.set(id, text);
    return placeholderFor(id, text);
  }

  /** Replace what a placeholder stands for, keeping its identity. */
  update(id: number, text: string): string {
    this.held.set(id, text);
    return placeholderFor(id, text);
  }

  get(id: number): string | undefined {
    return this.held.get(id);
  }

  /** The placeholder ids present in `draft`, in the order they appear. */
  idsIn(draft: string): number[] {
    const ids: number[] = [];
    for (const match of draft.matchAll(PLACEHOLDER)) {
      const id = Number(match[1]);
      if (this.held.has(id)) ids.push(id);
    }
    return ids;
  }

  /** `draft` with every placeholder replaced by the text it stands for. */
  expand(draft: string): string {
    return draft.replace(PLACEHOLDER, (whole, raw: string) => this.held.get(Number(raw)) ?? whole);
  }

  /**
   * `draft` with paste `id`'s placeholder rewritten for `text`, and the text
   * recorded. Keeping the id is what lets the same paste be edited twice.
   */
  rewrite(draft: string, id: number, text: string): string {
    const placeholder = this.update(id, text);
    return draft.replace(new RegExp(`\\[#${id} [^\\]]*\\]`), placeholder);
  }

  /** Hold `text` when it is long enough to bury a draft, else return it as-is. */
  holdIfLong(text: string): string {
    return PasteStore.shouldHold(text) ? this.hold(text) : text;
  }

  /** Forget everything; a submitted or discarded draft holds nothing. */
  clear(): void {
    this.held.clear();
  }
}

/** What the draft shows in place of a held paste. */
function placeholderFor(id: number, text: string): string {
  const lines = text.split("\n").length;
  const size = text.length >= 1000 ? `${(text.length / 1000).toFixed(1)}k chars` : `${text.length} chars`;
  return `[#${id} pasted ${size}${lines > 1 ? `, ${lines} lines` : ""}]`;
}
