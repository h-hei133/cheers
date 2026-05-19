import { projectToolResult } from "../core/tools/toolResultProjection.js";
import {
  buildCompletedToolResult,
  buildPolicyBlockedResult,
  type ToolPolicyResultReceipt,
} from "../core/tools/toolPolicyResult.js";
import {
  classifyEditExpectationContract,
  type EditExpectationReasonCode,
} from "./editExpectationContract.js";

export type FutureEditMode =
  | "current-bounded-write"
  | "current-bounded-edit"
  | "future-broad-refactor-planning"
  | "future-multi-file-discovery-edit"
  | "future-fenced-replacement"
  | "unsupported-vague-edit"
  | "unsupported-generated-content"
  | "unsupported-unsafe-or-ambiguous-mutation"
  | "not-edit";

export type FutureEditSupportStatus =
  | "current-supported"
  | "future-only"
  | "unsupported"
  | "not-applicable";

export type FutureEditReasonCode =
  | "current-bounded-write"
  | "current-bounded-edit"
  | "future-broad-refactor-planning"
  | "future-multi-file-discovery-edit"
  | "future-fenced-replacement"
  | "unsupported-vague-edit"
  | "unsupported-generated-content"
  | "unsupported-unsafe-or-ambiguous-mutation"
  | "not-edit";

export type FutureEditPrecondition =
  | "explicit-target"
  | "concrete-content"
  | "exact-old-new-mapping"
  | "target-constraint-manifest"
  | "candidate-file-list"
  | "user-confirmed-target-selection"
  | "workspace-authority-check"
  | "final-stale-read"
  | "post-write-verification-plan"
  | "snapshot-or-rollback-story";

export type FutureEditRoute =
  | "current-bounded-edit-contract"
  | "route-148a-fenced-replacement"
  | "route-148b-discovery-target-selection"
  | "route-148c-broad-refactor-manifest"
  | "route-148d-snapshot-rollback-precondition"
  | "none";

export interface FutureEditContractInput {
  readonly prompt: string;
  readonly targetPath?: string;
  readonly targetCount?: number;
  readonly hasConcreteContent?: boolean;
  readonly hasReplaceDirective?: boolean;
  readonly hasFencedContent?: boolean;
  readonly hasExactOldNewMapping?: boolean;
  readonly hasCreateIntent?: boolean;
  readonly hasEditIntent?: boolean;
  readonly hasReadInspectIntent?: boolean;
}

export interface FutureEditContract {
  readonly mode: FutureEditMode;
  readonly supportStatus: FutureEditSupportStatus;
  readonly requiredPreconditions: readonly FutureEditPrecondition[];
  readonly reasonCode: FutureEditReasonCode;
  readonly doNext: string;
  readonly mutationAllowedNow: boolean;
  readonly userConfirmationRequired: boolean;
  readonly futureRoute: FutureEditRoute;
  readonly receipt: ToolPolicyResultReceipt;
  readonly stoppedResult: {
    readonly resultSummary: string;
    readonly transcriptSummary: string;
    readonly terminalSummary: string;
    readonly evidence: readonly string[];
  };
}

