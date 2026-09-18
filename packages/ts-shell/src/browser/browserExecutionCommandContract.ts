import { parseBrowserPreviewActionArgs } from "./browserActionContract.js";
import {
  browserExecutionApprovalForAction,
} from "./browserExecutionPolicy.js";
import {
  createBrowserExecutionRequest,
  type BrowserExecutionRequest,
} from "./browserExecutionContract.js";

export interface BrowserExecutionCommandParseResult {
  readonly ok: boolean;
  readonly request?: BrowserExecutionRequest;
  readonly errorOutput?: string;
}

export function parseBrowserExecutionCommandArgs(
  args: readonly string[],
): BrowserExecutionCommandParseResult {
  if (args[0] !== "execute") {
    return invalidBrowserExecute("Missing execute subcommand.");
  }
  const parsed = parseBrowserPreviewActionArgs(args.slice(1));
  if (!parsed.ok || !parsed.contract) {
    return {
      ok: false,
      errorOutput: parsed.errorOutput,
    };
  }
  try {
    return {
      ok: true,
      request: createBrowserExecutionRequest({
        mode: "disabled",
        action: parsed.contract,
        approval: browserExecutionApprovalForAction(parsed.contract.actionKind),
        source: "/browser execute",
      }),
    };
  } catch (error) {
    return invalidBrowserExecute(error instanceof Error ? error.message : "Unsupported browser execution request.");
  }
}

function invalidBrowserExecute(reason: string): BrowserExecutionCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-browser-execute",
      `- Reason: ${reason}`,
      "- DoNext: Use /browser execute navigate <url>, /browser execute observe, or /browser execute extract <goal>.",
    ].join("\n"),
  };
}
