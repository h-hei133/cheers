import { thinkingSyntax } from "./thinking/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  readProjectState,
  writeProjectState,
  type ThinkingEffort,
} from "../state/projectState.js";

/**
 * /thinking — how much reasoning to ask the provider for.
 *
 * This sends `reasoning_effort` on the request, which is the OpenAI-compatible
 * spelling most hosts accept. It is a request, not a guarantee: a provider that
 * does not implement the field ignores it, and one that rejects it has the field
 * dropped and the turn retried without it. What is not claimed is a token budget —
 * the field takes a level, and the provider decides what a level costs.
 *
 * The tier is kept per project, because how much thinking a piece of work wants is
 * a property of the work rather than of the process that happens to be running.
 */


/** The effort recorded for this project, or none. */
export function getThinkingEffort(workspaceRoot: string): ThinkingEffort | undefined {
  return readProjectState(workspaceRoot).thinkingEffort ?? undefined;
}

export async function runThinkingCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseSyntax(thinkingSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /thinking arguments: ${parsed.reason}\n${syntaxHelp(thinkingSyntax)}` };
  const root = context.cwd;
  const current = getThinkingEffort(root);
  const tier = parsed.action.effort;

  if (tier === undefined) {
    return {
      kind: "local",
      output: [
        "### Thinking",
        "",
        current
          ? `- Asking for \`${current}\` reasoning effort on every request in this project`
          : "- Not asking for any particular effort — the provider decides",
        "",
        syntaxHelp(thinkingSyntax),
        "",
        "Providers that do not implement the field ignore it; one that rejects it has it dropped and the turn retried without it.",
      ].join("\n"),
    };
  }

  if (tier === null) {
    return {
      kind: "local",
      output: report(
        writeProjectState(root, { thinkingEffort: null }),
        "Not asking for a particular effort any more.",
      ),
    };
  }

  return {
    kind: "local",
    output: report(
      writeProjectState(root, { thinkingEffort: tier }),
      `Asking for \`${tier}\` reasoning effort from the next turn.`,
    ),
  };
}

/** The outcome, with the failure named when the choice could not be kept. */
function report(written: string | undefined, success: string): string {
  if (written) return success;
  return [success, "", "It could not be written to disk, so it will be lost when this process ends."].join("\n");
}
