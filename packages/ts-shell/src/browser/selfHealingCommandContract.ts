import { repairSyntax } from "./command/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
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
  const parsed = parseSyntax(repairSyntax, args);
  if (!parsed.ok) return invalid(parsed.reason);
  const manifest = parsed.flags.get("manifest");
  return { ok: true, request: {
    mode: parsed.action.name === "apply" ? "apply" : "status",
    ...(parsed.args[0] ? { proposalId: parsed.args[0] } : {}),
    ...(typeof manifest === "string" ? { manifestPath: manifest } : {}),
    userConfirmed: parsed.flags.has("confirm"), sourceCommand: "/browser repair",
  } };
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