export function classifyFutureEditContract(
  input: FutureEditContractInput,
): FutureEditContract {
  const prompt = input.prompt.trim();
  const current = classifyEditExpectationContract(input);

  if (current.reasonCode === "concrete-write") {
    return supportedContract({
      mode: "current-bounded-write",
      reasonCode: "current-bounded-write",
      doNext: "Proceed through the current bounded write route.",
      requiredPreconditions: [
        "explicit-target",
        "concrete-content",
        "workspace-authority-check",
        "final-stale-read",
        "post-write-verification-plan",
      ],
    });
  }

  if (isFutureFencedReplacementPrompt(prompt, input, current.reasonCode)) {
    return futureOnlyContract({
      mode: "future-fenced-replacement",
      reasonCode: "future-fenced-replacement",
      doNext:
        "Provide one explicit target file plus an exact old/new or fenced block mapping; broad, fuzzy, or ambiguous fenced replacement remains future-only.",
      requiredPreconditions: [
        "explicit-target",
        "exact-old-new-mapping",
        "workspace-authority-check",
        "final-stale-read",
        "post-write-verification-plan",
      ],
      futureRoute: "route-148a-fenced-replacement",
    });
  }

  if (current.reasonCode === "bounded-edit") {
    return supportedContract({
      mode: "current-bounded-edit",
      reasonCode: "current-bounded-edit",
      doNext: "Proceed through the current bounded single-file edit route.",
      requiredPreconditions: [
        "explicit-target",
        "exact-old-new-mapping",
        "workspace-authority-check",
        "final-stale-read",
        "post-write-verification-plan",
      ],
    });
  }

  if (isFutureBroadRefactorPrompt(prompt, current.reasonCode)) {
    return futureOnlyContract({
      mode: "future-broad-refactor-planning",
      reasonCode: "future-broad-refactor-planning",
      doNext:
        "Create a target/constraint manifest, ask the user to confirm the affected scope, then require stale-read, verification, and rollback preconditions in a later route.",
      requiredPreconditions: [
        "target-constraint-manifest",
        "user-confirmed-target-selection",
        "workspace-authority-check",
        "final-stale-read",
        "post-write-verification-plan",
        "snapshot-or-rollback-story",
      ],
      futureRoute: "route-148c-broad-refactor-manifest",
    });
  }

  if (isFutureDiscoveryEditPrompt(prompt, current.reasonCode)) {
    return futureOnlyContract({
      mode: "future-multi-file-discovery-edit",
      reasonCode: "future-multi-file-discovery-edit",
      doNext:
        "Run discovery only in a future route, present candidate files, and require explicit user confirmation before any per-file edit plan can execute.",
      requiredPreconditions: [
        "candidate-file-list",
        "user-confirmed-target-selection",
        "target-constraint-manifest",
        "workspace-authority-check",
        "final-stale-read",
        "post-write-verification-plan",
      ],
      futureRoute: "route-148b-discovery-target-selection",
    });
  }

  if (current.reasonCode === "write-content-missing") {
    return unsupportedContract({
      mode: "unsupported-generated-content",
      reasonCode: "unsupported-generated-content",
      doNext:
        "Provide concrete content explicitly; the edit route must not generate file content from a vague prompt.",
      requiredPreconditions: ["explicit-target", "concrete-content"],
    });
  }

  if (
    current.reasonCode === "write-target-missing" ||
    current.reasonCode === "ambiguous-mutation"
  ) {
    return unsupportedContract({
      mode:
        current.reasonCode === "write-target-missing"
          ? "unsupported-vague-edit"
          : "unsupported-unsafe-or-ambiguous-mutation",
      reasonCode:
        current.reasonCode === "write-target-missing"
          ? "unsupported-vague-edit"
          : "unsupported-unsafe-or-ambiguous-mutation",
      doNext: current.doNext,
      requiredPreconditions: ["explicit-target", "exact-old-new-mapping"],
    });
  }

  if (current.reasonCode === "no-write-inspect") {
    return unsupportedContract({
      mode: "not-edit",
      supportStatus: "not-applicable",
      reasonCode: "not-edit",
      doNext: "Use read/inspect evidence without mutating the workspace.",
      requiredPreconditions: [],
    });
  }

  return unsupportedContract({
    mode: "not-edit",
    supportStatus: "not-applicable",
    reasonCode: "not-edit",
    doNext: "No future edit expansion request was detected.",
    requiredPreconditions: [],
  });
}

function supportedContract(input: {
  readonly mode: Extract<
    FutureEditMode,
    "current-bounded-write" | "current-bounded-edit"
  >;
  readonly reasonCode: Extract<
    FutureEditReasonCode,
    "current-bounded-write" | "current-bounded-edit"
  >;
  readonly doNext: string;
  readonly requiredPreconditions: readonly FutureEditPrecondition[];
}): FutureEditContract {
  const receipt = buildCompletedToolResult({
    capability: "edit",
    label: "future edit contract",
    reasonCode: input.reasonCode,
    reason: input.reasonCode,
    doNext: input.doNext,
    evidence: [`future-edit:${input.reasonCode}`],
  });
  return buildContract(input, {
    supportStatus: "current-supported",
    mutationAllowedNow: true,
    userConfirmationRequired: false,
    futureRoute: "current-bounded-edit-contract",
    receipt,
  });
}

