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
  /** Recompute completions after the draft changed. */
  refreshSuggestions(): void;
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
      actions.refreshSuggestions();
      surface.setSuggesting(true);
      actions.redraw();
      return;
    case "up":
      if (!editor.move("up")) editor.recall(-1);
      break;
    case "down":
      if (!editor.move("down")) editor.recall(1);
      break;
    default:
      if (!applyTableKey(event, context)) return;
  }
  actions.refreshSuggestions();
  actions.redraw();
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
  if (event.text && !event.ctrl && !event.alt && !event.meta) {
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
}

function submitDraft(context: KeymapContext): void {
  const { surface, actions } = context;
  const text = surface.editor.getText().trim();
  if (!text) {
    actions.redraw();
    return;
  }
  surface.editor.pushHistory(text);
  surface.editor.clear();
  surface.setSuggesting(false);
  actions.submit(text);
}
