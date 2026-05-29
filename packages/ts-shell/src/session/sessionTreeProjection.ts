import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";

export interface ProjectedSessionNode {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: "session-root" | "turn-message";
  readonly role?: "user" | "assistant";
  readonly order: number;
  readonly timestamp?: string;
  readonly sourceSessionIdentity: string;
  readonly activeLeaf: boolean;
  readonly activePath: boolean;
  readonly payloadSummary: "metadata-only";
  readonly branchSummaryAvailability: "not-supported-by-current-schema";
  readonly compactionAvailability: "not-proven";
  readonly notProvenClaims: readonly string[];
}

export interface SessionCompactionRecordProjection {
  readonly compactionId: string;
  readonly sourceActivePath: readonly string[];
  readonly firstKeptEntryId?: string;
  readonly summaryAvailability: "available" | "missing" | "not-proven";
  readonly tokenMetadata?: {
    readonly tokensBefore?: number;
    readonly sizeBefore?: number;
  };
  readonly evidence: "observed" | "planned" | "not-proven";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export interface SessionBranchSummaryProjection {
  readonly branchSummaryId: string;
  readonly sourceBranchIdentity: string;
  readonly targetLocation?: string;
  readonly summaryAvailability: "available" | "missing" | "not-proven";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export interface SessionTreeProjection {
  readonly sessionIdentity: string;
  readonly treeSupport: "linear-path";
  readonly branchSupport: "not-proven";
  readonly activeLeafId: string;
  readonly activePath: readonly string[];
  readonly activePathProjection: {
    readonly activeLeafId: string;
    readonly pathLength: number;
    readonly entryKinds: readonly ProjectedSessionNode["kind"][];
    readonly redactionStatus: "report-safe";
    readonly contextRebuildReadiness: "projection-ready";
    readonly unsupportedClaims: readonly string[];
  };
  readonly nodes: readonly ProjectedSessionNode[];
  readonly branchSummary: {
    readonly availability: "not-supported-by-current-schema" | "observed";
    readonly records: readonly SessionBranchSummaryProjection[];
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly compaction: {
    readonly availability: "not-proven" | "observed";
    readonly records: readonly SessionCompactionRecordProjection[];
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly continuation: {
    readonly state: "active" | "pending-prompt" | "interrupted" | "terminal" | "unknown";
  };
  readonly terminal: {
    readonly status: Session["status"];
    readonly terminalClassification?: SessionStateSnapshot["terminalClassification"];
    readonly terminalReason?: SessionStateSnapshot["terminalReason"];
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly redaction: {
    readonly status: "report-safe";
    readonly excluded: readonly string[];
  };
}

export function projectSessionTree(input: {
  readonly session: Session;
  readonly stateSnapshot?: SessionStateSnapshot;
  readonly compactions?: readonly {
    readonly id: string;
    readonly firstKeptEntryId?: string;
    readonly summary?: string;
    readonly tokensBefore?: number;
    readonly sizeBefore?: number;
    readonly evidence?: "observed" | "planned" | "not-proven";
  }[];
  readonly branchSummaries?: readonly {
    readonly id: string;
    readonly sourceBranchIdentity?: string;
    readonly targetLocation?: string;
    readonly summary?: string;
  }[];
}): SessionTreeProjection {
  const rootId = `${input.session.id}:root`;
  const turnNodes = input.session.turns.map((turn, index): ProjectedSessionNode => {
    const order = index + 1;
    return {
      id: `${input.session.id}:turn-${order}`,
      parentId: index === 0 ? rootId : `${input.session.id}:turn-${index}`,
      kind: "turn-message",
      role: turn.role,
      order,
      ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
      sourceSessionIdentity: input.session.id,
      activeLeaf: false,
      activePath: true,
      payloadSummary: "metadata-only",
      branchSummaryAvailability: "not-supported-by-current-schema",
      compactionAvailability: "not-proven",
      notProvenClaims: ["raw-transcript", "branching-support"],
    };
  });
  const projectedNodes: ProjectedSessionNode[] = [
    {
      id: rootId,
      kind: "session-root",
      order: 0,
      timestamp: input.session.createdAt,
      sourceSessionIdentity: input.session.id,
      activeLeaf: false,
      activePath: true,
      payloadSummary: "metadata-only",
      branchSummaryAvailability: "not-supported-by-current-schema",
      compactionAvailability: "not-proven",
      notProvenClaims: ["branching-support"],
    },
    ...turnNodes,
  ];
  const activeLeafId = projectedNodes[projectedNodes.length - 1]?.id ?? rootId;
  const nodes = projectedNodes.map((node) => ({
    ...node,
    activeLeaf: node.id === activeLeafId,
  }));
  const redactionExcluded = [
    "raw-transcript",
    "provider-secrets",
    "raw-provider-output",
    "oldText",
    "newText",
    "unredacted-command-output",
    "hidden-reasoning",
    "arbitrary-file-contents",
  ];
  const activePath = nodes.map((node) => node.id);
  const compactionRecords = (input.compactions ?? []).map(
    (compaction): SessionCompactionRecordProjection => {
      const redacted = needsRedaction(compaction.summary);
      return {
        compactionId: sanitizeIdentifier(compaction.id, "compaction"),
        sourceActivePath: activePath,
        ...(compaction.firstKeptEntryId
          ? {
              firstKeptEntryId: sanitizeIdentifier(
                compaction.firstKeptEntryId,
                "entry",
              ),
            }
          : {}),
        summaryAvailability: compaction.summary ? "available" : "missing",
        ...(compaction.tokensBefore !== undefined ||
        compaction.sizeBefore !== undefined
          ? {
              tokenMetadata: {
                ...(compaction.tokensBefore !== undefined
                  ? { tokensBefore: compaction.tokensBefore }
                  : {}),
                ...(compaction.sizeBefore !== undefined
                  ? { sizeBefore: compaction.sizeBefore }
                  : {}),
              },
            }
          : {}),
        evidence: compaction.evidence ?? "not-proven",
        terminalSuccessClaim: false,
        notProvenClaims: [
          "terminal-success",
          "compaction-summary-truth",
          "storage-migration",
        ],
        redaction: {
          status: redacted ? "redacted" : "report-safe",
          excluded: redactionExcluded,
        },
      };
    },
  );
  const branchSummaryRecords = (input.branchSummaries ?? []).map(
    (summary): SessionBranchSummaryProjection => {
      const redacted =
        needsRedaction(summary.summary) || needsRedaction(summary.targetLocation);
      return {
        branchSummaryId: sanitizeIdentifier(summary.id, "branch-summary"),
        sourceBranchIdentity: sanitizeIdentifier(
          summary.sourceBranchIdentity ?? input.session.id,
          "branch",
        ),
        ...(summary.targetLocation
          ? {
              targetLocation: sanitizeIdentifier(
                summary.targetLocation,
                "target",
              ),
            }
          : {}),
        summaryAvailability: summary.summary ? "available" : "missing",
        terminalSuccessClaim: false,
        notProvenClaims: [
          "terminal-success",
          "branch-summary-truth",
          "branch-navigation",
        ],
        redaction: {
          status: redacted ? "redacted" : "report-safe",
          excluded: redactionExcluded,
        },
      };
    },
  );

  return deepFreeze({
    sessionIdentity: input.session.id,
    treeSupport: "linear-path",
    branchSupport: "not-proven",
    activeLeafId,
    activePath,
    activePathProjection: {
      activeLeafId,
      pathLength: activePath.length,
      entryKinds: nodes.map((node) => node.kind),
      redactionStatus: "report-safe",
      contextRebuildReadiness: "projection-ready",
      unsupportedClaims: [
        "branch-navigation",
        "storage-backed-branch-tree",
      ],
    },
    nodes,
    branchSummary: {
      availability:
        branchSummaryRecords.length > 0
          ? "observed"
          : "not-supported-by-current-schema",
      records: branchSummaryRecords,
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "branch-summary-truth",
        "branch-navigation",
      ],
    },
    compaction: {
      availability: compactionRecords.length > 0 ? "observed" : "not-proven",
      records: compactionRecords,
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "compaction-summary-truth",
        "storage-backed-compaction",
      ],
    },
    continuation: {
      state: projectContinuationState(input.session, input.stateSnapshot),
    },
    terminal: {
      status: input.session.status,
      ...(input.stateSnapshot?.terminalClassification
        ? { terminalClassification: input.stateSnapshot.terminalClassification }
        : {}),
      ...(input.stateSnapshot?.terminalReason
        ? { terminalReason: input.stateSnapshot.terminalReason }
        : {}),
      terminalSuccessClaim: false,
      notProvenClaims: [
        "branching-support",
        "compaction-summary",
        "terminal-success",
      ],
    },
    redaction: {
      status: "report-safe",
      excluded: redactionExcluded,
    },
  });
}

function projectContinuationState(
  session: Session,
  stateSnapshot?: SessionStateSnapshot,
): SessionTreeProjection["continuation"]["state"] {
  if (session.pendingPrompt || stateSnapshot?.pendingPrompt) {
    return "pending-prompt";
  }
  if (session.status === "active") {
    return "active";
  }
  if (session.status === "interrupted") {
    return "interrupted";
  }
  if (
    session.status === "completed" ||
    session.status === "error" ||
    session.status === "terminated"
  ) {
    return "terminal";
  }
  return "unknown";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function sanitizeIdentifier(input: string, fallback: string): string {
  const sanitized = input
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]")
    .replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return sanitized.trim() || fallback;
}

function needsRedaction(input: string | undefined): boolean {
  return input !== undefined && sanitizeIdentifier(input, "redacted") !== input;
}
