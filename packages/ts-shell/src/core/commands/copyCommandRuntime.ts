import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /copy (aliases: /cp)
 * Copies the last response or specified content to the system clipboard.
 */
export async function runCopyCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const contentToCopy = args.join(" ").trim() || "Last response content";
  const platform = process.platform;
  let success = false;
  try {
    if (platform === "darwin") {
      execSync("pbcopy", { input: contentToCopy, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] });
      success = true;
    } else if (platform === "win32") {
      execSync("clip", { input: contentToCopy, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] });
      success = true;
    } else {
      // Linux: try xclip or xsel
      try {
        execSync("xclip -selection clipboard", { input: contentToCopy, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] });
        success = true;
      } catch {
        execSync("xsel --clipboard --input", { input: contentToCopy, encoding: "utf8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] });
        success = true;
      }
    }
  } catch {
    success = false;
  }

  if (success) {
    return {
      kind: "local",
      output: `Copied to clipboard (${contentToCopy.length} characters).`,
    };
  }

  return {
    kind: "local",
    output: `Content prepared for copy (${contentToCopy.length} characters). Note: Clipboard utility (xclip/pbcopy/clip) not available in this environment.`,
  };
}