function futureOnlyContract(input: {
  readonly mode: FutureEditMode;
  readonly reasonCode: FutureEditReasonCode;
  readonly doNext: string;
  readonly requiredPreconditions: readonly FutureEditPrecondition[];
  readonly futureRoute: FutureEditRoute;
}): FutureEditContract {
  const receipt = buildPolicyBlockedResult({
    capability: "edit",
    label: "future edit contract",
    reasonCode: input.reasonCode,
    reason: "Future edit expansion is planning-only in the current route.",
    doNext: input.doNext,
    evidence: [
      `future-edit:${input.reasonCode}`,
      "mutation:not-run",
      "raw-content:excluded",
    ],
  });
  return buildContract(input, {
    supportStatus: "future-only",
    mutationAllowedNow: false,
    userConfirmationRequired: true,
    futureRoute: input.futureRoute,
    receipt,
  });
}

function unsupportedContract(input: {
  readonly mode: FutureEditMode;
  readonly supportStatus?: FutureEditSupportStatus;
  readonly reasonCode: FutureEditReasonCode;
  readonly doNext: string;
  readonly requiredPreconditions: readonly FutureEditPrecondition[];
}): FutureEditContract {
  const receipt = buildPolicyBlockedResult({
    capability: "edit",
    label: "future edit contract",
    reasonCode: input.reasonCode,
    reason: "The edit request is unsupported by the current bounded contract.",
    doNext: input.doNext,
    evidence: [
      `future-edit:${input.reasonCode}`,
      "mutation:not-run",
      "raw-content:excluded",
    ],
  });
  return buildContract(input, {
    supportStatus: input.supportStatus ?? "unsupported",
    mutationAllowedNow: false,
    userConfirmationRequired: false,
    futureRoute: "none",
    receipt,
  });
}

function buildContract(
  input: {
    readonly mode: FutureEditMode;
    readonly reasonCode: FutureEditReasonCode;
    readonly doNext: string;
    readonly requiredPreconditions: readonly FutureEditPrecondition[];
  },
  state: {
    readonly supportStatus: FutureEditSupportStatus;
    readonly mutationAllowedNow: boolean;
    readonly userConfirmationRequired: boolean;
    readonly futureRoute: FutureEditRoute;
    readonly receipt: ToolPolicyResultReceipt;
  },
): FutureEditContract {
  const projection = projectToolResult(state.receipt);
  return {
    mode: input.mode,
    supportStatus: state.supportStatus,
    requiredPreconditions: input.requiredPreconditions,
    reasonCode: input.reasonCode,
    doNext: input.doNext,
    mutationAllowedNow: state.mutationAllowedNow,
    userConfirmationRequired: state.userConfirmationRequired,
    futureRoute: state.futureRoute,
    receipt: state.receipt,
    stoppedResult: {
      resultSummary: projection.resultSummary,
      transcriptSummary: projection.transcriptSummary,
      terminalSummary: projection.terminalSummary,
      evidence: projection.evidenceSummary,
    },
  };
}

function isFutureBroadRefactorPrompt(
  prompt: string,
  currentReasonCode: EditExpectationReasonCode,
): boolean {
  return (
    currentReasonCode === "unsupported-refactor" ||
    /\b(?:refactor|rename exported function|rename function|update all usages|keep usage|across the repo)\b/i.test(
      prompt,
    )
  );
}

function isFutureDiscoveryEditPrompt(
  prompt: string,
  currentReasonCode: EditExpectationReasonCode,
): boolean {
  return (
    currentReasonCode === "unsupported-discovery-edit" ||
    /\b(?:edit|modify|update|replace|fix)\s+(?:this\s+)?(?:repo|repository|workspace|codebase)\b/i.test(
      prompt,
    )
  );
}

function isFutureFencedReplacementPrompt(
  prompt: string,
  input: FutureEditContractInput,
  currentReasonCode: EditExpectationReasonCode,
): boolean {
  if (input.hasExactOldNewMapping || input.hasReplaceDirective) {
    return false;
  }
  return Boolean(
    input.hasFencedContent &&
      !input.hasExactOldNewMapping &&
      /\b(?:replace|replacement|edit|modify|update)\b/i.test(prompt),
  );
}
