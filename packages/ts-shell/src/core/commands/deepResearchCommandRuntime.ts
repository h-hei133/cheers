import type { CommandContext, LocalCommandResult } from "./types.js";
import { DeepResearcher } from "../research/deepResearcher.js";

/**
 * /deep-research command
 * Conducts multi-agent tree-search research across technical documentation,
 * cross-checks sources via claim consensus voting, and outputs a cited report.
 */
export async function runDeepResearchCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const topic = args.join(" ").trim();

  if (!topic || topic === "--help" || topic === "-h") {
    return {
      kind: "local",
      output: [
        "# Deep Technical Research (/deep-research)",
        "",
        "Investigates complex technical questions, libraries, protocols, or architecture trade-offs",
        "by executing recursive breadth x depth tree searches and cross-source consensus voting.",
        "",
        "Usage:",
        "- `/deep-research <technical topic or question>`",
        "",
        "Examples:",
        "- `/deep-research Node.js permission model changes between v20 and v22`",
        "- `/deep-research WAF bypass and stealth anti-detection techniques in Playwright`",
        "- `/deep-research Embedded vector database options in TypeScript compared`",
      ].join("\n"),
    };
  }

  const report = await DeepResearcher.research({
    topic,
    breadth: 2,
    depth: 1, // fast bounded execution for interactive CLI
    maxConcurrency: 2,
  });

  return {
    kind: "local",
    output: report.reportMarkdown,
  };
}
