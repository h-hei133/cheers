import { shellSyntax } from "./shell/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import { parseSyntax } from "./syntax/parse.js";
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
  const parsed = parseSyntax(shellSyntax, args.map(value => value.toLowerCase()));
  if (!parsed.ok) return { kind: "local", output: `Invalid /shell arguments: ${parsed.reason}\n${syntaxHelp(shellSyntax)}` };
  const subCommand = parsed.action.name;

  if (!subCommand || subCommand === "status" || subCommand === "diag" || subCommand === "info") {
    return {
      kind: "local",
      output: ShellManager.formatStatusReport(),
    };
  }

  if (subCommand === "use" || subCommand === "set") {
    const target = parsed.args[0] as ShellBackendKind;

    try {
      const updated = ShellManager.setBackend(target);
      return {
        kind: "local",
        output: `Active shell backend switched to \`${updated.activeBackend}\` (\`${updated.executionPath}\`).`,
      };
    } catch (error) {
      return { kind: "local", output: `${error instanceof Error ? error.message : String(error)}. Selection was not changed.` };
    }
  }

  if (subCommand === "auto" || subCommand === "reset") {
    const updated = ShellManager.resetToAuto();
    return {
      kind: "local",
      output: `Shell backend reset to automatic detection: \`${updated.activeBackend}\` on \`${updated.platform}\`.`,
    };
  }

  return { kind: "local", output: syntaxHelp(shellSyntax) };
}
