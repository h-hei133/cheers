import type { BrowserActionContract } from "./actionContract.js";

export type BrowserSandboxRequirement =
  | "network-access"
  | "external-site"
  | "authentication"
  | "credential-entry"
  | "payment"
  | "file-upload"
  | "file-download"
  | "destructive-action"
  | "screenshot"
  | "persistent-session"
  | "third-party-data";

export type BrowserSandboxDecision =
  | "allowed-for-dry-run"
  | "blocked"
  | "future-confirmation-required"
  | "future-sandbox-required";

export interface BrowserSandboxBlocker {
  readonly requirement: BrowserSandboxRequirement;
  readonly decision: BrowserSandboxDecision;
  readonly reason: string;
  readonly nextAction: string;
}

export interface BrowserSandboxPolicyResult {
  readonly decision: BrowserSandboxDecision;
  readonly requirements: readonly BrowserSandboxRequirement[];
  readonly blockers: readonly BrowserSandboxBlocker[];
  readonly futureConfirmations: readonly string[];
  readonly nextAction: string;
  readonly realExecutionAvailable: false;
  readonly evidence: readonly string[];
}

export function classifyBrowserSandboxPolicy(
  contract: BrowserActionContract,
): BrowserSandboxPolicyResult {
  const requirements = inferRequirements(contract);
  const blockers = requirements.flatMap((requirement) =>
    blockerForRequirement(requirement, contract),
  );
  const hardBlock = blockers.find((blocker) => blocker.decision === "blocked");
  const futureSandbox = blockers.find((blocker) => blocker.decision === "future-sandbox-required");
  const futureConfirmation = blockers.find((blocker) => blocker.decision === "future-confirmation-required");
  const decision: BrowserSandboxDecision = hardBlock
    ? "blocked"
    : futureSandbox
      ? "future-sandbox-required"
      : futureConfirmation
        ? "future-confirmation-required"
        : "allowed-for-dry-run";
  return {
    decision,
    requirements,
    blockers,
    futureConfirmations: futureConfirmationsFor(contract, blockers),
    nextAction: nextActionForDecision(decision),
    realExecutionAvailable: false,
    evidence: [
      "browser-sandbox-policy:pure",
      `browser-sandbox-policy:decision:${decision}`,
      "browser-sandbox-policy:dry-run-only",
      "browser-sandbox-policy:real-execution-unavailable",
    ],
  };
}

function inferRequirements(contract: BrowserActionContract): readonly BrowserSandboxRequirement[] {
  const requirements: BrowserSandboxRequirement[] = [];
  if (contract.requiresNetwork || contract.url) {
    requirements.push("network-access", "external-site", "third-party-data");
  }
  if (contract.requiresAuth || contract.actionKind === "auth") {
    requirements.push("authentication", "credential-entry", "persistent-session");
  }
  if (contract.actionKind === "payment") {
    requirements.push("payment", "credential-entry");
  }
  if (contract.actionKind === "destructive" || contract.risk === "destructive") {
    requirements.push("destructive-action");
  }
  if (contract.actionKind === "upload") {
    requirements.push("file-upload");
  }
  if (contract.actionKind === "download") {
    requirements.push("file-download");
  }
  if (contract.actionKind === "screenshot") {
    requirements.push("screenshot");
  }
  if (contract.actionKind === "click" || contract.actionKind === "type") {
    requirements.push("third-party-data");
  }
  return unique(requirements);
}

function blockerForRequirement(
  requirement: BrowserSandboxRequirement,
  contract: BrowserActionContract,
): readonly BrowserSandboxBlocker[] {
  if (requirement === "authentication" || requirement === "credential-entry") {
    return [blocker(requirement, "blocked", "Authentication and credential entry are outside the browser dry-run boundary.")];
  }
  if (requirement === "payment") {
    return [blocker(requirement, "blocked", "Payment automation is blocked.")];
  }
  if (requirement === "destructive-action") {
    return [blocker(requirement, "blocked", "Destructive browser automation is blocked.")];
  }
  if (requirement === "file-upload" || requirement === "file-download") {
    return [blocker(requirement, "blocked", "File transfer browser automation is blocked until a dedicated sandbox route owns it.")];
  }
  if (requirement === "screenshot") {
    return [blocker(requirement, "future-sandbox-required", "Screenshot evidence requires an explicit future screenshot policy.")];
  }
  if (requirement === "network-access" || requirement === "external-site") {
    return [blocker(requirement, "future-sandbox-required", "External network access requires a future isolated browser sandbox.")];
  }
  if (requirement === "persistent-session") {
    return [blocker(requirement, "blocked", "Browser session persistence is not allowed.")];
  }
  if (requirement === "third-party-data" && (contract.actionKind === "click" || contract.actionKind === "type")) {
    return [blocker(requirement, "future-confirmation-required", "State-changing browser actions need explicit future user confirmation.")];
  }
  if (requirement === "third-party-data") {
    return [blocker(requirement, "future-sandbox-required", "Third-party page data may be observed only inside a future isolated browser sandbox.")];
  }
  return [];
}

function blocker(
  requirement: BrowserSandboxRequirement,
  decision: BrowserSandboxDecision,
  reason: string,
): BrowserSandboxBlocker {
  return {
    requirement,
    decision,
    reason,
    nextAction: nextActionForDecision(decision),
  };
}

function futureConfirmationsFor(
  contract: BrowserActionContract,
  blockers: readonly BrowserSandboxBlocker[],
): readonly string[] {
  const confirmations = blockers
    .filter((blocker) => blocker.decision === "future-confirmation-required")
    .map((blocker) => `Confirm ${blocker.requirement} for ${contract.actionKind}.`);
  return confirmations.length > 0 ? confirmations : ["None for dry-run; real execution remains unavailable."];
}

function nextActionForDecision(decision: BrowserSandboxDecision): string {
  switch (decision) {
    case "allowed-for-dry-run":
      return "Render the dry-run plan only; do not execute a browser action.";
    case "future-confirmation-required":
      return "Record the future confirmation requirement and keep execution disabled.";
    case "future-sandbox-required":
      return "Define an isolated browser sandbox before real execution.";
    case "blocked":
      return "Keep this action blocked; do not add browser execution in this route.";
  }
}

function unique<T>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}
