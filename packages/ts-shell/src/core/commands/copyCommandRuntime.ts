import { exec } from "node:child_process";
import { textSyntax, parseTextArgs } from "./syntax/text.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export const copySyntax = textSyntax("copy", "text");

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

interface ClipboardCommand {
  readonly command: string;
  /**
   * How the text has to be encoded on the way in.
   *
   * Windows' own `clip` reads its input in the console code page, so UTF-8 bytes
   * arrive as one mojibake character per byte — the exact "copied text is
   * garbage" symptom, and only for text outside ASCII. It accepts UTF-16LE
   * correctly, and without a byte-order mark, which it would otherwise paste as a
   * leading invisible character.
   */
  readonly encoding: BufferEncoding;
}

/**
 * Where the clipboard can be reached on this machine, most reliable first.
 *
 * Each entry is tried on its own with its own stdin. Chaining them in one shell
 * command (`a || b || c`) looked equivalent and was not: the first command
 * consumes the text before failing, so the fallback receives an empty stream and
 * reports success having copied nothing.
 */
function clipboardCommands(): readonly ClipboardCommand[] {
  if (process.platform === "darwin") return [{ command: "pbcopy", encoding: "utf8" }];
  if (process.platform === "win32") return [{ command: "clip", encoding: "utf16le" }];
  // `clip.exe` is reachable when a Linux shell runs under Windows, where none of
  // the X11 or Wayland tools usually are.
  return [
    { command: "wl-copy", encoding: "utf8" },
    { command: "xclip -selection clipboard", encoding: "utf8" },
    { command: "xsel --clipboard --input", encoding: "utf8" },
    { command: "clip.exe", encoding: "utf16le" },
  ];
}

/** Feed `text` to one clipboard command, reporting whether it took it. */
async function pipeTo(candidate: ClipboardCommand, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = exec(candidate.command, { timeout: 1_500 }, (error) => resolve(!error));
      child.on("error", () => resolve(false));
      if (!child.stdin) {
        resolve(false);
        return;
      }
      child.stdin.on("error", () => resolve(false));
      if (candidate.encoding === "utf16le") {
        const bom = Buffer.from([0xff, 0xfe]);
        child.stdin.end(Buffer.concat([bom, Buffer.from(text, "utf16le")]));
      } else {
        child.stdin.end(Buffer.from(text, candidate.encoding));
      }
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
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseTextArgs(copySyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: "local", output: `Invalid /copy arguments: ${parsed.reason}\n${syntaxHelp(copySyntax)}` };
  const text = parsed.text || lastCapturedResponseText;
  if (!text) {
    return { kind: "local", output: "Nothing to copy: no recent response and no text given." };
  }

  const initial = copyAdmission(context);
  if (initial) return stoppedCopy(text, initial, false);

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

  for (const candidate of clipboardCommands()) {
    const stopped = copyAdmission(context);
    if (stopped) return stoppedCopy(text, stopped, offered);
    if (await pipeTo(candidate, text)) {
      return {
        kind: "local",
        output: `Copied ${describe(text)} to the clipboard.`,
        state: { clipboard: 'copied' },
      };
    }
  }

  const final = copyAdmission(context);
  if (final) return stoppedCopy(text, final, offered);
  if (offered) {
    return {
      kind: "local",
      output: `Sent ${describe(text)} to the terminal clipboard. If nothing was pasted, this terminal does not accept it.`,
      state: { clipboard: 'offered' },
    };
  }
  return { kind: "local", output: `Could not reach a clipboard for ${describe(text)}.`, state: { clipboard: 'unavailable' } };
}

/** A completed dispatch can settle; a new fallback must retain its authority. */
function copyAdmission(context: CommandContext): 'cancelled' | 'blocked' | undefined {
  if (context.signal?.aborted) return 'cancelled';
  try {
    const blocked = context.admission?.();
    return context.signal?.aborted ? 'cancelled' : blocked ? 'blocked' : undefined;
  }
  catch { return 'blocked'; }
}

function stoppedCopy(text: string, reason: 'cancelled' | 'blocked', offered: boolean): LocalCommandResult {
  return offered ? {
    kind: 'local',
    output: `Sent ${describe(text)} to the terminal clipboard. Further clipboard attempts were ${reason}.`,
    state: { clipboard: 'offered', clipboardAttempts: reason },
  } : {
    kind: 'local', output: `Copy ${reason}; no further clipboard attempt was started.`,
    state: { clipboard: 'unavailable', clipboardAttempts: reason },
  };
}

/** How much text this is, in the terms a reader checks against what they selected. */
function describe(text: string): string {
  let lines = 1;
  for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) lines++;
  return `${text.length} characters${lines > 1 ? ` across ${lines} lines` : ""}`;
}
