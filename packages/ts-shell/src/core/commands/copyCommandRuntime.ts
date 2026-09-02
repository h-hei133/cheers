import { exec } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

let lastCapturedResponseText = "";

/**
 * Where the terminal clipboard sequence goes.
 *
 * The interactive surface owns the terminal, so an escape sequence written
 * straight to stdout lands in the middle of whatever frame is being painted. The
 * host installs its own device here; without one, writing to stdout directly is
 * still right — that is the non-interactive path, where nothing else is painting.
 */
let clipboardSink: ((data: string) => void) | undefined;

/** Install the device the clipboard sequence should be written through. */
export function setClipboardSink(sink: ((data: string) => void) | undefined): void {
  clipboardSink = sink;
}

export function recordLastAssistantResponse(text: string): void {
  if (text && text.trim()) {
    lastCapturedResponseText = text.trim();
  }
}

export function getLastAssistantResponse(): string {
  return lastCapturedResponseText;
}

/**
 * Where the clipboard can be reached on this machine, most reliable first.
 *
 * Each entry is tried on its own with its own stdin. Chaining them in one shell
 * command (`a || b || c`) looked equivalent and was not: the first command
 * consumes the text before failing, so the fallback receives an empty stream and
 * reports success having copied nothing.
 */
function clipboardCommands(): readonly string[] {
  if (process.platform === "darwin") return ["pbcopy"];
  if (process.platform === "win32") return ["clip"];
  // `clip.exe` is present when a Linux shell is running under Windows, where none
  // of the X11 or Wayland tools usually are.
  return ["wl-copy", "xclip -selection clipboard", "xsel --clipboard --input", "clip.exe"];
}

/** Feed `text` to one clipboard command, reporting whether it took it. */
async function pipeTo(command: string, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = exec(command, { timeout: 1_500 }, (error) => resolve(!error));
      child.on("error", () => resolve(false));
      if (!child.stdin) {
        resolve(false);
        return;
      }
      child.stdin.on("error", () => resolve(false));
      child.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

/**
 * /copy (aliases: /cp)
 *
 * Two routes, and they are not equivalent. OSC 52 reaches every terminal that
 * implements it, including over SSH, but nothing comes back — a terminal that
 * ignores the sequence is indistinguishable from one that honoured it. A local
 * clipboard command does report, so when one of those succeeds it is what gets
 * claimed. Saying "copied" on the strength of OSC 52 alone would be reporting an
 * outcome nobody observed.
 */
export async function runCopyCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const custom = args.join(" ").trim();
  const text = custom || lastCapturedResponseText;
  if (!text) {
    return { kind: "local", output: "Nothing to copy: no recent response and no text given." };
  }

  let offered = false;
  if (clipboardSink || process.stdout?.isTTY) {
    try {
      const sequence = `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
      if (clipboardSink) clipboardSink(sequence);
      else process.stdout.write(sequence);
      offered = true;
    } catch {
      offered = false;
    }
  }

  for (const command of clipboardCommands()) {
    if (await pipeTo(command, text)) {
      return {
        kind: "local",
        output: `Copied ${describe(text)} to the clipboard.`,
      };
    }
  }

  if (offered) {
    return {
      kind: "local",
      output: `Sent ${describe(text)} to the terminal clipboard. If nothing was pasted, this terminal does not accept it.`,
    };
  }
  return { kind: "local", output: `Could not reach a clipboard for ${describe(text)}.` };
}

/** How much text this is, in the terms a reader checks against what they selected. */
function describe(text: string): string {
  const lines = text.split("\n").length;
  return `${text.length} characters${lines > 1 ? ` across ${lines} lines` : ""}`;
}
