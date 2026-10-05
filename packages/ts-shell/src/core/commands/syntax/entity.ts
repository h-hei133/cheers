import type { CommandSyntax } from "./model.js";

/** An optional single entity name; quoting and -- preserve literal identifiers. */
export function entitySyntax(name: string): CommandSyntax {
  return { name, actions: [{ name: "", summary: "List or select a named entry", parameters: [{ name: "name", kind: "text" }] }], flags: [] };
}
