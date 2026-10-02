import { describe, expect, it } from "vitest";
import { tokenizeCommandArgs } from "./arguments.js";

describe("command argument quoting", () => {
  it.each([
    ['"two words" plain', ["two words", "plain"]],
    ["'two words' plain", ["two words", "plain"]],
    ['pre"two words"post', ["pretwo wordspost"]],
    ['"" \'\' tail', ["", "", "tail"]],
    [String.raw`a\ b \"quoted\"`, ["a b", '"quoted"']],
    [String.raw`"a\"b" "a\\b"`, ['a"b', "a\\b"]],
    [String.raw`'a\b' "a\b"`, ["a\\b", "a\\b"]],
    [String.raw`"\$HOME \`cmd\`"`, ["$HOME `cmd`"]],
    ["one\\\ntwo \\\nthree", ["onetwo", "three"]],
    ["$HOME $(whoami) *.ts", ["$HOME", "$(whoami)", "*.ts"]],
    ["  a\t b\n", ["a", "b"]],
    ["   ", []],
  ])("parses %s without expansion", (source, expected) => {
    expect(tokenizeCommandArgs(source)).toEqual(expected);
  });

  it.each([
    ['"unfinished', ['"unfinished']],
    ["don't stop", ["don't stop"]],
    ['-i explain "unfinished prose', ['-i', 'explain', '"unfinished prose']],
    ['add "name --remove other', ['add', '"name --remove other']],
    ['"two words" don\'t change', ['two words', "don't change"]],
  ])("keeps the unfinished argument literal in %s", (source, expected) => {
    expect(tokenizeCommandArgs(source)).toEqual(expected);
  });

  it.each(["trailing\\"])("rejects %s", (source) => {
    expect(() => tokenizeCommandArgs(source)).toThrow(SyntaxError);
  });

});
