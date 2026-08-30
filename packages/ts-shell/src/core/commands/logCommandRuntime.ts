import * as fs from "node:fs";
import * as path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getGlobalRotatingFileSink } from "../../observability/rotatingFileSink.js";

/**
 * /log (aliases: /logs)
 * Inspects, exports, or monitors internal structured agent runtime logs.
 * Subcommands:
 *   /log tail [lines]   - Show recent structured log entries (default: 30)
 *   /log path           - Show current session log file path
 *   /log export [dest]  - Export full log to a destination file
 *   /log clear          - Clear current session log file
 */
export async function runLogCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = (args[0] || "tail").toLowerCase();
  const sink = getGlobalRotatingFileSink();
  const currentPath = sink.getCurrentFilePath();

  if (subCommand === "path") {
    return {
      kind: "local",
      output: `Current session log file:\n\`${currentPath}\`\nLog directory: \`${sink.getLogDir()}\``,
    };
  }

  if (subCommand === "tail" || !isNaN(Number(subCommand))) {
    const limit = !isNaN(Number(subCommand)) ? Number(subCommand) : Number(args[1]) || 30;
    const lines = sink.getRecentLines(limit);

    if (lines.length === 0) {
      return {
        kind: "local",
        output: `No log entries recorded yet in \`${currentPath}\`.\nLogs are emitted continuously during agent turns and tool executions.`,
      };
    }

    const formatted = lines.map((line) => {
      try {
        const parsed = JSON.parse(line) as {
          timestamp?: string;
          level?: string;
          component?: string;
          message?: string;
        };
        const time = parsed.timestamp ? new Date(parsed.timestamp).toLocaleTimeString() : "";
        const levelBadge = `[${(parsed.level || "INFO").toUpperCase()}]`;
        const componentBadge = parsed.component ? `[${parsed.component}]` : "";
        return `\`${time}\` **${levelBadge}** ${componentBadge} ${parsed.message || line}`;
      } catch {
        return line;
      }
    });

    return {
      kind: "local",
      output: [
        `# 📜 Agent Runtime Logs (Last ${lines.length} entries)`,
        `*Source: \`${currentPath}\`*`,
        "",
        ...formatted,
      ].join("\n"),
    };
  }

  if (subCommand === "export") {
    const targetPath =
      args[1] || path.join(context.cwd, `coding-agent-debug-${Date.now()}.jsonl`);
    try {
      if (!fs.existsSync(currentPath)) {
        return {
          kind: "local",
          output: "No log file found to export.",
        };
      }
      fs.copyFileSync(currentPath, targetPath);
      return {
        kind: "local",
        output: `Successfully exported agent runtime logs to:\n\`${targetPath}\``,
      };
    } catch (err) {
      return {
        kind: "local",
        output: `Failed to export logs: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (subCommand === "clear") {
    try {
      if (fs.existsSync(currentPath)) {
        fs.writeFileSync(currentPath, "", "utf8");
      }
      return {
        kind: "local",
        output: `Cleared current session log file: \`${currentPath}\``,
      };
    } catch (err) {
      return {
        kind: "local",
        output: `Failed to clear logs: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    kind: "local",
    output: [
      "# 📖 /log Command Reference",
      "- `/log tail [N]`: Display the last N structured log entries (default: 30)",
      "- `/log path`: Display active session log path and logging directory",
      "- `/log export [destination]`: Export current session logs for diagnostics",
      "- `/log clear`: Clear current session log file",
    ].join("\n"),
  };
}
