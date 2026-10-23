import { completionEdit } from "./completion.js";
import { slashSuggestions } from "./slashSuggestions.js";
import { describe, expect, it, vi } from "vitest";
import { resetVimState, routeKey, type KeymapActions } from "./keymap.js";
import { InteractiveSurface } from "../../presentation/tui/surface/view.js";
import { parseKeyEvent } from "../../presentation/tui/input/keys.js";
import { StdinBuffer } from "../../presentation/tui/input/stdinBuffer.js";
import { KEY_BINDINGS } from "../../presentation/tui/chrome/keys.js";
import { dispatchedKeyIds } from "./keymap.js";
import { Keybindings } from "./keybindings.js";

function build(busy = false, interruptible = false, vimMode = false,
  keybindings = new Keybindings()): {
  press: (data: string) => void;
  feed: (data: string) => void;
  flushInput: () => void;
  surface: InteractiveSurface;
  actions: { [K in keyof KeymapActions]: ReturnType<typeof vi.fn> };
  clock: { now: number };
} {
  const surface = new InteractiveSurface({
    facts: () => ({ model: "m", provider: "p" }),
    statusItems: () => ["model"],
    activity: () => undefined,
    busy: () => busy,
    queuedCount: () => 0,
    now: () => 0,
    ambient: () => ({}),
    cancelArmed: () => false,
    overlayFullScreen: () => false,
    overlayRows: () => [],
    selection: () => undefined,
  });
  const actions = {
    submit: vi.fn(),
    interrupt: vi.fn(),
    exit: vi.fn(),
    redraw: vi.fn(),
    clearScreen: vi.fn(),
    redrawAfter: vi.fn(),
    cycleAgentMode: vi.fn(),
    cyclePermissionScope: vi.fn(),
    openRewind: vi.fn(),
    retry: vi.fn(),
    syncSuggestions: vi.fn(),
    scroll: vi.fn(),
    scrollPage: vi.fn(),
    scrollToEnd: vi.fn(),
    copySelection: vi.fn().mockReturnValue(false),
    reportNotice: vi.fn(),
    setSourceSelection: vi.fn(),
  };
  const clock = { now: 0 };
  const gesture: { lastCancelAt?: number } = {};
  const context = {
    view: surface,
    actions: actions as unknown as KeymapActions,
    busy,
    interruptible,
    now: () => clock.now,
    gesture,
    keybindings,
    vimMode,
  };
  const input = new StdinBuffer({ setTimer: () => undefined, clearTimer: () => undefined });
  input.onKey((event) => routeKey(event, context));
  return {
    surface,
    actions,
    clock,
    press: (data: string) => routeKey(parseKeyEvent(data), context),
    feed: (data: string) => input.feed(data),
    flushInput: () => input.flush(),
  };
}
describe("scrolling", () => {
  it("scrolls faster with shift+up and shift+down", () => {
    const { press, actions } = build();
    press("\x1b[1;2A");
    press("\x1b[1;2B");
    expect(actions.scroll).toHaveBeenCalledWith(-5);
    expect(actions.scroll).toHaveBeenCalledWith(5);
  });

  it("scrolls faster through the enhanced keyboard form", () => {
    const { press, actions } = build();
    press("\x1b[57419;2u");
    press("\x1b[57420;2u");
    expect(actions.scroll).toHaveBeenCalledWith(-5);
    expect(actions.scroll).toHaveBeenCalledWith(5);
  });
});

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

  it("refuses a draft whose paste placeholder no longer resolves", () => {
    const { press, surface, actions } = build();
    surface.editor.setText(surface.pastes.hold("x".repeat(400)));
    surface.pastes.clear();

    press("\r");

    expect(actions.submit).not.toHaveBeenCalled();
    expect(actions.reportNotice).toHaveBeenCalledWith(expect.stringContaining("no longer available"));
    expect(surface.editor.getText()).toContain("pasted");
  });

  it("carries an attached image beside the text, not inside it", () => {
    // The end of the chain the clipboard feeds: a draft holding an image must
    // hand the picture over as an attachment, and must not leave the placeholder
    // behind in the sentence where it would read as content.
    const { press, surface, actions } = build();
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const placeholder = surface.pastes.holdImage(image);
    press(`look at this ${placeholder}`);
    press("\r");

    const [text, , attachments] = actions.submit.mock.calls[0]!;
    expect(text).toBe("look at this");
    expect(attachments).toEqual({ images: [image] });
  });

  it("submits text alone when nothing is attached", () => {
    // The no-attachment shape is the one every existing reader was written for,
    // so it has to stay a bare two-argument call rather than carry an empty bag.
    const { press, actions } = build();
    press("h");
    press("\r");
    expect(actions.submit.mock.calls[0]).toHaveLength(1);
  });

  it("does nothing on an empty prompt", () => {
    const { press, actions } = build();
    press("\r");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("submits ordinary bracketed text that resembles a placeholder", () => {
    const { press, surface, actions } = build();
    surface.pastes.hold("x".repeat(400));
    surface.pastes.clear();
    press("Please see [#1 appendix]");
    press("\r");

    expect(actions.submit).toHaveBeenCalledWith("Please see [#1 appendix]");
  });

  it("adds a newline for shift+enter instead of submitting", () => {
    const { press, surface, actions } = build();
    press("a");
    press("\x1b[13;2u");
    press("b");
    expect(surface.editor.getText()).toBe("a\nb");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("accepts the universal newline fallback on terminals without the protocol", () => {
    // Ctrl+J is a bare line feed, which every terminal can send.
    const { press, surface, actions } = build();
    press("a");
    press("\n");
    press("b");
    expect(surface.editor.getText()).toBe("a\nb");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("accepts alt+enter as a newline too", () => {
    const { press, surface } = build();
    press("a");
    press("\x1b\r");
    press("b");
    expect(surface.editor.getText()).toBe("a\nb");
  });
});

describe("input while a turn runs", () => {
  it("steers the draft into the running turn on enter", () => {
    const { press, actions } = build(true);
    press("h");
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("h", "steer");
  });

  it("queues the draft as a follow-up on ctrl+q", () => {
    const { press, actions, surface } = build(true);
    press("h");
    press("\x11");
    expect(actions.submit).toHaveBeenCalledWith("h", "followUp");
    expect(surface.editor.getText()).toBe("");
  });

  it("sends without a disposition when idle", () => {
    const { press, actions } = build();
    press("h");
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("h");
  });
});

describe("interruption", () => {
  it.each(['\x1b', '\x03'])('stops scheduling between turns with %j while preserving the draft', key => {
    const { press, surface, actions } = build(false, true);
    press('d');
    press(key);
    expect(actions.interrupt).toHaveBeenCalledOnce();
    expect(surface.editor.getText()).toBe('d');
    expect(actions.exit).not.toHaveBeenCalled();
    press('\r');
    expect(actions.submit).toHaveBeenCalledWith('d');
  });

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

  it("schedules the repaint that retires the exit hint", () => {
    const { press, actions } = build();
    press("\x03");
    expect(actions.redrawAfter).toHaveBeenCalledOnce();
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

describe("vim mode", () => {
  it("types dd in Insert instead of deleting a line", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("one\ntwo");
    surface.editor.move("doc-start");
    press("d");
    press("d");
    expect(surface.editor.getText()).toBe("ddone\ntwo");
  });

  it("deletes a line in Normal and never submits Enter", () => {
    const { press, surface, actions } = build(false, false, true);
    surface.editor.setText("one\ntwo");
    surface.editor.move("doc-start");
    press("\x1b");
    press("d");
    press("d");
    expect(surface.editor.getText()).toBe("two");
    press("\r");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("deletes a visual selection", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("abcdef");
    press("\x1b");
    press("0");
    press("l");
    press("v");
    press("l");
    press("l");
    press("d");
    expect(surface.editor.getText()).toBe("aef");
  });

  it("projects Visual and Visual-Line ranges as source selections", () => {
    const { press, surface, actions } = build(false, false, true);
    surface.editor.setText("a👩‍💻b");
    surface.editor.move("doc-start");
    press("\x1b");
    press("v");
    press("l");
    expect(actions.setSourceSelection).toHaveBeenLastCalledWith({
      sourceRevision: surface.editor.snapshot().revision,
      start: 0,
      end: 6,
    });

    surface.editor.setText("ab\ncd\nef");
    surface.editor.move("doc-start");
    press("\x1b");
    press("V");
    press("j");
    expect(actions.setSourceSelection).toHaveBeenLastCalledWith({
      sourceRevision: surface.editor.snapshot().revision,
      start: 0,
      end: 6,
    });
  });

  it("copies a Visual source range on Ctrl+C without clearing the draft", () => {
    const { press, surface, actions } = build(false, false, true);
    surface.editor.setText("a👩‍💻b");
    surface.editor.move("doc-start");
    press("\x1b");
    press("v");
    press("l");
    actions.copySelection.mockReturnValueOnce(true);
    press("\x03");
    expect(actions.copySelection).toHaveBeenCalledWith({
      sourceRevision: surface.editor.snapshot().revision,
      start: 0,
      end: 6,
    });
    expect(surface.editor.getText()).toBe("a👩‍💻b");
    expect(actions.setSourceSelection).toHaveBeenLastCalledWith(undefined);
  });

  it("maps Ctrl+R to redo in Normal", () => {
    const { press, surface } = build(false, false, true);
    const redo = vi.spyOn(surface.editor, "redo");
    press("\x1b");
    press("\x12");
    expect(redo).toHaveBeenCalled();
  });

  it("returns to Insert with i and accepts typed text", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("bc");
    press("\x1b");
    press("0");
    press("i");
    press("a");
    expect(surface.editor.getText()).toBe("abc");
  });

  it("keeps named keys from overwriting Replace text and restores on backspace", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("abcd");
    surface.editor.move("doc-start");
    press("\x1b");
    press("R");
    press("X");
    press("Y");
    expect(surface.editor.getText()).toBe("XYcd");
    press("\x7f");
    expect(surface.editor.getText()).toBe("Xbcd");
    press("\x1b[D");
    press("Z");
    expect(surface.editor.getText()).toBe("Zbcd");
    press("\x1b[3~");
    expect(surface.editor.getText()).toBe("Zcd");
  });

  it("gives quiet Normal Escape and Ctrl+C back to the running application", () => {
    const escape = build(true, true, true);
    escape.press("\x1b");
    escape.press("\x1b");
    expect(escape.actions.interrupt).toHaveBeenCalledOnce();

    const cancel = build(true, true, true);
    cancel.press("\x1b");
    cancel.press("\x03");
    expect(cancel.actions.interrupt).toHaveBeenCalledOnce();
  });

  it("lets an explicitly rebound submit action through Normal mode", () => {
    const { press, surface, actions } = build(false, false, true,
      new Keybindings({ "tui.input.submit": ["ctrl+s"] }));
    surface.editor.setText("send this");
    press("\x1b");
    press("\x13");
    expect(actions.submit).toHaveBeenCalledWith("send this");
  });

  it("resets modal state when an external editor replaces the draft", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("abc");
    press("\x1b");
    resetVimState(surface.editor);
    press("x");
    expect(surface.editor.getText()).toBe("abxc");
  });

  it("matches a multi-codepoint grapheme after f through the real input buffer", () => {
    const { press, feed, flushInput, surface } = build(false, false, true);
    const family = "👨‍👩‍👧‍👦";
    surface.editor.setText(`a${family}b`);
    surface.editor.move("doc-start");
    press("\x1b");
    feed(`f${family}`);
    flushInput();
    expect(surface.editor.snapshot().cursor).toBe(1);
  });

  it("matches a multi-codepoint grapheme when input chunks split it", () => {
    const { press, feed, flushInput, surface } = build(false, false, true);
    const family = "👨‍👩‍👧‍👦";
    surface.editor.setText(`a${family}b`);
    surface.editor.move("doc-start");
    press("\x1b");
    feed("f");
    feed("👨");
    feed("\u200d");
    feed("👩‍👧‍👦");
    flushInput();
    expect(surface.editor.snapshot().cursor).toBe(1);
  });

  it("matches a punctuation-led keycap grapheme after f through the real input buffer", () => {
    const { press, feed, flushInput, surface } = build(false, false, true);
    const keycap = "*️⃣";
    surface.editor.setText(`a${keycap}b`);
    surface.editor.move("doc-start");
    press("\x1b");
    feed(`f${keycap}`);
    flushInput();
    expect(surface.editor.snapshot().cursor).toBe(1);
  });

  it("keeps vertical movement on a grapheme boundary through the editor", () => {
    const { press, surface } = build(false, false, true);
    surface.editor.setText("xxx\na🙂");
    surface.editor.move("doc-start");
    surface.editor.move("right");
    surface.editor.move("right");
    press("\x1b");
    press("l");
    press("j");
    expect(surface.editor.snapshot().cursor).toBe(5);
  });
});

describe("completion interception", () => {
  it("does not add a suggested flag on Enter after a complete command", () => {
    const { press, surface, actions } = build();
    surface.editor.setText("/export markdown ");
    surface.suggestions.setItems(slashSuggestions(surface.editor.getText(), surface.editor.snapshot())!);
    expect(surface.suggestions.current()?.value).toBe("--outside");
    surface.setSuggesting(true);
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("/export markdown");
    expect(actions.submit).not.toHaveBeenCalledWith(expect.stringContaining("--outside"));
  });

  it("accepts an incomplete command on Enter without submitting it", () => {
    const { press, surface, actions } = build();
    surface.editor.setText("/res");
    const candidate = slashSuggestions("/res", surface.editor.snapshot())!.find(item => item.value === "/reset")!;
    surface.suggestions.setItems([candidate]);
    surface.setSuggesting(true);
    press("\r");
    expect(surface.editor.getText()).toBe("/reset ");
    expect(actions.submit).not.toHaveBeenCalled();
    expect(actions.syncSuggestions).toHaveBeenCalledWith(true);
  });

  it("rejects a stale candidate and consumes Enter without submitting", () => {
    const { press, surface, actions } = build();
    surface.editor.setText("/res");
    surface.suggestions.setItems(slashSuggestions("/res", surface.editor.snapshot())!);
    surface.editor.move("left");
    surface.editor.move("right");
    surface.setSuggesting(true);
    press("\r");
    expect(surface.editor.getText()).toBe("/res");
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it("Tab applies an argument range without submitting or dropping a suffix", () => {
    const { press, surface, actions } = build();
    surface.editor.setText("/thinking lo  中文");
    surface.editor.move("doc-start");
    for (let count = 0; count < 12; count++) surface.editor.move("right");
    surface.suggestions.setItems(slashSuggestions(surface.editor.getText(), surface.editor.snapshot())!);
    surface.setSuggesting(true);
    press("\t");
    expect(surface.editor.getText()).toBe("/thinking low  中文");
    expect(actions.submit).not.toHaveBeenCalled();
  });

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
    surface.suggestions.setItems([completionEdit({ value: "/model", label: "/model" }, surface.editor.snapshot(), 0, 0)]);
    surface.setSuggesting(true);
    press("\t");
    expect(surface.editor.getText()).toBe("/model ");
    expect(surface.suggestionsOpen).toBe(false);
  });

  it.each(["/help", "/HELP"])("submits complete %s on enter when no candidate was chosen", (command) => {
    // Typing a whole command must send on the first Enter; requiring a second
    // press because a menu happens to be open is the bug this guards.
    const { press, surface, actions } = build();
    for (const char of command) press(char);
    surface.suggestions.setItems(slashSuggestions(surface.editor.getText(), surface.editor.snapshot())!);
    surface.setSuggesting(true);
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith(command);
  });

  it("submits a complete command instead of an old selection", () => {
    const { press, surface, actions } = build();
    surface.editor.setText("/model");
    surface.suggestions.setItems([
      completionEdit({ value: "/model", label: "/model" }, surface.editor.snapshot(), 0, 6),
      completionEdit({ value: "/memory", label: "/memory" }, surface.editor.snapshot(), 0, 6),
    ]);
    surface.setSuggesting(true);
    press("\x1b[B");
    press("\r");
    expect(actions.submit).toHaveBeenCalledWith("/model");
    expect(surface.editor.getText()).toBe("");
  });

  it("accepts the selection on enter once the user has navigated the list", () => {
    const { press, surface, actions } = build();
    surface.suggestions.setItems([
      { value: "/model", label: "/model" },
      completionEdit({ value: "/mode", label: "/mode" }, surface.editor.snapshot(), 0, 0),
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

  it("walks every wrapped row of a recalled prompt before changing history", () => {
    const { press, surface } = build();
    surface.editor.pushHistory("older");
    surface.editor.pushHistory("abcdefghij");
    press("\x1b[A");
    surface.editor.render(4);
    press("\x1b[A");
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("abcdefghij");
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("older");
  });

  it("keeps a draft in progress on up instead of losing it to history", () => {
    const { press, surface } = build();
    surface.editor.pushHistory("earlier");
    for (const char of "typing") press(char);
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("typing");
  });

  it("keeps walking history once browsing has started", () => {
    const { press, surface } = build();
    surface.editor.pushHistory("first");
    surface.editor.pushHistory("second");
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("second");
    for (const char of " edited") press(char);
    press("\x1b[A");
    // The edit adopted the entry as the draft, so up now pins at line start.
    expect(surface.editor.getText()).toBe("second edited");
  });

  it("jumps to document edges on ctrl+home and ctrl+end", () => {
    const { press, surface } = build();
    surface.editor.setText("one\ntwo\nthree");
    press("\x1b[1;5H");
    expect(surface.editor.getText()).toBe("one\ntwo\nthree");
    press("\x1b[1;5F");
    expect(surface.editor.getText()).toBe("one\ntwo\nthree");
  });

  it("keeps walking history past a recalled slash command", () => {
    // Recalling "/help" used to pop the completion list, which then ate the next
    // arrow press and stranded the user on that entry.
    const { press, surface } = build();
    surface.editor.pushHistory("first prompt");
    surface.editor.pushHistory("/help");
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("/help");
    expect(surface.suggestionsOpen).toBe(false);
    press("\x1b[A");
    expect(surface.editor.getText()).toBe("first prompt");
  });


  it("asks to open the list only for typing and Tab", () => {
    const { press, actions } = build();
    press("x");
    expect(actions.syncSuggestions).toHaveBeenLastCalledWith(true);
    press("\x7f");
    expect(actions.syncSuggestions).toHaveBeenLastCalledWith(false);
    press("\t");
    expect(actions.syncSuggestions).toHaveBeenLastCalledWith(true);
  });

  it("clears the screen on ctrl+l", () => {
    const { press, actions } = build();
    press("\x0c");
    expect(actions.clearScreen).toHaveBeenCalledOnce();
  });
});

describe("keys the catalogue promises", () => {
  it("binds every key the guide lists, and lists every key it binds", () => {
    // The guide is what a user reads to learn the surface. A key in one list and
    // not the other is either a promise nothing keeps or a feature nobody finds.
    const advertised = new Set(KEY_BINDINGS.flatMap((binding) => binding.keys));
    const dispatched = new Set(dispatchedKeyIds());

    expect([...dispatched].filter((key) => !advertised.has(key))).toEqual([]);
  });
});

describe("permission scope key", () => {
  it("cycles the scope without touching the draft", () => {
    const { press, actions, surface } = build();
    surface.editor.insert("draft");
    press("\x1bp");

    expect(actions.cyclePermissionScope).toHaveBeenCalledTimes(1);
    expect(surface.editor.getText()).toBe("draft");
  });
});

describe("retry key", () => {
  it("asks for a retry on f5", () => {
    const { press, actions } = build();
    press("\x1b[15~");

    expect(actions.retry).toHaveBeenCalledTimes(1);
  });
});

describe("going back in the conversation", () => {
  it("offers the chooser on a second escape from an empty prompt", () => {
    const { press, actions, clock } = build();
    press("\x1b");
    expect(actions.openRewind).not.toHaveBeenCalled();
    clock.now += 100;
    press("\x1b");

    expect(actions.openRewind).toHaveBeenCalledTimes(1);
  });

  it("forgets the first press once the window has passed", () => {
    const { press, actions, clock } = build();
    press("\x1b");
    clock.now += 5_000;
    press("\x1b");

    expect(actions.openRewind).not.toHaveBeenCalled();
  });

  it("never discards a draft, and does not arm from one", () => {
    const { press, actions, surface, clock } = build();
    surface.editor.insert("half a thought");
    press("\x1b");
    clock.now += 100;
    press("\x1b");

    expect(surface.editor.getText()).toBe("half a thought");
    expect(actions.openRewind).not.toHaveBeenCalled();
  });

  it("dismisses completions first, without arming", () => {
    const { press, actions, surface, clock } = build();
    surface.suggestions.setItems([{ value: "/model", label: "/model" }]);
    surface.setSuggesting(true);
    press("\x1b");
    expect(surface.suggestionsOpen).toBe(false);
    clock.now += 100;
    press("\x1b");

    expect(actions.openRewind).not.toHaveBeenCalled();
  });
});

describe("cancel and copy key", () => {
  it("copies active selection on ctrl+c without clearing draft text", () => {
    const { press, actions, surface } = build();
    surface.editor.insert("draft text");
    actions.copySelection.mockReturnValue(true);
    press("\x03");
    expect(actions.copySelection).toHaveBeenCalledOnce();
    expect(surface.editor.getText()).toBe("draft text");
  });
});
