import fs from "node:fs";
import path from "node:path";

import type { ContinuityStateLike } from "../../../orchestration/runtimeHandoffProjection.js";
import { isUsableContinuationTargetPath } from "../../../session/continuation/target.js";
import {
  extractCrossFileFailureEntriesFromContinuity,
  extractCrossFileStateListFromContinuityEvidence,
} from "../../flow/crossFilePlanning.js";

export interface ContinuationReopenDecision {
  readonly enabled: boolean;
  readonly selectedTarget?: string;
  readonly selectedTargetExists?: boolean;
  readonly candidates: string[];
  readonly reason?: string;
  readonly candidateSourceSummary?: string;
  readonly prunedCandidateSummary?: string[];
}

export function hasDegradedContinuationEvidenceInState(
  continuity: ContinuityStateLike,
): boolean {
  const evidence = continuity.lastContinuationEvidence ?? [];
  if (
    evidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:degraded-terminal"),
    )
  ) {
    return true;
  }
  return (continuity.unresolvedItems ?? []).some((entry) =>
    entry.toLowerCase().includes("degraded"),
  );
}

export function isAtypicalReopenFollowUpPrompt(prompt: string): boolean {
  const lowered = prompt.toLowerCase();
  const lexicalSignals = [
    "use the previous failure",
    "use the failed one",
    "try again",
    "continue but not that",
    "repair the other one",
    "finish the rest",
    "not that one",
    "the other related file",
  ];
  if (lexicalSignals.some((signal) => lowered.includes(signal))) {
    return true;
  }
  return /(?:\u7528\u4e0a\u4e00\u6b21\u5931\u8d25|\u518d\u8bd5\u4e00\u6b21|\u7ee7\u7eed\u4fee|\u8865\u9f50\u5269\u4e0b|\u4e0d\u662f\u90a3\u4e2a)/i.test(
    prompt,
  );
}

export function isDegradedReopenFollowUpPrompt(prompt: string): boolean {
  return /(?:continue repairing it|continue fixing it|try again|finish the rest|fix the .* one|use the previous failure|use the failure above|not that one|the other related file|继续修|接着修|再试一次|补齐剩下|用上一次失败)/i.test(
    prompt,
  );
}

