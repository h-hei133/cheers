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

export interface KeyBinding {
  /** Key ids that trigger this, most idiomatic first. */
  readonly keys: readonly string[];
  readonly does: string;
  readonly group: KeyGroup;
  /** True when the terminal must negotiate modifier reporting for it to arrive. */
  readonly negotiated?: boolean;
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
  { keys: ["pageup", "pagedown"], does: "scroll the conversation by a screen", group: "moving" },
  { keys: ["shift+up", "shift+down"], does: "scroll the conversation by a line", group: "moving" },

  { keys: ["backspace"], does: "delete the character before the caret", group: "editing" },
  { keys: ["delete"], does: "delete the character under the caret", group: "editing" },
  { keys: ["ctrl+w", "alt+backspace"], does: "delete the word before the caret", group: "editing" },
  { keys: ["ctrl+u"], does: "cut back to the start of the line, then the line above", group: "editing" },
  { keys: ["ctrl+k"], does: "delete to the end of the line", group: "editing" },
  { keys: ["ctrl+y"], does: "put back what was last deleted", group: "editing" },
  { keys: ["ctrl+z"], does: "undo the last edit", group: "editing" },

  {
    keys: ["paste twice"],
    does: "show a held paste in full, in the prompt",
    group: "editing",
  },
  { keys: ["enter"], does: "send, or queue while a turn is running", group: "sending" },
  { keys: ["ctrl+j"], does: "insert a newline without sending", group: "sending" },
  { keys: ["shift+enter", "alt+enter"], does: "insert a newline", group: "sending", negotiated: true },
  { keys: ["tab"], does: "complete a command name", group: "sending" },
  { keys: ["escape"], does: "interrupt a run, or dismiss a chooser", group: "sending" },

  { keys: ["shift+tab"], does: "switch between planning and building", group: "session" },
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

const GROUP_TITLES: Record<KeyGroup, string> = {
  moving: "Moving",
  editing: "Editing",
  sending: "Sending",
  session: "Session",
  pointer: "Mouse",
};

/**
 * The whole table as Markdown, grouped, with the keys a terminal may not deliver
 * marked as such rather than silently listed alongside ones that always work.
 */
export function renderKeyGuide(negotiated: boolean): string {
  const lines: string[] = [];
  for (const group of Object.keys(GROUP_TITLES) as KeyGroup[]) {
    const bindings = KEY_BINDINGS.filter((binding) => binding.group === group);
    if (bindings.length === 0) continue;
    lines.push(`### ${GROUP_TITLES[group]}`, "", "| Key | Does |", "| :--- | :--- |");
    for (const binding of bindings) {
      const keys = binding.keys.map((key) => `\`${key}\``).join(" / ");
      const caveat = binding.negotiated && !negotiated ? " *(this terminal did not offer it)*" : "";
      lines.push(`| ${keys} | ${binding.does}${caveat} |`);
    }
    lines.push("");
  }
  lines.push(
    negotiated
      ? "This terminal reports modified keys, so the shifted chords above are available."
      : "This terminal does not report modified keys, so `ctrl+j` is the newline that always works.",
  );
  return lines.join("\n");
}
