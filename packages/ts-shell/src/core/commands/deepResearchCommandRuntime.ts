import type { CommandContext, LocalCommandResult } from "./types.js";
import { collectSources } from "../research/collector.js";
import { renderCollection } from "../research/renderer.js";

/** The old command name remains supported as a compatibility alias. */
export async function runDeepResearchCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const topic = args.join(" ").trim();
  if (!topic || topic === "--help" || topic === "-h") {
    return { kind: "local", output: [
      "# Web Source Collection (/web-research)",
      "",
      "Collects public web excerpts using two fixed search queries and at most six distinct URLs.",
      "No model synthesis or factual verification is performed. Search and fetch failures are reported.",
      "",
      "Usage: `/web-research <topic or question>`",
      "Example: `/web-research Node.js permission model changes between v20 and v22`",
      "Compatibility aliases: /deep-research, /research, /deep",
    ].join("\n") };
  }
  const report = await collectSources(topic, {
    taskId: "web-research",
    workspaceRoot: context.cwd,
  });
  return { kind: "local", output: renderCollection(report) };
}
