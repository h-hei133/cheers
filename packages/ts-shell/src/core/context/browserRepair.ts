import type { BrowserAccessibilityNodeInput } from "./browserAccessibilitySnapshot.js";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserTxnStepPlan } from "./browserPlan.js";

export interface BrowserRepairDecision {
  readonly status: "not-needed" | "attempted" | "blocked";
  readonly repairedTarget?: string;
  readonly repairedSelector?: string;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export function planBrowserRepair(input: {
  readonly step: BrowserTxnStepPlan;
  readonly failureCode: string;
  readonly observationNodes: readonly BrowserAccessibilityNodeInput[];
  readonly repairAllowed: boolean;
  readonly priorAttempts: number;
}): BrowserRepairDecision {
  if (input.failureCode !== "action-target-missing") {
    return decision("not-needed", "repair only applies to missing controlled action targets", []);
  }
  if (!input.repairAllowed) {
    return decision("blocked", "planner did not allow repair for this transaction", [
      "browser-repair:blocked-by-planner",
    ]);
  }
  if (input.priorAttempts > 0) {
    return decision("blocked", "repair attempt budget exhausted", [
      "browser-repair:attempt-budget-exhausted",
    ]);
  }

  const candidates = candidateNodes(input.step, input.observationNodes);
  if (candidates.length !== 1) {
    return decision("blocked", "repair requires exactly one safe controlled candidate", [
      `browser-repair:candidate-count:${candidates.length}`,
    ]);
  }

  const candidate = candidates[0]!;
  return {
    status: "attempted",
    repairedTarget: sanitizeBrowserText(candidate.name ?? input.step.target ?? "", 120),
    repairedSelector: candidate.selector ? sanitizeBrowserText(candidate.selector, 120) : undefined,
    reason: "one safe controlled role/name candidate selected from observation",
    evidence: [
      "browser-repair:attempted",
      `browser-repair:role:${sanitizeBrowserText(candidate.role, 60)}`,
      `browser-repair:target:${sanitizeBrowserText(candidate.name ?? "", 120)}`,
      "browser-repair:no-blind-click",
      "browser-repair:no-arbitrary-js",
    ],
  };
}

function candidateNodes(
  step: BrowserTxnStepPlan,
  nodes: readonly BrowserAccessibilityNodeInput[],
): readonly BrowserAccessibilityNodeInput[] {
  const expectedRole = step.kind === "type" ? "textbox" : "button";
  return nodes.filter((node) =>
    node.role === expectedRole &&
    !node.hidden &&
    !node.disabled &&
    Boolean(node.name?.trim()) &&
    safeRepairTarget(step.target ?? "", node.name ?? "")
  );
}

function safeRepairTarget(requested: string, candidate: string): boolean {
  const requestedNorm = normalize(requested);
  const candidateNorm = normalize(candidate);
  if (!requestedNorm) {
    return false;
  }
  if (requestedNorm === candidateNorm) {
    return true;
  }
  return requestedNorm === "missing target" ||
    requestedNorm.includes("missing") ||
    requestedNorm.includes("status button") ||
    requestedNorm.includes("save");
}

function normalize(value: string): string {
  return sanitizeBrowserText(value, 120).toLowerCase().replace(/\s+/g, " ").trim();
}

function decision(
  status: BrowserRepairDecision["status"],
  reason: string,
  evidence: readonly string[],
): BrowserRepairDecision {
  return {
    status,
    reason,
    evidence,
  };
}
