import { describe, expect, it } from "vitest";
import { Editor } from "../../presentation/tui/editor.js";
import { tokenizeCommandArgs } from "../../core/commands/arguments.js";
import { completionToken, quoteCompletion } from "./completion.js";
import { slashSuggestions } from "./slashSuggestions.js";

describe("completion source ranges", () => {
  it.each([
    ["  /thi rest 中文", 6, "  /thinking rest 中文", "/thinking"],
    ["\t/thinking\t\tlo  中文👩‍💻", 14, "\t/thinking\t\tlow  中文👩‍💻", "low"],
    ['/thinking "lo" suffix', 13, '/thinking "low" suffix', "low"],
    ["/shell\tuse   ba suffix", 15, "/shell\tuse   bash suffix", "bash"],
  ])("preserves the prefix and suffix in %s", (draft, cursor, expected, value) => {
    const editor = new Editor();
    editor.setText(draft);
    editor.move("doc-start");
    for (let count = 0; count < cursor; count++) editor.move("right");
    const candidate = slashSuggestions(draft, editor.snapshot())?.find(item => item.value === value);
    expect(candidate?.edit).toBeDefined();
    expect(editor.replace(candidate!.edit!)).toBe(true);
    expect(editor.getText()).toBe(expected);
  });

  it("ranges over the complete quoted file token while querying only the prefix", () => {
    const draft = '查看 @"dir/my file.ts" 后缀';
    const cursor = draft.indexOf(" file");
    expect(completionToken(draft, cursor)).toMatchObject({ from: 3, to: 20, value: "@dir/my" });
  });

  it.each(["dir/my file.ts", 'dir/a"b.ts', "dir/a'b.ts", "dir/a\\b.ts", "中文.ts"])("quotes %s without changing its decoded value", value => {
    for (const prefix of ["@", '@"', "@'"]) {
      expect(tokenizeCommandArgs(quoteCompletion(value, prefix, "@"))).toEqual(["@" + value]);
    }
  });
});
