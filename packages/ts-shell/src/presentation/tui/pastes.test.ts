import { describe, expect, it, vi } from "vitest";
import { PasteStore, PASTE_PLACEHOLDER_THRESHOLD, REPEAT_PASTE_MS, replaceLiteral } from "./pastes.js";

const LONG = "x".repeat(PASTE_PLACEHOLDER_THRESHOLD);

describe("held pastes", () => {
  it("holds text that would bury the draft", () => {
    expect(PasteStore.shouldHold(LONG)).toBe(true);
    expect(PasteStore.shouldHold("a\nb\nc\nd\ne\nf\ng")).toBe(true);
  });

  it("leaves a short paste alone", () => {
    expect(PasteStore.shouldHold("one line")).toBe(false);
    expect(PasteStore.shouldHold("a\nb")).toBe(false);
  });

  it("stands in for the text with a placeholder that says how much there is", () => {
    const store = new PasteStore();
    const placeholder = store.hold("a\nb\nc");

    expect(placeholder).toMatch(/^\[#1 pasted 5 chars, 3 lines\]$/);
  });

  it("scales the size to thousands once it is large", () => {
    expect(new PasteStore().hold("x".repeat(1500))).toContain("1.5k chars");
  });

  it("puts the text back when the draft is sent", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);

    expect(store.expand(`fix ${placeholder} please`)).toBe(`fix ${LONG} please`);
  });

  it("leaves a placeholder it does not know alone", () => {
    expect(new PasteStore().expand("see [#7 pasted 1k chars]")).toBe("see [#7 pasted 1k chars]");
  });

  it("reports placeholders whose retained payload has been cleared", () => {
    const store = new PasteStore();
    const placeholder = store.hold("x".repeat(400));

    expect(store.unresolved(placeholder)).toEqual([]);
    store.clear();
    expect(store.unresolved(placeholder)).toEqual([1]);
  });

  it("does not mistake ordinary bracketed text for an expired paste", () => {
    const store = new PasteStore();
    const issued = store.hold("x".repeat(400));
    store.clear();

    expect(store.unresolved("Please see [#42 appendix]")).toEqual([]);
    expect(store.unresolved("A literal [#1 appendix] remains text")).toEqual([]);
    expect(store.unresolved("A literal [#999 pasted note] remains text")).toEqual([]);
    expect(store.unresolved("A literal [#1 pasted note] remains text")).toEqual([]);
    expect(store.expand("Please see [#42 appendix]")).toBe("Please see [#42 appendix]");
    expect(store.unresolved(issued)).toEqual([1]);

    const active = new PasteStore();
    const actual = active.hold("y".repeat(400));
    expect(active.unresolved("A literal [#1 pasted note] remains text")).toEqual([]);
    expect(active.expand("A literal [#1 pasted note] remains text")).toBe("A literal [#1 pasted note] remains text");
    expect(active.expand(actual)).toBe("y".repeat(400));
  });

  it("refuses a held entry beyond the byte limit", () => {
    expect(() => new PasteStore().hold("x".repeat(8 * 1024 * 1024 + 1))).toThrow(/input limit/);
  });

  it("keeps a paste's identity when its text is replaced", () => {
    const store = new PasteStore();
    const first = store.hold("before");
    const second = store.update(1, "after a longer edit");

    expect(first).toContain("#1");
    expect(second).toContain("#1");
    expect(store.expand(second)).toBe("after a longer edit");
  });

  it("rewrites a placeholder in the draft it sits in", () => {
    const store = new PasteStore();
    const draft = `fix ${store.hold("before")} now`;

    const rewritten = store.rewrite(draft, 1, "after");

    expect(rewritten).toMatch(/^fix \[#1 pasted 5 chars\] now$/);
    expect(store.expand(rewritten)).toBe("fix after now");
  });

  it("passes a short paste straight through", () => {
    const store = new PasteStore();

    expect(store.holdIfLong("short")).toBe("short");
    expect(store.holdIfLong(LONG)).toContain("#1");
  });

  it("reports the pastes a draft still refers to, in order", () => {
    const store = new PasteStore();
    const one = store.hold("first paste");
    const two = store.hold("second paste");

    expect(store.idsIn(`${two} and ${one}`)).toEqual([2, 1]);
    expect(store.idsIn("nothing here")).toEqual([]);
  });

  it("forgets everything once a draft is gone", () => {
    const store = new PasteStore();
    const placeholder = store.hold("text");
    store.clear();

    expect(store.expand(placeholder)).toBe(placeholder);
  });
});

describe("asking for a paste in full", () => {
  const caretIn = (draft: string, placeholder: string): number => draft.indexOf(placeholder) + 1;

  it("expands the block the caret is on", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    const draft = `fix ${placeholder} please`;

    expect(store.expansionAt(draft, caretIn(draft, placeholder))).toEqual({
      start: 4,
      end: 4 + placeholder.length,
      text: LONG,
    });
  });

  it("addresses the block from its first character through its last", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    const draft = `fix ${placeholder} please`;
    const start = draft.indexOf(placeholder);

    expect(store.expansionAt(draft, start)?.text).toBe(LONG);
    expect(store.expansionAt(draft, start + placeholder.length - 1)?.text).toBe(LONG);
  });

  it("requires an actual insertion revision to expand just after a block", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    const draft = `fix ${placeholder} please`;

    expect(store.expansionAt(draft, draft.indexOf(placeholder) + placeholder.length)).toBeUndefined();
  });

  it.each([0, REPEAT_PASTE_MS, REPEAT_PASTE_MS + 1, -1])("bounds fresh end expansion at age %s", age => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10000);
    try {
      const store = new PasteStore(), placeholder = store.hold(LONG);
      const draft = `fix ${placeholder} please`, end = 4 + placeholder.length;
      store.arm(draft, end, 7);
      clock.mockReturnValue(10000 + age);
      expect(store.expansionAt(draft, end, 7)?.text).toBe(age >= 0 && age <= REPEAT_PASTE_MS ? LONG : undefined);
      // Interior expansion never expires, including after the end gesture was consumed.
      expect(store.expansionAt(draft, 5, 8)?.text).toBe(LONG);
    } finally { clock.mockRestore(); }
  });

  it("binds the end gesture to one insertion position and consumes it once", () => {
    const store = new PasteStore(), token = store.hold(LONG), draft = `${token} ${token}`;
    store.arm(draft, token.length, 3);
    expect(store.expansionAt(draft, draft.length, 3)).toBeUndefined();
    expect(store.expansionAt(draft, token.length, 3)?.text).toBe(LONG);
    expect(store.expansionAt(draft, token.length, 3)).toBeUndefined();
  });

  it.each(["edit", "short paste", "new block", "update", "image", "clear", "failed insertion"])(
    "invalidates the fresh end after %s", change => {
      const store = new PasteStore(), token = store.hold(LONG);
      store.arm(token, token.length, 3);
      if (change === "edit") {
        expect(store.expansionAt(token, token.length, 4)).toBeUndefined();
      } else if (change === "short paste") store.holdIfLong("next");
      else if (change === "new block") store.hold(LONG);
      else if (change === "update") store.update(1, "edited");
      else if (change === "image") store.holdImage({ type: "image", data: "aGVsbG8=", mimeType: "image/png" });
      else if (change === "clear") store.clear();
      else store.arm("other text", 0, 3);
      expect(store.expansionAt(token, token.length, 3)).toBeUndefined();
    });

  it("picks the block under the caret, not the first block in the draft", () => {
    const store = new PasteStore();
    const first = store.hold("a".repeat(PASTE_PLACEHOLDER_THRESHOLD));
    const second = store.hold("b".repeat(PASTE_PLACEHOLDER_THRESHOLD));
    const draft = `${first} and ${second}`;
    const secondStart = draft.indexOf(second);

    expect(store.expansionAt(draft, secondStart + 1)?.text).toBe("b".repeat(PASTE_PLACEHOLDER_THRESHOLD));
    expect(store.expansionAt(draft, 1)?.text).toBe("a".repeat(PASTE_PLACEHOLDER_THRESHOLD));
  });

  it("does not expand when the caret is elsewhere in the draft", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    const draft = `fix ${placeholder} please`;

    expect(store.expansionAt(draft, 0)).toBeUndefined();
    expect(store.expansionAt(draft, draft.length)).toBeUndefined();
  });

  it("does not depend on how long ago the paste happened", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    // No clock is involved: the block stays expandable for as long as it is held.
    expect(store.expansionAt(placeholder, 1)?.text).toBe(LONG);
  });

  it("ignores a bracketed token this store never issued", () => {
    const store = new PasteStore();
    store.hold(LONG);

    expect(store.expansionAt("see [#7 pasted 1k chars]", 5)).toBeUndefined();
    expect(store.expansionAt("see [#1 pasted note]", 5)).toBeUndefined();
  });

  it("ignores a block whose payload was released", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG);
    store.clear();

    expect(store.expansionAt(placeholder, 1)).toBeUndefined();
  });

  it("does not expand an image block", () => {
    const store = new PasteStore();
    const placeholder = store.holdImage({ type: "image", data: "aGVsbG8=", mimeType: "image/png" });

    expect(store.expansionAt(placeholder, 1)).toBeUndefined();
  });

  it("normalizes CRLF so a Windows paste expands to what the editor showed", () => {
    const store = new PasteStore();
    const raw = "line1\r\nline2\r\nline3";
    const placeholder = store.hold(raw);

    expect(store.expansionAt(placeholder, 1)?.text).toBe("line1\nline2\nline3");
  });

  it("retains tabs through held and updated pastes", () => {
    const store = new PasteStore();
    const placeholder = store.hold("a\tb");
    expect(store.expand(placeholder)).toBe("a\tb");
    expect(store.expansionAt(placeholder, 1)?.text).toBe("a\tb");
    const updated = store.update(2, "\tchanged  ");
    expect(store.expand(updated)).toBe("\tchanged  ");
  });

  it("keeps $ patterns literal when a placeholder is replaced", () => {
    const code = 'echo $HOME $(date) ${x} $& $1 ${1} $$';
    expect(replaceLiteral("fix [#1 pasted 40 chars]", "[#1 pasted 40 chars]", code)).toBe(`fix ${code}`);
  });
});

