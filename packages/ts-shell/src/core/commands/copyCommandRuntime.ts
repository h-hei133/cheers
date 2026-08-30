import { exec } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

let lastCapturedResponseText = "";

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

  // 1. Emit universal OSC 52 clipboard sequence (0ms, 0 external dependencies, supported by all modern terminals)
  if (process.stdout && process.stdout.isTTY && contentToCopy) {
    try {
      const base64 = Buffer.from(contentToCopy, "utf8").toString("base64");
      process.stdout.write(`\x1b]52;c;${base64}\x07`);
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
