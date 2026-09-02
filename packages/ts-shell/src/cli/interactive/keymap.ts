import type { CursorMove, KillTarget } from "../../presentation/tui/editor.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";
import type { InteractiveSurface } from "./frameSurface.js";

/**
 * Key routing for the interactive surface.
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

export interface KeymapActions {
  /** Submit the current draft; the host decides whether it runs or queues. */
  submit(text: string): void;
  /** Escape while a turn is running. */
  interrupt(): void;
  /** Leave the session. */
  exit(): void;
  /** Repaint after a state change. */
  redraw(): void;
  /** Clear the visible transcript and the terminal's scrollback. */
  clearScreen(): void;
  /**
   * Schedule a repaint after `delayMs`. Used for hints that expire on a clock
   * rather than on an event: without it, "press again to exit" stays on screen
   * after the press would no longer exit.
   */
  redrawAfter(delayMs: number): void;
  /** Cycle the agent mode between planning and building. */
  cycleAgentMode(): void;
  /** Cycle how much a turn may do without asking. */
  cyclePermissionScope(): void;
  /** Run the last turn again, if the last one failed. */
  retry(): void;
  /** Open the long text under the caret — or the whole draft — full screen. */
  expandDraft(): void;
  /**
   * Recompute completions for the current draft. `mayOpen` is true only for the
   * gestures that should be able to *open* the list — typing and Tab. Every other
   * draft change may refine an open list but must never pop one up, or the list
   * steals the arrow keys from prompt-history recall.
   */
  syncSuggestions(mayOpen: boolean): void;
}

export interface KeymapContext {
  readonly surface: InteractiveSurface;
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
  readonly gesture: { lastCancelAt?: number };
}

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
    "ctrl+o",
    "enter",
    "backspace",
    "delete",
    "ctrl+y",
    "ctrl+z",
    "tab",
    "shift+tab",
    "alt+p",
    "f5",
    "up",
    "down",
  ];
}

/** Apply one keystroke to the surface. */
export function routeKey(event: ParsedKeyEvent, context: KeymapContext): void {
  const { surface, actions } = context;
  const editor = surface.editor;

  if (surface.suggestionsOpen && consumeSuggestionKey(event, context)) return;

  switch (event.keyId) {
    case "escape":
      if (surface.suggestionsOpen) surface.setSuggesting(false);
      else if (context.busy) actions.interrupt();
      actions.redraw();
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
    case "ctrl+o":
      actions.expandDraft();
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
  const { surface, actions } = context;
  const moved = surface.editor.move(direction === -1 ? "up" : "down");
  if (!moved && surface.editor.recall(direction)) {
    surface.setSuggesting(false);
  }
  actions.redraw();
}

/** Whether a key is one of the gestures allowed to open the completion list. */
function opensSuggestions(event: ParsedKeyEvent): boolean {
  return Boolean(event.text) && !event.ctrl && !event.alt && !event.meta;
}

/** Motions, kills, newlines, and printable text. Returns false when unhandled. */
function applyTableKey(event: ParsedKeyEvent, context: KeymapContext): boolean {
  const editor = context.surface.editor;
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
  const { surface, actions } = context;
  if (event.keyId === "up" || event.keyId === "down") {
    surface.suggestions.step(event.keyId === "up" ? -1 : 1);
    actions.redraw();
    return true;
  }
  // Tab always completes. Enter completes only when a candidate was actively
  // selected; otherwise it submits, so typing a whole command still sends on the
  // first press.
  if (event.keyId === "tab" || (event.keyId === "enter" && surface.suggestions.chosen)) {
    const chosen = surface.suggestions.current();
    if (!chosen) return false;
    surface.editor.setText(`${chosen.value} `);
    surface.setSuggesting(false);
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
  const { surface, actions, now } = context;
  if (context.busy) {
    actions.interrupt();
    actions.redraw();
    return;
  }
  if (surface.editor.getText().length > 0) {
    surface.editor.clear();
    surface.setSuggesting(false);
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
  const { surface, actions } = context;
  const draft = surface.editor.getText().trim();
  if (!draft) {
    actions.redraw();
    return;
  }
  // History keeps the draft as it looked, so recalling it brings back a short line
  // rather than the whole pasted file. What is sent is the expansion.
  const submission = surface.pastes.expand(draft).trim();
  surface.editor.pushHistory(draft);
  surface.editor.clear();
  surface.setSuggesting(false);
  actions.submit(submission);
}
