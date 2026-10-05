import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";

export const MAX_ATTEMPTS = 10;
export const DEFAULT_ATTEMPTS = 5;
export const loopSyntax: CommandSyntax = {
  name: "loop", defaultAction: "",
  actions: [{ name: "", summary: "run a gate and request bounded repair attempts", parameters: [
    { name: "attempts", kind: "integer", minimum: 1, maximum: MAX_ATTEMPTS },
    { name: "command", kind: "text", required: true },
  ] }],
};

/** Inspect only the leading token: the remainder belongs to the shell grammar. */
export function parseLoopArgs(args: readonly string[], raw?: string) {
  const source = raw?.trimStart();
  const prefix = source?.match(/^(?:"([^"]*)"|'([^']*)'|(\S+))(?=\s|$)\s*/);
  const first = source === undefined ? args[0] ?? "" : prefix?.slice(1).find(value => value !== undefined) ?? "";
  const hasCount = /^[+-]?\d/.test(first) || first === "Infinity" || first === "NaN";
  const attempts = hasCount ? first : String(DEFAULT_ATTEMPTS);
  const gate = (source === undefined ? (hasCount ? args.slice(1) : args).join(" ") : hasCount ? source.slice(prefix![0].length) : source).trim();
  const parsed = parseSyntax(loopSyntax, [attempts, gate]);
  return parsed.ok ? { ok: true as const, attempts: Number(attempts), gate } : parsed;
}

/** These are suggestions, not an exhaustive list of valid integer budgets. */
export function loopArgumentCompletions(prefix: string) {
  if (/\s/.test(prefix)) return null;
  const values = [3, DEFAULT_ATTEMPTS, MAX_ATTEMPTS].map(String).filter(value => value.startsWith(prefix));
  return values.length ? values.map(value => ({ value, label: value, detail: "requested repair attempts; runtime turn budget still applies" })) : null;
}
