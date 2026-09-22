import fs from "node:fs";
import path from "node:path";
import { resolveUserDataFile, userDataDirFor } from "../../core/paths/userHome.js";

/**
 * Which key does what, and how a user changes it.
 *
 * The catalogue below is the whole contract: every key the surface dispatches is
 * named here, and a key that is not in the catalogue is not a binding. Routing
 * consults the resolved table rather than switching on key ids, so rebinding is a
 * data change and a key that no action claims reaches the editor as text instead
 * of silently doing nothing.
 *
 * Action ids are namespaced by the surface they belong to, matching the convention
 * other tools in this space use. Where a name means the same thing here as it does
 * there, the same id is used, so a config file is portable. Where the meaning
 * differs the id differs too: sharing a name for a different action would give
 * someone moving their config a binding that silently does the wrong thing, which
 * is worse than an unfamiliar name.
 */

export interface KeybindingDefinition {
  /** Keys bound when the user has not rebound the action. Empty means unbound. */
  readonly defaultKeys: readonly string[];
  readonly description: string;
}

/**
 * Every rebindable action.
 *
 * Grouped by surface, and the group is part of the id. A definition with no
 * default is deliberately unbound: the action exists and can be bound, but no key
 * on a default keyboard should reach it.
 */
export const KEY_ACTIONS: Record<string, KeybindingDefinition> = {
  "tui.editor.cursorLeft": { defaultKeys: ["left", "ctrl+b"], description: "Move cursor left" },
  "tui.editor.cursorRight": { defaultKeys: ["right", "ctrl+f"], description: "Move cursor right" },
  "tui.editor.cursorUp": { defaultKeys: ["up"], description: "Move cursor up, then back through prompts" },
  "tui.editor.cursorDown": { defaultKeys: ["down"], description: "Move cursor down, then forward through prompts" },
  "tui.editor.cursorWordLeft": {
    defaultKeys: ["alt+left", "ctrl+left", "alt+b"],
    description: "Move cursor one word left",
  },
  "tui.editor.cursorWordRight": {
    defaultKeys: ["alt+right", "ctrl+right", "alt+f"],
    description: "Move cursor one word right",
  },
  "tui.editor.cursorLineStart": { defaultKeys: ["home", "ctrl+a"], description: "Move to line start" },
  "tui.editor.cursorLineEnd": { defaultKeys: ["end", "ctrl+e"], description: "Move to line end" },
  "tui.editor.pageUp": { defaultKeys: ["pageup"], description: "Scroll the conversation up a page" },
  "tui.editor.pageDown": { defaultKeys: ["pagedown"], description: "Scroll the conversation down a page" },
  "tui.editor.deleteCharBackward": { defaultKeys: ["backspace"], description: "Delete the character before the cursor" },
  "tui.editor.deleteCharForward": { defaultKeys: ["delete"], description: "Delete the character after the cursor" },
  "tui.editor.deleteWordBackward": {
    defaultKeys: ["ctrl+w", "alt+backspace"],
    description: "Delete the word before the cursor",
  },
  "tui.editor.deleteToLineStart": { defaultKeys: ["ctrl+u"], description: "Delete to the start of the line" },
  "tui.editor.deleteToLineEnd": { defaultKeys: ["ctrl+k"], description: "Delete to the end of the line" },
  "tui.editor.yank": { defaultKeys: ["ctrl+y"], description: "Paste the most recent cut" },
  "tui.editor.yankPop": { defaultKeys: ["alt+y"], description: "Cycle back through earlier cuts" },
  "tui.editor.undo": { defaultKeys: ["ctrl+z"], description: "Undo the last edit" },
  "tui.editor.redo": { defaultKeys: ["ctrl+shift+z"], description: "Take back the last undo" },
  "tui.input.newLine": {
    defaultKeys: ["shift+enter", "alt+enter", "ctrl+j"],
    description: "Insert a new line instead of sending",
  },
  "tui.input.submit": { defaultKeys: ["enter"], description: "Send the prompt" },
  "tui.input.tab": { defaultKeys: ["tab"], description: "Complete the highlighted candidate" },
  "tui.altScreen.top": { defaultKeys: ["ctrl+home"], description: "Go to the oldest rows, or the start of the draft" },
  "tui.altScreen.bottom": { defaultKeys: ["ctrl+end"], description: "Go to the newest rows, or the end of the draft" },
  "app.interrupt": { defaultKeys: ["escape"], description: "Dismiss a list, interrupt a run, or go back" },
  "app.clear": { defaultKeys: ["ctrl+c"], description: "Clear the draft, then exit on a second press" },
  "app.exit": { defaultKeys: ["ctrl+d"], description: "Exit when the draft is empty" },
  "app.clearScreen": { defaultKeys: ["ctrl+l"], description: "Clear the screen" },
  "app.message.followUp": { defaultKeys: ["ctrl+q"], description: "Queue a follow-up while a run is active" },
  "app.thinking.cycle": { defaultKeys: ["shift+tab"], description: "Cycle the thinking level" },
  "app.thinking.toggle": { defaultKeys: ["ctrl+t"], description: "Collapse or expand thinking blocks" },
  "app.tools.expand": { defaultKeys: ["ctrl+o"], description: "Collapse or expand tool output" },
  "app.permission.cycle": { defaultKeys: ["alt+p"], description: "Cycle the permission scope" },
  "app.retry": { defaultKeys: ["f5"], description: "Retry the last prompt" },
  "app.scroll.fastUp": { defaultKeys: ["shift+up"], description: "Scroll up several rows at once" },
  "app.scroll.fastDown": { defaultKeys: ["shift+down"], description: "Scroll down several rows at once" },
  "app.editor.external": { defaultKeys: ["ctrl+g"], description: "Edit the draft in an external editor" },
};

