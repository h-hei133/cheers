import { expect, it } from "vitest";
import { feedVim, initialVimState, validCursor, type VimKey, type VimState } from "./state.js";

const key = (value: string, text = value): VimKey => ({ key: value, text });

function run(text: string, cursor: number, keys: readonly VimKey[], mode: VimState["mode"] = "normal") {
  let state = initialVimState(mode);
  let value = text;
  let at = cursor;
  for (const stroke of keys) {
    const result = feedVim(state, stroke, value, at);
    state = result.state;
    const effect = result.effect;
    if (effect.kind === "edit") {
      const inserted = effect.text;
      value = value.slice(0, effect.from) + inserted + value.slice(effect.to);
      at = effect.from + (effect.cursorOffset ?? inserted.length);
    } else if (effect.kind === "cursor") at = effect.offset;
    else if (effect.kind === "mode" && effect.offset !== undefined) at = effect.offset;
  }
  return { text: value, cursor: at, state };
}

it("leaves Insert on Escape and steps back one cluster", () => {
  expect(run("你好", 2, [key("escape")], "insert")).toMatchObject({ cursor: 1, state: { mode: "normal" } });
  expect(run("👩‍💻x", 5, [key("escape")], "insert").cursor).toBe(0);
});

it("deletes a whole grapheme cluster with x", () => {
  expect(run("👩‍💻a", 0, [key("x")]).text).toBe("a");
  expect(run("中文", 0, [key("x")]).text).toBe("文");
});

it("supports dd, dw, yy/p, r and counts", () => {
  expect(run("one\ntwo\nthree", 4, [key("d"), key("d")]).text).toBe("one\nthree");
  expect(run("one two", 0, [key("d"), key("w")]).text).toBe("two");
  expect(run("one\ntwo", 0, [key("y"), key("y"), key("p")]).text).toBe("one\none\ntwo");
  expect(run("abc", 1, [key("r"), key("Z")]).text).toBe("aZc");
  expect(run("abcdef", 0, [key("3"), key("l")]).cursor).toBe(3);
  expect(run("abcdef", 0, [key("9"), key("9"), key("9"), key("9"), key("9"), key("l")]).cursor).toBe(5);
});

it("applies inclusive operator motions through their target", () => {
  expect(run("one two", 0, [key("d"), key("e")]).text).toBe(" two");
  expect(run("abc", 0, [key("d"), key("$")]).text).toBe("");
  expect(run("a.b.c", 0, [key("d"), key("f"), key(".")]).text).toBe("b.c");
  expect(run("a.b.c", 0, [key("d"), key("t"), key(".")]).text).toBe(".b.c");
  expect(run("a.b.c", 4, [key("d"), key("F"), key(".")]).text).toBe("a.b");
});

it("edits a visual selection and keeps Enter inert", () => {
  expect(run("abcdef", 1, [key("v"), key("l"), key("l"), key("d")]).text).toBe("aef");
  expect(run("abc", 1, [key("v"), key("enter")]).text).toBe("abc");
  expect(run("abc", 1, [key("enter")])).toMatchObject({ text: "abc", state: { mode: "normal" } });
});

it("enters Insert at the four positions and opens lines", () => {
  expect(run("abc", 1, [key("i")]).state.mode).toBe("insert");
  expect(run("abc", 1, [key("a")]).cursor).toBe(2);
  expect(run("abc", 1, [key("A")]).cursor).toBe(3);
  expect(run("abc", 1, [key("I")]).cursor).toBe(0);
  expect(run("abc", 1, [key("o")])).toMatchObject({ text: "abc\n", cursor: 4, state: { mode: "insert" } });
  expect(run("abc", 1, [key("O")])).toMatchObject({ text: "\nabc", cursor: 0, state: { mode: "insert" } });
});

it("replaces characters in Replace mode and changes a whole line with S", () => {
  expect(run("abc", 1, [key("R"), key("X"), key("Y")])).toMatchObject({ text: "aXY", cursor: 3, state: { mode: "replace" } });
  expect(run("abc", 1, [key("R"), key("X"), key("escape")])).toMatchObject({ text: "aXc", state: { mode: "normal" } });
  expect(run("one\ntwo", 0, [key("S")])).toMatchObject({ text: "\ntwo", state: { mode: "insert" } });
});

it("keeps counts across operators and text objects", () => {
  expect(run("one\ntwo\nthree\nfour", 0, [key("3"), key("d"), key("d")]).text).toBe("four");
  expect(run("one two three", 0, [key("d"), key("2"), key("i"), key("w")]).text).toBe(" three");
  expect(run("abcdef", 0, [key("3"), key("r"), key("X")])).toMatchObject({ text: "XXXdef", cursor: 2 });
});

it("uses counts for find, line jumps and line yank", () => {
  expect(run("a.b.c.d", 0, [key("2"), key("f"), key(".")])).toMatchObject({ cursor: 3 });
  expect(run("a.b.c.d", 0, [key("2"), key("t"), key(".")])).toMatchObject({ cursor: 2 });
  expect(run("🙂🙂x", 0, [key("t"), key("🙂")])).toMatchObject({ cursor: 0 });
  expect(run("🙂🙂x", 0, [key("f"), key("🙂")])).toMatchObject({ cursor: 2 });
  expect(run("a\nb\nc\nd", 0, [key("3"), key("G")])).toMatchObject({ cursor: 4 });
  expect(run("a\nb\nc", 2, [key("1"), key("G")])).toMatchObject({ cursor: 0 });
  expect(run("a\nb\nc", 0, [key("2"), key("Y"), key("p")]).text).toBe("a\na\nb\nb\nc");
});

it("does not replace a newline in Replace mode or miscount D/C", () => {
  expect(run("ab\ncd", 1, [key("R"), key("X"), key("Y")])).toMatchObject({ text: "aXY\ncd", cursor: 3 });
  expect(run("a\nb\nc\nd", 0, [key("2"), key("D")]).text).toBe("\nc\nd");
  expect(run("a\nb\nc", 0, [key("2"), key("C")])).toMatchObject({ text: "\nc", state: { mode: "insert" } });
});

it("passes the count through operator G", () => {
  expect(run("a\nb\nc\nd", 0, [key("d"), key("2"), key("G")]).text).toBe("c\nd");
});

it("moves by words and lines without crossing the buffer edges", () => {
  expect(run("one two", 0, [key("w")]).cursor).toBe(4);
  expect(run("one two", 4, [key("b")]).cursor).toBe(0);
  expect(run("one two", 0, [key("e")]).cursor).toBe(2);
  expect(run("a\nb", 0, [key("j")]).cursor).toBe(2);
  expect(run("a\nb", 2, [key("k")]).cursor).toBe(0);
  expect(run("abc", 0, [key("h")]).cursor).toBe(0);
});

it("keeps vertical motion on a grapheme boundary", () => {
  const text = "xxx\na🙂";
  const result = run(text, 2, [key("j")]);
  expect(result.cursor).toBe(5);
  expect(validCursor(text, result.cursor)).toBe(true);
});
