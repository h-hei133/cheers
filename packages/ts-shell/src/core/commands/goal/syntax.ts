import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";

export const goalSyntax: CommandSyntax = {
  name: "goal", defaultAction: "",
  actions: [
    { name: "", summary: "inspect or set the project objective", parameters: [{ name: "objective", kind: "text", rest: true }] },
    { name: "pause", summary: "pause the recorded objective" },
    { name: "resume", summary: "resume the recorded objective" },
    { name: "complete", aliases: ["done"], summary: "mark the recorded objective complete" },
    { name: "clear", summary: "remove the recorded objective" },
  ],
};

/** Only a single reserved token is an action; multiword objectives remain prose. */
export function parseGoalArgs(args: readonly string[]) {
  const action = args.length === 1 && goalSyntax.actions.some(item => item.name === args[0]?.toLowerCase() || item.aliases?.includes(args[0]?.toLowerCase() ?? ""));
  return parseSyntax(goalSyntax, action ? args : ["", ...args]);
}
