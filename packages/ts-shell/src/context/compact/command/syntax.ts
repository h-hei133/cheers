import type { CommandSyntax } from "../../../core/commands/syntax/model.js";
import { parseSyntax } from "../../../core/commands/syntax/parse.js";

export const COMPACT_MODES = ["preview", "render", "json"] as const;
const instructions = [{ name: "instructions", kind: "text" as const, rest: true }];

export const compactSyntax: CommandSyntax = {
  name: "compact",
  defaultAction: "",
  actions: [
    { name: "", summary: "Condense live history with optional focus instructions", parameters: instructions },
    ...COMPACT_MODES.map(name => ({ name, summary: "Read-only handoff artifact", parameters: instructions })),
  ],
  flags: [
    ...COMPACT_MODES.map(name => ({ name, kind: "boolean" as const, summary: "Read-only handoff artifact", conflicts: COMPACT_MODES.filter(mode => mode !== name) })),
    { name: "source", kind: "text", summary: "Handoff source", values: ["session", "route", "manual"] },
    { name: "goal", aliases: ["objective"], kind: "text", summary: "Task objective" },
    { name: "constraint", kind: "text", repeatable: true, summary: "Task constraint (repeatable)" },
    { name: "next", aliases: ["next-action"], kind: "text", summary: "Next action" },
    { name: "route-id", aliases: ["route"], kind: "text", summary: "Route identifier" },
    { name: "route-name", aliases: ["name"], kind: "text", summary: "Route name" },
    { name: "phase", kind: "text", summary: "Current phase" },
    { name: "project-root", aliases: ["cwd"], kind: "text", summary: "Project root" },
    { name: "branch", kind: "text", summary: "Branch" },
    { name: "base", aliases: ["base-commit"], kind: "text", summary: "Base commit" },
  ],
};

export function parseCompactSyntax(args: readonly string[]) {
  const mode = COMPACT_MODES.find(value => value === args[0]?.toLowerCase());
  const parsed = parseSyntax(compactSyntax, mode ? [mode, ...args.slice(1)] : ["", ...args]);
  if (!parsed.ok) return parsed;
  const flagMode = COMPACT_MODES.find(value => parsed.flags.has(value));
  if (mode && flagMode) return { ok: false as const, reason: "Specify the handoff mode only once." };
  return { ...parsed, mode: mode ?? flagMode, artifact: Boolean(mode || parsed.flags.size) };
}
