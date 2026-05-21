import crypto from "node:crypto";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type ProviderEditMode = "generated-edit-proposal";
export type ProviderEditContextStatus =
  | "ready"
  | "missing-target"
  | "over-budget";

export interface ProviderEditTargetContext {
  readonly path: string;
  readonly pathLabel: string;
  readonly excerptSummary?: string;
  readonly exactMappingFact?: "explicit-old-new" | "missing";
  readonly omittedContentReasons: readonly string[];
}

export interface ProviderEditContextPacket {
  readonly requestId: string;
  readonly requestedMode: ProviderEditMode;
  readonly status: ProviderEditContextStatus;
  readonly targetScope: "explicit-target" | "confirmed-target-set" | "unknown";
  readonly targets: readonly ProviderEditTargetContext[];
  readonly userConstraints: readonly string[];
  readonly nonGoals: readonly string[];
  readonly verificationExpectation: "required-before-write";
  readonly snapshotRecoveryAvailability: "required-before-write";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly omittedContentReasons: readonly string[];
  readonly budget: {
    readonly maxTargets: number;
    readonly maxExcerptCharsPerTarget: number;
    readonly usedExcerptChars: number;
  };
  readonly evidence: readonly string[];
}

export function buildProviderEditContextPacket(input: {
  readonly targets?: readonly {
    readonly path: string;
    readonly excerpt?: string;
    readonly readSummary?: string;
    readonly exactMappingFact?: "explicit-old-new" | "missing";
  }[];
  readonly userConstraints?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly maxTargets?: number;
  readonly maxExcerptCharsPerTarget?: number;
}): ProviderEditContextPacket {
  const maxTargets = input.maxTargets ?? 3;
  const maxExcerptCharsPerTarget = input.maxExcerptCharsPerTarget ?? 1200;
  const rawTargets = input.targets ?? [];
  const omittedContentReasons: string[] = [];
  if (rawTargets.length === 0) {
    omittedContentReasons.push("missing-explicit-target");
  }
  if (rawTargets.length > maxTargets) {
    omittedContentReasons.push("target-count-over-budget");
  }

  let usedExcerptChars = 0;
  const targets = rawTargets.slice(0, maxTargets).map((target) => {
    const source = target.readSummary ?? target.excerpt ?? "";
    const redacted = redactProviderEditText(source);
    const truncated =
      redacted.length > maxExcerptCharsPerTarget
        ? redacted.slice(0, maxExcerptCharsPerTarget)
        : redacted;
    usedExcerptChars += truncated.length;
    const targetOmittedReasons = [
      ...(target.excerpt && target.excerpt.length > maxExcerptCharsPerTarget
        ? ["excerpt-over-budget-truncated"]
        : []),
      ...(target.excerpt ? ["full-file-content-excluded"] : []),
    ];
    omittedContentReasons.push(...targetOmittedReasons);
    return {
      path: target.path,
      pathLabel: safeTargetLabel(target.path),
      ...(truncated ? { excerptSummary: truncated } : {}),
      ...(target.exactMappingFact
        ? { exactMappingFact: target.exactMappingFact }
        : {}),
      omittedContentReasons: targetOmittedReasons,
    };
  });

  const status: ProviderEditContextStatus =
    rawTargets.length === 0
      ? "missing-target"
      : rawTargets.length > maxTargets
        ? "over-budget"
        : "ready";
  const targetScope =
    targets.length === 0
      ? "unknown"
      : targets.length === 1
        ? "explicit-target"
        : "confirmed-target-set";
  const requestId = buildProviderEditRequestId({
    targetLabels: targets.map((target) => target.pathLabel),
    userConstraints: input.userConstraints ?? [],
    nonGoals: input.nonGoals ?? [],
  });

  return {
    requestId,
    requestedMode: "generated-edit-proposal",
    status,
    targetScope,
    targets,
    userConstraints: (input.userConstraints ?? []).map(redactProviderEditText),
    nonGoals: (input.nonGoals ?? []).map(redactProviderEditText),
    verificationExpectation: "required-before-write",
    snapshotRecoveryAvailability: "required-before-write",
    redactionStatus: "redacted-and-budgeted",
    omittedContentReasons: Array.from(new Set(omittedContentReasons)),
    budget: {
      maxTargets,
      maxExcerptCharsPerTarget,
      usedExcerptChars,
    },
    evidence: [
      `provider-edit-context:status:${status}`,
      `provider-edit-context:scope:${targetScope}`,
      "provider-edit-context:redacted-and-budgeted",
      "provider-edit-context:raw-full-content-excluded",
      "provider-edit-context:provider-config-excluded",
      "provider-edit-context:credentials-excluded",
    ],
  };
}

export function redactProviderEditText(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-provider-home]")
    .replace(/\b(api[_-]?key|token|authorization|password|secret)\s*[:=]\s*[^\s"'`]+/gi, "$1=[redacted]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function buildProviderEditRequestId(input: {
  readonly targetLabels: readonly string[];
  readonly userConstraints: readonly string[];
  readonly nonGoals: readonly string[];
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `provider-edit-request-${hash}`;
}
