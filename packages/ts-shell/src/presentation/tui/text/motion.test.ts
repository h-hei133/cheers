import { expect, it } from "vitest";
import { wordEnd, wordStart } from "./motion.js";

it("moves between words in text without spaces", () => {
  const text = "你好世界";
  expect(wordStart(text, text.length)).toBe(2);
  expect(wordEnd(text, 0)).toBe(2);
  expect(wordStart(text, 2)).toBe(0);
  expect(wordEnd(text, 2)).toBe(4);
});

it("preserves combining characters and emoji clusters", () => {
  const text = "cafe\u0301 👨‍👩‍👧‍👦 done";
  const family = text.indexOf("👨");
  const done = text.indexOf("done");
  expect(wordEnd(text, 0)).toBe(family);
  expect(wordEnd(text, family)).toBe(done);
  expect(wordStart(text, done)).toBe(family);
  expect(wordStart(text, family)).toBe(0);
});

it("groups punctuation while keeping word and whitespace boundaries", () => {
  expect(wordEnd("hello...  world", 5)).toBe(10);
  expect(wordStart("hello...  world", 10)).toBe(5);
  expect(wordEnd("alpha beta", 0)).toBe(6);
  expect(wordStart("alpha beta", 6)).toBe(0);
  expect(wordEnd("  beta", 0)).toBe(2);
  expect(wordStart("  beta", 2)).toBe(0);
});
