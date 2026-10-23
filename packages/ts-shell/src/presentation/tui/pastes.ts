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

import type { ImageContent } from "../../model-adapters/multimodal.js";

/** Length past which a paste is held aside rather than shown in full. */
export const PASTE_PLACEHOLDER_THRESHOLD = 320;

const PLACEHOLDER = /\[#(\d+) (?:pasted|image) [^\]]*\]/g;

/** Window in which a second paste of the same text means "show it in full". */
const DOUBLE_PASTE_MS = 1200;

/**
 * How many entries the store keeps before the oldest are dropped.
 *
 * A draft keeps its placeholder in history, so an entry cannot be discarded the
 * moment its draft is sent — recalling that draft has to expand it again. But the
 * store has no other bound: the history is long, an image is base64, and a session
 * that runs all day would hold every paste and every picture forever. Old enough
 * that a recalled draft no longer resolves is the trade, and it is bounded.
 */
const MAX_HELD = 128;
const MAX_HELD_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_HELD_BYTES = 32 * 1024 * 1024;
const MAX_ISSUED = 1024;
const MAX_ISSUED_VARIANTS = 8;

export class PasteStore {
  private readonly held = new Map<number, string>();
  private readonly heldSizes = new Map<number, number>();
  /**
   * Images held for this draft, keyed like the text pastes.
   *
   * A parallel map rather than a union in `held`, because the two are read
   * differently: text is expanded back into the draft and sent as words, while an
   * image never becomes part of the text at all — it becomes a block beside it.
   * Putting them in one map would mean every reader of `held` deciding which kind
   * it had.
   */
  private readonly heldImages = new Map<number, ImageContent>();
  private readonly heldImageSizes = new Map<number, number>();
  private readonly order = new Map<number, "text" | "image">();
  private readonly issued = new Map<number, Set<string>>();
  private heldBytes = 0;
  private nextId = 1;
  private lastHeld: { readonly id: number; readonly text: string; readonly at: number } | undefined;

  constructor(
    private readonly maxHeld = MAX_HELD,
    private readonly maxHeldBytes = MAX_HELD_BYTES,
  ) {}

  /** Whether `text` is long enough to be worth holding aside. */
  static shouldHold(text: string): boolean {
    return text.length >= PASTE_PLACEHOLDER_THRESHOLD || text.split("\n").length > 6;
  }

  /** Hold `text` and return the placeholder that stands for it. */
  hold(text: string, now: number = Date.now()): string {
    const clean = normalizePaste(text);
    const bytes = Buffer.byteLength(clean, "utf8");
    if (bytes > MAX_HELD_ENTRY_BYTES) throw new RangeError("Pasted text exceeds the input limit.");
    const id = this.nextId++;
    this.held.set(id, clean);
    this.heldSizes.set(id, bytes);
    this.order.set(id, "text");
    this.heldBytes += bytes;
    this.evictOldest();
    this.lastHeld = { id, text: clean, at: now };
    const placeholder = placeholderFor(id, clean);
    this.rememberPlaceholder(id, placeholder);
    return placeholder;
  }

  /**
   * Drop the oldest entries once the store is over its bound.
   *
   * Dropping the oldest rather than the newest because a recalled draft names the
   * placeholders it was written with, and the drafts a user reaches for are the
   * recent ones. A dropped entry stops resolving, which is the state a draft
   * recalled long after its paste was cleared is already documented to be in.
   */
  private evictOldest(): void {
    while (this.order.size > this.maxHeld || this.heldBytes > this.maxHeldBytes) {
      const [id, kind] = this.order.entries().next().value!;
      this.order.delete(id);
      if (kind === "text") {
        this.held.delete(id);
        this.heldBytes -= this.heldSizes.get(id) ?? 0;
        this.heldSizes.delete(id);
      } else {
        this.heldImages.delete(id);
        this.heldBytes -= this.heldImageSizes.get(id) ?? 0;
        this.heldImageSizes.delete(id);
      }
    }
  }

  /**
   * A second paste of the same text, close behind the first, asking for it in full.
   *
   * Pressing paste twice is the gesture: the first press puts a placeholder in the
   * draft, and the second says "no, show me". Returns the placeholder to replace and
   * the text to replace it with, or nothing when this is an ordinary paste.
   */
  expandOnRepeat(text: string, now: number = Date.now()): { readonly find: string; readonly text: string } | undefined {
    const last = this.lastHeld;
    if (!last || last.text !== normalizePaste(text) || now - last.at > DOUBLE_PASTE_MS) return undefined;
    this.lastHeld = undefined;
    this.held.delete(last.id);
    this.heldBytes -= this.heldSizes.get(last.id) ?? 0;
    this.heldSizes.delete(last.id);
    this.order.delete(last.id);
    return { find: placeholderFor(last.id, last.text), text: last.text };
  }

  /** Replace what a placeholder stands for, keeping its identity. */
  update(id: number, text: string): string {
    const clean = normalizePaste(text);
    const bytes = Buffer.byteLength(clean, "utf8");
    if (bytes > MAX_HELD_ENTRY_BYTES) throw new RangeError("Pasted text exceeds the input limit.");
    this.heldBytes -= this.heldSizes.get(id) ?? 0;
    this.held.set(id, clean);
    this.heldSizes.set(id, bytes);
    this.order.delete(id);
    this.order.set(id, "text");
    this.heldBytes += bytes;
    this.evictOldest();
    const placeholder = placeholderFor(id, clean);
    this.rememberPlaceholder(id, placeholder);
    return placeholder;
  }

  get(id: number): string | undefined {
    return this.held.get(id);
  }

  /** The placeholder ids present in `draft`, in the order they appear. */
  idsIn(draft: string): number[] {
    const ids: number[] = [];
    for (const match of draft.matchAll(PLACEHOLDER)) {
      const id = Number(match[1]);
      if (this.held.has(id) && this.issued.get(id)?.has(match[0])) ids.push(id);
    }
    return ids;
  }

  /** Placeholder ids that no longer resolve to retained text or an image. */
  unresolved(draft: string): number[] {
    const ids: number[] = [];
    for (const match of draft.matchAll(PLACEHOLDER)) {
      const id = Number(match[1]);
      if (this.issued.get(id)?.has(match[0]) && !this.held.has(id) && !this.heldImages.has(id)) ids.push(id);
    }
    return ids;
  }

  /**
   * `draft` with every placeholder replaced by the text it stands for.
   *
   * A placeholder standing for an image becomes nothing, because the image is not
   * text and travels beside the message instead. Leaving it would send the reader
   * a literal `[#2 image image/png 12KB]` in the sentence, and sending the
   * placeholder as words is worse than sending nothing: it looks like content.
   *
   * A placeholder for something not held here is left alone, which is what a
   * draft recalled after its paste was cleared looks like.
   */
  expand(draft: string): string {
    return draft.replace(PLACEHOLDER, (whole, raw: string) => {
      const id = Number(raw);
      if (!this.issued.get(id)?.has(whole)) return whole;
      if (this.heldImages.has(id)) return "";
      return this.held.get(id) ?? whole;
    });
  }

  /**
   * `draft` with paste `id`'s placeholder rewritten for `text`, and the text
   * recorded. Keeping the id is what lets the same paste be edited twice.
   */
  rewrite(draft: string, id: number, text: string): string {
    let find: string | undefined;
    for (const placeholder of this.issued.get(id) ?? []) find = placeholder;
    const placeholder = this.update(id, text);
    return find ? replaceLiteral(draft, find, placeholder) : draft;
  }

  /** Hold `text` when it is long enough to bury a draft, else return it as-is. */
  holdIfLong(text: string): string {
    return PasteStore.shouldHold(text) ? this.hold(text) : text;
  }

  /**
   * Hold an image and return the placeholder that stands for it in the draft.
   *
   * The placeholder is text, so the caret treats it like any other character and
   * deleting it deletes the whole attachment. What it stands for is kept
   * separately and never becomes part of the sentence.
   */
  holdImage(image: ImageContent): string {
    const bytes = Buffer.byteLength(image.data, "utf8");
    if (bytes > MAX_HELD_ENTRY_BYTES) throw new RangeError("Attached image exceeds the input limit.");
    const id = this.nextId++;
    this.heldImages.set(id, image);
    this.heldImageSizes.set(id, bytes);
    this.order.set(id, "image");
    this.heldBytes += bytes;
    this.evictOldest();
    const sizeKb = Math.round((image.data.length * 0.75) / 1024);
    const placeholder = `[#${id} image ${image.mimeType} ${sizeKb}KB]`;
    this.rememberPlaceholder(id, placeholder);
    return placeholder;
  }

  /** The images a draft refers to, in the order their placeholders appear. */
  imagesIn(draft: string): readonly ImageContent[] {
    const images: ImageContent[] = [];
    for (const match of draft.matchAll(PLACEHOLDER)) {
      const id = Number(match[1]);
      const image = this.issued.get(id)?.has(match[0]) ? this.heldImages.get(id) : undefined;
      if (image) images.push(image);
    }
    return images;
  }

  /** Whether this draft has anything attached to it. */
  hasImages(draft: string): boolean {
    return this.imagesIn(draft).length > 0;
  }

  /** Forget everything; a submitted or discarded draft holds nothing. */
  clear(): void {
    this.held.clear();
    this.heldSizes.clear();
    this.heldImages.clear();
    this.heldImageSizes.clear();
    this.order.clear();
    this.heldBytes = 0;
    this.lastHeld = undefined;
  }

  private rememberPlaceholder(id: number, placeholder: string): void {
    const variants = this.issued.get(id) ?? new Set<string>();
    variants.add(placeholder);
    while (variants.size > MAX_ISSUED_VARIANTS) variants.delete(variants.values().next().value!);
    this.issued.delete(id);
    this.issued.set(id, variants);
    while (this.issued.size > MAX_ISSUED) this.issued.delete(this.issued.keys().next().value!);
  }
}

/**
 * `subject` with the first occurrence of `find` replaced by `text`, literally.
 *
 * `String.replace(find, text)` treats `$&`, `$1`, `$``, `$'`, `$$`, and
 * `${name}` inside `text` as substitution patterns, so pasted shell or template
 * code carrying a `$` would be silently rewritten away. The function-replacer
 * form returns `text` byte-for-byte.
 */
export function replaceLiteral(subject: string, find: string, text: string): string {
  return subject.replace(find, () => text);
}

/**
 * Logical line endings, normalized the same way the editor's insert does.
 *
 * Tabs remain source characters. Their display width belongs to the editor
 * layout, including when a held paste is expanded back into the draft.
 */
function normalizePaste(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** What the draft shows in place of a held paste. */
function placeholderFor(id: number, text: string): string {
  const lines = text.split("\n").length;
  const size = text.length >= 1000 ? `${(text.length / 1000).toFixed(1)}k chars` : `${text.length} chars`;
  return `[#${id} pasted ${size}${lines > 1 ? `, ${lines} lines` : ""}]`;
}
