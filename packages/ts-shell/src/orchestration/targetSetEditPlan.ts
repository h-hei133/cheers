import path from "node:path";
import type { DiscoveryEditManifest } from "./discoveryEditManifest.js";
import {
  planExactFencedReplacement,
  type ExactFencedReplacementPlan,
  type FencedEditMapping,
} from "./fencedEditPlanner.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";

export type TargetSetEditPlanBlocker =
  | "confirmation-required"
  | "missing-target-set"
  | "over-max-files"
  | "duplicate-target"
  | "target-not-in-manifest"
  | "missing-mapping"
  | "workspace-authority-blocked"
  | "target-missing"
  | "mapping-not-found"
  | "multiple-matches"
  | "unsupported-fuzzy"
  | "unsupported-generated"
  | "unsupported-broad"
  | "unsupported-multi-file"
  | "unsafe-patch-control-line";

export interface TargetSetEditPlanTarget {
  readonly targetPath: string;
  readonly pathLabel: string;
  readonly executionOrder: number;
  readonly plan: Extract<ExactFencedReplacementPlan, { ok: true }>;
  readonly workspaceAuthority: Extract<WorkspaceWriteTargetAuthority, { ok: true }>;
  readonly staleReadRequirement: "final-stale-read-before-writer";
  readonly snapshotRequirement: "pre-write-snapshot-before-writer";
  readonly verificationRequirement: "post-write-verification";
  readonly evidence: readonly string[];
}

export type TargetSetEditPlan =
  | {
      readonly status: "ready";
      readonly manifestId: string;
      readonly maxFiles: number;
      readonly targetCount: number;
      readonly targets: readonly TargetSetEditPlanTarget[];
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly manifestId: string;
      readonly maxFiles: number;
      readonly targetCount: number;
      readonly blocker: TargetSetEditPlanBlocker;
      readonly targetPath?: string;
      readonly reason: string;
      readonly nextAction: string;
      readonly redactionStatus: "raw-content-excluded";
      readonly evidence: readonly string[];
    };

