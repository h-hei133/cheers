import { describe, expect, it } from "vitest";
import { DraftStash } from "./draftStash.js";
import { PasteStore, PASTE_PLACEHOLDER_THRESHOLD } from "../pastes.js";

/**
 * The one draft a user can put aside.
 *
 * Two things matter beyond "it comes back": an empty press must not consume the
 * slot, and the pastes the draft names must still resolve when it does — a
 * restored draft whose block was evicted cannot be sent, and the failure would
 * surface at submit time, long after the cause.
 */

const LONG = "x".repeat(PASTE_PLACEHOLDER_THRESHOLD);

describe("a stashed draft", () => {
  it("comes back with its caret where it was", () => {
    const stash = new DraftStash(new PasteStore());
    stash.stash({ text: "half a question", cursor: 4 });

    expect(stash.restore()).toEqual({ text: "half a question", cursor: 4 });
    expect(stash.hasDraft).toBe(false);
  });

  it("refuses an empty draft rather than consuming the slot", () => {
    const stash = new DraftStash(new PasteStore());

    expect(stash.stash({ text: "   \n ", cursor: 3 })).toBe(false);
    expect(stash.hasDraft).toBe(false);
  });

  it("refuses a second draft while one is already held", () => {
    const stash = new DraftStash(new PasteStore());
    stash.stash({ text: "first", cursor: 5 });

    expect(stash.stash({ text: "second", cursor: 6 })).toBe(false);
    expect(stash.restore()?.text).toBe("first");
  });

  it("hands back nothing when nothing is held", () => {
    expect(new DraftStash(new PasteStore()).restore()).toBeUndefined();
  });

  it("keeps the pastes the draft names alive until it is restored", () => {
    // The store evicts by age; a restored draft that names a dropped block
    // cannot be sent.
    const pastes = new PasteStore();
    const placeholder = pastes.hold(LONG);
    const stash = new DraftStash(pastes);
    stash.stash({ text: `see ${placeholder}`, cursor: 4 });

    // Fill past the held bound; the pinned entry must survive.
    for (let index = 0; index < 200; index++) pastes.hold(`${LONG} ${index}`);

    expect(pastes.get(1)).toBe(LONG);
    const restored = stash.restore();
    expect(restored && pastes.expand(restored.text)).toBe(`see ${LONG}`);
  });

  it("lets the store evict the entry once the draft is back", () => {
    const pastes = new PasteStore();
    const placeholder = pastes.hold(LONG);
    const stash = new DraftStash(pastes);
    stash.stash({ text: placeholder, cursor: 1 });
    stash.restore();

    for (let index = 0; index < 200; index++) pastes.hold(`${LONG} ${index}`);

    expect(pastes.get(1)).toBeUndefined();
  });

  it("stops protecting entries once the draft is back", () => {
    const pastes = new PasteStore();
    const placeholder = pastes.hold(LONG);
    const stash = new DraftStash(pastes);
    stash.stash({ text: placeholder, cursor: 1 });
    expect(pastes.protector?.(1)).toBe(true);
    stash.restore();
    expect(pastes.protector).toBeUndefined();
  });

  it.each(["text", "image"] as const)("retains the signed %s token across issuance history turnover", kind => {
    const pastes = new PasteStore();
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const token = kind === "text" ? pastes.hold(LONG) : pastes.holdImage(image);
    const stash = new DraftStash(pastes);
    expect(stash.stash({ text: `kept ${token}`, cursor: 4 })).toBe(true);
    for (let index = 0; index < 1100; index++) pastes.hold(`${LONG}${index}`);

    const restored = stash.restore()!;
    expect(restored).toEqual({ text: `kept ${token}`, cursor: 4 });
    expect(pastes.idsIn(restored.text, true)).toEqual([1]);
    expect(pastes.unresolved(restored.text)).toEqual([]);
    if (kind === "text") {
      expect(pastes.get(1)).toBe(LONG);
      expect(pastes.expand(restored.text)).toBe(`kept ${LONG}`);
      expect(pastes.expansionAt(restored.text, 6)?.text).toBe(LONG);
    } else {
      expect(pastes.imagesIn(restored.text)).toEqual([image]);
      expect(pastes.expand(restored.text)).toBe("kept ");
    }
    // The protection is released, so the oldest payload can be evicted again.
    pastes.hold(LONG);
    expect(pastes.idsIn(token, true)).toEqual([]);
  });

  it("keeps both payload types while retaining the existing store bounds", () => {
    const pastes = new PasteStore(4, 1500);
    const text = pastes.hold(LONG), image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const attachment = pastes.holdImage(image), stash = new DraftStash(pastes);
    stash.stash({ text: `${text} ${attachment}`, cursor: 0 });
    for (let index = 0; index < 1100; index++) pastes.hold(`${LONG}${index}`);
    const owner = pastes as unknown as { issued: Map<number, Set<string>>; order: Map<number, string>; heldBytes: number };
    expect(owner.issued.size).toBeLessThanOrEqual(1024);
    expect(owner.order.size).toBeLessThanOrEqual(4);
    expect(owner.heldBytes).toBeLessThanOrEqual(1500);
    const restored = stash.restore()!;
    expect(pastes.expand(restored.text)).toBe(`${LONG} `);
    expect(pastes.imagesIn(restored.text)).toEqual([image]);
    const literal = "[#1 pasted different label]";
    expect(pastes.expand(literal)).toBe(literal);
    expect(pastes.idsIn(literal, true)).toEqual([]);
  });
});
