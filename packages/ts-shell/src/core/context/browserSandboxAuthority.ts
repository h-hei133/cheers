import type { BrowserActionKind } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";

export type BrowserSandboxAuthorityMode =
  | "disabled"
  | "dry-run-only"
  | "fake-test"
  | "local-fixture"
  | "explicit-local"
  | "future-runtime";

export type BrowserSandboxCapability =
  | "navigation"
  | "observe"
  | "extract"
  | "click"
  | "type"
  | "screenshot"
  | "upload"
  | "download"
  | "auth"
  | "payment"
  | "destructive";

export interface BrowserSandboxScope {
  readonly label: string;
  readonly ephemeral: boolean;
  readonly allowNetwork: boolean;
  readonly allowPersistence: false;
  readonly rawContent: "excluded";
}

export interface BrowserSandboxAuthority {
  readonly mode: BrowserSandboxAuthorityMode;
  readonly scope: BrowserSandboxScope;
  readonly capabilities: readonly BrowserSandboxCapability[];
  readonly evidence: readonly string[];
}

export type BrowserSandboxAuthorityDecisionStatus =
  | "allowed"
  | "blocked"
  | "confirmation-required"
  | "future-runtime-required";

export interface BrowserSandboxAuthorityDecision {
  readonly status: BrowserSandboxAuthorityDecisionStatus;
  readonly reason: string;
  readonly nextAction: string;
  readonly authority: BrowserSandboxAuthority;
  readonly requiredCapability: BrowserSandboxCapability;
  readonly evidence: readonly string[];
}

export function createBrowserSandboxAuthority(
  input: Partial<BrowserSandboxAuthority> = {},
): BrowserSandboxAuthority {
  const mode = input.mode ?? "disabled";
  return {
    mode,
    scope: input.scope ?? {
      label: mode === "fake-test" ? "fake/test sandbox" : mode === "local-fixture" ? "local fixture sandbox" : "none",
      ephemeral: mode === "fake-test" || mode === "local-fixture",
      allowNetwork: false,
      allowPersistence: false,
      rawContent: "excluded",
    },
    capabilities: input.capabilities ?? capabilitiesForMode(mode),
    evidence: [
      ...(input.evidence ?? []),
      "browser-sandbox-authority:deterministic",
      "browser-sandbox-authority:no-process-spawn",
      "browser-sandbox-authority:no-network",
      "browser-sandbox-authority:no-persistence",
    ],
  };
}

export function decideBrowserSandboxAuthority(input: {
  readonly request: BrowserExecutionRequest;
  readonly authority?: BrowserSandboxAuthority;
}): BrowserSandboxAuthorityDecision {
  const authority = input.authority ?? createBrowserSandboxAuthority();
  const requiredCapability = capabilityForAction(input.request.actionKind);
  if (authority.mode === "disabled" || authority.mode === "dry-run-only") {
    return decision("blocked", authority, requiredCapability, {
      reason: "Browser sandbox authority is not enabled for execution.",
      nextAction: "Provide fake-test or local-fixture authority for bounded execution or plan a future explicit-local route.",
    });
  }
  if (isAlwaysBlockedCapability(requiredCapability)) {
    return decision("blocked", authority, requiredCapability, {
      reason: `Browser capability ${requiredCapability} is blocked by the sandbox authority.`,
      nextAction: "Keep this action in preview/dry-run until a dedicated route owns it.",
    });
  }
  if (!authority.capabilities.includes(requiredCapability)) {
    return decision("blocked", authority, requiredCapability, {
      reason: `Sandbox authority does not include ${requiredCapability}.`,
      nextAction: "Use an authority scoped to the requested browser action.",
    });
  }
  if (requiredCapability === "click" || requiredCapability === "type") {
    return decision("confirmation-required", authority, requiredCapability, {
      reason: "State-changing browser actions require explicit confirmation.",
      nextAction: "Represent confirmation first; do not execute click/type in this route.",
    });
  }
  if (authority.mode === "explicit-local" || authority.mode === "future-runtime") {
    return decision("future-runtime-required", authority, requiredCapability, {
      reason: "Real browser runtime authority is represented but not executable in this route.",
      nextAction: "Keep execution blocked until a future route adds real runtime lifecycle gates.",
    });
  }
  if (authority.mode === "local-fixture") {
    return decision("allowed", authority, requiredCapability, {
      reason: "Local fixture sandbox authority allows this bounded browser action.",
      nextAction: "Continue only if fixture, network, and confirmation preflight also pass.",
    });
  }
  return decision("allowed", authority, requiredCapability, {
    reason: "Fake/test sandbox authority allows this harness-only browser action.",
    nextAction: "Continue only if network allowlist and confirmation preflight also pass.",
  });
}

function capabilitiesForMode(
  mode: BrowserSandboxAuthorityMode,
): readonly BrowserSandboxCapability[] {
  if (mode === "fake-test" || mode === "local-fixture") {
    return ["navigation", "observe", "extract"];
  }
  if (mode === "explicit-local" || mode === "future-runtime") {
    return ["navigation", "observe", "extract", "click", "type"];
  }
  return [];
}

function capabilityForAction(actionKind: BrowserActionKind): BrowserSandboxCapability {
  switch (actionKind) {
    case "navigate":
      return "navigation";
    case "observe":
      return "observe";
    case "extract":
      return "extract";
    case "click":
      return "click";
    case "type":
      return "type";
    case "screenshot":
      return "screenshot";
    case "upload":
      return "upload";
    case "download":
      return "download";
    case "auth":
      return "auth";
    case "payment":
      return "payment";
    case "destructive":
      return "destructive";
    case "status":
    case "wait":
      return "observe";
  }
}

function isAlwaysBlockedCapability(capability: BrowserSandboxCapability): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(capability);
}

function decision(
  status: BrowserSandboxAuthorityDecisionStatus,
  authority: BrowserSandboxAuthority,
  requiredCapability: BrowserSandboxCapability,
  input: {
    readonly reason: string;
    readonly nextAction: string;
  },
): BrowserSandboxAuthorityDecision {
  return {
    status,
    reason: input.reason,
    nextAction: input.nextAction,
    authority,
    requiredCapability,
    evidence: [
      ...authority.evidence,
      `browser-sandbox-authority:decision:${status}`,
      `browser-sandbox-authority:capability:${requiredCapability}`,
    ],
  };
}
