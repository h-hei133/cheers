import type { CursorMove, KillTarget } from "../../presentation/tui/editor.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";
import type { InteractiveView, ViewActions } from "../../presentation/tui/surface/contract.js";
import { KEY_ACTIONS, type Keybindings } from "./keybindings.js";

/**
 * Key routing for the interactive view.
 *
 * One table maps every action to a handler and another maps every key to an
 * action, so a binding is a data change and a rebinding is a config change. The
 * ordering of the interception points encodes the hierarchy: an open completion
 * list consumes navigation keys first, Escape then unwinds one level of state per
 * press, and only what nothing claimed reaches the editor as text.
 *
 * A key no action claims is not an error — it falls through to the editor, which
 * inserts it if it is printable. That is what keeps an unbound key from being a
 * dead key.
 */

/** Motions, expressed as the editor motion each action performs. */
const MOTION_ACTIONS: Record<string, CursorMove> = {
  "tui.editor.cursorLeft": "left",
  "tui.editor.cursorRight": "right",
  "tui.editor.cursorWordLeft": "word-left",
  "tui.editor.cursorWordRight": "word-right",
  "tui.editor.cursorLineStart": "line-start",
  "tui.editor.cursorLineEnd": "line-end",
};

/** Cuts, expressed as the editor kill each action performs. */
const KILL_ACTIONS: Record<string, KillTarget> = {
  "tui.editor.deleteToLineEnd": "line-end",
  "tui.editor.deleteToLineStart": "line-start",
  "tui.editor.deleteWordBackward": "word-left",
};

/** Rows moved per keystroke for shift+arrow fast scrolling. */
const FAST_SCROLL_ROWS = 5;

/** Window in which a second Escape on an empty prompt offers to go back. */
const DOUBLE_ESCAPE_MS = 600;

/** Window in which a second Ctrl+C on an empty draft exits. */
const DOUBLE_INTERRUPT_MS = 600;

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
  /** The bindings in force, resolved from the catalogue and the user's file. */
  readonly keybindings: Keybindings;
}

/**
 * Every key id this keymap can dispatch on, for the test that keeps the guide and
 * the bindings from drifting apart.
 *
 * Derived from the catalogue rather than listed, so a new action cannot be added
 * without the guide check seeing it.
 */
export function dispatchedKeyIds(): readonly string[] {
  const keys: string[] = [];
  for (const definition of Object.values(KEY_ACTIONS)) keys.push(...definition.defaultKeys);
  return keys;
}

/** Apply one keystroke to the view. */
export function routeKey(event: ParsedKeyEvent, context: KeymapContext): void {
  const { view, actions } = context;

  if (view.suggestionsOpen && consumeSuggestionKey(event, context)) return;

  const action = context.keybindings.actionFor(event.keyId);
  if (action === undefined) {
    // Nothing claims this key, so it is text as far as the surface is concerned.
    applyTextKey(event, context);
    return;
  }

  const handled = runAction(action, event, context);
  if (handled === "text") applyTextKey(event, context);
  else if (handled === "resync") resync(event, context);
}

/**
 * What an action did, which decides whether the caller does anything after.
 *
 * `redrawn` means the action rendered for itself and nothing more should happen;
 * `resync` means the draft may have changed, so completions are re-evaluated.
 */
type ActionOutcome = "redrawn" | "resync" | "text" | "nothing";

