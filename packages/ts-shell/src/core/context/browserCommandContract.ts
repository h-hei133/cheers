import { parseBrowserPreviewActionArgs, type BrowserActionContract } from "./browserActionContract.js";

export type BrowserCommandMode = "status" | "preview" | "dry-run";

export interface BrowserCommandContract {
  readonly mode: BrowserCommandMode;
  readonly action?: BrowserActionContract;
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
      "- DoNext: Use /browser, /browser status, /browser preview <action>, or /browser dry-run <action>.",
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
    ].join("\n"),
  };
}
