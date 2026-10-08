import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";
export const goalCommandAliases = ['objective', 'target'] as const;

export const goalSyntax: CommandSyntax = {
  name: "goal", defaultAction: "",
  actions: [
    { name: "", summary: "inspect or set the session goal", parameters: [{ name: "objective", kind: "text", rest: true }] },
    { name: "set", summary: "set a new session goal", parameters: [{ name: "objective", kind: "text", rest: true, required: true }] },
    { name: "show", summary: "inspect the session goal" },
    { name: "pause", summary: "pause the recorded objective" },
    { name: "resume", summary: "resume the recorded objective" },
    { name: "complete", aliases: ["done"], summary: "declare the session goal complete" },
    { name: "drop", aliases: ["clear"], summary: "abandon the session goal" },
    { name: "import", summary: "import the legacy project description as paused" },
    { name: "budget", summary: "set a strict cumulative token cap or off", parameters: [{ name: "limit", kind: "text", required: true }] },
  ],
};

/** Old phase words inside multiword objectives remain prose. Canonical verbs validate arguments. */
export function parseGoalArgs(args: readonly string[]) {
  const first = args[0]?.toLowerCase();
  const canonical = ['set', 'show', 'drop', 'import', 'budget'].includes(first ?? '');
  const action = canonical || (args.length === 1 && goalSyntax.actions.some(item => item.name === first || item.aliases?.includes(first ?? "")));
  return parseSyntax(goalSyntax, action ? args : ["", ...args]);
}
