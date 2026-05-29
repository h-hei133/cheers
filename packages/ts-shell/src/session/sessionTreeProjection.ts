import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";

export interface ProjectedSessionNode {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: "session-root" | "turn-message";
  readonly role?: "user" | "assistant";
  readonly order: number;
  readonly timestamp?: string;
}

export interface SessionTreeProjection {
  readonly sessionIdentity: string;
  readonly treeSupport: "linear-path";
  readonly branchSupport: "not-proven";
  readonly activeLeafId: string;
  readonly activePath: readonly string[];
  readonly nodes: readonly ProjectedSessionNode[];
  readonly branchSummary: {
    readonly availability: "not-supported-by-current-schema";
  };
  readonly compaction: {
    readonly availability: "not-proven";
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
    };
  });
  const nodes: ProjectedSessionNode[] = [
    {
      id: rootId,
      kind: "session-root",
      order: 0,
      timestamp: input.session.createdAt,
    },
    ...turnNodes,
  ];
  const activeLeafId = nodes[nodes.length - 1]?.id ?? rootId;

  return deepFreeze({
    sessionIdentity: input.session.id,
    treeSupport: "linear-path",
    branchSupport: "not-proven",
    activeLeafId,
    activePath: nodes.map((node) => node.id),
    nodes,
    branchSummary: {
      availability: "not-supported-by-current-schema",
    },
    compaction: {
      availability: "not-proven",
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
      excluded: [
        "raw-transcript",
        "provider-secrets",
        "raw-provider-output",
        "oldText",
        "newText",
        "unredacted-command-output",
        "hidden-reasoning",
        "arbitrary-file-contents",
      ],
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