function runAction(action: string, event: ParsedKeyEvent, context: KeymapContext): ActionOutcome {
  const { view, actions } = context;
  const editor = view.editor;

  const motion = MOTION_ACTIONS[action];
  if (motion) {
    editor.move(motion);
    return "resync";
  }
  const kill = KILL_ACTIONS[action];
  if (kill) {
    editor.kill(kill);
    return "resync";
  }

  switch (action) {
    case "tui.editor.cursorUp":
      recallOrMove(context, -1);
      return "redrawn";
    case "tui.editor.cursorDown":
      recallOrMove(context, 1);
      return "redrawn";
    case "tui.editor.pageUp":
      actions.scrollPage(-1);
      return "redrawn";
    case "tui.editor.pageDown":
      actions.scrollPage(1);
      return "redrawn";
    case "app.scroll.fastUp":
      actions.scroll(-FAST_SCROLL_ROWS);
      return "redrawn";
    case "app.scroll.fastDown":
      actions.scroll(FAST_SCROLL_ROWS);
      return "redrawn";
    case "tui.editor.deleteCharBackward":
      editor.backspace();
      return "resync";
    case "tui.editor.deleteCharForward":
      editor.deleteForward();
      return "resync";
    case "tui.editor.yank":
      editor.yank();
      return "resync";
    case "tui.editor.yankPop":
      // Cycling back through the kill ring, so the cut before the last one is
      // reachable. Without it a yank only ever reaches the newest entry.
      editor.yankPop();
      return "resync";
    case "tui.editor.undo":
      editor.undo();
      return "resync";
    case "tui.editor.redo":
      // The way back from an undo. Bound alongside it because an undo that
      // cannot be taken back is a key that is dangerous to press.
      editor.redo();
      return "resync";
    case "tui.input.newLine":
      editor.newline();
      return "resync";
    case "tui.input.submit":
      submitDraft(context, context.busy ? "steer" : undefined);
      return "redrawn";
    case "tui.input.tab":
      actions.syncSuggestions(true);
      actions.redraw();
      return "redrawn";
    case "tui.altScreen.top":
      return handleEdge(context, "start");
    case "tui.altScreen.bottom":
      return handleEdge(context, "end");
    case "tui.altScreen.search":
      actions.openSearch?.();
      return "redrawn";
    case "app.interrupt":
      handleEscapeKey(context);
      return "redrawn";
    case "app.clear":
      handleCancelKey(context);
      return "redrawn";
    case "app.exit":
      if (editor.getText().length === 0) actions.exit();
      return "redrawn";
    case "app.clearScreen":
      actions.clearScreen();
      return "redrawn";
    case "app.message.followUp":
      // Only while a run is active: with nothing running there is no queue to
      // join, and the key does nothing rather than sending the draft by surprise.
      if (context.busy) {
        submitDraft(context, "followUp");
        return "redrawn";
      }
      return "nothing";
    case "app.thinking.cycle":
      // Tab is completion, so mode cycling takes the shifted form.
      actions.cycleAgentMode();
      actions.redraw();
      return "redrawn";
    case "app.thinking.toggle":
      actions.toggleCollapsed("thinking");
      actions.redraw();
      return "redrawn";
    case "app.tools.expand":
      actions.toggleCollapsed("tool");
      actions.redraw();
      return "redrawn";
    case "app.permission.cycle":
      actions.cyclePermissionScope();
      actions.redraw();
      return "redrawn";
    case "app.retry":
      // A function key by default rather than a modified chord: every terminal
      // delivers F5 verbatim, while modified Enter and friends get folded.
      actions.retry();
      return "redrawn";
    case "app.editor.external":
      actions.openExternalEditor?.();
      return "redrawn";
    case "app.editor.image":
      // Asynchronous, so the outcome arrives as a redraw rather than a return.
      // The action is optional: a surface without a clipboard simply does not
      // bind it, and the key falls through to the editor as text.
      actions.attachClipboardImage?.();
      return "redrawn";
    default:
      // An action with no handler here is one this surface does not implement.
      // Reported as unhandled so the key still reaches the editor as text rather
      // than being swallowed by a binding nothing answers.
      return "text";
  }
}

/**
 * The two edge actions are shared: inside a non-empty draft they move the caret,
 * and on an empty prompt the same key pages the conversation to that edge. The
 * dual meaning is what makes one key serve both without a second binding.
 */
