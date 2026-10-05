import { actionSyntax } from "./command/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
import {
  browserActionRiskForKind,
  sanitizeBrowserText,
  type BrowserActionKind,
  type BrowserActionRisk,
  type BrowserBackendKind,
} from "./capabilityModel.js";

export interface BrowserActionContract {
  readonly actionKind: BrowserActionKind;
  readonly target?: string;
  readonly url?: string;
  readonly selector?: string;
  readonly text?: string;
  readonly extractionGoal?: string;
  readonly userIntentSummary: string;
  readonly requestedBackend?: BrowserBackendKind;
  readonly requiresNetwork: boolean;
  readonly requiresAuth: boolean;
  readonly risk: BrowserActionRisk;
  readonly sourceCommand: "/browser";
  readonly rawContent: "excluded";
}

export interface BrowserActionContractParseResult {
  readonly ok: boolean;
  readonly contract?: BrowserActionContract;
  readonly errorOutput?: string;
}

export function createBrowserActionContract(
  input: Omit<BrowserActionContract, "risk" | "sourceCommand" | "rawContent"> & {
    readonly risk?: BrowserActionRisk;
  },
): BrowserActionContract {
  const risk = input.risk ?? browserActionRiskForKind(input.actionKind);
  return {
    actionKind: input.actionKind,
    target: sanitizeOptional(input.target),
    url: sanitizeOptional(input.url),
    selector: sanitizeOptional(input.selector),
    text: sanitizeOptional(input.text),
    extractionGoal: sanitizeOptional(input.extractionGoal),
    userIntentSummary: sanitizeBrowserText(input.userIntentSummary),
    requestedBackend: input.requestedBackend,
    requiresNetwork: input.requiresNetwork,
    requiresAuth: input.requiresAuth,
    risk,
    sourceCommand: "/browser",
    rawContent: "excluded",
  };
}

export function parseBrowserPreviewActionArgs(
  args: readonly string[],
): BrowserActionContractParseResult {
  const parsed = parseSyntax(actionSyntax, args);
  if (!parsed.ok) return invalidBrowserPreview(parsed.reason);
  const kind = parsed.action.name as BrowserActionKind;
  const rest = parsed.args;
  switch (kind) {
    case "navigate": {
      const url = rest[0];
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "navigate",
          url,
          target: url,
          userIntentSummary: `Preview navigation to ${url ?? "(missing url)"}.`,
          requiresNetwork: true,
          requiresAuth: false,
        }),
      };
    }
    case "extract":
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "extract",
          extractionGoal: rest.join(" "),
          userIntentSummary: `Preview extraction: ${rest.join(" ") || "(missing goal)"}.`,
          requiresNetwork: false,
          requiresAuth: false,
        }),
      };
    case "observe":
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "observe",
          target: rest.join(" "),
          userIntentSummary: `Preview page observation: ${rest.join(" ") || "(current page)"}.`,
          requiresNetwork: false,
          requiresAuth: false,
        }),
      };
    case "click":
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "click",
          target: rest.join(" "),
          userIntentSummary: `Preview click target: ${rest.join(" ") || "(missing target)"}.`,
          requiresNetwork: false,
          requiresAuth: false,
        }),
      };
    case "type": {
      const [target, ...textParts] = rest;
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "type",
          target,
          text: textParts.join(" "),
          userIntentSummary: `Preview typing into ${target ?? "(missing target)"}.`,
          requiresNetwork: false,
          requiresAuth: false,
        }),
      };
    }
    case "wait":
      return {
        ok: true,
        contract: createBrowserActionContract({
          actionKind: "wait",
          target: rest.join(" "),
          userIntentSummary: `Preview wait condition: ${rest.join(" ") || "(missing condition)"}.`,
          requiresNetwork: false,
          requiresAuth: false,
        }),
      };
    case "auth":
      return blockedContract(kind, rest.join(" "), true);
    case "payment":
    case "destructive":
    case "screenshot":
    case "download":
    case "upload":
    case "status":
      return blockedContract(kind, rest.join(" "), false);
  }
}

function blockedContract(
  kind: BrowserActionKind,
  target: string,
  requiresAuth: boolean,
): BrowserActionContractParseResult {
  return {
    ok: true,
    contract: createBrowserActionContract({
      actionKind: kind,
      target,
      userIntentSummary: `Preview blocked browser action: ${kind}.`,
      requiresNetwork: false,
      requiresAuth,
    }),
  };
}

function invalidBrowserPreview(reason: string): BrowserActionContractParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-browser-preview",
      `- Reason: ${sanitizeBrowserText(reason)}`,
      "- DoNext: Use /browser preview navigate <url>, extract <goal>, click <target>, or type <target> <text>.",
    ].join("\n"),
  };
}

function sanitizeOptional(value: string | undefined): string | undefined {
  const sanitized = sanitizeBrowserText(value ?? "");
  return sanitized.length > 0 ? sanitized : undefined;
}
