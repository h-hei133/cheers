import type { BrowserReceiptCacheStore } from "../../browser/receipt/browserReceiptCacheStore.js";
import type { BrowserSelfHealingApplyPlan } from "./browserSelfHealingApplyPlan.js";
import { writeBrowserSelfHealingManifestPatch, type BrowserSelfHealingManifestPatchWriteResult } from "./browserSelfHealingManifestPatchWriter.js";
import type { BrowserSelfHealingManifestPatchKind } from "./browserSelfHealingManifestPatch.js";

export interface BrowserSelfHealingApplyResult {
  readonly proposalId: string;
  readonly proposalKind: string;
  readonly applyStatus: string;
  readonly target: string;
  readonly applied: boolean;
  readonly browserActionExecuted: false;
  readonly replayExecuted: false;
  readonly metadataCacheChanged: "yes" | "no";
  readonly changedSummary: string;
  readonly manifestPatch?: BrowserSelfHealingManifestPatchWriteResult;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function executeBrowserSelfHealingApply(input: {
  readonly plan: BrowserSelfHealingApplyPlan;
  readonly receiptCacheStore?: BrowserReceiptCacheStore;
  readonly manifestPath?: string;
}): BrowserSelfHealingApplyResult {
  const plan = input.plan;
  if (plan.applyStatus !== "apply-allowed") {
    return result({
      plan,
      applied: false,
      metadataCacheChanged: "no",
      changedSummary: "none",
      blockers: plan.blockers.length > 0 ? plan.blockers : [plan.applyStatus],
      warnings: plan.warnings,
      nextAction: plan.nextAction,
      evidence: ["browser-self-healing-apply-executor:blocked-before-mutation"],
    });
  }
  if (plan.target === "cache") {
    const maintenance = input.receiptCacheStore?.repair();
    if (!maintenance || maintenance.blockers.length > 0) {
      return result({
        plan,
        applied: false,
        metadataCacheChanged: "no",
        changedSummary: "none",
        blockers: maintenance?.blockers ?? ["missing-explicit-cache-store"],
        warnings: maintenance?.warnings ?? [],
        nextAction: "Provide an explicit writable receipt cache store, then retry apply.",
        evidence: maintenance?.evidence ?? ["browser-self-healing-apply-executor:missing-cache-store"],
      });
    }
    return result({
      plan,
      applied: true,
      metadataCacheChanged: "yes",
      changedSummary: `cache repair records before/after=${maintenance.report?.recordsBefore ?? 0}/${maintenance.report?.recordsAfter ?? 0}`,
      blockers: [],
      warnings: maintenance.warnings,
      nextAction: "Run /browser replay <receipt-id> explicitly after reviewing cache status.",
      evidence: [
        ...maintenance.evidence,
        "browser-self-healing-apply-executor:cache-repair-applied",
        "browser-self-healing-apply-executor:no-browser-execution",
        "browser-self-healing-apply-executor:no-automatic-replay",
      ],
    });
  }
  if (plan.target === "confirmation") {
    return result({
      plan,
      applied: true,
      metadataCacheChanged: "yes",
      changedSummary: "confirmation context updated for this explicit command only",
      blockers: [],
      warnings: plan.warnings,
      nextAction: "Run /browser replay <receipt-id> explicitly; confirmation apply does not replay.",
      evidence: [
        "browser-self-healing-apply-executor:confirmation-context-applied",
        "browser-self-healing-apply-executor:ephemeral-context-only",
        "browser-self-healing-apply-executor:no-browser-execution",
        "browser-self-healing-apply-executor:no-automatic-replay",
      ],
    });
  }
  const manifestPatchKind = manifestPatchKindForPlan(plan);
  if (manifestPatchKind) {
    const manifestPatch = writeBrowserSelfHealingManifestPatch({
      proposalId: plan.proposalId,
      patchKind: manifestPatchKind,
      manifestPath: input.manifestPath,
    });
    return result({
      plan,
      applied: manifestPatch.applied,
      metadataCacheChanged: manifestPatch.applied ? "yes" : "no",
      changedSummary: manifestPatch.changedSummary,
      manifestPatch,
      blockers: manifestPatch.blockers,
      warnings: manifestPatch.warnings,
      nextAction: manifestPatch.nextAction,
      evidence: manifestPatch.evidence,
    });
  }
  return result({
    plan,
    applied: false,
    metadataCacheChanged: "no",
    changedSummary: "none",
    blockers: ["unsupported-apply-target"],
    warnings: plan.warnings,
    nextAction: "Keep this repair as an apply plan until a dedicated safe writer exists.",
    evidence: ["browser-self-healing-apply-executor:unsupported-target"],
  });
}

function result(input: {
  readonly plan: BrowserSelfHealingApplyPlan;
  readonly applied: boolean;
  readonly metadataCacheChanged: "yes" | "no";
  readonly changedSummary: string;
  readonly manifestPatch?: BrowserSelfHealingManifestPatchWriteResult;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): BrowserSelfHealingApplyResult {
  return {
    proposalId: input.plan.proposalId,
    proposalKind: input.plan.proposalKind ?? "unknown",
    applyStatus: input.plan.applyStatus,
    target: input.plan.target,
    applied: input.applied,
    browserActionExecuted: false,
    replayExecuted: false,
    metadataCacheChanged: input.metadataCacheChanged,
    changedSummary: input.changedSummary,
    manifestPatch: input.manifestPatch,
    blockers: input.blockers,
    warnings: input.warnings,
    nextAction: input.nextAction,
    evidence: [
      ...input.plan.evidence,
      ...input.evidence,
      "browser-self-healing-apply-executor:metadata-cache-only",
    ],
  };
}

function manifestPatchKindForPlan(
  plan: BrowserSelfHealingApplyPlan,
): BrowserSelfHealingManifestPatchKind | undefined {
  if (plan.proposalKind === "add-runner-binding" || plan.proposalKind === "retry-local-runner") {
    return "add-runner-binding";
  }
  if (plan.proposalKind === "add-skill-metadata") {
    return "add-skill-metadata";
  }
  if (plan.proposalKind === "update-allowlist") {
    return "update-allowlist-local-fixture";
  }
  if (plan.proposalKind === "refresh-fixture") {
    return "refresh-fixture-summary";
  }
  return undefined;
}
