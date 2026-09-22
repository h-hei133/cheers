import { sanitizeBrowserText } from "./capabilityModel.js";

export type BrowserSelfHealingCommandMode = "status" | "apply";

export interface BrowserSelfHealingCommandRequest {
  readonly mode: BrowserSelfHealingCommandMode;
  readonly proposalId?: string;
  readonly manifestPath?: string;
  readonly userConfirmed: boolean;
  readonly sourceCommand: "/browser repair";
}

export type BrowserSelfHealingCommandParseResult =
  | { readonly ok: true; readonly request: BrowserSelfHealingCommandRequest }
  | { readonly ok: false; readonly errorOutput: string };

export function parseBrowserSelfHealingCommandArgs(
  args: readonly string[],
): BrowserSelfHealingCommandParseResult {
  if (args.length === 0 || args[0] === "status") {
    return { ok: true, request: { mode: "status", userConfirmed: false, sourceCommand: "/browser repair" } };
  }
  if (args[0] !== "apply") {
    return invalid("Unsupported browser repair command.");
  }
  const userConfirmed = args.includes("--confirm");
  const manifestIndex = args.indexOf("--manifest");
  const manifestPath = manifestIndex >= 0
    ? sanitizeBrowserText(args[manifestIndex + 1] ?? "", 240)
    : undefined;
  const proposalId = sanitizeBrowserText(args.filter((arg, index) =>
    arg !== "apply" &&
    arg !== "--confirm" &&
    arg !== "--manifest" &&
    index !== manifestIndex + 1
  ).join(" "), 240);
  if (!proposalId) {
    return invalid("Missing self-healing proposal id.");
  }
  return {
    ok: true,
    request: {
      mode: "apply",
      proposalId,
      manifestPath,
      userConfirmed,
      sourceCommand: "/browser repair",
    },
  };
}

function invalid(reason: string): BrowserSelfHealingCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Browser self-healing apply",
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-browser-repair-args",
      `- Reason: ${sanitizeBrowserText(reason, 180)}`,
      "- Browser executed: no",
      "- Replay executed: no",
      "- DoNext: Use /browser repair status or /browser repair apply <proposal-id> --confirm.",
    ].join("\n"),
  };
}
