import { parseBrowserPreviewActionArgs, type BrowserActionContract } from "./browserActionContract.js";
import {
  parseBrowserExecutionCommandArgs,
  type BrowserExecutionCommandParseResult,
} from "./browserExecutionCommandContract.js";

export type BrowserCommandMode = "status" | "preview" | "dry-run" | "execute";

export interface BrowserCommandContract {
  readonly mode: BrowserCommandMode;
  readonly action?: BrowserActionContract;
  readonly execution?: BrowserExecutionCommandParseResult["request"];
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
      "- DoNext: Use /browser, /browser status, /browser preview <action>, /browser dry-run <action>, or /browser execute <action>.",
      "",
      "Supported /browser forms:",
      "- /browser",
      "- /browser status",
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
    ].join("\n"),
  };
}
