import { describe, expect, it } from "vitest";
import { PasteStore, PASTE_PLACEHOLDER_THRESHOLD } from "./pastes.js";

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
