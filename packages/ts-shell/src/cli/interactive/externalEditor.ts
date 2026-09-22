import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Hand the draft to an editor outside the terminal.
 *
 * The session holds the terminal in raw mode and draws on the alternate screen,
 * which is exactly the state an editor cannot start in: a child that inherits it
 * gets no echo, no line editing, and its output lands inside a surface that will
 * overwrite it on the next redraw. So the terminal is released first, the editor
 * is given a terminal it can drive, and the surface is restored afterwards.
 *
 * Restoration is in a `finally` because the failure that matters is not the
 * editor failing — it is the editor failing and leaving the terminal unusable,
 * which strands the session in raw mode with no visible prompt.
 */

/** The editor to run, in the order a person expects their preference to be read. */
export function resolveEditor(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const candidate of [env.CHEERS_EDITOR, env.VISUAL, env.EDITOR]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  // A named fallback rather than a bare `vi`: the name is what a person would
  // have written, and on a machine with neither this fails visibly.
  return process.platform === "win32" ? "notepad" : "nano";
}

/**
 * An editor command split into the program and its arguments.
 *
 * `$EDITOR` is a command line, not a path: `code --wait`, `vim -u NONE` and
 * `emacsclient -c` are all things people set, and passing the whole string as a
 * program name fails with ENOENT on a value that is entirely valid.
 *
 * Split on whitespace rather than shell-parsed: this is a name and flags, not a
 * shell expression, and running it through a shell would give the value the power
 * to run arbitrary commands from an environment variable.
 */
export function splitEditorCommand(command: string): { readonly program: string; readonly args: readonly string[] } {
  const parts = command.split(/\s+/).filter((part) => part !== "");
  return { program: parts[0] ?? "", args: parts.slice(1) };
}

export interface ExternalEditResult {
  /** The edited text, or nothing when the editor failed or changed nothing. */
  readonly text?: string;
  /** What to tell the user, when there is something to say. */
  readonly message?: string;
}

/**
 * Run the editor on `text` and return what came back.
 *
 * The text travels through a temporary file because that is the only interface
 * every editor shares. It is created in the system temporary directory rather
 * than the workspace: a draft is not part of the project, and leaving it where a
 * later `git status` would find it is a surprise.
 */
export function editExternally(input: {
  readonly text: string;
  /** Release the terminal, run `run`, then restore it. */
  readonly suspendTerminal: <T>(run: () => T) => T;
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}): ExternalEditResult {
  const editor = resolveEditor(input.env);
  if (!editor) {
    return { message: "No editor found. Set $VISUAL or $EDITOR to one." };
  }
  const { program, args } = splitEditorCommand(editor);
  if (program === "") {
    return { message: "No editor found. Set $VISUAL or $EDITOR to one." };
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-edit-"));
  const file = path.join(directory, "draft.md");
  fs.writeFileSync(file, input.text, "utf8");

  try {
    const outcome = input.suspendTerminal(() =>
      spawnSync(program, [...args, file], {
        stdio: "inherit",
        // Never through a shell: the value comes from the environment, and a
        // shell would give whoever set it the ability to run anything.
        shell: false,
        cwd: input.cwd,
      }),
    );

    if (outcome.error) {
      const detail = outcome.error.message;
      return { message: `Could not run \`${editor}\`: ${detail}` };
    }
    if (outcome.status !== 0) {
      // A non-zero exit is how editors say "I did not save", and also how a
      // missing binary fails. Either way the draft is untouched, which is the
      // safe reading: nothing is replaced on a run that did not succeed.
      return { message: `\`${editor}\` exited with status ${outcome.status ?? "unknown"}; the draft is unchanged.` };
    }

    const edited = fs.readFileSync(file, "utf8");
    // An editor that saves the file unchanged should not count as an edit: the
    // surface would report a change and rewrite the draft with identical text.
    if (edited === input.text) return { message: "No changes." };
    return { text: edited.replace(/\n$/, "") };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
