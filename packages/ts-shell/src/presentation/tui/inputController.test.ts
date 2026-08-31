import { describe, it, expect, beforeEach } from "vitest";
import { Editor } from "./editor.js";
import { SelectList } from "./selectList.js";
import { InputController } from "./inputController.js";
import { parseKeyEvent } from "./input/keys.js";

describe("InputController & Escape/Tab Action Routing", () => {
  let editor: Editor;
  let selectList: SelectList;
  let controller: InputController;
  let canceled = false;
  let submittedText = "";

  beforeEach(() => {
    editor = new Editor();
    selectList = new SelectList();
    canceled = false;
    submittedText = "";

    controller = new InputController(editor, selectList, {
      onCancelRun: () => {
        canceled = true;
      },
      onSubmit: (text) => {
        submittedText = text;
      },
      onRequestRedraw: () => {},
    });
  });

  it("handles Escape to cancel active running turn", () => {
    const escKey = parseKeyEvent("\x1b");
    controller.handleKey(escKey, true); // isExecuting = true
    expect(canceled).toBe(true);
  });

  it("handles Escape to dismiss autocomplete without clearing draft", () => {
    editor.setText("/mod");
    controller.setAutocompleteActive(true);
    selectList.setItems([{ value: "/model", label: "/model" }]);

    const escKey = parseKeyEvent("\x1b");
    controller.handleKey(escKey, false);

    expect(controller.isAutocompleteActive()).toBe(false);
    expect(editor.getText()).toBe("/mod"); // Draft preserved
  });

  it("handles Tab to complete slash command from selectList", () => {
    editor.setText("/c");
    controller.setAutocompleteActive(true);
    selectList.setItems([{ value: "/compact", label: "/compact" }]);

    const tabKey = parseKeyEvent("\t");
    controller.handleKey(tabKey, false);

    expect(editor.getText()).toBe("/compact ");
    expect(controller.isAutocompleteActive()).toBe(false);
  });

  it("submits non-empty prompt upon Enter and clears editor", () => {
    editor.setText("npm test");
    const enterKey = parseKeyEvent("\r");
    controller.handleKey(enterKey, false);

    expect(submittedText).toBe("npm test");
    expect(editor.getText()).toBe("");
  });
});
