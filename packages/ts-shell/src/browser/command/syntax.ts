import type { CommandSyntax } from "../../core/commands/syntax/model.js";
import { parseSyntax } from "../../core/commands/syntax/parse.js";
import { syntaxCompletions } from "../../core/commands/syntax/projection.js";
import { scanCommandArgs } from "../../core/commands/arguments.js";

const rest = { name: "arguments", kind: "text", rest: true } as const;
const receipt = { name: "receipt-id", kind: "text", required: true } as const;
export const browserSyntax: CommandSyntax = {
  name: "browser", defaultAction: "status",
  actions: [
    { name: "status", summary: "inspect browser capabilities" },
    { name: "smoke", summary: "run the configured read-only web probe" },
    { name: "runtime", summary: "inspect browser runtime", parameters: [{ name: "mode", kind: "text", values: ["status"] }] },
    ...["preview", "dry-run", "execute", "replay", "repair"].map(name => ({ name, summary: `${name} browser actions`, parameters: [rest] })),
  ],
};
export const actionSyntax: CommandSyntax = {
  name: "browser action",
  actions: [
    { name: "navigate", summary: "inspect navigation to one URL", parameters: [{ name: "url", kind: "text" }] },
    { name: "type", summary: "inspect typing into a target", parameters: [{ name: "target", kind: "text" }, { name: "text", kind: "text", rest: true }] },
    ...["extract", "observe", "click", "wait"].map(name => ({ name, summary: `${name} with existing browser policy`, parameters: [rest] })),
    ...["auth", "payment", "destructive", "screenshot", "download", "upload", "status"].map(name => ({ name, summary: "inspect a policy-blocked action", parameters: [rest] })),
  ],
};
export const replaySyntax: CommandSyntax = {
  name: "browser replay", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect replay status" },
    { name: "", summary: "replay one receipt", parameters: [receipt] },
    { name: "cache", summary: "manage the receipt cache", parameters: [rest] },
  ],
};
export const cacheSyntax: CommandSyntax = {
  name: "browser replay cache", defaultAction: "status", flags: [],
  actions: [
    ...["status", "compact", "repair"].map(name => ({ name, summary: `${name} receipt cache` })),
    ...["invalidate", "delete"].map(name => ({ name, summary: `${name} one receipt`, parameters: [receipt] })),
  ],
};
export const repairSyntax: CommandSyntax = {
  name: "browser repair", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect repair proposals" },
    { name: "apply", summary: "apply a proposal with separate explicit confirmation", parameters: [{ name: "proposal-id", kind: "text", required: true }], flags: [
      { name: "manifest", kind: "text", summary: "select a manifest path" },
      { name: "confirm", kind: "boolean", summary: "explicitly confirm the repair", suggest: false },
    ] },
  ],
};

export function parseReplayArgs(args: readonly string[]) {
  const first = args[0]?.toLowerCase();
  if (first === "cache") return { cache: true, parsed: parseSyntax(cacheSyntax, args.slice(1)) };
  const input = args.length && first !== "status" ? ["", ...args] : args;
  return { cache: false, parsed: parseSyntax(replaySyntax, input) };
}

/** Follow the same owner branches; accepting a candidate never adds confirmation. */
export function browserCompletions(prefix: string) {
  const tokens = scanCommandArgs(prefix, true);
  const first = tokens[0];
  if (!first || tokens.length === 1 && !/\s$/.test(prefix)) return syntaxCompletions(browserSyntax, prefix);
  const tail = prefix.slice(first.to).trimStart();
  const mode = first.value.toLowerCase();
  if (["preview", "dry-run", "execute"].includes(mode)) return syntaxCompletions(actionSyntax, tail);
  if (mode === "repair") return syntaxCompletions(repairSyntax, tail);
  if (mode === "replay") {
    const child = tokens[1];
    if (child?.value.toLowerCase() === "cache" && (tokens.length > 2 || /\s$/.test(prefix))) return syntaxCompletions(cacheSyntax, prefix.slice(child.to).trimStart());
    return syntaxCompletions(replaySyntax, tail);
  }
  return syntaxCompletions(browserSyntax, prefix);
}
