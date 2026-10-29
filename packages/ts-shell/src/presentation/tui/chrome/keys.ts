import type { ReportLine, ReportSpan } from "../../../core/commands/report/contract.js";
import { createReport, span } from "../../../core/commands/report/projection.js";

/**
 * The keys this surface binds, in one place.
 *
 * The keymap dispatches on key id, the hint row names one or two keys, and the
 * catalogue prints all of them. Those three were separate lists, which is how a
 * hint ends up advertising a key the keymap no longer binds. This table is the
 * single source: the keymap's dispatch tables are built from it, and anything
 * that shows a key to the user reads it.
 */

export type KeyGroup = "moving" | "editing" | "sending" | "session" | "pointer";

/**
 * The paste gesture's key cell.
 *
 * Not a key id: the terminal sends the paste, so there is nothing to bind. The
 * catalogue still has to name it, and three places ask "is this the paste row",
 * so they ask this rather than repeating the phrase.
 */
export const PASTE_GESTURE = "paste on a held block";

export interface KeyBinding {
  /** Key ids that trigger this, most idiomatic first. */
  readonly keys: readonly string[];
  readonly does: string;
  readonly group: KeyGroup;
  /** True when the terminal must negotiate modifier reporting for it to arrive. */
  readonly negotiated?: boolean;
  /** Per-key capability requirements for a row with mixed alternatives. */
  readonly negotiatedKeys?: readonly string[];
}

export const KEY_BINDINGS: readonly KeyBinding[] = [
  { keys: ["left", "right", "ctrl+b", "ctrl+f"], does: "move by character", group: "moving" },
  {
    keys: ["alt+left", "alt+right", "ctrl+left", "ctrl+right", "alt+b", "alt+f"],
    does: "move by word",
    group: "moving",
  },
  { keys: ["home", "ctrl+a"], does: "start of line", group: "moving" },
  { keys: ["end", "ctrl+e"], does: "end of line", group: "moving" },
  { keys: ["up", "down"], does: "move between lines, then walk prompt history (a draft in progress stays put)", group: "moving" },
  { keys: ["ctrl+home", "ctrl+end"], does: "first/last line of the draft, or oldest/newest conversation when empty", group: "moving" },
  {
    keys: ["ctrl+shift+f"],
    does: "find text in the conversation; enter/↓ and shift+enter/↑ walk the matches, escape closes",
    group: "moving",
    negotiated: true,
  },
  { keys: ["pageup", "pagedown"], does: "scroll the conversation by a screen", group: "moving" },
  { keys: ["shift+up", "shift+down"], does: "scroll the conversation by a few rows", group: "moving" },

  { keys: ["backspace"], does: "delete the character before the caret", group: "editing" },
  { keys: ["delete"], does: "delete the character under the caret", group: "editing" },
  { keys: ["ctrl+w", "alt+backspace"], does: "delete the word before the caret", group: "editing" },
  { keys: ["ctrl+u"], does: "cut back to the start of the line, then the line above", group: "editing" },
  { keys: ["ctrl+k"], does: "delete to the end of the line", group: "editing" },
  { keys: ["ctrl+y"], does: "put back what was last deleted", group: "editing" },
  { keys: ["alt+y"], does: "cycle back through earlier deletions", group: "editing" },
  { keys: ["ctrl+z"], does: "undo the last edit", group: "editing" },
  { keys: ["ctrl+shift+z"], does: "redo the last undone edit", group: "editing", negotiated: true },

  {
    keys: [PASTE_GESTURE],
    does: "show that paste in full, in the prompt",
    group: "editing",
  },
  { keys: ["enter"], does: "send; while a turn runs, steer it before its next step", group: "sending" },
  { keys: ["ctrl+j"], does: "insert a newline without sending", group: "sending" },
  { keys: ["shift+enter"], does: "insert a newline", group: "sending", negotiated: true },
  {
    keys: ["alt+enter"],
    does: "insert a newline",
    group: "sending",
    negotiated: true,
  },
  { keys: ["ctrl+q"], does: "queue the draft to run after the current turn", group: "sending" },
  { keys: ["tab"], does: "complete a command name", group: "sending" },
  { keys: ["ctrl+s"], does: "set the draft aside, or take it back", group: "sending" },
  {
    keys: ["escape"],
    does: "interrupt a run, dismiss a chooser; twice on an empty prompt goes back",
    group: "sending",
  },

  { keys: ["shift+tab"], does: "switch between planning and building", group: "session" },
  { keys: ["ctrl+t"], does: "collapse or expand the model's reasoning", group: "session" },
  { keys: ["ctrl+o"], does: "collapse or expand tool output", group: "session" },
  { keys: ["ctrl+g"], does: "edit the draft in your own editor", group: "session" },
  { keys: ["alt+v"], does: "attach the image on your clipboard", group: "session" },
  { keys: ["alt+p"], does: "cycle how much a turn may do without asking", group: "session" },
  { keys: ["f5"], does: "retry the last turn that failed", group: "session" },
  { keys: ["ctrl+l"], does: "clear the conversation from the screen", group: "session" },
  { keys: ["ctrl+c"], does: "cancel a run; press twice to leave", group: "session" },
  { keys: ["ctrl+d"], does: "leave the session", group: "session" },

  // The pointer only works because the session has a screen of its own; on the
  // normal screen the wheel and the drag belong to the terminal.
  { keys: ["wheel"], does: "scroll the conversation", group: "pointer" },
  { keys: ["drag"], does: "select and copy, without the layout", group: "pointer" },
  { keys: ["click"], does: "open or close the block under the pointer", group: "pointer" },
  { keys: ["shift+drag"], does: "hand the drag to the terminal instead", group: "pointer" },
];

