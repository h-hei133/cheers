import type { CursorMove, KillTarget } from "../../presentation/tui/editor.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";
import type { InteractiveView, ViewActions } from "../../presentation/tui/view.js";

/**
 * Key routing for the interactive view.
 *
 * One table maps keys to editor motions and one to kill commands, so adding a
 * binding is a data change rather than another branch. The ordering of the
 * branches encodes the interception hierarchy: an open completion list consumes
 * navigation keys first, Escape then unwinds one level of state per press, and
 * only what nothing claimed reaches the editor as text.
 */

const MOTIONS: Record<string, CursorMove> = {
  left: "left",
  right: "right",
  "ctrl+b": "left",
  "ctrl+f": "right",
  "alt+left": "word-left",
  "alt+right": "word-right",
  "ctrl+left": "word-left",
  "ctrl+right": "word-right",
  "alt+b": "word-left",
  "alt+f": "word-right",
  home: "line-start",
  end: "line-end",
  "ctrl+a": "line-start",
  "ctrl+e": "line-end",
};

const KILLS: Record<string, KillTarget> = {
  "ctrl+k": "line-end",
  "ctrl+u": "line-start",
  "ctrl+w": "word-left",
  "alt+backspace": "word-left",
};

const NEWLINE_KEYS = new Set(["shift+enter", "alt+enter", "ctrl+j"]);

/** The host actions a key can reach; the seam names them once for every surface. */
export type KeymapActions = ViewActions;

export interface KeymapContext {
  readonly view: InteractiveView;
  readonly actions: KeymapActions;
  /** True while a turn is running. */
  readonly busy: boolean;
  /** Monotonic clock, used for the double-press exit gesture. */
  readonly now: () => number;
  /**
   * Host-owned gesture state, so the double-press window is per session.
   * `undefined` means no cancel has been pressed yet — distinct from a press at
   * time zero, which would otherwise let the very first Ctrl+C exit.
   */
  readonly gesture: { lastCancelAt?: number; lastEscapeAt?: number };
}

/**
 * Escape unwinds one level of state per press, and a second press with nothing
 * left to unwind means "back up" — which is a question about the conversation, not
 * about the keystroke, so it opens the chooser for going back.
 */
function handleEscapeKey(context: KeymapContext): void {
  const { view, actions, gesture, now } = context;
  if (view.suggestionsOpen) {
    view.setSuggesting(false);
    gesture.lastEscapeAt = undefined;
    actions.redraw();
    return;
  }
  if (context.busy) {
    actions.interrupt();
    gesture.lastEscapeAt = undefined;
    actions.redraw();
    return;
  }
  // A draft is never discarded by Escape — Ctrl+C is the key that does that, and
  // losing typing to a dismissal gesture is the worst possible trade. It does mean
  // going back is only offered from an empty prompt, which is also when a person is
  // deciding what to ask rather than writing it.
  if (view.editor.getText().length > 0) {
    gesture.lastEscapeAt = undefined;
    actions.redraw();
    return;
  }
  const last = gesture.lastEscapeAt;
  if (last !== undefined && now() - last < DOUBLE_ESCAPE_MS) {
    gesture.lastEscapeAt = undefined;
    actions.openRewind();
    return;
  }
  gesture.lastEscapeAt = now();
  actions.redraw();
}

/** Window in which a second Escape on an empty prompt offers to go back. */
const DOUBLE_ESCAPE_MS = 600;

/** Window in which a second Ctrl+C on an empty draft exits. */
const DOUBLE_INTERRUPT_MS = 600;

/**
 * Every key id this keymap dispatches on, for the test that keeps the guide and
 * the bindings from drifting apart.
 */
export function dispatchedKeyIds(): readonly string[] {
  return [
    ...Object.keys(MOTIONS),
    ...Object.keys(KILLS),
    ...NEWLINE_KEYS,
    "escape",
    "ctrl+c",
    "ctrl+d",
    "ctrl+l",
    "enter",
    "backspace",
    "delete",
    "ctrl+y",
    "ctrl+z",
    "tab",
    "shift+tab",
    "alt+p",
    "f5",
    "pageup",
    "pagedown",
    "shift+up",
    "shift+down",
    "up",
    "down",
  ];
}

