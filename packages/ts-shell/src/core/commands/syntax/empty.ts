import { parseSyntax } from "./parse.js";

/** Reject ignored input before a parameterless command reads state or emits an action. */
export function rejectArguments(name: string, args: readonly string[]) {
  const parsed = parseSyntax({ name, actions: [{ name: "", summary: "No arguments" }], flags: [] }, args);
  if (parsed.ok) return undefined;
  return { kind: "local" as const, output: `Invalid /${name} arguments: ${parsed.reason}\nUsage: /${name}` };
}
