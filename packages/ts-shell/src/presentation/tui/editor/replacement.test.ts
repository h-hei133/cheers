import { describe, expect, it } from "vitest";
import { Editor } from "../editor.js";

describe("draft range replacement", () => {
  it("preserves raw whitespace and suffix, places the caret and undoes atomically", () => {
    const editor = new Editor();
    editor.setText("  /thinking\tlo  中文👩‍💻");
    editor.move("doc-start");
    for (let index = 0; index < 14; index++) editor.move("right");
    const snapshot = editor.snapshot();
    expect(snapshot.cursor).toBe(14);
    expect(editor.replace({ snapshot, from: 12, to: 14, text: "low" })).toBe(true);
    expect(editor.getText()).toBe("  /thinking\tlow  中文👩‍💻");
    expect(editor.snapshot().cursor).toBe(15);
    expect(editor.undo()).toBe(true);
    expect(editor.snapshot()).toMatchObject({ text: snapshot.text, cursor: snapshot.cursor });
    expect(editor.redo()).toBe(true);
    expect(editor.getText()).toBe("  /thinking\tlow  中文👩‍💻");
  });

  it("rejects a stale candidate after moving away and back or editing and undoing", () => {
    const editor = new Editor();
    editor.setText("/res");
    const edit = { snapshot: editor.snapshot(), from: 0, to: 4, text: "/reset" };
    editor.move("left");
    editor.move("right");
    expect(editor.replace(edit)).toBe(false);
    const fresh = { ...edit, snapshot: editor.snapshot() };
    editor.insert("x");
    editor.undo();
    expect(editor.replace(fresh)).toBe(false);
    expect(editor.getText()).toBe("/res");
  });

  it.each(["😀", "é", "👩‍💻"])("rejects a range inside %s", (cluster) => {
    const editor = new Editor();
    editor.setText(cluster);
    expect(editor.replace({ snapshot: editor.snapshot(), from: 1, to: cluster.length, text: "x" })).toBe(false);
    expect(editor.getText()).toBe(cluster);
  });

  it("adopts recalled history and retains multiline UTF-16 cursor offsets", () => {
    const editor = new Editor();
    editor.pushHistory("中文\n/res suffix");
    editor.recall(-1);
    editor.move("line-start");
    for (let index = 0; index < 4; index++) editor.move("right");
    expect(editor.replace({ snapshot: editor.snapshot(), from: 3, to: 7, text: "/reset" })).toBe(true);
    expect(editor.browsingHistory).toBe(false);
    expect(editor.snapshot()).toMatchObject({ text: "中文\n/reset suffix", cursor: 9 });
    expect(editor.getHistory()).toEqual(["中文\n/res suffix"]);
  });
});
