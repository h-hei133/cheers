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

  it.each(['"unfinished', "'unfinished", "trailing\\"])("rejects %s", (source) => {
    expect(() => tokenizeCommandArgs(source)).toThrow(SyntaxError);
  });

});