describe("images held beside the draft", () => {
  const IMAGE = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };

  it("stands for the image with a placeholder", () => {
    // The placeholder is text, so the caret treats it like any other character
    // and deleting it deletes the whole attachment.
    const store = new PasteStore();
    const placeholder = store.holdImage(IMAGE);
    expect(placeholder).toContain("image/png");
  });

  it("finds the images a draft refers to", () => {
    const store = new PasteStore();
    const placeholder = store.holdImage(IMAGE);
    expect(store.imagesIn(`look at this ${placeholder}`)).toEqual([IMAGE]);
  });

  it("reports nothing for a draft with no attachment", () => {
    const store = new PasteStore();
    expect(store.imagesIn("just words")).toEqual([]);
    expect(store.hasImages("just words")).toBe(false);
  });

  it("keeps images and text pastes apart", () => {
    // They are read differently: text is expanded back into the draft and sent as
    // words, while an image never becomes part of the sentence. One map would make
    // every reader decide which kind it had.
    const store = new PasteStore();
    const text = store.hold("x".repeat(400));
    const image = store.holdImage(IMAGE);

    expect(store.expand(text)).toContain("x".repeat(400));
    // Expanding the image placeholder yields no text at all, which is why the
    // image has to be collected separately.
    expect(store.expand(image).trim()).toBe("");
    expect(store.imagesIn(`${text} ${image}`)).toEqual([IMAGE]);
  });

  it("forgets attachments when the draft is cleared", () => {
    // A submitted draft holds nothing; keeping the bytes would leak memory and
    // let a later draft refer to an image the user had moved on from.
    const store = new PasteStore();
    const placeholder = store.holdImage(IMAGE);
    store.clear();
    expect(store.imagesIn(placeholder)).toEqual([]);
  });
});