/** Keys bound to one action, as a config file writes them. */
export type KeybindingEntry = string | readonly string[];

export type KeybindingsConfig = Record<string, KeybindingEntry>;

/** Where the user's bindings live. */
export const KEYBINDINGS_FILE = "keybindings.json";

/** What was wrong with the file, in the terms the user needs to fix it. */
export interface KeybindingsProblem {
  readonly message: string;
}

export interface LoadedKeybindings {
  readonly config: KeybindingsConfig;
  readonly problems: readonly KeybindingsProblem[];
}

/**
 * The user's bindings, and anything wrong with them.
 *
 * A malformed file is reported rather than thrown: a typo in a keybinding should
 * not stop a session from starting, and the surface falls back to the defaults so
 * it still works. Problems are returned rather than logged so the caller can
 * decide where the user sees them.
 */
export function loadUserKeybindings(root?: string): LoadedKeybindings {
  const filePath = root === undefined
    ? resolveUserDataFile(KEYBINDINGS_FILE)
    : path.join(userDataDirFor(root), KEYBINDINGS_FILE);
  const problems: KeybindingsProblem[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    // No file is the ordinary case, not a problem.
    return { config: {}, problems };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { config: {}, problems: [{ message: `${filePath} is not valid JSON: ${detail}` }] };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { config: {}, problems: [{ message: `${filePath} must contain a JSON object of action ids to keys.` }] };
  }

  const config: KeybindingsConfig = {};
  for (const [actionId, value] of Object.entries(parsed as Record<string, unknown>)) {
    // An id nothing answers to is reported instead of ignored: a binding that
    // silently never fires is the hardest kind of mistake to find.
    if (!(actionId in KEY_ACTIONS)) {
      problems.push({ message: `Unknown action id \`${actionId}\`; it is ignored.` });
      continue;
    }
    const keys = normalizeEntry(value);
    if (keys === undefined) {
      problems.push({ message: `\`${actionId}\` must be a key or an array of keys; it is ignored.` });
      continue;
    }
    config[actionId] = keys;
  }
  return { config, problems };
}

