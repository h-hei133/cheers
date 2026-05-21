import type { ProviderReadinessFailureKind } from "../core/shell/providerReadiness.js";
import {
  buildProviderEditContextPacket,
  type ProviderEditContextPacket,
} from "./providerEditContext.js";
import {
  normalizeProviderEditProposal,
  type ProviderEditProposalManifest,
  type ProviderEditRawProposal,
} from "./providerEditProposal.js";

export type ProviderEditPlanStatus =
  | "provider-proposal-ready"
  | "provider-not-configured"
  | "provider-opt-in-required"
  | "provider-unsupported"
  | "provider-context-missing"
  | "provider-context-over-budget"
  | "provider-request-blocked"
  | "provider-proposal-created"
  | "provider-proposal-invalid"
  | "provider-proposal-review-required";

export type ProviderEditAvailability =
  | { readonly kind: "available"; readonly providerKindLabel: string }
  | { readonly kind: "not-configured"; readonly reason?: string }
  | { readonly kind: "opt-in-required"; readonly reason?: string }
  | { readonly kind: "unsupported"; readonly reason?: string }
  | { readonly kind: "request-blocked"; readonly reason?: string };

export interface ProviderEditFakeProvider {
  readonly proposeEdit: (
    context: ProviderEditContextPacket,
  ) => ProviderEditRawProposal | Promise<ProviderEditRawProposal>;
}

