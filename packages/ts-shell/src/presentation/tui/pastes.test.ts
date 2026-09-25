import { describe, expect, it } from "vitest";
import { PasteStore, PASTE_PLACEHOLDER_THRESHOLD, replaceLiteral } from "./pastes.js";

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
  it("expands on a second paste of the same text", () => {
    const store = new PasteStore();
    const placeholder = store.hold(LONG, 1_000);

    const repeat = store.expandOnRepeat(LONG, 1_200);

    expect(repeat).toEqual({ find: placeholder, text: LONG });
  });

  it("treats a different paste as a new paste, not an expansion", () => {
    const store = new PasteStore();
    store.hold(LONG, 1_000);

    expect(store.expandOnRepeat(`${LONG}x`, 1_100)).toBeUndefined();
  });

  it("does not expand once the window has passed", () => {
    const store = new PasteStore();
    store.hold(LONG, 1_000);

    expect(store.expandOnRepeat(LONG, 9_000)).toBeUndefined();
  });

  it("expands only once, so a third paste inserts rather than expanding again", () => {
    const store = new PasteStore();
    store.hold(LONG, 1_000);
    store.expandOnRepeat(LONG, 1_100);

    expect(store.expandOnRepeat(LONG, 1_200)).toBeUndefined();
  });

  it("normalizes CRLF so a Windows paste expands to what the editor showed", () => {
    const store = new PasteStore();
    const raw = "line1\r\nline2\r\nline3";
    const placeholder = store.hold(raw, 1_000);
    const repeat = store.expandOnRepeat(raw, 1_100);

    expect(repeat).toEqual({ find: placeholder, text: "line1\nline2\nline3" });
  });

  it("normalizes tabs on hold so the draft and the expansion agree", () => {
    const store = new PasteStore();
    store.hold("a\tb", 1_000);

    expect(store.expand(store.hold("a\tb", 1_100))).toBe("a  b");
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