describe("the store is bounded", () => {
  const LONG = "x".repeat(400);

  it("drops the oldest entries rather than growing for the session", () => {
    // The history keeps a draft's placeholder, so an entry cannot go the moment
    // its draft is sent. Without a bound the maps held every paste and every
    // image for the life of the process, and an image is base64.
    const store = new PasteStore();
    const first = store.hold(LONG);
    for (let index = 0; index < 200; index += 1) store.hold(`${LONG}${index}`);

    expect(store.expand(first)).toBe(first);
  });

  it("still resolves what was pasted recently", () => {
    // The bound has to leave the entries a user would actually reach for. The
    // drafts recalled in a session are its recent ones.
    const store = new PasteStore();
    for (let index = 0; index < 200; index += 1) store.hold(`${LONG}${index}`);
    const recent = store.hold("z".repeat(400));

    expect(store.expand(recent)).toBe("z".repeat(400));
  });

  it("bounds images too", () => {
    // Images are the reason the bound matters: one is megabytes where a text
    // paste is kilobytes.
    const store = new PasteStore();
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const first = store.holdImage(image);
    for (let index = 0; index < 200; index += 1) store.holdImage(image);

    expect(store.imagesIn(first)).toEqual([]);
  });

  it("shares one byte budget across text and images", () => {
    const store = new PasteStore(128, 20);
    const text = store.hold("x".repeat(16));
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const attachment = store.holdImage(image);

    expect(store.expand(text)).toBe(text);
    expect(store.imagesIn(attachment)).toEqual([image]);
  });

  it("keeps live signatures while bounding old issued history", () => {
    const store = new PasteStore(2);
    const protectedToken = store.hold(LONG);
    store.protector = id => id === 1;
    for (let index = 0; index < 1100; index++) store.hold(`${LONG}${index}`);
    const owner = store as unknown as { issued: Map<number, Set<string>>; order: Map<number, string> };
    expect(owner.issued.size).toBe(1024);
    expect(owner.order.size).toBe(2);
    expect(store.expand(protectedToken)).toBe(LONG);
    // A retained signature is still exact; arbitrary labels never become payloads.
    expect(store.expand("[#1 pasted forged]")).toBe("[#1 pasted forged]");
    expect(store.idsIn("[#1 pasted forged]")).toEqual([]);
    store.protector = undefined;
    store.hold(LONG);
    expect(store.get(1)).toBeUndefined();
    for (let index = 0; index < 1100; index++) store.hold(`${LONG}${index}`);
    expect(owner.issued.size).toBe(1024);
    expect(owner.issued.has(1)).toBe(false);
    expect(store.expand(protectedToken)).toBe(protectedToken);
  });

  it("keeps a finite signature bound even when custom capacity exceeds it", () => {
    const store = new PasteStore(1100);
    for (let index = 0; index < 1100; index++) store.hold(`${LONG}${index}`);
    const owner = store as unknown as { issued: Map<number, Set<string>> };
    expect(owner.issued.size).toBe(1024);
    expect(store.idsIn(store.hold("latest"))).toEqual([1101]);
  });
});