export type ProviderEditPlan =
  | {
      readonly status:
        | "provider-proposal-ready"
        | "provider-proposal-created"
        | "provider-proposal-review-required";
      readonly context: ProviderEditContextPacket;
      readonly manifest: ProviderEditProposalManifest;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<
        ProviderEditPlanStatus,
        | "provider-proposal-ready"
        | "provider-proposal-created"
        | "provider-proposal-review-required"
      >;
      readonly context?: ProviderEditContextPacket;
      readonly manifest?: ProviderEditProposalManifest;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export async function planProviderEditProposal(input: {
  readonly targets?: readonly {
    readonly path: string;
    readonly excerpt?: string;
    readonly readSummary?: string;
    readonly exactMappingFact?: "explicit-old-new" | "missing";
  }[];
  readonly userConstraints?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly availability: ProviderEditAvailability;
  readonly provider?: ProviderEditFakeProvider;
  readonly maxTargets?: number;
  readonly maxExcerptCharsPerTarget?: number;
}): Promise<ProviderEditPlan> {
  const context = buildProviderEditContextPacket({
    targets: input.targets,
    userConstraints: input.userConstraints,
    nonGoals: input.nonGoals,
    maxTargets: input.maxTargets,
    maxExcerptCharsPerTarget: input.maxExcerptCharsPerTarget,
  });

  if (context.status === "missing-target") {
    return stoppedPlan({
      status: "provider-context-missing",
      context,
      reason: "Provider edit proposal requires an explicit file context packet.",
      nextAction: "Select explicit target files before requesting provider planning.",
      evidence: context.evidence,
    });
  }
  if (context.status === "over-budget") {
    return stoppedPlan({
      status: "provider-context-over-budget",
      context,
      reason: "Provider edit context exceeded the bounded target budget.",
      nextAction: "Reduce the target set or provide tighter read summaries.",
      evidence: context.evidence,
    });
  }

  const unavailable = classifyAvailability(input.availability);
  if (unavailable) {
    return stoppedPlan({
      ...unavailable,
      context,
      evidence: context.evidence,
    });
  }

  if (!input.provider) {
    return stoppedPlan({
      status: "provider-opt-in-required",
      context,
      reason: "Provider edit proposal requires an explicit fake/stub or opt-in provider boundary.",
      nextAction: "Use a deterministic fake provider in tests or an isolated real-provider gate.",
      evidence: context.evidence,
    });
  }

  const available = input.availability;
  if (available.kind !== "available") {
    return stoppedPlan({
      status: "provider-request-blocked",
      context,
      reason: "Provider availability changed before proposal call.",
      nextAction: "Retry with an explicit provider proposal boundary.",
      evidence: context.evidence,
    });
  }
  const rawProposal = await input.provider.proposeEdit(context);
  const normalized = normalizeProviderEditProposal({
    providerKindLabel: available.providerKindLabel,
    rawProposal,
    explicitTargetLabels: context.targets.map((target) => target.pathLabel),
  });
  if (normalized.ok === false) {
    return stoppedPlan({
      status: "provider-proposal-invalid",
      context,
      reason: normalized.reason,
      nextAction:
        "Ask the provider for an exact target-bound old/new proposal, then review before handoff.",
      evidence: [...context.evidence, ...normalized.evidence],
    });
  }

  const status =
    normalized.manifest.handoffReadiness === "exact-single-target" ||
    normalized.manifest.handoffReadiness === "exact-target-set"
      ? "provider-proposal-ready"
      : normalized.manifest.reviewRequired
        ? "provider-proposal-review-required"
        : "provider-proposal-created";
  return {
    status,
    context,
    manifest: normalized.manifest,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason:
      status === "provider-proposal-ready"
        ? "Provider proposal is exact and can be reviewed for existing exact-lane handoff."
        : "Provider proposal was created for review only; mutation did not run.",
    nextAction:
      status === "provider-proposal-ready"
        ? "Confirm exact target mapping before handing off to the existing edit lane."
        : "Review the provider proposal and convert it to exact old/new mapping before handoff.",
    evidence: [
      ...context.evidence,
      ...normalized.manifest.evidence,
      `provider-edit-planner:status:${status}`,
      "provider-edit-planner:fake-provider-boundary-supported",
      "provider-edit-planner:mutation:not-run",
      "provider-edit-planner:mutation-authority:not-granted",
      "provider-edit-planner:raw-content-excluded",
    ],
  };
}

export function providerReadinessFailureToEditAvailability(
  failureKind: ProviderReadinessFailureKind,
): ProviderEditAvailability {
  switch (failureKind) {
    case "missing-key":
    case "missing-config":
      return { kind: "not-configured", reason: `provider-readiness:${failureKind}` };
    case "unsupported-provider":
      return { kind: "unsupported", reason: "provider-readiness:unsupported-provider" };
    default:
      return { kind: "request-blocked", reason: `provider-readiness:${failureKind}` };
  }
}

function classifyAvailability(
  availability: ProviderEditAvailability,
):
  | {
      readonly status:
        | "provider-not-configured"
        | "provider-opt-in-required"
        | "provider-unsupported"
        | "provider-request-blocked";
      readonly reason: string;
      readonly nextAction: string;
    }
  | undefined {
  switch (availability.kind) {
    case "available":
      return undefined;
    case "not-configured":
      return {
        status: "provider-not-configured",
        reason: availability.reason ?? "Provider is not configured for edit proposal generation.",
        nextAction: "Configure provider credentials through the approved opt-in flow, then retry.",
      };
    case "opt-in-required":
      return {
        status: "provider-opt-in-required",
        reason: availability.reason ?? "Provider edit proposal generation was not explicitly opted in.",
        nextAction: "Use an explicit provider proposal gate or deterministic fake provider.",
      };
    case "unsupported":
      return {
        status: "provider-unsupported",
        reason: availability.reason ?? "Configured provider is unsupported for edit proposal generation.",
        nextAction: "Use a supported provider proposal adapter or fake provider test path.",
      };
    case "request-blocked":
      return {
        status: "provider-request-blocked",
        reason: availability.reason ?? "Provider edit proposal request was blocked before any provider call.",
        nextAction: "Resolve the provider readiness blocker before retrying.",
      };
  }
}

function stoppedPlan(input: {
  readonly status: Exclude<
    ProviderEditPlanStatus,
    | "provider-proposal-ready"
    | "provider-proposal-created"
    | "provider-proposal-review-required"
  >;
  readonly context?: ProviderEditContextPacket;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): ProviderEditPlan {
  return {
    status: input.status,
    ...(input.context ? { context: input.context } : {}),
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `provider-edit-planner:status:${input.status}`,
      "provider-edit-planner:provider-call:not-run-or-invalid",
      "provider-edit-planner:mutation:not-run",
      "provider-edit-planner:mutation-authority:not-granted",
      "provider-edit-planner:raw-content-excluded",
    ],
  };
}
