import { STATUS_ITEMS } from "../../../presentation/tui/chrome/items.js";
import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";
import { syntaxCompletions } from "../syntax/projection.js";
import { scanCommandArgs } from "../arguments.js";

export const statuslineSyntax: CommandSyntax = {
  name: "statusline", defaultAction: "list", flags: [],
  actions: [
    { name: "list", summary: "show available status items" },
    { name: "use", summary: "choose status items", parameters: [{ name: "item", kind: "text", required: true, rest: true, values: STATUS_ITEMS.map(item => item.id) }] },
  ],
};

/** Commas and separate words both select items; empty list members are invalid. */
export function parseStatuslineArgs(args: readonly string[]) {
  return parseSyntax(statuslineSyntax, [ ...args.slice(0, 1), ...args.slice(1).flatMap(value => value.split(",").map(item => item.trim())) ]);
}

export function statuslineCompletions(prefix: string) {
  const tokens = scanCommandArgs(prefix, true);
  if (tokens[0]?.value.toLowerCase() !== "use" || tokens.length === 1 && !/\s$/.test(prefix)) return syntaxCompletions(statuslineSyntax, prefix);
  const current = /\s$/.test(prefix) ? "" : tokens.at(-1)!.value;
  const before = current ? tokens.slice(0, -1) : tokens;
  const pieces = current.split(",");
  const query = pieces.pop()!;
  const completed = [...before.slice(1).flatMap(token => token.value.split(",")), ...pieces].map(value => value.trim());
  const parsed = parseSyntax(statuslineSyntax, ["use", ...completed], true);
  if (!parsed.ok) return null;
  const stem = pieces.length ? `${pieces.join(",")},` : "";
  const matches = STATUS_ITEMS.filter(item => !completed.includes(item.id) && item.id.startsWith(query))
    .map(item => ({ value: stem + item.id, label: item.id, detail: item.describe }));
  return matches.length ? matches : null;
}
