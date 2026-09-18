import fs from "node:fs/promises";
import path from "node:path";

import type { ContextGraph } from "../../graph/contextGraph.js";

export type CodeGraphStalenessStatus =
  | "fresh"
  | "stale-target-changed"
  | "stale-related-file-changed"
  | "unknown-freshness"
  | "missing-file"
  | "out-of-workspace"
  | "unsupported";

export interface CodeGraphFreshnessBaseline {
  readonly pathLabel: string;
  readonly mtimeMs?: number;
  readonly size?: number;
}

export interface CodeGraphStalenessCheck {
  readonly status: CodeGraphStalenessStatus;
  readonly rootTarget: string;
  readonly checkedLabels: readonly string[];
  readonly staleLabels: readonly string[];
  readonly warnings: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly evidence: readonly string[];
}

export async function checkCodeGraphStaleness(input: {
  readonly workspaceRoot: string;
  readonly graph: ContextGraph;
  readonly baseline?: readonly CodeGraphFreshnessBaseline[];
  readonly maxFiles?: number;
}): Promise<CodeGraphStalenessCheck> {
  const baseline = new Map((input.baseline ?? []).map((entry) => [entry.pathLabel, entry]));
  const labels = Array.from(
    new Set(
      input.graph.includedCandidates
        .filter((node) => !node.pathLabel.includes("#"))
        .map((node) => node.pathLabel),
    ),
  ).slice(0, input.maxFiles ?? 16);
  if (labels.length === 0) {
    return buildCheck({
      status: "unsupported",
      rootTarget: input.graph.rootTarget,
      checkedLabels: [],
      staleLabels: [],
      warnings: ["no file labels available for staleness check"],
    });
  }

  const staleLabels: string[] = [];
  const warnings: string[] = [];
  let status: CodeGraphStalenessStatus = "fresh";
  for (const label of labels) {
    const resolved = path.resolve(input.workspaceRoot, label);
    const relative = path.relative(path.resolve(input.workspaceRoot), resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      status = "out-of-workspace";
      staleLabels.push(label);
      warnings.push(`${label}: out-of-workspace`);
      continue;
    }
    let stat: { mtimeMs: number; size: number };
    try {
      const fsStat = await fs.stat(resolved);
      stat = { mtimeMs: fsStat.mtimeMs, size: fsStat.size };
    } catch {
      status = "missing-file";
      staleLabels.push(label);
      warnings.push(`${label}: missing-file`);
      continue;
    }
    const previous = baseline.get(label);
    if (!previous) {
      if (input.baseline) {
        status = status === "fresh" ? "unknown-freshness" : status;
        warnings.push(`${label}: unknown-freshness`);
      }
      continue;
    }
    if (
      (typeof previous.mtimeMs === "number" && Math.abs(previous.mtimeMs - stat.mtimeMs) > 1) ||
      (typeof previous.size === "number" && previous.size !== stat.size)
    ) {
      staleLabels.push(label);
      const changedStatus =
        label === input.graph.rootTarget
          ? "stale-target-changed"
          : "stale-related-file-changed";
      status = status === "fresh" || status === "unknown-freshness" ? changedStatus : status;
      warnings.push(`${label}: ${changedStatus}`);
    }
  }

  return buildCheck({
    status,
    rootTarget: input.graph.rootTarget,
    checkedLabels: labels,
    staleLabels,
    warnings,
  });
}

function buildCheck(input: {
  readonly status: CodeGraphStalenessStatus;
  readonly rootTarget: string;
  readonly checkedLabels: readonly string[];
  readonly staleLabels: readonly string[];
  readonly warnings: readonly string[];
}): CodeGraphStalenessCheck {
  const confidence =
    input.status === "fresh"
      ? "high"
      : input.status === "unknown-freshness"
        ? "medium"
        : "low";
  return {
    status: input.status,
    rootTarget: input.rootTarget,
    checkedLabels: input.checkedLabels,
    staleLabels: input.staleLabels,
    warnings: input.warnings,
    confidence,
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    evidence: [
      `code-graph-staleness:status:${input.status}`,
      `code-graph-staleness:checked:${input.checkedLabels.length}`,
      `code-graph-staleness:stale:${input.staleLabels.length}`,
      "code-graph-staleness:mutation-authority:not-granted",
      "code-graph-staleness:raw-content-excluded",
    ],
  };
}
