import type { CommandContext, LocalCommandResult } from "./types.js";
import { textSyntax, parseTextArgs } from "./syntax/text.js";
import { syntaxHelp } from "./syntax/projection.js";
import { collectSources } from "../research/collector.js";
import { renderCollection } from "../research/renderer.js";

/** The old command name remains supported as a compatibility alias. */
export const webResearchSyntax = textSyntax("web-research", "topic", true);

export async function runDeepResearchCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseTextArgs(webResearchSyntax, args, context.rawCommandArgs);
  if (!parsed.ok || parsed.text.trim() === "--help" || parsed.text.trim() === "-h") {
    return { kind: "local", output: [
      "# Web Source Collection (/web-research)",
      "",
      "Collects public web excerpts using two fixed search queries and at most six distinct URLs.",
      "No model synthesis or factual verification is performed. Search and fetch failures are reported.",
      "",
      ...(!parsed.ok ? [parsed.reason] : []),
      syntaxHelp(webResearchSyntax),
      "Example: `/web-research Node.js permission model changes between v20 and v22`",
      "Compatibility aliases: /deep-research, /research, /deep",
    ].join("\n") };
  }
  const report = await collectSources(parsed.text, {
    taskId: "web-research",
    workspaceRoot: context.cwd,
  });
  return { kind: "local", output: renderCollection(report) };
}
