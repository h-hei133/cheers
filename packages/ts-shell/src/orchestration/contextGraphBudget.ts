import type {
  ContextGraphNode,
  ContextGraphNodeKind,
  ContextGraphOmissionReason,
} from "./contextGraph.js";

export interface ContextGraphBudgetLimits {
  readonly maxDepth: 2;
  readonly maxGraphNodes: number;
  readonly maxFilesRead: number;
  readonly maxBytesPerFile: number;
  readonly maxTotalBytes: number;
  readonly maxCallSiteCandidates: number;
  readonly maxTestCandidates: number;
  readonly maxDocsCandidates: number;
  readonly maxSecondHopCandidates: number;
}

export interface ContextGraphBudgetState {
  readonly limits: ContextGraphBudgetLimits;
  readonly includedNodes: number;
  readonly filesRead: number;
  readonly bytesUsed: number;
  readonly callSiteCandidates: number;
  readonly testCandidates: number;
  readonly docsCandidates: number;
  readonly secondHopCandidates: number;
  readonly seenPathLabels: ReadonlySet<string>;
}

export const DEFAULT_CONTEXT_GRAPH_BUDGET_LIMITS: ContextGraphBudgetLimits = {
  maxDepth: 2,
  maxGraphNodes: 18,
  maxFilesRead: 14,
  maxBytesPerFile: 8_000,
  maxTotalBytes: 40_000,
  maxCallSiteCandidates: 4,
  maxTestCandidates: 4,
  maxDocsCandidates: 4,
  maxSecondHopCandidates: 4,
};

export function createContextGraphBudgetState(
  limits: Partial<ContextGraphBudgetLimits> = {},
): ContextGraphBudgetState {
  return {
    limits: { ...DEFAULT_CONTEXT_GRAPH_BUDGET_LIMITS, ...limits, maxDepth: 2 },
    includedNodes: 0,
    filesRead: 0,
    bytesUsed: 0,
    callSiteCandidates: 0,
    testCandidates: 0,
    docsCandidates: 0,
    secondHopCandidates: 0,
    seenPathLabels: new Set(),
  };
}

export function decideContextGraphNode(input: {
  readonly state: ContextGraphBudgetState;
  readonly pathLabel: string;
  readonly kind: ContextGraphNodeKind;
  readonly depth: ContextGraphNode["depth"];
  readonly byteLength: number;
  readonly sourceOmissionReason?: ContextGraphOmissionReason;
}): {
  readonly status: "included" | "omitted";
  readonly omissionReason?: ContextGraphOmissionReason;
  readonly state: ContextGraphBudgetState;
} {
  if (input.sourceOmissionReason) {
    return {
      status: "omitted",
      omissionReason: input.sourceOmissionReason,
      state: input.state,
    };
  }
  if (input.depth > input.state.limits.maxDepth) {
    return { status: "omitted", omissionReason: "over-depth", state: input.state };
  }
  if (input.state.seenPathLabels.has(input.pathLabel)) {
    return {
      status: "omitted",
      omissionReason: "duplicate-candidate",
      state: input.state,
    };
  }
  if (input.state.includedNodes >= input.state.limits.maxGraphNodes) {
    return {
      status: "omitted",
      omissionReason: "over-node-budget",
      state: input.state,
    };
  }
  if (input.state.filesRead >= input.state.limits.maxFilesRead) {
    return {
      status: "omitted",
      omissionReason: "over-file-budget",
      state: input.state,
    };
  }
  if (input.byteLength > input.state.limits.maxBytesPerFile) {
    return {
      status: "omitted",
      omissionReason: "over-byte-budget",
      state: input.state,
    };
  }
  if (input.state.bytesUsed + input.byteLength > input.state.limits.maxTotalBytes) {
    return {
      status: "omitted",
      omissionReason: "over-byte-budget",
      state: input.state,
    };
  }

  const kindBudgetReason = classifyKindBudget(input.state, input.kind);
  if (kindBudgetReason) {
    return { status: "omitted", omissionReason: kindBudgetReason, state: input.state };
  }

  const seenPathLabels = new Set(input.state.seenPathLabels);
  seenPathLabels.add(input.pathLabel);
  return {
    status: "included",
    state: {
      ...input.state,
      includedNodes: input.state.includedNodes + 1,
      filesRead: input.state.filesRead + 1,
      bytesUsed: input.state.bytesUsed + input.byteLength,
      callSiteCandidates:
        input.kind === "reverse-call-site"
          ? input.state.callSiteCandidates + 1
          : input.state.callSiteCandidates,
      testCandidates:
        input.kind === "nearby-test"
          ? input.state.testCandidates + 1
          : input.state.testCandidates,
      docsCandidates:
        input.kind === "docs-readme"
          ? input.state.docsCandidates + 1
          : input.state.docsCandidates,
      secondHopCandidates:
        input.kind === "second-hop-candidate"
          ? input.state.secondHopCandidates + 1
          : input.state.secondHopCandidates,
      seenPathLabels,
    },
  };
}

export function mapContextGraphOmissionReason(reason: string | undefined): ContextGraphOmissionReason | undefined {
  if (!reason) {
    return undefined;
  }
  if (/out.*workspace/i.test(reason)) {
    return "out-of-workspace";
  }
  if (/secret|credential|provider/i.test(reason)) {
    return "secret-risk";
  }
  if (/binary|unsupported/i.test(reason)) {
    return "binary-or-unreadable";
  }
  if (/byte|total context/i.test(reason)) {
    return "over-byte-budget";
  }
  if (/file read count|file budget/i.test(reason)) {
    return "over-file-budget";
  }
  if (/unreadable/i.test(reason)) {
    return "binary-or-unreadable";
  }
  return "low-confidence";
}

function classifyKindBudget(
  state: ContextGraphBudgetState,
  kind: ContextGraphNodeKind,
): ContextGraphOmissionReason | undefined {
  if (kind === "reverse-call-site" && state.callSiteCandidates >= state.limits.maxCallSiteCandidates) {
    return "over-node-budget";
  }
  if (kind === "nearby-test" && state.testCandidates >= state.limits.maxTestCandidates) {
    return "over-node-budget";
  }
  if (kind === "docs-readme" && state.docsCandidates >= state.limits.maxDocsCandidates) {
    return "over-node-budget";
  }
  if (kind === "second-hop-candidate" && state.secondHopCandidates >= state.limits.maxSecondHopCandidates) {
    return "over-node-budget";
  }
  return undefined;
}
