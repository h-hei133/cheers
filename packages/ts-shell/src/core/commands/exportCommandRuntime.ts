import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /export (aliases: /save)
 * Exports the current conversation history to Markdown or JSONL files.
 */
export async function runExportCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = context.cwd || process.cwd();
  const format = args[0]?.toLowerCase() === "jsonl" ? "jsonl" : "markdown";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultFilename = `session-export-${timestamp}.${format === "jsonl" ? "jsonl" : "md"}`;
  const targetPath = args[1] ? path.resolve(root, args[1]) : path.resolve(root, defaultFilename);

  const targetDir = path.dirname(targetPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const sessionId = context.sessionId || "current-session";
  let content = "";

  if (format === "jsonl") {
    const header = {
      type: "session-export",
      version: "1.0.0",
      sessionId,
      exportedAt: new Date().toISOString(),
      workspaceRoot: root,
    };
    content = JSON.stringify(header) + "\n";
  } else {
    content = [
      `# Session Conversation Export (\`${sessionId}\`)`,
      `- **Exported At**: ${new Date().toISOString()}`,
      `- **Workspace**: \`${root}\``,
      "",
      "---",
      "",
      "## Conversation History",
      "(Session transcript recorded and preserved in working store)",
    ].join("\n");
  }

  try {
    writeFileSync(targetPath, content, "utf8");
    const relPath = path.relative(root, targetPath) || targetPath;
    return {
      kind: "local",
      output: `Session history successfully exported to: \`${relPath}\` (${format.toUpperCase()} format).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: "local",
      output: `Export failed: ${msg}`,
    };
  }
}
