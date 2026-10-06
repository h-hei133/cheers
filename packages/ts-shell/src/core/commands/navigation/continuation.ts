import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";

export const continueSyntax: CommandSyntax = {
  name: "continue", actions: [{ name: "", summary: "continue a session with optional follow-up text", parameters: [
    { name: "sess_<id>", kind: "text" },
    { name: "prompt", kind: "text" },
  ] }],
};

/** Only the leading session selector is decoded; the follow-up remains prose. */
export function parseContinueArgs(args: readonly string[], raw?: string) {
  const source = raw ?? args.join(" ");
  const head = /^\s*(?:"([^"]*)"|'([^']*)'|(\S+))(?=\s|$)/.exec(source);
  const first = head?.slice(1).find(value => value !== undefined);
  const sessionId = first && /^sess_[a-z0-9_]+$/i.test(first) ? first : undefined;
  const text = sessionId ? source.slice(head![0].length).replace(/^(?:\r\n|\s)/, "") : source;
  const prompt = text.trim() ? text : undefined;
  const parsed = parseSyntax(continueSyntax, [...(sessionId ? [sessionId] : []), ...(prompt ? [prompt] : [])]);
  return parsed.ok ? { ok: true as const, sessionId, prompt } : parsed;
}
