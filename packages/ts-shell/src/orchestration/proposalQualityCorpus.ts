import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { ProviderOutputValidationStatus } from "./providerOutputValidator.js";
import type { ProviderAnchorQualityLevel } from "./providerAnchorQuality.js";

export type ProposalQualityCaseId =
  | "exact-single-target"
  | "exact-multi-hunk"
  | "partial-anchor"
  | "unanchored-generated"
  | "fuzzy-output"
  | "broad-refactor"
  | "malformed-output"
  | "unsafe-output"
  | "stale-context"
  | "ambiguous-target"
  | "conflicting-hunks";

export interface ProposalQualityCorpusCase {
  readonly caseId: ProposalQualityCaseId;
  readonly taskIntentLabel: string;
  readonly targetLabel: string;
  readonly currentContent: string;
  readonly rawProposal: ProviderEditRawProposal | null;
  readonly staleTargetLabels?: readonly string[];
  readonly expectedOutputValidation: ProviderOutputValidationStatus;
  readonly expectedAnchorQuality: ProviderAnchorQualityLevel;
  readonly expectedReviewReadiness: "explicit-review-and-confirmation" | "review-only" | "target-selection-required" | "context-refresh-required" | "blocked";
  readonly expectedHandoffReadiness: "exact-single-target" | "exact-hunk-set" | "review-only" | "blocked";
  readonly expectedNoWriteStatus: "pass";
  readonly expectedFailureClass: string;
}

const TARGET = "src/app.ts";
const CURRENT = [
  "export function runApp() {",
  "  return helper();",
  "}",
  "export function runOther() {",
  "  return helper();",
  "}",
].join("\n");

export const PROPOSAL_QUALITY_CORPUS: readonly ProposalQualityCorpusCase[] = [
  {
    caseId: "exact-single-target",
    taskIntentLabel: "exact single-target anchored proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: exact([{ oldText: "export function runApp() {", newText: "export function startApp() {" }]),
    expectedOutputValidation: "valid-exact-single-target",
    expectedAnchorQuality: "exact-ready",
    expectedReviewReadiness: "explicit-review-and-confirmation",
    expectedHandoffReadiness: "exact-single-target",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke exact-ready no-write",
  },
  {
    caseId: "exact-multi-hunk",
    taskIntentLabel: "exact multi-hunk anchored proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: exact([
      { oldText: "export function runApp() {", newText: "export function startApp() {" },
      { oldText: "export function runOther() {", newText: "export function startOther() {" },
    ]),
    expectedOutputValidation: "valid-exact-hunk-set",
    expectedAnchorQuality: "exact-ready",
    expectedReviewReadiness: "explicit-review-and-confirmation",
    expectedHandoffReadiness: "exact-hunk-set",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke exact-ready no-write",
  },
  {
    caseId: "partial-anchor",
    taskIntentLabel: "partial target-bound proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [{ path: TARGET, summary: "rename app", oldText: "runApp" }],
      verificationPlan: ["npm test -- app"],
    },
    expectedOutputValidation: "partial-anchor",
    expectedAnchorQuality: "review-only",
    expectedReviewReadiness: "review-only",
    expectedHandoffReadiness: "review-only",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
  {
    caseId: "unanchored-generated",
    taskIntentLabel: "unanchored generated proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: { operationKind: "generated-replacement" },
    expectedOutputValidation: "unanchored-generated",
    expectedAnchorQuality: "review-only",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke output invalid",
  },
  {
    caseId: "fuzzy-output",
    taskIntentLabel: "fuzzy replacement proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: {
      operationKind: "fuzzy-replacement",
      targets: [{ path: TARGET, summary: "fuzzy rename", oldText: "run", newText: "start" }],
    },
    expectedOutputValidation: "fuzzy-output",
    expectedAnchorQuality: "unsupported",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
  {
    caseId: "broad-refactor",
    taskIntentLabel: "broad refactor proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: {
      operationKind: "broad-refactor",
      targets: [
        { path: TARGET, summary: "broad refactor", oldText: "runApp", newText: "startApp" },
      ],
    },
    expectedOutputValidation: "broad-refactor-output",
    expectedAnchorQuality: "unsupported",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
  {
    caseId: "malformed-output",
    taskIntentLabel: "malformed target proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [{ path: "src/other.ts", summary: "outside context", oldText: "a", newText: "b" }],
    },
    expectedOutputValidation: "malformed-output",
    expectedAnchorQuality: "unsupported",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke output invalid",
  },
  {
    caseId: "unsafe-output",
    taskIntentLabel: "unsafe proposal output",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: exact([{ oldText: "runApp", newText: "rm -rf /" }]),
    expectedOutputValidation: "unsafe-output",
    expectedAnchorQuality: "unsafe",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke unsafe output",
  },
  {
    caseId: "stale-context",
    taskIntentLabel: "stale current context proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: exact([{ oldText: "runApp", newText: "startApp" }]),
    staleTargetLabels: [TARGET],
    expectedOutputValidation: "valid-exact-single-target",
    expectedAnchorQuality: "stale",
    expectedReviewReadiness: "context-refresh-required",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
  {
    caseId: "ambiguous-target",
    taskIntentLabel: "ambiguous exact anchor proposal",
    targetLabel: TARGET,
    currentContent: "sharedAnchor\nsharedAnchor\n",
    rawProposal: exact([{ oldText: "sharedAnchor", newText: "uniqueAnchor" }]),
    expectedOutputValidation: "valid-exact-single-target",
    expectedAnchorQuality: "ambiguous",
    expectedReviewReadiness: "target-selection-required",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
  {
    caseId: "conflicting-hunks",
    taskIntentLabel: "conflicting exact hunk proposal",
    targetLabel: TARGET,
    currentContent: CURRENT,
    rawProposal: exact([
      { oldText: "runApp", newText: "startApp" },
      { oldText: "runApp", newText: "bootApp" },
    ]),
    expectedOutputValidation: "valid-exact-hunk-set",
    expectedAnchorQuality: "unsupported",
    expectedReviewReadiness: "blocked",
    expectedHandoffReadiness: "blocked",
    expectedNoWriteStatus: "pass",
    expectedFailureClass: "smoke anchoring failed",
  },
];

export function getProposalQualityCorpusCase(caseId: ProposalQualityCaseId): ProposalQualityCorpusCase {
  const found = PROPOSAL_QUALITY_CORPUS.find((entry) => entry.caseId === caseId);
  if (!found) throw new Error(`unknown proposal quality corpus case: ${caseId}`);
  return found;
}

function exact(
  hunks: readonly { readonly oldText: string; readonly newText: string }[],
): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: hunks.map((hunk) => ({
      path: TARGET,
      summary: "deterministic corpus proposal",
      oldText: hunk.oldText,
      newText: hunk.newText,
    })),
    verificationPlan: ["npm test -- app"],
  };
}
