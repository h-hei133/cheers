import { Keybindings, loadUserKeybindings, type KeybindingsProblem } from "./keybindings.js";
import { editExternally } from "./externalEditor.js";
import { invalidateWorkspaceFiles, warmWorkspaceFiles } from "./fileSuggestions.js";

/**
 * The input preferences a session runs with: which key does what, which files an
 * `@` reference completes against, and which editor a draft is handed to.
 *
 * All three are read from disk at startup and re-read by `/reload`, and all three
 * report what was wrong rather than throwing — a typo in a keybinding should not
 * stop a session from starting. Keeping them together means the host holds one
 * thing and calls one reload, instead of a field and a method for each.
 *
 * The host supplies the four things this cannot know: how to report a message,
 * how to release the terminal, where the workspace is, and how to adopt an edited
 * draft. Everything else — the files, the parsing, the ranking, the child process
 * — lives here.
 */
export interface InputPreferencesHost {
  /** Show a message to the user. Used for config problems and editor failures. */
  report(message: string): void;
  /** Release the terminal for the duration of `run`, then take it back. */
  suspendTerminal<T>(run: () => T): T;
  /** The workspace root, for the file listing and the editor's working directory. */
  workspaceRoot(): string;
  /** Replace the draft with what the editor returned. */
  adoptDraft(text: string): void;
  /** Repaint after the draft changed. */
  redraw(): void;
}

export class InputPreferences {
  private readonly bindings = new Keybindings();
  private problems: readonly KeybindingsProblem[] = [];

  constructor(private readonly host: InputPreferencesHost) {}

  /** The bindings in force, which routing consults on every keystroke. */
  get keybindings(): Keybindings {
    return this.bindings;
  }

  /**
   * Re-read everything on disk.
   *
   * A binding that silently never fires is the hardest kind of mistake to find,
   * so an unknown action id, a malformed value and a key two actions both claim
   * all come back as messages rather than being swallowed.
   */
  reload(): void {
    // The tree may have changed since the listing was taken, and /reload is the
    // gesture that says "re-read what is on disk".
    invalidateWorkspaceFiles();
    void warmWorkspaceFiles(this.host.workspaceRoot());

    const loaded = loadUserKeybindings();
    this.bindings.setUserConfig(loaded.config);
    this.problems = loaded.problems;
    for (const problem of this.problems) {
      this.host.report(`Keybindings: ${problem.message}`);
    }
    for (const conflict of this.bindings.conflicts()) {
      this.host.report(
        `Keybindings: \`${conflict.key}\` is bound to ${conflict.actionIds.join(" and ")}; ${conflict.actionIds[0]} wins.`,
      );
    }
  }

  /**
   * Hand the draft to an external editor and take back what it wrote.
   *
   * The terminal is released for the duration: the editor is a program that
   * expects to drive it, and running one inside a raw-mode alternate screen gives
   * it no echo and no line editing.
   */
  openExternalEditor(currentDraft: string): void {
    const result = editExternally({
      text: currentDraft,
      suspendTerminal: (run) => this.host.suspendTerminal(run),
      cwd: this.host.workspaceRoot(),
    });
    if (result.text !== undefined) this.host.adoptDraft(result.text);
    if (result.message !== undefined) this.host.report(result.message);
    this.host.redraw();
  }
}
