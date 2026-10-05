import { parseReplayArgs } from "./command/syntax.js";
import { sanitizeBrowserText } from "./capabilityModel.js";

export type BrowserReplayCommandMode =
  | "status"
  | "replay"
  | "cache-status"
  | "cache-invalidate"
  | "cache-delete"
  | "cache-compact"
  | "cache-repair";

export interface BrowserReplayCommandRequest {
  readonly mode: BrowserReplayCommandMode;
  readonly receiptId?: string;
  readonly sourceCommand: "/browser replay";
}

export type BrowserReplayCommandParseResult =
  | { readonly ok: true; readonly request: BrowserReplayCommandRequest }
  | { readonly ok: false; readonly errorOutput: string };

export function parseBrowserReplayCommandArgs(
  args: readonly string[],
): BrowserReplayCommandParseResult {
  const { cache, parsed } = parseReplayArgs(args);
  if (!parsed.ok) return invalid(parsed.reason);
  const action = parsed.action.name;
  const mode = cache ? `cache-${action}` as BrowserReplayCommandMode : action === "status" ? "status" : "replay";
  return { ok: true, request: { mode, ...(parsed.args[0] ? { receiptId: parsed.args[0] } : {}), sourceCommand: "/browser replay" } };
}

function invalid(reason: string): BrowserReplayCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Browser replay",
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-browser-replay-args",
      `- Reason: ${sanitizeBrowserText(reason, 180)}`,
      "- DoNext: Use /browser replay status or /browser replay <receipt-id>.",
    ].join("\n"),
  };
}
