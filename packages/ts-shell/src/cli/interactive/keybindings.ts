import fs from "node:fs";
import path from "node:path";
import { KEY_BINDINGS, type KeyBinding } from "../../presentation/tui/chrome/keys.js";
import { resolveUserDataFile, userDataDirFor } from "../../core/paths/userHome.js";
import { assertProfileStorage } from '../../core/paths/profile/context.js';

/**
 * Which key does what, and how a user changes it.
 *
 * The catalogue covers configurable actions. Picker confirmation, cancellation,
 * navigation and editing controls remain local to OverlayHost; scoped group
 * bindings must leave those controls available while the picker owns input.
 */

export interface KeybindingDefinition {
  /** Keys bound when the user has not rebound the action. Empty means unbound. */
  readonly defaultKeys: readonly string[];
  readonly description: string;
  /** Scoped actions only participate while their surface owns the input. */
  readonly scope?: 'overlay';
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
  "tui.overlay.nextGroup": { defaultKeys: ["tab"], description: "Next picker group", scope: 'overlay' },
  "tui.overlay.previousGroup": { defaultKeys: ["shift+tab"], description: "Previous picker group", scope: 'overlay' },
  "tui.altScreen.top": { defaultKeys: ["ctrl+home"], description: "Go to the oldest rows, or the start of the draft" },
  "tui.altScreen.bottom": { defaultKeys: ["ctrl+end"], description: "Go to the newest rows, or the end of the draft" },
  // Not ctrl+f: that is the emacs-style cursor-right the editor already binds, and
  // the reference implementation avoids it for the same reason on every platform
  // that has the cursor binding.
  "tui.altScreen.search": { defaultKeys: ["ctrl+shift+f"], description: "Find text in the transcript" },
  "app.interrupt": { defaultKeys: ["escape"], description: "Dismiss a list, interrupt a run, or go back" },
  "app.clear": { defaultKeys: ["ctrl+c"], description: "Clear the draft, then exit on a second press" },
  "app.exit": { defaultKeys: ["ctrl+d"], description: "Exit when the draft is empty" },
  "app.clearScreen": { defaultKeys: ["ctrl+l"], description: "Clear the screen" },
  "app.message.followUp": { defaultKeys: ["ctrl+q"], description: "Queue a follow-up while a run is active" },
  "app.thinking.cycle": { defaultKeys: ["shift+tab"], description: "Switch between planning and building" },
  "app.thinking.toggle": { defaultKeys: ["ctrl+t"], description: "Collapse or expand thinking blocks" },
  "app.tools.expand": { defaultKeys: ["ctrl+o"], description: "Collapse or expand tool output" },
  "app.permission.cycle": { defaultKeys: ["alt+p"], description: "Cycle the permission scope" },
  "app.retry": { defaultKeys: ["f5"], description: "Retry the last prompt" },
  "app.scroll.fastUp": { defaultKeys: ["shift+up"], description: "Scroll up several rows at once" },
  "app.scroll.fastDown": { defaultKeys: ["shift+down"], description: "Scroll down several rows at once" },
  "app.editor.external": { defaultKeys: ["ctrl+g"], description: "Edit the draft in an external editor" },
  // A separate chord from the terminal's own paste, because they are different
  // things: the terminal sends text, and an image never arrives as text at all.
  "app.editor.image": { defaultKeys: ["alt+v"], description: "Attach the image on the clipboard" },
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
  assertProfileStorage(filePath);
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
    // silently never fires is the hardest kind of mistake to find. `Object.hasOwn`
    // rather than `in`: every object inherits `toString` and `constructor`, so a
    // membership test against the prototype chain accepts ids no action declares.
    if (!Object.hasOwn(KEY_ACTIONS, actionId)) {
      problems.push({ message: `Unknown action id \`${actionId}\`; it is ignored.` });
      continue;
    }
    const keys = normalizeEntry(value);
    if (keys === undefined) {
      problems.push({ message: `\`${actionId}\` must be a key or an array of keys; it is ignored.` });
      continue;
    }
    // A key the parser can never emit is reported rather than dropped: the entry
    // is in the file, so the user believes the binding exists.
    const unusable = unusableKeys(value);
    if (unusable.length > 0) {
      problems.push({
        message:
          `\`${actionId}\` names ${unusable.map((key) => `\`${key}\``).join(", ")}, ` +
          "which this terminal cannot produce (known modifiers: ctrl, alt, shift, meta).",
      });
    }
    const scope = KEY_ACTIONS[actionId]!.scope;
    const reserved = keys.filter(key => !availableKey(key, scope));
    if (reserved.length) problems.push({
      message: `\`${actionId}\` names reserved picker controls ${reserved.map(key => `\`${key}\``).join(', ')}; those bindings are ignored.`,
    });
    // Recorded even when nothing usable is left. Leaving the action out would
    // make the disk path disagree with handing the same object to `setUserConfig`
    // — the omitted action keeps its default keys, so a rebind the user asked for
    // to a chord this terminal cannot send silently leaves the old key in place.
    config[actionId] = keys.filter(key => availableKey(key, scope));
  }
  return { config, problems };
}

/** Every key in an entry that the parser could never report. */
export function unusableKeys(value: unknown): readonly string[] {
  const entries = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return entries.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim() !== "" && normalizeKey(entry) === undefined,
  );
}

export function normalizeEntry(value: unknown): readonly string[] | undefined {
  if (typeof value === "string") return value.trim() === "" ? [] : entryKeys([value]);
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === "string")) return undefined;
    return entryKeys(value as string[]);
  }
  return undefined;
}

/** The usable keys of an entry, dropping the ones the parser cannot report. */
function entryKeys(entries: readonly string[]): readonly string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    const normalized = entry.trim() === "" ? undefined : normalizeKey(entry);
    if (normalized !== undefined) keys.push(normalized);
  }
  return keys;
}

/** Modifiers the key parser can put in a key id. */
const KNOWN_MODIFIERS = ["ctrl", "alt", "shift", "meta"] as const;

/**
 * A key as the parser would report it, or nothing when it is not a key.
 *
 * Lower-cased and with modifiers ordered, so `Ctrl+Shift+Z` in a config file and
 * `ctrl+shift+z` from the terminal are the same binding. Without this a config
 * that looks right would never match.
 *
 * Returning nothing for an unrecognizable key is the whole point. The parser only
 * ever emits modifiers from {@link KNOWN_MODIFIERS}, so a segment it does not
 * know — `cmd`, `super`, or a typo like `cotrl` — describes a key that can never
 * arrive. Dropping the unknown segment instead would turn `cmd+z` into a binding
 * on the bare `z`, and the user would find their letter key hijacked by a
 * shortcut they thought they had given to a chord.
 */
function normalizeKey(key: string): string | undefined {
  const raw = key.trim().toLowerCase();
  if (raw === "") return undefined;
  // A trailing `+` is the key itself, not a separator. `+` is a key a person can
  // bind, and the parser reports it as `+` alone or as `ctrl++` when a modifier
  // is held; splitting first and dropping the empty segments — which is what this
  // did — turned `+` into nothing and left `ctrl++` looking like a modifier with
  // no key, so neither could ever be bound. A lone `ctrl+` is not one of those
  // spellings and stays rejected, because the parser never emits it.
  const trailingPlus = raw === "+" || raw.endsWith("++");
  const body = trailingPlus ? raw.slice(0, -1) : raw;
  const segments = body
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const name = trailingPlus ? "+" : segments.pop();
  if (name === undefined || name === "") return undefined;
  // A modifier with no key after it, as `ctrl+` produces.
  if ((KNOWN_MODIFIERS as readonly string[]).includes(name)) return undefined;
  // Every segment has to be a known modifier: one that is not names a key that
  // cannot be typed, so the binding is rejected rather than silently narrowed.
  if (segments.some((part) => !(KNOWN_MODIFIERS as readonly string[]).includes(part))) return undefined;
  const modifiers = KNOWN_MODIFIERS.filter((modifier) => segments.includes(modifier));
  return [...modifiers, name].join("+");
}

/** A key two actions both claim. */
export interface KeybindingConflict {
  readonly key: string;
  readonly actionIds: readonly string[];
}

function bindingKey(keyId: string, scope?: 'overlay'): string {
  return JSON.stringify([scope ?? 'main', keyId]);
}

const PICKER_CONTROL_KEYS = new Set(['enter', 'escape', 'ctrl+c', 'up', 'down', 'space', 'backspace',
  'delete', 'ctrl+d', 'ctrl+p', 'ctrl+r']);

function availableKey(key: string, scope?: 'overlay'): boolean {
  return scope !== 'overlay' || !PICKER_CONTROL_KEYS.has(key);
}

/**
 * The bindings in force, as a lookup from key to action.
 *
 * Built once and kept: routing consults this on every keystroke, so it must not
 * re-derive anything per key. Rebuild it when the config changes, not per press.
 */
export class Keybindings {
  // Null-prototype records: these are looked up by key id, and a plain object
  // would answer for `toString` and `constructor` with an inherited function,
  // which routing would then treat as a bound action.
  private byKey: Record<string, string> = Object.create(null) as Record<string, string>;
  private byAction: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  private readonly conflictList: KeybindingConflict[] = [];

  constructor(private config: KeybindingsConfig = {}) {
    this.rebuild();
  }

  /** The action a key is bound to, or nothing when no action claims it. */
  actionFor(keyId: string, scope?: 'overlay'): string | undefined {
    const key = bindingKey(keyId, scope);
    return Object.hasOwn(this.byKey, key) ? this.byKey[key] : undefined;
  }

  /** The keys bound to an action, in the order they were declared. */
  keysFor(actionId: string): readonly string[] {
    return Object.hasOwn(this.byAction, actionId) ? this.byAction[actionId]! : [];
  }

  /** Display only the keys that dispatch to each action after conflict resolution. */
  guide(fullScreen: boolean): readonly KeyBinding[] {
    const actions = Object.entries(KEY_ACTIONS).map(([id, definition]): KeyBinding => {
      const base = KEY_BINDINGS.find((row) => row.keys.some((key) => definition.defaultKeys.includes(key)));
      const keys = this.keysFor(id).filter((key) => this.actionFor(key, definition.scope) === id);
      const availability = definition.scope === 'overlay' ? ' (grouped picker)' : !fullScreen && id === "tui.altScreen.search" ? " (requires fullscreen mode)" : "";
      return {
        keys,
        does: definition.description + availability,
        group: base?.group ?? "session",
        negotiatedKeys: keys.filter((key) => /^(ctrl\+shift\+|shift\+enter$|alt\+enter$)/.test(key)),
      };
    });
    const gestures = KEY_BINDINGS.filter((row) => row.group === "pointer" || row.keys.includes("paste twice"));
    return [...actions, ...gestures.filter((row) => fullScreen || row.group !== "pointer")];
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
    const byKey: Record<string, string> = Object.create(null) as Record<string, string>;
    const byAction: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
    const claimants = new Map<string, { key: string; actionIds: string[] }>();

    for (const [actionId, definition] of Object.entries(KEY_ACTIONS)) {
      // A user binding replaces the defaults for that action rather than adding
      // to them: someone who rebinds undo wants undo on their key, not on both.
      const override = this.config[actionId];
      // Normalized on read, not only on load: a caller may hand this a config
      // object directly, and a bare string iterated as a key list would produce
      // one binding per character.
      const keys = (override === undefined
        ? definition.defaultKeys
        : (normalizeEntry(override) ?? definition.defaultKeys)).filter(key => availableKey(key, definition.scope));
      byAction[actionId] = [...keys];
      for (const key of keys) {
        if (key === "") continue;
        const slot = bindingKey(key, definition.scope);
        const existing = byKey[slot];
        if (existing !== undefined && existing !== actionId) {
          // A key bound by the user beats one that only has its default, so the
          // config file does what it says even when it collides with a default.
          const existingIsUser = this.config[existing] !== undefined;
          const incomingIsUser = override !== undefined;
          const loser = existingIsUser && !incomingIsUser ? actionId : existing;
          const claim = claimants.get(slot) ?? { key, actionIds: [] };
          claim.actionIds.push(loser);
          claimants.set(slot, claim);
          if (loser === actionId) continue;
        }
        byKey[slot] = actionId;
      }
    }

    this.byKey = byKey;
    this.byAction = byAction;
    this.conflictList.length = 0;
    for (const [slot, claim] of claimants) {
      const winner = byKey[slot]!;
      this.conflictList.push({ key: claim.key, actionIds: [winner, ...claim.actionIds.filter((id) => id !== winner)] });
    }
  }
}
