import type { CommandSyntax } from "./model.js";
import { parseSyntax } from "./parse.js";

/** A single prose body, without shell quoting or an option grammar. */
export function textSyntax(name: string, parameter: string, required = false): CommandSyntax {
  return { name, actions: [{ name: "", summary: "accept literal text", parameters: [
    { name: parameter, kind: "text", required },
  ] }] };
}

export function parseTextArgs(syntax: CommandSyntax, args: readonly string[], raw?: string) {
  const text = raw ?? args.join(" ");
  const parsed = parseSyntax(syntax, text ? [text] : []);
  return parsed.ok ? { ok: true as const, text } : parsed;
}
