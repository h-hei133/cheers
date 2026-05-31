import path from "node:path";
import type {
  ExactFencedReplacementPlan,
  FencedEditPlanBlocker,
  FencedEditMapping,
} from "./fencedEditPlanner.js";
import { planExactFencedReplacement } from "./fencedEditPlanner.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";
import type {
  ProposalHunkSetHunk,
  ProposalHunkSetManifest,
} from "./proposalHunkSet.js";
import {
  buildExactHunkSetModel,
  locateExactHunkRange,
  type ExactHunkSetModel,
  type ExactHunkRange,
} from "../edit/patch/plan/hunkSet.js";
import { detectExactHunkConflicts } from "../edit/patch/apply/conflict.js";

export type ProposalHunkSetPlanBlocker =
  | "selection-not-confirmed"
  | "missing-hunk"
  | "missing-mapping"
  | "non-exact-hunk"
  | "over-max-files"
  | "over-max-hunks"
  | "over-max-hunks-per-file"
  | "duplicate-hunk"
  | "conflicting-target-hunks"
  | "workspace-authority-blocked"
  | "mapping-not-found"
  | "multiple-matches"
  | "target-missing"
  | "unsafe-patch-control-line"
  | "no-op";

export type ProposalHunkSetPlan =
  | {
      readonly status: "ready";
      readonly hunkSetId: string;
      readonly sourceProposalId: string;
      readonly targetCount: number;
      readonly hunkCount: number;
      readonly maxFiles: number;
      readonly maxHunks: number;
      readonly maxHunksPerFile: number;
      readonly targets: readonly ProposalHunkSetPlanTarget[];
      readonly exactHunkSet: ExactHunkSetModel;
      readonly evidence: readonly string[];
      readonly nextAction: string;
    }
  | {
      readonly status: "blocked";
      readonly hunkSetId: string;
      readonly sourceProposalId: string;
      readonly targetCount: number;
      readonly hunkCount: number;
      readonly maxFiles: number;
      readonly maxHunks: number;
      readonly maxHunksPerFile: number;
      readonly blocker: ProposalHunkSetPlanBlocker;
      readonly targetPath?: string;
      readonly hunkId?: string;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export interface ProposalHunkSetPlanTarget {
  readonly hunkId: string;
  readonly hunkIds: readonly string[];
  readonly targetPath: string;
  readonly mapping: FencedEditMapping;
  readonly hunkMappings: readonly ProposalHunkSetPlanHunk[];
  readonly fencedPlan: Extract<ExactFencedReplacementPlan, { ok: true }>;
  readonly hunkCount: number;
  readonly evidence: readonly string[];
}

export interface ProposalHunkSetPlanHunk {
  readonly hunkId: string;
  readonly targetPath: string;
  readonly mapping: FencedEditMapping;
  readonly fencedPlan: Extract<ExactFencedReplacementPlan, { ok: true }>;
  readonly matchCount: 1;
  readonly range: ExactHunkRange;
  readonly orderKey: string;
  readonly evidence: readonly string[];
}

export function buildProposalHunkSetPlan(input: {
  readonly manifest: ProposalHunkSetManifest;
  readonly mappingByHunkId?: ReadonlyMap<string, FencedEditMapping>;
  readonly confirmed: boolean;
  readonly workspaceRoot: string;
  readonly maxFiles?: number;
  readonly maxHunks?: number;
  readonly maxHunksPerFile?: number;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
}): ProposalHunkSetPlan {
  const maxFiles = input.maxFiles ?? 3;
  const maxHunks = input.maxHunks ?? 6;
  const maxHunksPerFile = input.maxHunksPerFile ?? 3;
  const base = {
    hunkSetId: input.manifest.hunkSetId,
    sourceProposalId: input.manifest.sourceProposalId,
    targetCount: input.manifest.selectedTargetPaths.length,
    hunkCount: input.manifest.selectedHunks.length,
    maxFiles,
    maxHunks,
    maxHunksPerFile,
  };

  if (!input.confirmed) {
    return blocked({
      ...base,
      blocker: "selection-not-confirmed",
      reason: "Proposal hunk-set apply requires explicit confirmed selection.",
      nextAction: "Confirm the selected exact proposal hunks before apply.",
      evidence: ["proposal-hunk-set-plan:blocker:selection-not-confirmed"],
    });
  }
  if (input.manifest.selectedHunks.length === 0) {
    return blocked({
      ...base,
      blocker: "missing-hunk",
      reason: "Proposal hunk-set apply requires at least one selected hunk.",
      nextAction: "Select exact proposal hunks before apply.",
      evidence: ["proposal-hunk-set-plan:blocker:missing-hunk"],
    });
  }
  if (input.manifest.selectedTargetPaths.length > maxFiles) {
    return blocked({
      ...base,
      blocker: "over-max-files",
      reason: `Proposal hunk-set selected ${input.manifest.selectedTargetPaths.length} files; max is ${maxFiles}.`,
      nextAction: `Select at most ${maxFiles} target files.`,
      evidence: ["proposal-hunk-set-plan:blocker:over-max-files"],
    });
  }
  if (input.manifest.selectedHunks.length > maxHunks) {
    return blocked({
      ...base,
      blocker: "over-max-hunks",
      reason: `Proposal hunk-set selected ${input.manifest.selectedHunks.length} hunks; max is ${maxHunks}.`,
      nextAction: `Select at most ${maxHunks} exact hunks.`,
      evidence: ["proposal-hunk-set-plan:blocker:over-max-hunks"],
    });
  }

  const duplicateHunk = firstDuplicate(input.manifest.selectedHunks.map((hunk) => hunk.hunkId));
  if (duplicateHunk) {
    return blocked({
      ...base,
      blocker: "duplicate-hunk",
      hunkId: duplicateHunk,
      reason: "Proposal hunk-set contains a duplicate selected hunk id.",
      nextAction: "Select each proposal hunk at most once.",
      evidence: ["proposal-hunk-set-plan:blocker:duplicate-hunk"],
    });
  }

  const hunksByTarget = groupHunksByTarget(input.manifest.selectedHunks);
  const overPerFile = Array.from(hunksByTarget.entries()).find(
    ([, hunks]) => hunks.length > maxHunksPerFile,
  );
  if (overPerFile) {
    return blocked({
      ...base,
      blocker: "over-max-hunks-per-file",
      targetPath: overPerFile[0],
      reason:
        `Selected target has ${overPerFile[1].length} hunks; max is ${maxHunksPerFile}.`,
      nextAction: `Select at most ${maxHunksPerFile} exact hunks per file.`,
      evidence: ["proposal-hunk-set-plan:blocker:over-max-hunks-per-file"],
    });
  }

  const hunkPlans: ProposalHunkSetPlanHunk[] = [];
  const originalContentByTarget = new Map<string, string>();
  for (const hunk of input.manifest.selectedHunks) {
    if (hunk.exactMappingStatus === "non-exact") {
      return blocked({
        ...base,
        blocker: "non-exact-hunk",
        targetPath: hunk.targetPath,
        hunkId: hunk.hunkId,
        reason: hunk.unsupportedReason ?? "Selected proposal hunk is not exact.",
        nextAction: "Keep non-exact proposal hunks review-only or provide exact old/new mapping.",
        evidence: ["proposal-hunk-set-plan:blocker:non-exact-hunk"],
      });
    }
    const mapping = input.mappingByHunkId?.get(hunk.hunkId);
    if (!mapping) {
      return blocked({
        ...base,
        blocker: "missing-mapping",
        targetPath: hunk.targetPath,
        hunkId: hunk.hunkId,
        reason: "Selected proposal hunk is missing an exact old/new mapping payload.",
        nextAction: "Provide exact mapping payloads for every selected hunk.",
        evidence: ["proposal-hunk-set-plan:blocker:missing-mapping"],
      });
    }
    const authority = input.validateWriteTarget(hunk.targetPath);
    if (authority.ok === false) {
      return blocked({
        ...base,
        blocker: "workspace-authority-blocked",
        targetPath: hunk.targetPath,
        hunkId: hunk.hunkId,
        reason: authority.message,
        nextAction: authority.message,
        evidence: [
          "proposal-hunk-set-plan:blocker:workspace-authority-blocked",
          ...authority.evidence,
        ],
      });
    }
    const originalContent = input.readFile(path.resolve(input.workspaceRoot, hunk.targetPath));
    if (typeof originalContent === "string") {
      originalContentByTarget.set(hunk.targetPath, originalContent);
    }
    const fencedPlan = planExactFencedReplacement({
      targetPath: hunk.targetPath,
      originalContent,
      mapping,
    });
    if (fencedPlan.ok === false) {
      return blocked({
        ...base,
        blocker: mapFencedBlocker(fencedPlan.blocker),
        targetPath: hunk.targetPath,
        hunkId: hunk.hunkId,
        reason: fencedPlan.reason,
        nextAction: fencedPlan.nextAction,
        evidence: [
          `proposal-hunk-set-plan:blocker:${mapFencedBlocker(fencedPlan.blocker)}`,
          ...fencedPlan.evidence,
        ],
      });
    }
    const located = locateExactHunkRange({
      content: originalContent ?? "",
      oldText: mapping.oldText,
    });
    hunkPlans.push({
      hunkId: hunk.hunkId,
      targetPath: hunk.targetPath,
      mapping,
      fencedPlan,
      matchCount: 1,
      range: located.range ?? { startLine: -1, endLine: -1 },
      orderKey: `${hunk.targetPath}:${String(located.range?.startLine ?? -1).padStart(8, "0")}:${hunk.hunkId}`,
      evidence: [
        `proposal-hunk-set-plan:target:${hunk.targetPath}:ready`,
        `proposal-hunk-set-plan:hunk:${hunk.hunkId}:ready`,
        `proposal-hunk-set-plan:hunk:${hunk.hunkId}:match-count:1`,
        ...fencedPlan.evidence,
      ],
    });
  }

  const exactHunkSet = buildExactHunkSetModel({
    proposalId: input.manifest.sourceProposalId,
    hunkSetId: input.manifest.hunkSetId,
    hunks: hunkPlans,
  });
  const targets: ProposalHunkSetPlanTarget[] = [];
  for (const [targetPath, groupedHunks] of groupPlanHunksByTarget(hunkPlans)) {
    const conflicts = detectExactHunkConflicts({
      targetPath,
      originalContent: originalContentByTarget.get(targetPath),
      hunks: groupedHunks,
    });
    if (conflicts.ok === false) {
      return blocked({
        ...base,
        blocker:
          conflicts.kind === "duplicate-hunk"
            ? "duplicate-hunk"
            : "conflicting-target-hunks",
        targetPath: conflicts.targetPath,
        hunkId: conflicts.hunkId,
        reason: conflicts.reason,
        nextAction: conflicts.nextAction,
        evidence: conflicts.evidence,
      });
    }
    const ordered = conflicts.orderedHunks.map((orderedHunk) => {
      const planHunk = groupedHunks.find((hunk) => hunk.hunkId === orderedHunk.hunkId);
      if (!planHunk) {
        throw new Error(`Missing exact hunk plan for ${orderedHunk.hunkId}`);
      }
      return planHunk;
    });
    const first = ordered[0]!;
    targets.push({
      hunkId: first.hunkId,
      hunkIds: ordered.map((hunk) => hunk.hunkId),
      targetPath,
      mapping: first.mapping,
      hunkMappings: ordered,
      fencedPlan: first.fencedPlan,
      hunkCount: ordered.length,
      evidence: [
        `proposal-hunk-set-plan:target:${targetPath}:hunk-count:${ordered.length}`,
        "proposal-hunk-set-plan:target:deterministic-order:descending-original-range",
        ...conflicts.evidence,
        ...ordered.flatMap((hunk) => hunk.evidence),
      ],
    });
  }

  return {
    ...base,
    status: "ready",
    targets,
    exactHunkSet,
    nextAction: "Apply every preflighted exact proposal hunk through the exact hunk-set route.",
    evidence: [
      ...input.manifest.evidence,
      ...exactHunkSet.evidence,
      "proposal-hunk-set-plan:created",
      "proposal-hunk-set-plan:all-hunks-preflighted-before-mutation",
      "proposal-hunk-set-plan:multi-hunk-per-file-exact-policy",
      "proposal-hunk-set-plan:max-hunks-per-file:3",
      "proposal-hunk-set-plan:ready",
      "proposal-hunk-set-plan:raw-content-excluded",
      ...targets.flatMap((target) => target.evidence),
    ],
  };
}

function blocked(
  input: Omit<Extract<ProposalHunkSetPlan, { status: "blocked" }>, "status">,
): Extract<ProposalHunkSetPlan, { status: "blocked" }> {
  return {
    ...input,
    status: "blocked",
    evidence: [
      `proposal-hunk-set-plan:id:${input.hunkSetId}`,
      `proposal-hunk-set-plan:blocker:${input.blocker}`,
      "proposal-hunk-set-plan:mutation:not-run",
      "proposal-hunk-set-plan:raw-content-excluded",
      ...input.evidence,
    ],
  };
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

function groupHunksByTarget(
  hunks: readonly ProposalHunkSetHunk[],
): Map<string, ProposalHunkSetHunk[]> {
  const grouped = new Map<string, ProposalHunkSetHunk[]>();
  for (const hunk of hunks) {
    grouped.set(hunk.targetPath, [...(grouped.get(hunk.targetPath) ?? []), hunk]);
  }
  return grouped;
}

function groupPlanHunksByTarget(
  hunks: readonly ProposalHunkSetPlanHunk[],
): Map<string, ProposalHunkSetPlanHunk[]> {
  const grouped = new Map<string, ProposalHunkSetPlanHunk[]>();
  for (const hunk of hunks) {
    grouped.set(hunk.targetPath, [...(grouped.get(hunk.targetPath) ?? []), hunk]);
  }
  return grouped;
}

function mapFencedBlocker(
  blocker: FencedEditPlanBlocker,
): ProposalHunkSetPlanBlocker {
  switch (blocker) {
    case "mapping-not-found":
    case "multiple-matches":
    case "target-missing":
    case "unsafe-patch-control-line":
    case "no-op":
      return blocker;
    default:
      return "missing-mapping";
  }
}
