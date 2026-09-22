import type { BrowserExecutionRequest } from "./executionContract.js";

export type BrowserConfirmationKind =
  | "network"
  | "state-changing"
  | "sensitive"
  | "sandbox"
  | "future-runtime";

export type BrowserConfirmationStatus =
  | "not-required"
  | "required"
  | "confirmed"
  | "denied"
  | "expired";

export interface BrowserExecutionConfirmationRecord {
  readonly kind: BrowserConfirmationKind;
  readonly status: Exclude<BrowserConfirmationStatus, "not-required" | "required">;
  readonly requestId?: string;
}

export interface BrowserExecutionConfirmationDecision {
  readonly kind: BrowserConfirmationKind;
  readonly status: BrowserConfirmationStatus;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserExecutionConfirmation(input: {
  readonly request: BrowserExecutionRequest;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
}): BrowserExecutionConfirmationDecision {
  const kind = confirmationKindForRequest(input.request);
  if (!kind) {
    return decision("sandbox", "not-required", {
      reason: "Read-only browser action does not require explicit confirmation.",
      nextAction: "Continue with sandbox and evidence preflight.",
    });
  }
  if (kind === "sensitive") {
    return decision(kind, "denied", {
      reason: "Sensitive browser actions are denied in this route.",
      nextAction: "Keep auth, payment, destructive, upload, download, and screenshot actions blocked.",
    });
  }
  const matched = input.confirmations?.find(
    (record) =>
      record.kind === kind &&
      (!record.requestId || record.requestId === input.request.requestId),
  );
  if (matched) {
    return decision(kind, matched.status, {
      reason: `Confirmation ${kind} is ${matched.status}.`,
      nextAction: matched.status === "confirmed"
        ? "Continue with remaining preflight gates."
        : "Do not execute until confirmation is represented as confirmed.",
    });
  }
  return decision(kind, "required", {
    reason: `Browser action requires ${kind} confirmation.`,
    nextAction: "Represent confirmation explicitly; no prompt UI is added in this route.",
  });
}

function confirmationKindForRequest(
  request: BrowserExecutionRequest,
): BrowserConfirmationKind | undefined {
  if (request.mode === "local-fixture" && request.action.url?.startsWith("local-fixture://")) {
    return undefined;
  }
  if (request.actionKind === "navigate") {
    return "network";
  }
  if (request.actionKind === "click" || request.actionKind === "type") {
    return "state-changing";
  }
  if (
    ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(
      request.actionKind,
    )
  ) {
    return "sensitive";
  }
  return undefined;
}

function decision(
  kind: BrowserConfirmationKind,
  status: BrowserConfirmationStatus,
  input: {
    readonly reason: string;
    readonly nextAction: string;
  },
): BrowserExecutionConfirmationDecision {
  return {
    kind,
    status,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      "browser-execution-confirmation:deterministic",
      `browser-execution-confirmation:${kind}:${status}`,
      "browser-execution-confirmation:no-prompt-ui",
    ],
  };
}
