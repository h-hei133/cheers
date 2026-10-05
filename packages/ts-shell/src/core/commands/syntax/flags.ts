import { parseArgs } from "node:util";
import type { CommandFlag } from "./model.js";

type FlagResult =
  | { readonly ok: true; readonly args: string[]; readonly flags: ReadonlyMap<string, string | true> }
  | { readonly ok: false; readonly reason: string };

/** Strict native option parsing, with canonical aliases and duplicate detection. */
export function parseFlags(definitions: readonly CommandFlag[], input: readonly string[]): FlagResult {
  const names = new Map(definitions.flatMap(flag => [flag.name, ...(flag.aliases ?? [])].map(name => [name, flag] as const)));
  const options = Object.fromEntries([...names].map(([name, flag]) => [name, { type: flag.kind === "text" ? "string" as const : "boolean" as const, ...(name === flag.name && flag.short ? { short: flag.short } : {}) }]));
  try {
    const parsed = parseArgs({ args: [...input], options, strict: true, allowPositionals: true, tokens: true });
    const flags = new Map<string, string | true>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      const definition = names.get(token.name)!;
      if (flags.has(definition.name)) return { ok: false, reason: "Repeated option." };
      const value = token.value ?? true;
      if (typeof value === "string" && (!value.length || (definition.values && !definition.values.includes(value)))) {
        return { ok: false, reason: "Invalid option value." };
      }
      flags.set(definition.name, value);
    }
    for (const definition of definitions) {
      if (flags.has(definition.name) && definition.conflicts?.some(name => flags.has(name))) {
        return { ok: false, reason: "Conflicting options." };
      }
    }
    return { ok: true, args: parsed.positionals, flags };
  } catch {
    // Native errors include argv values; keep potentially sensitive input out of diagnostics.
    return { ok: false, reason: "Unknown option or missing/invalid option value." };
  }
}
