import {
  sanitizeBrowserText,
  type BrowserActionKind,
  type BrowserActionRisk,
} from "./browserCapabilityModel.js";
import type { BrowserActionContract } from "./browserActionContract.js";

export type BrowserExecutionMode =
  | "disabled"
  | "fake-test"
  | "local-fixture"
  | "explicit-local"
  | "future-runtime";

export type BrowserExecutionActionKind = Extract<
  BrowserActionKind,
  | "navigate"
  | "observe"
  | "extract"
  | "click"
  | "type"
  | "auth"
  | "payment"
  | "destructive"
  | "upload"
  | "download"
  | "screenshot"
>;

export type BrowserExecutionRequirement =
  | "explicit-executor"
  | "network-runtime-confirmation"
  | "sandbox-boundary"
  | "read-only-evidence"
  | "no-raw-content"
  | "no-session-persistence"
  | "future-confirmation";

export type BrowserExecutionApproval =
  | "none"
  | "read-only"
  | "network-runtime"
  | "future-confirmation";

export type BrowserExecutionRequestSource =
  | "/browser execute"
  | "scenario-harness"
  | "test";

export interface BrowserExecutionRequest {
  readonly requestId: string;
  readonly mode: BrowserExecutionMode;
  readonly actionKind: BrowserExecutionActionKind;
  readonly action: BrowserActionContract;
  readonly risk: BrowserActionRisk;
  readonly approval: BrowserExecutionApproval;
  readonly source: BrowserExecutionRequestSource;
  readonly requirements: readonly BrowserExecutionRequirement[];
  readonly rawContent: "excluded";
}

export function createBrowserExecutionRequest(input: {
  readonly requestId?: string;
  readonly mode?: BrowserExecutionMode;
  readonly action: BrowserActionContract;
  readonly approval?: BrowserExecutionApproval;
  readonly source?: BrowserExecutionRequestSource;
}): BrowserExecutionRequest {
  const actionKind = toExecutionActionKind(input.action.actionKind);
  const requestId = input.requestId ?? deterministicBrowserExecutionRequestId(input.action);
  return {
    requestId,
    mode: input.mode ?? "disabled",
    actionKind,
    action: input.action,
    risk: input.action.risk,
    approval: input.approval ?? "none",
    source: input.source ?? "/browser execute",
    requirements: requirementsForExecutionAction(actionKind),
    rawContent: "excluded",
  };
}

export function deterministicBrowserExecutionRequestId(
  action: Pick<BrowserActionContract, "actionKind" | "target" | "url" | "extractionGoal">,
): string {
  const basis = [
    action.actionKind,
    action.url ?? action.target ?? action.extractionGoal ?? "current-page",
  ].join(":");
  const normalized = sanitizeBrowserText(basis, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-exec:${normalized || "request"}`;
}

export function isBrowserExecutionActionKind(
  value: BrowserActionKind,
): value is BrowserExecutionActionKind {
  return [
    "navigate",
    "observe",
    "extract",
    "click",
    "type",
    "auth",
    "payment",
    "destructive",
    "upload",
    "download",
    "screenshot",
  ].includes(value);
}

export function requirementsForExecutionAction(
  actionKind: BrowserExecutionActionKind,
): readonly BrowserExecutionRequirement[] {
  const base: BrowserExecutionRequirement[] = [
    "explicit-executor",
    "no-raw-content",
    "no-session-persistence",
  ];
  if (actionKind === "navigate") {
    return [...base, "network-runtime-confirmation", "sandbox-boundary"];
  }
  if (actionKind === "observe" || actionKind === "extract") {
    return [...base, "read-only-evidence"];
  }
  if (actionKind === "click" || actionKind === "type") {
    return [...base, "future-confirmation"];
  }
  return [...base, "sandbox-boundary"];
}

function toExecutionActionKind(kind: BrowserActionKind): BrowserExecutionActionKind {
  if (isBrowserExecutionActionKind(kind)) {
    return kind;
  }
  throw new Error(`Unsupported browser execution action: ${kind}`);
}
