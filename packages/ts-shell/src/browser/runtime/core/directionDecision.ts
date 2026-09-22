import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserToolServerBackendComparison } from "../../toolServerBackendComparison.js";
import type { BrowserPlaywrightRuntimeAvailability } from "../../playwrightRuntimeAvailability.js";

export interface BrowserRuntimeDirectionDecision {
  readonly recommendedCoreRuntime: "direct-playwright" | "dependency-decision-required" | "none";
  readonly optionalBackends: readonly string[];
  readonly rejectedPaths: readonly string[];
  readonly reasons: readonly string[];
  readonly route126Prerequisites: readonly string[];
  readonly risks: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserRuntimeDirection(input: {
  readonly availability: BrowserPlaywrightRuntimeAvailability;
  readonly toolServerComparison: BrowserToolServerBackendComparison;
  readonly directAdapterScenarioPassed?: boolean;
  readonly actionLayerPlannerUseful?: boolean;
}): BrowserRuntimeDirectionDecision {
  const directViable = input.availability.status === "available" && input.directAdapterScenarioPassed !== false;
  if (directViable) {
    return decision({
      recommendedCoreRuntime: "direct-playwright",
      optionalBackends: input.toolServerComparison.suitability === "optional-backend" ? ["browser-tool-server"] : [],
      rejectedPaths: ["hand-rolled-low-level-runtime", "action-layer-low-level-runtime"],
      reasons: [
        "Direct Playwright keeps browser lifecycle, page policy, snapshots, and action execution inside the local control plane.",
        "Existing policy, evidence, receipt, and eval layers can wrap the adapter without adding provider/model or tool-server calls.",
        "browser tool server remains useful for ecosystem integration but has higher server lifecycle and permission mapping cost.",
      ],
      route126Prerequisites: [
        "approve package dependency change or confirm Playwright is already available",
        "prove browser binary availability without broad install side effects",
        "run controlled local/test observe/extract/click/type gauntlet with real Direct Playwright",
      ],
      risks: [
        "browser binary availability may differ by developer machine",
        "Direct Playwright launch policy still needs explicit dependency approval",
      ],
      nextAction: "Route 126 should approve and implement Direct Playwright as the opt-in core runtime.",
      evidence: ["browser-runtime-direction-decision:direct-playwright-core"],
    });
  }

  return decision({
    recommendedCoreRuntime: "dependency-decision-required",
    optionalBackends: input.toolServerComparison.suitability === "optional-backend" ? ["browser-tool-server"] : [],
    rejectedPaths: ["hand-rolled-low-level-runtime", "default-browser-runtime"],
    reasons: [
      "The local workspace does not currently prove Direct Playwright availability without dependency changes.",
      "The adapter seam can be tested through injected Playwright-like fixtures, but real runtime implementation needs a dependency decision.",
      "MCP is mature enough to compare, but should not become the default core while direct control-plane wrapping remains viable.",
      input.actionLayerPlannerUseful === false
        ? "action-layer planning was not required for the low-level runtime decision."
        : "action-layer observe/act/extract remains a future high-level planner and repair layer.",
    ],
    route126Prerequisites: [
      "decide package dependency policy for playwright or playwright-core",
      "keep runtime opt-in and controlled local/test scoped",
      "preserve no raw DOM, no cookies/auth/session, no public automation, and no default runtime",
    ],
    risks: [
      "without dependency approval the route remains a spike, not a real browser runtime",
      "tool-server optional backend still needs separate lifecycle and permission mapping if pursued",
    ],
    nextAction: "Route 126 should make the dependency/runtime implementation decision before expanding browser capabilities.",
    evidence: ["browser-runtime-direction-decision:dependency-required"],
  });
}

function decision(input: BrowserRuntimeDirectionDecision): BrowserRuntimeDirectionDecision {
  return {
    recommendedCoreRuntime: input.recommendedCoreRuntime,
    optionalBackends: unique(input.optionalBackends.map((item) => sanitizeBrowserText(item, 80))),
    rejectedPaths: unique(input.rejectedPaths.map((item) => sanitizeBrowserText(item, 100))),
    reasons: unique(input.reasons.map((item) => sanitizeBrowserText(item, 260))),
    route126Prerequisites: unique(input.route126Prerequisites.map((item) => sanitizeBrowserText(item, 180))),
    risks: unique(input.risks.map((item) => sanitizeBrowserText(item, 180))),
    nextAction: sanitizeBrowserText(input.nextAction, 240),
    evidence: [
      ...input.evidence,
      "browser-runtime-direction-decision:pure",
      "browser-runtime-direction-decision:no-runtime-launch",
      "browser-runtime-direction-decision:no-tool-server-launch",
      "browser-runtime-direction-decision:no-provider-or-model-call",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