/** Apply one keystroke to the view. */
export function routeKey(event: ParsedKeyEvent, context: KeymapContext): void {
  const { view, actions } = context;
  const editor = view.editor;

  if (view.suggestionsOpen && consumeSuggestionKey(event, context)) return;

  switch (event.keyId) {
    case "escape":
      handleEscapeKey(context);
      return;
    case "ctrl+c":
      handleCancelKey(context);
      return;
    case "ctrl+d":
      if (editor.getText().length === 0) actions.exit();
      return;
    case "ctrl+l":
      actions.clearScreen();
      return;
    case "enter":
      submitDraft(context);
      return;
    case "backspace":
      editor.backspace();
      break;
    case "delete":
      editor.deleteForward();
      break;
    case "ctrl+y":
      editor.yank();
      break;
    case "ctrl+z":
      editor.undo();
      break;
    case "tab":
      actions.syncSuggestions(true);
      actions.redraw();
      return;
    case "shift+tab":
      // Tab is completion, so mode cycling takes the shifted form.
      actions.cycleAgentMode();
      actions.redraw();
      return;
    case "alt+p":
      actions.cyclePermissionScope();
      actions.redraw();
      return;
    case "pageup":
      actions.scrollPage(-1);
      return;
    case "pagedown":
      actions.scrollPage(1);
      return;
    case "shift+down":
      actions.scroll(1);
      return;
    case "ctrl+end":
      // Page back to the live edge: one key does what many shift-downs do.
      actions.scrollToEnd();
      return;
    case "f5":
      // A function key rather than a modified chord: every terminal delivers F5
      // verbatim, while modified Enter and friends get folded or swallowed.
      actions.retry();
      return;
    case "up":
      recallOrMove(context, -1);
      return;
    case "down":
      recallOrMove(context, 1);
      return;
    default:
      if (!applyTableKey(event, context)) return;
  }
  actions.syncSuggestions(opensSuggestions(event));
  actions.redraw();
}

/**
 * Arrow keys move within a multi-line draft first, and walk prompt history once
 * the caret has nowhere left to go. Recall closes any completion list: the draft
 * it just loaded is a past prompt, not something the user is composing, and
 * leaving the list open would consume the next arrow press.
 */
function recallOrMove(context: KeymapContext, direction: 1 | -1): void {
  const { view, actions } = context;
  const moved = view.editor.move(direction === -1 ? "up" : "down");
  if (!moved && view.editor.recall(direction)) {
    view.setSuggesting(false);
  }
  actions.redraw();
}

/** Whether a key is one of the gestures allowed to open the completion list. */
function opensSuggestions(event: ParsedKeyEvent): boolean {
  return Boolean(event.text) && !event.ctrl && !event.alt && !event.meta;
}

/** Motions, kills, newlines, and printable text. Returns false when unhandled. */
function applyTableKey(event: ParsedKeyEvent, context: KeymapContext): boolean {
  const editor = context.view.editor;
  const motion = MOTIONS[event.keyId];
  if (motion) {
    editor.move(motion);
    return true;
  }
  const kill = KILLS[event.keyId];
  if (kill) {
    editor.kill(kill);
    return true;
  }
  if (NEWLINE_KEYS.has(event.keyId)) {
    editor.newline();
    return true;
  }
  if (opensSuggestions(event)) {
    editor.insert(event.text);
    return true;
  }
  return false;
}

/** Navigation and acceptance while the completion list is open. */
function consumeSuggestionKey(event: ParsedKeyEvent, context: KeymapContext): boolean {
  const { view, actions } = context;
  if (event.keyId === "up" || event.keyId === "down") {
    view.suggestions.step(event.keyId === "up" ? -1 : 1);
    actions.redraw();
    return true;
  }
  // Tab always completes. Enter completes only when a candidate was actively
  // selected; otherwise it submits, so typing a whole command still sends on the
  // first press.
  if (event.keyId === "tab" || (event.keyId === "enter" && view.suggestions.chosen)) {
    const chosen = view.suggestions.current();
    if (!chosen) return false;
    view.editor.setText(`${chosen.value} `);
    view.setSuggesting(false);
    actions.redraw();
    return true;
  }
  return false;
}

/**
 * Ctrl+C discards a draft first so an accidental press never ends the session;
 * on an empty prompt a second press within the double-press window exits.
 */
function handleCancelKey(context: KeymapContext): void {
  const { view, actions, now } = context;
  if (actions.copySelection?.()) {
    actions.redraw();
    return;
  }
  if (context.busy) {
    actions.interrupt();
    actions.redraw();
    return;
  }
  if (view.editor.getText().length > 0) {
    view.editor.clear();
    view.setSuggesting(false);
    actions.redraw();
    return;
  }
  const at = now();
  const previous = context.gesture.lastCancelAt;
  if (previous !== undefined && at - previous < DOUBLE_INTERRUPT_MS) {
    actions.exit();
    return;
  }
  context.gesture.lastCancelAt = at;
  actions.redraw();
  actions.redrawAfter(DOUBLE_INTERRUPT_MS);
}

function submitDraft(context: KeymapContext): void {
  const { view, actions } = context;
  const draft = view.editor.getText().trim();
  if (!draft) {
    actions.redraw();
    return;
  }
  // History keeps the draft as it looked, so recalling it brings back a short line
  // rather than the whole pasted file. What is sent is the expansion.
  const submission = view.pastes.expand(draft).trim();
  view.editor.pushHistory(draft);
  view.editor.clear();
  view.setSuggesting(false);
  actions.submit(submission);
}