export function buildTargetSetEditPlan(input: {
  readonly manifest: DiscoveryEditManifest;
  readonly confirmedTargetSet?: readonly string[];
  readonly mapping?: FencedEditMapping;
  readonly workspaceRoot: string;
  readonly maxFiles?: number;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly unsupportedBlocker?: Extract<
    TargetSetEditPlanBlocker,
    "unsupported-fuzzy" | "unsupported-generated" | "unsupported-broad"
  >;
}): TargetSetEditPlan {
  const maxFiles = input.maxFiles ?? 3;
  const manifestEvidence = [
    `target-set-edit-plan:manifest:${input.manifest.manifestId}`,
    `target-set-edit-plan:max-files:${maxFiles}`,
    "target-set-edit-plan:preflight-all-before-mutation",
    "target-set-edit-plan:raw-content-excluded",
  ];

  if (input.unsupportedBlocker) {
    return blocked({
      manifestId: input.manifest.manifestId,
      maxFiles,
      targetCount: input.confirmedTargetSet?.length ?? 0,
      blocker: input.unsupportedBlocker,
      reason: unsupportedReason(input.unsupportedBlocker),
      nextAction:
        "Use an explicit confirmed target set with exact old/new fenced blocks only.",
      evidence: manifestEvidence,
    });
  }

  if (!input.confirmedTargetSet || input.confirmedTargetSet.length === 0) {
    return blocked({
      manifestId: input.manifest.manifestId,
      maxFiles,
      targetCount: 0,
      blocker: "missing-target-set",
      reason: "Confirmed target-set execution requires an explicit target set.",
      nextAction: "Confirm one to three manifest candidate paths before retrying.",
      evidence: manifestEvidence,
    });
  }

  if (input.confirmedTargetSet.length > maxFiles) {
    return blocked({
      manifestId: input.manifest.manifestId,
      maxFiles,
      targetCount: input.confirmedTargetSet.length,
      blocker: "over-max-files",
      reason: `Confirmed target set has ${input.confirmedTargetSet.length} files; max is ${maxFiles}.`,
      nextAction: `Confirm at most ${maxFiles} target files for this route.`,
      evidence: manifestEvidence,
    });
  }

  if (!input.mapping) {
    return blocked({
      manifestId: input.manifest.manifestId,
      maxFiles,
      targetCount: input.confirmedTargetSet.length,
      blocker: "missing-mapping",
      reason: "Confirmed target-set edit requires exact old/new fenced mapping.",
      nextAction: "Provide exact old and new fenced blocks before retrying.",
      evidence: manifestEvidence,
    });
  }

  const seen = new Set<string>();
  const targets: TargetSetEditPlanTarget[] = [];
  for (const [index, rawTarget] of input.confirmedTargetSet.entries()) {
    const targetPath = normalizePathLike(rawTarget);
    const key = targetPath.toLowerCase();
    if (seen.has(key)) {
      return blocked({
        manifestId: input.manifest.manifestId,
        maxFiles,
        targetCount: input.confirmedTargetSet.length,
        blocker: "duplicate-target",
        targetPath,
        reason: "Confirmed target set contains a duplicate target.",
        nextAction: "Confirm each target path only once.",
        evidence: manifestEvidence,
      });
    }
    seen.add(key);

    const manifestCandidate = input.manifest.candidates.find(
      (candidate) => normalizePathLike(candidate.path).toLowerCase() === key,
    );
    if (!manifestCandidate) {
      return blocked({
        manifestId: input.manifest.manifestId,
        maxFiles,
        targetCount: input.confirmedTargetSet.length,
        blocker: "target-not-in-manifest",
        targetPath,
        reason: "Confirmed target was not present in the discovery manifest.",
        nextAction: "Confirm only candidate paths from the current manifest.",
        evidence: manifestEvidence,
      });
    }

    const authority = input.validateWriteTarget(targetPath);
    if (authority.ok === false) {
      return blocked({
        manifestId: input.manifest.manifestId,
        maxFiles,
        targetCount: input.confirmedTargetSet.length,
        blocker: "workspace-authority-blocked",
        targetPath,
        reason: authority.message,
        nextAction: authority.message,
        evidence: [...manifestEvidence, ...authority.evidence],
      });
    }

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(input.workspaceRoot, targetPath);
    const plan = planExactFencedReplacement({
      targetPath,
      originalContent: input.readFile(absolutePath),
      mapping: input.mapping,
    });
    if (plan.ok === false) {
      return blocked({
        manifestId: input.manifest.manifestId,
        maxFiles,
        targetCount: input.confirmedTargetSet.length,
        blocker: targetSetBlockerFromFencedPlan(plan.blocker),
        targetPath,
        reason: plan.reason,
        nextAction: plan.nextAction,
        evidence: [...manifestEvidence, ...plan.evidence],
      });
    }

    targets.push({
      targetPath,
      pathLabel: manifestCandidate.pathLabel,
      executionOrder: index + 1,
      plan,
      workspaceAuthority: authority,
      staleReadRequirement: "final-stale-read-before-writer",
      snapshotRequirement: "pre-write-snapshot-before-writer",
      verificationRequirement: "post-write-verification",
      evidence: [
        `target-set-edit-plan:target:${targetPath}`,
        `target-set-edit-plan:order:${index + 1}`,
        "target-set-edit-plan:workspace-authority:ready",
        "target-set-edit-plan:stale-read:required",
        "target-set-edit-plan:snapshot:required",
        "target-set-edit-plan:verification:required",
        ...plan.evidence,
      ],
    });
  }

  return {
    status: "ready",
    manifestId: input.manifest.manifestId,
    maxFiles,
    targetCount: targets.length,
    targets,
    redactionStatus: "raw-content-excluded",
    evidence: [
      ...manifestEvidence,
      `target-set-edit-plan:target-count:${targets.length}`,
      "target-set-edit-plan:confirmed-target-set",
      "target-set-edit-plan:all-targets-preflighted",
      "target-set-edit-plan:mutation-authority:execution-route-only",
      "target-set-edit-plan:raw-content-excluded",
      ...targets.flatMap((target) => target.evidence),
    ],
  };
}

function blocked(input: {
  readonly manifestId: string;
  readonly maxFiles: number;
  readonly targetCount: number;
  readonly blocker: TargetSetEditPlanBlocker;
  readonly targetPath?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): TargetSetEditPlan {
  return {
    status: "blocked",
    manifestId: input.manifestId,
    maxFiles: input.maxFiles,
    targetCount: input.targetCount,
    blocker: input.blocker,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    reason: input.reason,
    nextAction: input.nextAction,
    redactionStatus: "raw-content-excluded",
    evidence: [
      ...input.evidence,
      `target-set-edit-plan:blocker:${input.blocker}`,
      "target-set-edit-preflight-stopped",
      "target-set-edit-mutation:not-run",
      "target-set-edit-plan:raw-content-excluded",
    ],
  };
}

function targetSetBlockerFromFencedPlan(
  blocker: string,
): TargetSetEditPlanBlocker {
  switch (blocker) {
    case "missing-target":
    case "ambiguous-target":
      return "target-not-in-manifest";
    case "missing-mapping":
    case "target-missing":
    case "mapping-not-found":
    case "multiple-matches":
    case "unsafe-patch-control-line":
      return blocker;
    case "unsupported-fuzzy":
      return "unsupported-fuzzy";
    case "unsupported-generated":
      return "unsupported-generated";
    case "unsupported-broad":
    case "unsupported-discovery":
    case "unsupported-multi-file":
      return "unsupported-broad";
    default:
      return "missing-mapping";
  }
}

function unsupportedReason(blocker: TargetSetEditPlanBlocker): string {
  switch (blocker) {
    case "unsupported-fuzzy":
      return "Fuzzy target-set edit is outside the exact fenced replacement lane.";
    case "unsupported-generated":
      return "Generated target-set edit content is not supported.";
    case "unsupported-broad":
      return "Broad target-set edits are not supported by this bounded route.";
    default:
      return "Confirmed target-set edit is blocked before mutation.";
  }
}

function normalizePathLike(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}
