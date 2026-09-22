import fs from "node:fs/promises";
import path from "node:path";

import { safeTargetLabel } from "../../policy/workspaceFileContract.js";

export type ContextBudgetDecision =
  | "included"
  | "omitted-over-file-budget"
  | "omitted-over-total-budget"
  | "omitted-binary-or-unsupported"
  | "omitted-out-of-workspace"
  | "omitted-secret-risk"
  | "omitted-unreadable";

export interface ContextBudgetLimits {
  readonly maxCandidateCount: number;
  readonly maxFilesRead: number;
  readonly maxBytesPerFile: number;
  readonly maxTotalBytes: number;
}

export interface ContextBudgetState {
  readonly limits: ContextBudgetLimits;
  readonly filesRead: number;
  readonly bytesUsed: number;
  readonly includedCount: number;
}

export interface ContextFileReadBudgetResult {
  readonly decision: ContextBudgetDecision;
  readonly content?: string;
  readonly byteLength: number;
  readonly redactedContent?: string;
  readonly redactionApplied: boolean;
  readonly reason?: string;
}

export const DEFAULT_CONTEXT_BUDGET_LIMITS: ContextBudgetLimits = {
  maxCandidateCount: 24,
  maxFilesRead: 12,
  maxBytesPerFile: 8_000,
  maxTotalBytes: 32_000,
};

export function createContextBudgetState(
  limits: Partial<ContextBudgetLimits> = {},
): ContextBudgetState {
  return {
    limits: { ...DEFAULT_CONTEXT_BUDGET_LIMITS, ...limits },
    filesRead: 0,
    bytesUsed: 0,
    includedCount: 0,
  };
}

export async function readFileWithinContextBudget(input: {
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly state: ContextBudgetState;
}): Promise<{ readonly result: ContextFileReadBudgetResult; readonly state: ContextBudgetState }> {
  const safePath = safeTargetLabel(input.filePath);
  if (!isPathWithinWorkspace(input.filePath, input.workspaceRoot)) {
    return {
      state: input.state,
      result: {
        decision: "omitted-out-of-workspace",
        byteLength: 0,
        redactionApplied: false,
        reason: `${safePath} is outside the workspace`,
      },
    };
  }
  if (input.state.filesRead >= input.state.limits.maxFilesRead) {
    return {
      state: input.state,
      result: {
        decision: "omitted-over-total-budget",
        byteLength: 0,
        redactionApplied: false,
        reason: "file read count budget exhausted",
      },
    };
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(input.filePath);
  } catch (error) {
    return {
      state: { ...input.state, filesRead: input.state.filesRead + 1 },
      result: {
        decision: "omitted-unreadable",
        byteLength: 0,
        redactionApplied: false,
        reason: error instanceof Error ? error.message : "unreadable file",
      },
    };
  }

  if (buffer.includes(0)) {
    return {
      state: { ...input.state, filesRead: input.state.filesRead + 1 },
      result: {
        decision: "omitted-binary-or-unsupported",
        byteLength: buffer.byteLength,
        redactionApplied: false,
        reason: "binary or unsupported content",
      },
    };
  }
  if (buffer.byteLength > input.state.limits.maxBytesPerFile) {
    return {
      state: { ...input.state, filesRead: input.state.filesRead + 1 },
      result: {
        decision: "omitted-over-file-budget",
        byteLength: buffer.byteLength,
        redactionApplied: false,
        reason: "file byte budget exceeded",
      },
    };
  }
  if (input.state.bytesUsed + buffer.byteLength > input.state.limits.maxTotalBytes) {
    return {
      state: { ...input.state, filesRead: input.state.filesRead + 1 },
      result: {
        decision: "omitted-over-total-budget",
        byteLength: buffer.byteLength,
        redactionApplied: false,
        reason: "total context byte budget exceeded",
      },
    };
  }

  const content = buffer.toString("utf8");
  if (hasHighRiskSecret(content)) {
    return {
      state: { ...input.state, filesRead: input.state.filesRead + 1 },
      result: {
        decision: "omitted-secret-risk",
        byteLength: buffer.byteLength,
        redactionApplied: true,
        reason: "secret-like content excluded from context packet",
      },
    };
  }
  const redactedContent = redactContextText(content);
  return {
    state: {
      ...input.state,
      filesRead: input.state.filesRead + 1,
      bytesUsed: input.state.bytesUsed + buffer.byteLength,
      includedCount: input.state.includedCount + 1,
    },
    result: {
      decision: "included",
      content,
      redactedContent,
      byteLength: buffer.byteLength,
      redactionApplied: redactedContent !== content,
    },
  };
}

export function redactContextText(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-provider-home]")
    .replace(
      /\b(api[_-]?key|token|authorization|password|secret|cookie)\s*[:=]\s*[^\s"'`,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[redacted]");
}

export function hasHighRiskSecret(value: string): boolean {
  return (
    /\/home\/wang\/\.private-agents-real(?:\/|$)/.test(value) ||
    /\b(?:api[_-]?key|token|authorization|password|secret|cookie)\s*[:=]\s*[^\s"'`,;]{8,}/i.test(
      value,
    ) ||
    /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{12,}\b/.test(value)
  );
}

export function isPathWithinWorkspace(
  candidateAbsolutePath: string,
  workspaceRoot: string,
): boolean {
  const relative = path.relative(
    path.resolve(workspaceRoot),
    path.resolve(candidateAbsolutePath),
  );
  return (
    relative.length === 0 ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

