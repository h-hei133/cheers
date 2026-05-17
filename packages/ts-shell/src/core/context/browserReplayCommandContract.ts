import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserReplayCommandMode = "status" | "replay";

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
  if (args.length === 0 || args[0] === "status") {
    return { ok: true, request: { mode: "status", sourceCommand: "/browser replay" } };
  }
  const receiptId = sanitizeBrowserText(args.join(" "), 180);
  if (!receiptId) {
    return invalid("Missing browser receipt id.");
  }
  return {
    ok: true,
    request: {
      mode: "replay",
      receiptId,
      sourceCommand: "/browser replay",
    },
  };
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