export function resolveContinuationReopenTarget(input: {
  continuity: ContinuityStateLike;
  prompt: string;
  workspaceRoot: string;
  enabled: boolean;
  degradedOnly: boolean;
}): ContinuationReopenDecision {
  if (!input.enabled) {
    return { enabled: false, candidates: [] };
  }
  const remaining = extractCrossFileStateListFromContinuityEvidence(
    input.continuity,
    "repair-remaining-files:",
  );
  const failed = extractCrossFileFailureEntriesFromContinuity(
    input.continuity,
  ).map((entry) => normalizePathLike(entry.path));
  const processed = extractCrossFileStateListFromContinuityEvidence(
    input.continuity,
    "repair-processed-files:",
  ).map((entry) => normalizePathLike(entry));
  const primaryCandidates: Array<{ path: string; source: string }> = [
    ...remaining.map((candidate) => ({ path: candidate, source: "remaining" })),
    ...failed.map((candidate) => ({ path: candidate, source: "failed" })),
    ...(input.continuity.recentFailedFiles ?? []).map((entry) => ({
      path: normalizePathLike(entry.path),
      source: "recent-failed",
    })),
  ];
  const fallbackCandidates: Array<{ path: string; source: string }> = (
    input.continuity.recentTargetFiles ?? []
  ).map((entry) => ({
    path: normalizePathLike(entry),
    source: "recent-target",
  }));
  const workspaceAbsolute = path.resolve(input.workspaceRoot);
  const normalizedWorkspace = workspaceAbsolute.toLowerCase();
  const sourceCounts = new Map<string, number>();
  const pruned: string[] = [];
  const candidateMap = new Map<string, { path: string; source: string }>();

  const appendCandidate = (rawEntry: { path: string; source: string }) => {
    const candidate = normalizePathLike(rawEntry.path ?? "");
    if (!candidate || !isUsableContinuationTargetPath(candidate)) {
      if (candidate) {
        pruned.push(`${candidate}::placeholder`);
      }
      return;
    }
    const absolute = path.resolve(input.workspaceRoot, candidate);
    const normalizedAbsolute = absolute.toLowerCase();
    const inWorkspace =
      normalizedAbsolute === normalizedWorkspace ||
      normalizedAbsolute.startsWith(
        `${normalizedWorkspace}${path.sep.toLowerCase()}`,
      );
    if (!inWorkspace) {
      pruned.push(`${candidate}::outside-workspace`);
      return;
    }
    if (processed.includes(candidate)) {
      pruned.push(`${candidate}::already-processed`);
      return;
    }
    if (fs.existsSync(absolute)) {
      try {
        if (fs.statSync(absolute).isDirectory()) {
          pruned.push(`${candidate}::directory-target`);
          return;
        }
      } catch {
        // Ignore transient stat failures and keep candidate for later execution checks.
      }
    }
    const dedupKey = candidate.toLowerCase();
    if (candidateMap.has(dedupKey)) {
      pruned.push(`${candidate}::duplicate`);
      return;
    }
    sourceCounts.set(
      rawEntry.source,
      (sourceCounts.get(rawEntry.source) ?? 0) + 1,
    );
    candidateMap.set(dedupKey, { path: candidate, source: rawEntry.source });
  };
  for (const rawEntry of primaryCandidates) {
    appendCandidate(rawEntry);
  }
  if (candidateMap.size === 0) {
    for (const rawEntry of fallbackCandidates) {
      appendCandidate(rawEntry);
    }
  }

  const candidates = Array.from(candidateMap.values()).map(
    (entry) => entry.path,
  );
  const candidateSourceSummary = Array.from(sourceCounts.entries())
    .map(([source, count]) => `${source}=${count}`)
    .join(",");
  const prunedCandidateSummary = Array.from(new Set(pruned)).slice(0, 10);
  if (candidates.length === 0) {
    return {
      enabled: true,
      candidates: [],
      reason: input.degradedOnly
        ? "degraded-session follow-up had no recoverable candidate target"
        : "mixed/degraded continuation follow-up had no recoverable candidate target",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  const loweredPrompt = input.prompt.toLowerCase();
  const lexical = candidates.filter(
    (candidate) =>
      candidate
        .split("/")
        .some((part) => loweredPrompt.includes(part.toLowerCase())) ||
      (loweredPrompt.includes("config") && candidate.includes("config")) ||
      (loweredPrompt.includes("test") && /test|spec/i.test(candidate)),
  );
  if (lexical.length === 1) {
    return {
      enabled: true,
      selectedTarget: lexical[0],
      selectedTargetExists: candidateExists(input.workspaceRoot, lexical[0]),
      candidates,
      reason: input.degradedOnly
        ? "degraded-session reopen matched lexical cue with a single candidate"
        : "continuation reopen matched lexical cue with a single candidate",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  if (candidates.length === 1) {
    return {
      enabled: true,
      selectedTarget: candidates[0],
      selectedTargetExists: candidateExists(input.workspaceRoot, candidates[0]),
      candidates,
      reason: input.degradedOnly
        ? "degraded-session reopen recovered single candidate target from remaining/failure evidence"
        : "continuation reopen recovered single candidate target from remaining/failure evidence",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  return {
    enabled: true,
    candidates,
    reason: input.degradedOnly
      ? "degraded-session reopen remains ambiguous across multiple candidates; explicit target required"
      : "continuation reopen remains ambiguous across multiple candidates; explicit target required",
    candidateSourceSummary,
    prunedCandidateSummary,
  };
}

function candidateExists(workspaceRoot: string, candidate: string): boolean {
  return fs.existsSync(path.resolve(workspaceRoot, candidate));
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
