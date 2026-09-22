import { freezeDeep } from "../core/values/freeze.js";
import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import type {
  SessionCompactionRecord,
} from "./schema/sessionThread.js";
import { buildLinearSessionThreadSnapshot } from "./schema/sessionThread.js";

export interface ProjectedSessionNode {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: "session-root" | "turn-message";
  readonly role?: "system" | "user" | "assistant" | "tool";
  readonly order: number;
  readonly timestamp?: string;
  readonly sourceSessionIdentity: string;
  readonly activeLeaf: boolean;
  readonly activePath: boolean;
  readonly payloadSummary: "metadata-only";
  readonly branchSummaryAvailability: "not-supported-by-current-schema" | "storage-backed";
  readonly compactionAvailability: "not-proven" | "storage-backed";
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
  readonly retainedEntryIds: readonly string[];
  readonly excludedEntryIds: readonly string[];
  readonly retainedContextFactIds: readonly string[];
  readonly excludedContextFactIds: readonly string[];
  readonly staleInputIds: readonly string[];
  readonly unsafeInputIds: readonly string[];
  readonly missingFactIds: readonly string[];
  readonly unsupportedFactIds: readonly string[];
  readonly summaryProvenance?: SessionCompactionRecord["summaryProvenance"];
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
  readonly treeSupport: "linear-path" | "branching";
  readonly branchSupport: "not-proven" | "storage-backed";
  readonly activeLeafId: string;
  readonly activeBranchId?: string;
  readonly activePath: readonly string[];
  readonly activePathProjection: {
    readonly activeLeafId: string;
    readonly pathLength: number;
    readonly entryKinds: readonly ProjectedSessionNode["kind"][];
    readonly redactionStatus: "report-safe";
    readonly contextRebuildReadiness: "projection-ready" | "blocked";
    readonly missingParentIds: readonly string[];
    readonly activeLeafResolution: "resolved" | "missing";
    readonly unsupportedClaims: readonly string[];
  };
  readonly nodes: readonly ProjectedSessionNode[];
  readonly branchSummary: {
    readonly availability: "not-supported-by-current-schema" | "observed" | "storage-backed";
    readonly records: readonly SessionBranchSummaryProjection[];
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly branchFacts: {
    readonly activeBranchId?: string;
    readonly branchIds: readonly string[];
    readonly missingParentIds: readonly string[];
    readonly activeLeafResolution: "resolved" | "missing";
    readonly terminalSuccessClaim: false;
    readonly notProvenClaims: readonly string[];
  };
  readonly compaction: {
    readonly availability: "not-proven" | "observed" | "storage-backed";
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

interface NormalizedCompactionInput {
  readonly id: string;
  readonly firstKeptEntryId?: string;
  readonly summary?: string;
  readonly tokensBefore?: number;
  readonly sizeBefore?: number;
  readonly evidence: "observed" | "planned" | "not-proven";
  readonly sourceActivePath: readonly string[];
  readonly retainedEntryIds: readonly string[];
  readonly excludedEntryIds: readonly string[];
  readonly retainedContextFactIds: readonly string[];
  readonly excludedContextFactIds: readonly string[];
  readonly staleInputIds: readonly string[];
  readonly unsafeInputIds: readonly string[];
  readonly missingFactIds: readonly string[];
  readonly unsupportedFactIds: readonly string[];
  readonly summaryAvailability: "available" | "missing" | "not-proven";
  readonly summaryProvenance?: SessionCompactionRecord["summaryProvenance"];
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
  const thread = input.stateSnapshot?.thread ?? buildLinearSessionThreadSnapshot(input.session);
  const branchSupport = input.stateSnapshot?.thread ? "storage-backed" : "not-proven";
  const treeSupport = input.stateSnapshot?.thread ? "branching" : "linear-path";
  const rootId = `${input.session.id}:root`;
  const threadNodes = thread.entries.map((entry): ProjectedSessionNode => {
    return {
      id: sanitizeIdentifier(entry.id, "entry"),
      ...(entry.parentId ? { parentId: sanitizeIdentifier(entry.parentId, "entry") } : {}),
      kind: entry.kind,
      ...(entry.role ? { role: entry.role } : {}),
      order: entry.order,
      ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
      sourceSessionIdentity: input.session.id,
      activeLeaf: false,
      activePath: false,
      payloadSummary: "metadata-only",
      branchSummaryAvailability: branchSupport === "storage-backed"
        ? "storage-backed"
        : "not-supported-by-current-schema",
      compactionAvailability: thread.compactions.length > 0
        ? "storage-backed"
        : "not-proven",
      notProvenClaims: [
        "raw-transcript",
        ...(branchSupport === "storage-backed" ? [] : ["branching-support"]),
      ],
    };
  });
  const projectedNodes: ProjectedSessionNode[] = threadNodes.length > 0
    ? threadNodes
    : [{
        id: rootId,
        kind: "session-root",
        order: 0,
        timestamp: input.session.createdAt,
        sourceSessionIdentity: input.session.id,
        activeLeaf: false,
        activePath: false,
        payloadSummary: "metadata-only",
        branchSummaryAvailability: "not-supported-by-current-schema",
        compactionAvailability: "not-proven",
        notProvenClaims: ["branching-support"],
      }];
  const activeLeafId = sanitizeIdentifier(
    thread.activeLeafId ?? projectedNodes[projectedNodes.length - 1]?.id ?? rootId,
    "active-leaf",
  );
  const activePathResult = resolveActivePath(projectedNodes, activeLeafId);
  const activePathSet = new Set(activePathResult.path);
  const nodes = projectedNodes.map((node) => ({
    ...node,
    activeLeaf: node.id === activeLeafId,
    activePath: activePathSet.has(node.id),
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
  const activePath = activePathResult.path.length > 0 ? activePathResult.path : [rootId];
  const durableCompactions: NormalizedCompactionInput[] = thread.compactions.map((record) => ({
    id: record.compactionId,
    ...(record.firstRetainedEntryId ? { firstKeptEntryId: record.firstRetainedEntryId } : {}),
    ...(record.summaryAvailability === "available" ? { summary: record.compactionId } : {}),
    evidence: "observed" as const,
    sourceActivePath: record.sourceActivePath,
    retainedEntryIds: record.retainedEntryIds,
    excludedEntryIds: record.excludedEntryIds,
    retainedContextFactIds: record.retainedContextFacts.map((fact) => fact.factId),
    excludedContextFactIds: record.excludedContextFacts.map((fact) => fact.factId),
    staleInputIds: record.staleInputIds,
    unsafeInputIds: record.unsafeInputIds,
    missingFactIds: record.missingFactIds,
    unsupportedFactIds: record.unsupportedFactIds,
    summaryAvailability: record.summaryAvailability,
    summaryProvenance: record.summaryProvenance,
    ...(record.tokenMetadata?.tokensBefore !== undefined
      ? { tokensBefore: record.tokenMetadata.tokensBefore }
      : {}),
    ...(record.tokenMetadata?.sizeBefore !== undefined
      ? { sizeBefore: record.tokenMetadata.sizeBefore }
      : {}),
  }));
  const legacyCompactions: NormalizedCompactionInput[] = (input.compactions ?? []).map((record) => ({
    id: record.id,
    ...(record.firstKeptEntryId ? { firstKeptEntryId: record.firstKeptEntryId } : {}),
    ...(record.summary ? { summary: record.summary } : {}),
    ...(record.tokensBefore !== undefined ? { tokensBefore: record.tokensBefore } : {}),
    ...(record.sizeBefore !== undefined ? { sizeBefore: record.sizeBefore } : {}),
    evidence: record.evidence ?? "not-proven",
    sourceActivePath: activePath,
    retainedEntryIds: [],
    excludedEntryIds: [],
    retainedContextFactIds: [],
    excludedContextFactIds: [],
    staleInputIds: [],
    unsafeInputIds: [],
    missingFactIds: [],
    unsupportedFactIds: [],
    summaryAvailability: record.summary ? "available" : "missing",
  }));
  const compactionRecords = [...durableCompactions, ...legacyCompactions].map(
    (compaction): SessionCompactionRecordProjection => {
      const redacted = needsRedaction(compaction.summary);
      return {
        compactionId: sanitizeIdentifier(compaction.id, "compaction"),
        sourceActivePath: compaction.sourceActivePath.map((id) => sanitizeIdentifier(id, "entry")),
        ...(compaction.firstKeptEntryId
          ? {
              firstKeptEntryId: sanitizeIdentifier(
                compaction.firstKeptEntryId,
                "entry",
              ),
            }
          : {}),
        summaryAvailability: compaction.summaryAvailability,
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
        retainedEntryIds: compaction.retainedEntryIds.map((id) => sanitizeIdentifier(id, "entry")),
        excludedEntryIds: compaction.excludedEntryIds.map((id) => sanitizeIdentifier(id, "entry")),
        retainedContextFactIds: compaction.retainedContextFactIds.map((id) => sanitizeIdentifier(id, "fact")),
        excludedContextFactIds: compaction.excludedContextFactIds.map((id) => sanitizeIdentifier(id, "fact")),
        staleInputIds: compaction.staleInputIds.map((id) => sanitizeIdentifier(id, "input")),
        unsafeInputIds: compaction.unsafeInputIds.map((id) => sanitizeIdentifier(id, "input")),
        missingFactIds: compaction.missingFactIds.map((id) => sanitizeIdentifier(id, "fact")),
        unsupportedFactIds: compaction.unsupportedFactIds.map((id) => sanitizeIdentifier(id, "fact")),
        ...(compaction.summaryProvenance
          ? { summaryProvenance: compaction.summaryProvenance }
          : {}),
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

  return freezeDeep({
    sessionIdentity: input.session.id,
    treeSupport,
    branchSupport,
    activeLeafId,
    ...(thread.activeBranchId
      ? { activeBranchId: sanitizeIdentifier(thread.activeBranchId, "branch") }
      : {}),
    activePath,
    activePathProjection: {
      activeLeafId,
      pathLength: activePath.length,
      entryKinds: activePath.map((entryId) =>
        nodes.find((node) => node.id === entryId)?.kind ?? "turn-message"
      ),
      redactionStatus: "report-safe",
      contextRebuildReadiness: activePathResult.resolution === "resolved" &&
          activePathResult.missingParentIds.length === 0
        ? "projection-ready"
        : "blocked",
      missingParentIds: activePathResult.missingParentIds,
      activeLeafResolution: activePathResult.resolution,
      unsupportedClaims: branchSupport === "storage-backed"
        ? []
        : [
            "branch-navigation",
            "storage-backed-branch-tree",
          ],
    },
    nodes,
    branchSummary: {
      availability:
        branchSummaryRecords.length > 0
          ? "observed"
          : branchSupport === "storage-backed"
          ? "storage-backed"
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
      availability: compactionRecords.length > 0
        ? branchSupport === "storage-backed" ? "storage-backed" : "observed"
        : "not-proven",
      records: compactionRecords,
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "compaction-summary-truth",
        "storage-backed-compaction",
      ],
    },
    branchFacts: {
      ...(thread.activeBranchId
        ? { activeBranchId: sanitizeIdentifier(thread.activeBranchId, "branch") }
        : {}),
      branchIds: thread.branches.map((branch) => sanitizeIdentifier(branch.branchId, "branch")),
      missingParentIds: activePathResult.missingParentIds,
      activeLeafResolution: activePathResult.resolution,
      terminalSuccessClaim: false,
      notProvenClaims: [
        "terminal-success",
        "branch-created-is-not-success",
        "active-leaf-selected-is-not-success",
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

function resolveActivePath(
  nodes: readonly ProjectedSessionNode[],
  activeLeafId: string,
): {
  readonly path: readonly string[];
  readonly missingParentIds: readonly string[];
  readonly resolution: "resolved" | "missing";
} {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: string[] = [];
  const missingParentIds: string[] = [];
  let cursor = byId.get(activeLeafId);
  if (!cursor) {
    return { path: [], missingParentIds: [activeLeafId], resolution: "missing" };
  }
  while (cursor) {
    path.unshift(cursor.id);
    if (!cursor.parentId) break;
    const parent = byId.get(cursor.parentId);
    if (!parent) {
      missingParentIds.push(cursor.parentId);
      break;
    }
    cursor = parent;
  }
  return {
    path,
    missingParentIds,
    resolution: missingParentIds.length === 0 ? "resolved" : "missing",
  };
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
