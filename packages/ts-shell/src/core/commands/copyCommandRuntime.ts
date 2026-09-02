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
 * /copy (aliases: /cp)
 * Copies the last response or specified content to the system clipboard
 * using terminal OSC 52 escape sequences and native platform clipboard utilities.
 */
export async function runCopyCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const customContent = args.join(" ").trim();
  const contentToCopy = customContent || lastCapturedResponseText || "No recent response content available to copy.";
  const platform = process.platform;

  // 1. OSC 52 reaches every modern terminal, including over SSH, with no
  //    external dependency — so it is tried first, through the renderer's device
  //    when one is installed.
  if (contentToCopy && (clipboardSink || process.stdout?.isTTY)) {
    try {
      const base64 = Buffer.from(contentToCopy, "utf8").toString("base64");
      const sequence = `\x1b]52;c;${base64}\x07`;
      if (clipboardSink) clipboardSink(sequence);
      else process.stdout.write(sequence);
    } catch {
      // Non-critical fallback
    }
  }

  // 2. Platform-specific async clipboard fallback
  const tryNativeCopy = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      let cmd = "";
      if (platform === "darwin") {
        cmd = "pbcopy";
      } else if (platform === "win32") {
        cmd = "clip";
      } else {
        cmd = "xclip -selection clipboard || wl-copy || xsel --clipboard --input";
      }

      try {
        const child = exec(cmd, { timeout: 1500 }, (error) => {
          resolve(!error);
        });
        if (child.stdin) {
          child.stdin.write(contentToCopy);
          child.stdin.end();
        }
      } catch {
        resolve(false);
      }
    });
  };

  const nativeSuccess = await tryNativeCopy();

  if (nativeSuccess || (process.stdout && process.stdout.isTTY)) {
    return {
      kind: "local",
      output: `Copied to clipboard (${contentToCopy.length} characters via OSC 52 / platform clipboard).`,
    };
  }

  return {
    kind: "local",
    output: `Content prepared for copy (${contentToCopy.length} characters).`,
  };
}
