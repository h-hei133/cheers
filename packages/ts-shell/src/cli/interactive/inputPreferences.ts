import { Keybindings, loadUserKeybindings, type KeybindingsProblem } from "./keybindings.js";
import { editExternally } from "./externalEditor.js";
import { readClipboardImage } from "../../presentation/tui/clipboardImage.js";

/**
 * The input preferences a session runs with: which key does what and which editor
 * a draft is handed to.
 *
 * Preferences are read at startup and re-read by `/reload`, and both
 * report what was wrong rather than throwing — a typo in a keybinding should not
 * stop a session from starting. Keeping them together means the host holds one
 * thing and calls one reload, instead of a field and a method for each.
 *
 * The host supplies the four things this cannot know: how to report a message,
 * how to release the terminal, where the workspace is, and how to adopt an edited
 * draft. Preference parsing and external editor execution live here.
 */
export interface InputPreferencesHost {
  /** Show a message to the user. Used for config problems and editor failures. */
  report(message: string): void;
  /** Release the terminal for the duration of `run`, then take it back. */
  suspendTerminal<T>(run: () => T): T;
  /** The workspace root, for the editor's working directory. */
  workspaceRoot(): string;
  /**
   * Replace the draft with what the editor returned, keeping the text it
   * replaced reachable so a rewrite can be taken back.
   */
  adoptDraft(text: string): void;
  /** Repaint after the draft changed. */
  redraw(): void;
  /** Put an image placeholder in the draft and hold the bytes beside it. */
  attachImage(image: { readonly bytes: Buffer; readonly mimeType: string }): void;
}

export class InputPreferences {
  private readonly bindings = new Keybindings();
  private problems: readonly KeybindingsProblem[] = [];

  constructor(private readonly host: InputPreferencesHost) {}

  /** The bindings in force, which routing consults on every keystroke. */
  get keybindings(): Keybindings {
    return this.bindings;
  }

  /** The advertised shortcut must dispatch after user bindings and conflicts. */
  readonly thinkingShortcut = (): string | undefined => this.bindings.keysFor('app.thinking.toggle')
    .find(key => this.bindings.actionFor(key) === 'app.thinking.toggle');

  /**
   * Re-read everything on disk.
   *
   * A binding that silently never fires is the hardest kind of mistake to find,
   * so an unknown action id, a malformed value and a key two actions both claim
   * all come back as messages rather than being swallowed.
   */
  reload(): void {
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
    // A rewrite replaces the draft whole, and the editor is where a person goes
    // to have a model or a tool rewrite it. Keeping the text it replaced is what
    // makes "no, the original" a single press rather than an undo of an edit
    // that was never made in this terminal.
    if (result.text !== undefined) this.host.adoptDraft(result.text);
    if (result.message !== undefined) this.host.report(result.message);
    this.host.redraw();
  }

  /**
   * Put whatever image the clipboard holds into the draft.
   *
   * The draft gets a placeholder and the bytes are held beside it, because an
   * image is not text: the caret can move over the placeholder and deleting it
   * removes the attachment, while the picture never becomes part of the sentence.
   *
   * Says so when there is nothing to attach. A chord that silently does nothing
   * is indistinguishable from one that is broken.
   */
  async attachClipboardImage(): Promise<void> {
    const read = await readClipboardImage();
    if (read.kind === "too-large") {
      // Told apart from "there is no image", because there is one and the user can
      // do something about it: a smaller crop sends, and the reason it did not is
      // worth a sentence rather than the same message an empty clipboard gets.
      const megabytes = (read.bytes / (1024 * 1024)).toFixed(1);
      this.host.report(`That image is ${megabytes} MB, which is larger than this can send.`);
      return;
    }
    if (read.kind === "none") {
      this.host.report("No image on the clipboard.");
      return;
    }
    this.host.attachImage(read.image);
  }
}