function handleEdge(context: KeymapContext, edge: "start" | "end"): ActionOutcome {
  const { view, actions } = context;
  if (view.editor.getText().length > 0) {
    view.editor.move(edge === "start" ? "doc-start" : "doc-end");
    return "resync";
  }
  if (edge === "end") actions.scrollToEnd();
  else actions.scroll(1_000_000);
  return "redrawn";
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

/**
 * Arrow keys move within a multi-line draft first, and walk prompt history once
 * the caret has nowhere left to go. Recall closes any completion list: the draft
 * it just loaded is a past prompt, not something the user is composing, and
 * leaving the list open would consume the next arrow press.
 */
function recallOrMove(context: KeymapContext, direction: 1 | -1): void {
  const { view, actions } = context;
  const moved = view.editor.move(direction === -1 ? "up" : "down");
  if (moved) {
    actions.redraw();
    return;
  }
  // A draft in progress pins recall at the newest entry: pressing up from the
  // first line must not throw away what is being typed for a history entry.
  // An empty prompt, or one already showing a recalled entry, walks history.
  if (direction === -1 && view.editor.getText().trim().length > 0 && !view.editor.browsingHistory) {
    view.editor.move("line-start");
    actions.redraw();
    return;
  }
  if (view.editor.recall(direction)) {
    view.setSuggesting(false);
  }
  actions.redraw();
}

/** Whether a key is one of the gestures allowed to open the completion list. */
function opensSuggestions(event: ParsedKeyEvent): boolean {
  return Boolean(event.text) && !event.ctrl && !event.alt && !event.meta;
}

/** Re-evaluate completions after a key that may have changed the draft. */
function resync(event: ParsedKeyEvent, context: KeymapContext): void {
  context.actions.syncSuggestions(opensSuggestions(event));
  context.actions.redraw();
}

/** Printable text, which is what an unclaimed key is. */
function applyTextKey(event: ParsedKeyEvent, context: KeymapContext): void {
  if (!opensSuggestions(event)) {
    context.actions.redraw();
    return;
  }
  context.view.editor.insert(event.text);
  resync(event, context);
}

/** Navigation and acceptance while the completion list is open. */
function consumeSuggestionKey(event: ParsedKeyEvent, context: KeymapContext): boolean {
  const { view, actions, keybindings } = context;
  const action = keybindings.actionFor(event.keyId);
  if (action === "tui.editor.cursorUp" || action === "tui.editor.cursorDown") {
    view.suggestions.step(action === "tui.editor.cursorUp" ? -1 : 1);
    actions.redraw();
    return true;
  }
  const chosen = view.suggestions.current();
  const snapshot = view.editor.snapshot();
  const edit = chosen?.edit;
  const written = edit ? snapshot.text.slice(edit.from, edit.to) : "";
  const insertion = edit ? (edit.to === edit.snapshot.text.length ? edit.text.slice(0, -1) : edit.text) : "";
  const incomplete = edit !== undefined && written.length > 0 && (written.startsWith("/")
    ? written.toLowerCase() !== insertion.toLowerCase()
    : written !== insertion);
  const accepts = action === "tui.input.tab" ||
    (action === "tui.input.submit" && (view.suggestions.chosen || incomplete));
  if (accepts) {
    if (!chosen) return false;
    // A stale or unbound candidate must never edit or fall through to submit.
    if (chosen.edit) view.editor.replace(chosen.edit);
    view.setSuggesting(false);
    actions.syncSuggestions(true);
    actions.redraw();
    return true;
  }
  return false;
}

function submitDraft(context: KeymapContext, disposition?: "steer" | "followUp"): void {
  const { view, actions } = context;
  const draft = view.editor.getText().trim();
  if (!draft) {
    actions.redraw();
    return;
  }
  // History keeps the draft as it looked, so recalling it brings back a short line
  // rather than the whole pasted file. What is sent is the expansion.
  const submission = view.pastes.expand(draft).trim();
  // Images are collected beside the text rather than from it: the placeholder
  // stands for an attachment, and expanding the draft turns it back into the
  // words it stood for, which for an image is nothing.
  const images = view.pastes.imagesIn(draft);
  view.editor.pushHistory(draft);
  view.editor.clear();
  view.setSuggesting(false);
  // Omitted rather than passed as undefined when there is nothing attached, so a
  // caller reading the arguments sees only what was actually said.
  const attachments = images.length > 0 ? { images } : undefined;
  if (attachments) {
    if (disposition) actions.submit(submission, disposition, attachments);
    else actions.submit(submission, undefined, attachments);
  } else if (disposition) {
    actions.submit(submission, disposition);
  } else {
    actions.submit(submission);
  }
}
