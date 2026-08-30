import type { CommandContext, LocalCommandResult } from "./types.js";
import { ShellManager } from "../shell/platform/shellManager.js";
import type { ShellBackendKind } from "../shell/platform/types.js";

/**
 * /shell command
 * Inspects and controls cross-platform shell backends (bash, git-bash, powershell, wsl).
 */
export async function runShellCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "status" || subCommand === "diag" || subCommand === "info") {
    return {
      kind: "local",
      output: ShellManager.formatStatusReport(),
    };
  }

  if (subCommand === "use" || subCommand === "set") {
    const target = args[1]?.toLowerCase() as ShellBackendKind;
    const validBackends: ShellBackendKind[] = ["bash", "git-bash", "powershell", "wsl", "auto"];

    if (!target || !validBackends.includes(target)) {
      return {
        kind: "local",
        output: [
          `Invalid shell backend: '${args[1] || ""}'.`,
          `Supported options: ${validBackends.map((b) => `\`${b}\``).join(", ")}.`,
          "Example: `/shell use powershell`",
        ].join("\n"),
      };
    }

    const updated = ShellManager.setBackend(target);
    return {
      kind: "local",
      output: `Active shell backend switched to \`${updated.activeBackend}\` (\`${updated.executionPath}\`).`,
    };
  }

  if (subCommand === "auto" || subCommand === "reset") {
    const updated = ShellManager.resetToAuto();
    return {
      kind: "local",
      output: `Shell backend reset to automatic detection: \`${updated.activeBackend}\` on \`${updated.platform}\`.`,
    };
  }

  return {
    kind: "local",
    output: [
      "Usage:",
      "- `/shell` or `/shell status` : Inspect cross-platform shell diagnostics",
      "- `/shell use <bash|git-bash|powershell|wsl>` : Switch active shell backend",
      "- `/shell auto` : Reset to automatic platform detection",
    ].join("\n"),
  };
}
