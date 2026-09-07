import { describe, expect, it } from "vitest";
import { ESC } from "../input/escape.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { stripAnsi } from "../text/ansi.js";
import { Editor } from "../editor.js";
import { OptionModel } from "../chrome/options.js";
import { HStack, Text, VStack } from "./layout.js";
import { Markdown } from "./markdown.js";
import { PromptEditor } from "./editor.js";
import { SelectList } from "./select.js";
import { Loader } from "./loader.js";
import { PermissionDialog } from "./dialog.js";

describe("adapter layout components", () => {
  it("wraps text within width and pads rows", () => {
    const text = new Text("hello world hello world", { paddingX: 1, paddingY: 0 });
    const rows = text.render(12);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(stripAnsi(row).length).toBeLessThanOrEqual(12);
  });

  it("renders nothing visible for blank text", () => {
    expect(new Text("   ").render(10)).toEqual([""]);
  });

  it("stacks children vertically with gaps", () => {
    const stack = new VStack([new Text("a", { paddingX: 0 }), new Text("b", { paddingX: 0 })], { gap: 1 });
    expect(stack.render(10)).toEqual(["a         ", "", "b         "]);
  });

  it("places children side by side", () => {
    const row = new HStack([new Text("a", { paddingX: 0 }), new Text("b", { paddingX: 0 })]);
    const lines = row.render(10);
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0]!).length).toBeLessThanOrEqual(10);
  });
});

describe("adapter markdown component", () => {
  it("renders headings and code without raw markers", () => {
    const md = new Markdown("# Title\n\n`code`");
    const rows = md.render(40).join("\n");
    expect(rows).toContain("Title");
    expect(rows).not.toContain("# Title");
  });

  it("drops a trailing partial fence while streaming", () => {
    const md = new Markdown("```ts\nconst a = 1;", { streaming: true });
    expect(md.render(40).join("\n")).not.toContain("```");
  });
});

describe("adapter prompt editor", () => {
  it("inserts text and submits on Enter", () => {
    let submitted = "";
    const editor = new PromptEditor(new Editor(), { onSubmit: (text) => (submitted = text) });
    editor.handleInput("h");
    editor.handleInput("i");
    expect(editor.getText()).toBe("hi");
    editor.handleInput("\r");
    expect(submitted).toBe("hi");
  });

  it("keeps the hardware cursor marker on the caret row", () => {
    const editor = new PromptEditor(new Editor());
    editor.insert("hi");
    expect(editor.render(10).join("\n")).toContain(CURSOR_MARKER);
  });
});

describe("adapter select list", () => {
  function model(): OptionModel {
    const m = new OptionModel();
    m.setOptions([
      { id: "a", label: "alpha", detail: "first" },
      { id: "b", label: "beta", detail: "second" },
    ]);
    return m;
  }

  it("filters and moves with keyboard", () => {
    const list = new SelectList(model());
    list.setFilter("beta");
    expect(list.inner.visible.map((o) => o.id)).toEqual(["b"]);
    list.setFilter("");
    list.move(1);
    expect(list.inner.current()?.id).toBe("b");
  });

  it("accepts the current option on Enter", () => {
    let picked = "";
    const list = new SelectList(model(), 5, { onSelect: (o) => (picked = o.id) });
    list.handleInput("\r");
    expect(picked).toBe("a");
  });

  it("shows a scroll position when the list overflows", () => {
    const m = new OptionModel();
    m.setOptions(Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: `item-${i}` })));
    const list = new SelectList(m, 3);
    const rows = list.render(30).join("\n");
    expect(rows).toContain("(1/10)");
  });
});

describe("adapter loader", () => {
  it("renders a spinner row with the label", () => {
    const loader = new Loader();
    loader.setMessage("thinking");
    expect(loader.render(30).join("\n")).toContain("thinking");
  });

  it("renders elapsed activity", () => {
    const loader = new Loader();
    loader.setActivity({ startedAt: Date.now() - 1500, label: "reading", tokens: 0, cancelling: false });
    expect(loader.render(40).join("\n")).toContain("reading");
  });
});

describe("adapter permission dialog", () => {
  it("answers allow-once on Enter and denies on Escape", () => {
    const answers: string[] = [];
    const dialog = new PermissionDialog({ onAnswer: (d) => answers.push(d) });
    dialog.open({ title: "Write file", detail: "a.ts", scope: "ask" });
    expect(dialog.render(50).join("\n")).toContain("Write file");
    dialog.handleInput("\r");
    expect(answers).toEqual(["allow-once"]);
    dialog.open({ title: "Write file", scope: "ask" });
    dialog.handleInput(ESC);
    expect(answers).toEqual(["allow-once", "deny"]);
  });

  it("moves the cursor with arrow keys", () => {
    const answers: string[] = [];
    const dialog = new PermissionDialog({ onAnswer: (d) => answers.push(d) });
    dialog.open({ title: "Run", scope: "ask" });
    dialog.handleInput("\x1b[B");
    dialog.handleInput("\r");
    expect(answers).toEqual(["allow-always"]);
  });
});
