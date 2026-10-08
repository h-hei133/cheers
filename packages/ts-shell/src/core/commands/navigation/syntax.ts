import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";
import { validateSessionId } from "../../../session/store/sessionFileLayout.js";
import { syntaxCompletions } from "../syntax/projection.js";
import { scanCommandArgs } from "../arguments.js";

const reference = { name: "id|prefix|title|last", kind: "text" } as const;
const entry = { name: "entry-id", kind: "text" } as const;
const help = { name: "help", aliases: ["--help"], summary: "show navigation usage", flags: [] } as const;
export const resumeSyntax: CommandSyntax = {
  name: "resume", defaultAction: "",
  actions: [
    { name: "", summary: "resume a session or open the session surface", parameters: [reference], flags: [] },
    ...["panel", "list", "current"].map(name => ({ name, aliases: name === "list" ? ["ls"] : name === "current" ? ["active"] : [], summary: `show ${name} sessions`, flags: [] })),
    { name: "switch", aliases: ["use"], summary: "switch to a session", parameters: [reference], flags: [] },
    { name: "fork", summary: "copy a session and continue the copy", parameters: [{ ...reference, name: "session-id|here", required: true }], flags: [] },
    { name: "rename", summary: "edit a saved session title", parameters: [{ ...reference, required: true }, { name: "title", kind: "text", rest: true }], flags: [] },
    { name: "delete", summary: "preview and confirm saved session deletion", parameters: [{ ...reference, required: true }], flags: [] },
    { name: "new", summary: "start a new conversation", flags: [] },
    help,
  ],
};
export const forkSyntax: CommandSyntax = {
  name: "fork", defaultAction: "",
  actions: [{ name: "", summary: "copy a session and continue the copy", parameters: [{ ...reference, name: "session-id|here", required: true }], flags: [] }],
};
export const treeSyntax: CommandSyntax = {
  name: "tree", defaultAction: "",
  actions: [{ name: "", summary: "open the tree or continue from an entry", parameters: [entry], flags: [] }, help],
};
export const entriesSyntax: CommandSyntax = {
  name: "entries", defaultAction: "",
  actions: [
    { name: "", summary: "read entries after an optional exclusive cursor", parameters: [entry], flags: [] },
    { name: "tree", summary: "read the session tree or a subtree", parameters: [entry], flags: [] },
    help,
  ],
};

/** A non-action token belongs to the direct-reference form, never an object lookup. */
export function parseNavigationArgs(syntax: CommandSyntax, args: readonly string[]) {
  const first = args[0]?.trim().toLowerCase();
  const action = syntax.actions.find(item => item.name.toLowerCase() === first || item.aliases?.some(alias => alias.toLowerCase() === first));
  return parseSyntax(syntax, args.length ? [action?.name ?? "", ...(action ? args.slice(1) : args)] : []);
}

export function validSessionReference(value: string): boolean {
  try { const id = validateSessionId(value); return id !== "." && id !== ".."; }
  catch { return false; }
}

export function navigationCompletions(syntax: CommandSyntax, prefix: string) {
  const tokens = scanCommandArgs(prefix, true);
  const current = /\s$/.test(prefix) ? "" : tokens.at(-1)?.value ?? "";
  const before = current ? tokens.slice(0, -1) : tokens;
  const forkTarget = syntax.name === "fork" ? before.length === 0
    : syntax.name === "resume" && before.length === 1 && before[0]?.value.toLowerCase() === "fork";
  if (forkTarget && "here".startsWith(current.toLowerCase())) return [{ value: "here", label: "here", detail: "fork the current session" }];
  return syntaxCompletions(syntax, prefix);
}
