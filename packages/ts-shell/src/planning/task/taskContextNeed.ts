import crypto from "node:crypto";

import type { CodeGraphImpact } from "../../context/acquisition/code/impact.js";
import type { ContextGraph } from "../../orchestration/contextGraph.js";
import type { TargetedContextPacket } from "../../orchestration/contextPacket.js";
import type { TaskIntent, TaskIntentKind } from "./taskIntent.js";
import type { TestImpactPlan } from "../../orchestration/testImpactPlan.js";

export type TaskContextNeedKind =
  | "root-target"
  | "direct-imports"
  | "reverse-call-sites"
  | "sibling-tests"
  | "affected-tests"
  | "docs-readme"
  | "config-package-scripts"
  | "verification-output"
  | "runtime-receipt"
  | "prior-proposal-edit-evidence"
  | "repair-evidence";

export type TaskContextNeedReadiness =
  | "available"
  | "missing"
  | "optional-missing"
  | "omitted";

export interface TaskContextNeed {
  readonly needId: string;
  readonly taskId: string;
  readonly kind: TaskContextNeedKind;
  readonly required: boolean;
  readonly reason: string;
  readonly sourceOwner:
    | "workspace-file-context"
    | "agent-loop"
    | "runtime-verification"
    | "edit-patch"
    | "provider-model";
  readonly expectedEvidenceKind:
    | "source"
    | "tests"
    | "docs"
    | "call-sites"
    | "imports"
    | "config"
    | "verification"
    | "runtime-receipt"
    | "proposal"
    | "repair";
  readonly budgetClass: "small" | "medium" | "bounded";
  readonly readiness: TaskContextNeedReadiness;
  readonly omittedReason?: string;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly evidence: readonly string[];
}

