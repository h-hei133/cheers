import type { EscalationPrompt } from "./approval/contract.js";
import type {
  ApprovalEvaluation,
  ApprovalTrustPolicy,
  PersistedApprovalGrant,
} from "./approvalTrustPolicy.js";

export type InteractiveApprovalDecision =
  | "deny"
  | "allow-once"
  | "allow-always";

export interface InteractiveApprovalWiringResult {
  readonly persistedGrant?: PersistedApprovalGrant;
}

export function applyInteractiveApprovalDecisionWiring(input: {
  readonly decision: InteractiveApprovalDecision;
  readonly prompt: EscalationPrompt;
  readonly projectRoot: string;
  readonly evaluation: ApprovalEvaluation;
  readonly trustPolicy: ApprovalTrustPolicy;
}): InteractiveApprovalWiringResult {
  if (input.decision === "allow-once") {
    input.trustPolicy.rememberAllowOnce(input.evaluation.cacheKey);
    return {};
  }

  if (input.decision === "allow-always") {
    return {
      persistedGrant: input.trustPolicy.rememberAllowAlways(
        input.prompt,
        input.projectRoot,
      ),
    };
  }

  return {};
}