const GROUPS: Record<KeyGroup, string> = {
  moving: 'Moving', editing: 'Editing', sending: 'Sending', session: 'Session', pointer: 'Mouse',
};

/** The effective bindings, including unbound actions and terminal caveats. */
export function keyReport(negotiated: boolean, bindings: readonly KeyBinding[]) {
  const lines: ReportLine[] = [];
  for (const group of Object.keys(GROUPS) as KeyGroup[]) {
    const entries = bindings.filter(binding => binding.group === group);
    if (entries.length === 0) continue;
    lines.push({ kind: 'heading', spans: [span(GROUPS[group], 'heading')] });
    for (const binding of entries) lines.push({ kind: 'columns', cells: [keySpans(binding, negotiated), [span(binding.does)]] });
    lines.push({ kind: 'space' });
  }
  lines.push({ kind: 'text', spans: [span(negotiated ? 'This terminal reports modified keys.'
    : 'This terminal does not report modified keys; use an unmarked alternative where available.', negotiated ? 'text' : 'warning')] });
  return createReport({ title: 'Keyboard and mouse', columns: [{ label: 'Key', minWidth: 18 }, { label: 'Does', minWidth: 24 }], lines,
    facts: { modifierKeysReported: negotiated, bindings: bindings.map(binding => ({ group: binding.group, action: binding.does,
      keys: binding.keys.map(key => ({ key, requiresProtocol: requiresProtocol(binding, key),
        status: requiresProtocol(binding, key) && !negotiated ? 'not-reported' : 'bound' })) })) },
  });
}

function requiresProtocol(binding: KeyBinding, key: string): boolean {
  return binding.negotiatedKeys?.includes(key) ?? binding.negotiated ?? false;
}

function keySpans(binding: KeyBinding, negotiated: boolean): ReportSpan[] {
  if (binding.keys.length === 0) return [span('(unbound)', 'warning')];
  return binding.keys.flatMap((key, index) => [
    ...(index === 0 ? [] : [span(' / ')]), span(key, 'key'),
    ...(requiresProtocol(binding, key) && !negotiated ? [span(' (not reported)', 'warning')] : []),
  ]);
}