export interface TaskContextNeedSet {
  readonly needSetId: string;
  readonly taskId: string;
  readonly intentKind: TaskIntentKind;
  readonly needs: readonly TaskContextNeed[];
  readonly requiredNeedIds: readonly string[];
  readonly optionalNeedIds: readonly string[];
  readonly missingRequiredNeedIds: readonly string[];
  readonly missingOptionalNeedIds: readonly string[];
  readonly replaySafeSummary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function buildTaskContextNeeds(input: {
  readonly intent: TaskIntent;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly hasVerificationOutput?: boolean;
  readonly hasRuntimeReceipt?: boolean;
  readonly hasPriorProposalEvidence?: boolean;
  readonly hasRepairEvidence?: boolean;
}): TaskContextNeedSet {
  const needSpecs = specsForIntent(input.intent.kind);
  const needs = needSpecs.map((spec) =>
    buildNeed({
      ...spec,
      intent: input.intent,
      readiness: classifyReadiness({
        kind: spec.kind,
        required: spec.required,
        contextPacket: input.contextPacket,
        contextGraph: input.contextGraph,
        testImpactPlan: input.testImpactPlan,
        codeGraphImpact: input.codeGraphImpact,
        hasVerificationOutput: input.hasVerificationOutput,
        hasRuntimeReceipt: input.hasRuntimeReceipt,
        hasPriorProposalEvidence: input.hasPriorProposalEvidence,
        hasRepairEvidence: input.hasRepairEvidence,
      }),
    }),
  );
  const missingRequiredNeedIds = needs
    .filter((need) => need.required && need.readiness !== "available")
    .map((need) => need.needId);
  const missingOptionalNeedIds = needs
    .filter((need) => !need.required && need.readiness !== "available")
    .map((need) => need.needId);
  const needSetId = `task_context_needs_${hash({
    taskId: input.intent.taskId,
    intentKind: input.intent.kind,
    needs: needs.map((need) => [need.kind, need.required, need.readiness]),
  })}`;
  const replaySafeSummary = [
    `task-context-needs ${needSetId}`,
    `task=${input.intent.taskId}`,
    `intent=${input.intent.kind}`,
    `required=${needs.filter((need) => need.required).length}`,
    `optional=${needs.filter((need) => !need.required).length}`,
    `missingRequired=${missingRequiredNeedIds.length}`,
    `missingOptional=${missingOptionalNeedIds.length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    needSetId,
    taskId: input.intent.taskId,
    intentKind: input.intent.kind,
    needs,
    requiredNeedIds: needs.filter((need) => need.required).map((need) => need.needId),
    optionalNeedIds: needs.filter((need) => !need.required).map((need) => need.needId),
    missingRequiredNeedIds,
    missingOptionalNeedIds,
    replaySafeSummary,
    mutationAuthority: "not-granted",
    evidence: [
      `task-context-needs:id:${needSetId}`,
      `task-context-needs:task:${input.intent.taskId}`,
      `task-context-needs:intent:${input.intent.kind}`,
      `task-context-needs:missing-required:${missingRequiredNeedIds.length}`,
      `task-context-needs:missing-optional:${missingOptionalNeedIds.length}`,
      "task-context-needs:mutation-authority:not-granted",
      "task-context-needs:provider-call:not-run",
      "task-context-needs:command-dispatch:not-run",
      "task-context-needs:raw-content-excluded",
      ...needs.flatMap((need) => need.evidence),
    ],
  };
}

function specsForIntent(kind: TaskIntentKind): readonly Omit<TaskContextNeed, "needId" | "taskId" | "readiness" | "omittedReason" | "redactionStatus" | "evidence">[] {
  const root = spec("root-target", true, "Explicit task target anchors all read/analyze planning.", "workspace-file-context", "source", "small");
  const imports = spec("direct-imports", false, "Imports calibrate local dependency context.", "workspace-file-context", "imports", "small");
  const calls = spec("reverse-call-sites", false, "Call-sites calibrate downstream impact and refactor risk.", "workspace-file-context", "call-sites", "medium");
  const siblingTests = spec("sibling-tests", false, "Sibling tests provide direct verification context.", "workspace-file-context", "tests", "small");
  const affectedTests = spec("affected-tests", false, "Affected tests support verification planning.", "workspace-file-context", "tests", "medium");
  const docs = spec("docs-readme", false, "Docs/readme evidence calibrates public behavior and usage.", "workspace-file-context", "docs", "small");
  const config = spec("config-package-scripts", false, "Package scripts help choose existing verification candidates.", "workspace-file-context", "config", "small");
  const verification = spec("verification-output", true, "Test failure analysis requires failed verification evidence.", "runtime-verification", "verification", "bounded");
  const receipt = spec("runtime-receipt", true, "Repair planning requires runtime receipt markers.", "runtime-verification", "runtime-receipt", "small");
  const prior = spec("prior-proposal-edit-evidence", true, "Repair/review needs prior proposal or edit evidence.", "edit-patch", "proposal", "bounded");
  const repair = spec("repair-evidence", true, "Repair planning needs failed verification or apply evidence.", "edit-patch", "repair", "bounded");

  switch (kind) {
    case "read-explain":
      return [root, imports, docs];
    case "analyze":
      return [root, imports, calls, siblingTests, docs];
    case "plan-only":
    case "edit-proposal":
      return [root, imports, calls, siblingTests, affectedTests, docs, config];
    case "edit-apply-request":
      return [root, imports, calls, siblingTests, affectedTests, config];
    case "verification":
      return [root, siblingTests, affectedTests, config, verification];
    case "repair":
      return [root, affectedTests, verification, receipt, prior, repair];
    case "ambiguous":
    case "broad-unsupported":
      return [root];
  }
}

function spec(
  kind: TaskContextNeedKind,
  required: boolean,
  reason: string,
  sourceOwner: TaskContextNeed["sourceOwner"],
  expectedEvidenceKind: TaskContextNeed["expectedEvidenceKind"],
  budgetClass: TaskContextNeed["budgetClass"],
): Omit<TaskContextNeed, "needId" | "taskId" | "readiness" | "omittedReason" | "redactionStatus" | "evidence"> {
  return { kind, required, reason, sourceOwner, expectedEvidenceKind, budgetClass };
}

function buildNeed(input: Omit<TaskContextNeed, "needId" | "taskId" | "omittedReason" | "redactionStatus" | "evidence"> & {
  readonly intent: TaskIntent;
}): TaskContextNeed {
  const omittedReason = input.readiness === "available"
    ? undefined
    : input.readiness === "omitted"
      ? "available bounded context omitted this category"
      : input.required
        ? "required context evidence missing"
        : "optional context evidence not acquired";
  const needId = `task_context_need_${hash({
    taskId: input.intent.taskId,
    kind: input.kind,
    required: input.required,
    readiness: input.readiness,
  })}`;
  return {
    needId,
    taskId: input.intent.taskId,
    kind: input.kind,
    required: input.required,
    reason: input.reason,
    sourceOwner: input.sourceOwner,
    expectedEvidenceKind: input.expectedEvidenceKind,
    budgetClass: input.budgetClass,
    readiness: input.readiness,
    ...(omittedReason ? { omittedReason } : {}),
    redactionStatus: "redacted-and-budgeted",
    evidence: [
      `task-context-need:id:${needId}`,
      `task-context-need:kind:${input.kind}`,
      `task-context-need:required:${input.required ? "yes" : "no"}`,
      `task-context-need:readiness:${input.readiness}`,
      `task-context-need:evidence-kind:${input.expectedEvidenceKind}`,
      "task-context-need:raw-content-excluded",
    ],
  };
}

function classifyReadiness(input: {
  readonly kind: TaskContextNeedKind;
  readonly required: boolean;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly hasVerificationOutput?: boolean;
  readonly hasRuntimeReceipt?: boolean;
  readonly hasPriorProposalEvidence?: boolean;
  readonly hasRepairEvidence?: boolean;
}): TaskContextNeedReadiness {
  const available = (() => {
    switch (input.kind) {
      case "root-target":
        return Boolean(input.contextPacket?.targetSafeLabel || input.contextGraph?.rootTarget);
      case "direct-imports":
        return Boolean(input.contextGraph?.nodes.some((node) => node.kind === "direct-import"));
      case "reverse-call-sites":
        return Boolean(input.contextGraph?.nodes.some((node) => node.kind === "reverse-call-site") || input.codeGraphImpact?.likelyCallSites.length);
      case "sibling-tests":
      case "affected-tests":
        return Boolean(input.testImpactPlan?.likelyTestFiles.length || input.codeGraphImpact?.likelyTests.length);
      case "docs-readme":
        return Boolean(input.contextGraph?.nodes.some((node) => node.kind === "docs-readme") || input.codeGraphImpact?.docsReferences.length);
      case "config-package-scripts":
        return Boolean(input.testImpactPlan?.likelyVerificationCommandCandidates.length);
      case "verification-output":
        return input.hasVerificationOutput === true;
      case "runtime-receipt":
        return input.hasRuntimeReceipt === true;
      case "prior-proposal-edit-evidence":
        return input.hasPriorProposalEvidence === true;
      case "repair-evidence":
        return input.hasRepairEvidence === true;
    }
  })();
  if (available) return "available";
  return input.required ? "missing" : "optional-missing";
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
