import { parseBrowserPreviewActionArgs, type BrowserActionContract } from "./actionContract.js";
import {
  parseBrowserExecutionCommandArgs,
  type BrowserExecutionCommandParseResult,
} from "./executionCommandContract.js";
import {
  parseBrowserReplayCommandArgs,
  type BrowserReplayCommandRequest,
} from "./replayCommandContract.js";
import {
  parseBrowserSelfHealingCommandArgs,
  type BrowserSelfHealingCommandRequest,
} from "./selfHealingCommandContract.js";

export type BrowserCommandMode = "status" | "preview" | "dry-run" | "execute" | "replay" | "repair" | "runtime" | "smoke";

export interface BrowserCommandContract {
  readonly mode: BrowserCommandMode;
  readonly action?: BrowserActionContract;
  readonly execution?: BrowserExecutionCommandParseResult["request"];
  readonly replay?: BrowserReplayCommandRequest;
  readonly repair?: BrowserSelfHealingCommandRequest;
}

export interface BrowserCommandParseResult {
  readonly ok: boolean;
  readonly contract?: BrowserCommandContract;
  readonly errorOutput?: string;
}

export function parseBrowserCommandArgs(args: readonly string[]): BrowserCommandParseResult {
  if (args.length === 0 || (args.length === 1 && args[0] === "status")) {
    return {
      ok: true,
      contract: { mode: "status" },
    };
  }
  if (args[0] === "execute") {
    const parsed = parseBrowserExecutionCommandArgs(args);
    if (!parsed.ok || !parsed.request) {
      return {
        ok: false,
        errorOutput: parsed.errorOutput,
      };
    }
    return {
      ok: true,
      contract: {
        mode: "execute",
        action: parsed.request.action,
        execution: parsed.request,
      },
    };
  }
  if (args[0] === "smoke") {
    return {
      ok: true,
      contract: { mode: "smoke" },
    };
  }
  if (args[0] === "runtime") {
    if (args.length === 1 || args[1] === "status") {
      return {
        ok: true,
        contract: { mode: "runtime" },
      };
    }
    return invalidBrowserArgs(args.join(" "));
  }
  if (args[0] === "replay") {
    const parsed = parseBrowserReplayCommandArgs(args.slice(1));
    if (parsed.ok === false) {
      return {
        ok: false,
        errorOutput: parsed.errorOutput,
      };
    }
    return {
      ok: true,
      contract: {
        mode: "replay",
        replay: parsed.request,
      },
    };
  }
  if (args[0] === "repair") {
    const parsed = parseBrowserSelfHealingCommandArgs(args.slice(1));
    if (parsed.ok === false) {
      return {
        ok: false,
        errorOutput: parsed.errorOutput,
      };
    }
    return {
      ok: true,
      contract: {
        mode: "repair",
        repair: parsed.request,
      },
    };
  }
  if (args[0] !== "preview" && args[0] !== "dry-run") {
    return invalidBrowserArgs(args.join(" "));
  }
  const parsed = parseBrowserPreviewActionArgs(args.slice(1));
  if (!parsed.ok || !parsed.contract) {
    return {
      ok: false,
      errorOutput: parsed.errorOutput,
    };
  }
  return {
    ok: true,
    contract: {
      mode: args[0],
      action: parsed.contract,
    },
  };
}

function invalidBrowserArgs(value: string): BrowserCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-browser-args",
      `- Reason: Unsupported /browser argument: ${value || "(empty)"}`,
      "- DoNext: Use /browser, /browser status, /browser runtime status, /browser preview <action>, /browser dry-run <action>, /browser execute <action>, /browser replay <receipt-id>, or /browser repair status.",
      "",
      "Supported /browser forms:",
      "- /browser",
      "- /browser status",
      "- /browser runtime status",
      "- /browser preview navigate <url>",
      "- /browser preview extract <goal>",
      "- /browser preview click <target>",
      "- /browser preview type <target> <text>",
      "- /browser dry-run navigate <url>",
      "- /browser dry-run extract <goal>",
      "- /browser dry-run click <target>",
      "- /browser dry-run type <target> <text>",
      "- /browser execute navigate <url>",
      "- /browser execute observe",
      "- /browser execute extract <goal>",
      "- /browser smoke",
      "- /browser replay status",
      "- /browser replay <receipt-id>",
      "- /browser repair status",
      "- /browser repair apply <proposal-id> --confirm",
    ].join("\n"),
  };
}