export function normalizeEntry(value: unknown): readonly string[] | undefined {
  if (typeof value === "string") return value.trim() === "" ? [] : [normalizeKey(value)];
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === "string")) return undefined;
    return (value as string[]).filter((entry) => entry.trim() !== "").map(normalizeKey);
  }
  return undefined;
}

/**
 * A key as the parser would report it.
 *
 * Lower-cased and with modifiers ordered, so `Ctrl+Shift+Z` in a config file and
 * `ctrl+shift+z` from the terminal are the same binding. Without this a config
 * that looks right would never match.
 */
function normalizeKey(key: string): string {
  const parts = key
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
  if (parts.length === 0) return "";
  const name = parts.pop()!;
  const modifiers = ["ctrl", "alt", "shift"].filter((modifier) => parts.includes(modifier));
  return [...modifiers, name].join("+");
}

/** A key two actions both claim. */
export interface KeybindingConflict {
  readonly key: string;
  readonly actionIds: readonly string[];
}

/**
 * The bindings in force, as a lookup from key to action.
 *
 * Built once and kept: routing consults this on every keystroke, so it must not
 * re-derive anything per key. Rebuild it when the config changes, not per press.
 */
export class Keybindings {
  private byKey: Record<string, string> = {};
  private byAction: Record<string, readonly string[]> = {};
  private readonly conflictList: KeybindingConflict[] = [];

  constructor(private config: KeybindingsConfig = {}) {
    this.rebuild();
  }

  /** The action a key is bound to, or nothing when no action claims it. */
  actionFor(keyId: string): string | undefined {
    return this.byKey[keyId];
  }

  /** The keys bound to an action, in the order they were declared. */
  keysFor(actionId: string): readonly string[] {
    return this.byAction[actionId] ?? [];
  }

  /** Keys claimed by more than one action, so the ambiguity is visible. */
  conflicts(): readonly KeybindingConflict[] {
    return this.conflictList;
  }

  /** Replace the user's bindings; the defaults for everything else stay. */
  setUserConfig(config: KeybindingsConfig): void {
    this.config = config;
    this.rebuild();
  }

  getUserConfig(): KeybindingsConfig {
    return { ...this.config };
  }

  private rebuild(): void {
    const byKey: Record<string, string> = {};
    const byAction: Record<string, readonly string[]> = {};
    const claimants = new Map<string, string[]>();

    for (const [actionId, definition] of Object.entries(KEY_ACTIONS)) {
      // A user binding replaces the defaults for that action rather than adding
      // to them: someone who rebinds undo wants undo on their key, not on both.
      const override = this.config[actionId];
      // Normalized on read, not only on load: a caller may hand this a config
      // object directly, and a bare string iterated as a key list would produce
      // one binding per character.
      const keys = override === undefined
        ? definition.defaultKeys
        : (normalizeEntry(override) ?? definition.defaultKeys);
      byAction[actionId] = [...keys];
      for (const key of keys) {
        if (key === "") continue;
        const existing = byKey[key];
        if (existing !== undefined && existing !== actionId) {
          // A key bound by the user beats one that only has its default, so the
          // config file does what it says even when it collides with a default.
          const existingIsUser = this.config[existing] !== undefined;
          const incomingIsUser = override !== undefined;
          const loser = existingIsUser && !incomingIsUser ? actionId : existing;
          const list = claimants.get(key) ?? [];
          list.push(loser);
          claimants.set(key, list);
          if (loser === actionId) continue;
        }
        byKey[key] = actionId;
      }
    }

    this.byKey = byKey;
    this.byAction = byAction;
    this.conflictList.length = 0;
    for (const [key, actionIds] of claimants) {
      const winner = byKey[key]!;
      this.conflictList.push({ key, actionIds: [winner, ...actionIds.filter((id) => id !== winner)] });
    }
  }
}
