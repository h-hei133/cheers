import { describe, expect, it, vi } from "vitest";
import { routeKey, type KeymapActions } from "./keymap.js";
import { InteractiveSurface } from "./frameSurface.js";
import { parseKeyEvent } from "../../presentation/tui/input/keys.js";

function build(busy = false): {
  press: (data: string) => void;
  surface: InteractiveSurface;
  actions: { [K in keyof KeymapActions]: ReturnType<typeof vi.fn> };
  clock: { now: number };
} {
  const surface = new InteractiveSurface({
    band: () => ({ model: "m" }),
    activity: () => undefined,
    busy: () => busy,
    queuedCount: () => 0,
    now: () => 0,
  });
  const actions = {
    submit: vi.fn(),
    interrupt: vi.fn(),
    exit: vi.fn(),
    redraw: vi.fn(),
    clearScreen: vi.fn(),
    refreshSuggestions: vi.fn(),
  };
  const clock = { now: 0 };
  const gesture: { lastCancelAt?: number } = {};
  return {
    surface,
    actions,
    clock,
    press: (data: string) =>
      routeKey(parseKeyEvent(data), {
        surface,
        actions: actions as unknown as KeymapActions,
        busy,
        now: () => clock.now,
        gesture,
      }),
  };
}

describe("text entry", () => {
  it("inserts printable characters", () => {
    const { press, surface } = build();
    press("h");
    press("i");
    expect(surface.editor.getText()).toBe("hi");
  });

  it("inserts wide and astral characters as typed", () => {
    const { press, surface } = build();
    press("你");
    press("\u{1f680}");
    expect(surface.editor.getText()).toBe("你\u{1f680}");
  });

  it("never inserts a control chord as text", () => {
    const { press, surface } = build();
    press("\x0c");
    press("\x1b[3~");
    expect(surface.editor.getText()).toBe("");
  });

  it("deletes forward on the Delete key", () => {
    const { press, surface } = build();
    press("a");
    press("b");
    press("\x1b[D");
    press("\x1b[3~");
    expect(surface.editor.getText()).toBe("a");
  });
});

describe("submission", () => {
  it("submits a non-empty draft and clears the prompt", () => {
    const { press, surface, actions } = build();
    press("h");
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("h");
    expect(surface.editor.getText()).toBe("");
  });

  it("does nothing on an empty prompt", () => {
    const { press, actions } = build();
    press("\r");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("adds a newline for shift+enter instead of submitting", () => {
    const { press, surface, actions } = build();
    press("a");
    press("\x1b[13;2u");
    press("b");
    expect(surface.editor.getText()).toBe("a\nb");
    expect(actions.submit).not.toHaveBeenCalled();
  });
});

describe("interruption", () => {
  it("escape interrupts a running turn", () => {
    const { press, actions } = build(true);
    press("\x1b");
    expect(actions.interrupt).toHaveBeenCalledOnce();
  });

  it("escape on an idle prompt keeps the draft", () => {
    const { press, surface, actions } = build();
    press("d");
    press("\x1b");
    expect(surface.editor.getText()).toBe("d");
    expect(actions.interrupt).not.toHaveBeenCalled();
  });

  it("ctrl+c discards a draft before it ever exits", () => {
    const { press, surface, actions } = build();
    press("d");
    press("\x03");
    expect(surface.editor.getText()).toBe("");
    expect(actions.exit).not.toHaveBeenCalled();
  });

  it("exits only on a second ctrl+c inside the double-press window", () => {
    const { press, actions, clock } = build();
    press("\x03");
    expect(actions.exit).not.toHaveBeenCalled();
    clock.now = 100;
    press("\x03");
    expect(actions.exit).toHaveBeenCalledOnce();
  });

  it("treats a slow second ctrl+c as a fresh press", () => {
    const { press, actions, clock } = build();
    press("\x03");
    clock.now = 5_000;
    press("\x03");
    expect(actions.exit).not.toHaveBeenCalled();
  });

  it("ctrl+d exits only from an empty prompt", () => {
    const { press, actions } = build();
    press("x");
    press("\x04");
    expect(actions.exit).not.toHaveBeenCalled();
    press("\x03");
    press("\x04");
    expect(actions.exit).toHaveBeenCalledOnce();
  });
});

describe("completion interception", () => {
  it("navigates the list instead of moving the caret", () => {
    const { press, surface } = build();
    surface.suggestions.setItems([
      { value: "/a", label: "/a" },
      { value: "/b", label: "/b" },
    ]);
    surface.setSuggesting(true);
    press("\x1b[B");
    expect(surface.suggestions.current()?.label).toBe("/b");
  });

  it("accepts the selection on tab and closes the list", () => {
    const { press, surface } = build();
    surface.suggestions.setItems([{ value: "/model", label: "/model" }]);
    surface.setSuggesting(true);
    press("\t");
    expect(surface.editor.getText()).toBe("/model ");
    expect(surface.suggestionsOpen).toBe(false);
  });

  it("submits on enter when no candidate was chosen", () => {
    // Typing a whole command must send on the first Enter; requiring a second
    // press because a menu happens to be open is the bug this guards.
    const { press, surface, actions } = build();
    for (const char of "/help") press(char);
    surface.suggestions.setItems([{ value: "/help", label: "/help" }]);
    surface.setSuggesting(true);
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("/help");
  });

  it("accepts the selection on enter once the user has navigated the list", () => {
    const { press, surface, actions } = build();
    surface.suggestions.setItems([
      { value: "/model", label: "/model" },
      { value: "/mode", label: "/mode" },
    ]);
    surface.setSuggesting(true);
    press("\x1b[B");
    press("\r");
    expect(actions.submit).not.toHaveBeenCalled();
    expect(surface.editor.getText()).toBe("/mode ");
  });

  it("escape dismisses the list without interrupting anything", () => {
    const { press, surface, actions } = build();
    surface.suggestions.setItems([{ value: "/a", label: "/a" }]);
    surface.setSuggesting(true);
    press("\x1b");
    expect(surface.suggestionsOpen).toBe(false);
    expect(actions.interrupt).not.toHaveBeenCalled();
  });
});

describe("editing shortcuts", () => {
  it("moves by word and to line bounds", () => {
    const { press, surface } = build();
    for (const char of "alpha beta") press(char);
    press("\x1b[1;5D");
    press("X");
    expect(surface.editor.getText()).toBe("alpha Xbeta");
    press("\x01");
    press("Y");
    expect(surface.editor.getText()).toBe("Yalpha Xbeta");
  });

  it("cuts and restores with the kill ring", () => {
    const { press, surface } = build();
    for (const char of "hello world") press(char);
    press("\x17");
    expect(surface.editor.getText()).toBe("hello ");
    press("\x19");
    expect(surface.editor.getText()).toBe("hello world");
  });

  it("recalls history when the caret cannot move up", () => {
    const { press, surface } = build();
    surface.editor.pushHistory("earlier");
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("earlier");
  });

  it("clears the screen on ctrl+l", () => {
    const { press, actions } = build();
    press("\x0c");
    expect(actions.clearScreen).toHaveBeenCalledOnce();
  });
});
